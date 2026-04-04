# StreamPay Design Spec

**Date:** 2026-04-04
**Author:** Martin (solo dev) + Claude Code
**Target:** ETHGlobal Cannes 2026 (2-day hackathon, ~10 days prep)
**Sponsors:** Arc ($9K across 2 tracks) + World ($8K) + ENS ($5K) = $22K potential

---

## 1. What We're Building

StreamPay is a per-second payment streaming protocol for AI agents, deployed on Arc blockchain. The demo use case: **AI-powered smart contract security auditing** — an agent pays per second of scan time to audit a Solidity contract for vulnerabilities.

The protocol extends x402 (Circle's HTTP-native payment protocol) from per-request to per-second streaming. This is the novel contribution.

### Core Value Proposition

| | Traditional Audit | Flat-Fee API | StreamPay |
|---|---|---|---|
| Cost | $5,000+ | $0.05 per call | $0.0024 (pay for 30s used) |
| Time | 2 weeks | Instant | Instant |
| Granularity | Fixed scope | Per-call | Per-second |
| Trust | Reputation | None | World ID verified |
| Discovery | Manual | Hardcoded URL | ENS name |
| Refund | Negotiation | None | Automatic on-chain |

---

## 2. Architecture

### Three-Layer Payment Stack

```
Layer 3: StreamPay Streaming    (our code — per-second tick loop)
Layer 2: x402 Protocol          (handshake — price discovery + initial auth)
Layer 1: Circle Gateway         (infrastructure — deposit, settlement, withdrawal)
```

**Layer 1 — Circle Gateway:** Buyer deposits USDC into Gateway Wallet contract on Arc testnet. One-time setup. Gateway Wallet address: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`.

**Layer 2 — x402 Handshake:** Buyer hits seller endpoint, gets `402 Payment Required` with pricing. Signs initial EIP-3009 authorization. Connection opens.

**Layer 3 — StreamPay Streaming:** Every second, buyer signs a new EIP-3009 authorization and sends to Coordinator via WebSocket. Coordinator validates, checks solvency on-chain, collects signatures for batch settlement. Seller streams findings via SSE as long as payment flows.

### Five Components

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   BUYER AGENT    │────▶│   COORDINATOR    │────▶│   SELLER API     │
│                  │ WS  │                  │     │  (Mock Scanner)  │
│ - World ID proof │     │ - Auth validator │     │                  │
│ - ENS resolution │     │ - Solvency watch │     │ - x402 + AgentKit│
│ - EIP-3009 sigs  │     │ - Stream lifecycle│    │ - SSE findings   │
│ - SSE consumer   │     │ - Settlement batch│    │                  │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼                           ▼
          ┌──────────────────┐        ┌──────────────────┐
          │  StreamVault.sol │        │    FRONTEND      │
          │  (Arc testnet)   │        │   (Next.js)      │
          │                  │        │                  │
          │ - Tiered pricing │        │ - Cost counter   │
          │ - Top-up         │        │ - Findings panel │
          │ - Grace period   │        │ - Time remaining │
          │ - Auto-terminate │        │ - Refund summary │
          └──────────────────┘        └──────────────────┘
```

### Transport

| Path | Protocol | Why |
|------|----------|-----|
| Buyer → Coordinator | WebSocket | Per-second auth sigs need low latency |
| Coordinator → Seller | HTTP/WS | Seller checks `isStreamActive` |
| Coordinator → Frontend | WebSocket | Real-time cost/status updates |
| Coordinator → StreamVault | viem RPC | `isSolvent()`, `timeRemaining()` reads, `closeStream()` writes |
| Seller → Buyer (via Coordinator) | SSE | Streaming vulnerability findings |

---

## 3. StreamVault.sol — Smart Contract

### Responsibilities

1. **Register stream** — buyer, seller, rate, deposit, World ID status
2. **Tiered pricing** — verified buyers get 20% discount (`VERIFIED_DISCOUNT_BPS = 2000`)
3. **Solvency check** — `isSolvent(streamId)` based on deposit vs elapsed * effectiveRate
4. **Top-up** — `topUp(streamId, amount)` adds USDC without restarting stream
5. **Auto-termination** — `terminateInsolvency(streamId)` permissionless after 30s grace period
6. **Close + refund** — `closeStream(streamId, actualConsumed)` distributes funds

### Key Data

```solidity
struct Stream {
    address buyer;
    address seller;
    uint256 baseRatePerSecond;   // seller's quoted rate (USDC 6 decimals)
    uint256 effectiveRate;       // after verification discount
    uint256 depositedAmount;     // total locked (including top-ups)
    uint256 startTime;
    uint256 closedTime;
    StreamStatus status;         // ACTIVE, CLOSED, TERMINATED
    bool buyerVerified;          // World ID verified
}
```

### Events

- `StreamOpened(streamId, buyer, seller, baseRate, effectiveRate, deposit, verified)`
- `StreamClosed(streamId, consumed, refunded)`
- `StreamTerminated(streamId, consumed, refunded)`
- `StreamToppedUp(streamId, amount, newTotal)`

### Constants

- `GRACE_PERIOD = 30` — seconds before permissionless termination
- `VERIFIED_DISCOUNT_BPS = 2000` — 20% discount for World ID verified buyers
- `BPS_BASE = 10000`

### Advanced Stablecoin Logic (Arc "Best Smart Contracts" track)

- **Identity-conditioned pricing:** `_applyDiscount()` computes rate on-chain based on World ID boolean. USDC flow changes based on external identity proof.
- **Grace period + auto-termination:** `terminateInsolvency()` is permissionless but respects grace period. Closes at exact insolvency timestamp, not call time — seller gets exactly what was earned.
- **Top-up without restart:** `topUp()` extends stream duration mid-flow. Prevents premature termination for long-running scans.
- **`timeRemaining()` view:** Frontend shows countdown, enabling proactive top-up.

### Dependencies

- OpenZeppelin `SafeERC20` (via `forge install`)
- Deployed on Arc testnet

### Size

~150 lines. Focused but with genuinely sophisticated programmable stablecoin logic.

---

## 4. Coordinator — Traffic Controller

### State

```typescript
interface ActiveStream {
  streamId: string;
  buyer: Address;
  seller: Address;
  baseRate: bigint;
  effectiveRate: bigint;
  verified: boolean;
  startTime: number;
  authorizations: EIP3009Auth[];
  totalConsumed: bigint;
  status: 'OPENING' | 'ACTIVE' | 'CLOSING' | 'CLOSED' | 'TERMINATED';
}
```

In-memory `Map<string, ActiveStream>`. No database. Single process.

### Responsibilities

1. **x402 handshake mediation** — validates initial payment sig, opens stream on-chain, signals seller
2. **Per-second tick receiver** — validates each EIP-3009 sig (correct from/to/value/validBefore), updates consumed total
3. **Solvency watchdog** — calls `StreamVault.isSolvent()` every 5-10s, pushes `timeRemaining()` to frontend
4. **Settlement batching** — collects valid signatures, forwards to Circle Nanopayments API (or logs as "ready for settlement" if API unavailable)
5. **Stream lifecycle** — manages `IDLE → OPENING → ACTIVE → CLOSING → CLOSED/TERMINATED`

### What's NOT Here

- No database — in-memory only
- No auth/sessions — single-user demo
- No Redis/queue — single process handles everything

---

## 5. Seller API — Mock Audit Scanner

### Endpoints

**`POST /api/audit` (unauthenticated) → 402:**
```json
{
  "paymentRequired": true,
  "scheme": "exact",
  "baseRatePerSecond": 100,
  "network": "arc-testnet",
  "sellerAddress": "0x...",
  "sellerENS": "audit.streampay.eth",
  "acceptsUnverified": true,
  "coordinatorUrl": "ws://localhost:3001"
}
```

**`POST /api/audit` (authenticated, valid stream) → SSE:**

Request body accepts two input modes:
```json
{ "contractSource": "pragma solidity ^0.8.30; ..." }
```
OR:
```json
{ "contractAddress": "0x7f3a...", "chain": "arc-testnet" }
```

For address mode, the seller API calls the block explorer API to fetch verified source code:
```
GET https://<explorer-api>/api?module=contract&action=getsourcecode&address=0x...&apikey=KEY
```
If the contract is not verified, returns `400 { error: "Contract not verified" }`. No bytecode decompilation.

Streams pre-written vulnerability findings one by one:
```json
{ "severity": "CRITICAL", "title": "Reentrancy in withdraw()", "line": 47, "desc": "State updated after external call" }
{ "severity": "HIGH", "title": "Unchecked return value", "line": 83, "desc": "transfer() return not checked" }
```

Each finding streamed every ~2 seconds. Seller checks `isStreamActive` before each finding.

The mock scanner ignores the actual source content — findings are pre-written. The resolved/pasted source is displayed in the dashboard so judges can see what's being "scanned." The on-chain address resolution is real — it demonstrates the "audit any deployed contract" capability.

### Mock Data Requirements

- 8-12 pre-written findings matched to a sample vulnerable contract
- Findings must reference real vulnerability patterns (reentrancy, unchecked calls, access control, missing events)
- The sample contract is displayed in the dashboard — findings must be accurate to it
- Severity distribution: ~3 Critical, ~2 High, ~4 Medium, ~3 Low

### AgentKit Integration Point

Seller uses `createAgentkitHooks()` from `@worldcoin/agentkit` to verify buyer agent is registered in AgentBook before serving findings. This is the "meaningful distinction" required for the $8K World prize.

Trust tiers: verified agents get full detailed findings, unverified agents could get summary only.

---

## 6. Buyer Agent — Demo Audit Script

### Flow

1. World ID verification (IDKitWidget proof pre-stored or Cloud API)
2. ENS resolution: `audit.streampay.eth` → seller address (viem on Sepolia)
3. Service discovery: POST to seller → get 402 with pricing
4. Gateway deposit: USDC into Gateway Wallet on Arc (one-time, may already be done)
5. Open stream: `StreamVault.openStream()` with deposit, rate, verification boolean
6. Tick loop: every 1s, sign EIP-3009 auth with viem, send to Coordinator via WebSocket
7. Consume SSE: read vulnerability findings from seller, forward to frontend — request body includes either `contractSource` (pasted source) or `contractAddress` + `chain` (on-chain address for verified source fetch)
8. Close: when SSE ends, stop tick loop, Coordinator calls `StreamVault.closeStream()`

### Orchestration

Agent is triggered by "Run Audit" button on frontend. Coordinator orchestrates the flow. All state flows back to frontend via WebSocket. Not a separate CLI process.

---

## 7. Frontend Dashboard

Single-page Next.js app. The demo centerpiece.

### Layout

**Header:** StreamPay logo, "Arc Testnet" network indicator

**Agent Identity Card:**
- Wallet address (truncated)
- World ID status: "Verified" (green) or "Unverified" (yellow)
- Target: `audit.streampay.eth` (ENS name with resolved address tooltip)

**Contract Input Panel:** Toggle between "Paste Source" (textarea) and "On-Chain Address" (address input + chain selector). For address mode, the resolved source is displayed after fetch. Shows "Fetching verified source..." during resolution.

**Stream Control:** "Run Audit" button, status pill (IDLE → OPENING → ACTIVE → CLOSING → CLOSED)

**Live Metrics (visible during ACTIVE):**
- Cost counter: `$0.0024` ticking up every second (large font)
- Rate: "Base: $0.0001/s → Effective: $0.00008/s (Verified -20%)"
- Time remaining countdown bar
- Deposit progress bar
- Auth count: "30 authorizations sent"

**Findings Panel:**
- Vulnerability findings appear one-by-one with severity badges
- CRITICAL (red), HIGH (orange), MEDIUM (yellow), LOW (blue)
- Each finding: severity, title, line number, description

**Result Card (after CLOSED):**
- Findings summary: "3 Critical, 2 High, 4 Medium, 3 Low"
- Duration: 30 seconds
- Total cost: $0.0024
- Refund: $0.9976
- ArcScan links (StreamOpened event + refund tx)
- Comparison: "Traditional audit: $5,000+ / 2 weeks | StreamPay: $0.0024 / 30 seconds"

### Tech

- Next.js App Router
- WebSocket to Coordinator for real-time state
- SSE for findings (proxied through Coordinator)
- viem for ENS resolution + on-chain reads
- Tailwind CSS — clean, minimal. Data is the hero.

---

## 8. ENS Integration

### What Gets Registered (Sepolia testnet)

- `audit.streampay.eth` — the mock audit service
- Text records:
  - `description`: "AI-powered smart contract security scanner"
  - `url`: seller API endpoint
  - `agent-registration[streampay][audit-1]`: ENSIP-25 agent registry entry

### Resolution Flow

1. Buyer agent resolves `audit.streampay.eth` via viem ENS on Sepolia
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
5. Boolean `worldIdVerified` passed to `StreamVault.openStream()`
6. On-chain: verified buyers get 20% rate discount

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
| EIP-3009 signatures | Cryptographically valid, signed with viem | — |
| Gateway Wallet deposit | Real on-chain deposit | — |
| x402 handshake | Real 402 response + PAYMENT-SIGNATURE header | — |
| World ID verification | Real IDKitWidget + Cloud API verification | — |
| ENS resolution | Real resolution on Sepolia testnet | — |
| On-chain source resolution | Real block explorer API call, real verified source fetch | — |
| Circle Nanopayments batch settlement | — | Signatures collected but batch API forwarding may be simulated |
| AI security scanning | — | Pre-written findings streamed via SSE |

---

## 11. Demo Script (90 seconds)

**[0:00]** Dashboard shows sample vulnerable Solidity contract. Agent wallet: $1.00 USDC.

*"This is an AI auditing agent with $1 of USDC on Arc. It's backed by a World ID. It needs to scan this contract for vulnerabilities."*

**[0:10]** Click "Run Audit".
```
Resolving audit.streampay.eth → 0x7f3a...
402 Payment Required — Base rate: $0.0001/sec
World ID Verified — discount applied: $0.00008/sec (20% off)
Stream opened [ArcScan link]
```

**[0:20]** Findings stream in live with severity badges.

**[0:45]** Scan complete.
```
12 findings | 30 seconds | $0.0024 | Refund: $0.9976
Traditional audit: $5,000+ / 2 weeks
```

**[1:05]** Show ArcScan links. Close.

---

## 12. File Structure

```
streampay/
├── src/StreamVault.sol
├── test/StreamVault.t.sol
├── script/Deploy.s.sol
├── lib/                            # forge install deps
├── foundry.toml
├── coordinator/
│   └── src/
│       ├── index.ts                # Express + WS server
│       ├── streamManager.ts        # Stream lifecycle
│       ├── authValidator.ts        # EIP-3009 validation
│       ├── nanopayments.ts         # Circle Nanopayments client
│       ├── ensResolver.ts          # ENS resolution
│       └── worldId.ts              # World ID Cloud API verification
├── seller-api/
│   └── src/
│       ├── index.ts                # Express + SSE audit endpoint
│       ├── x402Handler.ts          # 402 payment negotiation
│       ├── sourceResolver.ts       # Fetch verified source from block explorer (address → source)
│       └── findings.ts             # Pre-written vulnerability findings
├── agent/
│   └── src/
│       ├── index.ts                # Demo audit agent
│       ├── streamClient.ts         # StreamPay client SDK
│       ├── wallet.ts               # Agent wallet management
│       └── sampleContract.ts       # Vulnerable contract for demo
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Main dashboard
│   │   └── components/
│   │       ├── CostMeter.tsx
│   │       ├── StreamStatus.tsx
│   │       ├── FindingsPanel.tsx
│   │       ├── AgentIdentity.tsx
│   │       └── RefundSummary.tsx
│   └── next.config.js
├── CLAUDE.md
└── docs/superpowers/specs/         # This spec
```

---

## 13. Implementation Phases

### Phase 1: Core streaming (Days 1-3)
1. StreamVault.sol + Foundry tests (tiered pricing, top-up, grace period, auto-termination)
2. Deploy to Arc testnet
3. Coordinator — stream lifecycle + per-second auth validation
4. Seller API — x402 endpoint + SSE vulnerability findings
5. Buyer Agent — audit agent that opens stream, ticks, closes

**Milestone:** End-to-end audit flow working in terminal output.

### Phase 2: Dashboard (Days 4-5)
6. Next.js dashboard — cost counter, findings panel, stream status, refund display
7. Sample vulnerable contract + pre-written findings

**Milestone:** Visual audit demo running in browser.

### Phase 3: World ID (Days 6-7)
8. IDKitWidget + Cloud API verification in frontend/backend
9. AgentKit hooks on seller side
10. Trust tier UI (verified badge + rate discount visible)

**Milestone:** World ID badge + discount visible in demo flow.

### Phase 4: ENS (Days 8-9)
11. Register `audit.streampay.eth` on Sepolia + ENSIP-25 text records
12. ENS resolution in coordinator
13. ENS names in dashboard

**Milestone:** `audit.streampay.eth` visible in demo flow.

### Phase 5: Polish (Day 10)
14. Demo script rehearsal
15. Video recording
16. README + architecture diagram
17. ArcScan link verification

---

## 14. Key Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Circle Nanopayments batch API inaccessible | Medium | Mock settlement; real EIP-3009 signatures still collected |
| World AgentKit not on Arc testnet | Confirmed | Offchain verification via Cloud API; boolean passed to Arc |
| Mock findings look unconvincing | Low | Pre-write findings against a real vulnerable contract; test with Solidity devs |
| Too many components for solo dev | Medium | Phase 1 core is the priority; World ID + ENS are additive |
| Gateway Wallet not deployed on Arc testnet | Low | Verify early; fallback to direct USDC approve+deposit |

---

## 15. Success Criteria

- [ ] End-to-end demo runs without manual intervention (click "Run Audit" → findings stream → refund shown)
- [ ] StreamVault deployed on Arc testnet with all 6 functions working
- [ ] Tiered pricing visible: verified vs unverified rate difference shown in dashboard
- [ ] World ID verification via IDKitWidget working
- [ ] ENS resolution working: `audit.streampay.eth` displayed, not raw address
- [ ] Cost comparison compelling: "$5K+ / 2 weeks vs $0.0024 / 30 seconds"
- [ ] ArcScan links work and show real on-chain events
- [ ] 90-second demo rehearsed and smooth
