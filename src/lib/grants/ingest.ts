import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RequestError } from "@/lib/record-policy";
import type { SourceChunk } from "./document";
let active = 0;
export async function extractDocument(
  bytes: Uint8Array,
  mediaType: string,
): Promise<SourceChunk[]> {
  if (!bytes.length || bytes.length > 5000000)
    throw new RequestError("Source files must be between 1 byte and 5 MB", 413);
  if (active >= 2)
    throw new RequestError("Document extraction is busy; retry shortly", 429);
  active++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), "grant-source-"));
    await writeFile(path.join(directory, "input"), bytes, { mode: 0o600 });
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--max-old-space-size=256",
          path.join(process.cwd(), "scripts/grant-document-worker.mjs"),
          directory!,
          mediaType,
        ],
        {
          detached: true,
          env: { PATH: process.env.PATH ?? "", NODE_ENV: "production" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "",
        settled = false;
      const kill = () => {
        if (child.pid)
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
      };
      const timer = setTimeout(() => {
        kill();
        finish(
          new RequestError(
            "Document extraction timed out; split or simplify the source",
            422,
          ),
        );
      }, 90000);
      const finish = (error?: Error, chunks?: SourceChunk[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(chunks!);
      };
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.length > 1200000) {
          kill();
          finish(
            new RequestError("Extracted document exceeds the size limit", 413),
          );
        }
      });
      child.stderr.resume();
      child.once("error", () =>
        finish(
          new RequestError("Document extraction worker could not start", 503),
        ),
      );
      child.once("close", () => {
        try {
          const result = JSON.parse(output) as {
            error?: string;
            chunks: SourceChunk[];
          };
          if (result.error) finish(new RequestError(result.error));
          else if (Array.isArray(result.chunks))
            finish(undefined, result.chunks);
          else finish(new RequestError("Document extraction returned no text"));
        } catch {
          finish(
            new RequestError(
              "Document is unsupported, malformed or too complex to extract",
            ),
          );
        }
      });
    });
  } finally {
    active--;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
