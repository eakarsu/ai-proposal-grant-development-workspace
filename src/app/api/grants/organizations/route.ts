import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  endpoint,
  managers,
  mutation,
  audit,
  membership,
  hash,
} from "@/lib/grants/access";
import { readJson } from "@/lib/request-body";
import { RequestError } from "@/lib/record-policy";
export const GET = endpoint(async (_request, actor) => ({
  organizations: await prisma.grantMembership.findMany({
    where: { userId: actor.id, active: true },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  }),
}));
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    timezone: z
      .string()
      .max(100)
      .refine((s) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: s });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict();
export const POST = endpoint(async (request, actor) => {
  const input = createSchema.parse(await readJson(request)),
    key = request.headers.get("Idempotency-Key");
  if (!key || !/^[\w:-]{8,128}$/.test(key))
    throw new RequestError("Idempotency-Key required", 400);
  if (actor.role !== "ADMIN")
    throw new RequestError(
      "An administrator must create the organization",
      403,
    );
  return mutation(
    actor.id,
    "legacy",
    key,
    "organization.create",
    input,
    async (tx) => {
      const organization = await tx.grantOrganization.create({
        data: {
          ...input,
          memberships: { create: { userId: actor.id, role: "OWNER" } },
        },
      });
      await audit(tx, actor.id, "ORGANIZATION_CREATED", organization.id, {
        name: organization.name,
      });
      return organization;
    },
    ["OWNER"],
  );
});
const updateSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200),
    profile: z.string().max(100000),
    timezone: createSchema.shape.timezone,
    reviewCount: z.number().int().min(1).max(5),
  })
  .strict();
export const PUT = endpoint(async (request, actor) => {
  const input = updateSchema.parse(await readJson(request));
  return mutation(
    actor.id,
    input.organizationId,
    request.headers.get("Idempotency-Key"),
    "organization.update",
    input,
    async (tx) => {
      const { organizationId, expectedVersion, ...data } = input;
      const previous = await tx.grantOrganization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      if (
        previous.reviewCount !== data.reviewCount &&
        (await tx.grantProject.count({
          where: {
            organizationId,
            status: { in: ["REVIEW", "APPROVED", "FROZEN"] },
          },
        }))
      )
        throw new RequestError(
          "Reopen active reviewed proposals before changing the approval policy",
          409,
        );
      const changed = await tx.grantOrganization.updateMany({
        where: { id: organizationId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (!changed.count)
        throw new RequestError("Organization changed; reload", 409);
      await audit(tx, actor.id, "ORGANIZATION_UPDATED", organizationId, {
        before: hash(previous),
        after: data,
      });
      return tx.grantOrganization.findUniqueOrThrow({
        where: { id: organizationId },
      });
    },
    ["OWNER"],
  );
});
const memberSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    userId: z.string().min(1).max(100),
    role: z.enum(["OWNER", "MANAGER", "EDITOR", "REVIEWER", "CLIENT"]),
    active: z.boolean(),
    projectIds: z.array(z.string().min(1).max(100)).max(100),
  })
  .strict();
export const PATCH = endpoint(async (request, actor) => {
  const input = memberSchema.parse(await readJson(request));
  await membership(prisma, actor.id, input.organizationId, ["OWNER"]);
  return mutation(
    actor.id,
    input.organizationId,
    request.headers.get("Idempotency-Key"),
    "membership.update",
    input,
    async (tx) => {
      const member = await tx.grantMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.userId,
          },
        },
      });
      if (!member)
        throw new RequestError("Use an invitation to add a new member", 404);
      if (
        member.role === "OWNER" &&
        member.active &&
        (!input.active || input.role !== "OWNER") &&
        (await tx.grantMembership.count({
          where: {
            organizationId: input.organizationId,
            role: "OWNER",
            active: true,
          },
        })) <= 1
      )
        throw new RequestError("Keep at least one active owner", 409);
      const projects = await tx.grantProject.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.projectIds },
        },
        select: { id: true },
      });
      if (projects.length !== new Set(input.projectIds).size)
        throw new RequestError(
          "Project access must belong to this organization",
        );
      if (
        ["CLIENT", "REVIEWER"].includes(input.role) &&
        input.active &&
        !projects.length
      )
        throw new RequestError(
          "Select at least one project for a client or reviewer",
        );
      await tx.grantProjectAccess.deleteMany({
        where: {
          userId: input.userId,
          project: { organizationId: input.organizationId },
        },
      });
      await tx.grantProjectAccess.createMany({
        data: projects.map((p) => ({ projectId: p.id, userId: input.userId })),
      });
      const result = await tx.grantMembership.update({
        where: { id: member.id },
        data: { role: input.role, active: input.active },
      });
      await audit(tx, actor.id, "MEMBERSHIP_UPDATED", member.id, input);
      return result;
    },
    ["OWNER"],
  );
});
