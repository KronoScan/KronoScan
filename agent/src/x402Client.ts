import { PRIVATE_KEY } from "./config.js";

type PaymentFetch = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let mode: "x402-sdk" | "fallback" = "fallback";

export function getPaymentMode(): "x402-sdk" | "fallback" {
  return mode;
}

async function initRealX402(): Promise<PaymentFetch | null> {
  if (!PRIVATE_KEY) {
    console.warn("[x402] No PRIVATE_KEY set — cannot initialize x402 SDK");
    return null;
  }

  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
    const { registerExactEvmScheme } = await import("@x402/evm/exact/client");

    const signer = privateKeyToAccount(PRIVATE_KEY);
    const client = new x402Client();
    registerExactEvmScheme(client, { signer });

    // Try to also register batch scheme for Circle Nanopayments
    try {
      const { registerBatchScheme } = await import(
        "@circle-fin/x402-batching/client"
      );
      const { ExactEvmScheme } = await import("@x402/evm/exact/client");

      // registerBatchScheme with fallbackScheme creates a CompositeEvmScheme
      // internally, dispatching to BatchEvmScheme for Gateway payments and
      // ExactEvmScheme for standard on-chain payments.
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
  const realFetch = await initRealX402();
  if (realFetch) {
    mode = "x402-sdk";
    return realFetch;
  }

  mode = "fallback";
  return createFallbackFetch();
}
