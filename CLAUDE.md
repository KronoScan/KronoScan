# KronoScan — CLAUDE.md

## What is this file?

This is the master context file for the KronoScan project. It contains everything you need to understand what we're building, why, and how. Read this fully before doing anything.

---

## Commands

| Command | Description |
|---------|-------------|
| `forge build` | Compile contracts |
| `forge test` | Run Solidity tests |
| `forge test -vvv` | Run tests with verbose trace |
| `forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC --broadcast` | Deploy to Arc testnet |
| `cd coordinator && npm run dev` | Start coordinator server |
| `cd seller-api && npm run dev` | Start seller API |
| `cd agent && npx tsx src/index.ts` | Run buyer agent demo |
| `cd frontend && npm run dev` | Start Next.js dashboard |

## Environment

Required env vars (create `.env` in project root):
- `PRIVATE_KEY` — deployer/agent wallet private key (MetaMask export)
- `ARC_TESTNET_RPC` — Arc testnet RPC URL
- `USDC_ADDRESS` — USDC contract address on Arc testnet
- `COORDINATOR_ADDRESS` — coordinator wallet address (for StreamVault deployment)
- `COORDINATOR_URL` — coordinator backend URL (default: `http://localhost:3001`)
- `SELLER_API_URL` — seller API URL (default: `http://localhost:3002`)
- `ETHERSCAN_API_KEY` — block explorer API key (for fetching verified contract source from on-chain addresses)

## Code Style

- Solidity: `^0.8.30`, Foundry for build/test/deploy
- TypeScript: ESM, strict mode
- Use `viem` for EVM interactions (not ethers.js) — matches Circle SDK (`@circle-fin/x402-batching` uses viem)

## Gotchas

- Arc testnet uses USDC as native gas token — no ETH needed, agents hold only USDC
- Circle Nanopayments requires no API key — just a wallet + `@circle-fin/x402-batching` SDK
- x402 is per-request (`GatewayClient.pay(url)`), NOT per-second streaming — each audit category endpoint is a separate payment
- World AgentKit supports Base Sepolia testnet, NOT Arc testnet — verification happens off-Arc, boolean passed to StreamVault
- The seller API has 10 x402-protected audit category endpoints. Findings can use DeepSeek API for real analysis or fall back to pre-written findings.
- **On-chain audit input:** The seller API accepts EITHER raw Solidity source OR a contract address. For addresses, it fetches verified source from the block explorer API (Etherscan-compatible). If the contract is not verified, it returns an error — no bytecode decompilation.
- `GatewayClient.pay()` handles all EIP-3009 signing automatically — no custom signature logic needed
- `validBefore` on EIP-3009 authorizations must be at least 3 days in the future (not 5 seconds)

---

## Who is Martin?

Martin is a solo developer preparing for **ETHGlobal Cannes 2026** (2-day hackathon). He has ~10 days of prep time before the event. He codes in VSCode using WSL on Windows. He has ~2 months of experience building **StabL**, an intent-based payment gateway on Arc blockchain (Solidity + TypeScript + Redis Streams). His prior codebase includes `IntentVault.sol`, `PaymentPool.sol`, `BatchSettler.sol` — patterns that transfer directly to this project.

Martin uses Claude Chat for architecture/brainstorming and Claude Code for implementation. This file is the bridge between those two workflows.

---

## The Project: KronoScan — Verified Agent Commerce

### One-sentence pitch

**AI agents with verified human backing pay per-request for security audit services via Circle Nanopayments, discoverable by ENS name, with on-chain escrow and identity-conditioned pricing.**

### The problem

Smart contract audits are expensive ($5K-$50K), slow (weeks), and gatekept. AI-powered security scanning is making audits faster and cheaper, but there's no payment model that fits: flat-fee APIs are wasteful, and there's no trust layer — how does an audit provider know the agent requesting a scan is backed by a real, accountable human and not a bot scraping vulnerability data?

### The solution

KronoScan combines Circle Nanopayments (x402) with an on-chain escrow vault on Arc blockchain. The first application: **AI-powered smart contract security auditing**, where agents pay per audit category via x402 micropayments.

It adds three layers that Nanopayments alone doesn't provide:

1. **On-chain escrow** — StreamVault locks a deposit, tracks consumption reported by the coordinator, and auto-refunds unused budget. Identity-conditioned pricing gives verified agents a 20% discount.
2. **Verified identity** — World ID proof that a unique human backs each agent (sybil resistance, trust tiers). Verified agents get discounted prices because they have reputation at stake.
3. **Discoverability** — ENS names for audit service endpoints so agents find services by name, not raw addresses

