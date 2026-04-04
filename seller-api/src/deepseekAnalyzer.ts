import type { AuditFinding, AuditCategory, Severity } from "./types.js";
import { getPromptForCategory } from "./prompts.js";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const VALID_SEVERITIES: Set<string> = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export interface DeepSeekRequestBody {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: { type: "json_object" };
  temperature: number;
  max_tokens: number;
}

export function buildRequestBody(
  contractSource: string,
  category: AuditCategory,
  deep: boolean
): DeepSeekRequestBody {
  const systemPrompt = getPromptForCategory(category, deep);
  return {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze the following Solidity smart contract for ${category} vulnerabilities:\n\n${contractSource}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 2048,
  };
}

export function parseDeepSeekResponse(raw: string, category: AuditCategory): AuditFinding[] {
  let content = raw.trim();

  // Strip markdown code blocks if present
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[deepseek] Failed to parse JSON response");
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.findings)) return [];

  const findings: AuditFinding[] = [];
  for (const item of obj.findings) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as Record<string, unknown>;

    if (
      typeof f.severity !== "string" ||
      !VALID_SEVERITIES.has(f.severity) ||
      typeof f.title !== "string" ||
      typeof f.line !== "number" ||
      typeof f.description !== "string"
    ) {
      continue;
    }

    findings.push({
      severity: f.severity as Severity,
      title: f.title,
      line: f.line,
      description: f.description,
      category,
    });
  }

  return findings;
}

export async function analyzeWithDeepSeek(
  contractSource: string,
  category: AuditCategory,
  deep: boolean
): Promise<AuditFinding[]> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY not set");
  }

  const body = buildRequestBody(contractSource, category, deep);

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty response");
  }

  return parseDeepSeekResponse(content, category);
}
