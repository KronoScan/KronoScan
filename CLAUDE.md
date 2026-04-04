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
- World AgentKit supports Base Sepolia testnet, NOT Arc testnet — verification happens off-Arc, boolean passed to StreamVault
- The seller API is intentionally a mock — pre-written vulnerability findings streamed via SSE, not real AI scanning. Findings must look credible against the sample contract shown in the demo.
- **On-chain audit input:** The seller API accepts EITHER raw Solidity source OR a contract address. For addresses, it fetches verified source from the block explorer API (Etherscan-compatible). If the contract is not verified, it returns an error — no bytecode decompilation.
- Nanopayments may need partial mocking if SDK doesn't work on Arc testnet yet — EIP-3009 signing must be real, API forwarding can be simulated

---

## Who is Martin?

Martin is a solo developer preparing for **ETHGlobal Cannes 2026** (2-day hackathon). He has ~10 days of prep time before the event. He codes in VSCode using WSL on Windows. He has ~2 months of experience building **StabL**, an intent-based payment gateway on Arc blockchain (Solidity + TypeScript + Redis Streams). His prior codebase includes `IntentVault.sol`, `PaymentPool.sol`, `BatchSettler.sol` — patterns that transfer directly to this project.

Martin uses Claude Chat for architecture/brainstorming and Claude Code for implementation. This file is the bridge between those two workflows.

---

## The Project: KronoScan — Verified Agent Commerce

### One-sentence pitch

**AI agents with verified human backing pay per second for security audit services, discoverable by ENS name, with cryptographic proof that real humans are accountable for their spending.**

### The problem

Smart contract audits are expensive ($5K-$50K), slow (weeks), and gatekept. AI-powered security scanning is making audits faster and cheaper, but there's no payment model that fits: flat-fee APIs are wasteful (you pay the same whether the scan takes 10 seconds or 10 minutes), and there's no trust layer — how does an audit provider know the agent requesting a scan is backed by a real, accountable human and not a bot scraping vulnerability data?

### The solution

KronoScan is a per-second payment streaming primitive for AI agents, built on Circle Nanopayments and deployed on Arc blockchain. The first application: **AI-powered smart contract security auditing**, where agents pay per second of actual scan time.

It adds three layers that Nanopayments alone doesn't provide:

1. **Streaming** — continuous per-second payment authorization (not per-call), so agents pay exactly for compute time used
2. **Verified identity** — World ID proof that a unique human backs each agent (sybil resistance, trust tiers). Verified auditors get discounted rates because they have reputation at stake.
3. **Discoverability** — ENS names for audit service endpoints so agents find services by name, not raw addresses

---

## Hackathon Strategy: 3 Sponsors, 4 Prize Tracks

We are targeting **Arc + World + ENS** as our 3 sponsors (max allowed).

