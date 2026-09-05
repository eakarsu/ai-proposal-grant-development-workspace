import { readJson } from "@/lib/request-body";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/api-auth";
import { recordMetadata, validateRecord, objectBody, RequestError } from "@/lib/record-policy";
import { records, validateRelations, errorResponse } from "@/lib/record-store";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ entity: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await authorize();
    const { entity } = await context.params;
    const client = records(prisma, entity);
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page") || 1);
    const pageSize = Number(params.get("pageSize") || 20);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new RequestError("Invalid page or page size", 400);
    const search = (params.get("q") || "").slice(0, 200);
    const searchFields = recordMetadata[entity].fields.filter(f => f.kind === "string");
    const where = search && searchFields.length ? { OR: searchFields.map(f => ({ [f.name]: { contains: search, mode: "insensitive" } })) } : {};
    const [rows, total] = await prisma.$transaction([
      // Dynamic delegates remain Prisma promises at runtime.
      client.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }) as Prisma.PrismaPromise<unknown>,
      client.count({ where }) as Prisma.PrismaPromise<unknown>,
    ]);
    return Response.json({ rows, total, page, pageSize });
  } catch (error) { return errorResponse(error); }
}

async function mutate(request: NextRequest, context: Context, method: "create" | "update" | "delete") {
  try {
    const user = await authorize(method === "delete" ? "delete" : "write");
    const { entity } = await context.params;
    const body = objectBody(await readJson(request));
    const id = body.id;
    if (method !== "create" && (typeof id !== "string" || !id)) throw new RequestError("Record id is required", 400);
    const row = await prisma.$transaction(async tx => {
      const client = records(tx, entity);
      const before = method === "create" ? null : await client.findUnique({ where: { id } });
      if (method !== "create" && !before) throw new RequestError("Record not found", 404);
      if (before && (!body.updatedAt || new Date(String(body.updatedAt)).getTime() !== (before.updatedAt instanceof Date ? before.updatedAt.getTime() : new Date(String(before.updatedAt)).getTime()))) throw new RequestError("This record has changed. Reload before saving or deleting.", 409);
      if (method === "delete") {
        for (const child of Object.values(recordMetadata).filter(m => m.parent?.entity === entity)) {
          if (await records(tx, child.name).count({ where: { [child.parent!.field]: id } })) throw new RequestError("Reassign dependent records before deleting their parent", 409);
        }
      }
      const data = method === "delete" ? {} : validateRecord(entity, body, before ?? undefined);
      await validateRelations(tx, entity, { ...before, ...data });
      // An approved record becomes a draft whenever its contents change.
      if (method === "update" && before?.status === "Approved") data.status = "Draft";
      const after = method === "create" ? await client.create({ data }) : method === "update" ? await client.update({ where: { id }, data }) : await client.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: method.toUpperCase(), entity, entityId: after.id, detail: JSON.stringify({ before, after: method === "delete" ? null : after }) } });
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ row }, { status: method === "create" ? 201 : 200 });
  } catch (error) { return errorResponse(error); }
}
export const POST = (request: NextRequest, context: Context) => mutate(request, context, "create");
export const PUT = (request: NextRequest, context: Context) => mutate(request, context, "update");
export const DELETE = (request: NextRequest, context: Context) => mutate(request, context, "delete");
