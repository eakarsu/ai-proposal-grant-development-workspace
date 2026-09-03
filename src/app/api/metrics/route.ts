import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { entities } from "@/config/app";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = prisma as unknown as Record<
    string,
    { count: () => Promise<number> }
  >;
  const metrics: Array<{ label: string; count: number }> = [];
  for (const config of Object.values(entities)) {
    const delegate = config.name.charAt(0).toLowerCase() + config.name.slice(1);
    const client = db[delegate];
    if (!client) continue;
    const plural = /s$/i.test(config.label) ? config.label : config.label + "s";
    try {
      const count = await client.count();
      metrics.push({ label: plural, count });
    } catch {
      metrics.push({ label: plural, count: 0 });
    }
  }
  return NextResponse.json({ metrics });
}