---

## Hackathon Strategy: 3 Sponsors, 4 Prize Tracks

We are targeting **Arc + World + ENS** as our 3 sponsors (max allowed).

| Track | Sponsor | Prize | What qualifies us |
|-------|---------|-------|-------------------|
| Best Agentic Economy with Nanopayments | Arc | $6,000 | Core product — AI audit agents paying per-request via x402 Nanopayments across 10 audit categories |
| Best Smart Contracts with Advanced Stablecoin Logic | Arc | $3,000 | StreamVault.sol — tiered pricing, consumption tracking, session timeout, top-up, auto-refund |
| Best use of AgentKit | World | $8,000 | World ID verification for auditor accountability + seller-side AgentKit hooks |
| Best ENS Integration for AI Agents | ENS | $5,000 | Audit service discovery via ENS names + ENSIP-25 agent registry |
| **Total potential** | | **$22,000** | |

### Qualification requirements (critical — read these)

**Arc requires:**
- Functional MVP with frontend + backend + architecture diagram
- Video demonstration + presentation
- GitHub repo link

**World AgentKit requires:**
- Must integrate World's AgentKit to meaningfully distinguish human-backed agents from bots
- Submissions that only use World ID without AgentKit won't qualify

**ENS requires:**
- ENS must clearly improve the product (not cosmetic)
- Functional demo (no hard-coded values)
- Present at ENS booth Sunday morning

---

## Technology Stack

### Core infrastructure (what we build on top of)

- **Arc blockchain** — Circle's L1, EVM-compatible. USDC is the native gas token. This means agents only need one currency for both payments and gas. Testnet deployed.
- **Circle Gateway** — Unified USDC wallet across chains. Deposit once, use everywhere. Non-custodial.
- **Circle Nanopayments** — Gas-free sub-cent USDC transfers via batched settlement. Minimum payment: $0.000001. Uses EIP-3009 `TransferWithAuthorization` signatures offchain, batched into single on-chain transactions.
- **x402 protocol** — HTTP-native payment negotiation. Server returns `402 Payment Required` with price/terms. Client responds with signed payment via `GatewayClient.pay()`. Stateless, agent-friendly.
- **World AgentKit** — SDK for verifying that agents are backed by unique humans via World ID proofs.
- **ENS** — Human-readable names for agents and services (e.g., `audit.kronoscan.eth` instead of `0x7f3a...`).

### Our stack

- **Smart contracts:** Solidity ^0.8.30, deployed on Arc testnet
- **Backend:** TypeScript, Express
- **Frontend:** Next.js (dashboard for demo)
- **Dev tools:** Foundry (forge/cast/anvil), WSL on Windows

---

## Architecture — 5 Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUYER AGENT                                  │
│                    (TypeScript demo script)                     │
│                                                                 │
│  1. Agent has a task: "Audit this smart contract"              │
│  2. Agent resolves seller via ENS: audit.kronoscan.eth         │
│  3. Agent opens a session on StreamVault (deposits USDC)       │
│  4. For each of 10 audit categories:                           │
│     - GatewayClient.pay(categoryUrl) → real x402 micropayment  │
│     - Receives findings for that category via SSE              │
│  5. Session closes → unused deposit refunded on-chain          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR                                  │
│                    (TypeScript / Express backend)               │
│                                                                 │
│  - Mediates x402 payments between buyer and seller endpoints   │
│  - Reports consumption on-chain via StreamVault                │
│  - Checks session solvency on-chain                            │
│  - Pushes real-time updates to frontend via WebSocket          │
│  - Manages session lifecycle (open/active/closing/closed)      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ StreamVault.sol  │  │   Circle     │  │    SELLER API        │
│ (Arc testnet)    │  │ Nanopayments │  │    (Express + SSE)   │
│                  │  │              │  │                      │
│ - Session escrow │  │ - x402       │  │ - 10 audit category  │
│ - Tiered pricing │  │   per-request│  │   endpoints          │
│ - Consumption    │  │ - EIP-3009   │  │ - Each x402-protected│
│   tracking       │  │   via Gateway│  │ - AgentKit hooks     │
│ - Top-up         │  │ - Batched    │  │ - SSE findings       │
│ - Session timeout│  │   settlement │  │   per category       │
│ - Auto-refund    │  │              │  │                      │
│ - World ID flag  │  │              │  │                      │
└──────────────────┘  └──────────────┘  └──────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND DASHBOARD                           │
│                    (Next.js — THE DEMO CENTERPIECE)             │
│                                                                 │
│  - Agent World ID verification status: "Verified"              │
│  - Service discovered via ENS: audit.kronoscan.eth             │
│  - Live cost meter: jumps up per completed category            │
│  - Price: base vs effective (verified discount visible)        │
│  - Budget remaining bar + requests remaining count             │
│  - Category progress: 10 categories with checkmarks            │
│  - Session status: IDLE → OPENING → ACTIVE → CLOSING → CLOSED │
│  - Streaming vulnerability findings with severity badges       │
│  - Refund display: "$0.9992 returned to agent wallet"          │
│  - ArcScan transaction links                                   │
│  - Cost comparison: "Traditional audit: $5K+ vs KronoScan: $0.001" │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component 1: StreamVault.sol (Smart Contract on Arc)

