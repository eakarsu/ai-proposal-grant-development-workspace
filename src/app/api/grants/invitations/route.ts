import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { endpoint, mutation, managers, audit } from "@/lib/grants/access";
import { readJson } from "@/lib/request-body";
import { RequestError } from "@/lib/record-policy";
const schema = z
  .object({
    organizationId: z.string().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(["MANAGER", "EDITOR", "REVIEWER", "CLIENT"]),
    projectId: z.string().max(100).nullable(),
  })
  .strict();
export const POST = endpoint(async (request, actor) => {
  const input = schema.parse(await readJson(request)),
    token = randomBytes(32).toString("base64url"),
    tokenHash = createHash("sha256").update(token).digest("hex");
  const result = (await mutation(
    actor.id,
    input.organizationId,
    request.headers.get("Idempotency-Key"),
    "invitation.create",
    input,
    async (tx) => {
      if (
        input.projectId &&
        !(await tx.grantProject.findFirst({
          where: { id: input.projectId, organizationId: input.organizationId },
        }))
      )
        throw new RequestError("Project belongs to another organization", 403);
      if (
        ["REVIEWER", "CLIENT", "EDITOR"].includes(input.role) &&
        !input.projectId
      )
        throw new RequestError("Select the project this invite can access");
      const invite = await tx.grantInvitation.create({
        data: {
          ...input,
          tokenHash,
          invitedBy: actor.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await audit(tx, actor.id, "INVITATION_CREATED", invite.id, {
        email: input.email,
        role: input.role,
        projectId: input.projectId,
      });
      // The token is returned once; it is not stored in retry receipts or logs.
      return { id: invite.id, expiresAt: invite.expiresAt };
    },
    managers,
  )) as { id: string; expiresAt: string };
  const actual = await prisma.grantInvitation.findUniqueOrThrow({
    where: { id: result.id },
  });
  return {
    ...result,
    invitationPath: actual.tokenHash === tokenHash ? `/join#${token}` : null,
    message:
      actual.tokenHash === tokenHash
        ? "Share this invitation link privately with the named recipient."
        : "Invitation already created. The token is displayed only once; revoke and create a new invitation if the link was lost.",
  };
});
const revokeSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    invitationId: z.string().min(1).max(100),
  })
  .strict();
export const DELETE = endpoint(async (request, actor) => {
  const input = revokeSchema.parse(await readJson(request));
  return mutation(
    actor.id,
    input.organizationId,
    request.headers.get("Idempotency-Key"),
    "invitation.revoke",
    input,
    async (tx) => {
      const changed = await tx.grantInvitation.updateMany({
        where: {
          id: input.invitationId,
          organizationId: input.organizationId,
          acceptedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (!changed.count)
        throw new RequestError("Unaccepted invitation not found", 404);
      await audit(tx, actor.id, "INVITATION_REVOKED", input.invitationId, {});
      return { success: true };
    },
    managers,
  );
});
