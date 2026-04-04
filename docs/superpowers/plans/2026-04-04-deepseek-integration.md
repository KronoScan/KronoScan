# DeepSeek Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static pre-written findings with real AI-powered analysis via DeepSeek API, keeping pre-written findings as fallback. Add optional "deep scan" mode that runs each category twice with different analysis angles.

**Architecture:** New `deepseekAnalyzer.ts` module handles all DeepSeek API calls. The `handleAuditCategory` function in `index.ts` tries DeepSeek first, falls back to pre-written findings on failure. Non-streaming DeepSeek call with JSON output mode — we parse the response and stream findings via our existing SSE. A `scanMode` query param (`standard` vs `deep`) controls single vs double pass.

**Tech Stack:** DeepSeek API (OpenAI-compatible), native `fetch`, no extra dependencies

---

## File Map

| File | Responsibility |
|------|---------------|
| `seller-api/src/deepseekAnalyzer.ts` | Create — DeepSeek API client: builds prompts, calls API, parses JSON findings |
| `seller-api/src/prompts.ts` | Create — System prompts per category + deep scan variant prompts |
| `seller-api/src/index.ts` | Modify — Use DeepSeek analyzer with fallback to pre-written findings, add scanMode |
| `seller-api/src/types.ts` | Modify — Add `ScanMode` type, extend `AuditRequestBody` with `scanMode` |
| `seller-api/test/deepseekAnalyzer.test.ts` | Create — Unit tests for prompt building and response parsing (no live API) |

---

### Task 1: Update Types

**Files:**
- Modify: `seller-api/src/types.ts`

- [ ] **Step 1: Add ScanMode type and update AuditRequestBody**

Add to `seller-api/src/types.ts`:

```typescript
// ─── Scan Mode ───

export type ScanMode = "standard" | "deep";

// Update AuditRequestBody to include scanMode
```

Modify the existing `AuditRequestBody` interface:

```typescript
export interface AuditRequestBody {
  contractSource?: string;
  contractAddress?: string;
  chain?: string;
  scanMode?: ScanMode;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add seller-api/src/types.ts
git commit -m "feat(seller-api): add ScanMode type for deep scan support"
```

---

### Task 2: Category Prompts

**Files:**
- Create: `seller-api/src/prompts.ts`

Each audit category needs a focused system prompt that tells DeepSeek exactly what to look for. Deep scan mode uses a second prompt with a different analysis angle.

- [ ] **Step 1: Write prompts.ts**

Create `seller-api/src/prompts.ts`:

```typescript
import type { AuditCategory } from "./types.js";

const FINDING_FORMAT = `Return a JSON object with a "findings" array. Each finding must have:
- "severity": one of "CRITICAL", "HIGH", "MEDIUM", "LOW"
- "title": short descriptive title (under 80 chars)
- "line": the line number in the source code where the issue occurs
- "description": detailed explanation of the vulnerability and its impact (1-3 sentences)

If no issues found for this category, return {"findings": []}.
Example: {"findings": [{"severity": "HIGH", "title": "Reentrancy in withdraw()", "line": 42, "description": "State updated after external call..."}]}`;

const CATEGORY_PROMPTS: Record<AuditCategory, string> = {
  reentrancy: `You are a Solidity security auditor specializing in reentrancy vulnerabilities.
Analyze the contract for:
- State changes after external calls (transfers, low-level calls)
- Cross-function reentrancy via shared state
- Read-only reentrancy via view functions that read stale state
${FINDING_FORMAT}`,

  "access-control": `You are a Solidity security auditor specializing in access control.
Analyze the contract for:
- Missing access modifiers on sensitive functions
- Incorrect use of tx.origin instead of msg.sender
- Missing zero-address checks on ownership transfers
- Overprivileged roles or missing role separation
${FINDING_FORMAT}`,

  arithmetic: `You are a Solidity security auditor specializing in arithmetic and precision issues.
Analyze the contract for:
- Division before multiplication (precision loss)
- Unsafe casting between integer types
- Rounding errors in fee/reward calculations
- Potential overflow in unchecked blocks
${FINDING_FORMAT}`,

  "external-calls": `You are a Solidity security auditor specializing in external call safety.