The on-chain escrow. It manages sessions where buyers deposit USDC, the coordinator reports per-request consumption, and unused budget is refunded on close. It does seven things:

1. **Open a session** — record buyer, seller, price, deposit amount, World ID verification status
2. **Apply tiered pricing** — verified buyers get a discounted price, unverified pay full price
3. **Track consumption** — coordinator reports each x402 payment amount via `reportConsumption()`
4. **Check solvency** — `isSolvent(sessionId)` returns true/false based on `consumedAmount < depositedAmount`
5. **Top up deposits** — buyers can add USDC to an active session without restarting
6. **Session timeout** — anyone can terminate an expired session after max duration (safety net for coordinator failure)
7. **Execute refund on close** — consumed goes to seller, remainder returned to buyer

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StreamVault — On-chain escrow for per-request AI agent payments
/// @notice Manages deposits, identity-conditioned pricing, consumption tracking,
///         top-ups, session timeout, and automatic refunds.
contract StreamVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public coordinator;

    uint256 public constant MAX_SESSION_DURATION = 3600; // 1 hour max
    uint256 public constant VERIFIED_DISCOUNT_BPS = 2000;
    uint256 public constant BPS_BASE = 10000;

    error OnlyCoordinator();
    error NotActive();
    error OnlyBuyer();
    error ConsumedExceedsDeposit();
    error SessionNotExpired();

    enum SessionStatus { ACTIVE, CLOSED, TERMINATED }

    struct Session {
        address buyer;
        address seller;
        uint256 pricePerRequest;
        uint256 effectivePrice;     // after verification discount
        uint256 depositedAmount;
        uint256 consumedAmount;     // reported by coordinator
        uint256 startTime;
        uint256 closedTime;
        SessionStatus status;
        bool buyerVerified;
    }

    mapping(bytes32 => Session) public sessions;
    uint256 public sessionCount;

    event SessionOpened(
        bytes32 indexed sessionId, address buyer, address seller,
        uint256 pricePerRequest, uint256 effectivePrice, uint256 deposit, bool verified
    );
    event ConsumptionReported(bytes32 indexed sessionId, uint256 amount, uint256 newTotal);
    event SessionClosed(bytes32 indexed sessionId, uint256 consumed, uint256 refunded);
    event SessionTerminated(bytes32 indexed sessionId, uint256 consumed, uint256 refunded);
    event SessionToppedUp(bytes32 indexed sessionId, uint256 amount, uint256 newTotal);

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert OnlyCoordinator();
        _;
    }

    constructor(address _usdc, address _coordinator) {
        usdc = IERC20(_usdc);
        coordinator = _coordinator;
    }

    function _applyDiscount(uint256 basePrice, bool verified) internal pure returns (uint256) {
        if (verified) {
            return basePrice * (BPS_BASE - VERIFIED_DISCOUNT_BPS) / BPS_BASE;
        }
        return basePrice;
    }

    function openSession(
        address seller,
        uint256 pricePerRequest,
        uint256 deposit,
        bool worldIdVerified
    ) external returns (bytes32 sessionId) {
        usdc.safeTransferFrom(msg.sender, address(this), deposit);

        uint256 effectivePrice = _applyDiscount(pricePerRequest, worldIdVerified);
        sessionId = keccak256(abi.encodePacked(msg.sender, seller, block.timestamp, sessionCount++));

        sessions[sessionId] = Session({
            buyer: msg.sender,
            seller: seller,
            pricePerRequest: pricePerRequest,
            effectivePrice: effectivePrice,
            depositedAmount: deposit,
            consumedAmount: 0,
            startTime: block.timestamp,
            closedTime: 0,
            status: SessionStatus.ACTIVE,
            buyerVerified: worldIdVerified
        });

        emit SessionOpened(sessionId, msg.sender, seller, pricePerRequest, effectivePrice, deposit, worldIdVerified);
    }

    function topUp(bytes32 sessionId, uint256 amount) external {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();
        if (msg.sender != s.buyer) revert OnlyBuyer();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        s.depositedAmount += amount;

        emit SessionToppedUp(sessionId, amount, s.depositedAmount);
    }

    /// @notice Coordinator reports consumption after each x402 payment
    function reportConsumption(bytes32 sessionId, uint256 amount) external onlyCoordinator {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();
        s.consumedAmount += amount;
        if (s.consumedAmount > s.depositedAmount) revert ConsumedExceedsDeposit();

        emit ConsumptionReported(sessionId, amount, s.consumedAmount);
    }

    function isSolvent(bytes32 sessionId) external view returns (bool) {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) return false;
        return s.consumedAmount < s.depositedAmount;
    }

    /// @notice Returns how many more requests the session can afford
    function requestsRemaining(bytes32 sessionId) external view returns (uint256) {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) return 0;
        if (s.consumedAmount >= s.depositedAmount) return 0;
        return (s.depositedAmount - s.consumedAmount) / s.effectivePrice;
    }

    /// @notice Anyone can terminate an expired session (safety net for coordinator failure)
    function terminateExpired(bytes32 sessionId) external {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();
        if (block.timestamp < s.startTime + MAX_SESSION_DURATION) revert SessionNotExpired();

        s.status = SessionStatus.TERMINATED;
        s.closedTime = block.timestamp;

        uint256 consumed = s.consumedAmount;
        uint256 refund = s.depositedAmount - consumed;
        if (consumed > 0) {
            usdc.safeTransfer(s.seller, consumed);
        }
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }

        emit SessionTerminated(sessionId, consumed, refund);
    }

    function closeSession(bytes32 sessionId) external onlyCoordinator {
        Session storage s = sessions[sessionId];
        if (s.status != SessionStatus.ACTIVE) revert NotActive();

        s.status = SessionStatus.CLOSED;
        s.closedTime = block.timestamp;

        uint256 consumed = s.consumedAmount;
        uint256 refund = s.depositedAmount - consumed;
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }
        if (consumed > 0) {
            usdc.safeTransfer(s.seller, consumed);
        }

        emit SessionClosed(sessionId, consumed, refund);
    }
}
```

**Advanced stablecoin logic features (targeting Arc "Best Smart Contracts" track):**
- **Tiered pricing via `_applyDiscount`** — World ID verified buyers pay 20% less. The effective price is computed on-chain and stored per session. This creates identity-conditioned USDC flows.
- **On-chain consumption tracking via `reportConsumption`** — coordinator reports each x402 payment on-chain. Contract maintains running total. Enables trustless solvency verification.
- **Top-up mechanism via `topUp`** — buyers can extend session budget by adding USDC without restarting. Prevents premature session end for large audits.
- **Session timeout via `terminateExpired`** — permissionless: anyone can terminate an expired session after `MAX_SESSION_DURATION`. Handles coordinator failure gracefully — consumed goes to seller, remainder refunded to buyer.
- **`requestsRemaining` view** — frontend shows "N requests left", enabling proactive top-up.

**World ID verification flow:**
- Verification happens offchain via IDKitWidget (frontend) + Cloud API (backend)
- The boolean `worldIdVerified` is passed to `openSession` — contract trusts the coordinator
- Sellers can check `sessions[sessionId].buyerVerified` to decide whether to accept

**Contract size:** ~180 lines. Focused but with genuinely advanced programmable stablecoin logic.

---

## Component 2: Coordinator (TypeScript / Express Backend)

The session manager. Core responsibilities:

```typescript
// Pseudocode structure

