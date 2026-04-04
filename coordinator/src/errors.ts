import type { Hex } from "viem";
import type { SessionStatus } from "./types.js";

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: Hex) {
    super(`Session ${sessionId} not found`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionAlreadyExistsError extends Error {
  constructor(public readonly sessionId: Hex) {
    super(`Session ${sessionId} already exists`);
    this.name = "SessionAlreadyExistsError";
  }
}

export class SessionNotActiveError extends Error {
  constructor(public readonly sessionId: Hex, public readonly status: SessionStatus) {
    super(`Session ${sessionId} is not active (status: ${status})`);
    this.name = "SessionNotActiveError";
  }
}

export class InsufficientBudgetError extends Error {
  constructor(public readonly remaining: bigint, public readonly requested: bigint) {
    super(`Insufficient budget: ${remaining} remaining, ${requested} requested`);
    this.name = "InsufficientBudgetError";
  }
}
