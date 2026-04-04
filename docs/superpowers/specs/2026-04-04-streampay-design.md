# KronoScan Design Spec

**Date:** 2026-04-04
**Author:** Martin (solo dev) + Claude Code
**Target:** ETHGlobal Cannes 2026 (2-day hackathon, ~10 days prep)
**Sponsors:** Arc ($9K across 2 tracks) + World ($8K) + ENS ($5K) = $22K potential

---

## 1. What We're Building

KronoScan is a per-request payment protocol for AI agents, deployed on Arc blockchain using Circle Nanopayments (x402). The demo use case: **AI-powered smart contract security auditing** — an agent pays per audit category via x402 micropayments, with an on-chain escrow vault managing deposits, identity-based pricing, and automatic refunds.

The protocol combines two primitives:
- **x402 Nanopayments** — real Circle micropayments for each audit request (`GatewayClient.pay()`)
- **StreamVault** — on-chain escrow with identity-conditioned pricing, top-up, session timeout, and automatic refunds

### Core Value Proposition

| | Traditional Audit | Flat-Fee API | KronoScan |
|---|---|---|---|
| Cost | $5,000+ | $0.05 per call | ~$0.001 per category (10 categories) |
| Time | 2 weeks | Instant | Instant |
| Granularity | Fixed scope | Per-call | Per-category |
| Trust | Reputation | None | World ID verified |
| Discovery | Manual | Hardcoded URL | ENS name |
| Refund | Negotiation | None | Automatic on-chain |

---

## 2. Architecture

### Two-Layer Payment Stack

```
Layer 2: StreamVault           (our code — on-chain escrow, tiered pricing, refunds)
Layer 1: x402 + Nanopayments   (Circle — per-request micropayments via GatewayClient)
```

**Layer 1 — x402 + Circle Nanopayments:** Each audit category endpoint is x402-protected. Buyer agent calls `GatewayClient.pay(url)` for each request. Circle handles EIP-3009 signing, batching, and settlement. Real micropayments.

**Layer 2 — StreamVault:** On-chain escrow. Buyer opens a session (deposits USDC), makes multiple x402 requests within that session, coordinator reports consumption on-chain. When done, unused deposit is refunded automatically.

### Five Components

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   BUYER AGENT    │────▶│   COORDINATOR    │────▶│   SELLER API     │
│                  │ WS  │                  │     │  (Audit Scanner) │
│ - World ID proof │     │ - x402 mediation │     │                  │
│ - ENS resolution │     │ - Consumption    │     │ - 10 x402 routes │
│ - GatewayClient  │     │   tracking       │     │ - AgentKit hooks │
│ - SSE consumer   │     │ - Session mgmt   │     │ - SSE findings   │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼                           ▼
          ┌──────────────────┐        ┌──────────────────┐
          │  StreamVault.sol │        │    FRONTEND      │
          │  (Arc testnet)   │        │   (Next.js)      │
          │                  │        │                  │
          │ - Deposit escrow │        │ - Cost counter   │
          │ - Tiered pricing │        │ - Findings panel │
          │ - Top-up         │        │ - Budget left    │
          │ - Session timeout│        │ - Refund summary │
          │ - Auto-refund    │        │                  │
          └──────────────────┘        └──────────────────┘
