import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "../src/sessionManager.js";
import { SessionAlreadyExistsError, SessionNotFoundError, SessionNotActiveError, InsufficientBudgetError } from "../src/errors.js";
import type { Hex, Address } from "viem";

const BUYER = "0x1111111111111111111111111111111111111111" as Address;
const SELLER = "0x2222222222222222222222222222222222222222" as Address;
const SESSION_ID = "0xabc123" as Hex;

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe("registerSession", () => {
    it("adds a session with ACTIVE status", () => {
      manager.registerSession({
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      const session = manager.getSession(SESSION_ID);
      expect(session).toBeDefined();
      expect(session!.status).toBe("ACTIVE");
      expect(session!.requestCount).toBe(0);
      expect(session!.totalConsumed).toBe(0n);
      expect(session!.completedCategories).toEqual([]);
    });

    it("rejects duplicate sessionId", () => {
      const params = {
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      };
      manager.registerSession(params);
      expect(() => manager.registerSession(params)).toThrow(SessionAlreadyExistsError);
    });
  });

  describe("recordPayment", () => {
    it("increments requestCount, totalConsumed, and tracks category", () => {
      manager.registerSession({
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      manager.recordPayment(SESSION_ID, 80n, "reentrancy");
      const session = manager.getSession(SESSION_ID)!;
      expect(session.requestCount).toBe(1);
      expect(session.totalConsumed).toBe(80n);
      expect(session.completedCategories).toEqual(["reentrancy"]);

      manager.recordPayment(SESSION_ID, 80n, "access-control");
      expect(manager.getSession(SESSION_ID)!.requestCount).toBe(2);
      expect(manager.getSession(SESSION_ID)!.totalConsumed).toBe(160n);
      expect(manager.getSession(SESSION_ID)!.completedCategories).toEqual(["reentrancy", "access-control"]);
    });

    it("throws for unknown sessionId", () => {
      expect(() => manager.recordPayment("0xdead" as Hex, 100n, "reentrancy")).toThrow(
        SessionNotFoundError
      );
    });

    it("throws for non-ACTIVE session", () => {
      manager.registerSession({
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });
      manager.updateStatus(SESSION_ID, "CLOSED");

      expect(() => manager.recordPayment(SESSION_ID, 80n, "reentrancy")).toThrow(
        SessionNotActiveError
      );
    });

    it("throws when payment exceeds remaining budget", () => {
      manager.registerSession({
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 100n, // tiny deposit
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      manager.recordPayment(SESSION_ID, 80n, "reentrancy");

      expect(() => manager.recordPayment(SESSION_ID, 80n, "access-control")).toThrow(
        InsufficientBudgetError
      );
    });
  });

  describe("updateStatus", () => {
    it("updates session status", () => {
      manager.registerSession({
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });

      manager.updateStatus(SESSION_ID, "CLOSING");
      expect(manager.getSession(SESSION_ID)!.status).toBe("CLOSING");
    });
  });

  describe("getActiveSessionIds", () => {
    it("returns only ACTIVE sessions", () => {
      manager.registerSession({
        sessionId: SESSION_ID,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 80n,
        deposit: 1_000_000n,
        verified: true,
        startTime: Math.floor(Date.now() / 1000),
      });
      manager.registerSession({
        sessionId: "0xdef456" as Hex,
        buyer: BUYER,
        seller: SELLER,
        pricePerRequest: 100n,
        effectivePrice: 100n,
        deposit: 1_000_000n,
        verified: false,
        startTime: Math.floor(Date.now() / 1000),
      });
      manager.updateStatus("0xdef456" as Hex, "CLOSED");

      const active = manager.getActiveSessionIds();
      expect(active).toHaveLength(1);
      expect(active[0]).toBe(SESSION_ID);
    });
  });
});
