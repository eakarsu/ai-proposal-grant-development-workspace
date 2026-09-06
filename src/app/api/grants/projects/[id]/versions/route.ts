import { prisma } from "@/lib/prisma";
import { endpoint, projectAccess } from "@/lib/grants/access";
import { RequestError } from "@/lib/record-policy";
import { z } from "zod";
export const GET = endpoint<{ params: Promise<{ id: string }> }>(
  async (request, actor, context) => {
    const id = (await context.params).id,
      { member } = await projectAccess(prisma, actor.id, id);
    if (member.role === "CLIENT")
      throw new RequestError("Draft history requires staff access", 403);
    const version = z.coerce
      .number()
      .int()
      .positive()
      .parse(request.nextUrl.searchParams.get("version"));
    const revision = await prisma.grantRevision.findUnique({
      where: { projectId_version: { projectId: id, version } },
    });
    if (!revision) throw new RequestError("Version not found", 404);
    return revision;
  },
);