class SessionCoordinator {
    // Buyer opens a session — deposits USDC into StreamVault
    async openSession(params: SessionParams): Promise<string> {
        // 1. Call StreamVault.openSession() on-chain
        // 2. Register session in memory
        // 3. Push session_opened to frontend via WebSocket
    }

    // After each x402 payment, track consumption
    async recordPayment(sessionId: string, amount: bigint) {
        // 1. Update internal state (request count, total consumed)
        // 2. Call StreamVault.reportConsumption() on-chain
        // 3. Push cost update to frontend via WebSocket
    }

    // Check if session can afford more requests
    async isSessionSolvent(sessionId: string): Promise<boolean> {
        // Check internal state + on-chain solvency
    }

    // Close session — triggers refund
    async closeSession(sessionId: string): Promise<void> {
        // 1. Call StreamVault.closeSession() on-chain
        // 2. Push final state + refund info to frontend
    }
}
```

Key technical details:
- x402 payments are handled by `GatewayClient.pay()` — Circle handles EIP-3009 signing and batching
- The coordinator calls `StreamVault.reportConsumption()` after each successful x402 payment
- Solvency check: `consumedAmount < depositedAmount` — simple comparison, no time-based calculation
- WebSocket pushes cost/status updates to frontend after each category completes

---

## Component 3: Seller API — Audit Scanner (Express + x402)

10 x402-protected audit category endpoints. Each returns `402 Payment Required` without payment, streams findings with valid payment.

### 10 Audit Category Endpoints

| # | Endpoint | Category |
|---|----------|----------|
| 1 | `POST /api/audit/reentrancy` | Reentrancy |
| 2 | `POST /api/audit/access-control` | Access Control |
| 3 | `POST /api/audit/arithmetic` | Arithmetic/Precision |
| 4 | `POST /api/audit/external-calls` | External Call Safety |
| 5 | `POST /api/audit/token-standards` | Token Standards |
| 6 | `POST /api/audit/business-logic` | Business Logic |
| 7 | `POST /api/audit/gas-optimization` | Gas/Optimization |
| 8 | `POST /api/audit/code-quality` | Code Quality |
| 9 | `POST /api/audit/compiler` | Compiler/Version |
| 10 | `POST /api/audit/defi` | DeFi-Specific |

```typescript
// Pseudocode — each endpoint follows this pattern

