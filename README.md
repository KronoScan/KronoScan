<p align="center">
  <img src="https://img.shields.io/badge/ETHGlobal-Cannes%202026-10b981?style=for-the-badge" alt="ETHGlobal Cannes 2026" />
  <img src="https://img.shields.io/badge/ARC-Testnet-059669?style=for-the-badge" alt="ARC Testnet" />
  <img src="https://img.shields.io/badge/Solidity-^0.8.30-363636?style=for-the-badge&logo=solidity" alt="Solidity" />
  <img src="https://img.shields.io/badge/TypeScript-ESM-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

<h1 align="center">KronoScan</h1>
<h3 align="center">AI-Powered Smart Contract Security Auditing via Circle Nanopayments</h3>

<p align="center">
  <strong>AI agents scan Solidity contracts across 10 security categories.<br/>Each category is a separate x402 nanopayment on ARC — pay only for what you use.</strong>
</p>

---

## The Problem

Smart contract audits are expensive, slow, and gatekept. Traditional firms charge thousands of dollars and take weeks. Meanwhile, AI-powered security scanning is becoming fast and cheap — but there's no payment model that fits. Flat-fee APIs are wasteful, and there's no trust layer to distinguish a legitimate auditor from a bot scraping vulnerability data.

## The Solution

KronoScan combines **Circle Nanopayments** with an **on-chain escrow vault** on ARC blockchain. The first application: AI-powered smart contract security auditing, where autonomous agents pay per audit category via x402 micropayments.

An agent deposits USDC into StreamVault, scans a contract across 10 security categories — each triggering a separate nanopayment — then closes the session. Unused budget is automatically refunded on-chain. The entire audit takes under 60 seconds and costs a fraction of a cent.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND DASHBOARD                       │
│                     React + Vite + WebSocket                    │
│         Real-time session state, findings, ArcScan links        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ WebSocket
┌──────────────────────────────┼──────────────────────────────────┐
│                        BUYER AGENT                              │
│                                                                 │
│  1. Resolves seller via ENS: audit.kronoscan.eth               │
│  2. Opens session on StreamVault (deposits USDC)               │
│  3. For each audit category:                                   │
│     → GatewayClient.pay(url) — real x402 nanopayment           │
│     → Receives findings via SSE                                │
│  4. Session closes → unused deposit refunded on-chain          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ WebSocket
┌──────────────────────────────┼──────────────────────────────────┐
│                        COORDINATOR                              │
│                                                                 │
│  • Session lifecycle (open → active → closing → closed)        │
│  • Reports consumption on-chain via StreamVault                │
│  • Solvency watchdog (checks budget every 5s)                  │
│  • Pushes real-time updates to dashboard via WebSocket         │
│  • Spawns buyer agent on demand                                │
└─────────────┬───────────────────────┬───────────────────────────┘
              │                       │
              ▼                       ▼
