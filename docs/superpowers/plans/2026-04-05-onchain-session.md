# On-Chain Session IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent call `StreamVault.openSession()` on Arc testnet so the coordinator uses real `bytes32` session IDs for on-chain consumption tracking and refunds.

**Architecture:** Agent creates an on-chain session (USDC approve + openSession), extracts the `bytes32` ID from the `SessionOpened` event, passes it to the coordinator via the existing `open_session` WS message. Coordinator stops generating fake IDs and uses the real one for `reportConsumption()` and `closeSession()`.

**Tech Stack:** viem, TypeScript, Arc testnet, StreamVault.sol

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `agent/src/vaultClient.ts` | Create | On-chain session opener (approve USDC + openSession + parse event) |
| `agent/src/config.ts` | Modify | Export `VAULT_ADDRESS`, `USDC_ADDRESS`, `ARC_TESTNET_RPC` |
| `agent/src/coordinatorClient.ts` | Modify | Add `sessionId` param to `openSession()` |
| `agent/src/index.ts` | Modify | Call `openOnChainSession()` before WS `open_session` |
| `coordinator/src/types.ts` | Modify | Add `sessionId` to `open_session` in `WsMessageIn` |
| `coordinator/src/index.ts` | Modify | Use `msg.sessionId` instead of generating one |

---

### Task 1: Agent Vault Client

**Files:**
- Create: `agent/src/vaultClient.ts`
- Modify: `agent/src/config.ts`

- [ ] **Step 1: Add missing env exports to `agent/src/config.ts`**

Add these three lines after the `PAYMENT_MODE` export (line 12):

```typescript
export const ARC_TESTNET_RPC = process.env.ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.network";
export const VAULT_ADDRESS = (process.env.VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const USDC_ADDRESS = (process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as Address;
```

- [ ] **Step 2: Create `agent/src/vaultClient.ts`**

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PRIVATE_KEY, ARC_TESTNET_RPC, VAULT_ADDRESS, USDC_ADDRESS } from "./config.js";

const arcTestnet: Chain = {
  id: 16180,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC] },
  },
};

const erc20ApproveAbi = [
  {
    type: "function" as const,
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable" as const,
  },
] as const;

const openSessionAbi = [
  {
    type: "function" as const,
    name: "openSession",
    inputs: [
      { name: "seller", type: "address" },
      { name: "pricePerRequest", type: "uint256" },
      { name: "deposit", type: "uint256" },
      { name: "worldIdVerified", type: "bool" },
    ],
    outputs: [{ name: "sessionId", type: "bytes32" }],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "event" as const,
    name: "SessionOpened",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "buyer", type: "address", indexed: false },
      { name: "seller", type: "address", indexed: false },
      { name: "pricePerRequest", type: "uint256", indexed: false },
      { name: "effectivePrice", type: "uint256", indexed: false },
      { name: "deposit", type: "uint256", indexed: false },
      { name: "verified", type: "bool", indexed: false },
    ],
  },
] as const;

export async function openOnChainSession(
  seller: Address,
  pricePerRequest: bigint,
  deposit: bigint,
  worldIdVerified: boolean,
): Promise<Hex> {
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set — cannot open on-chain session");
  }

  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC),
  });

  // Step 1: Approve USDC spending
  console.log(`[vault] Approving ${deposit} USDC for StreamVault...`);
  const approveTx = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [VAULT_ADDRESS, deposit],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`[vault] Approve tx: ${approveTx}`);

  // Step 2: Open session on StreamVault
  console.log(`[vault] Opening session on StreamVault...`);
  const openTx = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: openSessionAbi,
    functionName: "openSession",
    args: [seller, pricePerRequest, deposit, worldIdVerified],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: openTx });
  console.log(`[vault] openSession tx: ${openTx}`);

  // Step 3: Parse SessionOpened event to get bytes32 session ID
  const logs = parseEventLogs({
    abi: openSessionAbi,
    logs: receipt.logs,
    eventName: "SessionOpened",
  });

  if (logs.length === 0) {
    throw new Error("SessionOpened event not found in transaction receipt");
  }

  const sessionId = logs[0].args.sessionId;
  console.log(`[vault] On-chain session ID: ${sessionId}`);
  return sessionId;
}
```

- [ ] **Step 3: Verify the agent builds**

Run: `cd /home/mbarr/Cannes2026/agent && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add agent/src/vaultClient.ts agent/src/config.ts
git commit -m "feat(agent): add on-chain vault client for real session IDs"
```

---

### Task 2: Coordinator Accepts External Session IDs

**Files:**
- Modify: `coordinator/src/types.ts:31`
- Modify: `coordinator/src/index.ts:167-210`

- [ ] **Step 1: Add `sessionId` to `open_session` in `coordinator/src/types.ts`**

Find line 31:
```typescript
  | { type: "open_session"; seller: Address; pricePerRequest: string; deposit: string; verified: boolean; ensName?: string }
