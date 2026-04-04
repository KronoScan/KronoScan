import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { streamVaultAbi } from "./abi.js";

// Arc testnet chain definition
export const arcTestnet: Chain = {
  id: 16180,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [process.env.ARC_TESTNET_RPC ?? "http://127.0.0.1:8545"] },
  },
};

export interface VaultClientConfig {
  rpcUrl: string;
  vaultAddress: Address;
  coordinatorPrivateKey: Hex;
}

export class VaultClient {
  public readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly vaultAddress: Address;

  constructor(config: VaultClientConfig) {
    this.vaultAddress = config.vaultAddress;

    const chain: Chain = {
      ...arcTestnet,
      rpcUrls: { default: { http: [config.rpcUrl] } },
    };

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    const account = privateKeyToAccount(config.coordinatorPrivateKey);
    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    });
  }

  async isSolvent(streamId: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "isSolvent",
      args: [streamId],
    });
  }

  async timeRemaining(streamId: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "timeRemaining",
      args: [streamId],
    });
  }

  async getStream(streamId: Hex) {
    const [
      buyer,
      seller,
      baseRatePerSecond,
      effectiveRate,
      depositedAmount,
      startTime,
      closedTime,
      status,
      buyerVerified,
    ] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "streams",
      args: [streamId],
    });

    return {
      buyer,
      seller,
      baseRatePerSecond,
      effectiveRate,
      depositedAmount,
      startTime,
      closedTime,
      status,
      buyerVerified,
    };
  }

  async closeStream(streamId: Hex, actualConsumed: bigint): Promise<Hex> {
    return this.walletClient.writeContract({
      chain: this.walletClient.chain,
      account: this.walletClient.account!,
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "closeStream",
      args: [streamId, actualConsumed],
    });
  }
}
