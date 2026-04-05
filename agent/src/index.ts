import {
  DEPOSIT_AMOUNT,
  WORLD_ID_VERIFIED,
  COORDINATOR_WS_URL,
  PRIVATE_KEY,
  resolveServiceConfig,
} from "./config.js";
import { createPaymentFetch, getPaymentMode } from "./x402Client.js";
import { openOnChainSession } from "./vaultClient.js";
import { CoordinatorClient } from "./coordinatorClient.js";
import { runAudit } from "./auditRunner.js";

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║        KronoScan — Buyer Agent           ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Step 1: Resolve service config via ENS
  console.log("-- Resolving service config --");
  const svc = await resolveServiceConfig();

  console.log(`\nCoordinator:  ${COORDINATOR_WS_URL}`);
  console.log(`Seller API:   ${svc.sellerApiUrl}`);
  console.log(`Seller addr:  ${svc.sellerAddress}`);
  console.log(`ENS name:     ${svc.ensName || "(none)"}`);
  console.log(`ENS resolved: ${svc.ensResolved}`);
  console.log(`Deposit:      ${svc.depositAmount}`);
  console.log(`Price/req:    ${svc.pricePerRequest}`);
  console.log(`Verified:     ${WORLD_ID_VERIFIED}`);
  console.log(`Private key:  ${PRIVATE_KEY ? "set" : "not set"}`);

  // Step 2: Initialize x402 payment client
  console.log("\n-- Initializing x402 payment client --");
  const paymentFetch = await createPaymentFetch();
  console.log(`Payment mode: ${getPaymentMode()}\n`);

  // Step 3: Connect to coordinator
  console.log("-- Connecting to coordinator --");
  const coordinator = new CoordinatorClient();
  await coordinator.connect();

  // Step 4: Open on-chain session (deposit USDC into StreamVault)
  console.log("\n-- Opening on-chain session --");
  const sessionId = await openOnChainSession(
    svc.sellerAddress,
    BigInt(svc.pricePerRequest),
    BigInt(svc.depositAmount),
    WORLD_ID_VERIFIED,
  );

  // Step 5: Register session with coordinator
  console.log("\n-- Registering session with coordinator --");
  const session = await coordinator.openSession(
    sessionId,
    svc.sellerAddress,
    svc.pricePerRequest,
    svc.depositAmount,
    WORLD_ID_VERIFIED,
    svc.ensName,
  );
  console.log(`Session:      ${session.sessionId}`);
  console.log(`Eff. price:   ${session.effectivePrice}`);
  console.log(`Deposit:      ${session.deposit}`);

  // Step 6: Run audit (use resolved API URL)
  const summary = await runAudit(
    paymentFetch,
    coordinator,
    session.sessionId,
    session.effectivePrice,
    undefined,
    svc.sellerApiUrl,
  );

  // Step 7: Close session
  console.log("\n-- Closing session --");
  const closed = await coordinator.closeSession(session.sessionId);

  // Step 8: Print summary
  const txDisplay =
    closed.txHash.length > 20
      ? `${closed.txHash.slice(0, 18)}...`
      : closed.txHash;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║            AUDIT COMPLETE                ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Service:     ${(svc.ensName || svc.sellerAddress).padEnd(28)}║`);
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
