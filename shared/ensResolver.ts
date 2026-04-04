import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

export interface ServiceConfig {
  sellerAddress: string;
  apiUrl: string;
  description: string;
  categories: string[];
  pricePerRequest: string;
  network: string;
  paymentProtocol: string;
  scanModes: string[];
  ensip25: boolean;
}

const TEXT_KEYS = [
  "description",
  "url",
  "com.kronoscan.categories",
  "com.kronoscan.price",
  "com.kronoscan.network",
  "com.kronoscan.payment",
  "com.kronoscan.scan-modes",
  "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]",
] as const;

export async function resolveService(
  ensName: string,
  sepoliaRpc: string,
): Promise<ServiceConfig | null> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(sepoliaRpc),
  });

  const address = await client.getEnsAddress({
    name: normalize(ensName),
  });

  if (!address) {
    return null;
  }

  const records: Record<string, string | null> = {};
  for (const key of TEXT_KEYS) {
    records[key] = await client.getEnsText({
      name: normalize(ensName),
      key,
    });
  }

  return {
    sellerAddress: address,
    apiUrl: records["url"] ?? "",
    description: records["description"] ?? "",
    categories: parseList(records["com.kronoscan.categories"]),
    pricePerRequest: records["com.kronoscan.price"] ?? "",
    network: records["com.kronoscan.network"] ?? "",
    paymentProtocol: records["com.kronoscan.payment"] ?? "",
    scanModes: parseList(records["com.kronoscan.scan-modes"]),
    ensip25:
      (records[
        "agent-registration[0x0000000000000000000000000000000000000000][audit-v1]"
      ] ?? "") !== "",
  };
}

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
