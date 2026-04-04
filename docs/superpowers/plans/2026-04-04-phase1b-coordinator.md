# Phase 1 Refactor: Per-Second → Per-Request Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing StreamVault.sol and coordinator from a per-second streaming model to a per-request x402 model. StreamVault becomes a session escrow with coordinator-reported consumption. Coordinator becomes a session manager that tracks x402 payments.

**Architecture:** StreamVault.sol gains `consumedAmount` field and `reportConsumption()` function, loses time-based `_consumed()`. Coordinator renames stream→session terminology, replaces per-second auth tick handling with per-request consumption tracking.

**Tech Stack:** Solidity ^0.8.30 (Foundry), TypeScript (ESM, strict), Express, ws, viem, vitest

---

## File Map

| File | Action | What Changes |
|------|--------|-------------|
| `src/StreamVault.sol` | **Rewrite** | Rename Stream→Session, add `consumedAmount`, `reportConsumption()`, `requestsRemaining()`, `terminateExpired()`. Remove time-based `_consumed()`, `terminateInsolvency()` |
| `src/mocks/MockUSDC.sol` | **Keep** | No changes |
| `test/StreamVault.t.sol` | **Rewrite** | Update all tests for new contract interface |
| `script/Deploy.s.sol` | **Keep** | No changes needed (constructor signature unchanged) |
| `coordinator/src/types.ts` | **Modify** | Rename stream→session, `baseRate`→`pricePerRequest`, `effectiveRate`→`effectivePrice`, add `completedCategories` |
| `coordinator/src/errors.ts` | **Modify** | Rename stream errors → session errors |
| `coordinator/src/abi.ts` | **Rewrite** | New ABI matching refactored contract |
| `coordinator/src/vaultClient.ts` | **Modify** | Add `reportConsumption()`, rename `closeStream`→`closeSession`, add `requestsRemaining()` |
| `coordinator/src/streamManager.ts` | **Rename+Modify** | → `sessionManager.ts`. Rename all stream→session, `recordAuthorization`→`recordPayment` |
| `coordinator/src/index.ts` | **Modify** | Update WS handlers for session model, rename stream→session |
| `coordinator/test/streamManager.test.ts` | **Rename+Modify** | → `sessionManager.test.ts`. Update for new API |

---

### Task 1: Refactor StreamVault.sol

**Files:**
- Modify: `src/StreamVault.sol`

- [ ] **Step 1: Rewrite StreamVault.sol**

Replace the entire contract with the session-based model. Key changes:
- `Stream` struct → `Session` struct with `consumedAmount` field, `pricePerRequest` instead of `baseRatePerSecond`
- `openStream()` → `openSession()` with `consumedAmount: 0` initialization
- New `reportConsumption()` — onlyCoordinator, adds amount to `consumedAmount`, reverts if exceeds deposit
- `_consumed()` removed — no more time-based calculation
- `isSolvent()` uses `consumedAmount < depositedAmount`
- `timeRemaining()` → `requestsRemaining()` = `(deposit - consumed) / effectivePrice`
- `terminateInsolvency()` → `terminateExpired()` — session timeout based on `MAX_SESSION_DURATION`
- `closeStream()` → `closeSession()` — uses `consumedAmount` directly instead of `actualConsumed` parameter
- `GRACE_PERIOD` → `MAX_SESSION_DURATION = 3600`
- Errors: remove `StillSolvent`, `GracePeriodActive`, add `SessionNotExpired`

The full contract code is in CLAUDE.md Component 1 section.

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026 && forge build`
Expected: Compilation succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/StreamVault.sol
git commit -m "refactor(contract): StreamVault per-second → per-request session model

- Stream struct → Session struct with consumedAmount field
- Add reportConsumption() for coordinator-reported x402 payments
- Add requestsRemaining() view (replaces timeRemaining)
- Add terminateExpired() for session timeout (replaces terminateInsolvency)
- closeSession() uses tracked consumedAmount (no parameter needed)
- Remove time-based _consumed() calculation"
```

---

### Task 2: Rewrite StreamVault Tests

**Files:**
- Modify: `test/StreamVault.t.sol`

- [ ] **Step 1: Rewrite test file**

Update all 28 tests for new contract interface. Key test categories:

