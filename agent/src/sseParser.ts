export interface SSEEvent {
  [key: string]: unknown;
}

export function parseSSEStream(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const json = line.slice(6);
    try {
      events.push(JSON.parse(json) as SSEEvent);
    } catch {
      // Skip malformed JSON
    }
  }

  return events;
}

export interface AuditFinding {
  severity: string;
  title: string;
  line: number;
  description: string;
  category: string;
}

export interface CategoryComplete extends SSEEvent {
  type: "category_complete";
  category: string;
  findingCount: number;
  source?: string;
  scanMode?: string;
}

export function isCategoryComplete(event: SSEEvent): event is CategoryComplete {
  return event.type === "category_complete";
}

export function isFinding(event: SSEEvent): event is AuditFinding & SSEEvent {
  return typeof event.severity === "string" && typeof event.title === "string";
}