┌─────────────────────┐  ┌──────────────────────────────────────┐
│  StreamVault.sol     │  │          SELLER API                  │
│  (ARC Testnet)       │  │                                      │
│                      │  │  10 audit category endpoints:        │
│  • USDC escrow       │  │    POST /api/audit/reentrancy        │
│  • Tiered pricing    │  │    POST /api/audit/access-control    │
│  • Consumption       │  │    POST /api/audit/arithmetic        │
│    tracking          │  │    POST /api/audit/external-calls    │
│  • Top-up            │  │    POST /api/audit/token-standards   │
│  • Session timeout   │  │    POST /api/audit/business-logic    │
│  • Auto-refund       │  │    POST /api/audit/gas-optimization  │
│                      │  │    POST /api/audit/code-quality      │
│                      │  │    POST /api/audit/compiler          │
│                      │  │    POST /api/audit/defi              │
│                      │  │                                      │
│                      │  │  Each endpoint is x402-protected     │
│                      │  │  AI analysis via DeepSeek + fallback │
│                      │  │  Findings streamed via SSE           │
└─────────────────────┘  └──────────────────────────────────────┘
```

---

## Circle Nanopayments & x402 — The Core Payment Layer

KronoScan is built on top of **Circle Nanopayments**, the gas-free micropayment protocol on ARC blockchain. Every interaction between the buyer agent and the seller API is a real x402 payment.

### How it works

1. **The seller API returns `402 Payment Required`** when an agent hits an audit endpoint without payment. The response includes pricing terms, the seller address, and the payment scheme.

2. **The buyer agent uses `GatewayClient.pay(url)`** to sign an EIP-3009 `TransferWithAuthorization` offchain. Circle handles the signature, attaches it as a payment header, and the request goes through.

3. **The seller validates the payment** via the x402 middleware (`@x402/express`), which verifies the signature and confirms the amount. Only then are findings returned.

4. **Circle batches settlements** — individual EIP-3009 signatures are batched into a single on-chain transaction for settlement. Sub-cent USDC transfers with no gas cost to either party.

### Why this matters

- **Per-request granularity** — each of the 10 audit categories is a separate nanopayment. The agent pays only for the categories it needs.
- **Variable pricing** — complex categories (business logic, DeFi) cost more than straightforward ones (compiler, code quality). Prices reflect actual analysis complexity.
- **No API keys, no subscriptions** — just a wallet with USDC. Any agent can pay for an audit, instantly, permissionlessly.
- **ARC's native USDC** — on ARC, USDC is the native gas token. Agents hold a single currency for both payments and gas — no ETH, no token swaps.

### Agent-side payment flow

```typescript
// The agent wraps fetch with x402 payment capability
const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
const { registerBatchScheme } = await import("@circle-fin/x402-batching/client");

const client = new x402Client();
registerBatchScheme(client, { signer, fallbackScheme: new ExactEvmScheme(signer) });
const paymentFetch = wrapFetchWithPayment(fetch, client);

// Each category request is a paid x402 call
const response = await paymentFetch(`${sellerUrl}/api/audit/reentrancy`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contractSource }),
});
```

### Seller-side x402 middleware

```typescript
// x402 middleware protects all audit endpoints
import { paymentMiddlewareFromConfig } from "@x402/express";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";

const routes = {};
for (const category of AUDIT_CATEGORIES) {
  routes[`POST /api/audit/${category}`] = {
    accepts: {
      scheme: "exact",
      network: "eip155:5042002", // ARC Testnet
      payTo: SELLER_ADDRESS,
      price: "$0.0001",
      asset: USDC_ADDRESS,
    },
  };
}

app.use(paymentMiddlewareFromConfig(routes, [new BatchFacilitatorClient()], [...]));
```

---

## StreamVault.sol — On-Chain Escrow

StreamVault is the on-chain escrow contract deployed on ARC testnet. It adds a trust layer on top of Nanopayments — locking deposits, tracking consumption, and handling refunds trustlessly.

### Features

| Feature | Description |
|---------|-------------|
| **Session escrow** | Buyer deposits USDC. Locked until session closes. |
| **Identity-conditioned pricing** | Verified agents get a 20% discount computed on-chain via basis points. |
| **Consumption tracking** | Coordinator reports each nanopayment amount via `reportConsumption()`. Running total maintained on-chain. |
| **Top-up** | Buyers can add USDC to an active session without restarting. |
| **Session timeout** | Permissionless — anyone can terminate an expired session after `MAX_SESSION_DURATION`. Safety net for coordinator failure. |
| **Automatic refund** | On close: consumed amount goes to seller, remainder returned to buyer. |
| **Solvency check** | `isSolvent()` and `requestsRemaining()` views let the coordinator and frontend track budget in real time. |

### Contract interface

```solidity
function openSession(address seller, uint256 pricePerRequest, uint256 deposit, bool worldIdVerified)
    external returns (bytes32 sessionId);

function reportConsumption(bytes32 sessionId, uint256 amount) external;  // onlyCoordinator
function closeSession(bytes32 sessionId) external;                       // onlyCoordinator
function topUp(bytes32 sessionId, uint256 amount) external;              // onlyBuyer
function terminateExpired(bytes32 sessionId) external;                   // permissionless

