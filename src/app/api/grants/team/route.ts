import { prisma } from "@/lib/prisma";
import { endpoint, membership, managers } from "@/lib/grants/access";
import { z } from "zod";
export const GET = endpoint(async (request, actor) => {
  const organizationId = z
    .string()
    .min(1)
    .max(100)
    .parse(request.nextUrl.searchParams.get("organizationId"));
  await membership(prisma, actor.id, organizationId, managers);
  const members = await prisma.grantMembership.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: members.map((m) => m.userId) } },
    select: { id: true, name: true, email: true, active: true },
  });
  const access = await prisma.grantProjectAccess.findMany({
    where: { project: { organizationId } },
    select: { projectId: true, userId: true },
  });
  return {
    members: members.map((m) => ({
      ...m,
      user: users.find((u) => u.id === m.userId),
      projectIds: access
        .filter((a) => a.userId === m.userId)
        .map((a) => a.projectId),
    })),
    invitations: await prisma.grantInvitation.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        projectId: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  };
});
