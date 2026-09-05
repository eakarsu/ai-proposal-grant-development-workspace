import metadata from "@/config/record-metadata.json";

export type Field = { name: string; kind: string; required: boolean; integer?: boolean; relation?: string; min?: number; max?: number };
export type RecordMeta = { name: string; fields: Field[]; parent?: { field: string; entity: string } };
export const recordMetadata = metadata as Record<string, RecordMeta>;
export class RequestError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export function canWrite(role: string) { return role === "ADMIN" || role === "MANAGER"; }
export function canDelete(role: string) { return role === "ADMIN"; }
export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Expected a JSON object", 400);
  return value as Record<string, unknown>;
}
const controlledState = /^(approved|verified|validated|certified|issued|published|submitted|released|signed|disbursed|passed|complete[d]?|closed)$/i;
export function validateRecord(entity: string, input: unknown, existing?: Record<string, unknown>) {
  const config = recordMetadata[entity];
  if (!config) throw new RequestError("Unknown entity", 404);
  const body = objectBody(input);
  const allowed = new Set([...config.fields.map(f => f.name), "id", "updatedAt"]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw new RequestError(`Unknown field: ${key}`);
  const data: Record<string, unknown> = {};
  for (const f of config.fields) {
    let value = body[f.name];
    if (value === undefined && existing) continue;
    if (value === undefined && f.kind === "boolean") value = false;
    if (value === undefined || value === null || value === "") {
      if (f.required || f.relation) throw new RequestError(`${f.name} is required`);
      data[f.name] = null;
      continue;
    }
    if (f.kind === "number") {
      if (typeof value !== "number" && typeof value !== "string") throw new RequestError(`${f.name} must be a number`);
      if (typeof value === "string" && !value.trim()) throw new RequestError(`${f.name} must be a number`);
      const n = Number(value);
      if (!Number.isFinite(n) || (f.integer && (!Number.isSafeInteger(n) || n > 2147483647 || n < -2147483648))) throw new RequestError(`${f.name} is not a valid ${f.integer ? "integer" : "number"}`);
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw new RequestError(`${f.name} is outside its allowed range`);
      data[f.name] = n;
    } else if (f.kind === "boolean") {
      if (![true, false, "true", "false"].includes(value as string | boolean)) throw new RequestError(`${f.name} must be true or false`);
      data[f.name] = value === true || value === "true";
    } else if (f.kind === "date") {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) throw new RequestError(`${f.name} must be an ISO date`);
      const date = new Date(value);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new RequestError(`${f.name} is not a valid date`);
      data[f.name] = date;
    } else {
      if (typeof value !== "string" || value.length > 100000) throw new RequestError(`${f.name} must be text of at most 100,000 characters`);
      if (f.required && !value.trim()) throw new RequestError(`${f.name} is required`);
      data[f.name] = value.trim();
    }
    const previous = existing?.[f.name];
    const next = data[f.name];
    if (next !== previous && ((/status|state/i.test(f.name) && typeof next === "string" && controlledState.test(next)) || (/^(verified|signed|approved|certified)$/i.test(f.name) && next === true))) {
      throw new RequestError(`${f.name} requires the review workflow; operational completion cannot be entered directly`, 409);
    }
  }
  for (const f of config.fields.filter(f => f.relation)) if (!(data[f.name] ?? existing?.[f.name])) throw new RequestError(`Select ${f.relation} before saving`);
  if (config.parent && !(data[config.parent.field] ?? existing?.[config.parent.field])) throw new RequestError(`Select ${config.parent.entity} before saving`);
  return data;
}

export function validateAiInput(value: unknown, fields: string[]) {
  const body = objectBody(value);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(body)) {
    if (!fields.includes(key)) throw new RequestError(`Unknown input: ${key}`);
    if (typeof entry !== "string" || entry.length > 50000) throw new RequestError(`${key} must be text of at most 50,000 characters`);
    result[key] = entry.trim();
  }
  if (!Object.values(result).some(Boolean)) throw new RequestError("Supply evidence or workflow inputs before running analysis");
  if (JSON.stringify(result).length > 100000) throw new RequestError("Inputs exceed the 100,000 character limit", 413);
  return result;
}
