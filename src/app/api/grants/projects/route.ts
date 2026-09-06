import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  endpoint,
  membership,
  editors,
  managers,
  mutation,
} from "@/lib/grants/access";
import { createProject, projectSchema } from "@/lib/grants/projects";
import { readJson } from "@/lib/request-body";
export const GET = endpoint(async (request, actor) => {
  const organizationId = z
    .string()
    .min(1)
    .max(100)
    .parse(request.nextUrl.searchParams.get("organizationId"));
  const member = await membership(prisma, actor.id, organizationId);
  return {
    projects: await prisma.grantProject.findMany({
      where: {
        organizationId,
        ...(!managers.includes(member.role)
          ? { access: { some: { userId: actor.id } } }
          : {}),
        ...(member.role === "CLIENT"
          ? { status: { in: ["FROZEN", "SUBMITTED", "AWARDED", "DECLINED"] } }
          : {}),
      },
      select: {
        id: true,
        title: true,
        funder: true,
        program: true,
        dueAt: true,
        currency: true,
        status: true,
        version: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    role: member.role,
  };
});
export const POST = endpoint(async (request, actor) => {
  const schema = projectSchema.extend({
    organizationId: z.string().min(1).max(100),
  });
  const { organizationId, ...input } = schema.parse(await readJson(request));
  return mutation(
    actor.id,
    organizationId,
    request.headers.get("Idempotency-Key"),
    "project.create",
    input,
    (tx) => createProject(tx, actor.id, organizationId, input),
    editors,
  );
});
