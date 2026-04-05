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
  ensName?: string;
}

// ─── WebSocket Messages ───

export type WsMessageIn =
  | { type: "open_session"; sessionId: Hex; seller: Address; pricePerRequest: string; deposit: string; verified: boolean; ensName?: string }
  | { type: "record_payment"; sessionId: Hex; category: string; amount: string }
  | { type: "close_session"; sessionId: Hex }
  | { type: "subscribe"; sessionId: Hex }
  | { type: "relay_finding"; sessionId: Hex; finding: AuditFinding };

export type WsMessageOut =
  | { type: "session_opened"; sessionId: Hex; effectivePrice: string; deposit: string; startTime: number; ensName?: string }
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
