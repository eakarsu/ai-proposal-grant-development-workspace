import { readJson } from "@/lib/request-body";
import { NextRequest } from "next/server";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { runTool } from "@/lib/domain-engine";
import tools from "@/config/domain-tools.json";
import { errorResponse, jsonValue } from "@/lib/record-store";
import { objectBody, RequestError } from "@/lib/record-policy";
import { createHash } from "node:crypto";
export async function GET() { try { await authorize(); return Response.json({ tools }); } catch (e) { return errorResponse(e); } }
export async function POST(request: NextRequest) {
  try {
    const user = await authorize("write");
    const body = objectBody(await readJson(request));
    if (typeof body.tool !== "string" || !tools.some(t => t.id === body.tool)) throw new RequestError("Tool is not enabled for this application", 404);
    const input = objectBody(body.input);
    if (JSON.stringify(input).length > 1000000) throw new RequestError("Dataset exceeds one megabyte", 413);
    const result = { ...runTool(body.tool, input), datasetType: body.isExample === true ? "example" : "user-supplied" };
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const saved = await prisma.$transaction(async tx => {
      const item = await tx.workflowAnalysis.create({ data: { actorId: user.id, workflow: `tool:${body.tool}`, subjectEntity: "SubmittedDataset", subjectId: hash, input: jsonValue(input), evidence: [], evidenceHash: hash, result: jsonValue(result), model: "deterministic-v1" } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "DOMAIN_CALCULATION", entity: "WorkflowAnalysis", entityId: item.id, detail: JSON.stringify({ tool: body.tool, hash, method: "deterministic-v1" }) } });
      return item;
    });
    return Response.json({ id: saved.id, result, inputHash: hash, computedAt: saved.createdAt });
  } catch (error) { return errorResponse(error); }
}
