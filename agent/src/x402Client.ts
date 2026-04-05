import { PRIVATE_KEY, PAYMENT_MODE } from "./config.js";

type PaymentFetch = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let mode: "x402-sdk" | "fallback" = "fallback";

export function getPaymentMode(): "x402-sdk" | "fallback" {
  return mode;
}

async function ensureGatewayDeposit(): Promise<void> {
  if (!PRIVATE_KEY) return;

  try {
    const { GatewayClient } = await import("@circle-fin/x402-batching/client");
    const gateway = new GatewayClient({
      chain: "arcTestnet",
      privateKey: PRIVATE_KEY,
    });

    const balances = await gateway.getBalances();
    const available = balances.gateway.available;
    console.log(`[gateway] Balance: ${available} (atomic USDC)`);

    if (available < 1_000_000n) {
      console.log("[gateway] Insufficient balance, depositing 1 USDC...");
      const result = await gateway.deposit("1");
      console.log(
        `[gateway] Deposited ${result.formattedAmount} USDC | tx: ${result.depositTxHash}`,
      );
    } else {
      console.log("[gateway] Balance sufficient, skipping deposit");
    }
  } catch (err) {
    console.warn(
      "[gateway] Deposit check failed (payments may fail):",
      err instanceof Error ? err.message : err,
    );
  }
}

async function initRealX402(): Promise<PaymentFetch | null> {
  if (!PRIVATE_KEY) {
    console.warn("[x402] No PRIVATE_KEY set — cannot initialize x402 SDK");
    return null;
  }

  try {
    // Ensure Gateway has funds before initializing SDK
    await ensureGatewayDeposit();

    const { privateKeyToAccount } = await import("viem/accounts");
    const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
    const { registerExactEvmScheme } = await import("@x402/evm/exact/client");

    const signer = privateKeyToAccount(PRIVATE_KEY);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer });

    // Register batch scheme for Circle Nanopayments
    try {
      const { registerBatchScheme } = await import(
        "@circle-fin/x402-batching/client"
      );
      const { ExactEvmScheme } = await import("@x402/evm/exact/client");

      registerBatchScheme(client, {
        signer,
        fallbackScheme: new ExactEvmScheme(signer),
      });
      console.log(
        "[x402] Registered batch + exact EVM schemes (Nanopayments enabled)",
      );
    } catch {
      console.log("[x402] Batch scheme not available — using exact EVM only");
    }

    const wrappedFetch = wrapFetchWithPayment(fetch, client);
    console.log("[x402] Real x402 SDK initialized successfully");
    return wrappedFetch as PaymentFetch;
  } catch (err) {
    console.warn(
      "[x402] SDK initialization failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function createFallbackFetch(): PaymentFetch {
  console.warn(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.warn(
    "║  !!  x402 FALLBACK MODE — payments are NOT real            ║",
  );
  console.warn(
    "║  The x402 SDK failed to initialize. Using manual            ║",
  );
  console.warn(
    "║  PAYMENT-SIGNATURE headers. This is for demo/testing only.  ║",
  );
  console.warn(
    "╚══════════════════════════════════════════════════════════════╝",
  );

  return async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("PAYMENT-SIGNATURE", `fallback-${Date.now()}`);

    return fetch(url, {
      ...init,
      headers,
    });
  };
}

export async function createPaymentFetch(): Promise<PaymentFetch> {
  if (PAYMENT_MODE === "fallback") {
    console.log("[x402] PAYMENT_MODE=fallback — skipping real SDK");
    mode = "fallback";
    return createFallbackFetch();
  }

  const realFetch = await initRealX402();
  if (realFetch) {
    mode = "x402-sdk";
    return realFetch;
  }

  mode = "fallback";
  return createFallbackFetch();
}
