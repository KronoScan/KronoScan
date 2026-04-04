import type { Request, Response, NextFunction } from "express";
import type { AuditCategory, X402PricingInfo } from "./types.js";

const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const SELLER_ENS = process.env.SELLER_ENS ?? "audit.kronoscan.eth";
const PRICE_PER_REQUEST = parseInt(process.env.PRICE_PER_REQUEST ?? "100", 10);
const X402_MODE = process.env.X402_MODE ?? "real";

let serverMode: "x402-real" | "stub" = "stub";

async function initRealX402Server(): Promise<boolean> {
  if (X402_MODE === "stub") {
    return false;
  }

  try {
    const { x402ResourceServer } = await import("@x402/express");
    const { BatchFacilitatorClient, GatewayEvmScheme } = await import("@circle-fin/x402-batching/server");

    // Cast to any to bridge minor type version mismatches between packages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = new x402ResourceServer([new BatchFacilitatorClient() as any]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).register("eip155:*", new GatewayEvmScheme());
    await server.initialize();

    console.log("[x402] ✓ Real x402 server middleware initialized");
    serverMode = "x402-real";
    return true;
  } catch (err) {
    console.warn("[x402] Real middleware init failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

const initPromise = initRealX402Server().then((ok) => {
  if (!ok) {
    console.warn("╔══════════════════════════════════════════════════════════════╗");
    console.warn("║  ⚠  SELLER x402 STUB MODE — payment validation disabled    ║");
    console.warn("║  Any non-empty PAYMENT-SIGNATURE header is accepted.        ║");
    console.warn("║  Set X402_MODE=real and install @x402/express for real mode. ║");
    console.warn("╚══════════════════════════════════════════════════════════════╝");
  }
});

export function getX402ServerMode(): "x402-real" | "stub" {
  return serverMode;
}

export function x402Middleware(category: AuditCategory) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const paymentHeader = req.headers["payment-signature"] ?? req.headers["x-payment"];

    if (!paymentHeader) {
      const pricing: X402PricingInfo = {
        paymentRequired: true,
        scheme: "exact",
        pricePerRequest: PRICE_PER_REQUEST,
        network: "arc-testnet",
        sellerAddress: SELLER_ADDRESS,
        sellerENS: SELLER_ENS,
        acceptsUnverified: true,
        category,
      };
      res.status(402).json(pricing);
      return;
    }

    // Stub mode: accept any non-empty payment header
    next();
  };
}

export { initPromise as x402InitPromise };