app.post('/api/audit/reentrancy', x402Middleware, async (req, res) => {
    // x402Middleware already handled 402 response + payment validation
    // At this point, payment is confirmed via GatewayClient

    // Resolve contract source (address OR raw source)
    let contractSource = req.body.contractSource;
    if (req.body.contractAddress && !contractSource) {
        contractSource = await fetchVerifiedSource(req.body.contractAddress, req.body.chain);
        if (!contractSource) return res.status(400).json({ error: 'Contract not verified' });
    }

    // Stream findings for this category via SSE
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });

    // Option A: DeepSeek API for real analysis
    // Option B: Pre-written findings as fallback
    const findings = await analyzeCategory('reentrancy', contractSource);

    for (const finding of findings) {
        res.write(`data: ${JSON.stringify(finding)}\n\n`);
        await sleep(1000);
    }

    res.end();
});
```

**Two input modes:**
- **Source mode:** User pastes Solidity source code directly.
- **Address mode:** User pastes a deployed contract address + chain. Seller API calls block explorer API to fetch verified source.

**Findings source:** DeepSeek API for real analysis (free), with pre-written findings as fallback if API is unreliable.

---

## Component 4: Buyer Agent (TypeScript Demo Script)

An autonomous agent that submits a smart contract for security audit:

```typescript
// Pseudocode

