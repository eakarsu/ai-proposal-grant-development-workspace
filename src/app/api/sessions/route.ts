import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { objectBody, canWrite, RequestError, recordMetadata } from "@/lib/record-policy";
import { records, jsonValue, errorResponse } from "@/lib/record-store";
import { readJson } from "@/lib/request-body";
type Question = { id: string; prompt: string; maximum: number; difficulty: number };
type Answer = { questionId: string; text: string; submittedAt: string; score?: number; reviewedBy?: string; rationale?: string };
function enabled() { if (!["Simulation", "RecordedSimulation", "ExamSession", "Assignment"].some(e => recordMetadata[e])) throw new RequestError("Work sessions are not enabled for this application", 404); }
export async function GET() {
  try { enabled(); const user = await authorize(); const items = await prisma.workSession.findMany({ where: canWrite(user.role) ? {} : { respondentId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return Response.json({ items: items.map(s => ({ ...s, expired: new Date() >= s.deadline })) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: NextRequest) {
  try {
    enabled(); const user = await authorize(); const body = objectBody(await readJson(request));
    const item = await prisma.$transaction(async tx => {
      if (body.action === "start") {
        if (!canWrite(user.role)) throw new RequestError("A manager must assign a session", 403);
        if (typeof body.subjectEntity !== "string" || !["Simulation", "RecordedSimulation", "ExamSession", "Assignment"].includes(body.subjectEntity) || typeof body.subjectId !== "string") throw new RequestError("Select an assessment or assignment record");
        const subject = await records(tx, body.subjectEntity).findUnique({ where: { id: body.subjectId } }); if (!subject) throw new RequestError("Assessment record not found", 404);
        const parent = recordMetadata[body.subjectEntity].parent; if (parent && !subject[parent.field]) throw new RequestError("Associate the assessment with its parent first");
        const assigned = typeof body.respondentEmail === "string" && body.respondentEmail.trim() ? await tx.user.findUnique({where:{email:body.respondentEmail.trim().toLowerCase()}}) : user;
        if (!assigned) throw new RequestError("Respondent account not found");
        const respondentId = assigned.id;
        if (!await tx.user.findUnique({ where: { id: respondentId } })) throw new RequestError("Respondent account not found");
        const minutes = Number(body.minutes); if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new RequestError("Duration must be 1–180 minutes");
        if (!Array.isArray(body.questions) || !body.questions.length || body.questions.length > 50) throw new RequestError("Provide 1–50 questions or tasks");
        const questions: Question[] = body.questions.map((q, i) => { const v = objectBody(q); if (typeof v.prompt !== "string" || !v.prompt.trim() || v.prompt.length > 10000 || !Number.isFinite(Number(v.maximum)) || Number(v.maximum) <= 0 || !Number.isInteger(Number(v.difficulty)) || Number(v.difficulty) < 1 || Number(v.difficulty) > 5) throw new RequestError("Each question needs a prompt, positive maximum score and difficulty 1–5"); return { id: String(i + 1), prompt: v.prompt, maximum: Number(v.maximum), difficulty: Number(v.difficulty) }; });
        const session = await tx.workSession.create({ data: { actorId: user.id, respondentId, subjectEntity: body.subjectEntity, subjectId: body.subjectId, deadline: new Date(Date.now() + minutes * 60000), questions: jsonValue(questions), answers: [], currentQuestion: questions[0].id, status: "active" } });
        await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: "SESSION_ASSIGNED", entity: "WorkSession", entityId: session.id, detail: JSON.stringify({ respondentId, deadline: session.deadline, questions }) } });
        return session;
      }
      if (typeof body.id !== "string") throw new RequestError("Session id required");
      const session = await tx.workSession.findUnique({ where: { id: body.id } }); if (!session) throw new RequestError("Session not found", 404);
      const questions = session.questions as unknown as Question[]; const answers = session.answers as unknown as Answer[];
      const question = questions.find(q => q.id === session.currentQuestion);
      if (!question || session.status === "completed") throw new RequestError("Session is complete", 409);
      let nextQuestion = session.currentQuestion; let status = session.status;
      if (body.action === "respond") {
        if (session.respondentId !== user.id) throw new RequestError("Only the assigned respondent can answer", 403);
        if (new Date() >= session.deadline) throw new RequestError("The session deadline has passed", 409);
        if (answers.some(a => a.questionId === question.id)) throw new RequestError("Await independent review before proceeding", 409);
        if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 50000) throw new RequestError("Provide a response of 1–50,000 characters");
        answers.push({ questionId: question.id, text: body.text, submittedAt: new Date().toISOString() }); status = "awaiting_review";
      } else if (body.action === "review") {
        if (!canWrite(user.role) || session.respondentId === user.id) throw new RequestError("A different manager must review the response", 403);
        const answer = answers.find(a => a.questionId === question.id); if (!answer || answer.reviewedBy) throw new RequestError("No response awaiting review", 409);
        const score = Number(body.score); if (body.score === "" || !Number.isFinite(score) || score < 0 || score > question.maximum || typeof body.rationale !== "string" || body.rationale.trim().length < 20) throw new RequestError("Provide a score within the question maximum and an evidence-based rationale");
        Object.assign(answer, { score, reviewedBy: user.id, rationale: body.rationale });
        const target = Math.max(1, Math.min(5, question.difficulty + (score / question.maximum >= .8 ? 1 : score / question.maximum < .5 ? -1 : 0)));
        const remaining = questions.filter(q => !answers.some(a => a.questionId === q.id)).sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target));
        if (new Date() >= session.deadline || !remaining.length) { status = "completed"; nextQuestion = null; } else { nextQuestion = remaining[0].id; status = "active"; }
      } else throw new RequestError("Unknown session action");
      const updated = await tx.workSession.update({ where: { id: session.id }, data: { answers: jsonValue(answers), status, currentQuestion: nextQuestion } });
      await tx.auditLog.create({ data: { actorId: user.id, actorName: user.name, action: body.action === "respond" ? "SESSION_RESPONSE" : "SESSION_RESPONSE_REVIEW", entity: "WorkSession", entityId: session.id, detail: JSON.stringify({ question: question.id, answers, status, method: "Difficulty sequencing from independent human score; no authorship probability" }) } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ item });
  } catch (e) { return errorResponse(e); }
}
