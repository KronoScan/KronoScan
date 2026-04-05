# Phase 2: Seller API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Seller API — an Express server with 10 x402-protected audit category endpoints that stream vulnerability findings via SSE. Includes a sample vulnerable contract, pre-written findings matched to it, and on-chain source resolution via block explorer API.

**Architecture:** Single-process Express server. Each of the 10 audit categories is a separate `POST /api/audit/:category` route. Without payment headers, routes return `402 Payment Required`. With valid payment, routes stream category-specific findings via SSE. Findings are pre-written and matched to a sample vulnerable contract. Source can be provided directly or fetched from a block explorer API by contract address.

**Tech Stack:** TypeScript (ESM, strict), Express, vitest, tsx (dev runner)

---

## File Map

| File | Responsibility |
|------|---------------|
| `seller-api/package.json` | Dependencies + scripts |
| `seller-api/tsconfig.json` | TypeScript config (ESM, strict) |
| `seller-api/src/types.ts` | Shared types: AuditFinding, AuditCategory, x402 types |
| `seller-api/src/sampleContract.ts` | Intentionally vulnerable Solidity contract for demo |
| `seller-api/src/findings.ts` | Pre-written findings per category, matched to sample contract |
| `seller-api/src/sourceResolver.ts` | Fetch verified source from block explorer API (address → source) |
| `seller-api/src/x402.ts` | x402 middleware: returns 402 without payment, passes through with payment |
| `seller-api/src/index.ts` | Express server entry: 10 audit routes + health check |
| `seller-api/test/findings.test.ts` | Unit tests for findings data integrity |
| `seller-api/test/sourceResolver.test.ts` | Unit tests for source resolver |

---

### Task 1: Project Scaffold

**Files:**
- Create: `seller-api/package.json`
- Create: `seller-api/tsconfig.json`

- [ ] **Step 1: Create seller-api directory**

```bash
mkdir -p /home/mbarr/Cannes2026/seller-api/src
mkdir -p /home/mbarr/Cannes2026/seller-api/test
```

- [ ] **Step 2: Write package.json**

Create `seller-api/package.json`:

```json
{
  "name": "kronoscan-seller-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.3",
    "@types/node": "^25.5.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.3"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

Create `seller-api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd /home/mbarr/Cannes2026/seller-api && npm install
```

Expected: `node_modules/` created, `package-lock.json` generated, no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/package.json seller-api/tsconfig.json seller-api/package-lock.json
git commit -m "chore: scaffold seller-api package with deps"
```

---

### Task 2: Types

**Files:**
- Create: `seller-api/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// ─── Audit Categories ───

export const AUDIT_CATEGORIES = [
  "reentrancy",
  "access-control",
  "arithmetic",
  "external-calls",
  "token-standards",
  "business-logic",
  "gas-optimization",
  "code-quality",
  "compiler",
  "defi",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

// ─── Findings ───

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AuditFinding {
  severity: Severity;
  title: string;
  line: number;
  description: string;
  category: AuditCategory;
}

// ─── x402 ───

export interface X402PricingInfo {
  paymentRequired: true;
  scheme: "exact";
  pricePerRequest: number;
  network: string;
  sellerAddress: string;
  sellerENS: string;
  acceptsUnverified: boolean;
  category: AuditCategory;
}

// ─── Request Body ───

export interface AuditRequestBody {
  contractSource?: string;
  contractAddress?: string;
  chain?: string;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/src/types.ts
git commit -m "feat(seller-api): add shared types for categories, findings, x402"
```

---

### Task 3: Sample Vulnerable Contract

**Files:**
- Create: `seller-api/src/sampleContract.ts`

This is the intentionally vulnerable Solidity contract that findings reference. It must contain real bugs that the pre-written findings accurately describe.

- [ ] **Step 1: Write sampleContract.ts**

