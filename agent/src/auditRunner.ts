import type { Hex } from "viem";
import { SELLER_API_URL as DEFAULT_SELLER_API_URL, AUDIT_CATEGORIES } from "./config.js";
import {
  parseSSEStream,
  isCategoryComplete,
  isFinding,
  type AuditFinding,
} from "./sseParser.js";
import { CoordinatorClient } from "./coordinatorClient.js";
import { getPaymentMode } from "./x402Client.js";

export interface AuditResult {
  category: string;
  findings: AuditFinding[];
  source: string;
  paymentMode: string;
}

export interface AuditSummary {
  results: AuditResult[];
  totalFindings: number;
  totalCost: bigint;
  bySeverity: Record<string, number>;
}

export async function runAudit(
  paymentFetch: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
  coordinator: CoordinatorClient,
  sessionId: Hex,
  effectivePrice: string,
  contractSource?: string,
  sellerApiUrl?: string,
): Promise<AuditSummary> {
  const results: AuditResult[] = [];
  let totalCost = 0n;
  const bySeverity: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const paymentMode = getPaymentMode();

  console.log("\n═══════════════════════════════════════════");
  console.log("  AUDIT STARTING — 10 categories");
  console.log(`  Payment mode: ${paymentMode}`);
  console.log("═══════════════════════════════════════════\n");

  for (const category of AUDIT_CATEGORIES) {
    console.log(`\n── [${results.length + 1}/10] ${category} ──`);

    const apiBase = sellerApiUrl || DEFAULT_SELLER_API_URL;
    const url = `${apiBase}/api/audit/${category}`;
    const body: Record<string, string> = {};
    if (contractSource) {
      body.contractSource = contractSource;
    }

    try {
      const response = await paymentFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const paymentHeader = response.headers.get("payment-required");
        if (paymentHeader) {
          try {
            const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
            console.error(`  x HTTP ${response.status}: ${decoded.error ?? "unknown error"}`);
          } catch {
            console.error(`  x HTTP ${response.status}: ${await response.text()}`);
          }
        } else {
          console.error(`  x HTTP ${response.status}: ${await response.text()}`);
        }
        continue;
      }

      // Read SSE response body
      const text = await response.text();
      const events = parseSSEStream(text);

      const findings: AuditFinding[] = [];
      let source = "unknown";

      for (const event of events) {
        if (isFinding(event)) {
          findings.push(event);
          bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
          console.log(
            `  ${severityIcon(event.severity)} [${event.severity}] ${event.title} (line ${event.line})`,
          );
          coordinator.relayFinding(sessionId, {
            severity: event.severity,
            title: event.title,
            line: event.line,
            description: event.description ?? "",
            category,
          });
        } else if (isCategoryComplete(event)) {
          source = event.source ?? "unknown";
        }
      }

      // Report payment to coordinator
      try {
        const update = await coordinator.recordPayment(sessionId, category, effectivePrice);
        totalCost += BigInt(effectivePrice);
        console.log(
          `  Paid ${effectivePrice} | Total: ${update.totalConsumed} | Remaining: ${update.requestsRemaining}`,
        );
      } catch (err) {
        console.error(
          `  Warning: Failed to record payment:`,
          err instanceof Error ? err.message : err,
        );
        totalCost += BigInt(effectivePrice);
      }

      results.push({ category, findings, source, paymentMode });
      console.log(`  Done: ${findings.length} finding(s) | source: ${source}`);
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    results,
    totalFindings: results.reduce((n, r) => n + r.findings.length, 0),
    totalCost,
    bySeverity,
  };
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "[CRIT]";
    case "HIGH":
      return "[HIGH]";
    case "MEDIUM":
      return "[MED] ";
    case "LOW":
      return "[LOW] ";
    default:
      return "[INFO]";
  }
}
