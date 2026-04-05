import type { RequestHandler } from "express";
import { AUDIT_CATEGORIES, CATEGORY_PRICES } from "./types.js";

const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000";
// Price in USD — x402 SDK converts to atomic USDC (6 decimals) internally
// 100 atomic = 0.0001 USDC = $0.0001
const PRICE_USD = process.env.PRICE_USD ?? "$0.0001";
const X402_MODE = process.env.X402_MODE ?? "real";

let serverMode: "x402-real" | "stub" = "stub";
let realMiddleware: RequestHandler | null = null;

async function initRealX402(): Promise<boolean> {
  if (X402_MODE === "stub") {
    return false;
  }

  try {
    const { paymentMiddlewareFromConfig } = await import("@x402/express");
    const { BatchFacilitatorClient, GatewayEvmScheme } = await import(
      "@circle-fin/x402-batching/server"
    );

    // Build route configs for all 10 audit category endpoints
    const routes: Record<string, any> = {};
    for (const category of AUDIT_CATEGORIES) {
      routes[`POST /api/audit/${category}`] = {
        accepts: {
          scheme: "exact",
          network: "eip155:5042002",
          payTo: SELLER_ADDRESS,
          price: PRICE_USD,
          maxTimeoutSeconds: 300,
          asset: USDC_ADDRESS,
        },
      };
    }

    realMiddleware = paymentMiddlewareFromConfig(
      routes,
      [new BatchFacilitatorClient() as any],
      [{ network: "eip155:*", server: new GatewayEvmScheme() as any }],
    ) as RequestHandler;

    console.log("[x402] ✓ Real x402 middleware initialized for all audit routes");
    serverMode = "x402-real";
    return true;
  } catch (err) {
    console.warn(
      "[x402] Real middleware init failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

const initPromise = initRealX402().then((ok) => {
  if (!ok) {
    console.warn(
      "╔══════════════════════════════════════════════════════════════╗",
    );
    console.warn(
      "║  ⚠  SELLER x402 STUB MODE — payment validation disabled    ║",
    );
    console.warn(
      "║  Any non-empty PAYMENT-SIGNATURE header is accepted.        ║",
    );
    console.warn(
      "║  Set X402_MODE=real and install @x402/express for real mode. ║",
    );
    console.warn(
      "╚══════════════════════════════════════════════════════════════╝",
    );
  }
});

export function getX402ServerMode(): "x402-real" | "stub" {
  return serverMode;
}

export function x402Middleware(): RequestHandler {
  return (req, res, next) => {
    if (realMiddleware) {
      return realMiddleware(req, res, next);
    }

    // Stub fallback: accept any non-empty payment header
    const paymentHeader =
      req.headers["payment-signature"] ?? req.headers["x-payment"];
    if (!paymentHeader) {
      res.status(402).json({ error: "Payment required (stub mode)" });
      return;
    }
    next();
  };
}

export { initPromise as x402InitPromise };
