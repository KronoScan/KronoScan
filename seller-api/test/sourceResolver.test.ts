import { describe, it, expect } from "vitest";
import { buildExplorerUrl, parseExplorerResponse } from "../src/sourceResolver.js";

describe("sourceResolver", () => {
  describe("buildExplorerUrl", () => {
    it("builds correct URL for arc-testnet", () => {
      const url = buildExplorerUrl("0xabc123", "arc-testnet");
      expect(url).toContain("module=contract");
      expect(url).toContain("action=getsourcecode");
      expect(url).toContain("address=0xabc123");
    });
  });

  describe("parseExplorerResponse", () => {
    it("extracts source code from valid response", () => {
      const response = {
        status: "1",
        result: [{ SourceCode: "pragma solidity ^0.8.0; contract Foo {}" }],
      };
      const source = parseExplorerResponse(response);
      expect(source).toBe("pragma solidity ^0.8.0; contract Foo {}");
    });

    it("returns null for unverified contract", () => {
      const response = {
        status: "1",
        result: [{ SourceCode: "" }],
      };
      const source = parseExplorerResponse(response);
      expect(source).toBeNull();
    });

    it("returns null for error response", () => {
      const response = {
        status: "0",
        result: "Invalid address",
      };
      const source = parseExplorerResponse(response);
      expect(source).toBeNull();
    });
  });
});
