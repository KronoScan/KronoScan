import type { AuditFinding, AuditCategory } from "./types.js";

/// Pre-written findings matched to the sample vulnerable contract.
/// Each finding references a real vulnerability at a specific line.
export const ALL_FINDINGS: AuditFinding[] = [
  // ─── Reentrancy ───
  {
    severity: "CRITICAL",
    title: "Reentrancy in withdraw()",
    line: 41,
    description:
      "State variables `balances` and `totalDeposits` are updated after external calls to `token.transfer()`. An attacker can re-enter `withdraw()` before balance is decremented, draining the vault.",
    category: "reentrancy",
  },

  // ─── Access Control ───
  {
    severity: "CRITICAL",
    title: "Missing access control on setFeePercent()",
    line: 23,
    description:
      "The `setFeePercent()` function has no access modifier. Any address can set arbitrary fee percentages, including 100%, stealing all withdrawals.",
    category: "access-control",
  },
  {
    severity: "HIGH",
    title: "tx.origin used for authorization",
    line: 72,
    description:
      "Using `tx.origin` instead of `msg.sender` enables phishing attacks. If the owner calls a malicious contract, the attacker can call `authorizeUser()` through the owner's transaction.",
    category: "access-control",
  },

  // ─── Arithmetic ───
  {
    severity: "MEDIUM",
    title: "Division before multiplication in calculateReward()",
    line: 52,
    description:
      "Expression `amount / 1000 * rate` loses precision due to integer division truncation. Should be `amount * rate / 1000` to preserve precision.",
    category: "arithmetic",
  },

  // ─── External Calls ───
  {
    severity: "HIGH",
    title: "Unchecked return value on ERC20 transfer",
    line: 57,
    description:
      "The `emergencyTransfer()` function calls `token.transfer()` without checking the return value. Some ERC20 tokens return `false` on failure instead of reverting. Use `SafeERC20.safeTransfer()`.",
    category: "external-calls",
  },
  {
    severity: "MEDIUM",
    title: "Unchecked transferFrom in deposit()",
    line: 36,
    description:
      "The `deposit()` function calls `token.transferFrom()` without checking the return value. Non-reverting tokens could credit the user without actually receiving tokens.",
    category: "external-calls",
  },

  // ─── Token Standards ───
  {
    severity: "LOW",
    title: "No ERC20 approval validation in deposit",
    line: 34,
    description:
      "The contract does not verify that sufficient allowance exists before calling `transferFrom()`. While this will revert for standard ERC20 tokens, a descriptive error or pre-check improves UX.",
    category: "token-standards",
  },

  // ─── Business Logic ───
  {
    severity: "CRITICAL",
    title: "Fee percentage can be set to 100% or higher",
    line: 23,
    description:
      "Combined with the missing access control, `feePercent` can be set to any value. At 100%, the owner receives the entire withdrawal amount. At >100%, the subtraction underflows (pre-0.8.0) or reverts, locking all funds.",
    category: "business-logic",
  },

  // ─── Gas Optimization ───
  {
    severity: "LOW",
    title: "Unbounded loop in batchTransfer()",
    line: 78,
    description:
      "The `batchTransfer()` function iterates over an unbounded `recipients` array. A sufficiently large array will exceed the block gas limit, making the function permanently unusable.",
    category: "gas-optimization",
  },

  // ─── Code Quality ───
  {
    severity: "LOW",
    title: "Missing event for critical state changes",
    line: 63,
    description:
      "The `pause()` and `unpause()` functions modify the critical `paused` state variable but emit no events. Off-chain monitoring cannot detect pause/unpause actions.",
    category: "code-quality",
  },
  {
    severity: "LOW",
    title: "Magic number in isWhale()",
    line: 85,
    description:
      "The threshold `1000000000000000000000` (1000 tokens with 18 decimals) is a magic number. Extract to a named constant for readability and maintainability.",
    category: "code-quality",
  },

  // ─── Compiler ───
  {
    severity: "LOW",
    title: "Using require strings instead of custom errors",
    line: 90,
    description:
      "Solidity ^0.8.20 supports custom errors which are more gas-efficient than `require()` with string messages. Each string costs extra deployment and runtime gas.",
    category: "compiler",
  },

  // ─── DeFi-Specific ───
  {
    severity: "MEDIUM",
    title: "No slippage protection on withdrawals",
    line: 41,
    description:
      "The `withdraw()` function applies a fee percentage that can change between transaction submission and execution. Users have no way to specify a minimum payout, enabling sandwich attacks on fee changes.",
    category: "defi",
  },
  {
    severity: "MEDIUM",
    title: "Missing zero-address check in setOwner()",
    line: 28,
    description:
      "The `setOwner()` function does not validate that `_newOwner` is not `address(0)`. Setting owner to zero address permanently locks all owner-gated functions including `emergencyTransfer()` and `pause()`.",
    category: "defi",
  },
];

/// Returns findings for a specific audit category.
export function getFindingsForCategory(category: AuditCategory): AuditFinding[] {
  return ALL_FINDINGS.filter((f) => f.category === category);
}
