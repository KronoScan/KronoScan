# Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Vite + React frontend to our per-request session coordinator, including a finding relay pipeline from agent → coordinator → frontend.

**Architecture:** Three backend changes (coordinator handles `relay_finding`, agent relays findings, coordinatorClient gains `relayFinding()` method) plus a frontend rewrite of the WebSocket hook and UI updates to reflect per-request payments with category progress.

**Tech Stack:** React 19, Vite, TypeScript, WebSocket, viem

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `coordinator/src/types.ts` | Modify | Add `relay_finding` to `WsMessageIn` |
| `coordinator/src/index.ts` | Modify | Handle `relay_finding` → broadcast finding |
| `agent/src/coordinatorClient.ts` | Modify | Add `relayFinding()` fire-and-forget method |
| `agent/src/auditRunner.ts` | Modify | Relay each finding to coordinator after parsing |
| `frontend/src/types.ts` | Modify | Update types to match coordinator protocol |
| `frontend/src/hooks/useCoordinator.ts` | Rewrite | New WS hook matching session-based protocol |
| `frontend/src/App.tsx` | Modify | Per-request UI, category progress, ENS name, auto-subscribe |
| `CLAUDE.md` | Modify | Update frontend tech from Next.js to Vite |

---

### Task 1: Finding Relay — Coordinator Side

**Files:**
- Modify: `coordinator/src/types.ts`
- Modify: `coordinator/src/index.ts`

- [ ] **Step 1: Add `relay_finding` to `WsMessageIn` in `coordinator/src/types.ts`**

Add a new union member to `WsMessageIn`. Find:

```typescript
export type WsMessageIn =
  | { type: "open_session"; seller: Address; pricePerRequest: string; deposit: string; verified: boolean; ensName?: string }
  | { type: "record_payment"; sessionId: Hex; category: string; amount: string }
  | { type: "close_session"; sessionId: Hex }
  | { type: "subscribe"; sessionId: Hex };
```

Replace with:

```typescript
export type WsMessageIn =
  | { type: "open_session"; seller: Address; pricePerRequest: string; deposit: string; verified: boolean; ensName?: string }
  | { type: "record_payment"; sessionId: Hex; category: string; amount: string }
  | { type: "close_session"; sessionId: Hex }
  | { type: "subscribe"; sessionId: Hex }
  | { type: "relay_finding"; sessionId: Hex; finding: AuditFinding };
```

- [ ] **Step 2: Handle `relay_finding` in the coordinator WebSocket switch in `coordinator/src/index.ts`**

In the `switch (msg.type)` block (around line 124), add a new case before `default`:

```typescript
        case "relay_finding":
          handleRelayFinding(msg);
          break;
```

Then add the handler function after `handleSubscribe` (around line 278):

```typescript
function handleRelayFinding(
  msg: Extract<WsMessageIn, { type: "relay_finding" }>
) {
  const { sessionId, finding } = msg;
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    console.warn(`[relay] Finding for unknown session ${sessionId}`);
    return;
  }
  broadcast(sessionId, { type: "finding", sessionId, finding });
}
```

- [ ] **Step 3: Run coordinator tests**

```bash
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
```

Expected: All existing tests PASS (no new tests needed — this is a passthrough)

- [ ] **Step 4: Commit**

```bash
git add coordinator/src/types.ts coordinator/src/index.ts
git commit -m "feat(coordinator): handle relay_finding — broadcast findings to WS subscribers"
```

---

### Task 2: Finding Relay — Agent Side

**Files:**
- Modify: `agent/src/coordinatorClient.ts`
- Modify: `agent/src/auditRunner.ts`

- [ ] **Step 1: Add `relayFinding()` to `agent/src/coordinatorClient.ts`**

Add this method after `closeSession()` (around line 143):

```typescript
  relayFinding(sessionId: Hex, finding: { severity: string; title: string; line: number; description: string; category: string }): void {
    try {
      this.send({
        type: "relay_finding",
        sessionId,
        finding,
      });
    } catch {
      // Fire-and-forget — don't break audit if relay fails
    }
  }
```

- [ ] **Step 2: Relay findings in `agent/src/auditRunner.ts`**

In the `for (const event of events)` loop (around line 88), after the finding is pushed and the severity icon is logged, add a relay call. Find:

```typescript
        if (isFinding(event)) {
          findings.push(event);
          bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
          console.log(
            `  ${severityIcon(event.severity)} [${event.severity}] ${event.title} (line ${event.line})`,
          );
```

Replace with:

