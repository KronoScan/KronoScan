import { useState } from 'react';
import ShapeGrid from './components/ShapeGrid';
import KronoScanLogo from './components/KronoScanLogo';
import ClickSpark from './components/ClickSpark';

export default function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  const [ctaHovered, setCtaHovered] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#060d0a', color: '#e2f5ee', fontFamily: 'Sora, sans-serif', overflowX: 'hidden' }}>

      {/* NAVBAR — pill style fixed */}
      <div style={{ position: 'fixed', top: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 100 }}>
        <nav style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(6,13,10,0.85)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9999,
          padding: '6px 8px', boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
        }}>
          {/* Logo pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9999, padding: '6px 14px 6px 8px', marginRight: 4 }}>
            <KronoScanLogo size={24} />
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>
              <span style={{ color: '#10b981' }}>Krono</span>
              <span style={{ color: '#e2f5ee' }}>Scan</span>
            </span>
          </div>

          {(['Features', 'Architecture', 'ENS', 'Pricing'] as const).map(item => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              style={{ padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, textDecoration: 'none', color: '#4a7a6a', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#e2f5ee'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = '#4a7a6a'}
            >{item}</a>
          ))}

          <div style={{ width: 1, height: 20, background: 'rgba(16,185,129,0.2)', margin: '0 4px' }} />

          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9999, padding: '5px 12px', fontSize: 10, color: '#4a7a6a', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.08em' }}>
            ARC TESTNET
          </div>

          <div style={{ position: 'relative', marginLeft: 2 }}>
            <ClickSpark sparkColor="#10b981" sparkCount={8} sparkRadius={20} sparkSize={6}>
              <button
                onClick={onLaunch}
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', border: 'none', borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif', boxShadow: '0 0 16px rgba(16,185,129,0.3)', position: 'relative', zIndex: 1 }}
              >
                ⚡ Start Analysis
              </button>
            </ClickSpark>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 48px 60px', textAlign: 'center', overflow: 'hidden' }}>
        {/* ShapeGrid background */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <ShapeGrid direction="diagonal" speed={0.4} borderColor="#10b981" squareSize={48} hoverFillColor="#052e16" hoverTrailAmount={3} />
        </div>
        {/* Dark overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(6,13,10,0.3) 0%, rgba(6,13,10,0.85) 70%)', zIndex: 1 }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 800 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 4, padding: '5px 14px', fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 32 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            ETHGlobal Cannes 2026 · ARC · ENS · Circle Nanopayments
          </div>

          <h1 style={{ fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 24 }}>
            Smart contract security,<br />
            <span style={{ background: 'linear-gradient(135deg, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              paid per request.
            </span>
          </h1>

          <p style={{ fontSize: 17, color: '#4a7a6a', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 40px' }}>
            AI agents scan your Solidity code across multiple security categories on ARC.
            Each category is a separate nanopayment — pay only for what you use. From <strong style={{ color: '#34d399' }}>$0.01 per scan</strong>.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <ClickSpark sparkColor="#34d399" sparkCount={10} sparkRadius={28} sparkSize={7}>
                <button
                  onClick={onLaunch}
                  onMouseEnter={() => setCtaHovered(true)}
                  onMouseLeave={() => setCtaHovered(false)}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white', border: 'none', borderRadius: 6,
                    padding: '16px 40px', fontSize: 16, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'Sora, sans-serif',
                    boxShadow: ctaHovered ? '0 8px 40px rgba(16,185,129,0.55)' : '0 4px 24px rgba(16,185,129,0.35)',
                    transform: ctaHovered ? 'translateY(-2px)' : 'none',
                    transition: 'all 0.2s', position: 'relative', zIndex: 1,
                  }}
                >⚡ Launch an Analysis</button>
              </ClickSpark>
            </div>
            <a
              href="#architecture"
              style={{ background: 'transparent', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '16px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif', textDecoration: 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
            >
              See how it works →
            </a>
          </div>

          {/* Trust badges */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap' }}>
            {['ARC Testnet', 'ENS Resolution', 'Circle Nanopayments', 'EIP-3009', 'StreamVault Escrow'].map(b => (
              <div key={b} style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 4, padding: '5px 12px', fontSize: 11, color: '#4a7a6a', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{b}</div>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs — Market */}
      <section style={{ padding: '80px 64px', background: '#0a1a12', borderTop: '1px solid rgba(16,185,129,0.1)', borderBottom: '1px solid rgba(16,185,129,0.1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 64, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 16 }}>WHY IT MATTERS</div>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15, color: '#e2f5ee', marginBottom: 20 }}>Web3 security is broken.</h2>
            <p style={{ fontSize: 14, color: '#4a7a6a', lineHeight: 1.7 }}>Traditional audits cost $15,000+ and take weeks. KronoScan delivers AI-powered analysis in under 60 seconds, paid per request via Circle Nanopayments on ARC.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { num: '$2.2B', label: 'Stolen annually', sub: 'via smart contract vulnerabilities' },
              { num: '85%', label: 'Were preventable', sub: 'exploited known vulnerability patterns' },
              { num: '$500M+', label: 'Audit market', sub: 'growing 35% year over year' },
              { num: '15,000+', label: 'Active Web3 projects', sub: 'deploying smart contracts today' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: '#0d1f15', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 8, padding: '32px 28px' }}>
                <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: '#e2f5ee', marginBottom: 16 }}>{kpi.num}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2f5ee', marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 13, color: '#4a7a6a', lineHeight: 1.5 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KronoScan numbers */}
      <section style={{ padding: '80px 64px', background: '#060d0a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 14 }}>KRONOSCAN BY THE NUMBERS</div>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em', color: '#e2f5ee' }}>
              Fast, cheap, and <span style={{ background: 'linear-gradient(135deg, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>verifiable.</span>
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(16,185,129,0.1)', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { num: '$0.01', label: 'Minimum scan cost', sub: 'vs $15,000+ traditional' },
              { num: '60s', label: 'Max scan duration', sub: 'vs 4-8 weeks traditional' },
              { num: '10+', label: 'Security categories', sub: 'each priced independently' },
              { num: '100%', label: 'Auto-refund', sub: 'unused deposit returned on-chain' },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '40px 28px', background: '#060d0a', textAlign: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, background: 'linear-gradient(135deg, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 14 }}>{stat.num}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2f5ee', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 11, color: '#2a4a3a' }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="pricing" style={{ padding: '80px 64px', background: '#0a1a12', borderTop: '1px solid rgba(16,185,129,0.1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 12 }}>WHY KRONOSCAN</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em' }}>Traditional audits vs <span style={{ color: '#10b981' }}>KronoScan</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { label: 'Traditional Audit', items: [{ k: 'Cost', v: '$15,000+' }, { k: 'Speed', v: '4-8 weeks' }, { k: 'Payment', v: 'Flat fee upfront' }, { k: 'ENS resolved', v: '❌ None' }], dim: true, color: '#ef4444' },
              { label: 'KronoScan', items: [{ k: 'Cost', v: '$0.01–$15' }, { k: 'Speed', v: '30–60 seconds' }, { k: 'Payment', v: '✅ Per-request nanopayments' }, { k: 'ENS resolved', v: '✅ audit.kronoscan.eth' }], dim: false, color: '#10b981' },
              { label: 'Open Source Tools', items: [{ k: 'Cost', v: 'Free' }, { k: 'Speed', v: 'Instant' }, { k: 'Payment', v: 'N/A' }, { k: 'ENS resolved', v: '❌ None' }], dim: true, color: '#f59e0b' },
            ].map(row => (
              <div key={row.label} style={{ padding: '24px 20px', background: row.dim ? 'rgba(255,255,255,0.01)' : 'rgba(16,185,129,0.08)', border: `2px solid ${row.dim ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.4)'}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.color, marginBottom: 20 }}>{row.label}</div>
                {row.items.map(item => (
                  <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                    <span style={{ color: '#4a7a6a' }}>{item.k}</span>
                    <span style={{ color: '#e2f5ee', fontWeight: 600 }}>{item.v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '80px 64px', background: '#060d0a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 12 }}>FEATURES</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em' }}>Everything you need to secure your contracts</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { icon: '⚡', title: 'Per-request nanopayments', tag: 'UNIQUE', desc: 'Each audit category is a separate x402 nanopayment via Circle. Pay only for the categories you need — unused deposit refunded automatically.' },
              { icon: '🔐', title: 'On-chain escrow', tag: 'TRUSTLESS', desc: 'StreamVault locks your USDC deposit, tracks consumption on-chain, and auto-refunds the remainder when the session closes.' },
              { icon: '🔷', title: 'ARC Network', desc: 'Built on ARC where USDC is the native gas token. Agents only need one currency for both payments and gas.' },
              { icon: '🔗', title: 'ENS Service Discovery', tag: 'ENSIP-25', desc: 'Agents resolve audit.kronoscan.eth to discover the seller address, API URL, pricing, and supported categories — all stored as on-chain ENS text records. Registered under ENSIP-25, the AI Agent Registry standard.' },
              { icon: '🤖', title: 'Multi-category scanning', tag: 'AI', desc: 'AI-powered analysis across reentrancy, access control, arithmetic, business logic, and more — each priced independently.' },
              { icon: '💰', title: 'Identity-conditioned pricing', desc: 'Verified agents get discounted rates on-chain. The smart contract applies tiered pricing based on trust level.' },
            ].map(f => (
              <div
                key={f.title}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(16,185,129,0.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(16,185,129,0.35)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(16,185,129,0.12)'; }}
                style={{ padding: '24px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 8, transition: 'all 0.2s', cursor: 'default' }}
              >
                <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2f5ee' }}>{f.title}</div>
                  {f.tag && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', background: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, letterSpacing: '0.06em' }}>{f.tag}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#4a7a6a', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" style={{ padding: '80px 64px', background: '#0a1a12', borderTop: '1px solid rgba(16,185,129,0.1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 12 }}>ARCHITECTURE</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em' }}>How KronoScan works</h2>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '32px 24px' }}>
            {/* Top: Dashboard */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ display: 'inline-block', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 6, padding: '10px 32px', fontSize: 13, fontWeight: 700, color: '#34d399' }}>
                Frontend Dashboard — Real-time session state via WebSocket
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 1, height: 20, background: 'rgba(16,185,129,0.4)' }} />
            </div>

            {/* Middle: Agent → Coordinator */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', marginBottom: 8 }}>Buyer Agent</div>
                <div style={{ fontSize: 10, color: '#4a7a6a', lineHeight: 1.6 }}>Resolves seller via ENS<br/>Opens on-chain session<br/>Pays per category via x402<br/>Receives findings via SSE</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: '#4a7a6a', fontFamily: 'JetBrains Mono, monospace' }}>WebSocket</span>
                <div style={{ width: 48, height: 1, background: 'rgba(16,185,129,0.4)' }} />
              </div>
              <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))', border: '2px solid rgba(16,185,129,0.5)', borderRadius: 6, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#e2f5ee', marginBottom: 8 }}>Coordinator</div>
                <div style={{ fontSize: 10, color: '#4a7a6a', lineHeight: 1.6 }}>Session lifecycle<br/>Reports consumption on-chain<br/>Checks solvency<br/>Pushes updates via WS</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 1, height: 20, background: 'rgba(16,185,129,0.3)' }} />
            </div>

            {/* Bottom: 3 infrastructure components */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[
                { title: 'StreamVault (ARC)', items: ['USDC escrow deposit', 'Identity-conditioned pricing', 'On-chain consumption tracking', 'Automatic refund on close'] },
                { title: 'Circle Nanopayments', items: ['x402 per-request payments', 'EIP-3009 signatures', 'Batched on-chain settlement', 'Sub-cent USDC transfers'] },
                { title: 'Seller API', items: ['10+ audit category endpoints', 'Each x402-protected', 'AI-powered analysis', 'SSE finding streams'] },
              ].map(col => (
                <div key={col.title} style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '16px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', marginBottom: 12 }}>{col.title}</div>
                  {col.items.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{ color: '#10b981', fontSize: 10, flexShrink: 0 }}>↘</span>
                      <span style={{ fontSize: 11, color: '#4a7a6a' }}>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 24, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 6, overflow: 'hidden' }}>
              {[
                { num: '$0.01', label: 'Minimum scan cost' },
                { num: '60s', label: 'Max scan duration' },
                { num: '10+', label: 'Audit categories' },
                { num: 'ENS', label: 'audit.kronoscan.eth' },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: '16px 12px', textAlign: 'center', borderRight: i < 3 ? '1px solid rgba(16,185,129,0.12)' : 'none' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', color: '#34d399' }}>{s.num}</div>
                  <div style={{ fontSize: 10, color: '#4a7a6a', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ENS Deep Dive */}
      <section id="ens" style={{ padding: '80px 64px', background: '#060d0a', borderTop: '1px solid rgba(16,185,129,0.1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 12 }}>ENS INTEGRATION</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em' }}>More than a <span style={{ color: '#10b981' }}>pretty name</span></h2>
            <p style={{ fontSize: 14, color: '#4a7a6a', lineHeight: 1.7, maxWidth: 620, margin: '16px auto 0' }}>
              ENS is how agents discover services without hardcoded addresses. The name <span style={{ color: '#34d399', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>audit.kronoscan.eth</span> stores everything an agent needs to connect, pay, and interact.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left: text records table */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '24px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📝</span> On-Chain Text Records
              </div>
              <div style={{ fontSize: 11, color: '#4a7a6a', marginBottom: 16, lineHeight: 1.6 }}>
                All service metadata is stored as ENS text records — readable by any agent on-chain.
              </div>
              {[
                { key: 'url', value: 'https://seller-api.kronoscan.eth', purpose: 'API endpoint' },
                { key: 'com.kronoscan.categories', value: 'reentrancy,access-control,...', purpose: 'Available scans' },
                { key: 'com.kronoscan.price', value: '100 (atomic USDC)', purpose: 'Base price/request' },
                { key: 'com.kronoscan.network', value: 'arc-testnet', purpose: 'Target chain' },
                { key: 'com.kronoscan.payment', value: 'x402', purpose: 'Payment protocol' },
                { key: 'com.kronoscan.scan-modes', value: 'standard,deep', purpose: 'Scan depth options' },
              ].map(r => (
                <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(16,185,129,0.08)' }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#10b981', wordBreak: 'break-all' }}>{r.key}</div>
                    <div style={{ fontSize: 9, color: '#2a4a3a', marginTop: 2 }}>{r.purpose}</div>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#4a7a6a', alignSelf: 'center', wordBreak: 'break-all' }}>{r.value}</div>
                </div>
              ))}
            </div>

            {/* Right: 3 capabilities */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                {
                  icon: '🔍', title: 'Service Discovery',
                  desc: 'Agents resolve an ENS name to get the seller wallet address, API URL, pricing, and supported categories. No hardcoded config — update ENS records and every agent discovers the new setup automatically.',
                },
                {
                  icon: '🤖', title: 'ENSIP-25 Agent Registry',
                  desc: 'The audit service is registered under ENSIP-25, a new ENS standard for AI agents. Other agents or marketplaces can query ENS to find all services registered under this standard — decentralized service directory.',
                },
                {
                  icon: '🔄', title: 'Dynamic Configuration',
                  desc: 'If the seller moves to a new server, changes pricing, or adds categories — just update the text records. Zero downtime, zero code changes for agents. The ENS name is the stable anchor.',
                },
              ].map(c => (
                <div key={c.title} style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '20px 18px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2f5ee' }}>{c.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#4a7a6a', lineHeight: 1.7 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow diagram */}
          <div style={{ marginTop: 24, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', marginBottom: 14, fontFamily: 'JetBrains Mono, monospace' }}>AGENT RESOLUTION FLOW</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'audit.kronoscan.eth', sub: 'ENS name' },
                { label: '→', sub: '' },
                { label: '0x7f3a...seller', sub: 'Wallet address' },
                { label: '+', sub: '' },
                { label: 'API URL + pricing + categories', sub: 'Text records' },
                { label: '→', sub: '' },
                { label: 'Agent connects & pays', sub: 'Ready to audit' },
              ].map((step, i) => (
                step.label === '→' || step.label === '+' ? (
                  <span key={i} style={{ fontSize: 16, color: '#10b981', fontWeight: 700 }}>{step.label}</span>
                ) : (
                  <div key={i} style={{ background: 'rgba(6,13,10,0.6)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#e2f5ee', fontWeight: 600 }}>{step.label}</div>
                    {step.sub && <div style={{ fontSize: 9, color: '#4a7a6a', marginTop: 4 }}>{step.sub}</div>}
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ padding: '80px 48px', textAlign: 'center', borderTop: '1px solid rgba(16,185,129,0.1)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 16 }}>Ready to secure your contracts?</h2>
          <p style={{ fontSize: 15, color: '#4a7a6a', marginBottom: 40 }}>From $0.01 per scan. No subscription. Pay only for what you use.</p>
          <div style={{ display: 'inline-block' }}>
            <ClickSpark sparkColor="#34d399" sparkCount={12} sparkRadius={32} sparkSize={8}>
              <button
                onClick={onLaunch}
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', border: 'none', borderRadius: 6, padding: '18px 56px', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'Sora, sans-serif', boxShadow: '0 4px 32px rgba(16,185,129,0.4)', position: 'relative', zIndex: 1 }}
              >
                ⚡ Launch an Analysis
              </button>
            </ClickSpark>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '24px 48px', borderTop: '1px solid rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <KronoScanLogo size={22} />
        <span style={{ fontSize: 13, fontWeight: 700 }}><span style={{ color: '#10b981' }}>Krono</span>Scan</span>
        <span style={{ fontSize: 11, color: '#1a3a2a' }}>ETHGlobal Cannes 2026</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#1a3a2a', fontFamily: 'JetBrains Mono, monospace' }}>ARC · ENS · Circle Nanopayments</span>
      </footer>
    </div>
  );
}
