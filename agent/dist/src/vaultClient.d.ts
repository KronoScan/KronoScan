import { type Address, type Hex } from "viem";
export declare function openOnChainSession(seller: Address, pricePerRequest: bigint, deposit: bigint, worldIdVerified: boolean): Promise<Hex>;
