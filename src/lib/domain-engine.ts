import { objectBody, RequestError } from "./record-policy";
type Data = Record<string, unknown>;
function n(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new RequestError(`${name} is required and must be numeric`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new RequestError(`${name} must be between ${min} and ${max}`);
  return result;
}
function integer(value: unknown, name: string, min = 0) { const x = n(value, name, min); if (!Number.isSafeInteger(x)) throw new RequestError(`${name} must be an integer`); return x; }
function rows(value: unknown, name: string): Data[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000) throw new RequestError(`${name} must contain 1–10,000 rows`);
  return value.map(objectBody);
}
function text(value: unknown, name: string) { if (typeof value !== "string" || !value.trim()) throw new RequestError(`${name} is required`); return value.trim(); }
function date(value: unknown, name: string) { const s = text(value, name); const d = new Date(s); if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== s.slice(0,10)) throw new RequestError(`${name} must be an ISO date`); return d; }
const safe = (value: number) => { if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new RequestError("Calculation exceeds supported numeric precision"); return value; };
const sum = (values: number[]) => values.reduce((a, b) => safe(a + b), 0);
const round = (value: number) => safe(Math.round((safe(value) + Number.EPSILON) * 10000) / 10000);

export function runTool(tool: string, raw: unknown): Data {
  const d = objectBody(raw);
  switch (tool) {
    case "vamp": {
      const fraud = integer(d.fraud, "Fraud reports"); const disputes = integer(d.disputes, "Disputes"); const settled = integer(d.settled, "Settled transactions", 1);
      const excludedFraud = integer(d.excludedFraud, "Excluded fraud"); const excludedDisputes = integer(d.excludedDisputes, "Excluded disputes");
      if (excludedFraud > fraud || excludedDisputes > disputes) throw new RequestError("Exclusions cannot exceed reported counts");
      const region = text(d.region, "Region").toUpperCase(); const asOf = date(d.asOf, "As-of date");
      if (!["AP", "CANADA", "EU", "US", "LAC", "CEMEA"].includes(region)) throw new RequestError("No verified rule set is configured for this region");
      if (asOf < new Date("2025-06-01") || asOf > new Date("2026-12-31")) throw new RequestError("Date falls outside the supported rule version; refresh the Visa rules before assessment");
      const eligible = sum([fraud - excludedFraud, disputes - excludedDisputes]);
      const bps = eligible / settled * 10000;
      const threshold = region === "LAC" ? 150 : region === "CEMEA" || asOf < new Date("2026-04-01") ? 220 : 150;
      const countGate = region === "CEMEA" ? 150 : 1500;
      const amountGate = region !== "CEMEA" || n(d.fraudDisputeAmountUsd, "Fraud and dispute amount") >= 75000;
      return { eligibleCount: eligible, basisPoints: round(bps), merchantThresholdBasisPoints: threshold, minimumCount: countGate, merchantThresholdMet: bps >= threshold && eligible >= countGate && amountGate, method: "Eligible (TC40 + TC15) / settled TC05 × 10,000", ruleVersion: "Visa VAMP fact sheet 2025 v2; merchant screening", limitations: ["Counts must be eligible card-not-present Visa transactions for the same month. Exclusions require source evidence.", "This is merchant screening, not an acquirer portfolio determination or forecast."] };
    }
    case "reconcile": {
      const debits = rows(d.debits, "Debits"); const credits = rows(d.credits, "Credits");
      const debitCents = sum(debits.map(r => integer(r.cents, "Debit cents")));
      const creditCents = sum(credits.map(r => integer(r.cents, "Credit cents")));
      const currency = text(d.currency, "Currency");
      if ([...debits, ...credits].some(r => r.currency && r.currency !== currency)) throw new RequestError("Reconcile one currency at a time");
      return { debitCents, creditCents, differenceCents: debitCents - creditCents, balanced: debitCents === creditCents, currency, method: "Integer minor-unit ledger reconciliation; no posting performed" };
    }
    case "allocation": {
      const cost = integer(d.costCents, "Upgrade cost cents"); const projects = rows(d.projects, "Projects");
      const capacities = projects.map(p => {
        const value=n(p.capacityMw, "Capacity MW", 0.000001, 1000000000); const units=value*1000000;
        if (Math.abs(units-Math.round(units)) > 0.000001) throw new RequestError("Capacity supports at most six decimal places in MW");
        return BigInt(Math.round(units));
      });
      const total=capacities.reduce((a,b)=>a+b,BigInt(0)); const products=capacities.map(capacity=>BigInt(cost)*capacity);
      const cents=products.map(product=>Number(product/total)); const remainder=cost-sum(cents);
      const order=products.map((value,index)=>({index,remainder:value%total})).sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
      for (let i=0;i<remainder;i++) cents[order[i].index]++;
      if (d.method !== "proportional-capacity") throw new RequestError("Only proportional-capacity scenario allocation is supported; tariff compliance requires a configured rule set");
      return { allocations: projects.map((p, i) => ({ project: text(p.project, "Project"), cents: cents[i] })), totalCents: sum(cents), method: "Largest-remainder allocation by MW; scenario only, not a tariff compliance determination" };
    }
    case "statistics": {
      if (!Array.isArray(d.values) || !d.values.length || d.values.length > 10000) throw new RequestError("Supply 1–10,000 observed values");
      const values = d.values.map(x => n(x, "Observed value")).sort((a, b) => a - b);
      const percentile = (p: number) => { const i = (values.length - 1) * p; const lo = Math.floor(i); return values[lo] + (values[Math.ceil(i)] - values[lo]) * (i - lo); };
      return { count: values.length, p10: round(percentile(.1)), median: round(percentile(.5)), p90: round(percentile(.9)), method: "Linear interpolation, R-7; source claims/compliance not validated" };
    }
    case "treaty-recovery": {
      const loss = integer(d.lossCents, "Loss cents"); const attachment = integer(d.attachmentCents, "Attachment cents"); const limit = integer(d.limitCents, "Limit cents");
      const cession = n(d.cessionPercent, "Cession percent", 0, 100);
      if (d.reinstatement !== "none") throw new RequestError("Reinstatement provisions need a specific treaty rule; this calculator only supports a single layer with no reinstatement");
      return { recoverableCents: Math.round(Math.min(Math.max(loss - attachment, 0), limit) * cession / 100), method: "min(max(loss − attachment, 0), layer limit) × cession; rounded to minor unit", limitations: ["Single-loss single-layer calculation. Aggregate limits, expenses and other treaty wording require separate validation."] };
    }
    case "collateral": { const required = integer(d.requiredCents, "Required collateral cents"); const held = integer(d.heldCents, "Eligible collateral cents"); return { shortfallCents: Math.max(0, required - held), surplusCents: Math.max(0, held - required), sufficientUnderInputs: held >= required, limitations: ["Eligibility and statutory requirements must be independently established."] }; }
    case "weighted-score": {
      const ratings = rows(d.ratings, "Rubric ratings");
      const weights = ratings.map(r => n(r.weight, "Weight", Number.MIN_VALUE));
      const scores = ratings.map(r => { const max = n(r.maximum, "Rubric maximum", Number.MIN_VALUE); return n(r.score, "Score", 0, max) / max; });
      const percentage = sum(scores.map((v, i) => v * weights[i])) / sum(weights) * 100;
      const threshold = n(d.passPercent, "Pass percent", 0, 100);
      return { percentage: round(percentage), threshold, meetsThreshold: percentage >= threshold, method: "Weighted normalized human ratings; no AI confidence or authorship inference" };
    }
    case "kappa": {
      const ratings = rows(d.pairs, "Paired independent ratings");
      const categories = new Set<string>(); const a = new Map<string, number>(); const b = new Map<string, number>(); let agreement = 0;
      for (const r of ratings) { const x = text(r.raterA, "Rater A category"); const y = text(r.raterB, "Rater B category"); categories.add(x); categories.add(y); a.set(x, (a.get(x) || 0) + 1); b.set(y, (b.get(y) || 0) + 1); if (x === y) agreement++; }
      const observed = agreement / ratings.length; const expected = sum([...categories].map(c => (a.get(c) || 0) * (b.get(c) || 0))) / ratings.length ** 2;
      return { pairs: ratings.length, observedAgreement: round(observed), expectedAgreement: round(expected), kappa: expected === 1 ? null : round((observed - expected) / (1 - expected)), method: "Unweighted Cohen's kappa on independent category ratings", limitations: expected === 1 ? ["Kappa undefined when all ratings are the same category."] : ["Agreement is not proof of accuracy or validity."] };
    }
    case "workforce-scenario": {
      const headcount = integer(d.headcount, "Current headcount"); const years = integer(d.years, "Years", 1); if (years > 10) throw new RequestError("Horizon must be at most ten years");
      const attrition = n(d.annualAttritionPercent, "Annual attrition percent", 0, 100) / 100; const salary = integer(d.annualCostCents, "Annual cost per employee cents");
      const redeploy = integer(d.redeployCount, "Redeploy count"); if (redeploy > headcount) throw new RequestError("Redeployment exceeds headcount");
      const training = integer(d.trainingCents, "Training cost per employee cents"); const severance = integer(d.severanceCents, "Severance per employee cents");
      const retained = Math.round(headcount * (1 - attrition) ** years);
      return { retainedUnderAttrition: retained, endAnnualCostCents: safe(retained * salary), redeployCostCents: safe(redeploy * training), layoffCostCents: safe(redeploy * severance), oneTimeCostDifferenceCents: safe(redeploy * (training - severance)), assumptions: "Constant attrition, constant annual employee cost, no new hiring. Redeploy/layoff comparison excludes productivity effects; scenario, not prediction." };
    }
    case "task-exposure": {
      const tasks = rows(d.tasks, "Task inventory"); const hours = tasks.map(t => n(t.hours, "Task hours")); const total = sum(hours); if (!total) throw new RequestError("Total task hours must exceed zero");
      const categories = ["automate", "ai-assisted", "human-only"];
      for (const task of tasks) if (!categories.includes(String(task.classification))) throw new RequestError("Task classification must be automate, ai-assisted or human-only");
      return { totalHours: total, distribution: categories.map(category => ({ category, percent: round(sum(tasks.map((t, i) => t.classification === category ? hours[i] : 0)) / total * 100) })), method: "Hour-weighted declared classifications; not a displacement probability" };
    }
    case "delivery": {
      const items = rows(d.items, "Delivered items"); const periodDays = n(d.periodDays, "Period days", Number.MIN_VALUE);
      const ids = new Set(); for (const item of items) { const id = text(item.id, "Item id"); if (ids.has(id)) throw new RequestError("Duplicate delivery item"); ids.add(id); }
      const cycleHours = items.map(item => { const start = date(item.startedAt, "Start"); const end = date(item.deliveredAt, "Delivery"); if (end < start) throw new RequestError("Delivery cannot precede start"); return (end.getTime() - start.getTime()) / 3600000; });
      const reworkHours = sum(items.map(item => n(item.reworkHours, "Rework hours")));
      return { deliveredItems: items.length, itemsPerDay: round(items.length / periodDays), meanCycleHours: round(sum(cycleHours) / cycleHours.length), reworkHours, method: "Measured delivery timestamps and declared rework; does not establish that AI caused a change" };
    }
    case "token-cost": {
      const sessions = rows(d.sessions, "Agent sessions");
      const costs = sessions.map(s => { const input = integer(s.inputTokens, "Input tokens"); const output = integer(s.outputTokens, "Output tokens"); return { session: text(s.id, "Session id"), usd: round(input * n(s.inputUsdPerMillion, "Input price") / 1e6 + output * n(s.outputUsdPerMillion, "Output price") / 1e6), mergedOutput: s.mergedOutput === true }; });
      return { costs, totalUsd: round(sum(costs.map(s => s.usd))), sessionsWithoutMergedOutput: costs.filter(s => !s.mergedOutput).map(s => s.session), assumptions: "Prices are supplied by the caller; cache discounts and non-token fees excluded. No merged output alone is not proof of waste." };
    }
    case "overdue": {
      const asOf = date(d.asOf, "As-of timestamp"); const commitments = rows(d.commitments, "Commitments");
      return { asOf: asOf.toISOString(), overdue: commitments.filter(c => c.status !== "completed" && date(c.dueAt, "Due date") < asOf).map(c => ({ id: text(c.id, "Commitment id"), owner: text(c.owner, "Owner"), dueAt: c.dueAt })), method: "Explicit due-date comparison; no messages were sent" };
    }
    case "heatmap": {
      const observations = rows(d.observations, "Observations"); const cells = new Map<string, { student: string; metric: string; values: number[] }>();
      for (const o of observations) { const student = text(o.student, "Student"); const metric = text(o.metric, "Metric"); const key = JSON.stringify([student, metric]); const cell = cells.get(key) || { student, metric, values: [] }; cell.values.push(n(o.value, "Value", 0, 100)); cells.set(key, cell); }
      return { cells: [...cells.values()].map(c => ({ student: c.student, metric: c.metric, mean: round(sum(c.values) / c.values.length), observations: c.values.length })), scale: "0–100, averaging observations within each student/metric cell" };
    }
    case "outcomes": {
      return { changes: rows(d.outcomes, "Intervention outcomes").map(o => ({ student: text(o.student, "Student"), intervention: text(o.interventionId, "Intervention id"), metric: text(o.metric, "Metric"), change: round(n(o.after, "After", -1e9) - n(o.before, "Before", -1e9)) })), limitations: ["Observed change does not establish intervention causality."] };
    }
    case "vacancy-match": {
      if (!Array.isArray(d.skills) || !d.skills.length || !d.skills.every(s => typeof s === "string")) throw new RequestError("Supply employee skills");
      const skills = new Set(d.skills.map(s => String(s).trim().toLowerCase()));
      return { matches: rows(d.vacancies, "Vacancies").map(v => { if (!Array.isArray(v.requiredSkills) || !v.requiredSkills.length || !v.requiredSkills.every(s => typeof s === "string")) throw new RequestError("Each vacancy needs requiredSkills"); const required = [...new Set(v.requiredSkills.map(s => String(s).trim().toLowerCase()))]; const gaps = required.filter(s => !skills.has(s)); return { vacancy: text(v.id, "Vacancy id"), matchPercent: round((required.length - gaps.length) / required.length * 100), gapSkills: gaps }; }).sort((a, b) => b.matchPercent - a.matchPercent), method: "Exact normalized skill overlap; human review required for suitability" };
    }
    case "learning-plan": {
      const hours = n(d.hoursPerWeek, "Hours per week", Number.MIN_VALUE, 168); let elapsed = 0;
      return { milestones: rows(d.modules, "Modules in prerequisite order").map(m => { const duration = n(m.hours, "Module hours", Number.MIN_VALUE); const startWeek = Math.floor(elapsed / hours) + 1; elapsed += duration; return { module: text(m.title, "Module title"), hours: duration, startWeek, finishWeek: Math.ceil(elapsed / hours), checkpoint: text(m.checkpoint, "Readiness checkpoint") }; }), totalHours: elapsed, method: "Schedule from provided ordered modules and weekly capacity" };
    }
    case "evidence-check": {
      return { checks: rows(d.requirements, "Evidence requirements").map(r => ({ requirement: text(r.requirement, "Requirement"), satisfied: typeof r.evidence === "string" && r.evidence.trim().length > 0, evidence: typeof r.evidence === "string" ? r.evidence : "" })), scope: "Presence checklist only. Evidence truth, clinical support, legal compliance and external execution are not inferred." };
    }
    default: throw new RequestError("Unknown domain tool", 404);
  }
}
