import { NextRequest } from "next/server";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canWrite, RequestError } from "@/lib/record-policy";
import { readBounded } from "@/lib/request-body";
import { errorResponse } from "@/lib/record-store";
import { createHash } from "node:crypto";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(); const { id } = await context.params;
    const session = await prisma.workSession.findUnique({ where: { id } });
    if (!session || session.respondentId !== user.id) throw new RequestError("Only the assigned respondent may attach a recording", 403);
    if (session.status !== "active" || new Date() >= session.deadline || !session.currentQuestion) throw new RequestError("The session is not accepting recordings", 409);
    const contentType = request.headers.get("content-type")?.split(";")[0] || "";
    if (!["audio/webm", "video/webm"].includes(contentType)) throw new RequestError("Only WebM recordings are supported");
    const bytes = await readBounded(request, 10000000);
    if (bytes.length < 4 || Buffer.from(bytes.subarray(0, 4)).toString("hex") !== "1a45dfa3") throw new RequestError("File is not a WebM recording");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const media = await prisma.$transaction(async tx => {
      const current = await tx.workSession.findUnique({where:{id}});
      if (!current || current.currentQuestion !== session.currentQuestion || current.status !== "active" || new Date() >= current.deadline) throw new RequestError("Session changed or expired during upload",409);
      if (await tx.sessionMedia.count({where:{sessionId:id,questionId:current.currentQuestion!}}) >= 3) throw new RequestError("At most three recordings per question are allowed",422);
      const saved = await tx.sessionMedia.create({ data: { sessionId: id, questionId: session.currentQuestion!, actorId: user.id, contentType, bytes: Buffer.from(bytes), contentHash: hash } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "SESSION_RECORDING_ATTACHED", entity: "WorkSession", entityId: id, detail: JSON.stringify({ mediaId: saved.id, contentHash: hash, questionId: session.currentQuestion }) } });
      return saved;
    }, { isolationLevel: "Serializable" });
    return Response.json({ id: media.id, contentHash: hash }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(); const { id } = await context.params; const session = await prisma.workSession.findUnique({ where: { id } });
    if (!session || (!canWrite(user.role) && session.respondentId !== user.id)) throw new RequestError("Session access denied", 403);
    const mediaId = request.nextUrl.searchParams.get("mediaId");
    if (!mediaId) return Response.json({ items: await prisma.sessionMedia.findMany({ where: { sessionId: id }, select: { id: true, questionId: true, contentHash: true, contentType: true } }) });
    const media = await prisma.sessionMedia.findFirst({ where: { id: mediaId, sessionId: id } }); if (!media) throw new RequestError("Recording not found", 404);
    return new Response(new Uint8Array(media.bytes), { headers: { "Content-Type": media.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return errorResponse(e); }
}
