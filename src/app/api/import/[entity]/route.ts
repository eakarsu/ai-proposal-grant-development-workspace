import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { records, validateRelations, errorResponse } from "@/lib/record-store";
import { objectBody, RequestError, validateRecord } from "@/lib/record-policy";
import { readJson } from "@/lib/request-body";
import { createHash } from "node:crypto";
export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  try {
    const user = await authorize("write"); const { entity } = await context.params; const body = objectBody(await readJson(request));
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) throw new RequestError("Import 1–500 records at a time");
    const normalized = body.rows.map((r, i) => { try { return validateRecord(entity, r); } catch (e) { throw new RequestError(`Row ${i + 1}: ${e instanceof Error ? e.message : "Invalid record"}`); } });
    const fingerprint = createHash("sha256").update(JSON.stringify([entity, normalized])).digest("hex");
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.auditLog.findFirst({ where: { action: "BULK_IMPORT", entity, entityId: fingerprint } });
      if (existing) throw new RequestError("This exact dataset was already imported", 409);
      const ids = [];
      for (const data of normalized) {
        await validateRelations(tx, entity, data);
        const row = await records(tx, entity).create({ data }); ids.push(row.id);
        await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "CREATE", entity, entityId: row.id, detail: JSON.stringify({ source: fingerprint, before: null, after: row }) } });
      }
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "BULK_IMPORT", entity, entityId: fingerprint, detail: JSON.stringify({ ids, records: ids.length }) } });
      return { ids, fingerprint };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return Response.json(result, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
