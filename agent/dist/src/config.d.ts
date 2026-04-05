import "./env.js";
import type { Address, Hex } from "viem";
export declare const COORDINATOR_URL: string;
export declare const COORDINATOR_WS_URL: string;
export declare const SELLER_API_URL: string;
export declare const PRIVATE_KEY: Hex | undefined;
export declare const SELLER_ADDRESS: Address;
export declare const DEPOSIT_AMOUNT: string;
export declare const PRICE_PER_REQUEST: string;
export declare const WORLD_ID_VERIFIED: boolean;
export declare const PAYMENT_MODE: string;
export declare const ARC_TESTNET_RPC: string;
export declare const VAULT_ADDRESS: Address;
export declare const USDC_ADDRESS: Address;
export declare const AUDIT_CATEGORIES: readonly ["reentrancy", "access-control", "arithmetic", "external-calls", "token-standards", "business-logic", "gas-optimization", "code-quality", "compiler", "defi"];
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export declare const CATEGORY_PRICES: Record<AuditCategory, string>;
export declare const ENS_SERVICE_NAME: string;
export declare const SEPOLIA_RPC: string;
export interface ResolvedConfig {
    sellerAddress: Address;
    sellerApiUrl: string;
    pricePerRequest: string;
    depositAmount: string;
    ensName: string;
    ensResolved: boolean;
    ensip25: boolean;
}
export declare function resolveServiceConfig(): Promise<ResolvedConfig>;
