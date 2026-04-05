import { useState } from 'react'
import { useCoordinator } from './hooks/useCoordinator'
import type { ContractInput, AuditFinding, SessionStatus } from './types'
import Antigravity from './components/Antigravity'

// --- DEMO DATA ---
const DEMO_FINDINGS: AuditFinding[] = [
  { severity: 'CRITICAL', title: 'Reentrancy in withdraw()', line: 14, description: 'State variable updated after external call. Attacker can recursively drain all funds before balance updates.', category: 'reentrancy' },
  { severity: 'HIGH', title: 'Missing access control', line: 8, description: 'No owner or role-based restriction on deposit(). Any address can interact without authorization.', category: 'access-control' },
  { severity: 'MEDIUM', title: 'Unchecked return value', line: 13, description: 'Low-level call() return not fully validated. Silent failures can leave contract state inconsistent.', category: 'external-calls' },
  { severity: 'HIGH', title: 'Unprotected selfdestruct path', line: 11, description: 'Contract balance can be forcibly manipulated. No circuit breaker or pause mechanism present.', category: 'business-logic' },
  { severity: 'MEDIUM', title: 'Integer overflow risk', line: 9, description: 'Pre-0.8 arithmetic patterns detected. Explicit SafeMath usage recommended for clarity.', category: 'arithmetic' },
  { severity: 'LOW', title: 'No event emissions', line: 6, description: 'Deposit and withdraw operations emit no events, making off-chain tracking and auditing difficult.', category: 'code-quality' },
]

const DEMO_CATEGORIES = [
  'reentrancy', 'access-control', 'arithmetic', 'external-calls',
  'token-standards', 'business-logic', 'gas-optimization',
  'code-quality', 'compiler', 'defi',
]

const SAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
        // ⚠ State update AFTER external call — reentrancy!
        balances[msg.sender] -= amount;
    }
}`

// --- SEVERITY CONFIG ---
const SEV: Record<string, { border: string; badge: string; text: string }> = {
  CRITICAL: { border: '#ef4444', badge: 'rgba(239,68,68,0.1)',   text: '#ef4444' },
  HIGH:     { border: '#f97316', badge: 'rgba(249,115,22,0.1)',  text: '#f97316' },
  MEDIUM:   { border: '#f59e0b', badge: 'rgba(245,158,11,0.1)',  text: '#f59e0b' },
  LOW:      { border: '#3b82f6', badge: 'rgba(59,130,246,0.1)',  text: '#3b82f6' },
}

// --- FINDING CARD ---
function FindingCard({ finding }: { finding: AuditFinding }) {
  const s = SEV[finding.severity]
  return (
    <div className="finding-card" style={{
      borderRadius: 8,
      background: 'rgba(15,23,42,0.6)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${s.border}`,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px',
          borderRadius: 4, letterSpacing: '0.06em',
          fontFamily: 'JetBrains Mono, monospace',
          background: s.badge, color: s.text, flexShrink: 0,
        }}>{finding.severity}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
          {finding.title}
        </span>
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#334155' }}>
        line {finding.line}
      </div>
      <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
        {finding.description}
      </div>
    </div>
  )
}

// --- EMPTY STATE ---
function EmptyState({ scanning }: { scanning: boolean }) {
  if (scanning) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
        <div style={{ width: '50%', height: 1, background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)', opacity: 0.5 }}/>
        <span style={{ color: '#64748b', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>scanning for vulnerabilities...</span>
      </div>
    )
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
      <div style={{ width: 40, height: 40, position: 'relative', opacity: 0.2 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, borderTop: '1.5px solid #3b82f6', borderLeft: '1.5px solid #3b82f6' }}/>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderTop: '1.5px solid #3b82f6', borderRight: '1.5px solid #3b82f6' }}/>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 12, borderBottom: '1.5px solid #3b82f6', borderLeft: '1.5px solid #3b82f6' }}/>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderBottom: '1.5px solid #3b82f6', borderRight: '1.5px solid #3b82f6' }}/>
      </div>
      <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace' }}>
        submit a contract<br/>to begin scanning
      </div>
    </div>
  )
}