function isSolvent(bytes32 sessionId) external view returns (bool);
function requestsRemaining(bytes32 sessionId) external view returns (uint256);
```

### Tests

28 tests covering session lifecycle, consumption tracking, solvency checks, top-up mechanics, session timeout, event emissions, and multi-session isolation. Built with Foundry.

```bash
cd contracts && forge test -vvv
```

---

## ENS Integration — Service Discovery for the Agentic Economy

ENS is not cosmetic in KronoScan. It is the mechanism by which agents **discover audit services** without hardcoded addresses or centralized registries.

### What `audit.kronoscan.eth` stores on-chain

The ENS name resolves to the seller's wallet address and stores all service metadata as **text records**:

| Text Record | Purpose |
|-------------|---------|
| `url` | Seller API endpoint |
| `description` | Human-readable service description |
| `com.kronoscan.categories` | Supported audit categories (comma-separated) |
| `com.kronoscan.price` | Base price per request (atomic USDC) |
| `com.kronoscan.network` | Target blockchain (e.g., `eip155:5042002`) |
| `com.kronoscan.payment` | Payment protocol (`x402`) |
| `com.kronoscan.scan-modes` | Available scan depths (`standard,deep`) |

### Agent resolution flow

```
audit.kronoscan.eth
    → resolves to 0x7f3a... (seller wallet address)
    → text records provide API URL, pricing, categories, payment protocol
    → agent connects and pays — zero hardcoded configuration
```

When `ENS_SERVICE_NAME` is set, the buyer agent calls `resolveServiceConfig()` which:
1. Resolves the ENS name on Sepolia to get the seller address
2. Reads all text records to discover API URL, pricing, supported categories, and scan modes
3. Uses the discovered config instead of `.env` values

If the seller moves servers, changes pricing, or adds categories — they update ENS text records. Every agent resolves the new config automatically. No code changes, no redeployment.

### ENSIP-25 — AI Agent Registry

The audit service is registered under **ENSIP-25**, the ENS standard for AI agent discoverability. This means the service is not just an ENS name — it's an entry in a decentralized agent directory that other agents and marketplaces can query.

```typescript
// ENSIP-25 agent registration record
"agent-registration[0x0000...][audit-v1]": "1"
```

### ENS setup script

```bash
npx tsx scripts/ens-setup.ts
```

Registers the `audit.kronoscan.eth` subname on Sepolia, sets the address, and writes all text records in a single script.

---

## Project Structure

```
kronoscan/
├── contracts/                   # Foundry project — Solidity smart contracts
│   ├── src/
│   │   ├── StreamVault.sol      # On-chain escrow with tiered pricing + auto-refund
│   │   └── mocks/MockUSDC.sol   # Test mock for USDC
│   ├── test/
│   │   └── StreamVault.t.sol    # 28 tests — full lifecycle coverage
│   ├── script/
│   │   └── Deploy.s.sol         # Deployment script for ARC testnet
│   └── foundry.toml
│
├── coordinator/                 # Session manager + WebSocket hub
│   └── src/
│       ├── index.ts             # Express + WebSocket server, agent spawner
│       ├── sessionManager.ts    # Session lifecycle state machine
│       ├── vaultClient.ts       # StreamVault on-chain interactions (viem)
│       ├── abi.ts               # StreamVault ABI
│       ├── types.ts             # Session + WebSocket message types
│       └── errors.ts            # Custom error classes
│
├── seller-api/                  # x402-protected audit service
│   └── src/
│       ├── index.ts             # Express server, 10 audit routes, SSE streaming
│       ├── x402.ts              # x402 middleware (real + stub modes)
│       ├── deepseekAnalyzer.ts  # AI-powered analysis via DeepSeek API
│       ├── prompts.ts           # Per-category security analysis prompts
│       ├── findings.ts          # Pre-written fallback findings
│       ├── sampleContract.ts    # Intentionally vulnerable demo contract
│       ├── sourceResolver.ts    # Fetch verified source from ArcScan explorer
│       └── types.ts             # Categories, pricing, finding types
│
├── agent/                       # Autonomous buyer agent
│   └── src/
│       ├── index.ts             # Main entry point — full audit flow
│       ├── config.ts            # Config + ENS service resolution
│       ├── auditRunner.ts       # 10-category audit loop with per-category pricing
│       ├── coordinatorClient.ts # WebSocket client to coordinator
│       ├── vaultClient.ts       # On-chain session opening (approve + openSession)
│       ├── x402Client.ts        # Payment client (real x402 SDK or fallback)
│       └── sseParser.ts         # Server-Sent Events parser
│
├── shared/                      # Shared utilities
│   └── ensResolver.ts           # ENS name → ServiceConfig resolver (Sepolia)
│
├── scripts/
│   └── ens-setup.ts             # One-time ENS subname + text records setup
│
├── frontend/                    # React + Vite dashboard
│   └── src/
│       ├── App.tsx              # Main audit dashboard with real-time updates
│       ├── LandingPage.tsx      # Marketing landing page
│       ├── hooks/
│       │   └── useCoordinator.ts # WebSocket hook for session state
│       └── components/          # UI components (logo, animations, etc.)
│
└── docs/                        # Design specs and plans
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Solidity ^0.8.30, Foundry (forge/cast/anvil) |
| Blockchain | ARC Testnet (Chain ID: 16180) — USDC as native gas token |
| Payments | Circle Nanopayments, x402 protocol, EIP-3009 |
| Backend | TypeScript, Express, WebSocket (`ws`) |
| Frontend | React 19, Vite, Tailwind CSS |
| AI analysis | DeepSeek API (with pre-written fallback) |
| EVM client | viem |
| ENS | Sepolia — name resolution + text records + ENSIP-25 |
| Contract explorer | ArcScan (`testnet.arcscan.app`) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast)
- A wallet with USDC on ARC testnet

