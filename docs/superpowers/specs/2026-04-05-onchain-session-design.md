# On-Chain Session IDs — Agent Opens Real StreamVault Sessions

## Goal

Make the agent call `StreamVault.openSession()` on-chain before starting an audit, so the coordinator uses real `bytes32` session IDs for `reportConsumption()` and `closeSession()`. This makes the full escrow flow real: deposit, consumption tracking, and refund all happen on Arc testnet.

## Problem

The coordinator currently generates fake session IDs (`0x${Date.now()}...`, ~10 bytes). When it tries to call StreamVault on-chain with these IDs, viem throws `AbiEncodingBytesSizeMismatchError` because the contract expects `bytes32`. No on-chain calls succeed — the session only exists in-memory.

## Design

### Data Flow

```
Agent                              Contract                    Coordinator
  |                                    |                            |
  |-- approve(vault, deposit) -------->|                            |
  |-- openSession(seller,price,        |                            |
  |    deposit,verified) ------------->|                            |
  |<-- SessionOpened(bytes32 id) ------|                            |
  |                                    |                            |
  |-- WS: open_session {sessionId} -------------------------------->|
  |<-- WS: session_opened -------------------------------------------|
  |                                    |                            |
  |  [per category]                    |                            |
  |-- WS: record_payment ------------------------------------------>|
  |                                    |<-- reportConsumption() ----|
  |                                    |                            |
  |-- WS: close_session ----------------------------------------------->|
  |                                    |<-- closeSession() ---------|
  |                                    |-- refund to buyer -------->|
```

### Agent Changes

**New file: `agent/src/vaultClient.ts`**

A small on-chain client with one method: `openOnChainSession()`. It:

1. Creates a viem wallet client for Arc testnet using `PRIVATE_KEY`
2. Calls `USDC.approve(vaultAddress, deposit)` to allow StreamVault to pull the deposit
3. Calls `StreamVault.openSession(seller, pricePerRequest, deposit, worldIdVerified)`
4. Reads the transaction receipt, finds the `SessionOpened` event, extracts the `bytes32` session ID
5. Returns the session ID as `Hex`

ABI fragments inline in the file:
- `IERC20.approve(address spender, uint256 amount)` 
- `StreamVault.openSession(address seller, uint256 pricePerRequest, uint256 deposit, bool worldIdVerified) returns (bytes32)`
- `SessionOpened` event (for log parsing)

Config needed (all already in `.env`):
- `PRIVATE_KEY` — agent wallet
- `ARC_TESTNET_RPC` — Arc testnet RPC
- `VAULT_ADDRESS` — StreamVault contract address
- `USDC_ADDRESS` — USDC contract address on Arc

**Modified: `agent/src/index.ts`**

Between steps 3 (connect to coordinator) and 4 (open session), add:
```
Step 3.5: Open on-chain session
  const sessionId = await openOnChainSession(seller, price, deposit, verified)
```

Then pass `sessionId` to `coordinator.openSession()`.

**Modified: `agent/src/coordinatorClient.ts`**

`openSession()` method gains a `sessionId: Hex` parameter. The `open_session` WS message includes `sessionId`.

### Coordinator Changes

**Modified: `coordinator/src/types.ts`**

`open_session` in `WsMessageIn` gains a required `sessionId: Hex` field.

**Modified: `coordinator/src/index.ts`**

`handleOpenSession` no longer generates a session ID. Uses `msg.sessionId` directly. Remove the `0x${Date.now()...}` line.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| USDC approve fails | Agent exits with error — can't proceed without deposit |
| openSession tx fails | Agent exits with error — no session to audit |
| SessionOpened event not found in receipt | Agent exits with error — contract bug or wrong ABI |
| On-chain reportConsumption fails | Coordinator logs warning, continues (already the behavior) |
| On-chain closeSession fails | Coordinator logs warning, session closes in-memory (already the behavior) |

### What This Enables

- `reportConsumption()` succeeds on-chain — consumption tracked in the contract
- `closeSession()` succeeds on-chain — USDC refund sent to buyer automatically
- Solvency watchdog reads real on-chain state
- ArcScan shows real session lifecycle transactions
- Demo shows actual USDC movement on Arc testnet

## Files Changed

| File | Action | What changes |
|------|--------|--------------|
| `agent/src/vaultClient.ts` | Create | On-chain session opener (approve + openSession + event parse) |
| `agent/src/index.ts` | Modify | Call `openOnChainSession()` before WS open_session |
| `agent/src/coordinatorClient.ts` | Modify | Pass `sessionId` in `openSession()` |
| `coordinator/src/types.ts` | Modify | Add `sessionId` to `open_session` WsMessageIn |
| `coordinator/src/index.ts` | Modify | Use `msg.sessionId` instead of generating one |
