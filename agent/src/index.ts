import {
  SELLER_ADDRESS,
  DEPOSIT_AMOUNT,
  PRICE_PER_REQUEST,
  WORLD_ID_VERIFIED,
  SELLER_API_URL,
  COORDINATOR_WS_URL,
  PRIVATE_KEY,
} from "./config.js";
import { createPaymentFetch, getPaymentMode } from "./x402Client.js";
import { CoordinatorClient } from "./coordinatorClient.js";
import { runAudit } from "./auditRunner.js";

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║        KronoScan — Buyer Agent           ║");
  console.log("╚══════════════════════════════════════════╝\n");

  console.log(`Coordinator:  ${COORDINATOR_WS_URL}`);
  console.log(`Seller API:   ${SELLER_API_URL}`);
  console.log(`Seller addr:  ${SELLER_ADDRESS}`);
  console.log(`Deposit:      ${DEPOSIT_AMOUNT}`);
  console.log(`Price/req:    ${PRICE_PER_REQUEST}`);
  console.log(`Verified:     ${WORLD_ID_VERIFIED}`);
  console.log(`Private key:  ${PRIVATE_KEY ? "set" : "not set"}`);

  // Step 1: Initialize x402 payment client
  console.log("\n-- Initializing x402 payment client --");
  const paymentFetch = await createPaymentFetch();
  console.log(`Payment mode: ${getPaymentMode()}\n`);

  // Step 2: Connect to coordinator
  console.log("-- Connecting to coordinator --");
  const coordinator = new CoordinatorClient();
  await coordinator.connect();

  // Step 3: Open session
  console.log("\n-- Opening session --");
  const session = await coordinator.openSession(
    SELLER_ADDRESS,
    PRICE_PER_REQUEST,
    DEPOSIT_AMOUNT,
    WORLD_ID_VERIFIED,
  );
  console.log(`Session:      ${session.sessionId}`);
  console.log(`Eff. price:   ${session.effectivePrice}`);
  console.log(`Deposit:      ${session.deposit}`);

  // Step 4: Run audit
  const summary = await runAudit(
    paymentFetch,
    coordinator,
    session.sessionId,
    session.effectivePrice,
  );

  // Step 5: Close session
  console.log("\n-- Closing session --");
  const closed = await coordinator.closeSession(session.sessionId);

  // Step 6: Print summary
  const txDisplay =
    closed.txHash.length > 20
      ? `${closed.txHash.slice(0, 18)}...`
      : closed.txHash;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║            AUDIT COMPLETE                ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Categories:  10/10                      ║`);
  console.log(`║  Findings:    ${String(summary.totalFindings).padEnd(28)}║`);
  console.log(`║  CRITICAL:    ${String(summary.bySeverity["CRITICAL"] ?? 0).padEnd(28)}║`);
  console.log(`║  HIGH:        ${String(summary.bySeverity["HIGH"] ?? 0).padEnd(28)}║`);
  console.log(`║  MEDIUM:      ${String(summary.bySeverity["MEDIUM"] ?? 0).padEnd(28)}║`);
  console.log(`║  LOW:         ${String(summary.bySeverity["LOW"] ?? 0).padEnd(28)}║`);
  console.log(`║  Total cost:  ${closed.consumed.padEnd(28)}║`);
  console.log(`║  Refunded:    ${closed.refunded.padEnd(28)}║`);
  console.log(`║  Payment:     ${getPaymentMode().padEnd(28)}║`);
  console.log(`║  Tx hash:     ${txDisplay.padEnd(28)}║`);
  console.log("╚══════════════════════════════════════════╝\n");

  if (getPaymentMode() === "fallback") {
    console.warn(
      "WARNING: Payments were simulated (fallback mode). No real USDC was spent.",
    );
  }

  coordinator.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("\nAgent failed:", err);
  process.exit(1);
});
