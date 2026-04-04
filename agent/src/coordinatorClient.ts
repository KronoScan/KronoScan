import WebSocket from "ws";
import type { Hex, Address } from "viem";
import { COORDINATOR_WS_URL } from "./config.js";

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

export class CoordinatorClient {
  private ws: WebSocket | null = null;
  private messageQueue: CoordinatorMsg[] = [];
  private waiters: Array<{ resolve: (msg: CoordinatorMsg) => void; filter?: string }> = [];

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(COORDINATOR_WS_URL);

      this.ws.on("open", () => {
        console.log(`[coordinator] Connected to ${COORDINATOR_WS_URL}`);
        resolve();
      });

      this.ws.on("message", (raw) => {
        let msg: CoordinatorMsg;
        try {
          msg = JSON.parse(raw.toString()) as CoordinatorMsg;
        } catch {
          console.warn("[coordinator] Received non-JSON message, ignoring");
          return;
        }
        console.log(`[coordinator] ← ${msg.type}`, msg.type === "error" ? msg.message : "");

        const waiterIdx = this.waiters.findIndex((w) => !w.filter || w.filter === msg.type);
        if (waiterIdx >= 0) {
          const waiter = this.waiters.splice(waiterIdx, 1)[0];
          waiter.resolve(msg);
        } else {
          this.messageQueue.push(msg);
        }
      });

      this.ws.on("error", (err) => {
        console.error("[coordinator] WebSocket error:", err.message);
        reject(err);
      });

      this.ws.on("close", () => {
        console.log("[coordinator] Disconnected");
        this.rejectAllWaiters("WebSocket disconnected");
      });
    });
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to coordinator");
    }
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(type: string, timeoutMs = 10_000): Promise<CoordinatorMsg> {
    const idx = this.messageQueue.findIndex((m) => m.type === type);
    if (idx >= 0) {
      return Promise.resolve(this.messageQueue.splice(idx, 1)[0]);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.resolve === resolve);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);

      this.waiters.push({
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        filter: type,
      });
    });
  }

  async openSession(seller: Address, pricePerRequest: string, deposit: string, verified: boolean, ensName?: string): Promise<SessionOpenedMsg> {
    this.send({
      type: "open_session",
      seller,
      pricePerRequest,
      deposit,
      verified,
      ensName,
    });
    const msg = await this.waitFor("session_opened");
    return msg as SessionOpenedMsg;
  }

  async recordPayment(sessionId: Hex, category: string, amount: string): Promise<SessionUpdateMsg> {
    this.send({
      type: "record_payment",
      sessionId,
      category,
      amount,
    });
    const msg = await this.waitFor("session_update");
    return msg as SessionUpdateMsg;
  }

  async closeSession(sessionId: Hex): Promise<SessionClosedMsg> {
    this.send({
      type: "close_session",
      sessionId,
    });
    const msg = await this.waitFor("session_closed");
    return msg as SessionClosedMsg;
  }

  private rejectAllWaiters(reason: string): void {
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter.resolve({ type: "error", message: reason } as CoordinatorMsg);
    }
  }

  disconnect(): void {
    this.rejectAllWaiters("Client disconnected");
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