```typescript
        if (isFinding(event)) {
          findings.push(event);
          bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
          console.log(
            `  ${severityIcon(event.severity)} [${event.severity}] ${event.title} (line ${event.line})`,
          );
          coordinator.relayFinding(sessionId, {
            severity: event.severity,
            title: event.title,
            line: event.line,
            description: event.description ?? "",
            category,
          });
```

Note: `event.description` comes from the SSE finding. `category` is the loop variable from `for (const category of AUDIT_CATEGORIES)`.

- [ ] **Step 3: Run agent tests**

```bash
cd /home/mbarr/Cannes2026/agent && npx vitest run
```

Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add agent/src/coordinatorClient.ts agent/src/auditRunner.ts
git commit -m "feat(agent): relay findings to coordinator for frontend display"
```

---

### Task 3: Frontend Types Update

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Update `frontend/src/types.ts`**

Replace the entire file:

```typescript
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface AuditFinding {
  severity: Severity
  title: string
  line: number
  description: string
  category: string
}

export type SessionStatus = 'IDLE' | 'OPENING' | 'ACTIVE' | 'CLOSING' | 'CLOSED' | 'TERMINATED'

export type ContractInputMode = 'source' | 'address'

export interface ContractInput {
  mode: ContractInputMode
  source: string
  address: string
  chain: string
}
```

Changes: added `category` to `AuditFinding`, renamed `StreamStatus` to `SessionStatus`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(frontend): update types — add category to findings, rename to SessionStatus"
```

---

### Task 4: Frontend WebSocket Hook Rewrite

**Files:**
- Rewrite: `frontend/src/hooks/useCoordinator.ts`

- [ ] **Step 1: Rewrite `frontend/src/hooks/useCoordinator.ts`**

Replace the entire file:

```typescript
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
```

