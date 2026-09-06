import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { endpoint } from "@/lib/grants/access";
import { readJson } from "@/lib/request-body";
export const GET = endpoint(async (_request, actor) => ({
  notifications: await prisma.grantNotification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  }),
}));
export const PATCH = endpoint(async (request, actor) => {
  const { id } = z
    .object({ id: z.string().max(100) })
    .strict()
    .parse(await readJson(request));
  await prisma.grantNotification.updateMany({
    where: { id, userId: actor.id },
    data: { readAt: new Date() },
  });
  return { success: true };
});
