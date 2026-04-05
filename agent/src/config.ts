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
export const PAYMENT_MODE = process.env.PAYMENT_MODE ?? "auto"; // "auto" | "fallback"
export const ARC_TESTNET_RPC = process.env.ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.network";
export const VAULT_ADDRESS = (process.env.VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const USDC_ADDRESS = (process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as Address;

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

import { resolveService, type ServiceConfig } from "../../shared/ensResolver.js";

export const ENS_SERVICE_NAME = process.env.ENS_SERVICE_NAME ?? "";
export const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

export interface ResolvedConfig {
  sellerAddress: Address;
  sellerApiUrl: string;
  pricePerRequest: string;
  depositAmount: string;
  ensName: string;
  ensResolved: boolean;
  ensip25: boolean;
}

export async function resolveServiceConfig(): Promise<ResolvedConfig> {
  if (!ENS_SERVICE_NAME) {
    console.log("[ens] ENS_SERVICE_NAME not set — using .env values");
    return {
      sellerAddress: SELLER_ADDRESS,
      sellerApiUrl: SELLER_API_URL,
      pricePerRequest: PRICE_PER_REQUEST,
      depositAmount: DEPOSIT_AMOUNT,
      ensName: "",
      ensResolved: false,
      ensip25: false,
    };
  }

  console.log(`[ens] Resolving ${ENS_SERVICE_NAME} on Sepolia...`);
  try {
    const svc = await resolveService(ENS_SERVICE_NAME, SEPOLIA_RPC);
    if (!svc) {
      console.warn(`[ens] Name did not resolve — falling back to .env`);
      return {
        sellerAddress: SELLER_ADDRESS,
        sellerApiUrl: SELLER_API_URL,
        pricePerRequest: PRICE_PER_REQUEST,
        depositAmount: DEPOSIT_AMOUNT,
        ensName: ENS_SERVICE_NAME,
        ensResolved: false,
        ensip25: false,
      };
    }

    console.log(`[ens] Resolved successfully:`);
    console.log(`  Seller:      ${svc.sellerAddress}`);
    console.log(`  API URL:     ${svc.apiUrl || "(not set, using .env)"}`);
    console.log(`  Price:       ${svc.pricePerRequest || "(not set, using .env)"}`);
    console.log(`  Categories:  ${svc.categories.length}`);
    console.log(`  Network:     ${svc.network}`);
    console.log(`  Payment:     ${svc.paymentProtocol}`);
    console.log(`  ENSIP-25:    ${svc.ensip25 ? "verified" : "not set"}`);

    return {
      sellerAddress: (svc.sellerAddress || SELLER_ADDRESS) as Address,
      sellerApiUrl: svc.apiUrl || SELLER_API_URL,
      pricePerRequest: svc.pricePerRequest || PRICE_PER_REQUEST,
      depositAmount: DEPOSIT_AMOUNT,
      ensName: ENS_SERVICE_NAME,
      ensResolved: true,
      ensip25: svc.ensip25,
    };
  } catch (err) {
    console.warn(`[ens] Resolution failed — falling back to .env:`, err instanceof Error ? err.message : err);
    return {
      sellerAddress: SELLER_ADDRESS,
      sellerApiUrl: SELLER_API_URL,
      pricePerRequest: PRICE_PER_REQUEST,
      depositAmount: DEPOSIT_AMOUNT,
      ensName: ENS_SERVICE_NAME,
      ensResolved: false,
      ensip25: false,
    };
  }
}