```typescript
/// The sample vulnerable contract used for the demo.
/// Intentionally contains vulnerabilities across multiple categories.
/// Pre-written findings in findings.ts reference specific lines in this contract.
export const SAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VulnerableVault {
    address public owner;
    IERC20 public token;
    mapping(address => uint256) public balances;
    mapping(address => bool) public authorized;
    uint256 public totalDeposits;
    uint256 public feePercent = 5;
    bool public paused;

    event Deposit(address user, uint256 amount);
    event Withdrawal(address user, uint256 amount);

    constructor(address _token) {
        owner = msg.sender;
        token = IERC20(_token);
    }

    // LINE 23 — Missing access control: anyone can set fee
    function setFeePercent(uint256 _fee) external {
        feePercent = _fee;
    }

    // LINE 28 — Missing zero-address check
    function setOwner(address _newOwner) external {
        require(msg.sender == owner, "Not owner");
        owner = _newOwner;
    }

    function deposit(uint256 amount) external {
        require(!paused, "Paused");
        token.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalDeposits += amount;
        emit Deposit(msg.sender, amount);
    }

    // LINE 41 — Reentrancy: state updated after external call
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient");
        uint256 fee = amount * feePercent / 100;
        uint256 payout = amount - fee;
        token.transfer(msg.sender, payout);
        token.transfer(owner, fee);
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        emit Withdrawal(msg.sender, amount);
    }

    // LINE 52 — Division before multiplication (precision loss)
    function calculateReward(uint256 amount, uint256 rate) public pure returns (uint256) {
        return amount / 1000 * rate;
    }

    // LINE 57 — Unchecked return value on transfer
    function emergencyTransfer(address to, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        token.transfer(to, amount);
    }

    // LINE 63 — No event emitted for critical state change
    function pause() external {
        require(msg.sender == owner, "Not owner");
        paused = true;
    }

    function unpause() external {
        require(msg.sender == owner, "Not owner");
        paused = false;
    }

    // LINE 72 — Uses tx.origin instead of msg.sender
    function authorizeUser(address user) external {
        require(tx.origin == owner, "Not owner");
        authorized[user] = true;
    }

    // LINE 78 — Unbounded loop: gas DoS if array grows
    function batchTransfer(address[] calldata recipients, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        for (uint256 i = 0; i < recipients.length; i++) {
            token.transfer(recipients[i], amount);
        }
    }

    // LINE 85 — Magic number, unclear intent
    function isWhale(uint256 amount) public pure returns (bool) {
        return amount > 1000000000000000000000;
    }

    // LINE 90 — Using old Solidity pattern, should use custom errors
    function adminWithdraw(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(amount <= address(this).balance, "Insufficient ETH");
        payable(owner).transfer(amount);
    }
}`;

/// Total number of lines in the sample contract
export const SAMPLE_CONTRACT_LINES = SAMPLE_CONTRACT.split("\\n").length;
```

- [ ] **Step 2: Verify compilation**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/src/sampleContract.ts
git commit -m "feat(seller-api): add sample vulnerable contract for demo"
```

---

### Task 4: Pre-written Findings (with tests)

**Files:**
- Create: `seller-api/src/findings.ts`
- Create: `seller-api/test/findings.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from "vitest";
import { getFindingsForCategory, ALL_FINDINGS } from "../src/findings.js";
import { AUDIT_CATEGORIES, type AuditCategory } from "../src/types.js";

describe("findings", () => {
  it("has findings for every category", () => {
    for (const category of AUDIT_CATEGORIES) {
      const findings = getFindingsForCategory(category);
      expect(findings.length).toBeGreaterThan(0);
    }
  });

  it("every finding has required fields", () => {
    for (const finding of ALL_FINDINGS) {
      expect(finding.severity).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)$/);
      expect(finding.title).toBeTruthy();
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.description).toBeTruthy();
      expect(AUDIT_CATEGORIES).toContain(finding.category);
    }
  });

  it("has at least 10 findings total", () => {
    expect(ALL_FINDINGS.length).toBeGreaterThanOrEqual(10);
  });

  it("has a mix of severities", () => {
    const severities = new Set(ALL_FINDINGS.map((f) => f.severity));
    expect(severities.size).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array for unknown category", () => {
    const findings = getFindingsForCategory("nonexistent" as AuditCategory);
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: FAIL — `Cannot find module '../src/findings.js'`

- [ ] **Step 3: Write findings.ts**

```typescript
import type { AuditFinding, AuditCategory } from "./types.js";

