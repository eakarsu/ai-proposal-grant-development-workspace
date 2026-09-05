import { createHash } from "node:crypto";
import { RequestError, objectBody, recordMetadata } from "./record-policy";
import { records, type Row } from "./record-store";

export function canonicalEvidence(rows: { entity: string; record: Row }[]) {
  // JSON serialization retains complete strings, nested values and ISO Date values.
  const text = JSON.stringify(rows);
  if (text.length > 120000) throw new RequestError("Selected evidence exceeds 120,000 characters. Select fewer records; evidence will not be silently truncated.", 413);
  return { text, count: rows.length, hash: createHash("sha256").update(text).digest("hex") };
}
export async function loadEvidence(db: unknown, scopeValue: unknown, selected: unknown) {
  const scope = objectBody(scopeValue);
  if (typeof scope.entity !== "string" || typeof scope.id !== "string") throw new RequestError("Select a subject record for this analysis");
  const subject = await records(db, scope.entity).findUnique({ where: { id: scope.id } });
  if (!subject) throw new RequestError("Selected subject does not exist", 404);
  const selections = selected === undefined ? [] : selected;
  if (!Array.isArray(selections) || selections.length > 100) throw new RequestError("Select at most 100 evidence records");
  const parent = recordMetadata[scope.entity].parent;
  const rootEntity = parent?.entity ?? scope.entity;
  const rootId = parent ? subject[parent.field] : subject.id;
  if (!rootId) throw new RequestError("Associate the subject with its parent before analysis");
  const rows: { entity: string; record: Row }[] = [{ entity: scope.entity, record: subject }];
  const seen = new Set([`${scope.entity}:${scope.id}`]);
  for (const entry of selections) {
    const item = objectBody(entry);
    if (typeof item.entity !== "string" || typeof item.id !== "string") throw new RequestError("Invalid evidence selection");
    const key = `${item.entity}:${item.id}`;
    if (seen.has(key)) continue;
    const meta = recordMetadata[item.entity];
    if (!meta) throw new RequestError("Unknown evidence entity");
    const record = await records(db, item.entity).findUnique({ where: { id: item.id } });
    if (!record) throw new RequestError("An evidence record was removed; select it again", 409);
    const related = item.entity === rootEntity ? record.id === rootId : meta.parent?.entity === rootEntity && record[meta.parent.field] === rootId;
    if (!related) throw new RequestError("Evidence must belong to the selected subject's parent", 422);
    // Free-text person/case references must agree where both records define them.
    for (const ref of ["memberRef", "studentRef", "learnerRef", "candidate", "caseId", "fileNumber", "employeeRef"]) {
      if (subject[ref] && record[ref] && subject[ref] !== record[ref]) throw new RequestError(`Evidence has a different ${ref}`);
    }
    for (const field of recordMetadata[scope.entity].fields.filter(f => f.relation === item.entity)) if (subject[field.name] !== record.id) throw new RequestError("Evidence belongs to a different linked subject");
    for (const field of meta.fields.filter(f => f.relation)) {
      if (field.relation === scope.entity && record[field.name] !== subject.id) throw new RequestError("Evidence belongs to a different subject");
      if (recordMetadata[scope.entity].fields.some(f => f.name === field.name && f.relation === field.relation) && subject[field.name] && record[field.name] && subject[field.name] !== record[field.name]) throw new RequestError("Evidence belongs to a different linked subject");
    }
    rows.push({ entity: item.entity, record });
    seen.add(key);
  }
  return { rows, scope: { entity: scope.entity, id: scope.id }, ...canonicalEvidence(rows) };
}

export function parseModelResult(content: string, validIds: Set<string>) {
  let parsed: Record<string, unknown>;
  try { parsed = objectBody(JSON.parse(content)); } catch { throw new RequestError("The AI provider did not return a valid structured analysis", 502); }
  if (typeof parsed.summary !== "string" || !parsed.summary.trim() || parsed.summary.length > 20000) throw new RequestError("The AI provider returned an invalid summary", 502);
  for (const field of ["findings", "recommendations", "citations", "limitations"]) {
    if (!Array.isArray(parsed[field]) || parsed[field].length > 100 || !parsed[field].every((x: unknown) => typeof x === "string" && x.trim().length > 0 && x.length <= 20000)) throw new RequestError(`The AI provider returned invalid ${field}`, 502);
  }
  const citations = parsed.citations as string[];
  if (citations.some(id => !validIds.has(id))) throw new RequestError("The AI provider cited evidence that was not supplied", 502);
  if (!citations.length) throw new RequestError("The AI provider returned no evidence citations", 502);
  if (parsed.status !== "draft" || /(?:cannot|unable to) (?:perform|provide|analy[sz]e)/i.test(parsed.summary)) throw new RequestError("The AI provider could not complete this analysis", 502);
  return { summary: parsed.summary, findings: parsed.findings as string[], recommendations: parsed.recommendations as string[], citations, limitations: parsed.limitations as string[], status: "draft" as const, riskLevel: null, confidence: null };
}
