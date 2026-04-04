import { describe, it, expect, vi } from "vitest";
import { resolveService, type ServiceConfig } from "./ensResolver.js";

// Mock viem's public client functions
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
    http: vi.fn(),
  };
});

describe("resolveService", () => {
  it("returns null when ENS name does not resolve", async () => {
    const { createPublicClient } = await import("viem");
    (createPublicClient as any).mockReturnValue({
      getEnsAddress: vi.fn().mockResolvedValue(null),
    });

    const result = await resolveService("nonexistent.eth", "https://rpc.sepolia.org");
    expect(result).toBeNull();
  });

  it("parses all text records into ServiceConfig", async () => {
    const textRecords: Record<string, string> = {
      description: "AI-powered audit",
      url: "http://localhost:3002",
      "com.kronoscan.categories": "reentrancy,access-control,arithmetic",
      "com.kronoscan.price": "100",
      "com.kronoscan.network": "eip155:5042002",
      "com.kronoscan.payment": "x402",
      "com.kronoscan.scan-modes": "standard,deep",
      "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]": "1",
    };

    const { createPublicClient } = await import("viem");
    (createPublicClient as any).mockReturnValue({
      getEnsAddress: vi.fn().mockResolvedValue("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad"),
      getEnsText: vi.fn().mockImplementation(({ key }: { key: string }) => {
        return Promise.resolve(textRecords[key] ?? null);
      }),
    });

    const result = await resolveService("audit.kronoscan.eth", "https://rpc.sepolia.org");

    expect(result).not.toBeNull();
    expect(result!.sellerAddress).toBe("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad");
    expect(result!.apiUrl).toBe("http://localhost:3002");
    expect(result!.description).toBe("AI-powered audit");
    expect(result!.categories).toEqual(["reentrancy", "access-control", "arithmetic"]);
    expect(result!.pricePerRequest).toBe("100");
    expect(result!.network).toBe("eip155:5042002");
    expect(result!.paymentProtocol).toBe("x402");
    expect(result!.scanModes).toEqual(["standard", "deep"]);
    expect(result!.ensip25).toBe(true);
  });

  it("handles missing optional text records with defaults", async () => {
    const { createPublicClient } = await import("viem");
    (createPublicClient as any).mockReturnValue({
      getEnsAddress: vi.fn().mockResolvedValue("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad"),
      getEnsText: vi.fn().mockResolvedValue(null),
    });

    const result = await resolveService("audit.kronoscan.eth", "https://rpc.sepolia.org");

    expect(result).not.toBeNull();
    expect(result!.sellerAddress).toBe("0x3fbE3Ad97D52B8Db587C68433c0393B1792719ad");
    expect(result!.apiUrl).toBe("");
    expect(result!.categories).toEqual([]);
    expect(result!.pricePerRequest).toBe("");
    expect(result!.ensip25).toBe(false);
  });
});
