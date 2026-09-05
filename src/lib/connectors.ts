import { RequestError } from "./record-policy";
export type Connector = { id: string; label: string; endpoint: string; token?: string; actions: string[]; schemaVersion: string };
export function configuredConnectors(): Connector[] {
  let config: unknown;
  try { config = JSON.parse(process.env.DOMAIN_CONNECTORS_JSON || "[]"); } catch { throw new RequestError("Connector configuration is invalid", 503); }
  if (!Array.isArray(config)) throw new RequestError("Connector configuration is invalid", 503);
  return config.map(item => {
    if (!item || typeof item.id !== "string" || typeof item.endpoint !== "string" || !Array.isArray(item.actions) || !item.actions.every((a: unknown) => typeof a === "string") || typeof item.schemaVersion !== "string") throw new RequestError("Connector configuration is incomplete", 503);
    const url = new URL(item.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new RequestError("Connector endpoints must be configured HTTPS URLs without embedded credentials", 503);
    return item as Connector;
  });
}
export async function connectorRequest(connector: Connector, path: "health" | "execute", body?: unknown, idempotencyKey?: string) {
  const response = await fetch(`${connector.endpoint.replace(/\/$/, "")}/${path}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", ...(connector.token ? { Authorization: `Bearer ${connector.token}` } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new RequestError(`Connector returned HTTP ${response.status}`, 502);
  const data = await response.json();
  if (data?.schemaVersion !== connector.schemaVersion) throw new RequestError("Connector response schema version does not match configuration", 502);
  if (path === "health" && data.status !== "ok") throw new RequestError("Connector health check failed", 502);
  if (path === "execute" && (data.status !== "completed" || typeof data.receiptId !== "string" || !data.receiptId || data.idempotencyKey !== idempotencyKey)) throw new RequestError("Connector returned no matching completion receipt", 502);
  return data;
}
