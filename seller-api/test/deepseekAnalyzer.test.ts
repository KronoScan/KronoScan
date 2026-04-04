import { describe, it, expect } from "vitest";
import { parseDeepSeekResponse, buildRequestBody } from "../src/deepseekAnalyzer.js";

describe("deepseekAnalyzer", () => {
  describe("parseDeepSeekResponse", () => {
    it("parses valid findings JSON", () => {
      const raw = JSON.stringify({
        findings: [
          {
            severity: "HIGH",
            title: "Reentrancy in withdraw()",
            line: 42,
            description: "State updated after external call.",
          },
        ],
      });
      const findings = parseDeepSeekResponse(raw, "reentrancy");
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("HIGH");
      expect(findings[0].category).toBe("reentrancy");
    });

    it("returns empty array for invalid JSON", () => {
      const findings = parseDeepSeekResponse("not json at all", "reentrancy");
      expect(findings).toEqual([]);
    });

    it("returns empty array for missing findings key", () => {
      const findings = parseDeepSeekResponse(JSON.stringify({ result: [] }), "reentrancy");
      expect(findings).toEqual([]);
    });

    it("filters out findings with invalid severity", () => {
      const raw = JSON.stringify({
        findings: [
          { severity: "HIGH", title: "Valid", line: 10, description: "ok" },
          { severity: "UNKNOWN", title: "Invalid", line: 20, description: "bad" },
        ],
      });
      const findings = parseDeepSeekResponse(raw, "reentrancy");
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Valid");
    });

    it("handles findings wrapped in markdown code block", () => {
      const raw = '```json\n{"findings": [{"severity": "LOW", "title": "Test", "line": 1, "description": "d"}]}\n```';
      const findings = parseDeepSeekResponse(raw, "compiler");
      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe("compiler");
    });
  });

  describe("buildRequestBody", () => {
    it("includes model and json response format", () => {
      const body = buildRequestBody("contract code", "reentrancy", false);
      expect(body.model).toBe("deepseek-chat");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toContain("contract code");
    });

    it("uses different prompts for deep mode", () => {
      const standard = buildRequestBody("code", "reentrancy", false);
      const deep = buildRequestBody("code", "reentrancy", true);
      expect(standard.messages[0].content).not.toBe(deep.messages[0].content);
    });
  });
});
