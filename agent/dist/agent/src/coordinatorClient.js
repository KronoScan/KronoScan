import WebSocket from "ws";
import { COORDINATOR_WS_URL } from "./config.js";
export class CoordinatorClient {
    ws = null;
    messageQueue = [];
    waiters = [];
    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(COORDINATOR_WS_URL);
            this.ws.on("open", () => {
                console.log(`[coordinator] Connected to ${COORDINATOR_WS_URL}`);
                resolve();
            });
            this.ws.on("message", (raw) => {
                let msg;
                try {
                    msg = JSON.parse(raw.toString());
                }
                catch {
                    console.warn("[coordinator] Received non-JSON message, ignoring");
                    return;
                }
                console.log(`[coordinator] ← ${msg.type}`, msg.type === "error" ? msg.message : "");
                const waiterIdx = this.waiters.findIndex((w) => !w.filter || w.filter === msg.type);
                if (waiterIdx >= 0) {
                    const waiter = this.waiters.splice(waiterIdx, 1)[0];
                    waiter.resolve(msg);
                }
                else {
                    this.messageQueue.push(msg);
                }
            });
            this.ws.on("error", (err) => {
                console.error("[coordinator] WebSocket error:", err.message);
                reject(err);
            });
            this.ws.on("close", () => {
                console.log("[coordinator] Disconnected");
                this.rejectAllWaiters("WebSocket disconnected");
            });
        });
    }
    send(msg) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("Not connected to coordinator");
        }
        this.ws.send(JSON.stringify(msg));
    }
    waitFor(type, timeoutMs = 10_000) {
        const idx = this.messageQueue.findIndex((m) => m.type === type);
        if (idx >= 0) {
            return Promise.resolve(this.messageQueue.splice(idx, 1)[0]);
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const i = this.waiters.findIndex((w) => w.resolve === resolve);
                if (i >= 0)
                    this.waiters.splice(i, 1);
                reject(new Error(`Timeout waiting for ${type}`));
            }, timeoutMs);
            this.waiters.push({
                resolve: (msg) => {
                    clearTimeout(timer);
                    resolve(msg);
                },
                filter: type,
            });
        });
    }
    async openSession(sessionId, seller, pricePerRequest, deposit, verified, ensName) {
        this.send({
            type: "open_session",
            sessionId,
            seller,
            pricePerRequest,
            deposit,
            verified,
            ensName,
        });
        const msg = await this.waitFor("session_opened");
        return msg;
    }
    async recordPayment(sessionId, category, amount) {
        this.send({
            type: "record_payment",
            sessionId,
            category,
            amount,
        });
        const msg = await this.waitFor("session_update");
        return msg;
    }
    async closeSession(sessionId) {
        this.send({
            type: "close_session",
            sessionId,
        });
        const msg = await this.waitFor("session_closed");
        return msg;
    }
    relayFinding(sessionId, finding) {
        try {
            this.send({
                type: "relay_finding",
                sessionId,
                finding,
            });
        }
        catch {
            // Fire-and-forget — don't break audit if relay fails
        }
    }
    rejectAllWaiters(reason) {
        const pending = this.waiters.splice(0);
        for (const waiter of pending) {
            waiter.resolve({ type: "error", message: reason });
        }
    }
    disconnect() {
        this.rejectAllWaiters("Client disconnected");
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
