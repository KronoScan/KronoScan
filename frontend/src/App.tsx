import { useState } from 'react'
import { useCoordinator } from './hooks/useCoordinator'
import type { ContractInput, AuditFinding, SessionStatus } from './types'
import ShapeGrid from './components/ShapeGrid'
import KronoScanLogo from './components/KronoScanLogo'
import LandingPage from './LandingPage'

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
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VulnerableVault {
    address public owner;
    IERC20 public token;
    mapping(address => uint256) public balances;
    mapping(address => bool) public authorized;
    uint256 public totalDeposits;
    uint256 public feePercent = 5;
    bool public paused;

    event Deposit(address user, uint256 amount);
    event Withdrawal(address user, uint256 amount);

    constructor(address _token) {
        owner = msg.sender;
        token = IERC20(_token);
    }

    // Missing access control: anyone can set fee
    function setFeePercent(uint256 _fee) external {
        feePercent = _fee;
    }

    // Missing zero-address check
    function setOwner(address _newOwner) external {
        require(msg.sender == owner, "Not owner");
        owner = _newOwner;
    }

    function deposit(uint256 amount) external {
        require(!paused, "Paused");
        token.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalDeposits += amount;
        emit Deposit(msg.sender, amount);
    }

    // Reentrancy: state updated after external call
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient");
        uint256 fee = amount * feePercent / 100;
        uint256 payout = amount - fee;
        token.transfer(msg.sender, payout);
        token.transfer(owner, fee);
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        emit Withdrawal(msg.sender, amount);
    }

    // Division before multiplication (precision loss)
    function calculateReward(uint256 amount, uint256 rate) public pure returns (uint256) {
        return amount / 1000 * rate;
    }

    // Unchecked return value on transfer
    function emergencyTransfer(address to, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        token.transfer(to, amount);
    }

    // No event emitted for critical state change
    function pause() external {
        require(msg.sender == owner, "Not owner");
        paused = true;
    }

    function unpause() external {
        require(msg.sender == owner, "Not owner");
        paused = false;
    }

    // Uses tx.origin instead of msg.sender
    function authorizeUser(address user) external {
        require(tx.origin == owner, "Not owner");
        authorized[user] = true;
    }

    // Unbounded loop: gas DoS if array grows
    function batchTransfer(address[] calldata recipients, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        for (uint256 i = 0; i < recipients.length; i++) {
            token.transfer(recipients[i], amount);
        }
    }

    // Magic number, unclear intent
    function isWhale(uint256 amount) public pure returns (bool) {
        return amount > 1000000000000000000000;
    }

    // Old Solidity pattern, should use custom errors
    function adminWithdraw(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(amount <= address(this).balance, "Insufficient ETH");
        payable(owner).transfer(amount);
    }
}`

// --- ARCSCAN ---
const ARCSCAN_BASE = 'https://testnet.arcscan.app'
function arcscanTx(hash: string): string { return `${ARCSCAN_BASE}/tx/${hash}` }

// --- PER-CATEGORY PRICING (must match seller-api/src/types.ts) ---
const CATEGORY_PRICES: Record<string, bigint> = {
  'reentrancy':       150n,
  'access-control':   120n,
  'arithmetic':        80n,
  'external-calls':   130n,
  'token-standards':   70n,
  'business-logic':   200n,
  'gas-optimization':  60n,
  'code-quality':      50n,
  'compiler':          40n,
  'defi':             180n,
}

// --- SEVERITY CONFIG ---
const SEV: Record<string, { border: string; badge: string; text: string }> = {
  CRITICAL: { border: '#ef4444', badge: 'rgba(239,68,68,0.1)',   text: '#ef4444' },
  HIGH:     { border: '#f97316', badge: 'rgba(249,115,22,0.1)',  text: '#f97316' },
  MEDIUM:   { border: '#f59e0b', badge: 'rgba(245,158,11,0.1)',  text: '#f59e0b' },
  LOW:      { border: '#10b981', badge: 'rgba(16,185,129,0.1)',  text: '#10b981' },
}

// --- ARCSCAN LINK ---
function ArcScanLink({ hash, label }: { hash: string; label?: string }) {
  if (!hash || hash === '0x0') return null
  return (
    <a
      href={arcscanTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        color: '#10b981', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: 4, padding: '2px 8px',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)' }}
    >
      {label ?? `${hash.slice(0, 6)}...${hash.slice(-4)}`}
      <span style={{ fontSize: 9 }}>↗</span>
    </a>
  )
}

// --- FINDING CARD ---
function FindingCard({ finding, txHash }: { finding: AuditFinding; txHash?: string }) {
  const s = SEV[finding.severity]
  const hasLink = txHash && txHash !== '0x0'

  const card = (
    <div className="finding-card" style={{
      borderRadius: 8,
      background: 'rgba(10,26,18,0.6)',
      border: '1px solid rgba(16,185,129,0.08)',
      borderLeft: `3px solid ${s.border}`,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 5,
      cursor: hasLink ? 'pointer' : 'default',
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { if (hasLink) e.currentTarget.style.background = 'rgba(10,26,18,0.85)' }}
      onMouseLeave={e => { if (hasLink) e.currentTarget.style.background = 'rgba(10,26,18,0.6)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px',
          borderRadius: 4, letterSpacing: '0.06em',
          fontFamily: 'JetBrains Mono, monospace',
          background: s.badge, color: s.text, flexShrink: 0,
        }}>{finding.severity}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e2f5ee', letterSpacing: '-0.01em' }}>
          {finding.title}
        </span>
        {finding.category && (
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 3,
            background: 'rgba(16,185,129,0.06)', color: '#4a7a6a',
            fontFamily: 'JetBrains Mono, monospace', marginLeft: 'auto', flexShrink: 0,
          }}>{finding.category}</span>
        )}
        {hasLink && (
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 3,
            background: 'rgba(16,185,129,0.1)', color: '#10b981',
            fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
          }}>tx ↗</span>
        )}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#2a4a3a' }}>
        line {finding.line}
        {hasLink && (
          <span style={{ marginLeft: 8, color: '#10b981', fontSize: 9 }}>
            {txHash!.slice(0, 8)}...{txHash!.slice(-4)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: '#4a7a6a', lineHeight: 1.5 }}>
        {finding.description}
      </div>
    </div>
  )

  if (hasLink) {
    return (
      <a href={arcscanTx(txHash!)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
        {card}
      </a>
    )
  }
  return card
}

// --- EMPTY STATE ---
function EmptyState({ scanning }: { scanning: boolean }) {
  if (scanning) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
        <div style={{ width: '50%', height: 1, background: 'linear-gradient(90deg, transparent, #10b981, transparent)', opacity: 0.5 }} />
        <span style={{ color: '#2a4a3a', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>scanning for vulnerabilities...</span>
      </div>
    )
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
      <div style={{ width: 40, height: 40, position: 'relative', opacity: 0.2 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, borderTop: '1.5px solid #10b981', borderLeft: '1.5px solid #10b981' }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderTop: '1.5px solid #10b981', borderRight: '1.5px solid #10b981' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 12, borderBottom: '1.5px solid #10b981', borderLeft: '1.5px solid #10b981' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderBottom: '1.5px solid #10b981', borderRight: '1.5px solid #10b981' }} />
      </div>
      <div style={{ fontSize: 12, color: '#1a3a2a', textAlign: 'center', lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace' }}>
        submit a contract<br />to begin scanning
      </div>
    </div>
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
  const [showLanding, setShowLanding] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [addressResolving, setAddressResolving] = useState(false)
  const [addressResolved, setAddressResolved] = useState(false)
  const [resolveError, setResolveError] = useState('')

  const [demoStatus, setDemoStatus] = useState<SessionStatus>('IDLE')
  const [demoFindings, setDemoFindings] = useState<AuditFinding[]>([])
  const [demoConsumed, setDemoConsumed] = useState(0)
  const [demoCategories, setDemoCategories] = useState<string[]>([])
  const [demoIntervals, setDemoIntervals] = useState<number[]>([])
  const [scanning, setScanning] = useState(false)

  const [agentStarting, setAgentStarting] = useState(false)
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

    const catInt = window.setInterval(() => {
      if (catIndex >= DEMO_CATEGORIES.length) return
      const cat = DEMO_CATEGORIES[catIndex]
      consumed += Number(CATEGORY_PRICES[cat] ?? 100n)
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
            const totalDemoCost = DEMO_CATEGORIES.reduce((sum, cat) => sum + Number(CATEGORY_PRICES[cat] ?? 100n), 0)
            setDemoConsumed(totalDemoCost)
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

  async function startRealAudit() {
    if (agentStarting) return
    setAgentStarting(true)
    try {
      const res = await fetch('http://localhost:3001/api/start-audit', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        console.error('[audit] Failed to start:', data.error)
        alert(data.error ?? 'Failed to start audit')
      } else {
        console.log('[audit] Agent started — waiting for session via WebSocket')
      }
    } catch (err) {
      console.error('[audit] Failed to reach coordinator:', err)
      alert('Cannot reach coordinator at localhost:3001. Is it running?')
    } finally {
      setAgentStarting(false)
    }
  }

  function handleRunAudit() {
    if (status === 'ACTIVE' || agentStarting) return
    if (coordinator.connected) {
      // Connected to coordinator — launch real agent
      if (status === 'CLOSED') coordinator.reset()
      startRealAudit()
    } else {
      // Not connected — run local demo
      if (status === 'CLOSED') resetDemo()
      else startDemo()
    }
  }

  const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  findings.forEach(f => { sevCounts[f.severity as keyof typeof sevCounts]++ })

  const filteredFindings = activeFilter
    ? findings.filter(f => f.severity === activeFilter)
    : findings

  // Show landing page
  if (showLanding) {
    return <LandingPage onLaunch={() => setShowLanding(false)} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative', fontFamily: 'Sora, sans-serif' }}>

      {/* SHAPEGRID BACKGROUND */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <ShapeGrid
          direction="diagonal"
          speed={0.2}
          borderColor="#10b981"
          squareSize={48}
          hoverFillColor="#052e16"
          hoverTrailAmount={2}
        />
      </div>

      {/* Dark overlay over grid */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'rgba(6,13,10,0.82)', pointerEvents: 'none' }} />

      {/* UI LAYER */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%', height: '100%' }}>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* HEADER */}
          <header style={{
            height: 54,
            background: 'rgba(10,26,18,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(16,185,129,0.1)',
            display: 'flex', alignItems: 'center',
            padding: '0 20px', gap: 14, flexShrink: 0,
          }}>
            {/* Logo — clickable back to landing */}
            <button
              onClick={() => setShowLanding(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 0 }}
            >
              <KronoScanLogo size={32} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'Sora, sans-serif' }}>
                  <span style={{ color: '#10b981' }}>Krono</span>
                  <span style={{ color: '#e2f5ee' }}>Scan</span>
                </div>
                <div style={{ fontSize: 8, letterSpacing: '0.18em', color: '#4a7a6a', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                  SECURITY · STREAM
                </div>
              </div>
            </button>

            {/* Network badge */}
            <div style={{
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.2)',
              color: '#34d399', borderRadius: 6, padding: '3px 9px',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
              fontFamily: 'JetBrains Mono, monospace',
            }}>ARC TESTNET</div>

            <div style={{ flex: 1 }} />

            {/* Agent info */}
            <div style={{ fontSize: 11, color: '#4a7a6a', fontFamily: 'JetBrains Mono, monospace' }}>
              KronoScan Agent · AI Auditor
            </div>

            {/* ENS */}
            {ensName && (
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                color: '#10b981',
                background: 'rgba(16,185,129,0.06)',
                border: '1px solid rgba(16,185,129,0.15)',
                borderRadius: 6, padding: '4px 10px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 8, color: '#4a7a6a', letterSpacing: '0.06em', fontWeight: 700 }}>ENS</span>
                <span style={{ width: 1, height: 12, background: 'rgba(16,185,129,0.2)' }} />
                {ensName}
              </div>
            )}

            {/* Wallet */}
            {walletAddress ? (
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                color: '#10b981',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 6, padding: '4px 10px',
              }}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
            ) : (
              <button onClick={connectWallet} style={{
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: 'white', border: 'none', borderRadius: 7,
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Sora, sans-serif',
                transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >Connect Wallet</button>
            )}

            {/* Live/Demo dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isLive ? '#22c55e' : '#10b981',
              }} />
              <span style={{ fontSize: 11, color: isLive ? '#22c55e' : '#2a4a3a', fontFamily: 'JetBrains Mono, monospace' }}>
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
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.15)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 10, padding: '13px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#4a7a6a', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 3, fontFamily: 'JetBrains Mono, monospace' }}>
                    SMART CONTRACT AUDIT
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e2f5ee', letterSpacing: '-0.02em' }}>
                    AI-Powered Security
                  </div>
                  <div style={{ fontSize: 11, color: '#4a7a6a', marginTop: 2 }}>
                    Pay per request via Circle Nanopayments · <span style={{ color: '#10b981' }}>on-chain escrow</span>
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.2)',
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
                  borderBottom: '1px solid rgba(16,185,129,0.1)',
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
                        color: activeTab === i ? '#10b981' : '#2a4a3a',
                        borderBottom: activeTab === i ? '2px solid #10b981' : '2px solid transparent',
                        background: 'transparent',
                        transition: 'all 0.15s', fontFamily: 'Sora, sans-serif',
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
                          background: 'rgba(3,10,6,0.6)',
                          color: '#34d399',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 12, lineHeight: 1.7,
                          padding: '16px 16px 16px 14px',
                          borderLeft: '2px solid rgba(16,185,129,0.4)',
                          border: 'none', outline: 'none',
                          resize: 'none', display: 'block',
                        }}
                        className="code-content"
                        spellCheck={false}
                      />
                      <div className={`scan-line ${status === 'ACTIVE' ? 'active' : ''}`} />
                    </>
                  ) : (
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', height: '100%' }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#2a4a3a', letterSpacing: '0.08em', display: 'block', marginBottom: 7, fontFamily: 'JetBrains Mono, monospace' }}>
                          CONTRACT ADDRESS
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{
                              position: 'absolute', left: 11, top: '50%',
                              transform: 'translateY(-50%)',
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: 13, color: '#2a4a3a', pointerEvents: 'none',
                            }}>0x</span>
                            <input
                              value={contractAddress}
                              onChange={e => {
                                setContractAddress(e.target.value)
                                setAddressResolved(false)
                                setResolveError('')
                              }}
                              placeholder="7f3a4b8c9d2e1f0a..."
                              style={{
                                width: '100%',
                                background: 'rgba(10,26,18,0.6)',
                                border: '1px solid rgba(16,185,129,0.15)',
                                borderRadius: 7,
                                padding: '10px 12px 10px 34px',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: 12, color: '#e2f5ee', outline: 'none',
                              }}
                            />
                          </div>
                          {contractAddress.length === 40 && (
                            <a
                              href={`${ARCSCAN_BASE}/address/0x${contractAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(16,185,129,0.08)',
                                border: '1px solid rgba(16,185,129,0.2)',
                                borderRadius: 7, padding: '0 12px',
                                fontSize: 10, color: '#10b981', textDecoration: 'none',
                                fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
                              }}
                            >ArcScan ↗</a>
                          )}
                        </div>
                        {contractAddress.length > 0 && (
                          <div style={{ marginTop: 5, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                            {contractAddress.length === 40
                              ? <span style={{ color: '#22c55e' }}>✓ valid address</span>
                              : <span style={{ color: '#4a7a6a' }}>{40 - contractAddress.length} more chars</span>
                            }
                          </div>
                        )}
                        {addressResolving && (
                          <div style={{ marginTop: 5, fontSize: 11, color: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>
                            Fetching verified source from block explorer...
                          </div>
                        )}
                        {addressResolved && (
                          <div style={{ marginTop: 5, fontSize: 11, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>
                            ✓ Verified source fetched — ready to scan
                          </div>
                        )}
                        {resolveError && (
                          <div style={{ marginTop: 5, fontSize: 11, color: '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>
                            {resolveError}
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#2a4a3a', letterSpacing: '0.08em', display: 'block', marginBottom: 7, fontFamily: 'JetBrains Mono, monospace' }}>
                          NETWORK
                        </label>
                        <select className="agent-select">
                          <option>Arc Testnet</option>
                          <option>Ethereum Mainnet</option>
                          <option>Base</option>
                        </select>
                      </div>

                      <button
                        onClick={async () => {
                          if (contractAddress.length !== 40) return
                          setAddressResolving(true)
                          setResolveError('')
                          setAddressResolved(false)
                          try {
                            const res = await fetch('http://localhost:3002/api/resolve-source', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ contractAddress: `0x${contractAddress}`, chain: 'arc-testnet' }),
                            })
                            const data = await res.json()
                            if (!res.ok) {
                              setResolveError(data.error ?? 'Failed to resolve source')
                            } else {
                              setSource(data.source)
                              setAddressResolved(true)
                              setActiveTab(0) // switch to source tab to show the fetched code
                            }
                          } catch {
                            setResolveError('Cannot reach seller API at localhost:3002')
                          } finally {
                            setAddressResolving(false)
                          }
                        }}
                        disabled={contractAddress.length !== 40 || addressResolving}
                        style={{
                          width: '100%',
                          background: contractAddress.length === 40 && !addressResolving
                            ? 'linear-gradient(135deg, #059669, #10b981)'
                            : 'rgba(16,185,129,0.1)',
                          color: contractAddress.length === 40 && !addressResolving ? 'white' : '#2a4a3a',
                          border: '1px solid rgba(16,185,129,0.2)',
                          borderRadius: 7, padding: '10px 14px',
                          fontSize: 13, fontWeight: 600, cursor: contractAddress.length === 40 ? 'pointer' : 'not-allowed',
                          fontFamily: 'Sora, sans-serif', transition: 'all 0.15s',
                        }}
                      >
                        {addressResolving ? 'Fetching source...' : 'Fetch Verified Source'}
                      </button>

                      <div style={{
                        background: 'rgba(16,185,129,0.06)',
                        border: '1px solid rgba(16,185,129,0.15)',
                        borderRadius: 7, padding: '10px 12px',
                        fontSize: 11.5, color: '#4a7a6a', lineHeight: 1.6,
                      }}>
                        Enter a verified contract address. The source will be fetched from the block explorer and loaded into the editor for scanning.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status + session info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  borderRadius: 6, padding: '4px 10px', fontSize: 10,
                  fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
                  background: 'rgba(10,26,18,0.7)',
                  border: '1px solid rgba(16,185,129,0.12)',
                  color: status === 'ACTIVE' ? '#22c55e' : status === 'CLOSED' ? '#10b981' : '#2a4a3a',
                }}>
                  {status === 'ACTIVE' && <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />}
                  {status}
                </div>
                {ensName && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    borderRadius: 6, padding: '4px 10px', fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.1)',
                    color: '#10b981',
                  }}>
                    <span style={{ color: '#4a7a6a' }}>via</span> {ensName}
                  </div>
                )}
                {coordinator.sessionId && status !== 'IDLE' && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    borderRadius: 6, padding: '4px 10px', fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    background: 'rgba(16,185,129,0.04)',
                    border: '1px solid rgba(16,185,129,0.08)',
                    color: '#2a4a3a',
                  }}>
                    session: {coordinator.sessionId.slice(0, 10)}...
                  </div>
                )}
              </div>

              {/* Run button */}
              <button
                onClick={handleRunAudit}
                disabled={status === 'ACTIVE' || agentStarting}
                style={{
                  background: (status === 'ACTIVE' || agentStarting)
                    ? 'rgba(16,185,129,0.2)'
                    : 'linear-gradient(135deg, #059669, #10b981)',
                  color: (status === 'ACTIVE' || agentStarting) ? '#34d399' : 'white',
                  border: (status === 'ACTIVE' || agentStarting)
                    ? '1px solid rgba(16,185,129,0.3)'
                    : '1px solid transparent',
                  borderRadius: 9,
                  padding: '13px 24px', fontSize: 14, fontWeight: 600,
                  cursor: (status === 'ACTIVE' || agentStarting) ? 'not-allowed' : 'pointer',
                  fontFamily: 'Sora, sans-serif', letterSpacing: '-0.01em',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, width: '100%',
                  animation: status === 'ACTIVE' ? 'btnGlow 2s infinite' : 'none',
                  flexShrink: 0, transition: 'all 0.15s',
                  boxShadow: !(status === 'ACTIVE' || agentStarting) ? '0 4px 20px rgba(16,185,129,0.3)' : 'none',
                }}>
                <span style={{ fontSize: 14 }}>
                  {agentStarting ? '⏳' : status === 'IDLE' ? '▶' : status === 'ACTIVE' ? '⏳' : '↩'}
                </span>
                {agentStarting && 'Starting agent...'}
                {!agentStarting && status === 'IDLE' && (coordinator.connected ? 'Run Audit' : 'Run Demo')}
                {!agentStarting && status === 'ACTIVE' && `Scanning... ${requestCount}/10`}
                {!agentStarting && status === 'CLOSED' && 'Run Again'}
                {!agentStarting && (status === 'OPENING' || status === 'CLOSING') && 'Processing...'}
                {!agentStarting && status === 'TERMINATED' && 'Terminated'}
              </button>
            </div>

            {/* RIGHT: Findings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

              {/* Severity counters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, flexShrink: 0 }}>
                {([
                  { key: 'CRITICAL', label: 'Critical', color: '#ef4444' },
                  { key: 'HIGH',     label: 'High',     color: '#f97316' },
                  { key: 'MEDIUM',   label: 'Medium',   color: '#f59e0b' },
                  { key: 'LOW',      label: 'Low',      color: '#10b981' },
                ] as const).map(s => (
                  <div
                    key={s.key}
                    onClick={() => setActiveFilter(activeFilter === s.key ? null : s.key)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer',
                      background: activeFilter === s.key ? 'rgba(16,185,129,0.08)' : '#0a1a12',
                      border: `1px solid ${activeFilter === s.key ? s.color : 'rgba(16,185,129,0.15)'}`,
                      borderTop: `2px solid ${s.color}`,
                      borderRadius: 6,
                      opacity: activeFilter && activeFilter !== s.key ? 0.45 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                      {sevCounts[s.key]}
                    </div>
                    <div style={{ fontSize: 10, color: '#4a7a6a', fontWeight: 600, marginTop: 5 }}>
                      {s.label}{activeFilter === s.key && <span style={{ marginLeft: 5, color: s.color }}>▼</span>}
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
                  borderBottom: '1px solid rgba(16,185,129,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e2f5ee', letterSpacing: '-0.01em' }}>
                    Security Findings
                    {findings.length > 0 && (
                      <span style={{
                        marginLeft: 8,
                        background: '#10b981', color: 'white',
                        borderRadius: 5, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                      }}>{findings.length}</span>
                    )}
                  </div>
                  {status === 'ACTIVE' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>
                      <div className="pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                      scanning
                    </div>
                  )}
                </div>

                {/* Session closed summary */}
                {status === 'CLOSED' && coordinator.closedData && (
                  <div style={{
                    margin: '8px 10px 0', padding: '10px 12px',
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.15)',
                    borderRadius: 6,
                    display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>Audit Complete</span>
                    <span style={{ fontSize: 10, color: '#4a7a6a', fontFamily: 'JetBrains Mono, monospace' }}>
                      {findings.length} findings
                    </span>
                    <span style={{ fontSize: 10, color: '#4a7a6a', fontFamily: 'JetBrains Mono, monospace' }}>
                      Cost: {formatUSDC(coordinator.closedData.consumed)}
                    </span>
                    <span style={{ fontSize: 10, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>
                      Refund: {formatUSDC(coordinator.closedData.refunded)}
                    </span>
                    <ArcScanLink hash={coordinator.closedData.txHash} label="Settlement tx ↗" />
                  </div>
                )}

                <div className="findings-list" style={{
                  flex: 1, overflowY: 'auto',
                  padding: 10, display: 'flex',
                  flexDirection: 'column', gap: 7,
                }}>
                  {filteredFindings.length === 0
                    ? <EmptyState scanning={status === 'ACTIVE'} />
                    : filteredFindings.map((f, i) => <FindingCard key={`${f.title}-${i}`} finding={f} txHash={coordinator.categoryTxHashes[f.category]} />)
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM COST BAR */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 80,
        background: 'rgba(10,26,18,0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(16,185,129,0.1)',
        zIndex: 100, padding: '10px 20px',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>

        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>

          <div style={{ flexShrink: 0, minWidth: 120 }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 17,
              fontWeight: 700, lineHeight: 1,
              color: '#10b981',
            }}>
              {formatUSDC(totalConsumed)}
            </div>
            <div style={{ fontSize: 10, color: '#2a4a3a', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
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
                height: 4, background: 'rgba(16,185,129,0.04)', borderRadius: 2,
                border: '1px dashed rgba(16,185,129,0.15)',
              }} />
            ) : (
              <div style={{
                height: 4, background: 'rgba(16,185,129,0.08)', borderRadius: 2,
                position: 'relative', overflow: 'visible',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'linear-gradient(90deg, #059669, #10b981)',
                  width: `${Math.min(consumedRatio * 100, 100)}%`,
                  transition: 'width 1s linear', position: 'relative',
                }}>
                  {status === 'ACTIVE' && (
                    <div className="cost-dot" style={{
                      position: 'absolute', right: -5, top: '50%',
                      width: 9, height: 9, borderRadius: '50%',
                      background: '#10b981',
                    }} />
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
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                {requestCount}/10
              </div>
              <div style={{ fontSize: 9, color: '#2a4a3a', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                categories
              </div>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(16,185,129,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                {findings.length}
              </div>
              <div style={{ fontSize: 9, color: '#2a4a3a', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                findings
              </div>
            </div>
            {status === 'CLOSED' && (
              <>
                <div style={{ width: 1, height: 20, background: 'rgba(16,185,129,0.15)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: '#22c55e' }}>
                    {formatUSDC(deposit - totalConsumed)}
                  </div>
                  <div style={{ fontSize: 9, color: '#2a4a3a', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                    refund
                  </div>
                </div>
                {coordinator.closedData?.txHash && (
                  <>
                    <div style={{ width: 1, height: 20, background: 'rgba(16,185,129,0.15)' }} />
                    <ArcScanLink hash={coordinator.closedData.txHash} label="View on ArcScan ↗" />
                  </>
                )}
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
            <span style={{ fontSize: 10, color: '#1a3a2a', fontFamily: 'JetBrains Mono, monospace' }}>
              — category payments will appear here
            </span>
          ) : completedCategories.slice().reverse().map((cat, i) => (
            <div key={cat} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: 5, padding: '2px 8px', flexShrink: 0,
              animation: i === 0 ? 'txIn 0.25s ease forwards' : 'none',
              opacity: Math.max(0.2, 1 - i * 0.1),
            }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: i === 0 ? '#10b981' : '#059669', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                fontWeight: 600, color: '#10b981',
              }}>{cat}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#2a4a3a',
              }}>{formatUSDC(CATEGORY_PRICES[cat] ?? effectivePrice)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