/// Pre-written findings matched to the sample vulnerable contract.
/// Each finding references a real vulnerability at a specific line.
export const ALL_FINDINGS: AuditFinding[] = [
  // ─── Reentrancy ───
  {
    severity: "CRITICAL",
    title: "Reentrancy in withdraw()",
    line: 41,
    description:
      "State variables `balances` and `totalDeposits` are updated after external calls to `token.transfer()`. An attacker can re-enter `withdraw()` before balance is decremented, draining the vault.",
    category: "reentrancy",
  },

  // ─── Access Control ───
  {
    severity: "CRITICAL",
    title: "Missing access control on setFeePercent()",
    line: 23,
    description:
      "The `setFeePercent()` function has no access modifier. Any address can set arbitrary fee percentages, including 100%, stealing all withdrawals.",
    category: "access-control",
  },
  {
    severity: "HIGH",
    title: "tx.origin used for authorization",
    line: 72,
    description:
      "Using `tx.origin` instead of `msg.sender` enables phishing attacks. If the owner calls a malicious contract, the attacker can call `authorizeUser()` through the owner's transaction.",
    category: "access-control",
  },

  // ─── Arithmetic ───
  {
    severity: "MEDIUM",
    title: "Division before multiplication in calculateReward()",
    line: 52,
    description:
      "Expression `amount / 1000 * rate` loses precision due to integer division truncation. Should be `amount * rate / 1000` to preserve precision.",
    category: "arithmetic",
  },

  // ─── External Calls ───
  {
    severity: "HIGH",
    title: "Unchecked return value on ERC20 transfer",
    line: 57,
    description:
      "The `emergencyTransfer()` function calls `token.transfer()` without checking the return value. Some ERC20 tokens return `false` on failure instead of reverting. Use `SafeERC20.safeTransfer()`.",
    category: "external-calls",
  },
  {
    severity: "MEDIUM",
    title: "Unchecked transferFrom in deposit()",
    line: 36,
    description:
      "The `deposit()` function calls `token.transferFrom()` without checking the return value. Non-reverting tokens could credit the user without actually receiving tokens.",
    category: "external-calls",
  },

  // ─── Token Standards ───
  {
    severity: "LOW",
    title: "No ERC20 approval validation in deposit",
    line: 34,
    description:
      "The contract does not verify that sufficient allowance exists before calling `transferFrom()`. While this will revert for standard ERC20 tokens, a descriptive error or pre-check improves UX.",
    category: "token-standards",
  },

  // ─── Business Logic ───
  {
    severity: "CRITICAL",
    title: "Fee percentage can be set to 100% or higher",
    line: 23,
    description:
      "Combined with the missing access control, `feePercent` can be set to any value. At 100%, the owner receives the entire withdrawal amount. At >100%, the subtraction underflows (pre-0.8.0) or reverts, locking all funds.",
    category: "business-logic",
  },

  // ─── Gas Optimization ───
  {
    severity: "LOW",
    title: "Unbounded loop in batchTransfer()",
    line: 78,
    description:
      "The `batchTransfer()` function iterates over an unbounded `recipients` array. A sufficiently large array will exceed the block gas limit, making the function permanently unusable.",
    category: "gas-optimization",
  },

  // ─── Code Quality ───
  {
    severity: "LOW",
    title: "Missing event for critical state changes",
    line: 63,
    description:
      "The `pause()` and `unpause()` functions modify the critical `paused` state variable but emit no events. Off-chain monitoring cannot detect pause/unpause actions.",
    category: "code-quality",
  },
  {
    severity: "LOW",
    title: "Magic number in isWhale()",
    line: 85,
    description:
      "The threshold `1000000000000000000000` (1000 tokens with 18 decimals) is a magic number. Extract to a named constant for readability and maintainability.",
    category: "code-quality",
  },

  // ─── Compiler ───
  {
    severity: "LOW",
    title: "Using require strings instead of custom errors",
    line: 90,
    description:
      "Solidity ^0.8.20 supports custom errors which are more gas-efficient than `require()` with string messages. Each string costs extra deployment and runtime gas.",
    category: "compiler",
  },

  // ─── DeFi-Specific ───
  {
    severity: "MEDIUM",
    title: "No slippage protection on withdrawals",
    line: 41,
    description:
      "The `withdraw()` function applies a fee percentage that can change between transaction submission and execution. Users have no way to specify a minimum payout, enabling sandwich attacks on fee changes.",
    category: "defi",
  },
  {
    severity: "MEDIUM",
    title: "Missing zero-address check in setOwner()",
    line: 28,
    description:
      "The `setOwner()` function does not validate that `_newOwner` is not `address(0)`. Setting owner to zero address permanently locks all owner-gated functions including `emergencyTransfer()` and `pause()`.",
    category: "defi",
  },
];

