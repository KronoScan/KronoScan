import type { ActiveSession, SessionStatus } from "./types.js";
import type { Address, Hex } from "viem";
import {
  SessionAlreadyExistsError,
  SessionNotFoundError,
  SessionNotActiveError,
  InsufficientBudgetError,
} from "./errors.js";

export interface RegisterSessionParams {
  sessionId: Hex;
  buyer: Address;
  seller: Address;
  pricePerRequest: bigint;
  effectivePrice: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number;
  ensName?: string;
}

export class SessionManager {
  private sessions = new Map<Hex, ActiveSession>();

  registerSession(params: RegisterSessionParams): ActiveSession {
    if (this.sessions.has(params.sessionId)) {
      throw new SessionAlreadyExistsError(params.sessionId);
    }

    const session: ActiveSession = {
      sessionId: params.sessionId,
      buyer: params.buyer,
      seller: params.seller,
      pricePerRequest: params.pricePerRequest,
      effectivePrice: params.effectivePrice,
      deposit: params.deposit,
      verified: params.verified,
      startTime: params.startTime,
      status: "ACTIVE",
      requestCount: 0,
      totalConsumed: 0n,
      completedCategories: [],
      ensName: params.ensName,
    };

    this.sessions.set(params.sessionId, session);
    return session;
  }

  getSession(sessionId: Hex): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  recordPayment(sessionId: Hex, amount: bigint, category: string): ActiveSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.status !== "ACTIVE") {
      throw new SessionNotActiveError(sessionId, session.status);
    }
    if (session.totalConsumed + amount > session.deposit) {
      throw new InsufficientBudgetError(session.deposit - session.totalConsumed, amount);
    }

    session.requestCount += 1;
    session.totalConsumed += amount;
    session.completedCategories.push(category);
    return session;
  }

  updateStatus(sessionId: Hex, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    session.status = status;
  }

  getActiveSessionIds(): Hex[] {
    const ids: Hex[] = [];
    for (const [id, session] of this.sessions) {
      if (session.status === "ACTIVE") {
        ids.push(id);
      }
    }
    return ids;
  }
}
