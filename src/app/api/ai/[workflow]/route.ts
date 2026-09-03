import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { entities, pages, workflows } from "@/config/app";
import { prisma } from "@/lib/prisma";
import { callOpenRouter, OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODEL } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

// Rows fed to the model per AI call. Default 3000, env AI_CONTEXT_ROWS up to 5000.
const CONTEXT_ROWS = Math.max(
  0,
  Math.min(5000, Number(process.env.AI_CONTEXT_ROWS ?? 3000) || 3000)
);
// Hard char cap so 3000-5000 rows stay inside model context (~30k tokens).
const CONTEXT_CHARS = Number(process.env.AI_CONTEXT_CHARS ?? 120000) || 120000;

interface AiResult {
  summary: string;
  findings: string[];
  recommendations: string[];
  riskLevel: "low" | "medium" | "high";
  model: string;
  contextRows?: number;
}

function compact(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return s.length > 120 ? s.slice(0, 117) + "..." : s.replace(/\s+/g, " ");
}

async function buildRowContext(entityNames: string[]): Promise<{ text: string; rows: number }> {
  const db = prisma as unknown as Record<
    string,
    {
      count: () => Promise<number>;
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    }
  >;
  const sections: string[] = [];
  let totalRows = 0;
  let chars = 0;
  for (const name of entityNames) {
    const delegate = name.charAt(0).toLowerCase() + name.slice(1);
    const client = db[delegate];
    if (!client) continue;
    let total = 0;
    let rows: Array<Record<string, unknown>> = [];
    try {
      total = await client.count();
      rows = CONTEXT_ROWS > 0
        ? await client.findMany({ orderBy: { createdAt: "desc" }, take: CONTEXT_ROWS })
        : [];
    } catch {
      continue;
    }
    totalRows += Math.min(total, rows.length);
    const lines = rows.map((r) =>
      Object.entries(r)
        .filter(([, v]) => v !== null && typeof v !== "object")
        .map(([k, v]) => `${k}=${compact(v)}`)
        .join(", ")
    );
    let section = `[${name} — ${total} total, showing ${rows.length}]\n${lines.join("\n")}`;
    if (chars + section.length > CONTEXT_CHARS) {
      section = section.slice(0, Math.max(0, CONTEXT_CHARS - chars)) + "\n…(truncated to fit context)";
    }
    sections.push(section);
    chars += section.length;
    if (chars >= CONTEXT_CHARS) break;
  }
  return { text: sections.join("\n\n"), rows: totalRows };
}

function fallbackResult(title: string, input: Record<string, string>): AiResult {
  const filled = Object.entries(input).filter(([, v]) => v.trim().length > 0);
  return {
    summary: `Deterministic local analysis for ${title}. ${filled.length} input field(s) captured. Configure OPENROUTER_API_KEY for live model output.`,
    findings: filled.map(
      ([key, value]) => `${key.replace(/([A-Z])/g, " $1")}: ${value}`
    ),
    recommendations: [
      "Review the submitted evidence against current domain policy.",
      "Escalate to a manager if exposure exceeds standing thresholds.",
      "Persist this analysis to the audit trail for review.",
    ],
    riskLevel: "medium",
    model: "local-fallback",
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflow: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workflow } = await context.params;
  const config = workflows.find((w) => w.slug === workflow);
  if (!config) {
    return NextResponse.json({ error: "Unknown workflow" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    input?: Record<string, string>;
    model?: string;
  };
  const input = body.input ?? {};
  const allowed = new Set(OPENROUTER_MODELS.map((m) => m.id));
  const model = body.model && allowed.has(body.model) ? body.model : DEFAULT_OPENROUTER_MODEL;

  const owner = pages.find((p) => p.workflows.includes(workflow));
  const contextEntities = owner ? owner.entities : Object.keys(entities);
  const snapshot = await buildRowContext(contextEntities);

  if (!process.env.OPENROUTER_API_KEY) {
    const fb = fallbackResult(config.title, input);
    return NextResponse.json({ result: { ...fb, contextRows: snapshot.rows } });
  }

  const prompt = [
    config.prompt,
    "",
    "Submitted inputs:",
    ...Object.entries(input).map(([key, value]) => `- ${key}: ${value}`),
    "",
    `Live database snapshot — ${snapshot.rows} rows across [${contextEntities.join(", ")}] (up to ${CONTEXT_ROWS} rows/table, truncated to fit context). Analyze real rows, cite record ids/values:`,
    snapshot.text || "(no rows yet)",
    "",
    'Respond only with JSON: {"summary": string, "findings": string[], "recommendations": string[], "riskLevel": "low"|"medium"|"high"}.',
  ].join("\n");

  try {
    const { content, model: usedModel } = await callOpenRouter(
      [
        {
          role: "system",
          content: `${config.title} — you are a domain specialist. Be concrete, cite thresholds and numbers when relevant.`,
        },
        { role: "user", content: prompt },
      ],
      { model }
    );
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!parsed || typeof parsed.summary !== "string") {
      throw new Error("Unparseable model output");
    }
    return NextResponse.json({
      result: {
        summary: parsed.summary,
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : [],
        riskLevel: ["low", "medium", "high"].includes(parsed.riskLevel)
          ? parsed.riskLevel
          : "medium",
        model: usedModel,
        contextRows: snapshot.rows,
      },
    });
  } catch {
    const fb = fallbackResult(config.title, input);
    return NextResponse.json({ result: { ...fb, contextRows: snapshot.rows } });
  }
}
