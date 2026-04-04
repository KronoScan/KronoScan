import type { Address, Hex } from "viem";

// ─── Stream State ───

export type StreamStatus =
  | "OPENING"
  | "ACTIVE"
  | "CLOSING"
  | "CLOSED"
  | "TERMINATED";

export interface ActiveStream {
  streamId: Hex;
  buyer: Address;
  seller: Address;
  baseRate: bigint;
  effectiveRate: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number; // unix seconds
  status: StreamStatus;
  authCount: number;
  totalConsumed: bigint;
}

// ─── EIP-3009 Authorization ───

export interface EIP3009Auth {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

// ─── WebSocket Messages ───

export type WsMessageIn =
  | { type: "open_stream"; seller: Address; baseRate: string; deposit: string; verified: boolean }
  | { type: "auth"; streamId: Hex; authorization: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex; signature: Hex } }
  | { type: "close_stream"; streamId: Hex }
  | { type: "subscribe"; streamId: Hex };

export type WsMessageOut =
  | { type: "stream_opened"; streamId: Hex; effectiveRate: string; deposit: string; startTime: number }
  | { type: "stream_update"; streamId: Hex; status: StreamStatus; totalConsumed: string; timeRemaining: number; authCount: number }
  | { type: "stream_closed"; streamId: Hex; consumed: string; refunded: string; txHash: Hex }
  | { type: "finding"; streamId: Hex; finding: AuditFinding }
  | { type: "error"; message: string };

// ─── Audit Findings (proxied from seller SSE) ───

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AuditFinding {
  severity: Severity;
  title: string;
  line: number;
  description: string;
}
