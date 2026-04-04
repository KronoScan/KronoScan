import type { ActiveStream, StreamStatus } from "./types.js";
import type { Address, Hex } from "viem";
import {
  StreamAlreadyExistsError,
  StreamNotFoundError,
  StreamNotActiveError,
} from "./errors.js";

export interface RegisterStreamParams {
  streamId: Hex;
  buyer: Address;
  seller: Address;
  baseRate: bigint;
  effectiveRate: bigint;
  deposit: bigint;
  verified: boolean;
  startTime: number;
}

export class StreamManager {
  private streams = new Map<Hex, ActiveStream>();

  registerStream(params: RegisterStreamParams): ActiveStream {
    if (this.streams.has(params.streamId)) {
      throw new StreamAlreadyExistsError(params.streamId);
    }

    const stream: ActiveStream = {
      streamId: params.streamId,
      buyer: params.buyer,
      seller: params.seller,
      baseRate: params.baseRate,
      effectiveRate: params.effectiveRate,
      deposit: params.deposit,
      verified: params.verified,
      startTime: params.startTime,
      status: "ACTIVE",
      authCount: 0,
      totalConsumed: 0n,
    };

    this.streams.set(params.streamId, stream);
    return stream;
  }

  getStream(streamId: Hex): ActiveStream | undefined {
    return this.streams.get(streamId);
  }

  recordAuthorization(streamId: Hex, amount: bigint): ActiveStream {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new StreamNotFoundError(streamId);
    }
    if (stream.status !== "ACTIVE") {
      throw new StreamNotActiveError(streamId, stream.status);
    }

    stream.authCount += 1;
    stream.totalConsumed += amount;
    return stream;
  }

  updateStatus(streamId: Hex, status: StreamStatus): void {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new StreamNotFoundError(streamId);
    }
    stream.status = status;
  }

  getActiveStreamIds(): Hex[] {
    const ids: Hex[] = [];
    for (const [id, stream] of this.streams) {
      if (stream.status === "ACTIVE") {
        ids.push(id);
      }
    }
    return ids;
  }
}
