export const streamVaultAbi = [
  // ─── Read functions ───
  {
    type: "function",
    name: "isSolvent",
    inputs: [{ name: "streamId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "timeRemaining",
    inputs: [{ name: "streamId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "streams",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "baseRatePerSecond", type: "uint256" },
      { name: "effectiveRate", type: "uint256" },
      { name: "depositedAmount", type: "uint256" },
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
    name: "closeStream",
    inputs: [
      { name: "streamId", type: "bytes32" },
      { name: "actualConsumed", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ─── Events (for log watching) ───
  {
    type: "event",
    name: "StreamOpened",
    inputs: [
      { name: "streamId", type: "bytes32", indexed: true },
      { name: "buyer", type: "address", indexed: false },
      { name: "seller", type: "address", indexed: false },
      { name: "baseRate", type: "uint256", indexed: false },
      { name: "effectiveRate", type: "uint256", indexed: false },
      { name: "deposit", type: "uint256", indexed: false },
      { name: "verified", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamClosed",
    inputs: [
      { name: "streamId", type: "bytes32", indexed: true },
      { name: "consumed", type: "uint256", indexed: false },
      { name: "refunded", type: "uint256", indexed: false },
    ],
  },
] as const;
