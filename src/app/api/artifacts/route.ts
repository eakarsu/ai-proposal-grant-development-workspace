import { validateSourceReview } from "@/lib/source-review";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, records } from "@/lib/record-store";
import { objectBody, RequestError } from "@/lib/record-policy";
import { readJson } from "@/lib/request-body";
export async function GET(request: NextRequest) {
  try { await authorize(); const subjectEntity = request.nextUrl.searchParams.get("entity") || ""; const subjectId = request.nextUrl.searchParams.get("id") || "";
    const sourceId = request.nextUrl.searchParams.get("sourceId");
    if (sourceId) {
      const item = await prisma.domainArtifact.findFirst({ where: { id: sourceId, subjectEntity, subjectId }, select: { id: true, title: true, content: true, contentHash: true, approvedBy: true } });
      if (!item) throw new RequestError("Source does not exist for this subject", 404);
      return Response.json({ item });
    }
    return Response.json({ items: await prisma.domainArtifact.findMany({ where: { subjectEntity, subjectId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, title: true, contentHash: true, createdAt: true, approvedBy: true } }) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await authorize("write"); const body = objectBody(await readJson(request));
    if (typeof body.entity !== "string" || typeof body.id !== "string" || typeof body.title !== "string" || !body.title.trim() || typeof body.content !== "string" || !body.content.trim() || body.content.length > 100000) throw new RequestError("Provide a subject, title and 1–100,000 characters of source text");
    const subject = await records(prisma, body.entity).findUnique({ where: { id: body.id } }); if (!subject) throw new RequestError("Subject does not exist", 404);
    const item = await prisma.$transaction(async tx => {
      const saved = await tx.domainArtifact.create({ data: { subjectEntity: body.entity as string, subjectId: body.id as string, title: body.title as string, content: body.content as string, contentHash: createHash("sha256").update(body.content as string).digest("hex"), actorId: user.id } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "SOURCE_INGESTED", entity: "DomainArtifact", entityId: saved.id, detail: JSON.stringify({ subjectEntity: body.entity, subjectId: body.id, contentHash: saved.contentHash }) } });
      return saved;
    });
    return Response.json({ id: item.id, contentHash: item.contentHash }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export async function PUT(request: NextRequest) {
  try {
    const user = await authorize("write"); const body = objectBody(await readJson(request));
    if (typeof body.id !== "string") throw new RequestError("Source id required");
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "DomainArtifact" WHERE id = ${body.id as string} FOR UPDATE`;
      const item = await tx.domainArtifact.findUnique({ where: { id: body.id as string } });
      if (!item) throw new RequestError("Source does not exist", 404);
      validateSourceReview(item, user.id, body.expectedHash);
      await tx.domainArtifact.update({ where: { id: item.id }, data: { approvedBy: user.id } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "SOURCE_APPROVED", entity: "DomainArtifact", entityId: item.id, detail: item.contentHash } });
    });
    return Response.json({ approved: true });
  } catch (e) { return errorResponse(e); }
}
