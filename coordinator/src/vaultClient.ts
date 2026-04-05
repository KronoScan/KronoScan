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
  private txQueue: Promise<void> = Promise.resolve();

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

  async isSolvent(sessionId: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "isSolvent",
      args: [sessionId],
    });
  }

  async requestsRemaining(sessionId: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "requestsRemaining",
      args: [sessionId],
    });
  }

  async getSession(sessionId: Hex) {
    const [
      buyer,
      seller,
      pricePerRequest,
      effectivePrice,
      depositedAmount,
      consumedAmount,
      startTime,
      closedTime,
      status,
      buyerVerified,
    ] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: streamVaultAbi,
      functionName: "sessions",
      args: [sessionId],
    });

    return {
      buyer,
      seller,
      pricePerRequest,
      effectivePrice,
      depositedAmount,
      consumedAmount,
      startTime,
      closedTime,
      status,
      buyerVerified,
    };
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.txQueue.then(fn);
    this.txQueue = result.then(() => {}, () => {});
    return result;
  }

  async reportConsumption(sessionId: Hex, amount: bigint): Promise<Hex> {
    return this.enqueue(async () => {
      const hash = await this.walletClient.writeContract({
        chain: this.walletClient.chain,
        account: this.walletClient.account!,
        address: this.vaultAddress,
        abi: streamVaultAbi,
        functionName: "reportConsumption",
        args: [sessionId, amount],
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async closeSession(sessionId: Hex): Promise<Hex> {
    return this.enqueue(async () => {
      const hash = await this.walletClient.writeContract({
        chain: this.walletClient.chain,
        account: this.walletClient.account!,
        address: this.vaultAddress,
        abi: streamVaultAbi,
        functionName: "closeSession",
        args: [sessionId],
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
      return hash;
    });
  }
}