```

Replace with:
```typescript
  | { type: "open_session"; sessionId: Hex; seller: Address; pricePerRequest: string; deposit: string; verified: boolean; ensName?: string }
```

- [ ] **Step 2: Use `msg.sessionId` in `coordinator/src/index.ts`**

Find the `handleOpenSession` function (around line 167-210). Replace the session ID generation:

```typescript
  const sessionId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}` as Hex;
```

With:

```typescript
  const sessionId = msg.sessionId;
```

- [ ] **Step 3: Run coordinator tests**

Run: `cd /home/mbarr/Cannes2026/coordinator && npx vitest run`
Expected: All 8 tests pass. (The session manager tests don't test `handleOpenSession` directly, so they should be unaffected.)

- [ ] **Step 4: Commit**

```bash
git add coordinator/src/types.ts coordinator/src/index.ts
git commit -m "feat(coordinator): accept external session IDs from agent"
```

---

### Task 3: Wire Agent to Use On-Chain Session

**Files:**
- Modify: `agent/src/coordinatorClient.ts:113-124`
- Modify: `agent/src/index.ts:41-49`

- [ ] **Step 1: Add `sessionId` parameter to `openSession()` in `agent/src/coordinatorClient.ts`**

Find the `openSession` method (line 113):
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

Replace with:
```typescript
  async openSession(sessionId: Hex, seller: Address, pricePerRequest: string, deposit: string, verified: boolean, ensName?: string): Promise<SessionOpenedMsg> {
    this.send({
      type: "open_session",
      sessionId,
      seller,
      pricePerRequest,
      deposit,
      verified,
      ensName,
    });
```

- [ ] **Step 2: Update `agent/src/index.ts` to call `openOnChainSession()` before WS open**

Add the import at the top (after the existing imports):
```typescript
import { openOnChainSession } from "./vaultClient.js";
```

Replace the session opening block (around lines 41-49):
```typescript
  // Step 4: Open session
  console.log("\n-- Opening session --");
  const session = await coordinator.openSession(
    svc.sellerAddress,
    svc.pricePerRequest,
    svc.depositAmount,
    WORLD_ID_VERIFIED,
    svc.ensName,
  );
```

With:
```typescript
  // Step 4: Open on-chain session (deposit USDC into StreamVault)
  console.log("\n-- Opening on-chain session --");
  const sessionId = await openOnChainSession(
    svc.sellerAddress,
    BigInt(svc.pricePerRequest),
    BigInt(svc.depositAmount),
    WORLD_ID_VERIFIED,
  );

  // Step 5: Register session with coordinator
  console.log("\n-- Registering session with coordinator --");
  const session = await coordinator.openSession(
    sessionId,
    svc.sellerAddress,
    svc.pricePerRequest,
    svc.depositAmount,
    WORLD_ID_VERIFIED,
    svc.ensName,
  );
```

Also update the step comments below (the old "Step 5: Run audit" becomes "Step 6", etc.) and the audit call:

Find:
```typescript
  // Step 5: Run audit (use resolved API URL)
```
Replace with:
```typescript
  // Step 6: Run audit (use resolved API URL)
```

Find:
```typescript
  // Step 6: Close session
  console.log("\n-- Closing session --");
```
Replace with:
```typescript
  // Step 7: Close session
  console.log("\n-- Closing session --");
```

Find:
```typescript
  // Step 7: Print summary
```
Replace with:
```typescript
  // Step 8: Print summary
```

- [ ] **Step 3: Verify the agent builds**

Run: `cd /home/mbarr/Cannes2026/agent && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
cd /home/mbarr/Cannes2026/agent && npx vitest run
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add agent/src/coordinatorClient.ts agent/src/index.ts
git commit -m "feat(agent): wire on-chain session into coordinator flow"
```
