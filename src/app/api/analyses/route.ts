import { NextRequest } from "next/server";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/record-store";
export async function GET(request: NextRequest) {
  try {
    await authorize();
    const workflow = request.nextUrl.searchParams.get("workflow") || undefined;
    const items = await prisma.workflowAnalysis.findMany({ where: { workflow }, orderBy: { createdAt: "desc" }, take: 100 });
    return Response.json({ items });
  } catch (error) { return errorResponse(error); }
}
