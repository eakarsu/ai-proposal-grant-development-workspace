import { prisma } from "@/lib/prisma";
import {
  endpoint,
  projectAccess,
  editors,
  reviewers,
  mutation,
} from "@/lib/grants/access";
import {
  aiInput,
  aiReview,
  generateGrantDraft,
  reviewGrantDraft,
} from "@/lib/grants/ai";
import { readJson } from "@/lib/request-body";
type Context = { params: Promise<{ id: string }> };
export const GET = endpoint<Context>(async (_request, actor, context) => {
  const { id } = await context.params,
    { project, member } = await projectAccess(prisma, actor.id, id, [
      ...editors,
      ...reviewers,
    ]);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [drafts, usage] = await Promise.all([
    prisma.grantAiDraft.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.grantAiDraft.aggregate({
      where: {
        organizationId: project.organizationId,
        createdAt: { gte: since },
      },
      _count: { _all: true, costUsd: true },
      _sum: { costUsd: true },
    }),
  ]);
  return {
    drafts,
    canGenerate: editors.includes(member.role) && project.status === "DRAFT",
    configured: !!(
      process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL
    ),
    usage: {
      requests: usage._count._all,
      reportedCostUsd: usage._sum.costUsd,
      unreportedCost: usage._count._all - usage._count.costUsd,
    },
  };
});
export const POST = endpoint<Context>(async (request, actor, context) =>
  generateGrantDraft(
    actor.id,
    (await context.params).id,
    request.headers.get("idempotency-key"),
    aiInput.parse(await readJson(request, 30000)),
  ),
);
export const PATCH = endpoint<Context>(async (request, actor, context) => {
  const { id } = await context.params,
    input = aiReview.parse(await readJson(request, 10000)),
    { project } = await projectAccess(prisma, actor.id, id, editors);
  return mutation(
    actor.id,
    project.organizationId,
    request.headers.get("idempotency-key"),
    "grant.ai.review",
    { projectId: id, ...input },
    (tx) => reviewGrantDraft(tx, actor.id, id, input),
    editors,
  );
});
