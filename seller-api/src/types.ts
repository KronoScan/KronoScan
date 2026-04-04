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

// ─── Scan Mode ───

export type ScanMode = "standard" | "deep";

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
  scanMode?: ScanMode;
}
