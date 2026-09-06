import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, SessionUser } from "@/lib/api-auth";
import { RequestError } from "@/lib/record-policy";
import { errorResponse, jsonValue } from "@/lib/record-store";
export const managers = ["OWNER", "MANAGER"];
export const editors = [...managers, "EDITOR"];
export const reviewers = [...managers, "REVIEWER"];
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
export async function membership(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  roles?: string[],
) {
  const user = await tx.user.findUnique({
    where: { id: actorId },
    select: { active: true },
  });
  const member = await tx.grantMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: actorId } },
  });
  if (
    !user?.active ||
    !member?.active ||
    (roles && !roles.includes(member.role))
  )
    throw new RequestError("Organization access is not permitted", 403);
  return member;
}
export async function projectAccess(
  tx: Prisma.TransactionClient,
  actorId: string,
  projectId: string,
  roles?: string[],
) {
  const project = await tx.grantProject.findUnique({
    where: { id: projectId },
  });
  if (!project) throw new RequestError("Project not found", 404);
  const member = await membership(tx, actorId, project.organizationId, roles);
  if (
    !managers.includes(member.role) &&
    !(await tx.grantProjectAccess.findUnique({
      where: { projectId_userId: { projectId, userId: actorId } },
    }))
  )
    throw new RequestError("Project access is not permitted", 403);
  return { project, member };
}
export function endpoint<C = unknown>(
  handler: (
    request: NextRequest,
    actor: SessionUser,
    context: C,
  ) => Promise<unknown>,
) {
  return async (request: NextRequest, context: C) => {
    try {
      const actor = await requireUser();
      if (!actor) throw new RequestError("Sign in to continue", 401);
      if (!["GET", "HEAD"].includes(request.method)) {
        const origin = request.headers.get("origin"),
          allowed = [
            request.nextUrl.origin,
            process.env.NEXTAUTH_URL,
            ...String(process.env.CORS_ALLOWED_ORIGINS ?? "").split(","),
          ];
        if (origin && !allowed.includes(origin))
          throw new RequestError("Origin is not allowed", 403);
      }
      const result = await handler(request, actor, context);
      return result instanceof Response ? result : Response.json(result);
    } catch (e) {
      if (e instanceof z.ZodError)
        return Response.json(
          {
            error: e.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
          { status: 422 },
        );
      return errorResponse(e);
    }
  };
}
export async function mutation(
  actorId: string,
  organizationId: string,
  key: string | null,
  action: string,
  input: unknown,
  work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  roles?: string[],
) {
  if (!key || !/^[\w:-]{8,128}$/.test(key))
    throw new RequestError("Idempotency-Key is required", 400);
  const id = hash([actorId, organizationId, key]),
    inputHash = hash([action, input]);
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(
        async (tx) => {
          await membership(tx, actorId, organizationId, roles);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`grant:${organizationId}`}))`;
          const previous = await tx.grantMutation.findUnique({ where: { id } });
          if (previous) {
            if (previous.inputHash !== inputHash)
              throw new RequestError(
                "Retry key was already used with different input",
                409,
              );
            return previous.response;
          }
          const response = jsonValue(await work(tx));
          await tx.grantMutation.create({
            data: { id, actorId, organizationId, action, inputHash, response },
          });
          return response;
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        attempt < 3
      )
        continue;
      throw e;
    }
}
export const audit = (
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityId: string,
  details: unknown,
) =>
  tx.auditLog.create({
    data: {
      actorId,
      action,
      entity: "GrantProject",
      entityId,
      detail: JSON.stringify(details),
    },
  });
