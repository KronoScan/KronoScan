import { useState, useEffect, useRef, useCallback } from 'react'
import type { AuditFinding, SessionStatus } from '../types'

const WS_URL = 'ws://localhost:3001/ws'
const SESSIONS_API = 'http://localhost:3001/api/sessions'

interface ClosedData {
  consumed: bigint
  refunded: bigint
  txHash: string
}

interface CoordinatorState {
  status: SessionStatus
  sessionId: string | null
  totalConsumed: bigint
  effectivePrice: bigint
  deposit: bigint
  requestCount: number
  requestsRemaining: number
  completedCategories: string[]
  verified: boolean
  ensName: string
  findings: AuditFinding[]
  closedData: ClosedData | null
  connected: boolean
}

interface CoordinatorHook extends CoordinatorState {
  reset: () => void
}

const INITIAL_STATE: CoordinatorState = {
  status: 'IDLE',
  sessionId: null,
  totalConsumed: 0n,
  effectivePrice: 0n,
  deposit: 0n,
  requestCount: 0,
  requestsRemaining: 0,
  completedCategories: [],
  verified: false,
  ensName: '',
  findings: [],
  closedData: null,
  connected: false,
}

export function useCoordinator(): CoordinatorHook {
  const [state, setState] = useState<CoordinatorState>(INITIAL_STATE)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const reset = useCallback(() => {
    setState(prev => ({ ...INITIAL_STATE, connected: prev.connected }))
  }, [])

  // Try to find and subscribe to an active session via REST
  const autoSubscribe = useCallback(async (ws: WebSocket) => {
    try {
      const res = await fetch(SESSIONS_API)
      if (!res.ok) return
      const data = await res.json()
      const sessions = data.sessions as Array<{ sessionId: string; status: string; effectivePrice: string; deposit: string; verified: boolean; ensName?: string }>
      const active = sessions.find(s => s.status === 'ACTIVE')
      if (active && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: active.sessionId }))
        setState(prev => ({
          ...prev,
          status: 'ACTIVE',
          sessionId: active.sessionId,
          effectivePrice: BigInt(active.effectivePrice),
          deposit: BigInt(active.deposit),
          verified: active.verified,
          ensName: active.ensName ?? '',
        }))
      }
    } catch {
      // REST not available — will pick up session via WS messages
    }
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current && wsRef.current.readyState < 2) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setState(prev => ({ ...prev, connected: true }))
      autoSubscribe(ws)
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setState(prev => ({ ...prev, connected: false }))
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 2000)
    }

    ws.onerror = () => {
      // onclose will fire after onerror, reconnect handled there
    }

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data as string)

        switch (msg.type) {
          case 'session_opened':
            // Auto-subscribe to this session so we receive updates and findings
            if (ws.readyState === WebSocket.OPEN && msg.sessionId) {
              ws.send(JSON.stringify({ type: 'subscribe', sessionId: msg.sessionId }))
            }
            setState(prev => ({
              ...prev,
              status: 'ACTIVE',
              sessionId: msg.sessionId ?? null,
              effectivePrice: BigInt(msg.effectivePrice ?? '0'),
              deposit: BigInt(msg.deposit ?? '0'),
              ensName: msg.ensName ?? '',
              findings: [],
              closedData: null,
              totalConsumed: 0n,
              requestCount: 0,
              requestsRemaining: 0,
              completedCategories: [],
            }))
            break

          case 'session_update':
            setState(prev => ({
              ...prev,
              totalConsumed: BigInt(msg.totalConsumed ?? '0'),
              requestCount: Number(msg.requestCount ?? 0),
              requestsRemaining: Number(msg.requestsRemaining ?? 0),
              completedCategories: msg.completedCategories ?? prev.completedCategories,
              status: (msg.status as SessionStatus) ?? prev.status,
            }))
            break

          case 'session_closed':
            setState(prev => ({
              ...prev,
              status: 'CLOSED',
              closedData: {
                consumed: BigInt(msg.consumed ?? '0'),
                refunded: BigInt(msg.refunded ?? '0'),
                txHash: String(msg.txHash ?? ''),
              },
            }))
            break

          case 'finding':
            setState(prev => ({
              ...prev,
              findings: [
                ...prev.findings,
                {
                  severity: msg.finding.severity,
                  title: msg.finding.title,
                  line: Number(msg.finding.line ?? 0),
                  description: msg.finding.description ?? '',
                  category: msg.finding.category ?? '',
                },
              ],
            }))
            break

          case 'error':
            console.error('[KronoScan] Coordinator error:', msg.message)
            break

          default:
            break
        }
      } catch (err) {
        console.error('[KronoScan] Failed to parse message:', err)
      }
    }
  }, [autoSubscribe])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { ...state, reset }
}
