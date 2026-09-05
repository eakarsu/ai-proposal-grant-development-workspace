import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { entities } from "@/config/app";
import { records, errorResponse } from "@/lib/record-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await authorize();
    const metrics = await Promise.all(Object.values(entities).map(async entity => ({ label: `${entity.label} records`, count: await records(prisma, entity.name).count() })));
    return Response.json({ metrics, measuredAt: new Date().toISOString(), metricType: "record-counts" });
  } catch (error) { return errorResponse(error); }
}