| Track | Sponsor | Prize | What qualifies us |
|-------|---------|-------|-------------------|
| Best Agentic Economy with Nanopayments | Arc | $6,000 | Core product — AI audit agents paying per second via Nanopayments |
| Best Smart Contracts with Advanced Stablecoin Logic | Arc | $3,000 | StreamVault.sol — tiered pricing, auto-termination, grace period, top-up |
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
- **x402 protocol** — HTTP-native payment negotiation. Server returns `402 Payment Required` with price/terms. Client responds with signed payment. Stateless, agent-friendly.
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
│  1. Agent has a task: "Audit this smart contract" (source or address) │
│  2. Agent resolves seller via ENS: audit.kronoscan.eth         │
│  3. Agent hits seller's API → receives 402 Payment Required    │
│  4. Agent opens a stream on StreamVault (deposits USDC)        │
│  5. Every second: signs EIP-3009 authorization, sends to       │
│     Coordinator                                                 │
│  6. Receives streaming vulnerability findings via SSE          │
│  7. When done: closes stream, gets refund of unused deposit    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR                                  │
│                    (TypeScript / Express backend)               │
│                                                                 │
│  - Receives per-second EIP-3009 auth signatures from buyers    │
│  - Validates signatures                                        │
│  - Checks stream solvency on-chain via StreamVault             │
│  - Forwards valid authorizations to Circle Nanopayments API    │
│  - Signals to sellers whether streams are active + funded      │
│  - Manages stream lifecycle (open/active/closing/closed)       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ StreamVault.sol  │  │   Circle     │  │    SELLER API        │
│ (Arc testnet)    │  │ Nanopayments │  │    (Express + SSE)   │
│                  │  │   API        │  │                      │
│ - Stream registry│  │              │  │ - x402-protected     │
│ - Tiered pricing │  │ - EIP-3009   │  │   endpoint           │
│ - Deposit lock   │  │   validation │  │ - Checks coordinator │
│ - Top-up         │  │ - Batched    │  │   for stream status  │
│ - Solvency check │  │   settlement │  │ - Streams response   │
│ - Grace period   │  │              │  │   via SSE            │
│ - Auto-terminate │  │              │  │ - Stops if stream    │
│ - Auto-refund    │  │              │  │   goes inactive      │
│ - World ID flag  │  │              │  │                      │
└──────────────────┘  └──────────────┘  └──────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND DASHBOARD                           │
│                    (Next.js — THE DEMO CENTERPIECE)             │
│                                                                 │
│  - Agent World ID verification status: "Verified ✅"           │
│  - Service discovered via ENS: audit.kronoscan.eth             │
│  - Live cost meter: $0.0000 ticking up per second              │
│  - Rate: base vs effective (verified discount visible)         │
│  - Time remaining countdown (from timeRemaining() view)        │
│  - Stream status: IDLE → OPENING → ACTIVE → CLOSING → CLOSED  │
│  - Authorization count: "47 authorizations sent"               │
│  - Streaming vulnerability findings with severity badges       │
│  - Refund display: "$0.9953 returned to agent wallet"          │
│  - ArcScan transaction links                                   │
│  - Cost comparison: "Traditional audit: $5K+ vs KronoScan: $0.02" │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component 1: StreamVault.sol (Smart Contract on Arc)

The on-chain referee. It does NOT process every per-second payment (that's Nanopayments' job via offchain signatures). It does six things:

