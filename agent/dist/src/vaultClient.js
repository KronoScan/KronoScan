import { createPublicClient, createWalletClient, http, parseEventLogs, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PRIVATE_KEY, ARC_TESTNET_RPC, VAULT_ADDRESS, USDC_ADDRESS } from "./config.js";
const arcTestnet = {
    id: 16180,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: {
        default: { http: [ARC_TESTNET_RPC] },
    },
};
const erc20ApproveAbi = [
    {
        type: "function",
        name: "approve",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
    },
];
const openSessionAbi = [
    {
        type: "function",
        name: "openSession",
        inputs: [
            { name: "seller", type: "address" },
            { name: "pricePerRequest", type: "uint256" },
            { name: "deposit", type: "uint256" },
            { name: "worldIdVerified", type: "bool" },
        ],
        outputs: [{ name: "sessionId", type: "bytes32" }],
        stateMutability: "nonpayable",
    },
    {
        type: "event",
        name: "SessionOpened",
        inputs: [
            { name: "sessionId", type: "bytes32", indexed: true },
            { name: "buyer", type: "address", indexed: false },
            { name: "seller", type: "address", indexed: false },
            { name: "pricePerRequest", type: "uint256", indexed: false },
            { name: "effectivePrice", type: "uint256", indexed: false },
            { name: "deposit", type: "uint256", indexed: false },
            { name: "verified", type: "bool", indexed: false },
        ],
    },
];
export async function openOnChainSession(seller, pricePerRequest, deposit, worldIdVerified) {
    if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not set — cannot open on-chain session");
    }
    const account = privateKeyToAccount(PRIVATE_KEY);
    const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http(ARC_TESTNET_RPC),
    });
    const walletClient = createWalletClient({
        account,
        chain: arcTestnet,
        transport: http(ARC_TESTNET_RPC),
    });
    // Step 1: Approve USDC spending
    console.log(`[vault] Approving ${deposit} USDC for StreamVault...`);
    const approveTx = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [VAULT_ADDRESS, deposit],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log(`[vault] Approve tx: ${approveTx}`);
    // Step 2: Open session on StreamVault
    console.log(`[vault] Opening session on StreamVault...`);
    const openTx = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: openSessionAbi,
        functionName: "openSession",
        args: [seller, pricePerRequest, deposit, worldIdVerified],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: openTx });
    console.log(`[vault] openSession tx: ${openTx}`);
    // Step 3: Parse SessionOpened event to get bytes32 session ID
    const logs = parseEventLogs({
        abi: openSessionAbi,
        logs: receipt.logs,
        eventName: "SessionOpened",
    });
    if (logs.length === 0) {
        throw new Error("SessionOpened event not found in transaction receipt");
    }
    const sessionId = logs[0].args.sessionId;
    console.log(`[vault] On-chain session ID: ${sessionId}`);
    return sessionId;
}