Analyze the contract for:
- Unchecked return values on ERC20 transfer/transferFrom
- Low-level calls without success checks
- Delegatecall to untrusted targets
- Missing SafeERC20 usage
${FINDING_FORMAT}`,

  "token-standards": `You are a Solidity security auditor specializing in token standard compliance.
Analyze the contract for:
- ERC20 approval race conditions
- Missing allowance checks before transferFrom
- Non-standard token interactions (fee-on-transfer, rebasing)
- Missing support for tokens that don't return bool
${FINDING_FORMAT}`,

  "business-logic": `You are a Solidity security auditor specializing in business logic flaws.
Analyze the contract for:
- Logic errors that allow unintended state transitions
- Missing input validation on critical parameters
- Economic exploits (fee manipulation, front-running)
- Inconsistent state across related variables
${FINDING_FORMAT}`,

  "gas-optimization": `You are a Solidity security auditor specializing in gas optimization and DoS risks.
Analyze the contract for:
- Unbounded loops that can exceed block gas limit
- Redundant storage reads (should cache in memory)
- Inefficient data structures
- Operations that could be batched
${FINDING_FORMAT}`,

  "code-quality": `You are a Solidity security auditor specializing in code quality and best practices.
Analyze the contract for:
- Missing events for state changes
- Magic numbers without named constants
- Missing NatSpec documentation on public functions
- Dead code or unused variables
${FINDING_FORMAT}`,

  compiler: `You are a Solidity security auditor specializing in compiler and version issues.
Analyze the contract for:
- Using require strings instead of custom errors (gas waste since Solidity 0.8.4)
- Floating pragma that could compile with vulnerable versions
- Missing SPDX license identifier
- Deprecated Solidity patterns
${FINDING_FORMAT}`,

  defi: `You are a Solidity security auditor specializing in DeFi-specific vulnerabilities.
Analyze the contract for:
- Missing slippage protection on swaps/withdrawals
- Flash loan attack vectors
- Oracle manipulation risks
- Front-running / sandwich attack vectors
- Missing deadline parameters
${FINDING_FORMAT}`,
};

const DEEP_SCAN_PROMPTS: Record<AuditCategory, string> = {
  reentrancy: `You are a senior Solidity security researcher performing a DEEP analysis for reentrancy.
Go beyond obvious patterns. Look for:
- Cross-contract reentrancy via callbacks in token transfers
- Reentrancy through fallback/receive functions
- State inconsistencies exploitable across multiple transactions
- Reentrancy combined with other vulnerabilities (access control + reentrancy)
Focus on attack SCENARIOS, not just patterns. Describe how an attacker would chain calls.
${FINDING_FORMAT}`,

  "access-control": `You are a senior Solidity security researcher performing a DEEP analysis for access control.
Go beyond missing modifiers. Look for:
- Privilege escalation paths (can a non-owner become owner?)
- Time-of-check vs time-of-use on role checks
- Centralization risks (single key controlling everything)
- Missing two-step ownership transfer
${FINDING_FORMAT}`,

  arithmetic: `You are a senior Solidity security researcher performing a DEEP analysis for arithmetic.
Go beyond obvious overflow. Look for:
- Accumulated rounding errors across many operations
- Edge cases at uint256 boundaries
- Precision loss in percentage calculations with small values
- Arithmetic that behaves differently for edge inputs (0, 1, max)
${FINDING_FORMAT}`,

  "external-calls": `You are a senior Solidity security researcher performing a DEEP analysis for external calls.
Go beyond unchecked returns. Look for:
- Gas griefing via returning large data in calls
- Unexpected reverts from external contracts breaking internal logic
- Trust assumptions about external contract behavior
- Call depth attacks
${FINDING_FORMAT}`,

  "token-standards": `You are a senior Solidity security researcher performing a DEEP analysis for token standards.
Go beyond basic ERC20. Look for:
- Incompatibility with fee-on-transfer tokens
- Incompatibility with rebasing tokens
- Issues with tokens having >18 or <18 decimals
- ERC777 hook exploitation
${FINDING_FORMAT}`,

  "business-logic": `You are a senior Solidity security researcher performing a DEEP analysis for business logic.
