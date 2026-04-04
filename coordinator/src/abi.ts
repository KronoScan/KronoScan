export const streamVaultAbi = [
  // ─── Read functions ───
  {
    type: "function",
    name: "isSolvent",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "requestsRemaining",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "sessions",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "pricePerRequest", type: "uint256" },
      { name: "effectivePrice", type: "uint256" },
      { name: "depositedAmount", type: "uint256" },
      { name: "consumedAmount", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "closedTime", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "buyerVerified", type: "bool" },
    ],
    stateMutability: "view",
  },
  // ─── Write functions ───
  {
    type: "function",
    name: "reportConsumption",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeSession",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ─── Events ───
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
  {
    type: "event",
    name: "ConsumptionReported",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newTotal", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SessionClosed",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "consumed", type: "uint256", indexed: false },
      { name: "refunded", type: "uint256", indexed: false },
    ],
  },
] as const;
