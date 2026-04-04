import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import type { Hex, Address } from "viem";
import { StreamManager } from "./streamManager.js";
import { VaultClient } from "./vaultClient.js";
import { StreamNotFoundError, StreamNotActiveError, AuthValueMismatchError } from "./errors.js";
import type { WsMessageIn, WsMessageOut } from "./types.js";

// ─── Config ───

const PORT = parseInt(process.env.COORDINATOR_PORT ?? "3001", 10);
const RPC_URL = process.env.ARC_TESTNET_RPC ?? "http://127.0.0.1:8545";
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as Address | undefined;
const COORDINATOR_KEY = process.env.PRIVATE_KEY as Hex | undefined;
const SOLVENCY_CHECK_INTERVAL = 5_000; // 5 seconds

// ─── State ───

const streamManager = new StreamManager();
let vaultClient: VaultClient | null = null;

if (VAULT_ADDRESS && COORDINATOR_KEY) {
  vaultClient = new VaultClient({
    rpcUrl: RPC_URL,
    vaultAddress: VAULT_ADDRESS,
    coordinatorPrivateKey: COORDINATOR_KEY,
  });
  console.log(`[vault] Connected to StreamVault at ${VAULT_ADDRESS}`);
} else {
  console.warn("[vault] VAULT_ADDRESS or PRIVATE_KEY not set — running without on-chain integration");
}

// ─── Express ───

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", streams: streamManager.getActiveStreamIds().length });
});

app.get("/api/stream/:streamId/status", (req, res) => {
  const stream = streamManager.getStream(req.params.streamId as Hex);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  res.json({
    streamId: stream.streamId,
    status: stream.status,
    buyer: stream.buyer,
    seller: stream.seller,
    verified: stream.verified,
    authCount: stream.authCount,
    totalConsumed: stream.totalConsumed.toString(),
  });
});

app.get("/api/streams", (_req, res) => {
  const ids = streamManager.getActiveStreamIds();
  const streams = ids.map((id) => {
    const s = streamManager.getStream(id)!;
    return {
      streamId: s.streamId,
      status: s.status,
      buyer: s.buyer,
      seller: s.seller,
      effectiveRate: s.effectiveRate.toString(),
      deposit: s.deposit.toString(),
      verified: s.verified,
      startTime: s.startTime,
      authCount: s.authCount,
      totalConsumed: s.totalConsumed.toString(),
    };
  });
  res.json({ streams });
});

// ─── HTTP Server ───

const server = createServer(app);

// ─── WebSocket ───

const wss = new WebSocketServer({ server, path: "/ws" });

// Track subscriptions: streamId → set of WebSocket clients
const subscriptions = new Map<Hex, Set<WebSocket>>();