1. **Register a stream** — record buyer, seller, rate, deposit amount, World ID verification status
2. **Apply tiered pricing** — verified buyers get a discounted rate, unverified pay a premium
3. **Check solvency** — `isSolvent(streamId)` returns true/false based on deposit vs elapsed time
4. **Top up deposits** — buyers can add USDC to an active stream without closing it
5. **Auto-terminate on insolvency** — anyone can terminate an insolvent stream after a grace period
6. **Execute refund on close** — calculate unconsumed deposit, return to buyer

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StreamVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public coordinator;

    uint256 public constant GRACE_PERIOD = 30;           // 30 seconds before termination
    uint256 public constant VERIFIED_DISCOUNT_BPS = 2000; // 20% discount for verified buyers
    uint256 public constant BPS_BASE = 10000;

    enum StreamStatus { ACTIVE, CLOSED, TERMINATED }

    struct Stream {
        address buyer;
        address seller;
        uint256 baseRatePerSecond;   // seller's base rate (6 decimals)
        uint256 effectiveRate;       // actual rate after verification discount
        uint256 depositedAmount;     // total USDC locked (including top-ups)
        uint256 startTime;
        uint256 closedTime;
        StreamStatus status;
        bool buyerVerified;          // World ID verified
    }

    mapping(bytes32 => Stream) public streams;
    uint256 public streamCount;

    event StreamOpened(bytes32 indexed streamId, address buyer, address seller,
                       uint256 baseRate, uint256 effectiveRate, uint256 deposit, bool verified);
    event StreamClosed(bytes32 indexed streamId, uint256 consumed, uint256 refunded);
    event StreamTerminated(bytes32 indexed streamId, uint256 consumed, uint256 refunded);
    event StreamToppedUp(bytes32 indexed streamId, uint256 amount, uint256 newTotal);

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "Only coordinator");
        _;
    }

    constructor(address _usdc, address _coordinator) {
        usdc = IERC20(_usdc);
        coordinator = _coordinator;
    }

    /// @notice Calculate effective rate based on verification status
    function _applyDiscount(uint256 baseRate, bool verified) internal pure returns (uint256) {
        if (verified) {
            return baseRate * (BPS_BASE - VERIFIED_DISCOUNT_BPS) / BPS_BASE;
        }
        return baseRate;
    }

    /// @notice Calculate consumed amount for a stream
    function _consumed(Stream storage s) internal view returns (uint256) {
        uint256 end = s.closedTime > 0 ? s.closedTime : block.timestamp;
        uint256 elapsed = end - s.startTime;
        uint256 amount = elapsed * s.effectiveRate;
        return amount > s.depositedAmount ? s.depositedAmount : amount;
    }

    function openStream(
        address seller,
        uint256 baseRatePerSecond,
        uint256 deposit,
        bool worldIdVerified
    ) external returns (bytes32 streamId) {
        usdc.safeTransferFrom(msg.sender, address(this), deposit);

        uint256 effectiveRate = _applyDiscount(baseRatePerSecond, worldIdVerified);
        streamId = keccak256(abi.encodePacked(msg.sender, seller, block.timestamp, streamCount++));

        streams[streamId] = Stream({
            buyer: msg.sender,
            seller: seller,
            baseRatePerSecond: baseRatePerSecond,
            effectiveRate: effectiveRate,
            depositedAmount: deposit,
            startTime: block.timestamp,
            closedTime: 0,
            status: StreamStatus.ACTIVE,
            buyerVerified: worldIdVerified
        });

        emit StreamOpened(streamId, msg.sender, seller, baseRatePerSecond, effectiveRate, deposit, worldIdVerified);
    }

    /// @notice Add USDC to an active stream (extends stream duration)
    function topUp(bytes32 streamId, uint256 amount) external {
        Stream storage s = streams[streamId];
        require(s.status == StreamStatus.ACTIVE, "Not active");
        require(msg.sender == s.buyer, "Only buyer");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        s.depositedAmount += amount;

        emit StreamToppedUp(streamId, amount, s.depositedAmount);
    }

    function isSolvent(bytes32 streamId) external view returns (bool) {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) return false;
        return _consumed(s) < s.depositedAmount;
    }

    /// @notice Returns seconds until insolvency (0 if already insolvent)
    function timeRemaining(bytes32 streamId) external view returns (uint256) {
        Stream storage s = streams[streamId];
        if (s.status != StreamStatus.ACTIVE) return 0;
        uint256 consumed = _consumed(s);
        if (consumed >= s.depositedAmount) return 0;
        return (s.depositedAmount - consumed) / s.effectiveRate;
    }

    /// @notice Anyone can terminate an insolvent stream after grace period
    function terminateInsolvency(bytes32 streamId) external {
        Stream storage s = streams[streamId];
        require(s.status == StreamStatus.ACTIVE, "Not active");

        uint256 elapsed = block.timestamp - s.startTime;
        uint256 consumed = elapsed * s.effectiveRate;
        // Must be insolvent for longer than grace period
        require(consumed > s.depositedAmount, "Still solvent");
        uint256 insolvencyStart = s.startTime + (s.depositedAmount / s.effectiveRate);
        require(block.timestamp >= insolvencyStart + GRACE_PERIOD, "Grace period active");

        s.status = StreamStatus.TERMINATED;
        s.closedTime = insolvencyStart; // close at insolvency point, not now

        uint256 actualConsumed = s.depositedAmount; // fully consumed
        usdc.safeTransfer(s.seller, actualConsumed);

        emit StreamTerminated(streamId, actualConsumed, 0);
    }

    function closeStream(bytes32 streamId, uint256 actualConsumed) external onlyCoordinator {
        Stream storage s = streams[streamId];
        require(s.status == StreamStatus.ACTIVE, "Not active");
        require(actualConsumed <= s.depositedAmount, "Consumed exceeds deposit");

        s.status = StreamStatus.CLOSED;
        s.closedTime = block.timestamp;

        uint256 refund = s.depositedAmount - actualConsumed;
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }
        if (actualConsumed > 0) {
            usdc.safeTransfer(s.seller, actualConsumed);
        }

        emit StreamClosed(streamId, actualConsumed, refund);
    }
}
```

**Advanced stablecoin logic features (targeting Arc "Best Smart Contracts" track):**
- **Tiered pricing via `_applyDiscount`** — World ID verified buyers pay 20% less. The effective rate is computed on-chain and stored per stream. This creates identity-conditioned USDC flows.
- **Top-up mechanism via `topUp`** — buyers can extend stream duration by adding USDC without restarting. Prevents premature stream death.
- **Auto-termination via `terminateInsolvency`** — permissionless: anyone can terminate an insolvent stream, but only after a 30-second grace period. The stream closes at the exact insolvency timestamp, not the termination call time — seller gets exactly what was earned, nothing more.
- **`timeRemaining` view** — frontend can show a countdown to insolvency, enabling the buyer agent to top up proactively.

**World ID verification flow:**
- Verification happens offchain via IDKitWidget (frontend) + Cloud API (backend)
- The boolean `worldIdVerified` is passed to `openStream` — contract trusts the coordinator
- Sellers can check `streams[streamId].buyerVerified` to decide whether to accept the stream

**Contract size:** ~150 lines. Still minimal, but with genuinely advanced programmable stablecoin logic.

---

## Component 2: Coordinator (TypeScript / Express Backend)

The traffic controller. Core responsibilities:

```typescript
// Pseudocode structure