/// Returns findings for a specific audit category.
export function getFindingsForCategory(category: AuditCategory): AuditFinding[] {
  return ALL_FINDINGS.filter((f) => f.category === category);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/src/findings.ts seller-api/test/findings.test.ts
git commit -m "feat(seller-api): add pre-written findings matched to sample contract"
```

---

### Task 5: Source Resolver (with tests)

**Files:**
- Create: `seller-api/src/sourceResolver.ts`
- Create: `seller-api/test/sourceResolver.test.ts`

Fetches verified Solidity source from a block explorer API (Etherscan-compatible) given a contract address.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from "vitest";
import { buildExplorerUrl, parseExplorerResponse } from "../src/sourceResolver.js";

describe("sourceResolver", () => {
  describe("buildExplorerUrl", () => {
    it("builds correct URL for arc-testnet", () => {
      const url = buildExplorerUrl("0xabc123", "arc-testnet");
      expect(url).toContain("module=contract");
      expect(url).toContain("action=getsourcecode");
      expect(url).toContain("address=0xabc123");
    });
  });

  describe("parseExplorerResponse", () => {
    it("extracts source code from valid response", () => {
      const response = {
        status: "1",
        result: [{ SourceCode: "pragma solidity ^0.8.0; contract Foo {}" }],
      };
      const source = parseExplorerResponse(response);
      expect(source).toBe("pragma solidity ^0.8.0; contract Foo {}");
    });

    it("returns null for unverified contract", () => {
      const response = {
        status: "1",
        result: [{ SourceCode: "" }],
      };
      const source = parseExplorerResponse(response);
      expect(source).toBeNull();
    });

    it("returns null for error response", () => {
      const response = {
        status: "0",
        result: "Invalid address",
      };
      const source = parseExplorerResponse(response);
      expect(source).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: FAIL — `Cannot find module '../src/sourceResolver.js'`

- [ ] **Step 3: Write sourceResolver.ts**

```typescript
const EXPLORER_URLS: Record<string, string> = {
  "arc-testnet": "https://testnet.arcscan.app/api",
};

export function buildExplorerUrl(address: string, chain: string): string {
  const baseUrl = EXPLORER_URLS[chain] ?? EXPLORER_URLS["arc-testnet"];
  const apiKey = process.env.ETHERSCAN_API_KEY ?? "";
  return `${baseUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
}

export function parseExplorerResponse(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;

  const obj = data as Record<string, unknown>;
  if (obj.status !== "1") return null;
  if (!Array.isArray(obj.result)) return null;

  const first = obj.result[0] as Record<string, unknown> | undefined;
  if (!first) return null;

  const source = first.SourceCode;
  if (typeof source !== "string" || source === "") return null;

  return source;
}

export async function resolveSource(address: string, chain: string): Promise<string | null> {
  const url = buildExplorerUrl(address, chain);

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  return parseExplorerResponse(data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: All tests PASS (8 tests: 5 findings + 3 source resolver).

- [ ] **Step 5: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/src/sourceResolver.ts seller-api/test/sourceResolver.test.ts
git commit -m "feat(seller-api): add source resolver for on-chain contract addresses"
```

---

### Task 6: x402 Middleware

**Files:**
- Create: `seller-api/src/x402.ts`

This middleware checks for payment headers. Without them, it returns `402 Payment Required` with pricing info. With them, it passes through to the handler.

For now, payment validation is a simple header check. Real `GatewayClient` integration will use `createGatewayMiddleware()` from `@circle-fin/x402-batching` — added in a later phase when we wire up the buyer agent.

- [ ] **Step 1: Write x402.ts**

```typescript
import type { Request, Response, NextFunction } from "express";
import type { AuditCategory, X402PricingInfo } from "./types.js";

const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const SELLER_ENS = process.env.SELLER_ENS ?? "audit.kronoscan.eth";
const PRICE_PER_REQUEST = parseInt(process.env.PRICE_PER_REQUEST ?? "100", 10); // USDC micro-units

export function x402Middleware(category: AuditCategory) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const paymentHeader = req.headers["payment-signature"] ?? req.headers["x-payment"];

    if (!paymentHeader) {
      const pricing: X402PricingInfo = {
        paymentRequired: true,
        scheme: "exact",
        pricePerRequest: PRICE_PER_REQUEST,
        network: "arc-testnet",
        sellerAddress: SELLER_ADDRESS,
        sellerENS: SELLER_ENS,
        acceptsUnverified: true,
        category,
      };
      res.status(402).json(pricing);
      return;
    }

    // In production: validate payment via createGatewayMiddleware()
    // For now: any non-empty payment header is accepted
    next();
  };
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/src/x402.ts
git commit -m "feat(seller-api): add x402 middleware for payment-gated endpoints"
```

---

### Task 7: Express Server + 10 Audit Routes

**Files:**
- Create: `seller-api/src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
import express from "express";
import { AUDIT_CATEGORIES, type AuditCategory, type AuditRequestBody } from "./types.js";
import { getFindingsForCategory } from "./findings.js";
import { resolveSource } from "./sourceResolver.js";
import { x402Middleware } from "./x402.js";
import { SAMPLE_CONTRACT } from "./sampleContract.js";

const PORT = parseInt(process.env.SELLER_PORT ?? "3002", 10);

const app = express();
app.use(express.json());

// ─── Health ───

app.get("/health", (_req, res) => {
  res.json({ status: "ok", categories: AUDIT_CATEGORIES.length });
});

// ─── Sample contract endpoint (for dashboard to display) ───

app.get("/api/sample-contract", (_req, res) => {
  res.json({ source: SAMPLE_CONTRACT });
});

// ─── List available categories ───

app.get("/api/categories", (_req, res) => {
  res.json({ categories: AUDIT_CATEGORIES });
});

// ─── 10 Audit Category Routes ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleAuditCategory(
  category: AuditCategory,
  req: express.Request,
  res: express.Response
): Promise<void> {
  const body = req.body as AuditRequestBody;

  // Resolve contract source
  let contractSource = body.contractSource;

  if (body.contractAddress && !contractSource) {
    const chain = body.chain ?? "arc-testnet";
    contractSource = await resolveSource(body.contractAddress, chain) ?? undefined;
    if (!contractSource) {
      res.status(400).json({ error: "Contract not verified on block explorer" });
      return;
    }
  }

  if (!contractSource) {
    // Default to sample contract for demo
    contractSource = SAMPLE_CONTRACT;
  }

  // SSE response
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const findings = getFindingsForCategory(category);

  for (const finding of findings) {
    res.write(`data: ${JSON.stringify(finding)}\n\n`);
    await sleep(1500); // simulate analysis time per finding
  }

  // Signal completion
  res.write(`data: ${JSON.stringify({ type: "category_complete", category, findingCount: findings.length })}\n\n`);
  res.end();
}

// Register all 10 category routes
for (const category of AUDIT_CATEGORIES) {
  app.post(
    `/api/audit/${category}`,
    x402Middleware(category),
    (req, res) => {
      handleAuditCategory(category, req, res).catch((err) => {
        console.error(`[audit/${category}] Error:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal error" });
        }
      });
    }
  );
}

