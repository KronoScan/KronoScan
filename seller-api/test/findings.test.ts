import { describe, it, expect } from "vitest";
import { getFindingsForCategory, ALL_FINDINGS } from "../src/findings.js";
import { AUDIT_CATEGORIES, type AuditCategory } from "../src/types.js";

describe("findings", () => {
  it("has findings for every category", () => {
    for (const category of AUDIT_CATEGORIES) {
      const findings = getFindingsForCategory(category);
      expect(findings.length).toBeGreaterThan(0);
    }
  });

  it("every finding has required fields", () => {
    for (const finding of ALL_FINDINGS) {
      expect(finding.severity).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)$/);
      expect(finding.title).toBeTruthy();
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.description).toBeTruthy();
      expect(AUDIT_CATEGORIES).toContain(finding.category);
    }
  });

  it("has at least 10 findings total", () => {
    expect(ALL_FINDINGS.length).toBeGreaterThanOrEqual(10);
  });

  it("has a mix of severities", () => {
    const severities = new Set(ALL_FINDINGS.map((f) => f.severity));
    expect(severities.size).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array for unknown category", () => {
    const findings = getFindingsForCategory("nonexistent" as AuditCategory);
    expect(findings).toEqual([]);
  });
});
