import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { records, jsonValue, errorResponse } from "@/lib/record-store";
import { configuredConnectors, connectorRequest } from "@/lib/connectors";
import { objectBody, RequestError } from "@/lib/record-policy";
import { readJson } from "@/lib/request-body";
export async function GET() {
  try { await authorize(); return Response.json({ connectors: configuredConnectors().map(c => ({ id: c.id, label: c.label, actions: c.actions, schemaVersion: c.schemaVersion })) }); }
  catch (e) { return errorResponse(e); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await authorize("write"); const body = objectBody(await readJson(request)); const connector = configuredConnectors().find(c => c.id === body.connectorId);
    if (!connector) throw new RequestError("Connector is not configured. No external action was performed.", 503);
    if (body.action === "test") {
      const result = await connectorRequest(connector, "health");
      await prisma.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "CONNECTOR_HEALTH_CHECK", entity: "Connector", entityId: connector.id, detail: JSON.stringify({ checkedAt: new Date().toISOString(), schemaVersion: result.schemaVersion, status: result.status }) } });
      return Response.json({ status: "reachable", schemaVersion: result.schemaVersion, scope: "Connection and response contract checked; no domain records validated" });
    }
    if (typeof body.action !== "string" || !connector.actions.includes(body.action) || typeof body.entity !== "string" || typeof body.id !== "string") throw new RequestError("Select an allowed action and approved source record");
    const record = await records(prisma, body.entity).findUnique({ where: { id: body.id } }); if (!record) throw new RequestError("Record not found", 404);
    const hash = createHash("sha256").update(JSON.stringify(record)).digest("hex");
    const approval = await prisma.recordApproval.findUnique({ where: { id: `${body.entity}:${body.id}` } });
    if (approval?.version !== hash) throw new RequestError("Two independent reviews of the current record are required before external execution", 409);
    const id = createHash("sha256").update(JSON.stringify([connector.id, body.action, body.entity, body.id, hash])).digest("hex");
    const prior = await prisma.domainExecution.findUnique({ where: { id } });
    if (prior) return Response.json({ id, status: prior.status, result: prior.result, message: prior.status === "completed" ? "Existing completion receipt" : "Execution outcome requires reconciliation with the connector; it will not be repeated automatically" }, { status: prior.status === "completed" ? 200 : 409 });
    await prisma.domainExecution.create({ data: { id, actorId: user.id, connectorId: connector.id, action: body.action, subjectEntity: body.entity, subjectId: body.id, version: hash, status: "pending" } });
    try {
      const result = await connectorRequest(connector, "execute", { action: body.action, entity: body.entity, record, recordHash: hash, approvalId: approval.id, idempotencyKey: id }, id);
      await prisma.$transaction(async tx => {
        await tx.domainExecution.update({ where: { id }, data: { status: "completed", result: jsonValue(result) } });
        await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "CONNECTOR_RECEIPT", entity: "DomainExecution", entityId: id, detail: JSON.stringify({ connector: connector.id, receiptId: result.receiptId, recordHash: hash }) } });
      });
      return Response.json({ id, status: "completed", result });
    } catch {
      await prisma.domainExecution.update({ where: { id }, data: { status: "uncertain" } });
      throw new RequestError("No verified completion receipt was stored. Reconcile this execution with the connector before retrying.", 502);
    }
  } catch (e) { return errorResponse(e); }
}