### Environment

Create a `.env` file in the project root:

```env
# Wallet
PRIVATE_KEY=0x...                           # Deployer/agent private key

# ARC Testnet
ARC_TESTNET_RPC=https://rpc.testnet.arc.network
USDC_ADDRESS=0x3600000000000000000000000000000000000000
VAULT_ADDRESS=0x...                         # After deploying StreamVault

# Coordinator
COORDINATOR_ADDRESS=0x...                   # Coordinator wallet address
COORDINATOR_URL=http://localhost:3001
COORDINATOR_WS_URL=ws://localhost:3001/ws

# Seller API
SELLER_API_URL=http://localhost:3002
SELLER_ADDRESS=0x...                        # Seller wallet address

# AI Analysis (optional — falls back to pre-written findings)
DEEPSEEK_API_KEY=sk-...

# Block Explorer
ETHERSCAN_API_KEY=...                       # For fetching verified contract source

# ENS (optional)
ENS_SERVICE_NAME=audit.kronoscan.eth
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_PRIVATE_KEY=0x...                   # For ENS setup script

# x402 Mode
X402_MODE=real                              # "real" or "stub"
PAYMENT_MODE=auto                           # "auto" or "fallback"
```

### Deploy StreamVault

```bash
cd contracts
forge build
forge test
forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC --broadcast
```

### Install dependencies

```bash
# From project root
npm install

# Each service
cd coordinator && npm install
cd ../seller-api && npm install
cd ../agent && npm install
cd ../frontend && npm install
```

### Pre-build the agent (for fast startup)

```bash
cd agent && npm run build
```

### Start all services

```bash
# Terminal 1 — Coordinator (port 3001)
cd coordinator && npm run dev

# Terminal 2 — Seller API (port 3002)
cd seller-api && npm run dev

# Terminal 3 — Frontend (port 5173)
cd frontend && npm run dev
```

### Run an audit

Option A — **From the dashboard**: Open `http://localhost:5173`, click "Run Audit". The coordinator spawns the agent automatically.

Option B — **From the CLI**:
```bash
cd agent && npm start
```

### Set up ENS (optional)

```bash
npx tsx scripts/ens-setup.ts
```

Registers `audit.kronoscan.eth` on Sepolia with all service metadata as text records.

---

## The Demo Flow

