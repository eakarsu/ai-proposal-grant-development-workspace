import { prisma } from "@/lib/prisma";
import { records, errorResponse } from "@/lib/record-store";
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(token)) return Response.json({ valid: false }, { status: 404 });
    const issued = await prisma.issuedCredential.findUnique({ where: { token } });
    if (!issued) return Response.json({ valid: false }, { status: 404 });
    const current = await records(prisma, issued.entity).findUnique({ where: { id: issued.entityId } });
    const latest = await prisma.issuedCredential.findFirst({ where: { entity: issued.entity, entityId: issued.entityId }, orderBy: { createdAt: "desc" } });
    const valid = current?.status === "Approved" && latest?.token === token && !issued.revokedAt;
    return Response.json({ valid, assertion: issued.assertion, issuedAt: issued.createdAt, scope: "Authenticity of this application's human-reviewed credential; not external accreditation" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
