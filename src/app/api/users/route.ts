import { NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { objectBody, RequestError } from "@/lib/record-policy";
import { errorResponse } from "@/lib/record-store";
import { readJson } from "@/lib/request-body";
const fields = { id: true, name: true, email: true, role: true, active: true } as const;
async function admin() { const user = await authorize(); if (user.role !== "ADMIN") throw new RequestError("Administrator access required", 403); return user; }
export async function GET() { try { await admin(); return Response.json({ users: await prisma.user.findMany({ where:{id:{in:(await prisma.grantMembership.findMany({where:{organizationId:"legacy"},select:{userId:true}})).map(m=>m.userId)}},select: fields, orderBy: { email: "asc" } }) }); } catch (e) { return errorResponse(e); } }
async function mutate(request: NextRequest, create: boolean) {
  try {
    const actor = await admin(); const body = objectBody(await readJson(request));
    const role = body.role as Role; if (!["ADMIN", "MANAGER", "ANALYST"].includes(role)) throw new RequestError("Choose a valid role");
    if (typeof body.active !== "boolean") throw new RequestError("Account active state must be true or false");
    let passwordHash: string | undefined;
    if (create || body.password) { if (typeof body.password !== "string" || body.password.length < 16 || Buffer.byteLength(body.password, "utf8") > 72) throw new RequestError("Password must be at least 16 characters and at most 72 UTF-8 bytes"); passwordHash = await bcrypt.hash(body.password, 12); }
    if (create && (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || typeof body.name !== "string" || !body.name.trim())) throw new RequestError("Name and valid email required");
    const user = await prisma.$transaction(async tx => {
      const before = create ? null : await tx.user.findUnique({ where: { id: String(body.id) }, select: fields });
      if (before && !await tx.grantMembership.findUnique({where:{organizationId_userId:{organizationId:"legacy",userId:before.id}}})) throw new RequestError("This account is not in the original workspace",403);
      if (!create && !before) throw new RequestError("Account not found", 404);
      if (before?.role === "ADMIN" && before.active && (role !== "ADMIN" || body.active === false) && await tx.user.count({ where: { role: "ADMIN", active: true } }) <= 1) throw new RequestError("Keep at least one active administrator", 409);
      const after = create ? await tx.user.create({ data: { name: String(body.name).trim(), email: String(body.email).trim().toLowerCase(), role, active: body.active as boolean, passwordHash: passwordHash! }, select: fields }) : await tx.user.update({ where: { id: before!.id }, data: { role, active: body.active as boolean, authVersion:{increment:1}, ...(passwordHash ? { passwordHash } : {}) }, select: fields });
      if(create)await tx.grantMembership.create({data:{organizationId:"legacy",userId:after.id,role:after.role==="ADMIN"?"OWNER":after.role==="MANAGER"?"MANAGER":"EDITOR"}});
      await tx.auditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: create ? "ACCOUNT_CREATED" : "ACCOUNT_UPDATED", entity: "User", entityId: after.id, detail: JSON.stringify({ before, after, passwordChanged: Boolean(passwordHash) }) } });
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ user }, { status: create ? 201 : 200 });
  } catch (e) { return errorResponse(e); }
}
export const POST = (request: NextRequest) => mutate(request, true);
export const PUT = (request: NextRequest) => mutate(request, false);