async function runAuditAgent() {
    // 1. Verify World ID (via IDKitWidget proof + Cloud API)
    const worldIdVerified = await verifyWorldId(agentOwnerProof);

    // 2. Resolve audit service via ENS
    const sellerAddress = await ensProvider.resolveName('audit.kronoscan.eth');

    // 3. Probe seller for pricing → get 402 response
    const pricingInfo = await probeService('https://seller-api/audit/reentrancy');

    // 4. Open session on StreamVault (deposit USDC, pass World ID boolean)
    const sessionId = await streamVault.openSession(
        sellerAddress, pricingInfo.pricePerRequest, depositAmount, worldIdVerified
    );

    // 5. Loop through 10 audit categories
    const categories = [
        'reentrancy', 'access-control', 'arithmetic', 'external-calls',
        'token-standards', 'business-logic', 'gas-optimization',
        'code-quality', 'compiler', 'defi'
    ];

    for (const category of categories) {
        // Pay via x402 — GatewayClient handles EIP-3009 signing
        const response = await gatewayClient.pay(`${sellerUrl}/api/audit/${category}`, {
            method: 'POST',
            body: JSON.stringify({ contractSource: sampleVulnerableContract })
        });

        // Coordinator records consumption on-chain
        await coordinator.recordPayment(sessionId, pricingInfo.effectivePrice);

        // Consume SSE findings
        for await (const chunk of response.body) {
            displayFindingOnDashboard(chunk);
        }
    }

    // 6. Close session, get refund
    await coordinator.closeSession(sessionId);
}
```

---

## Component 5: Frontend Dashboard (Next.js)

The demo centerpiece. This is what judges see and remember.

**Layout (single page):**

Top section:
- Agent identity: wallet address + "World ID Verified" badge
- Service target: `audit.kronoscan.eth` (ENS name, resolved)
- **Contract input:** Toggle between "Paste Source" (textarea) and "On-Chain Address" (address input + chain selector).
- Target contract: resolved or pasted Solidity source displayed

Middle section (the star):
- Cost counter: `$0.0008` jumping up per completed category (large font)
- Price display: "Base: $0.0001/req → Effective: $0.00008/req (Verified -20%)"
- Budget remaining bar (deposit - consumed)
- Requests remaining: "7 of 10 categories left"
- Category progress: checklist of 10 categories with checkmarks
- Session status indicator: IDLE → OPENING → ACTIVE → CLOSING → CLOSED

Right/bottom section:
- Vulnerability findings panel: findings appear per-category with severity badges
  - CRITICAL (red), HIGH (orange), MEDIUM (yellow), LOW (blue)
  - Each finding shows: severity, title, line number, description
  - Grouped by audit category

End state:
- Findings summary: "3 Critical, 2 High, 4 Medium, 3 Low"
- Categories: 10/10 completed
- Total cost: $0.0008 (with verified discount)
- Refund: $0.9992
- Settlement tx + Refund tx links to ArcScan
- Comparison: "Traditional audit: $5,000+ / 2 weeks | KronoScan: $0.001 / 30 seconds"

**Tech:** Next.js app. WebSocket to Coordinator for real-time session state. SSE from seller endpoints for findings.

---

## The Demo Script (90 seconds live)

This is the exact flow Martin will present to judges:

**[0:00]** Dashboard shows contract input. Agent wallet: $1.00 USDC. Status: IDLE.

*"This is an AI auditing agent with $1 of USDC on Arc. It's backed by a World ID — a verified human is accountable for this agent. It scans contracts across 10 security categories."*

**[0:10]** Click "Run Audit". Dashboard shows:
```
Resolving service... audit.kronoscan.eth → 0x7f3a...
402 Payment Required — Price: $0.0001/request
World ID Verified — discount applied: $0.00008/request (20% off)
Session opened — budget: $1.00 [ArcScan link]
```

*"The agent resolved the audit service by ENS name. Each category costs $0.0001 — but this agent is World ID verified, so the smart contract applies a 20% trust discount on-chain."*

**[0:20]** Categories run sequentially. Each one triggers an x402 payment + findings:
```
Reentrancy Analysis... paying $0.00008 via x402
  CRITICAL: Reentrancy in withdraw() — state updated after external call (line 47)
Access Control... paying $0.00008 via x402
  HIGH: Missing onlyOwner modifier on setPrice() (line 23)
Arithmetic... paying $0.00008 via x402
  MEDIUM: Division before multiplication in calculateFee() (line 56)
```

*"Each category is a separate x402 micropayment through Circle Nanopayments. Real payments, batched into a single settlement. The contract tracks consumption on-chain."*

**[0:45]** All 10 categories complete. Session closes.
```
12 findings (3 Critical, 2 High, 4 Medium, 3 Low)
10 categories | 30 seconds | Cost: $0.0008 | Refund: $0.9992
Verified savings: 20% discount applied
10 nanopayments batched [ArcScan link]
```

*"30 seconds. 12 vulnerabilities. Total cost: $0.0008. Traditional audit: $5,000 and two weeks. The unused deposit — $0.9992 — refunded automatically on-chain."*

**[1:05]** Show ArcScan links. Session events + refund.

*"10 real micropayments batched by Circle Nanopayments. Identity-conditioned pricing via World ID. Service discovered by ENS. This is what agentic commerce looks like."*

---

## ENS Integration Details

**What to build:**
- Audit services register ENS subnames under a KronoScan parent (e.g., `audit.kronoscan.eth`)
- Multiple audit services could register: `slither.audit.eth`, `mythril.audit.eth` — service discovery for the agentic economy
- The coordinator resolves ENS names to addresses when buyers specify a service by name
- The dashboard displays ENS names instead of raw addresses throughout
- Service metadata stored in ENS text records: pricing, description, supported languages, scan capabilities
- ENSIP-25 agent registry entries for audit agents (strengthens ENS prize — AI Agent Registry standard)

**Libraries:**
- `viem` built-in ENS functions (`namehash`, `normalize`, Universal Resolver) — no extra deps needed
- ENS docs: https://docs.ens.domains/
- AI agent integration docs: https://docs.ens.domains/building-with-ai/
- ENSIP-25 (AI Agent Registry): https://docs.ens.domains/ensip/25

**Effort:** 3-4 hours. Mostly coordinator + frontend changes.

---

## World AgentKit Integration Details

**Two integration points (critical for the $8K AgentKit prize):**

**1. Buyer side — IDKitWidget + Cloud API:**
- Frontend shows "Verify with World ID" button via `IDKitWidget` React component
- User verifies via World App on phone → proof sent to backend
- Backend verifies via Cloud API (`POST https://developer.worldcoin.org/api/v2/verify/{app_id}`)
- Boolean `worldIdVerified` passed to `StreamVault.openSession()`
- Verified agents get 20% price discount on-chain — economic consequence, not just a badge

