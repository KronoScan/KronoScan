import { describe, it, expect, beforeEach } from "vitest";
import { StreamManager } from "../src/streamManager.js";
import { StreamAlreadyExistsError, StreamNotFoundError, StreamNotActiveError } from "../src/errors.js";
import type { Hex, Address } from "viem";

const BUYER = "0x1111111111111111111111111111111111111111" as Address;
const SELLER = "0x2222222222222222222222222222222222222222" as Address;
const STREAM_ID = "0xabc123" as Hex;

describe("StreamManager", () => {
  let manager: StreamManager;

  beforeEach(() => {
    manager = new StreamManager();
  });

  describe("registerStream", () => {
    it("adds a stream with ACTIVE status", () => {
      manager.registerStream({
        streamId: STREAM_ID,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      const stream = manager.getStream(STREAM_ID);
      expect(stream).toBeDefined();
      expect(stream!.status).toBe("ACTIVE");
      expect(stream!.authCount).toBe(0);
      expect(stream!.totalConsumed).toBe(0n);
    });

    it("rejects duplicate streamId", () => {
      const params = {
        streamId: STREAM_ID,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      };
      manager.registerStream(params);
      expect(() => manager.registerStream(params)).toThrow(StreamAlreadyExistsError);
    });
  });

  describe("recordAuthorization", () => {
    it("increments authCount and totalConsumed", () => {
      manager.registerStream({
        streamId: STREAM_ID,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      manager.recordAuthorization(STREAM_ID, 80n);
      const stream = manager.getStream(STREAM_ID)!;
      expect(stream.authCount).toBe(1);
      expect(stream.totalConsumed).toBe(80n);

      manager.recordAuthorization(STREAM_ID, 80n);
      expect(manager.getStream(STREAM_ID)!.authCount).toBe(2);
      expect(manager.getStream(STREAM_ID)!.totalConsumed).toBe(160n);
    });

    it("throws for unknown streamId", () => {
      expect(() => manager.recordAuthorization("0xdead" as Hex, 100n)).toThrow(
        StreamNotFoundError
      );
    });

    it("throws for non-ACTIVE stream", () => {
      manager.registerStream({
        streamId: STREAM_ID,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });
      manager.updateStatus(STREAM_ID, "CLOSED");

      expect(() => manager.recordAuthorization(STREAM_ID, 80n)).toThrow(
        StreamNotActiveError
      );
    });
  });

  describe("updateStatus", () => {
    it("updates stream status", () => {
      manager.registerStream({
        streamId: STREAM_ID,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      manager.updateStatus(STREAM_ID, "CLOSING");
      expect(manager.getStream(STREAM_ID)!.status).toBe("CLOSING");
    });
  });

  describe("getActiveStreamIds", () => {
    it("returns only ACTIVE streams", () => {
      manager.registerStream({
        streamId: STREAM_ID,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });
      manager.registerStream({
        streamId: "0xdef456" as Hex,
        buyer: BUYER,
        seller: SELLER,
        baseRate: 100n,
        effectiveRate: 100n,
        deposit: 1_000_000n,
        verified: false,
        startTime: Math.floor(Date.now() / 1000),
      });
      manager.updateStatus("0xdef456" as Hex, "CLOSED");

      const active = manager.getActiveStreamIds();
      expect(active).toHaveLength(1);
      expect(active[0]).toBe(STREAM_ID);
    });
  });
});