Go beyond individual functions. Look for:
- Multi-step attack sequences combining multiple functions
- Economic invariants that can be violated
- Race conditions between transactions
- State that becomes permanently stuck or locked
${FINDING_FORMAT}`,

  "gas-optimization": `You are a senior Solidity security researcher performing a DEEP analysis for gas optimization.
Go beyond obvious patterns. Look for:
- Storage layout optimization (packing variables)
- Calldata vs memory for function parameters
- Unnecessary SLOAD/SSTORE patterns
- Short-circuit evaluation opportunities
${FINDING_FORMAT}`,

  "code-quality": `You are a senior Solidity security researcher performing a DEEP analysis for code quality.
Go beyond style. Look for:
- Functions that violate single-responsibility principle
- Missing error context in revert messages
- Confusing naming that could lead to future bugs
- Missing input validation that isn't a vulnerability today but could become one
${FINDING_FORMAT}`,

  compiler: `You are a senior Solidity security researcher performing a DEEP analysis for compiler issues.
Go beyond version pragmas. Look for:
- Solidity features used incorrectly for the target version
- ABI encoding differences between versions
- Known compiler bugs affecting the used version
- Optimizer settings that could cause issues
${FINDING_FORMAT}`,

  defi: `You are a senior Solidity security researcher performing a DEEP analysis for DeFi vulnerabilities.
Go beyond basic checks. Look for:
- Composability risks when integrated with other protocols
- MEV extraction opportunities
- Governance attack vectors
- Economic attacks requiring multiple transactions
- Liquidity-dependent vulnerabilities
${FINDING_FORMAT}`,
};

export function getPromptForCategory(category: AuditCategory, deep: boolean): string {
  return deep ? DEEP_SCAN_PROMPTS[category] : CATEGORY_PROMPTS[category];
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add seller-api/src/prompts.ts
git commit -m "feat(seller-api): add category-specific prompts for DeepSeek analysis"
```

---

### Task 3: DeepSeek Analyzer (with tests)

**Files:**
- Create: `seller-api/src/deepseekAnalyzer.ts`
- Create: `seller-api/test/deepseekAnalyzer.test.ts`

- [ ] **Step 1: Write the test file**

Create `seller-api/test/deepseekAnalyzer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseDeepSeekResponse, buildRequestBody } from "../src/deepseekAnalyzer.js";

describe("deepseekAnalyzer", () => {
  describe("parseDeepSeekResponse", () => {
    it("parses valid findings JSON", () => {
      const raw = JSON.stringify({
        findings: [
          {
            severity: "HIGH",
            title: "Reentrancy in withdraw()",
            line: 42,
            description: "State updated after external call.",
          },
        ],
      });
      const findings = parseDeepSeekResponse(raw, "reentrancy");
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("HIGH");
      expect(findings[0].category).toBe("reentrancy");
    });

    it("returns empty array for invalid JSON", () => {
      const findings = parseDeepSeekResponse("not json at all", "reentrancy");
      expect(findings).toEqual([]);
    });

    it("returns empty array for missing findings key", () => {
      const findings = parseDeepSeekResponse(JSON.stringify({ result: [] }), "reentrancy");
      expect(findings).toEqual([]);
    });

    it("filters out findings with invalid severity", () => {
      const raw = JSON.stringify({
        findings: [
          { severity: "HIGH", title: "Valid", line: 10, description: "ok" },
          { severity: "UNKNOWN", title: "Invalid", line: 20, description: "bad" },
        ],
      });
      const findings = parseDeepSeekResponse(raw, "reentrancy");
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Valid");
    });

    it("handles findings wrapped in markdown code block", () => {
      const raw = '```json\n{"findings": [{"severity": "LOW", "title": "Test", "line": 1, "description": "d"}]}\n```';
      const findings = parseDeepSeekResponse(raw, "compiler");
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe("compiler");
    });
  });

  describe("buildRequestBody", () => {
    it("includes model and json response format", () => {
      const body = buildRequestBody("contract code", "reentrancy", false);
      expect(body.model).toBe("deepseek-chat");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toContain("contract code");
    });

    it("uses different prompts for deep mode", () => {
      const standard = buildRequestBody("code", "reentrancy", false);
      const deep = buildRequestBody("code", "reentrancy", true);
      expect(standard.messages[0].content).not.toBe(deep.messages[0].content);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/mbarr/Cannes2026/seller-api && npx vitest run`
