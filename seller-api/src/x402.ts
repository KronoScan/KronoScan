import type { Request, Response, NextFunction } from "express";
import type { AuditCategory, X402PricingInfo } from "./types.js";

const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const SELLER_ENS = process.env.SELLER_ENS ?? "audit.kronoscan.eth";
const PRICE_PER_REQUEST = parseInt(process.env.PRICE_PER_REQUEST ?? "100", 10); // USDC micro-units

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

    // In production: validate payment via createGatewayMiddleware()
    // For now: any non-empty payment header is accepted
    next();
  };
}
