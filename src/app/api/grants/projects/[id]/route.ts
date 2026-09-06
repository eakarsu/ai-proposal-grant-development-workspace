import { prisma } from "@/lib/prisma";
import {
  endpoint,
  projectAccess,
  mutation,
  editors,
  managers,
  hash,
} from "@/lib/grants/access";
import {
  saveSchema,
  saveProject,
  snapshot,
  projectAction,
  actionSchema,
} from "@/lib/grants/projects";
import { readiness } from "@/lib/grants/document";
import { readJson } from "@/lib/request-body";
import { RequestError } from "@/lib/record-policy";
type Context = { params: Promise<{ id: string }> };
export const GET = endpoint<Context>(async (_request, actor, context) => {
  const id = (await context.params).id,
    { project, member } = await projectAccess(prisma, actor.id, id);
  if (member.role === "CLIENT") {
    if (
      !["FROZEN", "SUBMITTED", "AWARDED", "DECLINED"].includes(project.status)
    )
      throw new RequestError("No approved package is available yet", 403);
    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        currency: project.currency,
      },
      role: member.role,
      packages: await prisma.grantPackage.findMany({
        where: { projectId: id },
        select: {
          id: true,
          projectVersion: true,
          contentHash: true,
          createdAt: true,
          submittedAt: true,
        },
      }),
    };
  }
  const content = await snapshot(prisma, id);
  const [reviews, revisions, packages, comments, members] = await Promise.all([
    prisma.grantReview.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.grantRevision.findMany({
      where: { projectId: id },
      select: {
        id: true,
        version: true,
        contentHash: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { version: "desc" },
      take: 100,
    }),
    prisma.grantPackage.findMany({
      where: { projectId: id },
      select: {
        id: true,
        projectVersion: true,
        contentHash: true,
        manifest: true,
        createdAt: true,
        submittedAt: true,
        receiptReference: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.grantComment.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.grantMembership.findMany({
      where: { organizationId: project.organizationId, active: true },
      select: { userId: true, role: true },
    }),
  ]);
  const access = await prisma.grantProjectAccess.findMany({
    where: { projectId: id },
    select: { userId: true },
  });
  const eligible = members.filter(
    (m) =>
      m.role !== "CLIENT" &&
      (managers.includes(m.role) || access.some((a) => a.userId === m.userId)),
  );
  const users = await prisma.user.findMany({
    where: { id: { in: eligible.map((m) => m.userId) }, active: true },
    select: { id: true, name: true, email: true },
  });
  return {
    project,
    role: member.role,
    content,
    contentHash: hash(content),
    readiness: readiness(content.document),
    reviews,
    revisions,
    packages,
    comments,
    members: users.map((u) => ({
      ...u,
      role: members.find((m) => m.userId === u.id)!.role,
    })),
  };
});
export const PUT = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    input = saveSchema.parse(await readJson(request));
  const { project } = await projectAccess(prisma, actor.id, id, editors);
  return mutation(
    actor.id,
    project.organizationId,
    request.headers.get("Idempotency-Key"),
    "project.save",
    { id, ...input },
    (tx) => saveProject(tx, actor.id, id, input),
    editors,
  );
});
export const POST = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    input = actionSchema.parse(await readJson(request));
  const { project } = await projectAccess(prisma, actor.id, id);
  return mutation(
    actor.id,
    project.organizationId,
    request.headers.get("Idempotency-Key"),
    "project.action",
    { id, ...input },
    (tx) => projectAction(tx, actor.id, id, input),
  );
});
