import { readJson } from "@/lib/request-body";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { records, errorResponse, jsonValue } from "@/lib/record-store";
import { objectBody, RequestError, recordMetadata } from "@/lib/record-policy";
export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  try {
    const user = await authorize("write");
    const { entity } = await context.params;
    const body = objectBody(await readJson(request));
    if (typeof body.id !== "string" || typeof body.reason !== "string" || body.reason.trim().length < 20 || body.reason.length > 10000) throw new RequestError("Provide the record and a review rationale of 20–10,000 characters");
    const result = await prisma.$transaction(async tx => {
      const row = await records(tx, entity).findUnique({ where: { id: body.id } });
      if (!row) throw new RequestError("Record not found", 404);
      const currentApproval = await tx.recordApproval.findUnique({ where: { id: `${entity}:${row.id}` } });
      if (currentApproval?.version === createHash("sha256").update(JSON.stringify(row)).digest("hex")) throw new RequestError("This version is already approved", 409);
      if ((row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(String(row.updatedAt)).getTime()) !== new Date(String(body.updatedAt)).getTime()) throw new RequestError("Record changed; reload before reviewing", 409);
      for (const f of recordMetadata[entity].fields.filter(f => f.relation)) if (!row[f.name]) throw new RequestError(`Link ${f.relation} before review`);
      const parent = recordMetadata[entity].parent;
      if (parent && !row[parent.field]) throw new RequestError("Associate this record with its parent before review");
      const lastChange = await tx.auditLog.findFirst({ where: { entity, entityId: row.id, action: { in: ["CREATE", "UPDATE"] } }, orderBy: { createdAt: "desc" } });
      if (lastChange?.actorId === user.id) throw new RequestError("A record's last editor cannot approve their own changes", 403);
      const version = createHash("sha256").update(JSON.stringify(row)).digest("hex");
      await tx.recordReview.create({ data: { actorId: user.id, entity, entityId: row.id, version, reason: body.reason as string } });
      const count = await tx.recordReview.count({ where: { entity, entityId: row.id, version } });
      let verificationToken: string | undefined;
      if (count >= 2) {
        const approved = "status" in row ? await records(tx, entity).update({ where: { id: row.id }, data: { status: "Approved" } }) : row;
        const approvedVersion = createHash("sha256").update(JSON.stringify(approved)).digest("hex");
        await tx.recordApproval.upsert({where:{id:`${entity}:${row.id}`},create:{id:`${entity}:${row.id}`,version:approvedVersion},update:{version:approvedVersion}});
        if (["Credential", "BadgeAward", "EmployerTranscript"].includes(entity)) {
          verificationToken = randomBytes(32).toString("hex");
          await tx.issuedCredential.create({ data: { token: verificationToken, entity, entityId: row.id, version, assertion: jsonValue({ subject: row.learnerRef ?? row.candidate, title: row.title ?? row.badge ?? row.scope ?? entity, issuer: row.issuer ?? "Assessment review team", reviewType: "Two independent human reviews" }) } });
        }
      }
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "HUMAN_REVIEW", entity, entityId: row.id, detail: JSON.stringify({ version, rationale: body.reason, independentReviews: count, scope: "Human approval of recorded evidence only; no external verification or submission performed" }) } });
      return { reviews: count, status: count >= 2 ? "Approved by two independent reviewers" : "Awaiting a second independent reviewer", verificationToken };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}