class StreamCoordinator {
    // Receive per-second authorization from buyer agent
    async submitAuthorization(streamId: string, auth: EIP3009Auth) {
        // 1. Verify EIP-3009 signature
        // 2. Check stream solvency on-chain via StreamVault.isSolvent()
        // 3. Check authorization hasn't expired (validBefore window)
        // 4. Forward to Circle Nanopayments API
        // 5. Update internal stream state (authorization count, total consumed)
        // 6. Notify seller that stream is still active
    }

    // Called by seller to check if they should keep working
    async isStreamActive(streamId: string): Promise<boolean> {
        // Check internal state + on-chain solvency
    }

    // Stream lifecycle management
    async openStream(params: StreamParams): Promise<string> { ... }
    async closeStream(streamId: string): Promise<void> { ... }
}
```

Key technical details:
- The `validBefore` window on each EIP-3009 authorization is ~5 seconds. Stale authorizations expire automatically.
- The coordinator calls `StreamVault.isSolvent()` periodically (not on every tick — that would be too many RPC calls). Every 5-10 seconds is fine.
- If solvency check fails, coordinator immediately notifies seller to stop work.

---

## Component 3: Seller API — Mock Audit Scanner (Express + SSE)

A mock AI security audit endpoint that demonstrates the x402 + streaming flow:

```typescript
// Pseudocode

