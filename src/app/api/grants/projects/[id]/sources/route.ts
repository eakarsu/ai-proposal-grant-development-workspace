import {replacementSource,revokeReplacedApproval} from '@/lib/grants/source-versions';
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  endpoint,
  projectAccess,
  editors,
  mutation,
  audit,
  reviewers,
} from "@/lib/grants/access";
import { projectSources, revision } from "@/lib/grants/projects";
import { extractDocument } from "@/lib/grants/ingest";
import { readBounded, readJson } from "@/lib/request-body";
import { jsonValue } from "@/lib/record-store";
import { RequestError } from "@/lib/record-policy";
type Context = { params: Promise<{ id: string }> };
export const GET = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    { member } = await projectAccess(prisma, actor.id, id);
  if (member.role === "CLIENT")
    throw new RequestError(
      "Clients receive approved proposal packages; original sources require staff access",
      403,
    );
  const sourceId = request.nextUrl.searchParams.get("sourceId");
  if (sourceId) {
    const source = await prisma.grantSource.findFirst({
      where: { id: sourceId, projectId: id },
    });
    if (!source?.bytes) throw new RequestError("Original file not found", 404);
    return new Response(new Uint8Array(source.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${source.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return { sources: await projectSources(prisma, id) };
});
export const POST = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    { project } = await projectAccess(prisma, actor.id, id, editors);
  if (project.status !== "DRAFT")
    throw new RequestError(
      "Sources can be added only while the proposal is a draft",
      409,
    );
  const expectedVersion = z.coerce
      .number()
      .int()
      .positive()
      .parse(request.headers.get("X-Project-Version")),
    fileName = z
      .string()
      .min(1)
      .max(200)
      .parse(decodeURIComponent(request.headers.get("X-File-Name") ?? "")),
    title = z
      .string()
      .min(1)
      .max(300)
      .parse(
        decodeURIComponent(
          request.headers.get("X-Source-Title") ?? encodeURIComponent(fileName),
        ),
      );
  const supersedesId=z.string().min(1).max(100).optional().parse(request.headers.get('X-Supersedes-Source')||undefined);
  const mediaType = z
    .enum([
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ])
    .parse(request.headers.get("Content-Type"));
  const bytes = await readBounded(request, 5000000),
    contentHash = createHash("sha256").update(bytes).digest("hex"),
    key = request.headers.get("Idempotency-Key");
  if (!key || !/^[\w:-]{8,128}$/.test(key))
    throw new RequestError("Idempotency-Key required", 400);
  const chunks = await extractDocument(bytes, mediaType);
  return mutation(
    actor.id,
    project.organizationId,
    key,
    "source.ingest",
    { id, expectedVersion, fileName, title, mediaType, contentHash, supersedesId },
    async (tx) => {
      const { project: current } = await projectAccess(
        tx,
        actor.id,
        id,
        editors,
      );
      if (current.version !== expectedVersion || current.status !== "DRAFT")
        throw new RequestError(
          "Proposal changed during extraction; reload and upload again",
          409,
        );
      if ((await tx.grantSource.count({ where: { projectId: id } })) >= 100)
        throw new RequestError(
          "Project source limit reached; split the project",
        );
      const totals = await tx.$queryRaw<
        Array<{ bytes: bigint; text: bigint }>
      >`SELECT COALESCE(SUM(octet_length(bytes)),0)::bigint AS bytes, COALESCE(SUM(octet_length(chunks::text)),0)::bigint AS text FROM "GrantSource" WHERE "projectId" = ${id}`;
      if (
        Number(totals[0].bytes) + bytes.length > 50000000 ||
        Number(totals[0].text) + Buffer.byteLength(JSON.stringify(chunks)) >
          3000000
      )
        throw new RequestError(
          "Project source quota exceeded (50 MB original files / 3 MB extracted evidence)",
          413,
        );
      const previous=await replacementSource(tx,actor.id,id,supersedesId);
      if(previous?.contentHash===contentHash)throw new RequestError('The replacement has identical content; keep the current source',409);
      const source = await tx.grantSource.create({
        data: {
          projectId: id,
          supersedesId,
          title,
          fileName,
          mediaType,
          bytes: Buffer.from(bytes),
          contentHash,
          chunks: jsonValue(chunks),
          actorId: actor.id,
        },
      });
      if(previous)await revokeReplacedApproval(tx,actor.id,previous,source.id);
      await tx.grantProject.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await revision(tx, id, actor.id, "Source ingested");
      await audit(tx, actor.id, "GRANT_SOURCE_INGESTED", source.id, {
        projectId: id,
        contentHash,
        chunkCount: chunks.length,
      });
      return { id: source.id, title, contentHash, chunks };
    },
    editors,
  );
});
const reviewSchema = z
  .object({
    sourceId: z.string().min(1).max(100),
    expectedHash: z.string().length(64),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const PATCH = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    input = reviewSchema.parse(await readJson(request)),
    { project } = await projectAccess(prisma, actor.id, id, reviewers);
  return mutation(
    actor.id,
    project.organizationId,
    request.headers.get("Idempotency-Key"),
    "source.review",
    { id, ...input },
    async (tx) => {
      const { project: current } = await projectAccess(
        tx,
        actor.id,
        id,
        reviewers,
      );
      if (
        current.status !== "DRAFT" ||
        current.version !== input.expectedVersion
      )
        throw new RequestError(
          "Source review requires the current draft version",
          409,
        );
      const source = await tx.grantSource.findFirst({
        where: { id: input.sourceId, projectId: id },
      });
      if (!source || source.contentHash !== input.expectedHash)
        throw new RequestError("Source is missing or changed", 409);
      if(await tx.grantSource.findFirst({where:{supersedesId:source.id}}))throw new RequestError('A newer source version exists; review the latest version',409);
      if (source.actorId === actor.id)
        throw new RequestError(
          "Another reviewer must approve the uploaded source",
          403,
        );
      await tx.grantSource.update({
        where: { id: source.id },
        data: { approvedBy: actor.id, approvedAt: new Date() },
      });
      await tx.grantProject.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await revision(tx, id, actor.id, "Independent source review");
      await audit(tx, actor.id, "GRANT_SOURCE_APPROVED", source.id, {
        projectId: id,
        reason: input.reason,
        contentHash: source.contentHash,
      });
      return { approved: true };
    },
    reviewers,
  );
});
