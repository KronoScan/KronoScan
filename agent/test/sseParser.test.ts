import { describe, it, expect } from "vitest";
import { parseSSEStream } from "../src/sseParser.js";

describe("parseSSEStream", () => {
  it("parses a single SSE event", () => {
    const raw = 'data: {"severity":"HIGH","title":"Bug","line":10,"description":"bad","category":"reentrancy"}\n\n';
    const events = parseSSEStream(raw);
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe("HIGH");
  });

  it("parses multiple SSE events", () => {
    const raw = [
      'data: {"severity":"HIGH","title":"Bug1","line":10,"description":"d","category":"reentrancy"}',
      "",
      'data: {"severity":"LOW","title":"Bug2","line":20,"description":"d","category":"reentrancy"}',
      "",
      "",
    ].join("\n");
    const events = parseSSEStream(raw);
    expect(events).toHaveLength(2);
  });

  it("handles category_complete event", () => {
    const raw = 'data: {"type":"category_complete","category":"reentrancy","findingCount":1}\n\n';
    const events = parseSSEStream(raw);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("category_complete");
  });

  it("skips malformed lines", () => {
    const raw = 'not-sse\ndata: {"severity":"LOW","title":"ok","line":1,"description":"d","category":"defi"}\n\n';
    const events = parseSSEStream(raw);
    expect(events).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseSSEStream("")).toEqual([]);
  });
});
