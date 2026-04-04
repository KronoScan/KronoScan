import "./env.js";
import type { Address, Hex } from "viem";

export const COORDINATOR_URL = process.env.COORDINATOR_URL ?? "http://localhost:3001";
export const COORDINATOR_WS_URL = process.env.COORDINATOR_WS_URL ?? "ws://localhost:3001/ws";
export const SELLER_API_URL = process.env.SELLER_API_URL ?? "http://localhost:3002";
export const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex | undefined;
export const SELLER_ADDRESS = (process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT ?? "1000000";
export const PRICE_PER_REQUEST = process.env.PRICE_PER_REQUEST ?? "100";
export const WORLD_ID_VERIFIED = process.env.WORLD_ID_VERIFIED === "true";

export const AUDIT_CATEGORIES = [
  "reentrancy",
  "access-control",
  "arithmetic",
  "external-calls",
  "token-standards",
  "business-logic",
  "gas-optimization",
  "code-quality",
  "compiler",
  "defi",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
