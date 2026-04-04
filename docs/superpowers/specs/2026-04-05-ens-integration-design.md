# ENS Integration — Service Discovery for the Agentic Economy

## Goal

Turn ENS from a display label into a **service discovery protocol**. The buyer agent discovers everything about the audit service — address, pricing, categories, payment protocol — by reading ENS text records. No hardcoded seller config. ENSIP-25 agent registry attestation included.

## Target Prize Tracks

- **Best ENS Integration for AI Agents** ($5K) — agent identity + discoverability via ENS
- **Most Creative Use of ENS** ($5K) — text records as machine-readable service metadata

## Architecture

### Components

| Component | Role | Changes |
|-----------|------|---------|
| `scripts/ens-setup.ts` | One-time setup script | New — creates subname + sets text records on Sepolia |
| `shared/ensResolver.ts` | Shared ENS resolution utility | New — resolves name → address + typed ServiceConfig |
| `agent/src/config.ts` | Agent configuration | Modified — resolves config from ENS instead of hardcoded env vars |
| `agent/src/index.ts` | Agent entry point | Modified — ENS resolution step before session open |
| `coordinator/src/index.ts` | Coordinator | Modified — includes ENS name in session events |
| `.env` | Environment | Modified — adds `SEPOLIA_RPC`, `SEPOLIA_PRIVATE_KEY`, `ENS_SERVICE_NAME` |

### Data Flow

```
1. One-time setup (manual):
   scripts/ens-setup.ts → Sepolia → registers audit.kronoscan.eth + text records

2. Agent startup:
   Agent reads ENS_SERVICE_NAME ("audit.kronoscan.eth") from .env
   → resolves on Sepolia via viem Universal Resolver
   → gets seller address + text records (price, categories, url, network)
   → uses these to configure session (replaces hardcoded SELLER_ADDRESS, PRICE_PER_REQUEST, etc.)

3. Coordinator:
   Includes ENS name in session_opened WS message
   → Dashboard displays "audit.kronoscan.eth" instead of raw address
```

## ENS Name & Text Records

### Name hierarchy

```
kronoscan.eth                     ← parent (registered manually on Sepolia)
└── audit.kronoscan.eth           ← subname (created by setup script)
    ├── addr → 0x3fbE3Ad...       ← seller wallet address
    └── text records (below)
```

### Text records schema

| Key | Example Value | Purpose |
|-----|---------------|---------|
| `description` | `AI-powered smart contract security audit` | Human-readable service description |
| `url` | `http://localhost:3002` | Seller API base URL |
| `com.kronoscan.categories` | `reentrancy,access-control,arithmetic,external-calls,token-standards,business-logic,gas-optimization,code-quality,compiler,defi` | Available audit categories (comma-separated) |
| `com.kronoscan.price` | `100` | Price per request in atomic USDC |
| `com.kronoscan.network` | `eip155:5042002` | Payment chain (Arc testnet chain ID) |
| `com.kronoscan.payment` | `x402` | Payment protocol |
| `com.kronoscan.scan-modes` | `standard,deep` | Available scan modes |
| `agent-registration[0x0000000000000000000000000000000000000000][audit-v1]` | `1` | ENSIP-25 attestation (registry address is placeholder until a real registry is deployed) |

Keys follow ENS reverse-dot-notation convention (`com.kronoscan.*`) for service-specific records.

## Setup Script (`scripts/ens-setup.ts`)

### Prerequisites (manual steps before running)

1. Register `kronoscan.eth` on Sepolia at `sepolia.app.ens.domains` (done)
2. Get Sepolia ETH from a faucet for gas
3. Add to `.env`:
   - `SEPOLIA_RPC` — Sepolia RPC URL (free from Alchemy/Infura or public endpoint)
   - `SEPOLIA_PRIVATE_KEY` — private key of the wallet that owns `kronoscan.eth` on Sepolia

### What the script does