**2. Seller side — AgentKit hooks (the differentiator):**
- Audit service endpoint uses `createAgentkitHooks()` from `@worldcoin/agentkit`
- When buyer sends x402 payment, seller verifies the buyer agent is registered in AgentBook
- `createAgentBookVerifier()` resolves wallet → human ID
- This is "meaningfully distinguishing human-backed agents from bots" — the seller decides whether to serve based on agent verification, not just the buyer getting a discount

**Why this matters for security auditing:**
- "Should I trust this anonymous agent to receive my vulnerability findings?"
- Verified agents have a human accountable for responsible disclosure
- Unverified agents might be scraping vulnerability data for exploits
- Trust tiers: verified agents get full findings, unverified get summary only

**Libraries:**
- `@worldcoin/agentkit` — SDK package
- `@worldcoin/idkit` — React widget for frontend verification
- `npx @worldcoin/agentkit-cli register <agent-address>` — agent registration (requires World App on phone)
- Supported chains: World Chain mainnet, Base mainnet, Base Sepolia testnet (no Arc testnet)
- World AgentKit SDK: https://docs.world.org/agents/agent-kit/integrate
- World ID docs: https://docs.world.org/world-id/overview
- Requires: `app_id` from World Developer Portal (free registration)

**Effort:** 4-6 hours. Coordinator + agent script + seller hooks + dashboard.

---

## Key Technical Details

### x402 Protocol + Circle Nanopayments
- HTTP `402 Payment Required` + `PAYMENT-SIGNATURE` header + `PAYMENT-RESPONSE` header
- Buyer uses `GatewayClient.pay(url)` — handles EIP-3009 signing automatically
- Circle batches EIP-3009 signatures into single on-chain settlement
- Minimum payment: $0.000001 USDC
- SDK: `@circle-fin/x402-batching` — provides `GatewayClient` class
- No API key needed — wallet private key + chain config is sufficient
- Buyer flow: `client.deposit("1")` → `client.pay(url)` per request
- `validBefore` must be at least 3 days in the future
- Docs: https://developers.circle.com/gateway/nanopayments

### Arc Blockchain
- EVM-compatible L1 from Circle
- USDC is the native gas token (no ETH needed — agents hold only USDC)
- Testnet RPC and explorer (ArcScan) available
- Arc docs: https://docs.arc.network/arc/concepts/welcome-to-arc

---

## Prior Work: StabL

Martin's previous project (https://github.com/MBarralDevs/StabL) built an intent-based payment gateway on Arc with:
- `IntentVault.sol` — on-chain intent storage with 3-tier settlement (IMMEDIATE/STANDARD/DEFERRED)
- `PaymentPool.sol` — receiving + balance tracking
- `BatchSettler.sol` — atomic batch execution
- TypeScript backend with Redis Streams for event-driven processing

**Patterns that transfer to KronoScan:**
- SafeERC20 deposit/withdrawal patterns from IntentVault → StreamVault
- Event-driven TypeScript backend architecture → Coordinator
- Arc testnet deployment pipeline (already configured)
- USDC contract interactions on Arc

---

## File Structure