```

### Transport

| Path | Protocol | Why |
|------|----------|-----|
| Buyer → Seller | HTTP + x402 | Per-request payment via `GatewayClient.pay()` |
| Buyer → Coordinator | WebSocket | Session management, real-time updates |
| Coordinator → StreamVault | viem RPC | `reportConsumption()`, `closeSession()` |
| Coordinator → Frontend | WebSocket | Real-time cost/status updates |
| Seller → Buyer | SSE | Streaming vulnerability findings per category |

---

## 3. StreamVault.sol — Smart Contract

### Responsibilities

1. **Open session** — lock buyer's USDC deposit, record seller, pricing, World ID status
2. **Tiered pricing** — verified buyers get 20% discount (`VERIFIED_DISCOUNT_BPS = 2000`)
3. **Report consumption** — coordinator reports each x402 payment amount on-chain
4. **Solvency check** — `isSolvent(sessionId)` based on `consumedAmount < depositedAmount`
5. **Requests remaining** — `requestsRemaining(sessionId)` = `(deposit - consumed) / effectivePrice`
6. **Top-up** — `topUp(sessionId, amount)` adds USDC without restarting session
7. **Session timeout** — `terminateExpired(sessionId)` permissionless after max session duration (safety net)
8. **Close + refund** — `closeSession(sessionId)` distributes funds: consumed → seller, remainder → buyer

### Key Data

```solidity
struct Session {
    address buyer;
    address seller;
    uint256 pricePerRequest;     // seller's quoted price (USDC 6 decimals)
    uint256 effectivePrice;      // after verification discount
    uint256 depositedAmount;     // total locked (including top-ups)
    uint256 consumedAmount;      // reported by coordinator
    uint256 startTime;
    uint256 closedTime;
    SessionStatus status;        // ACTIVE, CLOSED, TERMINATED
    bool buyerVerified;          // World ID verified
}
```

### Events

- `SessionOpened(sessionId, buyer, seller, pricePerRequest, effectivePrice, deposit, verified)`
- `ConsumptionReported(sessionId, amount, newTotal)`
- `SessionClosed(sessionId, consumed, refunded)`
- `SessionTerminated(sessionId, consumed, refunded)`
- `SessionToppedUp(sessionId, amount, newTotal)`

### Constants

- `MAX_SESSION_DURATION = 3600` — 1 hour max session (safety timeout)
- `VERIFIED_DISCOUNT_BPS = 2000` — 20% discount for World ID verified buyers
- `BPS_BASE = 10000`

### Advanced Stablecoin Logic (Arc "Best Smart Contracts" track)

- **Identity-conditioned pricing:** `_applyDiscount()` computes price on-chain based on World ID boolean. USDC flow changes based on external identity proof.
- **On-chain consumption tracking:** Coordinator reports each x402 payment via `reportConsumption()`. Contract maintains running total. Enables on-chain solvency verification.
- **Session timeout + auto-termination:** `terminateExpired()` is permissionless — anyone can close an expired session. Handles coordinator failure gracefully. Consumed goes to seller, remainder refunded to buyer.
- **Top-up without restart:** `topUp()` extends session budget mid-flow. Prevents premature termination for large audits.
- **`requestsRemaining()` view:** Frontend shows "N requests left", enabling proactive top-up.

### Dependencies

- OpenZeppelin `SafeERC20` (via `forge install`)
- Deployed on Arc testnet

### Size

~180 lines. Focused but with genuinely sophisticated programmable stablecoin logic.

---

## 4. Coordinator — Session Manager

### State

```typescript
interface ActiveSession {
  sessionId: Hex;
  buyer: Address;
  seller: Address;
  pricePerRequest: bigint;
  effectivePrice: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number;
  status: 'OPENING' | 'ACTIVE' | 'CLOSING' | 'CLOSED' | 'TERMINATED';
  requestCount: number;
  totalConsumed: bigint;
  completedCategories: string[];
}
```

In-memory `Map<string, ActiveSession>`. No database. Single process.

### Responsibilities

1. **Session lifecycle** — manages `IDLE → OPENING → ACTIVE → CLOSING → CLOSED/TERMINATED`
2. **x402 payment mediation** — buyer agent makes x402 requests through coordinator to seller endpoints
3. **Consumption tracking** — after each successful x402 payment, calls `StreamVault.reportConsumption()` on-chain
4. **Solvency monitoring** — reads `isSolvent()` + `requestsRemaining()` periodically, pushes to frontend
5. **Session close** — calls `StreamVault.closeSession()` to distribute funds + trigger refund
6. **Real-time updates** — WebSocket pushes to frontend: cost updates, findings, status changes

### What's NOT Here

- No database — in-memory only
- No auth/sessions — single-user demo
- No Redis/queue — single process handles everything
- No custom EIP-3009 signing — Circle's GatewayClient handles all payment signatures

---

## 5. Seller API — Audit Scanner

### 10 Audit Category Endpoints

Each endpoint is x402-protected. Returns `402 Payment Required` without payment, streams findings with valid payment.

| # | Endpoint | Category | What it checks |
|---|----------|----------|----------------|
| 1 | `POST /api/audit/reentrancy` | Reentrancy | Cross-function, read-only, cross-contract reentrancy |
| 2 | `POST /api/audit/access-control` | Access Control | Missing modifiers, privilege escalation, centralization |
| 3 | `POST /api/audit/arithmetic` | Arithmetic/Precision | Overflow, rounding, division-before-multiply |
| 4 | `POST /api/audit/external-calls` | External Call Safety | Unchecked returns, untrusted targets, delegatecall |
| 5 | `POST /api/audit/token-standards` | Token Standards | ERC20/721/1155 compliance, approval patterns |
| 6 | `POST /api/audit/business-logic` | Business Logic | State machine flaws, economic exploits, MEV |
| 7 | `POST /api/audit/gas-optimization` | Gas/Optimization | Storage packing, loop efficiency, calldata usage |
| 8 | `POST /api/audit/code-quality` | Code Quality | Missing events, magic numbers, naming |
| 9 | `POST /api/audit/compiler` | Compiler/Version | Pragma issues, known compiler bugs |
| 10 | `POST /api/audit/defi` | DeFi-Specific | Oracle manipulation, flash loans, slippage |

### x402 Flow Per Endpoint

```
Buyer → POST /api/audit/reentrancy (no payment header)
Seller → 402 { pricePerRequest: 100, scheme: "exact", ... }
Buyer → GatewayClient.pay(url) → POST with PAYMENT-SIGNATURE header
Seller → 200 SSE stream of findings for that category
```

### Request Body

Each endpoint accepts two input modes:
```json
{ "contractSource": "pragma solidity ^0.8.30; ..." }
```
OR:
```json
{ "contractAddress": "0x7f3a...", "chain": "arc-testnet" }
```

For address mode, the seller API calls the block explorer API to fetch verified source code. If the contract is not verified, returns `400 { error: "Contract not verified" }`.

### Findings Source

Two options (decided during implementation):
- **DeepSeek API** — free LLM for actual analysis. Prompt per category. Real findings.
- **Pre-written fallback** — hand-crafted findings per category matched to sample contract. Used if DeepSeek is unreliable.

### Mock Data Requirements (if using pre-written)

- 8-12 pre-written findings across categories matched to a sample vulnerable contract
- Findings must reference real vulnerability patterns
- The sample contract is displayed in the dashboard — findings must be accurate to it
- Severity distribution: ~3 Critical, ~2 High, ~4 Medium, ~3 Low

### AgentKit Integration Point

Seller uses `createAgentkitHooks()` from `@worldcoin/agentkit` to verify buyer agent is registered in AgentBook before serving findings. This is the "meaningful distinction" required for the $8K World prize.

Trust tiers: verified agents get full detailed findings, unverified agents get summary only.

---

## 6. Buyer Agent — Demo Audit Script

### Flow

1. World ID verification (IDKitWidget proof pre-stored or Cloud API)
2. ENS resolution: `audit.kronoscan.eth` → seller address (viem on Sepolia)
3. Service discovery: POST to seller → get 402 with pricing
4. Open session: `StreamVault.openSession()` with deposit + verification boolean
5. Loop through 10 audit categories:
   - `GatewayClient.pay(categoryUrl)` — real x402 micropayment
   - Coordinator records consumption on-chain via `reportConsumption()`
   - Receive findings via SSE, forward to frontend
6. Close session: Coordinator calls `StreamVault.closeSession()`
7. Dashboard shows refund amount + ArcScan links

### Orchestration

Agent is triggered by "Run Audit" button on frontend. Coordinator orchestrates the flow. All state flows back to frontend via WebSocket. Not a separate CLI process.

---

## 7. Frontend Dashboard

Single-page Next.js app. The demo centerpiece.

### Layout

**Header:** KronoScan logo, "Arc Testnet" network indicator

**Agent Identity Card:**
- Wallet address (truncated)
- World ID status: "Verified" (green) or "Unverified" (yellow)
- Target: `audit.kronoscan.eth` (ENS name with resolved address tooltip)

**Contract Input Panel:** Toggle between "Paste Source" (textarea) and "On-Chain Address" (address input + chain selector). For address mode, the resolved source is displayed after fetch.

**Session Control:** "Run Audit" button, status pill (IDLE → OPENING → ACTIVE → CLOSING → CLOSED)

**Live Metrics (visible during ACTIVE):**
- Cost counter: `$0.0010` jumping up per completed category (large font)
- Rate: "Base: $0.0001/req → Effective: $0.00008/req (Verified -20%)"
- Budget remaining bar (deposit - consumed)
- Requests remaining: "7 of 10 categories left"
- Category progress: checklist of 10 categories with checkmarks

**Findings Panel:**
- Vulnerability findings appear per-category with severity badges
- CRITICAL (red), HIGH (orange), MEDIUM (yellow), LOW (blue)
- Each finding: severity, title, line number, description
- Grouped by audit category

**Result Card (after CLOSED):**
- Findings summary: "3 Critical, 2 High, 4 Medium, 3 Low"
- Categories completed: 10/10
- Total cost: $0.0010
- Refund: $0.9990
- ArcScan links (SessionOpened event + refund tx)
- Comparison: "Traditional audit: $5,000+ / 2 weeks | KronoScan: $0.001 / 30 seconds"

### Tech

- Next.js App Router
- WebSocket to Coordinator for real-time state
- SSE for findings (proxied through Coordinator)
- viem for ENS resolution + on-chain reads
- Tailwind CSS — clean, minimal. Data is the hero.

---

## 8. ENS Integration

### What Gets Registered (Sepolia testnet)

- `audit.kronoscan.eth` — the mock audit service
- Text records:
  - `description`: "AI-powered smart contract security scanner"
  - `url`: seller API endpoint
  - `agent-registration[kronoscan][audit-1]`: ENSIP-25 agent registry entry

### Resolution Flow

1. Buyer agent resolves `audit.kronoscan.eth` via viem ENS on Sepolia
2. Gets seller address + reads text records for metadata
3. Dashboard displays ENS name everywhere

### Prize Positioning

"Without ENS, agents need hardcoded addresses. With ENS + text records + ENSIP-25, agents discover audit services by name, read their capabilities, and verify their identity — a service registry for the agentic economy."

---

## 9. World ID / AgentKit Integration

### Two Integration Points

**Buyer side — IDKitWidget + Cloud API:**
1. Frontend: "Verify with World ID" button (`@worldcoin/idkit` React widget)
2. User scans with World App on phone
3. Frontend receives proof → sends to backend
4. Backend verifies via `POST https://developer.worldcoin.org/api/v2/verify/{app_id}`
5. Boolean `worldIdVerified` passed to `StreamVault.openSession()`
6. On-chain: verified buyers get 20% price discount