```solidity
// ==================== openSession ====================

function test_openSession_verified() public {
    vm.prank(buyer);
    bytes32 sessionId = vault.openSession(seller, PRICE, DEPOSIT, true);

    // Verify all struct fields including consumedAmount = 0
    // effectivePrice = PRICE * 8000 / 10000
}

function test_openSession_unverified() public {
    // effectivePrice = PRICE (no discount)
}

// ==================== reportConsumption ====================

function test_reportConsumption() public {
    // Open session, report consumption, verify consumedAmount updated
}

function test_reportConsumption_onlyCoordinator() public {
    // Non-coordinator cannot report
}

function test_reportConsumption_exceedsDeposit() public {
    // Reverts with ConsumedExceedsDeposit if total > deposit
}

function test_reportConsumption_notActive() public {
    // Cannot report on closed session
}

// ==================== isSolvent ====================

function test_isSolvent_activeSession() public {
    // true when consumedAmount < depositedAmount
}

function test_isSolvent_afterConsumption() public {
    // Report consumption, check still solvent
    // Report more until consumed >= deposit, check insolvent
}

// ==================== requestsRemaining ====================

function test_requestsRemaining() public {
    // (deposit - consumed) / effectivePrice
}

function test_requestsRemaining_afterConsumption() public {
    // Decreases after reportConsumption
}

// ==================== topUp ====================

function test_topUp() public { ... }
function test_topUp_extendsRequests() public { ... }
function test_topUp_onlyBuyer() public { ... }
function test_topUp_onlyActive() public { ... }

// ==================== closeSession ====================

function test_closeSession_partialConsumption() public {
    // Report some consumption, close, verify refund + seller payment
}

function test_closeSession_fullConsumption() public { ... }
function test_closeSession_zeroConsumption() public { ... }
function test_closeSession_onlyCoordinator() public { ... }
function test_closeSession_notActive() public { ... }

// ==================== terminateExpired ====================

function test_terminateExpired() public {
    // Warp past MAX_SESSION_DURATION, terminate, verify funds distribution
}

function test_terminateExpired_sessionNotExpired() public {
    // Reverts before MAX_SESSION_DURATION
}

function test_terminateExpired_notActive() public { ... }

function test_terminateExpired_withConsumption() public {
    // Report some consumption, expire, verify consumed→seller + remainder→buyer
}

// ==================== Events ====================

function test_event_SessionOpened() public { ... }
function test_event_ConsumptionReported() public { ... }
function test_event_SessionClosed() public { ... }
function test_event_SessionToppedUp() public { ... }
function test_event_SessionTerminated() public { ... }

// ==================== Multiple sessions ====================

function test_multipleSessions() public {
    // Verified vs unverified pricing differences
}
```

- [ ] **Step 2: Run tests**

Run: `cd /home/mbarr/Cannes2026 && forge test -v`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/StreamVault.t.sol
git commit -m "test(contract): rewrite all tests for per-request session model"
```

---

### Task 3: Update Coordinator Types

**Files:**
- Modify: `coordinator/src/types.ts`

- [ ] **Step 1: Update types.ts**

```typescript
import type { Address, Hex } from "viem";

// ─── Session State ───

export type SessionStatus =
  | "OPENING"
  | "ACTIVE"
  | "CLOSING"
  | "CLOSED"
  | "TERMINATED";

export interface ActiveSession {
  sessionId: Hex;
  buyer: Address;
  seller: Address;
  pricePerRequest: bigint;
  effectivePrice: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number; // unix seconds
  status: SessionStatus;
  requestCount: number;
  totalConsumed: bigint;
  completedCategories: string[];
}

// ─── WebSocket Messages ───

export type WsMessageIn =
  | { type: "open_session"; seller: Address; pricePerRequest: string; deposit: string; verified: boolean }
  | { type: "record_payment"; sessionId: Hex; category: string; amount: string }
  | { type: "close_session"; sessionId: Hex }
  | { type: "subscribe"; sessionId: Hex };

export type WsMessageOut =
  | { type: "session_opened"; sessionId: Hex; effectivePrice: string; deposit: string; startTime: number }
  | { type: "session_update"; sessionId: Hex; status: SessionStatus; totalConsumed: string; requestsRemaining: number; requestCount: number; completedCategories: string[] }
  | { type: "session_closed"; sessionId: Hex; consumed: string; refunded: string; txHash: Hex }
  | { type: "finding"; sessionId: Hex; finding: AuditFinding }
  | { type: "error"; message: string };