1. Creates subname `audit.kronoscan.eth` (sets resolver + ETH address record)
2. Sets all 8 text records in batch
3. Prints a summary of what was set
4. Idempotent — safe to re-run (overwrites existing records)

### What it does NOT do

- Register the parent name (manual browser step)
- Deploy contracts
- Touch Arc testnet

### Tech

- Uses `viem` with Sepolia chain config
- Signs with `SEPOLIA_PRIVATE_KEY`
- Calls ENS Public Resolver for `setText()` (address resolved dynamically from the name's resolver)
- Calls ENS Registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`, same on mainnet and Sepolia) for subname creation
- Run via: `npx tsx scripts/ens-setup.ts`

## Shared ENS Resolver (`shared/ensResolver.ts`)

### Interface

```typescript
interface ServiceConfig {
  sellerAddress: string;
  apiUrl: string;
  description: string;
  categories: string[];
  pricePerRequest: string;
  network: string;
  paymentProtocol: string;
  scanModes: string[];
  ensip25: boolean; // true if agent-registration record exists
}

async function resolveService(ensName: string, sepoliaRpc: string): Promise<ServiceConfig | null>
```

### Behavior

- Creates a viem public client for Sepolia
- Resolves ENS name → address via `getEnsAddress()`
- Reads text records via `getEnsText()` for each key
- Parses comma-separated values into arrays
- Returns `null` if the name doesn't resolve (caller falls back to .env)

### Dependencies

- `viem` (already installed in all packages)
- No additional packages needed

## Agent Changes

### `config.ts`

Export an async `resolveServiceConfig()` function that:
1. Reads `ENS_SERVICE_NAME` from env
2. Calls `resolveService()` from shared module
3. If successful: returns ENS-derived config
4. If fails: logs warning, returns config from existing env vars (`SELLER_ADDRESS`, `PRICE_PER_REQUEST`, etc.)

### `index.ts`

Before session open, add an ENS resolution step:
```
-- Resolving service via ENS --
  Name:        audit.kronoscan.eth
  Seller:      0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad
  Price:       100 (atomic USDC)
  Categories:  10
  Network:     eip155:5042002
  Payment:     x402
  ENSIP-25:    verified
```

## Coordinator Changes

- Add `ensName` field to `session_opened` WS message
- The buyer agent sends the ENS name when opening a session
- Coordinator passes it through to frontend via WebSocket

## Environment Variables

New additions to `.env`:

```
# ─── ENS (Sepolia) ───
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_PRIVATE_KEY=0x...  # wallet that owns kronoscan.eth on Sepolia
ENS_SERVICE_NAME=audit.kronoscan.eth
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| ENS name doesn't resolve | Warning log, fall back to `.env` values |
| Text record missing | Use default from `.env` for that field |
| Sepolia RPC down | Warning log, fall back to `.env` values |
| Setup script fails mid-way | Print which record failed, safe to re-run |

## Testing

- **Unit test**: Mock viem client, verify `resolveService()` parses records into typed `ServiceConfig`. Verify fallback when records are missing.
- **Manual verification**: After setup script, use `cast` or viem to read records back from Sepolia.
- **Integration**: Agent startup logs show ENS-resolved values.

## What Judges See

1. Agent logs show `Resolving audit.kronoscan.eth...` with all metadata derived from ENS
2. Dashboard shows `audit.kronoscan.eth` not raw addresses
3. No hardcoded seller config — everything comes from ENS text records
4. ENSIP-25 attestation visible (latest ENS standard awareness)
5. Judges can inspect `audit.kronoscan.eth` on Sepolia ENS app and see the records match

## Demo Script Addition

```
"The agent resolved the audit service by ENS name — audit.kronoscan.eth.
 Pricing, categories, payment protocol — all discovered from ENS text records.
 No hardcoded config. Any new audit service registers an ENS name and becomes
 instantly discoverable. This is service discovery for the agentic economy."
```