function broadcast(streamId: Hex, message: WsMessageOut) {
  const subs = subscriptions.get(streamId);
  if (!subs) return;
  const data = JSON.stringify(message);
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function sendTo(ws: WebSocket, message: WsMessageOut) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on("connection", (ws) => {
  console.log("[ws] Client connected");

  ws.on("message", async (raw) => {
    let msg: WsMessageIn;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendTo(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    try {
      switch (msg.type) {
        case "open_stream":
          await handleOpenStream(ws, msg);
          break;
        case "auth":
          await handleAuth(ws, msg);
          break;
        case "close_stream":
          await handleCloseStream(ws, msg);
          break;
        case "subscribe":
          handleSubscribe(ws, msg.streamId);
          break;
        default:
          sendTo(ws, { type: "error", message: "Unknown message type" });
      }
    } catch (err) {
      if (err instanceof StreamNotFoundError) {
        sendTo(ws, { type: "error", message: err.message });
      } else if (err instanceof StreamNotActiveError) {
        sendTo(ws, { type: "error", message: err.message });
      } else if (err instanceof AuthValueMismatchError) {
        sendTo(ws, { type: "error", message: err.message });
      } else {
        const message = err instanceof Error ? err.message : "Internal error";
        sendTo(ws, { type: "error", message });
      }
    }
  });

  ws.on("close", () => {
    for (const subs of subscriptions.values()) {
      subs.delete(ws);
    }
    console.log("[ws] Client disconnected");
  });
});

// ─── Message Handlers ───

async function handleOpenStream(
  ws: WebSocket,
  msg: Extract<WsMessageIn, { type: "open_stream" }>
) {
  const streamId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}` as Hex;

  const baseRate = BigInt(msg.baseRate);
  const deposit = BigInt(msg.deposit);
  const effectiveRate = msg.verified
    ? (baseRate * 8000n) / 10000n
    : baseRate;

  const stream = streamManager.registerStream({
    streamId,
    buyer: msg.seller, // placeholder — in production, comes from on-chain event
    seller: msg.seller,
    baseRate,
    effectiveRate,
    deposit,
    verified: msg.verified,
    startTime: Math.floor(Date.now() / 1000),
  });

  handleSubscribe(ws, streamId);

  sendTo(ws, {
    type: "stream_opened",
    streamId,
    effectiveRate: stream.effectiveRate.toString(),
    deposit: stream.deposit.toString(),
    startTime: stream.startTime,
  });

  console.log(`[stream] Opened ${streamId} | rate=${effectiveRate} | deposit=${deposit} | verified=${msg.verified}`);
}

async function handleAuth(
  ws: WebSocket,
  msg: Extract<WsMessageIn, { type: "auth" }>
) {
  const { streamId, authorization } = msg;

  const stream = streamManager.getStream(streamId);
  if (!stream) {
    throw new StreamNotFoundError(streamId);
  }

  const value = BigInt(authorization.value);
  if (value !== stream.effectiveRate) {
    throw new AuthValueMismatchError(stream.effectiveRate, value);
  }

  streamManager.recordAuthorization(streamId, value);

  const remaining = stream.deposit > stream.totalConsumed
    ? Number((stream.deposit - stream.totalConsumed) / stream.effectiveRate)
    : 0;

  broadcast(streamId, {
    type: "stream_update",
    streamId,
    status: stream.status,
    totalConsumed: stream.totalConsumed.toString(),
    timeRemaining: remaining,
    authCount: stream.authCount,
  });
}

async function handleCloseStream(
  ws: WebSocket,
  msg: Extract<WsMessageIn, { type: "close_stream" }>
) {
  const { streamId } = msg;
  const stream = streamManager.getStream(streamId);
  if (!stream) {
    throw new StreamNotFoundError(streamId);
  }

  streamManager.updateStatus(streamId, "CLOSING");

  const consumed = stream.totalConsumed;
  const refund = stream.deposit - consumed;

  let txHash: Hex = "0x0" as Hex;
  if (vaultClient) {
    try {
      txHash = await vaultClient.closeStream(streamId, consumed);
      console.log(`[vault] closeStream tx: ${txHash}`);
    } catch (err) {
      console.error("[vault] closeStream failed:", err);
    }
  }

  streamManager.updateStatus(streamId, "CLOSED");

  broadcast(streamId, {
    type: "stream_closed",
    streamId,
    consumed: consumed.toString(),
    refunded: refund.toString(),
    txHash,
  });

  console.log(`[stream] Closed ${streamId} | consumed=${consumed} | refund=${refund}`);
}

function handleSubscribe(ws: WebSocket, streamId: Hex) {
  if (!subscriptions.has(streamId)) {
    subscriptions.set(streamId, new Set());
  }
  subscriptions.get(streamId)!.add(ws);
}

// ─── Solvency Watchdog ───

async function checkSolvency() {
  if (!vaultClient) return;

  const activeIds = streamManager.getActiveStreamIds();
  for (const streamId of activeIds) {
    try {
      const [solvent, remaining] = await Promise.all([
        vaultClient.isSolvent(streamId),
        vaultClient.timeRemaining(streamId),
      ]);

      const stream = streamManager.getStream(streamId)!;

      if (!solvent) {
        console.log(`[watchdog] Stream ${streamId} is insolvent`);
        streamManager.updateStatus(streamId, "TERMINATED");
        broadcast(streamId, {
          type: "stream_update",
          streamId,
          status: "TERMINATED",
          totalConsumed: stream.totalConsumed.toString(),
          timeRemaining: 0,
          authCount: stream.authCount,
        });
      } else {
        broadcast(streamId, {
          type: "stream_update",
          streamId,
          status: "ACTIVE",
          totalConsumed: stream.totalConsumed.toString(),
          timeRemaining: Number(remaining),
          authCount: stream.authCount,
        });
      }
    } catch (err) {
      console.error(`[watchdog] Error checking ${streamId}:`, err);
    }
  }
}

const solvencyInterval = setInterval(checkSolvency, SOLVENCY_CHECK_INTERVAL);

// ─── Start ───

server.listen(PORT, () => {
  console.log(`[coordinator] Listening on http://localhost:${PORT}`);
  console.log(`[coordinator] WebSocket at ws://localhost:${PORT}/ws`);
});

process.on("SIGINT", () => {
  clearInterval(solvencyInterval);
  wss.close();
  server.close();
  process.exit(0);
});
