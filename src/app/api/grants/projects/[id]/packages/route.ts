import {
  freezeSchema,
  receiptSchema,
  freezePackage,
  recordSubmission,
} from "@/lib/grants/packages";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  endpoint,
  projectAccess,
  managers,
  mutation,
  audit,
  hash,
  reviewers,
} from "@/lib/grants/access";
import { snapshot } from "@/lib/grants/projects";
import { exportProposal } from "@/lib/grants/export";
import { validateCitations, readiness } from "@/lib/grants/document";
import { readJson } from "@/lib/request-body";
import { jsonValue } from "@/lib/record-store";
import { RequestError } from "@/lib/record-policy";
type Context = { params: Promise<{ id: string }> };
export const GET = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    { project, member } = await projectAccess(prisma, actor.id, id),
    packageId = request.nextUrl.searchParams.get("packageId"),
    format = z
      .enum(["pdf", "docx", "zip"])
      .parse(request.nextUrl.searchParams.get("format") ?? "pdf");
  let bytes: Uint8Array;
  if (packageId) {
    if (
      member.role === "CLIENT" &&
      !["FROZEN", "SUBMITTED", "AWARDED", "DECLINED"].includes(project.status)
    )
      throw new RequestError("No approved package is currently shared", 403);
    const bundle = await prisma.grantPackage.findFirst({
      where: { id: packageId, projectId: id },
    });
    if (!bundle) throw new RequestError("Package not found", 404);
    bytes = format === "zip" ? bundle.archive : bundle[format];
  } else {
    if (member.role === "CLIENT")
      throw new RequestError(
        "Client access is limited to frozen approved packages",
        403,
      );
    if (format === "zip")
      throw new RequestError(
        "Freeze a reviewed proposal to download a package archive",
        409,
      );
    bytes = (await exportProposal(await snapshot(prisma, id)))[format];
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type":
        format === "pdf"
          ? "application/pdf"
          : format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/zip",
      "Content-Disposition": `attachment; filename="proposal-${id}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
export const POST = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    input = freezeSchema.parse(await readJson(request)),
    { project } = await projectAccess(prisma, actor.id, id, managers);
  return mutation(
    actor.id,
    project.organizationId,
    request.headers.get("Idempotency-Key"),
    "package.freeze",
    { id, ...input },
    (tx) => freezePackage(tx, actor.id, id, input),
    managers,
  );
});
export const PATCH = endpoint<Context>(async (request, actor, context) => {
  const id = (await context.params).id,
    input = receiptSchema.parse(await readJson(request)),
    { project } = await projectAccess(prisma, actor.id, id, managers);
  return mutation(
    actor.id,
    project.organizationId,
    request.headers.get("Idempotency-Key"),
    "submission.record",
    { id, ...input },
    (tx) => recordSubmission(tx, actor.id, id, input),
    managers,
  );
});
