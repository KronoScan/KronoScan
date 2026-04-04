import express from "express";
import { AUDIT_CATEGORIES, type AuditCategory, type AuditRequestBody, type ScanMode, type AuditFinding } from "./types.js";
import { getFindingsForCategory } from "./findings.js";
import { analyzeWithDeepSeek } from "./deepseekAnalyzer.js";
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

  let findings: AuditFinding[];
  let source: "deepseek" | "fallback";

  // Try DeepSeek first, fall back to pre-written findings
  // First pass is always standard; deep mode adds a second pass with a different angle
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

  // SSE response — headers sent after findings are resolved so errors can return 500
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const finding of findings) {
    res.write(`data: ${JSON.stringify(finding)}\n\n`);
    await sleep(source === "deepseek" ? 500 : 1500);
  }

  res.write(`data: ${JSON.stringify({ type: "category_complete", category, findingCount: findings.length, source, scanMode })}\n\n`);
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