app.post('/api/audit', async (req, res) => {
    // 1. No payment header? Return 402
    if (!req.headers['payment-signature']) {
        return res.status(402).json({
            paymentRequired: true,
            scheme: 'exact',
            baseRatePerSecond: 100,  // $0.0001/sec in USDC micro-units
            network: 'arc-testnet',
            sellerAddress: '0x...',
            sellerENS: 'audit.kronoscan.eth',
            acceptsUnverified: true,
            coordinatorUrl: 'ws://localhost:3001'
        });
    }

    // 2. Resolve contract source (address OR raw source)
    let contractSource = req.body.contractSource;
    if (req.body.contractAddress && !contractSource) {
        // Fetch verified source from block explorer API
        contractSource = await fetchVerifiedSource(req.body.contractAddress, req.body.chain);
        if (!contractSource) return res.status(400).json({ error: 'Contract not verified' });
    }

    // 3. Valid stream? Start SSE response
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    
    // 4. Stream pre-written vulnerability findings one by one
    const findings = [
        { severity: 'CRITICAL', title: 'Reentrancy in withdraw()', line: 47, desc: 'State updated after external call' },
        { severity: 'HIGH', title: 'Unchecked return value', line: 83, desc: 'transfer() return not checked' },
        { severity: 'MEDIUM', title: 'No zero-address check', line: 12, desc: 'Constructor accepts address(0)' },
        { severity: 'LOW', title: 'Missing indexed event param', line: 31, desc: 'Event should index key fields' },
        // ... more pre-written findings
    ];
    
    for (const finding of findings) {
        const active = await coordinator.isStreamActive(streamId);
        if (!active) break;
        
        res.write(`data: ${JSON.stringify(finding)}\n\n`);
        await sleep(2000);  // simulate scan time per finding
    }
    
    res.end();
});
```

**For the demo:** The seller API is a mock scanner. It does NOT do real static analysis. It has pre-written vulnerability findings matched to a sample vulnerable contract that it streams via SSE. The findings must look credible — reference real vulnerability patterns (reentrancy, unchecked calls, access control) against the sample contract shown in the dashboard. The point of the demo is the payment flow, not the AI scanning quality.

**Two input modes:**
- **Source mode:** User pastes Solidity source code directly. Used for the pre-written demo flow.
- **Address mode:** User pastes a deployed contract address + chain. Seller API calls the block explorer API (`GET /api?module=contract&action=getsourcecode&address=0x...`) to fetch verified source. If the contract isn't verified, returns an error. This mode demonstrates on-chain contract auditing — the compelling "audit any deployed contract" story.

**Sample contract for the demo:** Use an intentionally vulnerable Solidity contract (or inject a few bugs into a copy of StreamVault.sol). Pre-write 8-12 findings that accurately describe the injected vulnerabilities. Judges who write Solidity will spot nonsensical findings.

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
    
    // 3. Submit contract for audit → get 402 response with pricing
    const pricingInfo = await probeService('https://seller-api/audit');
    
    // 4. Open stream on StreamVault (deposit USDC, pass World ID verification)
    const streamId = await streamVault.openStream(
        sellerAddress, pricingInfo.baseRatePerSecond, depositAmount, worldIdVerified
    );
    
    // 5. Start per-second authorization tick loop
    const tickInterval = setInterval(async () => {
        const auth = signEIP3009Authorization({
            from: agentWallet.address,
            to: sellerAddress,
            value: pricingInfo.effectiveRate,  // discounted if verified
            validAfter: now(),
            validBefore: now() + 5,
            nonce: randomBytes(32)
        });
        await coordinator.submitAuthorization(streamId, auth);
    }, 1000);
    
    // 6. Simultaneously consume the SSE stream of vulnerability findings
    // Two input modes: raw source OR on-chain address
    const response = await fetch('https://seller-api/audit', {
        method: 'POST',
        headers: { 'payment-signature': initialAuth },
        body: JSON.stringify({
            contractSource: sampleVulnerableContract,  // OR:
            // contractAddress: '0x...', chain: 'arc-testnet'  // fetch verified source on-chain
        })
    });
    for await (const chunk of response.body) {
        displayFindingOnDashboard(chunk);  // severity-tagged findings appearing live
    }
    
    // 7. Close stream, get refund
    clearInterval(tickInterval);
    await streamVault.closeStream(streamId);
}
```

---

## Component 5: Frontend Dashboard (Next.js)

The demo centerpiece. This is what judges see and remember.

**Layout (single page):**

Top section:
- Agent identity: wallet address + "World ID Verified" badge
- Service target: `audit.kronoscan.eth` (ENS name, resolved)
- **Contract input:** Toggle between "Paste Source" (textarea) and "On-Chain Address" (address input + chain selector). For address mode, fetched source is displayed after resolution.
- Target contract: resolved or pasted Solidity source displayed

Middle section (the star):
- Big live cost counter: `$0.0024` ticking up every second
- Rate display: "Base: $0.0001/s → Effective: $0.00008/s (Verified -20%)"
- Progress bar showing deposit consumed vs remaining
- Time remaining countdown (from `timeRemaining()` view function)
- Stream status indicator: IDLE → OPENING → ACTIVE → CLOSING → CLOSED
- Authorization count: "30 authorizations sent"

Right/bottom section:
- Vulnerability findings panel: findings appear one-by-one with severity badges
  - CRITICAL (red), HIGH (orange), MEDIUM (yellow), LOW (blue)
  - Each finding shows: severity, title, line number, description
  - Visually dramatic — each finding "pops" onto screen