// ─── Start ───

app.listen(PORT, () => {
  console.log(`[seller-api] Listening on http://localhost:${PORT}`);
  console.log(`[seller-api] ${AUDIT_CATEGORIES.length} audit categories available`);
  console.log(`[seller-api] Endpoints: ${AUDIT_CATEGORIES.map((c) => `POST /api/audit/${c}`).join(", ")}`);
});
```

- [ ] **Step 2: Verify compilation**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Smoke test — server starts and responds**

Terminal 1:
```bash
cd /home/mbarr/Cannes2026/seller-api && npm run start
```

Expected output:
```
[seller-api] Listening on http://localhost:3002
[seller-api] 10 audit categories available
```

Terminal 2 — test health:
```bash
curl http://localhost:3002/health
```

Expected: `{"status":"ok","categories":10}`

Terminal 2 — test 402 response:
```bash
curl -X POST http://localhost:3002/api/audit/reentrancy -H "Content-Type: application/json" -d '{}'
```

Expected: `{"paymentRequired":true,"scheme":"exact","pricePerRequest":100,...}`

Terminal 2 — test with payment (SSE stream):
```bash
curl -X POST http://localhost:3002/api/audit/reentrancy -H "Content-Type: application/json" -H "payment-signature: test" -d '{}' -N
```

Expected: SSE stream with reentrancy findings, then `category_complete` event.

Kill the server with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /home/mbarr/Cannes2026
git add seller-api/src/index.ts
git commit -m "feat(seller-api): add Express server with 10 x402-protected audit routes"
```

