import { RequestError } from "./record-policy";
export async function readBounded(request: Request, limit = 1000000) {
  if (Number(request.headers.get("content-length")) > limit) throw new RequestError("Request exceeds the upload limit", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Request body is required", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > limit) { await reader.cancel(); throw new RequestError("Request exceeds the upload limit", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return buffer;
}
export async function readJson(request: Request, limit = 1000000): Promise<unknown> {
  const bytes = await readBounded(request, limit);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RequestError("Invalid JSON request", 400); }
}
