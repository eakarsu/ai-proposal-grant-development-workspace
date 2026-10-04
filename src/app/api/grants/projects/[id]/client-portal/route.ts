import { prisma } from "@/lib/prisma";
import { endpoint, managers, mutation, projectAccess } from "@/lib/grants/access";
import { issuePortalInvitation, newPortalToken, portalTokenHash, revokePortalInvitation,
  issuePortalSchema, revokePortalSchema } from "@/lib/grants/client-portal";
import { readJson } from "@/lib/request-body";

type Context = { params: Promise<{ id: string }> };

export const POST = endpoint<Context>(async (request, actor, context) => {
  const projectId = (await context.params).id;
  const input = issuePortalSchema.parse(await readJson(request));
  const { project } = await projectAccess(prisma, actor.id, projectId, managers);
  const token = newPortalToken();
  const tokenHash = portalTokenHash(token);
  const result = await mutation(actor.id, project.organizationId, request.headers.get("Idempotency-Key"),
    "client.portal.invite", { projectId, ...input },
    tx => issuePortalInvitation(tx, actor.id, projectId, input.quoteId, tokenHash), managers) as { id: string };
  const stored = await prisma.grantClientPortalInvitation.findFirst({ where: { id: result.id,
    organizationId: project.organizationId, projectId }, select: { tokenHash: true } });
  return { ...result, invitationPath: stored?.tokenHash === tokenHash ? `/client-portal#invite=${token}` : null,
    message: stored?.tokenHash === tokenHash
      ? "Copy this link privately now. It is shown once; no email was sent."
      : "This retry was already recorded. Revoke and issue a new invitation if the one-time link was lost." };
});

export const DELETE = endpoint<Context>(async (request, actor, context) => {
  const projectId = (await context.params).id;
  const input = revokePortalSchema.parse(await readJson(request));
  const { project } = await projectAccess(prisma, actor.id, projectId, managers);
  return mutation(actor.id, project.organizationId, request.headers.get("Idempotency-Key"),
    "client.portal.revoke", { projectId, ...input },
    tx => revokePortalInvitation(tx, actor.id, projectId, input.invitationId, input.reason), managers);
});