// --- NAV ICON ---
function NavIcon({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  return (
    <div title={label} className="nav-icon" style={{
      width: 40, height: 40, borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
      border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
      color: active ? '#3b82f6' : '#334155',
      fontSize: 16, cursor: 'pointer', transition: 'all 0.15s',
    }}>{icon}</div>
  )
}

// --- MAIN APP ---
declare global {
  interface Window {
    ethereum?: { request: (args: { method: string }) => Promise<string[]> }
  }
}

export default function App() {
  const coordinator = useCoordinator()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [source, setSource] = useState(SAMPLE_CONTRACT)
  const [_contractInput] = useState<ContractInput>({ mode: 'source', source: SAMPLE_CONTRACT, address: '', chain: 'Arc Testnet' })
  const [activeTab, setActiveTab] = useState(0)
  const [contractAddress, setContractAddress] = useState('')

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
  const deposit = isLive ? coordinator.deposit : 1000000n
  const completedCategories = isLive ? coordinator.completedCategories : demoCategories
  const ensName = isLive ? coordinator.ensName : 'audit.kronoscan.eth'
  const effectivePrice = isLive ? coordinator.effectivePrice : 80n
  const requestCount = isLive ? coordinator.requestCount : completedCategories.length

  const consumedRatio = deposit > 0n ? Number((totalConsumed * 10000n) / deposit) / 10000 : 0

  function formatUSDC(amount: bigint): string {
    const n = Number(amount) / 1e6
    return '$' + n.toFixed(6)
  }

  async function connectWallet() {
    if (!window.ethereum) { alert('Please install MetaMask'); return }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setWalletAddress(accounts[0])
    } catch (e) { console.error(e) }
  }

  function startDemo() {
    if (scanning) return
    setScanning(true)
    setDemoStatus('ACTIVE')
    setDemoFindings([])
    setDemoConsumed(0)
    setDemoCategories([])

    const newIntervals: number[] = []
    let consumed = 0
    let catIndex = 0

    // One category every 3 seconds — simulate per-request payments
    const catInt = window.setInterval(() => {
      if (catIndex >= DEMO_CATEGORIES.length) return
      const cat = DEMO_CATEGORIES[catIndex]
      consumed += 80
      catIndex++
      setDemoConsumed(consumed)
      setDemoCategories(prev => [...prev, cat])
    }, 3000)
    newIntervals.push(catInt)

    DEMO_FINDINGS.forEach((f, i) => {
      const t = window.setTimeout(() => {
        setDemoFindings(prev => [f, ...prev])
        if (i === DEMO_FINDINGS.length - 1) {
          window.setTimeout(() => {
            newIntervals.forEach(id => window.clearInterval(id))
            setDemoCategories(DEMO_CATEGORIES)
            setDemoConsumed(80 * DEMO_CATEGORIES.length)
            setDemoStatus('CLOSED')
            setScanning(false)
          }, 1200)
        }
      }, 3000 + i * 3500)
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
  }

  function handleRunAudit() {
    if (isLive) {
      // In live mode the agent runs from terminal — button is disabled when IDLE
      return
    } else {
      if (status === 'CLOSED') resetDemo()
      else startDemo()
    }
  }

  const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  findings.forEach(f => { sevCounts[f.severity]++ })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>

      {/* ANTIGRAVITY BACKGROUND */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      }}>
        <Antigravity
          count={280}
          color="#3b82f6"
          particleShape="capsule"
          autoAnimate
          magnetRadius={8}
          ringRadius={8}
          particleSize={1.2}
          waveSpeed={0.3}
          waveAmplitude={0.8}
          fieldStrength={8}
          lerpSpeed={0.05}
          pulseSpeed={2.5}
          particleVariance={1}
          rotationSpeed={0}
          depthFactor={1}
        />
      </div>

      {/* UI LAYER */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%', height: '100%' }}>

        {/* SIDEBAR */}
        <aside style={{
          width: 64, background: 'rgba(10,15,30,0.95)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '18px 0',
          gap: 6, flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ marginBottom: 20 }}>
            <svg width="28" height="28" viewBox="0 0 88 88" fill="none">
              <path d="M4 22 L4 4 L22 4" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
              <path d="M66 4 L84 4 L84 22" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
              <path d="M4 66 L4 84 L22 84" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
              <path d="M66 84 L84 84 L84 66" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"/>
              <line x1="22" y1="30" x2="66" y2="30" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="22" y1="58" x2="66" y2="58" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="22" y1="30" x2="66" y2="58" stroke="#3b82f6" strokeWidth="1.2"/>
              <line x1="66" y1="30" x2="22" y2="58" stroke="#3b82f6" strokeWidth="1.2"/>
              <circle cx="44" cy="44" r="4" fill="#3b82f6"/>
              <circle cx="44" cy="44" r="9" stroke="#3b82f6" strokeWidth="1" fill="none" opacity="0.3"/>
            </svg>
          </div>

          <NavIcon icon="⬡" label="Dashboard" active={true} />
          <NavIcon icon="⬢" label="Audits" active={false} />
          <NavIcon icon="◈" label="Reports" active={false} />
          <NavIcon icon="⬟" label="Settings" active={false} />

          <div style={{ flex: 1 }}/>

          <div
            onClick={connectWallet}
            title={walletAddress || 'Connect Wallet'}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: walletAddress
                ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                : 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: '#f1f5f9', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {walletAddress ? walletAddress.slice(2, 4).toUpperCase() : '??'}
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* HEADER */}
          <header style={{
            height: 54,
            background: 'rgba(10,15,30,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center',
            padding: '0 20px', gap: 14, flexShrink: 0,
          }}>
            {/* Logo text */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
                <span style={{ color: '#3b82f6' }}>Krono</span>
                <span style={{ color: '#f1f5f9' }}>Scan</span>
              </div>
              <div style={{ fontSize: 8, letterSpacing: '0.18em', color: '#334155', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                SECURITY · STREAM
              </div>
            </div>

            {/* Network badge */}
            <div style={{
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.2)',
              color: '#60a5fa', borderRadius: 6, padding: '3px 9px',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
              fontFamily: 'JetBrains Mono, monospace',
            }}>ARC TESTNET</div>

            <div style={{ flex: 1 }}/>

            {/* World ID */}
            <div style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              color: '#60a5fa', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 500,
            }}>World ID ✓</div>

            {/* Wallet */}
            {walletAddress ? (
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                color: '#3b82f6',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 6, padding: '4px 10px',
              }}>
                {walletAddress.slice(0,6)}...{walletAddress.slice(-4)}
              </div>
            ) : (
              <button onClick={connectWallet} style={{
                background: '#3b82f6',
                color: 'white', border: 'none', borderRadius: 7,
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2563eb')}
              onMouseLeave={e => (e.currentTarget.style.background = '#3b82f6')}
              >Connect Wallet</button>
            )}

            {/* Live/Demo dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isLive ? '#22c55e' : '#3b82f6',
              }}/>
              <span style={{ fontSize: 11, color: isLive ? '#22c55e' : '#334155', fontFamily: 'JetBrains Mono, monospace' }}>
                {isLive ? 'live' : 'demo'}
              </span>
            </div>
          </header>

          {/* PAGE CONTENT */}
          <div style={{
            flex: 1,
            padding: '16px 20px 96px',
            overflow: 'hidden', display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}>

            {/* LEFT: Code input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

              {/* Hero banner */}
              <div style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.15)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 10, padding: '13px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 3, fontFamily: 'JetBrains Mono, monospace' }}>
                    SMART CONTRACT AUDIT
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                    AI-Powered Security
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Pay per request · Verified by World ID
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>🔍</div>
              </div>

              {/* Code card */}
              <div className="glass-panel" style={{
                flex: 1, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', minHeight: 0,
              }}>
                {/* Tabs */}
                <div style={{
                  display: 'flex',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                  padding: '0 4px',
                }}>
                  {['Paste Source', 'On-Chain Address'].map((tab, i) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(i)}
                      style={{
                        padding: '10px 14px', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', border: 'none', outline: 'none',
                        color: activeTab === i ? '#3b82f6' : '#334155',
                        borderBottom: activeTab === i ? '2px solid #3b82f6' : '2px solid transparent',
                        background: 'transparent',
                        transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
                      }}
                    >{tab}</button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                  {activeTab === 0 ? (
                    <>
                      <textarea
                        value={source}
                        onChange={e => setSource(e.target.value)}
                        style={{
                          width: '100%', height: '100%',
                          background: 'rgba(3,7,18,0.6)',
                          color: '#93c5fd',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 12, lineHeight: 1.7,
                          padding: '16px 16px 16px 14px',
                          borderLeft: '2px solid rgba(59,130,246,0.4)',
                          border: 'none', outline: 'none',
                          resize: 'none', display: 'block',
                        }}
                        className="code-content"
                        spellCheck={false}
                      />
                      <div className={`scan-line ${status === 'ACTIVE' ? 'active' : ''}`}/>
                    </>
                  ) : (
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', height: '100%' }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.08em', display: 'block', marginBottom: 7, fontFamily: 'JetBrains Mono, monospace' }}>
                          CONTRACT ADDRESS
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute', left: 11, top: '50%',
                            transform: 'translateY(-50%)',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 13, color: '#334155', pointerEvents: 'none',
                          }}>0x</span>
                          <input
                            value={contractAddress}
                            onChange={e => setContractAddress(e.target.value)}
                            placeholder="7f3a4b8c9d2e1f0a..."
                            style={{
                              width: '100%',
                              background: 'rgba(15,23,42,0.6)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              borderRadius: 7,
                              padding: '10px 12px 10px 34px',
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: 12, color: '#f1f5f9', outline: 'none',
                            }}
                          />
                        </div>
                        {contractAddress.length > 0 && (
                          <div style={{ marginTop: 5, fontSize: 11, color: contractAddress.length === 40 ? '#22c55e' : '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
                            {contractAddress.length === 40
                              ? '✓ valid address'
                              : `${40 - contractAddress.length} more chars`
                            }
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.08em', display: 'block', marginBottom: 7, fontFamily: 'JetBrains Mono, monospace' }}>
                          NETWORK
                        </label>
                        <select style={{
                          width: '100%',
                          background: 'rgba(15,23,42,0.6)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: 7,
                          padding: '10px 12px', fontSize: 12,
                          color: '#f1f5f9', outline: 'none',
                        }}>
                          <option style={{ background: '#0f172a' }}>Arc Testnet</option>
                          <option style={{ background: '#0f172a' }}>Ethereum Mainnet</option>
                          <option style={{ background: '#0f172a' }}>Base</option>
                        </select>
                      </div>

                      <div style={{
                        background: 'rgba(59,130,246,0.06)',
                        border: '1px solid rgba(59,130,246,0.15)',
                        borderRadius: 7, padding: '10px 12px',
                        fontSize: 11.5, color: '#64748b', lineHeight: 1.6,
                      }}>
                        The scanner will fetch the verified Solidity source from the block explorer and analyze it in real time.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status + address */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  borderRadius: 6, padding: '4px 10px', fontSize: 10,
                  fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
                  background: 'rgba(15,23,42,0.7)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  color: status === 'ACTIVE' ? '#22c55e' : status === 'CLOSED' ? '#3b82f6' : '#334155',
                }}>
                  {status === 'ACTIVE' && <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }}/>}
                  {status}
                </div>
                {ensName && (
                  <span style={{ fontSize: 11, color: '#1e293b', fontFamily: 'JetBrains Mono, monospace' }}>
                    {ensName}
                  </span>
                )}
              </div>

              {/* Run button */}
              <button
                onClick={handleRunAudit}
                disabled={isLive && status === 'IDLE'}
                style={{
                  background: status === 'ACTIVE'
                    ? 'rgba(59,130,246,0.2)'
                    : (isLive && status === 'IDLE') ? 'rgba(59,130,246,0.1)' : '#3b82f6',
                  color: status === 'ACTIVE' ? '#60a5fa' : (isLive && status === 'IDLE') ? '#334155' : 'white',
                  border: status === 'ACTIVE'
                    ? '1px solid rgba(59,130,246,0.3)'
                    : (isLive && status === 'IDLE') ? '1px solid rgba(59,130,246,0.15)' : '1px solid transparent',
                  borderRadius: 9,
                  padding: '13px 24px', fontSize: 14, fontWeight: 600,
                  cursor: (status === 'ACTIVE' || (isLive && status === 'IDLE')) ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, width: '100%',
                  animation: status === 'ACTIVE' ? 'btnGlow 2s infinite' : 'none',
                  flexShrink: 0, transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 14 }}>
                  {status === 'IDLE' ? (isLive ? '⏸' : '▶') : status === 'ACTIVE' ? '⏳' : '↩'}
                </span>
                {status === 'IDLE' && (isLive ? 'Waiting for agent...' : 'Run Demo')}
                {status === 'ACTIVE' && `Scanning... ${requestCount}/10`}
                {status === 'CLOSED' && (isLive ? 'Audit Complete' : 'Run Again')}
                {(status === 'OPENING' || status === 'CLOSING') && 'Processing...'}
                {status === 'TERMINATED' && 'Terminated'}
              </button>
            </div>

            {/* RIGHT: Findings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

              {/* Severity counters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, flexShrink: 0 }}>
                {([
                  { key: 'CRITICAL', label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.15)' },
                  { key: 'HIGH',     label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.07)', border: 'rgba(249,115,22,0.15)' },
                  { key: 'MEDIUM',   label: 'Medium',   color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.15)' },
                  { key: 'LOW',      label: 'Low',      color: '#3b82f6', bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.15)' },
                ] as const).map(s => (
                  <div key={s.key} style={{
                    background: s.bg,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: `1px solid ${s.border}`,
                    borderRadius: 8, padding: '10px 12px',
                    borderTop: `2px solid ${s.color}`,
                  }}>
                    <div style={{
                      fontSize: 20, fontWeight: 700,
                      color: s.color, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1,
                    }}>
                      {sevCounts[s.key]}
                    </div>
                    <div style={{ fontSize: 10, color: '#334155', fontWeight: 500, marginTop: 4, letterSpacing: '0.04em' }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Findings list */}
              <div className="glass-panel" style={{
                flex: 1, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', minHeight: 0,
              }}>
                <div style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
                    Security Findings
                    {findings.length > 0 && (
                      <span style={{
                        marginLeft: 8,
                        background: '#3b82f6', color: 'white',
                        borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                      }}>{findings.length}</span>
                    )}
                  </div>
                  {status === 'ACTIVE' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>
                      <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }}/>
                      scanning
                    </div>
                  )}
                </div>

                <div className="findings-list" style={{
                  flex: 1, overflowY: 'auto',
                  padding: 10, display: 'flex',
                  flexDirection: 'column', gap: 7,
                }}>
                  {findings.length === 0
                    ? <EmptyState scanning={status === 'ACTIVE'}/>
                    : findings.map((f, i) => <FindingCard key={`${f.title}-${i}`} finding={f}/>)
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM COST BAR */}
      <div style={{
        position: 'fixed', bottom: 0, left: 64, right: 0,
        height: 80,
        background: 'rgba(10,15,30,0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        zIndex: 100, padding: '10px 20px',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>

        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>

          <div style={{ flexShrink: 0, minWidth: 120 }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 17,
              fontWeight: 700, lineHeight: 1,
              color: '#3b82f6',
            }}>
              {formatUSDC(totalConsumed)}
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
              {status === 'ACTIVE'
                ? `${formatUSDC(effectivePrice)}/req · ${requestCount}/10 categories`
                : status === 'CLOSED'
                ? `${findings.length} findings · complete`
                : 'ready to scan'
              }
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ flex: 1 }}>
            {status === 'IDLE' ? (
              <div style={{
                height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2,
                border: '1px dashed rgba(59,130,246,0.15)',
              }}/>
            ) : (
              <div style={{
                height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2,
                position: 'relative', overflow: 'visible',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
                  width: `${Math.min(consumedRatio * 100, 100)}%`,
                  transition: 'width 1s linear', position: 'relative',
                }}>
                  {status === 'ACTIVE' && (
                    <div className="cost-dot" style={{
                      position: 'absolute', right: -5, top: '50%',
                      width: 9, height: 9, borderRadius: '50%',
                      background: '#3b82f6',
                    }}/>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
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
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
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
        </div>

        {/* Category payment feed */}
        <div style={{
          display: 'flex', gap: 5, overflow: 'hidden',
          alignItems: 'center', height: 20,
        }}>
          {status === 'IDLE' ? (
            <span style={{ fontSize: 10, color: '#1e293b', fontFamily: 'JetBrains Mono, monospace' }}>
              — category payments will appear here
            </span>
          ) : completedCategories.slice().reverse().map((cat, i) => (
            <div key={cat} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 5, padding: '2px 8px', flexShrink: 0,
              animation: i === 0 ? 'txIn 0.25s ease forwards' : 'none',
              opacity: Math.max(0.2, 1 - i * 0.1),
            }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: i === 0 ? '#3b82f6' : '#1d4ed8', flexShrink: 0,
              }}/>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                fontWeight: 600, color: '#3b82f6',
              }}>{cat}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#334155',
              }}>{formatUSDC(effectivePrice)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