Expected: FAIL — `Cannot find module '../src/deepseekAnalyzer.js'`

- [ ] **Step 3: Write deepseekAnalyzer.ts**

Create `seller-api/src/deepseekAnalyzer.ts`:

```typescript
import type { AuditFinding, AuditCategory, Severity } from "./types.js";
import { getPromptForCategory } from "./prompts.js";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const VALID_SEVERITIES: Set<string> = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export interface DeepSeekRequestBody {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
  temperature: number;
  max_tokens: number;
}

export function buildRequestBody(
  contractSource: string,
  category: AuditCategory,
  deep: boolean
): DeepSeekRequestBody {
  const systemPrompt = getPromptForCategory(category, deep);
  return {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze the following Solidity smart contract for ${category} vulnerabilities:\n\n${contractSource}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 2048,
  };
}

export function parseDeepSeekResponse(raw: string, category: AuditCategory): AuditFinding[] {
  let content = raw.trim();

  // Strip markdown code blocks if present
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[deepseek] Failed to parse JSON response");
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.findings)) return [];

  const findings: AuditFinding[] = [];
  for (const item of obj.findings) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as Record<string, unknown>;

    if (
      typeof f.severity !== "string" ||
      !VALID_SEVERITIES.has(f.severity) ||
      typeof f.title !== "string" ||
      typeof f.line !== "number" ||
      typeof f.description !== "string"
    ) {
      continue;
    }

    findings.push({
      severity: f.severity as Severity,
      title: f.title,
      line: f.line,
      description: f.description,
      category,
    });
  }

  return findings;
}

export async function analyzeWithDeepSeek(
  contractSource: string,
  category: AuditCategory,
  deep: boolean
): Promise<AuditFinding[]> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY not set");
  }

  const body = buildRequestBody(contractSource, category, deep);

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty response");
  }

  return parseDeepSeekResponse(content, category);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/mbarr/Cannes2026/seller-api && npx vitest run`
Expected: All tests pass (9 existing + 7 new = 16 total).

- [ ] **Step 5: Commit**

```bash
git add seller-api/src/deepseekAnalyzer.ts seller-api/test/deepseekAnalyzer.test.ts
git commit -m "feat(seller-api): add DeepSeek analyzer with JSON parsing and tests"
```

---

### Task 4: Wire DeepSeek into Audit Routes

**Files:**
- Modify: `seller-api/src/index.ts`

Replace the static `getFindingsForCategory()` call with DeepSeek analysis + fallback.

- [ ] **Step 1: Update handleAuditCategory in index.ts**

Replace the current `handleAuditCategory` function (lines 37-78) with:

```typescript
import { analyzeWithDeepSeek } from "./deepseekAnalyzer.js";
import type { ScanMode } from "./types.js"; // add to existing import

async function handleAuditCategory(
  category: AuditCategory,
  req: express.Request,
  res: express.Response
): Promise<void> {
  const body = req.body as AuditRequestBody;
  const scanMode: ScanMode = body.scanMode ?? "standard";

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
    contractSource = SAMPLE_CONTRACT;
  }

  // SSE response
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let findings: AuditFinding[];
  let source: "deepseek" | "fallback";

  // Try DeepSeek first, fall back to pre-written findings
  try {
    findings = await analyzeWithDeepSeek(contractSource, category, false);
    source = "deepseek";
    console.log(`[audit/${category}] DeepSeek returned ${findings.length} findings`);
  } catch (err) {
    console.warn(`[audit/${category}] DeepSeek failed, using fallback:`, err instanceof Error ? err.message : err);
    findings = getFindingsForCategory(category);
    source = "fallback";
  }

  // Deep scan: run second pass with different analysis angle
  if (scanMode === "deep" && source === "deepseek") {
    try {
      const deepFindings = await analyzeWithDeepSeek(contractSource, category, true);
      console.log(`[audit/${category}] Deep scan returned ${deepFindings.length} additional findings`);
      // Merge, avoiding duplicate titles
      const existingTitles = new Set(findings.map((f) => f.title));
      for (const f of deepFindings) {
        if (!existingTitles.has(f.title)) {
          findings.push(f);
        }
      }
    } catch (err) {
      console.warn(`[audit/${category}] Deep scan failed:`, err instanceof Error ? err.message : err);
    }
  }

  for (const finding of findings) {
    res.write(`data: ${JSON.stringify(finding)}\n\n`);
    await sleep(source === "deepseek" ? 500 : 1500);
  }

  res.write(`data: ${JSON.stringify({ type: "category_complete", category, findingCount: findings.length, source, scanMode })}\n\n`);
  res.end();
}
```