**Seller side — AgentKit hooks:**
1. Seller endpoint uses `createAgentkitHooks()` from `@worldcoin/agentkit`
2. On x402 payment, seller verifies buyer agent is in AgentBook
3. `createAgentBookVerifier()` resolves wallet → human ID
4. Seller decides whether to serve based on verification

### Cross-Chain

- World ID verification: offchain (Cloud API) — no chain dependency
- AgentKit registration: Base Sepolia (where AgentBook is deployed)
- StreamVault: Arc testnet
- No cross-chain wallet needed. Only the boolean touches Arc.

### Security Audit Trust Story

"Should I trust this anonymous agent with my vulnerability findings?" Verified agents have a human accountable for responsible disclosure. Unverified agents might scrape vulnerability data for exploits.

### Prerequisites

- `app_id` from [World Developer Portal](https://developer.worldcoin.org) (free)
- World App on phone for verification
- `npx @worldcoin/agentkit-cli register <agent-address>` for agent registration

---

## 10. What Gets Mocked vs Real

| Component | Real | Mocked |
|-----------|------|--------|
| StreamVault.sol | Deployed on Arc testnet, real USDC interactions | — |
| x402 payments | Real `GatewayClient.pay()` per audit category | — |
| Circle Nanopayments | Real EIP-3009 via GatewayClient, real batching | Settlement timing may vary |
| Gateway Wallet deposit | Real on-chain deposit | — |
| World ID verification | Real IDKitWidget + Cloud API verification | — |
| ENS resolution | Real resolution on Sepolia testnet | — |
| On-chain source resolution | Real block explorer API call, real verified source fetch | — |
| AI security scanning | DeepSeek API for real analysis (if reliable) | Pre-written findings as fallback |

---

## 11. Demo Script (90 seconds)

**[0:00]** Dashboard shows contract input with two modes. Agent wallet: $1.00 USDC.

*"This is an AI auditing agent with $1 of USDC on Arc. It's backed by a World ID — a verified human is accountable. It needs to scan this contract for vulnerabilities across 10 audit categories."*

**[0:10]** Click "Run Audit".
```
Resolving audit.kronoscan.eth → 0x7f3a...
402 Payment Required — Price: $0.0001/request
World ID Verified — discount applied: $0.00008/request (20% off)
Session opened — 10 categories, budget: $1.00 [ArcScan link]
```

**[0:15]** Categories run sequentially. Each one:
```
🔍 Reentrancy Analysis... paying $0.00008 via x402 ✅
  🔴 CRITICAL: Reentrancy in withdraw() — state updated after external call (line 47)
🔍 Access Control... paying $0.00008 via x402 ✅
  🟠 HIGH: Missing onlyOwner modifier on setPrice() (line 23)
🔍 Arithmetic... paying $0.00008 via x402 ✅
  🟡 MEDIUM: Division before multiplication in calculateFee() (line 56)
```

*"Each category is a separate x402 micropayment through Circle Nanopayments. Real payments, real batching, sub-cent costs. 10 requests batched into a single on-chain settlement."*

**[0:45]** All 10 categories complete. Session closes.
```
✅ 12 findings (3 Critical, 2 High, 4 Medium, 3 Low)
   10 categories | 30 seconds | Cost: $0.0008 | Refund: $0.9992
   Verified savings: 20% discount applied
   Settlement: 10 nanopayments batched [ArcScan link]
```

*"30 seconds. 12 vulnerabilities found across 10 categories. Total cost: $0.0008. Traditional audit: $5,000 and two weeks. The unused deposit — $0.9992 — refunded automatically on-chain."*

**[1:05]** Click through ArcScan links. Show SessionOpened event and refund tx.

*"10 real micropayments batched by Circle Nanopayments. Identity-conditioned pricing via World ID. Service discovered by ENS name. This is what agentic commerce looks like."*

---

## 12. File Structure

```
kronoscan/
├── src/StreamVault.sol
├── test/StreamVault.t.sol
├── script/Deploy.s.sol
├── lib/                            # forge install deps
├── foundry.toml
├── coordinator/
│   └── src/
│       ├── index.ts                # Express + WS server
│       ├── sessionManager.ts       # Session lifecycle
│       ├── vaultClient.ts          # StreamVault on-chain interactions
│       ├── abi.ts                  # StreamVault ABI
│       ├── types.ts                # Shared types
│       ├── errors.ts               # Custom error classes
│       ├── ensResolver.ts          # ENS resolution
│       └── worldId.ts              # World ID Cloud API verification
├── seller-api/
│   └── src/
│       ├── index.ts                # Express + x402 middleware
│       ├── categories/             # 10 audit category handlers
│       │   ├── reentrancy.ts
│       │   ├── accessControl.ts
│       │   ├── arithmetic.ts
│       │   ├── externalCalls.ts
│       │   ├── tokenStandards.ts
│       │   ├── businessLogic.ts
│       │   ├── gasOptimization.ts
│       │   ├── codeQuality.ts
│       │   ├── compiler.ts
│       │   └── defi.ts
│       ├── sourceResolver.ts       # Fetch verified source from block explorer
│       └── findings.ts             # Pre-written findings (fallback)
├── agent/
│   └── src/
│       ├── index.ts                # Demo audit agent
│       ├── sessionClient.ts        # KronoScan client SDK
│       ├── wallet.ts               # Agent wallet management
│       └── sampleContract.ts       # Vulnerable contract for demo
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Main dashboard
│   │   └── components/
│   │       ├── CostMeter.tsx
│   │       ├── CategoryProgress.tsx
│   │       ├── FindingsPanel.tsx
│   │       ├── AgentIdentity.tsx
│   │       └── RefundSummary.tsx
│   └── next.config.js
├── CLAUDE.md
└── docs/superpowers/specs/         # This spec
```

---

## 13. Implementation Phases

### Phase 1: Smart Contract + Core (Days 1-3)
1. StreamVault.sol refactor — rename fields, add `consumedAmount`, `reportConsumption()`, `terminateExpired()`
2. Update Foundry tests for new contract interface
3. Deploy to Arc testnet
4. Coordinator refactor — session manager (was stream manager), consumption tracking
5. Seller API — 10 x402-protected audit category endpoints

**Milestone:** End-to-end audit flow: open session → 10 x402 payments → findings → close → refund.

### Phase 2: Dashboard (Days 4-5)
6. Next.js dashboard — cost counter, category progress, findings panel, refund display
7. Sample vulnerable contract + findings (DeepSeek or pre-written)

**Milestone:** Visual audit demo running in browser.

### Phase 3: World ID (Days 6-7)
8. IDKitWidget + Cloud API verification in frontend/backend
9. AgentKit hooks on seller side
10. Trust tier UI (verified badge + price discount visible)

**Milestone:** World ID badge + discount visible in demo flow.

### Phase 4: ENS (Days 8-9)
11. Register `audit.kronoscan.eth` on Sepolia + ENSIP-25 text records
12. ENS resolution in coordinator
13. ENS names in dashboard

**Milestone:** `audit.kronoscan.eth` visible in demo flow.

### Phase 5: Polish (Day 10)
14. Demo script rehearsal
15. Video recording
16. README + architecture diagram
17. ArcScan link verification

---

## 14. Key Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Circle GatewayClient not available on Arc testnet | Medium | Mock x402 layer; real contract interactions still work |
| World AgentKit not on Arc testnet | Confirmed | Offchain verification via Cloud API; boolean passed to Arc |
| DeepSeek API unreliable during demo | Medium | Pre-written findings as fallback, toggle in config |
| 10 endpoints feels repetitive in demo | Low | Run categories in parallel or show progress bar; each takes 2-3s |
| Gateway Wallet not deployed on Arc testnet | Low | Verify early; fallback to direct USDC approve+deposit |

---

## 15. Success Criteria

- [ ] End-to-end demo runs without manual intervention (click "Run Audit" → 10 categories → findings → refund)
- [ ] StreamVault deployed on Arc testnet with session management + consumption tracking
- [ ] x402 payments working: real `GatewayClient.pay()` per category
- [ ] Tiered pricing visible: verified vs unverified price difference shown in dashboard
- [ ] World ID verification via IDKitWidget working
- [ ] ENS resolution working: `audit.kronoscan.eth` displayed, not raw address
- [ ] Cost comparison compelling: "$5K+ / 2 weeks vs $0.001 / 30 seconds"
- [ ] ArcScan links work and show real on-chain events
- [ ] 90-second demo rehearsed and smooth
