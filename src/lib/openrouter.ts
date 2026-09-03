// OpenRouter client — server-side only. Never import from client components.
// Uses OpenRouter OpenAI-compatible Chat Completions API:
// https://openrouter.ai/docs/api-reference/overview

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChoice {
  message?: { content?: string | Array<{ type: string; text?: string }> };
  // Some providers return reasoning in delta/message extras; ignore.
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

// Curated OpenRouter model list for the UI picker. Default comes from env.
export const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";

export const OPENROUTER_MODELS = [
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (default)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (cheap)" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B (open)" },
];

function extractContent(choice: OpenRouterChoice | undefined): string {
  const c = choice?.message?.content;
  if (!c) return "";
  if (typeof c === "string") return c;
  // Content parts array (e.g. [{type:"text", text:"..."}])
  return c
    .map((p) => (typeof p === "string" ? p : (p.text ?? "")))
    .join("");
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  opts?: { model?: string }
): Promise<{ content: string; model: string }> {
  const baseUrl = (
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
  ).replace(/\/+$/, "");
  const model = opts?.model || DEFAULT_OPENROUTER_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter best practice: identify your app for rankings/rate limits.
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": process.env.npm_package_name || "ai-app",
    },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${response.status} (${model}): ${text.slice(0, 300)}`);
  }
  const data = (await response.json()) as OpenRouterResponse;
  const content = extractContent(data.choices?.[0]);
  if (!content) throw new Error(`Empty OpenRouter response (${model})`);
  return { content, model };
}