End state:
- Findings summary: "3 Critical, 2 High, 4 Medium, 3 Low"
- Duration: 30 seconds
- Total cost: $0.0024 (with verified discount)
- Refund: $0.9976
- Settlement tx + Refund tx links to ArcScan
- Comparison: "Traditional audit: $5,000+ / 2 weeks | KronoScan: $0.0024 / 30 seconds"

**Tech:** Next.js app. Uses WebSocket or polling to the Coordinator for real-time stream state updates. SSE connection to seller API for the streaming text.

---

## The Demo Script (90 seconds live)

This is the exact flow Martin will present to judges:

**[0:00]** Dashboard shows contract input with two modes: "Paste Source" and "On-Chain Address". Agent wallet: $1.00 USDC. Status: IDLE. A sample contract address is entered (or source pasted).

*"This is an AI auditing agent with $1 of USDC on Arc. It's backed by a World ID — a verified human is accountable for this agent. It can audit any smart contract — paste source code, or enter a deployed contract address and we'll fetch the verified source on-chain."*

**[0:10]** Click "Run Audit". Dashboard shows:
```
🔍 Resolving service... audit.kronoscan.eth → 0x7f3a...
📨 Received 402 Payment Required — Base rate: $0.0001/sec
🌐 Agent verified via World ID ✅
💳 Opening stream... Verified discount applied: $0.00008/sec (20% off)
✅ Stream opened [ArcScan link]
```

*"The agent resolved the audit service by its ENS name. The service wants $0.0001 per second — but because this agent is World ID verified, the smart contract automatically applies a 20% trust discount. Verified auditors have reputation at stake, so they earn a lower rate."*

**[0:20]** Findings start streaming in live, each with severity badge:
```
🔴 CRITICAL: Reentrancy in withdraw() — state updated after external call (line 47)
🟠 HIGH: Unchecked return value in transfer() (line 83)
🟡 MEDIUM: No zero-address check in constructor (line 12)
🔵 LOW: Missing indexed parameter in event (line 31)
```

*"Every second, the agent signs a payment authorization — no gas, no blockchain transaction. The audit service keeps scanning as long as payment flows. Watch the findings appear in real-time with severity ratings."*

**[0:45]** Scan complete. Stream closes automatically.
```
✅ 12 findings (3 Critical, 2 High, 4 Medium, 3 Low)
   Duration: 30 seconds | Cost: $0.0024 | Refund: $0.9976
   Verified savings: 20% discount applied
```

*"30 seconds. 12 vulnerabilities found. Total cost: $0.0024. A traditional audit firm would quote $5,000 and take two weeks. The unused deposit — $0.9976 — was refunded automatically on-chain."*

**[1:05]** Click through ArcScan links. Show the StreamOpened event (with effectiveRate vs baseRate) and refund transaction.

*"Everything on-chain. The audit, the payments, the refund — all verifiable on Arc. And the agent's World ID proof means a real human is accountable for these findings. When AI auditing tools compete on price, KronoScan is the payment layer."*

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
- Boolean `worldIdVerified` passed to `StreamVault.openStream()`
- Verified agents get 20% rate discount on-chain — economic consequence, not just a badge

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

### EIP-3009 TransferWithAuthorization
This is the signature format used by Circle Nanopayments. The buyer signs an offchain authorization that allows transferring USDC from their Gateway Wallet to the seller. Fields: `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`. The `validBefore` window (5 seconds) ensures stale authorizations expire automatically.

### Arc Blockchain
- EVM-compatible L1 from Circle
- USDC is the native gas token (no ETH needed — agents hold only USDC)
- Testnet RPC and explorer (ArcScan) available
- Arc docs: https://docs.arc.network/arc/concepts/welcome-to-arc

### Circle Nanopayments
- Batches thousands of EIP-3009 signatures into single on-chain settlement
- Minimum payment: $0.000001 USDC
- Early access fee: 0.5 bps (0.05%) — expires June 30, 2026
- SDK: `@circle-fin/x402-batching` — provides `GatewayClient` class
- No API key needed — wallet private key + chain config is sufficient
- Buyer flow: `client.deposit("1")` → `client.pay(url)` (handles 402 negotiation automatically)
- Docs: https://developers.circle.com/gateway/nanopayments