1. Dashboard loads — agent wallet funded with USDC on ARC
2. Click "Run Audit" — agent spawns, resolves `audit.kronoscan.eth` via ENS
3. Session opens on StreamVault — USDC deposited into escrow
4. 10 audit categories run sequentially:
   - Each triggers a separate x402 nanopayment
   - Findings stream in real-time via SSE → WebSocket → dashboard
   - Cost counter increments per category
   - Each nanopayment has a clickable ArcScan transaction link
5. Session closes — consumed USDC goes to seller, remainder refunded to buyer
6. Summary: findings by severity, total cost, refund amount, ArcScan links

---

## Audit Categories

| Category | What it detects |
|----------|----------------|
| Reentrancy | State changes after external calls, cross-function reentrancy |
| Access Control | Missing modifiers, tx.origin misuse, zero-address checks |
| Arithmetic | Division before multiplication, unsafe casting, precision loss |
| External Calls | Unchecked return values, low-level call safety |
| Token Standards | ERC20/721 compliance issues, missing interface support |
| Business Logic | Flawed invariants, incorrect state transitions |
| Gas Optimization | Unbounded loops, redundant storage reads, packing |
| Code Quality | Magic numbers, missing events, unclear naming |
| Compiler | Floating pragma, deprecated patterns, version issues |
| DeFi-Specific | Oracle manipulation, flash loan vectors, slippage |

Each category has a specialized DeepSeek prompt tuned for that vulnerability class. If the DeepSeek API is unavailable, pre-written findings provide a reliable fallback for demos.

---

## On-Chain Contract Address Input

The seller API accepts two input modes:

- **Paste Source** — raw Solidity source code sent directly
- **On-Chain Address** — the seller API calls ArcScan's Etherscan-compatible API to fetch verified contract source

```
POST /api/resolve-source
{ "contractAddress": "0x...", "chain": "arc-testnet" }
→ { "source": "// SPDX-License-Identifier: MIT\npragma solidity..." }
```

If the contract is not verified on the block explorer, the API returns a clear error — no bytecode decompilation.

---

## Hackathon Targets

| Track | Sponsor | What qualifies us |
|-------|---------|-------------------|
| Best Agentic Economy with Nanopayments | ARC | Core product — AI agents paying per-request via x402 across 10 audit categories |
| Best Smart Contracts with Advanced Stablecoin Logic | ARC | StreamVault — tiered pricing, consumption tracking, session timeout, top-up, auto-refund |
| Best ENS Integration for AI Agents | ENS | Service discovery via ENS text records, ENSIP-25 agent registry, dynamic configuration |

---

## Key Design Decisions

- **x402 per-request, not per-second** — each audit category is a discrete payment. Simpler, more transparent, and aligns with how agents actually consume services.
- **On-chain escrow supplements Nanopayments** — StreamVault adds budget guarantees, identity-conditioned pricing, and trustless refunds that pure x402 doesn't provide.
- **ENS for service discovery** — agents resolve a name, not a hardcoded URL. Text records store the full service interface. Sellers can update config without touching agent code.
- **DeepSeek + fallback** — real AI analysis when the API is available, pre-written findings as a reliable demo fallback. The system works either way.
- **Variable per-category pricing** — complex analysis (business logic, DeFi) costs more than straightforward checks (compiler, code quality). Reflects real analysis complexity.
- **ARC-native USDC** — agents hold one currency for both gas and payments. No ETH, no token swaps, no bridging.

---

## Built With

- [Circle Nanopayments](https://developers.circle.com/gateway/nanopayments) — x402 micropayments on ARC
- [ARC Blockchain](https://docs.arc.network/) — EVM L1 with native USDC
- [ENS](https://docs.ens.domains/) — Name resolution + text records + ENSIP-25
- [Foundry](https://book.getfoundry.sh/) — Solidity development toolchain
- [viem](https://viem.sh/) — TypeScript EVM client
- [DeepSeek](https://deepseek.com/) — AI-powered code analysis

---

<p align="center">
  Built for <strong>ETHGlobal Cannes 2026</strong>
</p>
