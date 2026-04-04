import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import type { Hex, Address } from "viem";
import { SessionManager } from "./sessionManager.js";
import { VaultClient } from "./vaultClient.js";
import { SessionNotFoundError, SessionNotActiveError, InsufficientBudgetError } from "./errors.js";
import type { WsMessageIn, WsMessageOut } from "./types.js";

// ─── Config ───

const PORT = parseInt(process.env.COORDINATOR_PORT ?? "3001", 10);
const RPC_URL = process.env.ARC_TESTNET_RPC ?? "http://127.0.0.1:8545";
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as Address | undefined;
const COORDINATOR_KEY = process.env.PRIVATE_KEY as Hex | undefined;
const SOLVENCY_CHECK_INTERVAL = 5_000; // 5 seconds

// ─── State ───

const sessionManager = new SessionManager();
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
  res.json({ status: "ok", sessions: sessionManager.getActiveSessionIds().length });
});

app.get("/api/session/:sessionId/status", (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId as Hex);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({
    sessionId: session.sessionId,
    status: session.status,
    buyer: session.buyer,
    seller: session.seller,
    verified: session.verified,
    requestCount: session.requestCount,
    totalConsumed: session.totalConsumed.toString(),
    completedCategories: session.completedCategories,
  });
});

app.get("/api/sessions", (_req, res) => {
  const ids = sessionManager.getActiveSessionIds();
  const sessions = ids.map((id) => {
    const s = sessionManager.getSession(id)!;
    return {
      sessionId: s.sessionId,
      status: s.status,
      buyer: s.buyer,
      seller: s.seller,
      effectivePrice: s.effectivePrice.toString(),
      deposit: s.deposit.toString(),
      verified: s.verified,
      startTime: s.startTime,
      requestCount: s.requestCount,
      totalConsumed: s.totalConsumed.toString(),
      completedCategories: s.completedCategories,
    };
  });
  res.json({ sessions });
});

// ─── HTTP Server ───

const server = createServer(app);

// ─── WebSocket ───

const wss = new WebSocketServer({ server, path: "/ws" });

// Track subscriptions: sessionId → set of WebSocket clients
const subscriptions = new Map<Hex, Set<WebSocket>>();

function broadcast(sessionId: Hex, message: WsMessageOut) {
  const subs = subscriptions.get(sessionId);
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
        case "open_session":
          await handleOpenSession(ws, msg);
          break;
        case "record_payment":
          await handleRecordPayment(ws, msg);
          break;
        case "close_session":
          await handleCloseSession(ws, msg);
          break;
        case "subscribe":
          handleSubscribe(ws, msg.sessionId);
          break;
        default:
          sendTo(ws, { type: "error", message: "Unknown message type" });
      }
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        sendTo(ws, { type: "error", message: err.message });
      } else if (err instanceof SessionNotActiveError) {
        sendTo(ws, { type: "error", message: err.message });
      } else if (err instanceof InsufficientBudgetError) {
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

async function handleOpenSession(
  ws: WebSocket,
  msg: Extract<WsMessageIn, { type: "open_session" }>
) {
  const sessionId = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}` as Hex;

  const pricePerRequest = BigInt(msg.pricePerRequest);
  const deposit = BigInt(msg.deposit);
  const effectivePrice = msg.verified
    ? (pricePerRequest * 8000n) / 10000n
    : pricePerRequest;

  const session = sessionManager.registerSession({
    sessionId,
    buyer: msg.seller, // placeholder — in production, comes from on-chain event
    seller: msg.seller,
    pricePerRequest,
    effectivePrice,
    deposit,
    verified: msg.verified,
    startTime: Math.floor(Date.now() / 1000),
  });

  handleSubscribe(ws, sessionId);

  sendTo(ws, {
    type: "session_opened",
    sessionId,
    effectivePrice: session.effectivePrice.toString(),
    deposit: session.deposit.toString(),
    startTime: session.startTime,
  });

  console.log(`[session] Opened ${sessionId} | price=${effectivePrice} | deposit=${deposit} | verified=${msg.verified}`);
}

async function handleRecordPayment(
  _ws: WebSocket,
  msg: Extract<WsMessageIn, { type: "record_payment" }>
) {
  const { sessionId, category } = msg;
  const amount = BigInt(msg.amount);

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  sessionManager.recordPayment(sessionId, amount, category);

  // Report consumption on-chain
  if (vaultClient) {
    try {
      const txHash = await vaultClient.reportConsumption(sessionId, amount);
      console.log(`[vault] reportConsumption tx: ${txHash}`);
    } catch (err) {
      console.error("[vault] reportConsumption failed:", err);
    }
  }

  const remaining = session.deposit > session.totalConsumed
    ? Number((session.deposit - session.totalConsumed) / session.effectivePrice)
    : 0;

  broadcast(sessionId, {
    type: "session_update",
    sessionId,
    status: session.status,
    totalConsumed: session.totalConsumed.toString(),
    requestsRemaining: remaining,
    requestCount: session.requestCount,
    completedCategories: session.completedCategories,
  });
}

async function handleCloseSession(
  _ws: WebSocket,
  msg: Extract<WsMessageIn, { type: "close_session" }>
) {
  const { sessionId } = msg;
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  sessionManager.updateStatus(sessionId, "CLOSING");

  const consumed = session.totalConsumed;
  const refund = session.deposit - consumed;

  let txHash: Hex = "0x0" as Hex;
  if (vaultClient) {
    try {
      txHash = await vaultClient.closeSession(sessionId);
      console.log(`[vault] closeSession tx: ${txHash}`);
    } catch (err) {
      console.error("[vault] closeSession failed:", err);
    }
  }

  sessionManager.updateStatus(sessionId, "CLOSED");

  broadcast(sessionId, {
    type: "session_closed",
    sessionId,
    consumed: consumed.toString(),
    refunded: refund.toString(),
    txHash,
  });

  console.log(`[session] Closed ${sessionId} | consumed=${consumed} | refund=${refund}`);
}

function handleSubscribe(ws: WebSocket, sessionId: Hex) {
  if (!subscriptions.has(sessionId)) {
    subscriptions.set(sessionId, new Set());
  }
  subscriptions.get(sessionId)!.add(ws);
}

// ─── Solvency Watchdog ───

async function checkSolvency() {
  if (!vaultClient) return;

  const activeIds = sessionManager.getActiveSessionIds();
  for (const sessionId of activeIds) {
    try {
      const [solvent, remaining] = await Promise.all([
        vaultClient.isSolvent(sessionId),
        vaultClient.requestsRemaining(sessionId),
      ]);

      const session = sessionManager.getSession(sessionId)!;

      if (!solvent) {
        console.log(`[watchdog] Session ${sessionId} budget exhausted`);
        sessionManager.updateStatus(sessionId, "TERMINATED");
        broadcast(sessionId, {
          type: "session_update",
          sessionId,
          status: "TERMINATED",
          totalConsumed: session.totalConsumed.toString(),
          requestsRemaining: 0,
          requestCount: session.requestCount,
          completedCategories: session.completedCategories,
        });
      } else {
        broadcast(sessionId, {
          type: "session_update",
          sessionId,
          status: "ACTIVE",
          totalConsumed: session.totalConsumed.toString(),
          requestsRemaining: Number(remaining),
          requestCount: session.requestCount,
          completedCategories: session.completedCategories,
        });
      }
    } catch (err) {
      console.error(`[watchdog] Error checking ${sessionId}:`, err);
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