Key changes from original:
- WS URL: `ws://localhost:3001/ws` (was `ws://localhost:3001`)
- All message types renamed from `stream_*` to `session_*`
- Fields match coordinator protocol: `sessionId`, `effectivePrice`, `requestCount`, `requestsRemaining`, `completedCategories`
- Finding handler reads `msg.finding` (nested object from coordinator broadcast)
- Removed `runAudit` — frontend is passive observer. Added `reset` instead.
- Added `autoSubscribe` — on connect, fetches active sessions from REST and subscribes
- Removed `timeRemaining`, `authCount`, `baseRate`, `effectiveRate`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useCoordinator.ts
git commit -m "feat(frontend): rewrite useCoordinator hook for session-based protocol"
```

---

### Task 5: Frontend App.tsx — Per-Request UI

**Files:**
- Modify: `frontend/src/App.tsx`

This is the largest task. The file is ~830 lines. Key changes:
1. Remove `timeRemaining` display, replace with category progress
2. Update cost bar to per-request language
3. Show `ensName` dynamically
4. Update demo mode to match per-request model
5. Disable "Run Audit" button in live mode (agent runs from terminal)

- [ ] **Step 1: Update imports and remove `StreamStatus` references**

At the top of `App.tsx`, change the import:

```typescript
import type { ContractInput, AuditFinding } from './types'
```

To:

```typescript
import type { ContractInput, AuditFinding, SessionStatus } from './types'
```

- [ ] **Step 2: Update the App component state and coordinator usage**

Replace the state declarations section (lines ~122–149) with:

```typescript
export default function App() {
  const coordinator = useCoordinator()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [source, setSource] = useState(SAMPLE_CONTRACT)
  const [contractInput] = useState<ContractInput>({ mode: 'source', source: SAMPLE_CONTRACT, address: '', chain: 'Arc Testnet' })
  const [activeTab, setActiveTab] = useState(0)
  const [contractAddress, setContractAddress] = useState('')

  const [demoMode, setDemoMode] = useState(false)
  const [demoStatus, setDemoStatus] = useState<SessionStatus>('IDLE')
  const [demoFindings, setDemoFindings] = useState<AuditFinding[]>([])
  const [demoConsumed, setDemoConsumed] = useState(0)
  const [demoCategories, setDemoCategories] = useState<string[]>([])
  const [demoIntervals, setDemoIntervals] = useState<number[]>([])
  const [scanning, setScanning] = useState(false)

  const isLive = coordinator.connected && coordinator.sessionId !== null
  const status = isLive ? coordinator.status : demoStatus
  const findings = isLive ? coordinator.findings : demoFindings
  const totalConsumed = isLive ? coordinator.totalConsumed : BigInt(demoConsumed)
  const completedCategories = isLive ? coordinator.completedCategories : demoCategories
  const deposit = isLive ? coordinator.deposit : 1000000n
  const effectivePrice = isLive ? coordinator.effectivePrice : 80n
  const ensName = isLive ? coordinator.ensName : 'audit.kronoscan.eth'
  const requestCount = isLive ? coordinator.requestCount : completedCategories.length
```

- [ ] **Step 3: Update `formatUSDC` and remove unused variables**

Keep `formatUSDC` as-is. Remove the `consumedRatio` line and replace with:

```typescript
  const consumedRatio = deposit > 0n ? Number((totalConsumed * 10000n) / deposit) / 10000 : 0
```

Remove these lines:
```typescript
  const timeColor = timeRemaining < 10 ? '#ef4444' : timeRemaining < 20 ? '#f59e0b' : '#3b82f6'

  void demoMode
  void baseRate
  void effectiveRate
```

- [ ] **Step 4: Update demo mode functions**

Replace `startDemo` (lines ~167-218) with:

```typescript
  const DEMO_CATEGORIES = [
    'reentrancy', 'access-control', 'arithmetic', 'external-calls', 'token-standards',
    'business-logic', 'gas-optimization', 'code-quality', 'compiler', 'defi',
  ]

  function startDemo() {
    if (scanning) return
    setScanning(true)
    setDemoMode(true)
    setDemoStatus('ACTIVE')
    setDemoFindings([])
    setDemoConsumed(0)
    setDemoCategories([])

    const newIntervals: number[] = []
    let consumed = 0
    let catIdx = 0

    // Simulate per-request payments — one category every 3 seconds
    const catInt = window.setInterval(() => {
      if (catIdx >= DEMO_CATEGORIES.length) {
        window.clearInterval(catInt)
        setTimeout(() => {
          setDemoStatus('CLOSED')
          setScanning(false)
        }, 1000)
        return
      }
      consumed += 80
      setDemoConsumed(consumed)
      setDemoCategories(prev => [...prev, DEMO_CATEGORIES[catIdx]])
      catIdx++
    }, 3000)
    newIntervals.push(catInt)

    // Drip findings with slight delay
    DEMO_FINDINGS.forEach((f, i) => {
      const t = window.setTimeout(() => {
        setDemoFindings(prev => [f, ...prev])
      }, 2000 + i * 3500)
      newIntervals.push(t)
    })

    setDemoIntervals(newIntervals)
  }

  function resetDemo() {
    demoIntervals.forEach(id => window.clearInterval(id))
    setDemoStatus('IDLE')
    setDemoFindings([])
    setDemoConsumed(0)
    setDemoCategories([])
    setScanning(false)
    setDemoMode(false)
  }

  function handleRunAudit() {
    if (isLive) return // In live mode, agent runs from terminal
    if (status === 'CLOSED') resetDemo()
    else startDemo()
  }
```

- [ ] **Step 5: Update the status bar area**

Find the status + ENS name display (around line 570-585). Replace:

```typescript
                <span style={{ fontSize: 11, color: '#1e293b', fontFamily: 'JetBrains Mono, monospace' }}>
                  audit.kronoscan.eth
                </span>
```

With:

```typescript
                {ensName && (
                  <span style={{ fontSize: 11, color: '#1e293b', fontFamily: 'JetBrains Mono, monospace' }}>
                    {ensName}
                  </span>
                )}
```

- [ ] **Step 6: Update the Run Audit button**

Find the button (around line 588-613). Replace the entire button with:

```typescript
              <button onClick={handleRunAudit} disabled={isLive && status !== 'IDLE'} style={{
                background: status === 'ACTIVE'
                  ? 'rgba(59,130,246,0.2)'
                  : '#3b82f6',
                color: status === 'ACTIVE' ? '#60a5fa' : 'white',
                border: status === 'ACTIVE'
                  ? '1px solid rgba(59,130,246,0.3)'
                  : '1px solid transparent',
                borderRadius: 9,
                padding: '13px 24px', fontSize: 14, fontWeight: 600,
                cursor: status === 'ACTIVE' || (isLive && status === 'IDLE') ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, width: '100%',
                animation: status === 'ACTIVE' ? 'btnGlow 2s infinite' : 'none',
                flexShrink: 0, transition: 'all 0.15s',
                opacity: isLive && status === 'IDLE' ? 0.5 : 1,
              }}>
                <span style={{ fontSize: 14 }}>
                  {status === 'IDLE' ? '▶' : status === 'ACTIVE' ? '⏳' : '↩'}
                </span>
                {status === 'IDLE' && (isLive ? 'Waiting for agent...' : 'Run Demo')}
                {status === 'ACTIVE' && `Scanning... ${requestCount}/10`}
                {status === 'CLOSED' && (isLive ? 'Audit Complete' : 'Run Again')}
                {(status === 'OPENING' || status === 'CLOSING') && 'Processing...'}
                {status === 'TERMINATED' && 'Terminated'}
              </button>
```

- [ ] **Step 7: Update the bottom cost bar**

Find the cost subtitle text (around line 717-723). Replace:

```typescript
            <div style={{ fontSize: 10, color: '#334155', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
              {status === 'ACTIVE'
                ? `$0.000080/s · World ID -20%`
                : status === 'CLOSED'
                ? `${findings.length} findings · complete`
                : 'ready to scan'
              }
            </div>
```

With:

```typescript
            <div style={{ fontSize: 10, color: '#334155', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
              {status === 'ACTIVE'
                ? `${formatUSDC(effectivePrice)}/req · ${requestCount}/10 categories`
                : status === 'CLOSED'
                ? `${findings.length} findings · 10/10 complete`
                : 'ready to scan'
              }
            </div>
```

- [ ] **Step 8: Replace time/sigs stats with category progress**

Find the stats section in the bottom bar (around lines 757-791). Replace the entire stats `div` block (from `{/* Stats */}`) with:

```typescript
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
            opacity: status === 'IDLE' ? 0.25 : 1, transition: 'opacity 0.3s',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>
                {requestCount}/10
              </div>
              <div style={{ fontSize: 9, color: '#334155', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                categories
              </div>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.07)' }}/>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>
                {findings.length}
              </div>
              <div style={{ fontSize: 9, color: '#334155', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                findings
              </div>
            </div>
            {status === 'CLOSED' && (
              <>
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.07)' }}/>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: '#22c55e' }}>
                    {formatUSDC(deposit - totalConsumed)}
                  </div>
                  <div style={{ fontSize: 9, color: '#334155', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                    refund
                  </div>
                </div>
              </>
            )}
          </div>
```

- [ ] **Step 9: Update the nano-tx feed to show per-request payments**

Find the nano-tx feed (around lines 794-825). Replace the entire block with:

```typescript
        <div style={{
          display: 'flex', gap: 5, overflow: 'hidden',
          alignItems: 'center', height: 20,
        }}>
          {status === 'IDLE' ? (
            <span style={{ fontSize: 10, color: '#1e293b', fontFamily: 'JetBrains Mono, monospace' }}>
              — x402 nanopayments will appear here
            </span>
          ) : completedCategories.map((cat, i) => (
            <div key={cat} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 5, padding: '2px 8px', flexShrink: 0,
              animation: i === completedCategories.length - 1 ? 'txIn 0.25s ease forwards' : 'none',
              opacity: Math.max(0.3, 1 - (completedCategories.length - 1 - i) * 0.08),
            }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: i === completedCategories.length - 1 ? '#22c55e' : '#1d4ed8', flexShrink: 0,
              }}/>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                fontWeight: 600, color: '#3b82f6',
              }}>{formatUSDC(effectivePrice)}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#334155',
              }}>{cat}</span>
            </div>
          ))}
        </div>
```

- [ ] **Step 10: Remove unused state variables**

Remove these lines that are no longer needed:

```typescript
  const [nanoTxs, setNanoTxs] = useState<{ id: number; amount: string; time: string; from: string }[]>([])
  const txCounter = useRef(0)
```

And remove the `useRef` import if `txCounter` was the only ref — but `useRef` is still used by other code in the file, so keep the import.

Remove the unused `contractInput` from the destructure if not used in live mode:
```typescript
  void demoMode
```

Keep this void statement since `demoMode` is used for tracking but not directly rendered.

- [ ] **Step 11: Install frontend dependencies and verify build**

```bash
cd /home/mbarr/Cannes2026/frontend && npm install && npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): update App.tsx for per-request model with category progress"
```

---

### Task 6: CLAUDE.md Update + npm install + Smoke Test

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update frontend command in CLAUDE.md**

Find:
```
| `cd frontend && npm run dev` | Start Next.js dashboard |
```

Replace with:
```
| `cd frontend && npm run dev` | Start Vite dashboard |
```

- [ ] **Step 2: Run all backend tests**

```bash
cd /home/mbarr/Cannes2026/shared && npx vitest run
cd /home/mbarr/Cannes2026/agent && npx vitest run
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: All tests PASS across all packages.

- [ ] **Step 3: Verify frontend builds**

```bash
cd /home/mbarr/Cannes2026/frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: update CLAUDE.md — frontend is Vite, not Next.js"
```
