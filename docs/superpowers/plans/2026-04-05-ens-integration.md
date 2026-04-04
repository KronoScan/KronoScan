# ENS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the buyer agent to discover the audit service entirely via ENS text records on Sepolia — no hardcoded seller config.

**Architecture:** A shared ENS resolver reads `audit.kronoscan.eth` on Sepolia and returns a typed `ServiceConfig`. The agent uses this at startup instead of hardcoded env vars. A one-time setup script registers the subname and sets text records. The coordinator passes the ENS name through to the frontend.

**Tech Stack:** viem (ENS built-ins: `getEnsAddress`, `getEnsText`), Sepolia testnet, ENS Public Resolver, vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `shared/ensResolver.ts` | Create | Resolve ENS name → address + text records → typed `ServiceConfig` |
| `shared/ensResolver.test.ts` | Create | Unit tests for resolver (mocked viem client) |
| `shared/package.json` | Create | Minimal package with viem dep |
| `shared/tsconfig.json` | Create | TypeScript config |
| `scripts/ens-setup.ts` | Create | One-time script: create subname + set text records on Sepolia |
| `agent/src/config.ts` | Modify | Add async `resolveServiceConfig()` with ENS lookup + fallback |
| `agent/src/index.ts` | Modify | Add ENS resolution step, use resolved config for session |
| `coordinator/src/types.ts` | Modify | Add `ensName` to `open_session` message and `session_opened` response |
| `coordinator/src/index.ts` | Modify | Pass `ensName` through session lifecycle |
| `agent/src/coordinatorClient.ts` | Modify | Send `ensName` in `openSession()` |
| `.env` | Modify | Add `SEPOLIA_RPC`, `SEPOLIA_PRIVATE_KEY`, `ENS_SERVICE_NAME` |

---

### Task 1: Shared ENS Resolver — Tests

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/ensResolver.test.ts`

- [ ] **Step 1: Scaffold shared package**

```bash
mkdir -p shared
```

Create `shared/package.json`:

```json
{
  "name": "kronoscan-shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd shared && npm install viem vitest --save-dev && npm install viem
```

- [ ] **Step 3: Write the failing tests**

Create `shared/ensResolver.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { resolveService, type ServiceConfig } from "./ensResolver.js";

// Mock viem's public client functions
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
    http: vi.fn(),
  };
});