```
kronoscan/
├── src/                        # Solidity contracts (Foundry convention)
│   └── StreamVault.sol
├── test/                       # Solidity tests (Foundry convention)
│   └── StreamVault.t.sol
├── script/                     # Foundry deploy scripts
│   └── Deploy.s.sol
├── lib/                        # Foundry dependencies (forge install)
├── foundry.toml
├── coordinator/
│   ├── src/
│   │   ├── index.ts            # Express + WS server
│   │   ├── sessionManager.ts   # Session lifecycle
│   │   ├── vaultClient.ts      # StreamVault on-chain interactions
│   │   ├── abi.ts              # StreamVault ABI
│   │   ├── types.ts            # Shared types
│   │   ├── errors.ts           # Custom error classes
│   │   ├── ensResolver.ts      # ENS name resolution
│   │   └── worldId.ts          # World ID verification
│   └── package.json
├── seller-api/
│   ├── src/
│   │   ├── index.ts            # Express + x402 middleware
│   │   ├── categories/         # 10 audit category handlers
│   │   ├── sourceResolver.ts   # Fetch verified source from block explorer
│   │   └── findings.ts         # Pre-written vulnerability findings (fallback)
│   └── package.json
├── agent/
│   ├── src/
│   │   ├── index.ts            # Demo audit agent script
│   │   ├── sessionClient.ts    # KronoScan client SDK
│   │   ├── wallet.ts           # Agent wallet management
│   │   └── sampleContract.ts   # Vulnerable Solidity contract for demo
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Main dashboard
│   │   └── components/
│   │       ├── CostMeter.tsx
│   │       ├── CategoryProgress.tsx
│   │       ├── FindingsPanel.tsx
│   │       ├── AgentIdentity.tsx
│   │       └── RefundSummary.tsx
│   ├── package.json
│   └── next.config.js
├── CLAUDE.md                   # This file
└── README.md
```

---

## Implementation Priority Order

Build in this order. Each step produces a demoable increment.

### Phase 1: Contract refactor + Core (Days 1-3)
1. `StreamVault.sol` refactor — rename to session model, add `consumedAmount`, `reportConsumption()`, `terminateExpired()`
2. Update Foundry tests for new contract interface
3. Deploy to Arc testnet
4. Coordinator refactor — session manager, consumption tracking via `reportConsumption()`
5. Seller API — 10 x402-protected audit category endpoints

**Milestone:** End-to-end audit flow: open session → 10 x402 payments → findings → close → refund.

### Phase 2: Dashboard (Days 4-5)
6. Next.js dashboard — cost counter, category progress, findings panel, refund display
7. Sample vulnerable contract + findings (DeepSeek or pre-written)

**Milestone:** Visual audit demo running in browser.

### Phase 3: World ID (Days 6-7)
8. IDKitWidget + Cloud API verification in frontend/backend
9. AgentKit hooks on seller side (createAgentkitHooks)
10. Trust tier UI on dashboard ("Verified" badge + price discount visible)

**Milestone:** World ID badge visible in demo flow.

### Phase 4: ENS (Days 8-9)
11. Audit service ENS name registration (`audit.kronoscan.eth`)
12. ENS resolution in coordinator + ENSIP-25 agent registry text records
13. ENS names displayed in dashboard instead of addresses

**Milestone:** `audit.kronoscan.eth` visible in demo flow.

### Phase 5: Polish (Day 10)
14. Demo script rehearsal
15. Video recording
16. README + architecture diagram
17. ArcScan link verification

---

## Important Reminders

- **The demo is everything.** Every line of code should serve the 90-second demo. If it doesn't appear on the dashboard or affect the demo flow, it's not a priority.
- **x402 is per-request.** Each audit category is a separate `GatewayClient.pay()` call. Circle handles EIP-3009 signing and batching. No custom signature logic needed.
- **Arc uses USDC for gas.** The agent only ever holds USDC. No ETH, no second token. This is a genuine selling point — mention it in the demo.
- **StreamVault is the escrow + referee.** It locks deposits, tracks consumption (reported by coordinator), enforces tiered pricing, and auto-refunds. It does NOT handle individual payments — that's Nanopayments' job.
- **Circle Nanopayments may need partial mocking** if SDK doesn't work on Arc testnet yet. The x402 flow structure should be real; actual payment settlement can be simulated if needed.
- **Present at ENS booth Sunday morning** — this is a requirement for the ENS prize.
- **Keep the contract focused.** ~180 lines of Solidity. The contract is the escrow with advanced stablecoin logic (tiered pricing, consumption tracking, top-up, session timeout, auto-refund).