// ─── Audit Findings ───

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AuditFinding {
  severity: Severity;
  title: string;
  line: number;
  description: string;
  category: string;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026/coordinator && npx tsc --noEmit`
Expected: Errors in other files (they still reference old types) — that's expected, we'll fix them next.

- [ ] **Step 3: Commit**

```bash
cd /home/mbarr/Cannes2026
git add coordinator/src/types.ts
git commit -m "refactor(coordinator): update types for per-request session model"
```

---

### Task 4: Update Errors

**Files:**
- Modify: `coordinator/src/errors.ts`

- [ ] **Step 1: Rename stream errors to session errors**

```typescript
import type { Hex } from "viem";
import type { SessionStatus } from "./types.js";

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: Hex) {
    super(`Session ${sessionId} not found`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionAlreadyExistsError extends Error {
  constructor(public readonly sessionId: Hex) {
    super(`Session ${sessionId} already exists`);
    this.name = "SessionAlreadyExistsError";
  }
}

export class SessionNotActiveError extends Error {
  constructor(public readonly sessionId: Hex, public readonly status: SessionStatus) {
    super(`Session ${sessionId} is not active (status: ${status})`);
    this.name = "SessionNotActiveError";
  }
}

export class InsufficientBudgetError extends Error {
  constructor(public readonly remaining: bigint, public readonly requested: bigint) {
    super(`Insufficient budget: ${remaining} remaining, ${requested} requested`);
    this.name = "InsufficientBudgetError";
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/mbarr/Cannes2026
git add coordinator/src/errors.ts
git commit -m "refactor(coordinator): rename stream errors → session errors"
```

---

### Task 5: Update ABI

**Files:**
- Modify: `coordinator/src/abi.ts`

- [ ] **Step 1: Rewrite abi.ts for new contract interface**

```typescript
export const streamVaultAbi = [
  // ─── Read functions ───
  {
    type: "function",
    name: "isSolvent",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "requestsRemaining",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "sessions",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "pricePerRequest", type: "uint256" },
      { name: "effectivePrice", type: "uint256" },
      { name: "depositedAmount", type: "uint256" },
      { name: "consumedAmount", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "closedTime", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "buyerVerified", type: "bool" },
    ],
    stateMutability: "view",
  },
  // ─── Write functions ───
  {
    type: "function",
    name: "reportConsumption",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeSession",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ─── Events ───
  {
    type: "event",
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
  {
    type: "event",
    name: "ConsumptionReported",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newTotal", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionClosed",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "consumed", type: "uint256", indexed: false },
      { name: "refunded", type: "uint256", indexed: false },
    ],
  },
] as const;
```

- [ ] **Step 2: Commit**

```bash
cd /home/mbarr/Cannes2026
git add coordinator/src/abi.ts
git commit -m "refactor(coordinator): update ABI for session-based contract"
```

---

### Task 6: Update VaultClient

**Files:**
- Modify: `coordinator/src/vaultClient.ts`

- [ ] **Step 1: Update vaultClient.ts**

Changes:
- `closeStream(streamId, consumed)` → `closeSession(sessionId)` (no consumed param — contract reads from `consumedAmount`)
- `timeRemaining()` → `requestsRemaining()`
- Add `reportConsumption(sessionId, amount)` write function
- `getStream()` → `getSession()` — update field names

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026/coordinator && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
cd /home/mbarr/Cannes2026
git add coordinator/src/vaultClient.ts
git commit -m "refactor(coordinator): update VaultClient for session model + reportConsumption"
```

---

### Task 7: Rename + Update SessionManager

**Files:**
- Rename: `coordinator/src/streamManager.ts` → `coordinator/src/sessionManager.ts`
- Rename: `coordinator/test/streamManager.test.ts` → `coordinator/test/sessionManager.test.ts`

- [ ] **Step 1: Create sessionManager.ts**

Rename all stream→session terminology:
- `StreamManager` → `SessionManager`
- `RegisterStreamParams` → `RegisterSessionParams`
- `recordAuthorization` → `recordPayment` — now also tracks `completedCategories`
- `getActiveStreamIds` → `getActiveSessionIds`
- Import session error classes instead of stream error classes

```typescript
import type { ActiveSession, SessionStatus } from "./types.js";
import type { Address, Hex } from "viem";
import {
  SessionAlreadyExistsError,
  SessionNotFoundError,
  SessionNotActiveError,
  InsufficientBudgetError,
} from "./errors.js";

export interface RegisterSessionParams {
  sessionId: Hex;
  buyer: Address;
  seller: Address;
  pricePerRequest: bigint;
  effectivePrice: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number;
}

export class SessionManager {
  private sessions = new Map<Hex, ActiveSession>();

  registerSession(params: RegisterSessionParams): ActiveSession {
    if (this.sessions.has(params.sessionId)) {
      throw new SessionAlreadyExistsError(params.sessionId);
    }

    const session: ActiveSession = {
      sessionId: params.sessionId,
      buyer: params.buyer,
      seller: params.seller,
      pricePerRequest: params.pricePerRequest,
      effectivePrice: params.effectivePrice,
      deposit: params.deposit,
      verified: params.verified,
      startTime: params.startTime,
      status: "ACTIVE",
      requestCount: 0,
      totalConsumed: 0n,
      completedCategories: [],
    };

    this.sessions.set(params.sessionId, session);
    return session;
  }

  getSession(sessionId: Hex): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  recordPayment(sessionId: Hex, amount: bigint, category: string): ActiveSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.status !== "ACTIVE") {
      throw new SessionNotActiveError(sessionId, session.status);
    }
    if (session.totalConsumed + amount > session.deposit) {
      throw new InsufficientBudgetError(session.deposit - session.totalConsumed, amount);
    }

    session.requestCount += 1;
    session.totalConsumed += amount;
    session.completedCategories.push(category);
    return session;
  }

  updateStatus(sessionId: Hex, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    session.status = status;
  }

  getActiveSessionIds(): Hex[] {
    const ids: Hex[] = [];
    for (const [id, session] of this.sessions) {
      if (session.status === "ACTIVE") {
        ids.push(id);
      }
    }
    return ids;
  }
}
```

- [ ] **Step 2: Create sessionManager.test.ts**

Update tests to use session terminology + test `recordPayment` with category tracking and budget checking.

- [ ] **Step 3: Delete old files**

```bash
rm coordinator/src/streamManager.ts coordinator/test/streamManager.test.ts
```

- [ ] **Step 4: Run tests**

Run: `cd /home/mbarr/Cannes2026/coordinator && npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/mbarr/Cannes2026
git add coordinator/src/sessionManager.ts coordinator/test/sessionManager.test.ts
git rm coordinator/src/streamManager.ts coordinator/test/streamManager.test.ts
git commit -m "refactor(coordinator): StreamManager → SessionManager with per-request tracking"
```

---

### Task 8: Update index.ts

**Files:**
- Modify: `coordinator/src/index.ts`

- [ ] **Step 1: Update index.ts**

Key changes:
- Import `SessionManager` instead of `StreamManager`
- `streamManager` → `sessionManager`
- WS handlers: `handleOpenStream` → `handleOpenSession`, `handleAuth` → `handleRecordPayment`, `handleCloseStream` → `handleCloseSession`
- `open_stream` → `open_session`, `auth` → `record_payment`, `close_stream` → `close_session` message types
- Solvency watchdog now calls `requestsRemaining()` instead of `timeRemaining()`
- VaultClient calls: `closeStream()` → `closeSession()`, add `reportConsumption()` call in `handleRecordPayment`
- `stream_opened` → `session_opened`, `stream_update` → `session_update`, `stream_closed` → `session_closed`
- Error classes: use session error classes

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026/coordinator && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Smoke test**

Start server, verify health endpoint works.

- [ ] **Step 4: Commit**

```bash
cd /home/mbarr/Cannes2026
git add coordinator/src/index.ts
git commit -m "refactor(coordinator): update server for per-request session model"
```

---

### Task 9: Integration Verification

**Files:** None created.

- [ ] **Step 1: Run all coordinator tests**

```bash
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run Solidity tests**

```bash
cd /home/mbarr/Cannes2026 && forge test -v
```

Expected: All tests pass.

- [ ] **Step 3: Manual WS test**

Start coordinator, test open_session + record_payment + close_session via wscat.

- [ ] **Step 4: Final commit**

```bash
cd /home/mbarr/Cannes2026
git add -A coordinator/
git commit -m "chore: per-request refactor complete — contract + coordinator"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Session lifecycle (OPENING → ACTIVE → CLOSING → CLOSED/TERMINATED)
- [x] Per-request consumption tracking via `reportConsumption()`
- [x] On-chain solvency check via `isSolvent()`
- [x] `requestsRemaining()` view for frontend
- [x] Session timeout via `terminateExpired()`
- [x] Tiered pricing preserved (`_applyDiscount`)
- [x] Top-up preserved
- [x] WebSocket updates to frontend
- [x] REST endpoint for session status
- [x] Custom error classes (session-based)

**Not in scope (later phases):**
- ENS resolution (Phase 4)
- World ID verification (Phase 3)
- Seller API with 10 x402 endpoints (separate plan)
- Frontend dashboard (Phase 2)
- `GatewayClient.pay()` integration (seller API plan)

**Type consistency:** All files use session terminology. `ActiveSession`, `SessionStatus`, `SessionManager`, `RegisterSessionParams` consistent across types.ts, sessionManager.ts, errors.ts, index.ts.
