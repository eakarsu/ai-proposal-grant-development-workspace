import { prisma } from "@/lib/prisma";
import { endpoint, editors, mutation, projectAccess } from "@/lib/grants/access";
import { billingAction, billingActionSchema, billingView } from "@/lib/grants/billing";
import { readJson } from "@/lib/request-body";

type Context = { params: Promise<{ id: string }> };

export const GET = endpoint<Context>(async (_request, actor, context) => {
  const id = (await context.params).id;
  return billingView(prisma, actor.id, id);
});

export const POST = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id;
  const input = billingActionSchema.parse(await readJson(request));
  const { project } = await projectAccess(prisma, actor.id, id, editors);
  return mutation(actor.id, project.organizationId, request.headers.get("Idempotency-Key"),
    "project.billing", { id, ...input }, tx => billingAction(tx, actor.id, id, input), editors);
});
