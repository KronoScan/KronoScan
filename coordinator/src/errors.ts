import type { Hex } from "viem";
import type { StreamStatus } from "./types.js";

export class StreamNotFoundError extends Error {
  constructor(public readonly streamId: Hex) {
    super(`Stream ${streamId} not found`);
    this.name = "StreamNotFoundError";
  }
}

export class StreamAlreadyExistsError extends Error {
  constructor(public readonly streamId: Hex) {
    super(`Stream ${streamId} already exists`);
    this.name = "StreamAlreadyExistsError";
  }
}

export class StreamNotActiveError extends Error {
  constructor(
    public readonly streamId: Hex,
    public readonly currentStatus: StreamStatus,
  ) {
    super(`Stream ${streamId} not active (${currentStatus})`);
    this.name = "StreamNotActiveError";
  }
}

export class AuthValueMismatchError extends Error {
  constructor(
    public readonly expected: bigint,
    public readonly received: bigint,
  ) {
    super(`Auth value ${received} != effective rate ${expected}`);
    this.name = "AuthValueMismatchError";
  }
}
