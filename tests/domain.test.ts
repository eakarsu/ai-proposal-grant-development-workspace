import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/lib/domain-engine";
import { canWrite, canDelete, validateRecord, validateAiInput, recordMetadata } from "../src/lib/record-policy";
import { canonicalEvidence, parseModelResult } from "../src/lib/ai-evidence";
import { readJson } from "../src/lib/request-body";
import { configuredConnectors } from "../src/lib/connectors";
import tools from "../src/config/domain-tools.json";

test("role permissions separate analyst, manager and administrator", () => {
  assert.equal(canWrite("ANALYST"), false); assert.equal(canWrite("MANAGER"), true); assert.equal(canDelete("MANAGER"), false); assert.equal(canDelete("ADMIN"), true); assert.equal(canWrite("unknown"), false);
});
test("every domain child exposes its real parent selector", () => { const children = Object.values(recordMetadata).filter(m => m.parent); assert.equal(children.length, 11); for (const m of children) assert(m.fields.some(f => f.name === m.parent?.field && f.relation === m.parent?.entity)); });
test("write validation rejects unknown fields, fabricated approval and invalid numbers", () => {
  const entity = Object.values(recordMetadata)[0];
  const valid = Object.fromEntries(entity.fields.map(f => [f.name, f.kind === "number" ? 1 : f.kind === "date" ? "2026-09-05" : f.kind === "boolean" ? false : "Draft"]));
  assert.throws(() => validateRecord(entity.name, { ...valid, unknownField: "bad" }), /Unknown field/);
  if (entity.fields.some(f => f.name === "status")) assert.throws(() => validateRecord(entity.name, { ...valid, status: "Approved" }), /review/);
  const numeric = entity.fields.find(f => f.kind === "number"); if (numeric) assert.throws(() => validateRecord(entity.name, { ...valid, [numeric.name]: "Infinity" }), /valid/);
});
test("AI rejects numeric input instead of crashing in fallback", () => { assert.throws(() => validateAiInput({ field: 3 }, ["field"]), /must be text/); });
test("complete source dates and long evidence are retained", () => {
  const record = { id: "r1", serviceDate: new Date("2026-08-01T12:00:00Z"), content: "a".repeat(500) + "critical ending" };
  const evidence = canonicalEvidence([{ entity: "Evidence", record }]);
  assert(evidence.text.includes("2026-08-01T12:00:00.000Z")); assert(evidence.text.includes("critical ending")); assert.equal(evidence.count, 1);
  assert.throws(() => canonicalEvidence([{ entity: "Evidence", record: { id: "r", text: "x".repeat(120001) } }]), /not be silently truncated/);
});
test("invalid model findings and invented citations are rejected", () => {
  const good = { status: "draft", summary: "Review recorded evidence", findings: ["A finding"], recommendations: [], citations: ["Entity:r1"], limitations: [] };
  assert.equal(parseModelResult(JSON.stringify(good), new Set(["Entity:r1"])).riskLevel, null);
  assert.throws(() => parseModelResult(JSON.stringify({ ...good, findings: [{}] }), new Set(["Entity:r1"])), /invalid findings/);
  assert.throws(() => parseModelResult(JSON.stringify(good), new Set()), /not supplied/);
  assert.throws(() => parseModelResult("I cannot perform this", new Set()), /structured/);
});
test("request bodies are bounded even without content-length", async () => {
  const request = new Request("http://localhost", { method: "POST", body: JSON.stringify({value:"a".repeat(1000)}) });
  await assert.rejects(readJson(request, 100), /upload limit/);
});
test("every enabled domain example runs through an implemented calculator", () => { for (const tool of tools) assert.equal(typeof runTool(tool.id, tool.example), "object", tool.id); });
test("VAMP includes fraud and applies threshold plus count gates", () => {
  const result = runTool("vamp", {fraud:1000,disputes:600,settled:100000,excludedFraud:0,excludedDisputes:0,region:"US",asOf:"2026-09-01"});
  assert.equal(result.basisPoints,160); assert.equal(result.merchantThresholdMet,true);
  assert.equal(runTool("vamp", {fraud:100,disputes:60,settled:1000,excludedFraud:0,excludedDisputes:0,region:"US",asOf:"2026-09-01"}).merchantThresholdMet,false);
  assert.throws(() => runTool("vamp", {fraud:1,disputes:1,settled:0,excludedFraud:0,excludedDisputes:0,region:"US",asOf:"2026-09-01"}));
});
test("cost allocation conserves integer cents and rejects unsupported methods", () => {
  const input={costCents:100,projects:[{project:"a",capacityMw:1},{project:"b",capacityMw:1},{project:"c",capacityMw:1}],method:"proportional-capacity"};
  const r=runTool("allocation",input); assert.equal(r.totalCents,100); assert.deepEqual(r.allocations,[{project:"a",cents:34},{project:"b",cents:33},{project:"c",cents:33}]);
  assert.throws(()=>runTool("allocation",{...input,method:"other"}),/supported/);
});
test("recovery respects attachment and limit and refuses unstated reinstatements", () => {
  assert.equal(runTool("treaty-recovery", {lossCents:150000,attachmentCents:50000,limitCents:80000,cessionPercent:50,reinstatement:"none"}).recoverableCents,40000);
  assert.throws(()=>runTool("treaty-recovery", {lossCents:150000,attachmentCents:50000,limitCents:80000,cessionPercent:50,reinstatement:"one"}),/specific treaty rule/);
});
test("ledger balancing never uses floating point currency", () => { assert.equal(runTool("reconcile",{currency:"USD",debits:[{cents:10},{cents:20}],credits:[{cents:30}]}).balanced,true); assert.throws(()=>runTool("reconcile",{currency:"USD",debits:[{cents:.1}],credits:[{cents:1}]}),/integer/); });
test("rubric aggregation and rater agreement have defined denominators", () => {
  assert.equal(runTool("weighted-score",{ratings:[{score:3,maximum:4,weight:1},{score:4,maximum:4,weight:1}],passPercent:80}).percentage,87.5);
  assert.equal(runTool("kappa",{pairs:[{raterA:"a",raterB:"a"},{raterA:"b",raterB:"b"}]}).kappa,1);
  assert.equal(runTool("kappa",{pairs:[{raterA:"a",raterB:"a"}]}).kappa,null);
});
test("due date detection excludes completed commitments", () => { const r=runTool("overdue",{asOf:"2026-09-05T12:00:00Z",commitments:[{id:"a",owner:"Alice",dueAt:"2026-09-04T00:00:00Z",status:"open"},{id:"b",owner:"Bob",dueAt:"2026-09-04T00:00:00Z",status:"completed"}]});assert.equal((r.overdue as unknown[]).length,1); });
test("connector config never accepts an HTTP or credential-bearing URL", () => {
  const prior=process.env.DOMAIN_CONNECTORS_JSON;
  try { process.env.DOMAIN_CONNECTORS_JSON=JSON.stringify([{id:"a",endpoint:"http://example.invalid",actions:[],schemaVersion:"1"}]);assert.throws(configuredConnectors,/HTTPS/); }
  finally { if(prior===undefined)delete process.env.DOMAIN_CONNECTORS_JSON;else process.env.DOMAIN_CONNECTORS_JSON=prior; }
});

test('domain dates reject ambiguous and impossible calendar dates', () => {
  for (const asOf of ['1','09/05/2026','2026-02-30']) assert.throws(() => runTool('overdue',{asOf,commitments:[{id:'one',owner:'manager',dueAt:'2026-09-01',status:'open'}]}), /ISO date/);
});
test('allocation preserves every cent at large values and ledger overflow fails', () => {
  const result=runTool('allocation',{method:'proportional-capacity',costCents:Number.MAX_SAFE_INTEGER,projects:[{project:'a',capacityMw:1},{project:'b',capacityMw:2},{project:'c',capacityMw:3}]});
  assert.equal(result.totalCents,Number.MAX_SAFE_INTEGER);
  assert.throws(()=>runTool('reconcile',{currency:'USD',debits:[{cents:Number.MAX_SAFE_INTEGER},{cents:1}],credits:[{cents:1}]}),/precision/);
});
