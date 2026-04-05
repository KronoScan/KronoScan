# Frontend Integration — Aligning Vite Dashboard with Per-Request Backend

## Goal

Integrate the existing Vite + React frontend with our coordinator/agent backend. The frontend was built against an older stream-based API — we need to align it with the current per-request session model, add a finding relay pipeline, and update the UI to reflect per-request payments instead of per-second streaming.

## Decisions

- **Keep Vite + React** (not Next.js) — already built, working, no value in porting
- **Live mode first, demo mode as fallback** — demo fires only when WS isn't connected
- **Coordinator relays findings** — agent sends findings to coordinator, coordinator broadcasts to frontend via WebSocket

## WebSocket Protocol Alignment

### Current frontend expects (wrong)

```
WS URL: ws://localhost:3001
Messages: open_stream, stream_opened, stream_update, stream_closed
Fields: streamId, effectiveRate, baseRate, authCount, timeRemaining
```

### Our coordinator sends (correct)

```
WS URL: ws://localhost:3001/ws
Messages: open_session, session_opened, session_update, session_closed
Fields: sessionId, effectivePrice, pricePerRequest (derived), requestCount, requestsRemaining, completedCategories
```

### Message mapping

| Frontend receives | Fields |
|---|---|
| `session_opened` | `sessionId`, `effectivePrice`, `deposit`, `startTime`, `ensName?` |
| `session_update` | `sessionId`, `status`, `totalConsumed`, `requestsRemaining`, `requestCount`, `completedCategories` |
| `session_closed` | `sessionId`, `consumed`, `refunded`, `txHash` |
| `finding` | `sessionId`, `finding: { severity, title, line, description, category }` |
| `error` | `message` |

### Frontend sends (for live audit trigger)

| Frontend sends | Fields |
|---|---|
| `open_session` | `seller`, `pricePerRequest`, `deposit`, `verified`, `ensName?`, `contractInput?` |

Note: In the current architecture, the **agent** opens sessions and runs audits, not the frontend. The frontend's "Run Audit" button should trigger the agent flow. For the hackathon demo, the simplest path is: frontend sends `open_session` to coordinator (same as agent does), and the agent is already running and picks up the session. However, this adds complexity. The simpler approach: **the agent runs independently, the frontend just subscribes and watches**. The "Run Audit" button starts the agent process, or the frontend just observes an already-running audit.

**Simplest approach for demo**: The frontend subscribes to the coordinator WebSocket and displays whatever session is active. The agent is started separately from terminal. The frontend auto-detects the active session and shows its progress. No need for the frontend to send `open_session`.

**"Run Audit" button**: In live mode, the button is disabled/hidden — the agent is the one that runs audits. The frontend is a passive observer. In demo mode, the button triggers the local demo simulation. For the hackathon, the demo flow is: start coordinator + seller + frontend, then run the agent from terminal — the dashboard lights up automatically.

## Finding Relay Pipeline

### New data flow

```
Seller API (SSE) → Agent parses finding → Agent sends relay_finding to coordinator → Coordinator broadcasts finding to WS subscribers → Frontend displays
```

### New messages

**Agent → Coordinator (new `WsMessageIn`):**
```typescript
{ type: "relay_finding"; sessionId: Hex; finding: AuditFinding }
```

**Coordinator → Frontend (existing `WsMessageOut`, already defined):**
```typescript
{ type: "finding"; sessionId: Hex; finding: AuditFinding }
```

The coordinator handler for `relay_finding` simply broadcasts the finding to all subscribers of that session.

### Agent changes

In `auditRunner.ts`, after parsing each finding from the SSE stream, call `coordinator.relayFinding(sessionId, finding)` to push it to the coordinator.

In `coordinatorClient.ts`, add a `relayFinding(sessionId, finding)` method that sends the `relay_finding` message (fire-and-forget, no response expected).

## Frontend UI Changes

### Per-request model updates

- **Cost bar**: `$0.000080/req · World ID -20%` instead of `$0.000080/s`
- **Progress**: Show `requestCount/10 categories` instead of `timeRemaining` countdown
- **Category progress**: Show 10 categories with checkmarks based on `completedCategories` array
- **Remove** `timeRemaining` display — not relevant for per-request
- **Refund**: Show `refunded` amount from `session_closed` (already partially implemented)

### ENS name display

- Show `ensName` from `session_opened` dynamically instead of hardcoded `audit.kronoscan.eth`
- Display in status bar next to session status indicator

### State shape update (`useCoordinator.ts`)

```typescript
interface CoordinatorState {
  status: StreamStatus
  sessionId: string | null
  totalConsumed: bigint
  effectivePrice: bigint
  deposit: bigint
  requestCount: number
  requestsRemaining: number
  completedCategories: string[]
  verified: boolean
  ensName: string
  findings: AuditFinding[]
  closedData: ClosedData | null
  connected: boolean
}
```

Key changes from current:
- Remove `effectiveRate`, `baseRate`, `timeRemaining`, `authCount`, `streamId`
- Add `effectivePrice`, `requestsRemaining`, `completedCategories`, `ensName`, `sessionId`

### Auto-subscribe behavior

When the frontend connects to the coordinator WebSocket, it should request the list of active sessions via the existing REST endpoint `GET /api/sessions` and subscribe to the first active one. This way the frontend doesn't need to open sessions — it just watches.

## File Changes

| File | Action | What changes |
|---|---|---|
| `frontend/src/hooks/useCoordinator.ts` | Rewrite | New message types, WS URL `/ws`, per-request state, auto-subscribe |
| `frontend/src/types.ts` | Modify | Add `category` to `AuditFinding` |
| `frontend/src/App.tsx` | Modify | Per-request UI, category progress, ENS name, remove time countdown |
| `coordinator/src/types.ts` | Modify | Add `relay_finding` to `WsMessageIn` |
| `coordinator/src/index.ts` | Modify | Handle `relay_finding` → broadcast finding |
| `agent/src/auditRunner.ts` | Modify | Relay each finding to coordinator as it arrives |
| `agent/src/coordinatorClient.ts` | Modify | Add `relayFinding()` method |
| `CLAUDE.md` | Modify | Update frontend tech from Next.js to Vite |

## Demo Mode

Keep existing demo mode as fallback when WebSocket is not connected. The demo mode:
- Shows hardcoded findings with simulated timing
- Runs standalone without backend
- Uses the same UI components as live mode

Update demo to use per-request language (minor text changes) but don't spend time on major demo mode rework — live mode is the priority.

## Error Handling

| Scenario | Behavior |
|---|---|
| WS disconnects | Fall back to demo mode, auto-reconnect every 2s (already implemented) |
| No active session | Show IDLE state, "waiting for audit..." |
| Finding relay fails | Agent logs warning, continues audit (fire-and-forget) |
| Session closes | Show refund summary, allow "Scan Again" to reset state |