### x402 Protocol
- HTTP `402 Payment Required` + `PAYMENT-SIGNATURE` header + `PAYMENT-RESPONSE` header
- Scheme: `exact` with EIP-3009 payload
- Stateless — any agent can pay any service without account creation

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

## File Structure (Suggested)

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
│   │   ├── index.ts          # Express server entry
│   │   ├── streamManager.ts  # Stream lifecycle
│   │   ├── authValidator.ts  # EIP-3009 signature validation
│   │   ├── nanopayments.ts   # Circle Nanopayments API client
│   │   ├── ensResolver.ts    # ENS name resolution
│   │   └── worldId.ts        # World ID verification
│   └── package.json
├── seller-api/
│   ├── src/
│   │   ├── index.ts          # Express + SSE audit endpoint
│   │   ├── x402Handler.ts    # 402 payment negotiation
│   │   ├── sourceResolver.ts # Fetch verified source from block explorer API (on-chain address → source)
│   │   └── findings.ts       # Pre-written vulnerability findings for demo
│   └── package.json
├── agent/
│   ├── src/
│   │   ├── index.ts          # Demo audit agent script
│   │   ├── streamClient.ts   # KronoScan client SDK
│   │   ├── wallet.ts         # Agent wallet management
│   │   └── sampleContract.ts # Vulnerable Solidity contract for demo
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # Main dashboard
│   │   └── components/
│   │       ├── CostMeter.tsx
│   │       ├── StreamStatus.tsx
│   │       ├── FindingsPanel.tsx
│   │       ├── AgentIdentity.tsx   # World ID + ENS display
│   │       └── RefundSummary.tsx
│   ├── package.json
│   └── next.config.js
├── CLAUDE.md                  # This file
└── README.md
```

---

## Implementation Priority Order

Build in this order. Each step produces a demoable increment.

### Phase 1: Core streaming (Days 1-3)
1. `StreamVault.sol` — deploy on Arc testnet
2. Coordinator — basic stream lifecycle + mock Nanopayments forwarding
3. Seller API — x402 endpoint + SSE vulnerability findings streaming
4. Buyer Agent — audit agent script that opens stream, ticks, closes

**Milestone:** End-to-end audit flow working in terminal output.

### Phase 2: Dashboard (Days 4-5)
5. Next.js dashboard — live cost meter, stream status, vulnerability findings panel, refund display
6. Sample vulnerable contract + pre-written findings for demo

**Milestone:** Visual audit demo running in browser.

### Phase 3: World ID (Days 6-7)
7. IDKitWidget + Cloud API verification in frontend/backend
8. AgentKit hooks on seller side (createAgentkitHooks)
9. Trust tier UI on dashboard ("Verified" badge + rate discount visible)

**Milestone:** World ID badge visible in demo flow.

### Phase 4: ENS (Days 8-9)
10. Audit service ENS name registration (`audit.kronoscan.eth`)
11. ENS resolution in coordinator + ENSIP-25 agent registry text records
12. ENS names displayed in dashboard instead of addresses

**Milestone:** `audit.kronoscan.eth` visible in demo flow.

### Phase 5: Polish (Day 10)
13. Demo script rehearsal
14. Video recording
15. README + architecture diagram
16. ArcScan link verification

---

## Important Reminders

- **The demo is everything.** Every line of code should serve the 90-second demo. If it doesn't appear on the dashboard or affect the demo flow, it's not a priority.
- **The seller API is a mock scanner.** It doesn't do real static analysis. It streams pre-written vulnerability findings via SSE. Findings must reference real vulnerability patterns against the sample contract shown in the demo — judges write Solidity daily.
- **Arc uses USDC for gas.** The agent only ever holds USDC. No ETH, no second token. This is a genuine selling point — mention it in the demo.
- **Circle Nanopayments may need to be partially mocked** for the hackathon if API access is limited. The EIP-3009 signing flow should be real; the actual Circle API forwarding can be simulated if needed. The on-chain StreamVault interactions must be real.
- **Present at ENS booth Sunday morning** — this is a requirement for the ENS prize.
- **Keep the contract focused.** ~150 lines of Solidity. The contract is the referee with advanced stablecoin logic (tiered pricing, top-up, grace period, auto-termination).