---

### Task 8: Integration Verification

**Files:** None created — final verification.

- [ ] **Step 1: Run all seller-api tests**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run coordinator tests (ensure nothing broke)**

```bash
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
```

Expected: All 8 tests pass.

- [ ] **Step 3: Run Solidity tests**

```bash
cd /home/mbarr/Cannes2026 && forge test -v
```

Expected: All 33 tests pass.

- [ ] **Step 4: Final commit**

```bash
cd /home/mbarr/Cannes2026
git add -A seller-api/
git commit -m "chore(seller-api): Phase 2 complete — seller API with 10 audit categories"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] 10 x402-protected audit category endpoints — Task 7 (all registered via loop)
- [x] 402 Payment Required response — Task 6 (x402 middleware)
- [x] SSE streaming of findings — Task 7 (handleAuditCategory)
- [x] Source mode (contractSource) — Task 7 (request body handling)
- [x] Address mode (contractAddress → block explorer fetch) — Task 5 + Task 7
- [x] Pre-written findings matched to sample contract — Task 3 + Task 4
- [x] Severity distribution: 3 Critical, 2 High, 4 Medium, 5 Low — Task 4 (14 findings)
- [x] Category completion signal — Task 7 (`category_complete` SSE event)

**Not in scope (later phases):**
- DeepSeek API integration (optional enhancement, separate task)
- AgentKit hooks on seller side (Phase 3 — World ID)
- Real `createGatewayMiddleware()` x402 validation (wired up with buyer agent)
- Trust tiers (verified vs unverified findings) (Phase 3)

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** `AuditFinding`, `AuditCategory`, `Severity`, `X402PricingInfo`, `AuditRequestBody` used consistently across types.ts, findings.ts, x402.ts, index.ts. `getFindingsForCategory()` signature matches usage in both index.ts and test.
