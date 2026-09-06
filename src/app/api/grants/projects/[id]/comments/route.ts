import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { endpoint, projectAccess, mutation, audit } from "@/lib/grants/access";
import { readJson } from "@/lib/request-body";
import { RequestError } from "@/lib/record-policy";
export const POST = endpoint<{ params: Promise<{ id: string }> }>(
  async (request, actor, context) => {
    const id = (await context.params).id,
      input = z
        .object({
          body: z.string().trim().min(1).max(10000),
          taskId: z.string().max(100).nullable(),
          mentionIds: z.array(z.string().max(100)).max(20),
        })
        .strict()
        .parse(await readJson(request)),
      { project, member } = await projectAccess(prisma, actor.id, id);
    if (member.role === "CLIENT")
      throw new RequestError(
        "Internal discussion requires project staff access",
        403,
      );
    return mutation(
      actor.id,
      project.organizationId,
      request.headers.get("Idempotency-Key"),
      "comment.create",
      { id, ...input },
      async (tx) => {
        await projectAccess(tx, actor.id, id);
        for (const userId of input.mentionIds)
          await projectAccess(tx, userId, id);
        const comment = await tx.grantComment.create({
          data: {
            projectId: id,
            actorId: actor.id,
            body: input.body,
            taskId: input.taskId,
          },
        });
        for (const userId of new Set(input.mentionIds))
          if (userId !== actor.id)
            await tx.grantNotification.create({
              data: {
                userId,
                organizationId: project.organizationId,
                projectId: id,
                title: `Mentioned in ${project.title}`,
              },
            });
        await audit(tx, actor.id, "GRANT_COMMENT_ADDED", id, {
          commentId: comment.id,
        });
        return comment;
      },
    );
  },
);
