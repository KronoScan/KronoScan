import type { Hex, Address } from "viem";
export interface SessionOpenedMsg {
    type: "session_opened";
    sessionId: Hex;
    effectivePrice: string;
    deposit: string;
    startTime: number;
}
export interface SessionUpdateMsg {
    type: "session_update";
    sessionId: Hex;
    status: string;
    totalConsumed: string;
    requestsRemaining: number;
    requestCount: number;
    completedCategories: string[];
}
export interface SessionClosedMsg {
    type: "session_closed";
    sessionId: Hex;
    consumed: string;
    refunded: string;
    txHash: Hex;
}
export interface ErrorMsg {
    type: "error";
    message: string;
}
type CoordinatorMsg = SessionOpenedMsg | SessionUpdateMsg | SessionClosedMsg | ErrorMsg;
export declare class CoordinatorClient {
    private ws;
    private messageQueue;
    private waiters;
    connect(): Promise<void>;
    private send;
    waitFor(type: string, timeoutMs?: number): Promise<CoordinatorMsg>;
    openSession(sessionId: Hex, seller: Address, pricePerRequest: string, deposit: string, verified: boolean, ensName?: string): Promise<SessionOpenedMsg>;
    recordPayment(sessionId: Hex, category: string, amount: string): Promise<SessionUpdateMsg>;
    closeSession(sessionId: Hex): Promise<SessionClosedMsg>;
    relayFinding(sessionId: Hex, finding: {
        severity: string;
        title: string;
        line: number;
        description: string;
        category: string;
    }): void;
    private rejectAllWaiters;
    disconnect(): void;
}
export {};
