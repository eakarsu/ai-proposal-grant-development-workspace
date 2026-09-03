import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { entities } from "@/config/app";

export const dynamic = "force-dynamic";

function delegateFor(entity: string) {
  const config = entities[entity];
  if (!config) return null;
  const delegate = config.name.charAt(0).toLowerCase() + config.name.slice(1);
  const db = prisma as unknown as Record<
    string,
    {
      findMany: (args?: unknown) => Promise<unknown[]>;
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    }
  >;
  return db[delegate] ?? null;
}

function coerce(kind: string, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (kind === "number") return Number(value);
  if (kind === "boolean") return value === true || value === "true" || value === "on";
  if (kind === "date") return new Date(String(value));
  return String(value);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ entity: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { entity } = await context.params;
  const client = delegateFor(entity);
  if (!client) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }
  const rows = await client.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ rows });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ entity: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { entity } = await context.params;
  const config = entities[entity];
  const client = delegateFor(entity);
  if (!config || !client) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const data: Record<string, unknown> = {};
  for (const field of config.fields) {
    const value = coerce(field.kind, body[field.name]);
    if (value !== undefined) data[field.name] = value;
  }
  const row = await client.create({ data });
  await prisma.auditLog.create({
    data: {
      actorName: user.name ?? user.email,
      action: "CREATE",
      entity: config.name,
      detail: `Record created via ${config.label}`,
    },
  });
  return NextResponse.json({ row }, { status: 201 });
}
