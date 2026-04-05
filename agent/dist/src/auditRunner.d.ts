import type { Hex } from "viem";
import { type AuditFinding } from "./sseParser.js";
import { CoordinatorClient } from "./coordinatorClient.js";
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
export declare function runAudit(paymentFetch: (url: string | URL | Request, init?: RequestInit) => Promise<Response>, coordinator: CoordinatorClient, sessionId: Hex, _effectivePrice: string, contractSource?: string, sellerApiUrl?: string): Promise<AuditSummary>;