Also add the import at the top of the file:

```typescript
import { analyzeWithDeepSeek } from "./deepseekAnalyzer.js";
```

And update the existing type import to include `ScanMode` and `AuditFinding`:

```typescript
import { AUDIT_CATEGORIES, type AuditCategory, type AuditRequestBody, type ScanMode, type AuditFinding } from "./types.js";
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/mbarr/Cannes2026/seller-api && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `cd /home/mbarr/Cannes2026/seller-api && npx vitest run`
Expected: All 16 tests pass.

- [ ] **Step 4: Smoke test — fallback mode (no API key)**

Start server without DEEPSEEK_API_KEY set:

```bash
cd /home/mbarr/Cannes2026/seller-api && DEEPSEEK_API_KEY= npx tsx src/index.ts &
sleep 2
curl -s -X POST http://localhost:3002/api/audit/reentrancy -H "payment-signature: test" -H "Content-Type: application/json" -d '{}' | head -5
kill %1
```

Expected: Pre-written findings stream via SSE (fallback mode). Console shows `DeepSeek failed, using fallback: DEEPSEEK_API_KEY not set`.

- [ ] **Step 5: Commit**

```bash
git add seller-api/src/index.ts
git commit -m "feat(seller-api): wire DeepSeek analyzer with fallback to pre-written findings"
```

---

### Task 5: Integration Test + Env Setup

**Files:** None created — verification and documentation.

- [ ] **Step 1: Run all test suites**

```bash
cd /home/mbarr/Cannes2026/seller-api && npx vitest run
cd /home/mbarr/Cannes2026/coordinator && npx vitest run
cd /home/mbarr/Cannes2026 && forge test
```

Expected: All tests pass across all components.

- [ ] **Step 2: Test with real DeepSeek API key (if available)**

```bash
cd /home/mbarr/Cannes2026/seller-api && DEEPSEEK_API_KEY=<your-key> npx tsx src/index.ts &
sleep 2

# Standard scan
curl -s -X POST http://localhost:3002/api/audit/reentrancy \
  -H "payment-signature: test" \
  -H "Content-Type: application/json" \
  -d '{}' -N

# Deep scan
curl -s -X POST http://localhost:3002/api/audit/reentrancy \
  -H "payment-signature: test" \
  -H "Content-Type: application/json" \
  -d '{"scanMode": "deep"}' -N

kill %1
```

Expected: Real AI-generated findings with proper JSON structure. Deep scan returns additional findings beyond the standard pass.

- [ ] **Step 3: Commit final**

```bash
git add -A seller-api/
git commit -m "chore(seller-api): DeepSeek integration complete with fallback + deep scan"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] DeepSeek API integration for real analysis — Task 3 (analyzeWithDeepSeek)
- [x] Pre-written findings as fallback — Task 4 (try/catch in handleAuditCategory)
- [x] JSON output mode for structured findings — Task 3 (response_format: json_object)
- [x] Category-specific prompts — Task 2 (10 standard + 10 deep prompts)
- [x] Deep scan mode (optional) — Task 4 (scanMode param, second pass with dedup)
- [x] Response parsing with validation — Task 3 (parseDeepSeekResponse filters invalid)
- [x] Markdown code block stripping — Task 3 (regex extraction)
- [x] 30s timeout on API calls — Task 3 (AbortSignal.timeout)
- [x] Existing SSE format preserved — Task 4 (same data format + category_complete)
- [x] No new dependencies — native fetch only

**Not in scope:**
- Streaming DeepSeek response (non-streaming is simpler and more reliable for JSON parsing)
- Caching of analysis results (not needed for hackathon demo)
- Rate limiting (single user demo)

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** `AuditFinding`, `AuditCategory`, `Severity`, `ScanMode` used consistently across all files.
