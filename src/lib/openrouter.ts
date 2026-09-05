export interface OpenRouterMessage { role: "system" | "user" | "assistant"; content: string }
export const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";
export const OPENROUTER_MODELS = [{ id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" }, { id: "openai/gpt-4o-mini", label: "GPT-4o mini" }, { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" }];
export async function callOpenRouter(messages: OpenRouterMessage[], opts?: { model?: string }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("AI_UNAVAILABLE");
  const base = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  if (base.replace(/\/+$/, "") !== "https://openrouter.ai/api/v1") throw new Error("INVALID_PROVIDER_URL");
  const model = opts?.model || DEFAULT_OPENROUTER_MODEL;
  const response = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 2500, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim() || payload?.choices?.[0]?.message?.refusal || payload?.choices?.[0]?.finish_reason === "length") throw new Error("AI_INVALID_RESPONSE");
  return { content, model: typeof payload.model === "string" ? payload.model : model, receipt: typeof payload.id === "string" ? payload.id : null, usage: payload.usage ?? null };
}
