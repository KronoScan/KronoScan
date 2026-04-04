const EXPLORER_URLS: Record<string, string> = {
  "arc-testnet": "https://testnet.arcscan.io/api",
};

export function buildExplorerUrl(address: string, chain: string): string {
  const baseUrl = EXPLORER_URLS[chain] ?? EXPLORER_URLS["arc-testnet"];
  const apiKey = process.env.ETHERSCAN_API_KEY ?? "";
  return `${baseUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
}

export function parseExplorerResponse(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;

  const obj = data as Record<string, unknown>;
  if (obj.status !== "1") return null;
  if (!Array.isArray(obj.result)) return null;

  const first = obj.result[0] as Record<string, unknown> | undefined;
  if (!first) return null;

  const source = first.SourceCode;
  if (typeof source !== "string" || source === "") return null;

  return source;
}

export async function resolveSource(address: string, chain: string): Promise<string | null> {
  const url = buildExplorerUrl(address, chain);

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;

  const data = await response.json();
  return parseExplorerResponse(data);
}
