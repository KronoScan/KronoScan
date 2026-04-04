import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000";

if (!SEPOLIA_PRIVATE_KEY) {
  console.error("SEPOLIA_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

const registryAbi = [
  {
    name: "setSubnodeRecord",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const resolverAbi = [
  {
    name: "setAddr",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "setText",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const TEXT_RECORDS: Record<string, string> = {
  description: "AI-powered smart contract security audit — 10 categories, per-request x402 micropayments",
  url: process.env.SELLER_API_URL ?? "http://localhost:3002",
  "com.kronoscan.categories":
    "reentrancy,access-control,arithmetic,external-calls,token-standards,business-logic,gas-optimization,code-quality,compiler,defi",
  "com.kronoscan.price": process.env.PRICE_PER_REQUEST ?? "100",
  "com.kronoscan.network": "eip155:5042002",
  "com.kronoscan.payment": "x402",
  "com.kronoscan.scan-modes": "standard,deep",
  "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]": "1",
};

async function main() {
  const account = privateKeyToAccount(SEPOLIA_PRIVATE_KEY!);
  console.log(`\n[ens-setup] Wallet: ${account.address}`);
  console.log(`[ens-setup] RPC:    ${SEPOLIA_RPC}\n`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(SEPOLIA_RPC),
  });

  const parentName = "kronoscan.eth";
  const parentNode = namehash(normalize(parentName));
  const subnodeName = "audit.kronoscan.eth";
  const subnodeNode = namehash(normalize(subnodeName));
  const auditLabelHash = keccak256(toBytes("audit"));

  const resolverAddress = await publicClient.getEnsResolver({ name: normalize(parentName) });
  if (!resolverAddress) {
    console.error(`[ens-setup] No resolver found for ${parentName}. Did you register it on Sepolia?`);
    process.exit(1);
  }
  console.log(`[ens-setup] Parent resolver: ${resolverAddress}`);

  console.log(`[ens-setup] Creating subname: ${subnodeName}`);
  try {
    const tx1 = await walletClient.writeContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: "setSubnodeRecord",
      args: [parentNode, auditLabelHash, account.address, resolverAddress, 0n],
    });
    console.log(`[ens-setup] setSubnodeRecord tx: ${tx1}`);
    await publicClient.waitForTransactionReceipt({ hash: tx1 });
  } catch (err) {
    console.warn(`[ens-setup] setSubnodeRecord failed (may already exist):`, err instanceof Error ? err.message : err);
  }

  console.log(`[ens-setup] Setting addr to ${SELLER_ADDRESS}`);
  try {
    const tx2 = await walletClient.writeContract({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: "setAddr",
      args: [subnodeNode, SELLER_ADDRESS as `0x${string}`],
    });
    console.log(`[ens-setup] setAddr tx: ${tx2}`);
    await publicClient.waitForTransactionReceipt({ hash: tx2 });
  } catch (err) {
    console.error(`[ens-setup] setAddr failed:`, err instanceof Error ? err.message : err);
  }

  for (const [key, value] of Object.entries(TEXT_RECORDS)) {
    console.log(`[ens-setup] setText: ${key} = ${value.length > 60 ? value.slice(0, 60) + "..." : value}`);
    try {
      const tx = await walletClient.writeContract({
        address: resolverAddress,
        abi: resolverAbi,
        functionName: "setText",
        args: [subnodeNode, key, value],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`  ✓ tx: ${tx}`);
    } catch (err) {
      console.error(`  ✗ Failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n[ens-setup] Verifying...`);
  const resolvedAddr = await publicClient.getEnsAddress({ name: normalize(subnodeName) });
  console.log(`[ens-setup] ${subnodeName} → ${resolvedAddr ?? "NOT RESOLVED"}`);

  for (const key of Object.keys(TEXT_RECORDS)) {
    const val = await publicClient.getEnsText({ name: normalize(subnodeName), key });
    const display = val && val.length > 50 ? val.slice(0, 50) + "..." : val;
    console.log(`  ${key}: ${display ?? "(empty)"}`);
  }

  console.log("\n[ens-setup] Done!");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
