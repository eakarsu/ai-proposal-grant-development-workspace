import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { workflows } from "@/config/app";
import { callOpenRouter, OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODEL } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

interface AiResult {
  summary: string;
  findings: string[];
  recommendations: string[];
  riskLevel: "low" | "medium" | "high";
  model: string;
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

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ result: fallbackResult(config.title, input) });
  }

  const prompt = [
    config.prompt,
    "",
    "Submitted inputs:",
    ...Object.entries(input).map(([key, value]) => `- ${key}: ${value}`),
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
      },
    });
  } catch {
    return NextResponse.json({ result: fallbackResult(config.title, input) });
  }
}