describe("resolveService", () => {
  it("returns null when ENS name does not resolve", async () => {
    const { createPublicClient } = await import("viem");
    (createPublicClient as any).mockReturnValue({
      getEnsAddress: vi.fn().mockResolvedValue(null),
    });

    const result = await resolveService("nonexistent.eth", "https://rpc.sepolia.org");
    expect(result).toBeNull();
  });

  it("parses all text records into ServiceConfig", async () => {
    const textRecords: Record<string, string> = {
      description: "AI-powered audit",
      url: "http://localhost:3002",
      "com.kronoscan.categories": "reentrancy,access-control,arithmetic",
      "com.kronoscan.price": "100",
      "com.kronoscan.network": "eip155:5042002",
      "com.kronoscan.payment": "x402",
      "com.kronoscan.scan-modes": "standard,deep",
      "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]": "1",
    };

    const { createPublicClient } = await import("viem");
    (createPublicClient as any).mockReturnValue({
      getEnsAddress: vi.fn().mockResolvedValue("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad"),
      getEnsText: vi.fn().mockImplementation(({ key }: { key: string }) => {
        return Promise.resolve(textRecords[key] ?? null);
      }),
    });

    const result = await resolveService("audit.kronoscan.eth", "https://rpc.sepolia.org");

    expect(result).not.toBeNull();
    expect(result!.sellerAddress).toBe("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad");
    expect(result!.apiUrl).toBe("http://localhost:3002");
    expect(result!.description).toBe("AI-powered audit");
    expect(result!.categories).toEqual(["reentrancy", "access-control", "arithmetic"]);
    expect(result!.pricePerRequest).toBe("100");
    expect(result!.network).toBe("eip155:5042002");
    expect(result!.paymentProtocol).toBe("x402");
    expect(result!.scanModes).toEqual(["standard", "deep"]);
    expect(result!.ensip25).toBe(true);
  });

  it("handles missing optional text records with defaults", async () => {
    const { createPublicClient } = await import("viem");
    (createPublicClient as any).mockReturnValue({
      getEnsAddress: vi.fn().mockResolvedValue("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad"),
      getEnsText: vi.fn().mockResolvedValue(null),
    });

    const result = await resolveService("audit.kronoscan.eth", "https://rpc.sepolia.org");

    expect(result).not.toBeNull();
    expect(result!.sellerAddress).toBe("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad");
    expect(result!.apiUrl).toBe("");
    expect(result!.categories).toEqual([]);
    expect(result!.pricePerRequest).toBe("");
    expect(result!.ensip25).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd shared && npx vitest run
```

Expected: FAIL — `Cannot find module './ensResolver.js'`

- [ ] **Step 5: Commit**

```bash
git add shared/
git commit -m "test(shared): add ENS resolver tests with mocked viem client"
```

---

### Task 2: Shared ENS Resolver — Implementation

**Files:**
- Create: `shared/ensResolver.ts`

- [ ] **Step 1: Implement the resolver**

Create `shared/ensResolver.ts`:

```typescript
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

export interface ServiceConfig {
  sellerAddress: string;
  apiUrl: string;
  description: string;
  categories: string[];
  pricePerRequest: string;
  network: string;
  paymentProtocol: string;
  scanModes: string[];
  ensip25: boolean;
}

const TEXT_KEYS = [
  "description",
  "url",
  "com.kronoscan.categories",
  "com.kronoscan.price",
  "com.kronoscan.network",
  "com.kronoscan.payment",
  "com.kronoscan.scan-modes",
  "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]",
] as const;

export async function resolveService(
  ensName: string,
  sepoliaRpc: string,
): Promise<ServiceConfig | null> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(sepoliaRpc),
  });

  const address = await client.getEnsAddress({
    name: normalize(ensName),
  });

  if (!address) {
    return null;
  }

  const records: Record<string, string | null> = {};
  for (const key of TEXT_KEYS) {
    records[key] = await client.getEnsText({
      name: normalize(ensName),
      key,
    });
  }

  return {
    sellerAddress: address,
    apiUrl: records["url"] ?? "",
    description: records["description"] ?? "",
    categories: parseList(records["com.kronoscan.categories"]),
    pricePerRequest: records["com.kronoscan.price"] ?? "",
    network: records["com.kronoscan.network"] ?? "",
    paymentProtocol: records["com.kronoscan.payment"] ?? "",
    scanModes: parseList(records["com.kronoscan.scan-modes"]),
    ensip25:
      (records[
        "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]"
      ] ?? "") !== "",
  };
}

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd shared && npx vitest run
```

Expected: 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add shared/ensResolver.ts
git commit -m "feat(shared): implement ENS resolver — name to ServiceConfig"
```

---

### Task 3: ENS Setup Script

**Files:**
- Create: `scripts/ens-setup.ts`
- Modify: `.env`

- [ ] **Step 1: Add env vars to `.env`**

Append to `.env`:

```
# ─── ENS (Sepolia) ───
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_PRIVATE_KEY=0x_YOUR_SEPOLIA_WALLET_KEY
ENS_SERVICE_NAME=audit.kronoscan.eth
```

- [ ] **Step 2: Create the setup script**

Create `scripts/ens-setup.ts`:

```typescript
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  encodeFunctionData,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000";

if (!SEPOLIA_PRIVATE_KEY) {
  console.error("SEPOLIA_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

// ABIs for ENS operations
const registryAbi = [
  {
    name: "setSubnodeRecord",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const resolverAbi = [
  {
    name: "setAddr",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setText",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const TEXT_RECORDS: Record<string, string> = {
  description: "AI-powered smart contract security audit — 10 categories, per-request x402 micropayments",
  url: process.env.SELLER_API_URL ?? "http://localhost:3002",
  "com.kronoscan.categories":
    "reentrancy,access-control,arithmetic,external-calls,token-standards,business-logic,gas-optimization,code-quality,compiler,defi",
  "com.kronoscan.price": process.env.PRICE_PER_REQUEST ?? "100",
  "com.kronoscan.network": "eip155:5042002",
  "com.kronoscan.payment": "x402",
  "com.kronoscan.scan-modes": "standard,deep",
  "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]": "1",
};

async function main() {
  const account = privateKeyToAccount(SEPOLIA_PRIVATE_KEY!);
  console.log(`\n[ens-setup] Wallet: ${account.address}`);
  console.log(`[ens-setup] RPC:    ${SEPOLIA_RPC}\n`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(SEPOLIA_RPC),
  });

  // Step 1: Get the resolver for kronoscan.eth
  const parentName = "kronoscan.eth";
  const parentNode = namehash(normalize(parentName));
  const subnodeName = "audit.kronoscan.eth";
  const subnodeNode = namehash(normalize(subnodeName));
  const labelHash = namehash(normalize("audit.kronoscan.eth")).slice(0, 66) as Hex;

  // Compute label hash (keccak256 of "audit")
  const { keccak256, toBytes } = await import("viem");
  const auditLabelHash = keccak256(toBytes("audit"));

  // Look up the resolver set on the parent name
  const resolverAddress = await publicClient.getEnsResolver({ name: normalize(parentName) });
  if (!resolverAddress) {
    console.error(`[ens-setup] No resolver found for ${parentName}. Did you register it on Sepolia?`);
    process.exit(1);
  }
  console.log(`[ens-setup] Parent resolver: ${resolverAddress}`);

  // Step 2: Create subname audit.kronoscan.eth
  console.log(`[ens-setup] Creating subname: ${subnodeName}`);
  try {
    const tx1 = await walletClient.writeContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, auditLabelHash, account.address, resolverAddress, 0n],
    });
    console.log(`[ens-setup] setSubnodeRecord tx: ${tx1}`);
    await publicClient.waitForTransactionReceipt({ hash: tx1 });
  } catch (err) {
    console.warn(`[ens-setup] setSubnodeRecord failed (may already exist):`, err instanceof Error ? err.message : err);
  }

  // Step 3: Set address record
  console.log(`[ens-setup] Setting addr to ${SELLER_ADDRESS}`);
  try {
    const tx2 = await walletClient.writeContract({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: "setAddr",
      args: [subnodeNode, SELLER_ADDRESS as `0x${string}`],
    });
    console.log(`[ens-setup] setAddr tx: ${tx2}`);
    await publicClient.waitForTransactionReceipt({ hash: tx2 });
  } catch (err) {
    console.error(`[ens-setup] setAddr failed:`, err instanceof Error ? err.message : err);
  }

  // Step 4: Set all text records
  for (const [key, value] of Object.entries(TEXT_RECORDS)) {
    console.log(`[ens-setup] setText: ${key} = ${value.length > 60 ? value.slice(0, 60) + "..." : value}`);
    try {
      const tx = await walletClient.writeContract({
        address: resolverAddress,
        abi: resolverAbi,
        functionName: "setText",
        args: [subnodeNode, key, value],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✓ tx: ${tx}`);
    } catch (err) {
      console.error(`  ✗ Failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Step 5: Verify
  console.log(`\n[ens-setup] Verifying...`);
  const resolvedAddr = await publicClient.getEnsAddress({ name: normalize(subnodeName) });
  console.log(`[ens-setup] ${subnodeName} → ${resolvedAddr ?? "NOT RESOLVED"}`);

  for (const key of Object.keys(TEXT_RECORDS)) {
    const val = await publicClient.getEnsText({ name: normalize(subnodeName), key });
    const display = val && val.length > 50 ? val.slice(0, 50) + "..." : val;
    console.log(`  ${key}: ${display ?? "(empty)"}`);
  }

  console.log("\n[ens-setup] Done!");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Install dotenv in project root for the script**

```bash
cd /home/mbarr/Cannes2026 && npm init -y 2>/dev/null; npm install dotenv
```

(The script uses dotenv directly since it's run from the project root, not from a subdirectory with tsx auto-injection.)

- [ ] **Step 4: Commit**

```bash
git add scripts/ens-setup.ts .env
git commit -m "feat(scripts): add ENS setup script — subname + text records on Sepolia"
```

---

### Task 4: Agent ENS Resolution

**Files:**
- Modify: `agent/src/config.ts`
- Modify: `agent/src/index.ts`

- [ ] **Step 1: Add `resolveServiceConfig` to `agent/src/config.ts`**

Add to the end of `agent/src/config.ts`:

```typescript
import { resolveService, type ServiceConfig } from "../../shared/ensResolver.js";

export const ENS_SERVICE_NAME = process.env.ENS_SERVICE_NAME ?? "";
export const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

export interface ResolvedConfig {
  sellerAddress: Address;
  sellerApiUrl: string;
  pricePerRequest: string;
  depositAmount: string;
  ensName: string;
  ensResolved: boolean;
  ensip25: boolean;
}

export async function resolveServiceConfig(): Promise<ResolvedConfig> {
  if (!ENS_SERVICE_NAME) {
    console.log("[ens] ENS_SERVICE_NAME not set — using .env values");
    return {
      sellerAddress: SELLER_ADDRESS,
      sellerApiUrl: SELLER_API_URL,
      pricePerRequest: PRICE_PER_REQUEST,
      depositAmount: DEPOSIT_AMOUNT,
      ensName: "",
      ensResolved: false,
      ensip25: false,
    };
  }

  console.log(`[ens] Resolving ${ENS_SERVICE_NAME} on Sepolia...`);
  try {
    const svc = await resolveService(ENS_SERVICE_NAME, SEPOLIA_RPC);
    if (!svc) {
      console.warn(`[ens] Name did not resolve — falling back to .env`);
      return {
        sellerAddress: SELLER_ADDRESS,
        sellerApiUrl: SELLER_API_URL,
        pricePerRequest: PRICE_PER_REQUEST,
        depositAmount: DEPOSIT_AMOUNT,
        ensName: ENS_SERVICE_NAME,
        ensResolved: false,
        ensip25: false,
      };
    }

    console.log(`[ens] Resolved successfully:`);
    console.log(`  Seller:      ${svc.sellerAddress}`);
    console.log(`  API URL:     ${svc.apiUrl || "(not set, using .env)"}`);
    console.log(`  Price:       ${svc.pricePerRequest || "(not set, using .env)"}`);
    console.log(`  Categories:  ${svc.categories.length}`);
    console.log(`  Network:     ${svc.network}`);
    console.log(`  Payment:     ${svc.paymentProtocol}`);
    console.log(`  ENSIP-25:    ${svc.ensip25 ? "verified" : "not set"}`);

    return {
      sellerAddress: (svc.sellerAddress || SELLER_ADDRESS) as Address,
      sellerApiUrl: svc.apiUrl || SELLER_API_URL,
      pricePerRequest: svc.pricePerRequest || PRICE_PER_REQUEST,
      depositAmount: DEPOSIT_AMOUNT,
      ensName: ENS_SERVICE_NAME,
      ensResolved: true,
      ensip25: svc.ensip25,
    };
  } catch (err) {
    console.warn(`[ens] Resolution failed — falling back to .env:`, err instanceof Error ? err.message : err);
    return {
      sellerAddress: SELLER_ADDRESS,
      sellerApiUrl: SELLER_API_URL,
      pricePerRequest: PRICE_PER_REQUEST,
      depositAmount: DEPOSIT_AMOUNT,
      ensName: ENS_SERVICE_NAME,
      ensResolved: false,
      ensip25: false,
    };
  }
}
```

- [ ] **Step 2: Update `agent/src/index.ts` to use ENS resolution**

Replace the current startup config logging and session open with ENS-resolved values. The full updated `index.ts`:

```typescript
import {
  DEPOSIT_AMOUNT,
  WORLD_ID_VERIFIED,
  COORDINATOR_WS_URL,
  PRIVATE_KEY,
  resolveServiceConfig,
} from "./config.js";
import { createPaymentFetch, getPaymentMode } from "./x402Client.js";
import { CoordinatorClient } from "./coordinatorClient.js";
import { runAudit } from "./auditRunner.js";

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║        KronoScan — Buyer Agent           ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Step 1: Resolve service config via ENS
  console.log("-- Resolving service config --");
  const svc = await resolveServiceConfig();

  console.log(`\nCoordinator:  ${COORDINATOR_WS_URL}`);
  console.log(`Seller API:   ${svc.sellerApiUrl}`);
  console.log(`Seller addr:  ${svc.sellerAddress}`);
  console.log(`ENS name:     ${svc.ensName || "(none)"}`);
  console.log(`ENS resolved: ${svc.ensResolved}`);
  console.log(`Deposit:      ${svc.depositAmount}`);
  console.log(`Price/req:    ${svc.pricePerRequest}`);
  console.log(`Verified:     ${WORLD_ID_VERIFIED}`);
  console.log(`Private key:  ${PRIVATE_KEY ? "set" : "not set"}`);

  // Step 2: Initialize x402 payment client
  console.log("\n-- Initializing x402 payment client --");
  const paymentFetch = await createPaymentFetch();
  console.log(`Payment mode: ${getPaymentMode()}\n`);

  // Step 3: Connect to coordinator
  console.log("-- Connecting to coordinator --");
  const coordinator = new CoordinatorClient();
  await coordinator.connect();

  // Step 4: Open session
  console.log("\n-- Opening session --");
  const session = await coordinator.openSession(
    svc.sellerAddress,
    svc.pricePerRequest,
    svc.depositAmount,
    WORLD_ID_VERIFIED,
    svc.ensName,
  );
  console.log(`Session:      ${session.sessionId}`);
  console.log(`Eff. price:   ${session.effectivePrice}`);
  console.log(`Deposit:      ${session.deposit}`);

  // Step 5: Run audit (use resolved API URL)
  const summary = await runAudit(
    paymentFetch,
    coordinator,
    session.sessionId,
    session.effectivePrice,
    undefined,
    svc.sellerApiUrl,
  );

  // Step 6: Close session
  console.log("\n-- Closing session --");
  const closed = await coordinator.closeSession(session.sessionId);

  // Step 7: Print summary
  const txDisplay =
    closed.txHash.length > 20
      ? `${closed.txHash.slice(0, 18)}...`
      : closed.txHash;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║            AUDIT COMPLETE                ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Service:     ${(svc.ensName || svc.sellerAddress).padEnd(28)}║`);
  console.log(`║  Categories:  10/10                      ║`);
  console.log(`║  Findings:    ${String(summary.totalFindings).padEnd(28)}║`);
  console.log(`║  CRITICAL:    ${String(summary.bySeverity["CRITICAL"] ?? 0).padEnd(28)}║`);
  console.log(`║  HIGH:        ${String(summary.bySeverity["HIGH"] ?? 0).padEnd(28)}║`);
  console.log(`║  MEDIUM:      ${String(summary.bySeverity["MEDIUM"] ?? 0).padEnd(28)}║`);
  console.log(`║  LOW:         ${String(summary.bySeverity["LOW"] ?? 0).padEnd(28)}║`);
  console.log(`║  Total cost:  ${closed.consumed.padEnd(28)}║`);
  console.log(`║  Refunded:    ${closed.refunded.padEnd(28)}║`);
  console.log(`║  Payment:     ${getPaymentMode().padEnd(28)}║`);
  console.log(`║  Tx hash:     ${txDisplay.padEnd(28)}║`);
  console.log("╚══════════════════════════════════════════╝\n");

  if (getPaymentMode() === "fallback") {
    console.warn(
      "WARNING: Payments were simulated (fallback mode). No real USDC was spent.",
    );
  }

  coordinator.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("\nAgent failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Update `agent/src/auditRunner.ts` to accept `sellerApiUrl` parameter**

Change the `runAudit` function signature. Add `sellerApiUrl?: string` as the last parameter. Replace the hardcoded `SELLER_API_URL` import with the parameter:

At the top, change:
```typescript
import { SELLER_API_URL, AUDIT_CATEGORIES } from "./config.js";
```
to:
```typescript
import { SELLER_API_URL as DEFAULT_SELLER_API_URL, AUDIT_CATEGORIES } from "./config.js";
```

Change the function signature:
```typescript
export async function runAudit(
  paymentFetch: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
  coordinator: CoordinatorClient,
  sessionId: Hex,
  effectivePrice: string,
  contractSource?: string,
  sellerApiUrl?: string,
): Promise<AuditSummary> {
```

Change the URL construction inside the loop:
```typescript
const apiBase = sellerApiUrl || DEFAULT_SELLER_API_URL;
const url = `${apiBase}/api/audit/${category}`;
```

- [ ] **Step 4: Run existing agent tests to verify nothing is broken**

```bash
cd agent && npx vitest run
```

Expected: All existing tests PASS (sseParser tests are independent of these changes)

- [ ] **Step 5: Commit**

```bash
git add agent/src/config.ts agent/src/index.ts agent/src/auditRunner.ts
git commit -m "feat(agent): resolve service config from ENS with .env fallback"
```

---

### Task 5: Coordinator ENS Name Passthrough

**Files:**
- Modify: `coordinator/src/types.ts`
- Modify: `coordinator/src/index.ts`
- Modify: `agent/src/coordinatorClient.ts`

- [ ] **Step 1: Add `ensName` to WS message types in `coordinator/src/types.ts`**

Update the `open_session` message to include `ensName`:

```typescript
export type WsMessageIn =
  | { type: "open_session"; seller: Address; pricePerRequest: string; deposit: string; verified: boolean; ensName?: string }
  | { type: "record_payment"; sessionId: Hex; category: string; amount: string }
  | { type: "close_session"; sessionId: Hex }
  | { type: "subscribe"; sessionId: Hex };
```

Update `session_opened` response to include `ensName`:

```typescript
  | { type: "session_opened"; sessionId: Hex; effectivePrice: string; deposit: string; startTime: number; ensName?: string }
```

Add `ensName` to `ActiveSession`:

```typescript
export interface ActiveSession {
  sessionId: Hex;
  buyer: Address;
  seller: Address;
  pricePerRequest: bigint;
  effectivePrice: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number;
  status: SessionStatus;
  requestCount: number;
  totalConsumed: bigint;
  completedCategories: string[];
  ensName?: string;
}
```

- [ ] **Step 2: Pass `ensName` through coordinator `handleOpenSession` in `coordinator/src/index.ts`**

In the `handleOpenSession` function, add `ensName` to the session registration and the response. Find:

```typescript
  const session = sessionManager.registerSession({
    sessionId,
    buyer: msg.seller,
    seller: msg.seller,
    pricePerRequest,
    effectivePrice,
    deposit,
    verified: msg.verified,
    startTime: Math.floor(Date.now() / 1000),
  });
```

Replace with:

```typescript
  const session = sessionManager.registerSession({
    sessionId,
    buyer: msg.seller,
    seller: msg.seller,
    pricePerRequest,
    effectivePrice,
    deposit,
    verified: msg.verified,
    startTime: Math.floor(Date.now() / 1000),
    ensName: msg.ensName,
  });
```

Find the `sendTo` call:

```typescript
  sendTo(ws, {
    type: "session_opened",
    sessionId,
    effectivePrice: session.effectivePrice.toString(),
    deposit: session.deposit.toString(),
    startTime: session.startTime,
  });
```

Replace with:

```typescript
  sendTo(ws, {
    type: "session_opened",
    sessionId,
    effectivePrice: session.effectivePrice.toString(),
    deposit: session.deposit.toString(),
    startTime: session.startTime,
    ensName: session.ensName,
  });
```

Update the log line:

```typescript
  console.log(`[session] Opened ${sessionId} | price=${effectivePrice} | deposit=${deposit} | verified=${msg.verified} | ens=${msg.ensName ?? "none"}`);
```

- [ ] **Step 3: Update `agent/src/coordinatorClient.ts` to send `ensName`**

Update the `openSession` method signature and the message it sends. Change:

```typescript
  async openSession(seller: Address, pricePerRequest: string, deposit: string, verified: boolean): Promise<SessionOpenedMsg> {
    this.send({
      type: "open_session",
      seller,
      pricePerRequest,
      deposit,
      verified,
    });
```

To:

```typescript
  async openSession(seller: Address, pricePerRequest: string, deposit: string, verified: boolean, ensName?: string): Promise<SessionOpenedMsg> {
    this.send({
      type: "open_session",
      seller,
      pricePerRequest,
      deposit,
      verified,
      ensName,
    });
```

- [ ] **Step 4: Run coordinator tests**

```bash
cd coordinator && npx vitest run
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add coordinator/src/types.ts coordinator/src/index.ts agent/src/coordinatorClient.ts
git commit -m "feat(coordinator): pass ENS name through session lifecycle"
```

---

### Task 6: Environment & Integration Test

**Files:**
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example` with ENS vars**

Add to `.env.example`:

```
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_PRIVATE_KEY=0x...
ENS_SERVICE_NAME=audit.kronoscan.eth
```

- [ ] **Step 2: Run all tests across all packages**

```bash
cd /home/mbarr/Cannes2026/shared && npx vitest run
cd /home/mbarr/Cannes2026/agent && npx vitest run
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: All tests PASS across all packages

- [ ] **Step 3: End-to-end smoke test**

Start coordinator and seller, then run agent:

```bash
# Terminal 1
cd coordinator && npm run start

# Terminal 2
cd seller-api && npm run start

# Terminal 3
cd agent && npm run start
```

Expected output includes:
```
-- Resolving service config --
[ens] Resolving audit.kronoscan.eth on Sepolia...
```

If ENS is not yet set up, expect:
```
[ens] Name did not resolve — falling back to .env
```

The full flow should still work with fallback values.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add ENS env vars to .env.example"
```

---

## Post-Implementation: Manual ENS Setup

After all tasks are complete, the user needs to:

1. Fund the Sepolia wallet with Sepolia ETH (faucet)
2. Set `SEPOLIA_PRIVATE_KEY` in `.env` to the wallet that owns `kronoscan.eth` on Sepolia
3. Run: `npx tsx scripts/ens-setup.ts`
4. Re-run the agent — it should now resolve from ENS instead of falling back
