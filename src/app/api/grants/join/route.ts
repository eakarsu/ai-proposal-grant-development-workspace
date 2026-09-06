import { z } from "zod";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { readJson } from "@/lib/request-body";
import { RequestError } from "@/lib/record-policy";
import { errorResponse } from "@/lib/record-store";
import { audit } from "@/lib/grants/access";
const schema = z
  .object({
    token: z.string().regex(/^[\w-]{43}$/),
    name: z.string().trim().min(1).max(150).optional(),
    password: z
      .string()
      .min(16)
      .refine((s) => Buffer.byteLength(s, "utf8") <= 72)
      .optional(),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (
      origin &&
      origin !== request.nextUrl.origin &&
      origin !== process.env.NEXTAUTH_URL
    )
      throw new RequestError("Origin is not allowed", 403);
    const input = schema.parse(await readJson(request)),
      actor = await requireUser(),
      tokenHash = createHash("sha256").update(input.token).digest("hex");
    // Possession of the one-time, recipient-specific invite is required before account setup.
    const invite = await prisma.grantInvitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invite ||
      invite.revokedAt ||
      invite.acceptedAt ||
      invite.expiresAt <= new Date()
    )
      throw new RequestError(
        "Invitation is invalid, expired or already used",
        409,
      );
    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true, active: true },
    });
    if (existing && (!actor || actor.id !== existing.id))
      throw new RequestError(
        "Sign in as the invited recipient before accepting",
        401,
      );
    if (actor && actor.email !== invite.email)
      throw new RequestError("This invitation is for another account", 403);
    if (!existing && (!input.name || !input.password))
      throw new RequestError(
        "Name and a password of at least 16 characters are required",
      );
    const passwordHash = !existing
      ? await bcrypt.hash(input.password!, 12)
      : null;
    const result = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.grantInvitation.updateMany({
          where: {
            id: invite.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date() },
        });
        if (!claimed.count)
          throw new RequestError("Invitation was already used", 409);
        const user = existing
          ? await tx.user.findUniqueOrThrow({ where: { id: existing.id } })
          : await tx.user.create({
              data: {
                name: input.name!,
                email: invite.email,
                passwordHash: passwordHash!,
                role: "ANALYST",
              },
            });
        if (!user.active)
          throw new RequestError("The invited account is inactive", 403);
        const old = await tx.grantMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: invite.organizationId,
              userId: user.id,
            },
          },
        });
        if (old && !old.active)
          throw new RequestError(
            "An owner must reactivate this membership",
            403,
          );
        if (!old)
          await tx.grantMembership.create({
            data: {
              organizationId: invite.organizationId,
              userId: user.id,
              role: invite.role,
            },
          });
        if (invite.projectId)
          await tx.grantProjectAccess.upsert({
            where: {
              projectId_userId: {
                projectId: invite.projectId,
                userId: user.id,
              },
            },
            create: { projectId: invite.projectId, userId: user.id },
            update: {},
          });
        await audit(tx, user.id, "INVITATION_ACCEPTED", invite.id, {
          organizationId: invite.organizationId,
        });
        return {
          organizationId: invite.organizationId,
          projectId: invite.projectId,
        };
      },
      { isolationLevel: "Serializable" },
    );
    return Response.json(result);
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        { error: "Invitation and account details are invalid" },
        { status: 422 },
      );
    return errorResponse(e);
  }
}
