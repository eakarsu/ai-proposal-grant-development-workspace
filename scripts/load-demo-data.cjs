const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { createHash, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..');
const env = parseEnv(fs.readFileSync(path.join(project, '.env'), 'utf8'));
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;
const url = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Demo loading requires a local, non-production database');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const demoNote = 'DEMO — fictional evaluation data. No real service, approval, payment, delivery or external submission occurred.';
const names = ['Avery','Jordan','Taylor','Casey','Riley','Morgan','Alex','Jamie','Cameron','Drew','Reese','Quinn','Skyler','Rowan','Emerson'];
const stamp = (days = 0, hour = 10) => { const d = new Date(); d.setDate(d.getDate()+days); d.setHours(hour,0,0,0); return d; };
const key = (kind, i) => `demo-${kind}-${String(i+1).padStart(3,'0')}`;
const touched = new Set();
async function insert(tx, model, id, data) {
  touched.add(model);
  return tx[model].upsert({ where: { id }, update: {}, create: { id, ...data } });
}
async function snapshot() {
  const result = {};
  for (const model of [...touched].sort()) {
    const rows = await db[model].findMany({orderBy:{id:'asc'}});
    result[model] = { count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return result;
}
async function main() {
  const email = process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const admin = email ? await db.user.findUnique({where:{email}}) : await db.user.findFirst({where:{role:'ADMIN'}});
  if (!admin) throw new Error('Create the configured administrator first');
  const accountPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const run = () => db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('local-demo-data-loader'))`;
    await seed(tx, admin, accountPassword);
  }, { timeout: 120000, maxWait: 10000 });
  const adminBefore = JSON.stringify(admin);
  await run();
  const first = await snapshot();
  if (process.argv.includes('--verify')) { await run(); assert.deepEqual(await snapshot(), first, 'Reload must preserve every existing record and avoid duplicates'); }
  assert.equal(JSON.stringify(await db.user.findUnique({where:{id:admin.id}})), adminBefore, 'Administrator must remain unchanged');
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(first).map(([model,value])=>[model,value.count])), verifiedRepeat:process.argv.includes('--verify'), administratorPreserved:true },null,2));
}
async function seed(tx, admin) {
  for(let i=0;i<15;i++) {
    const opportunityId=key('grant-opportunity',i);
    const title=`Demo community program ${i+1}`;
    await insert(tx,'opportunity',opportunityId,{name:title,funder:`Demo Foundation ${i+1}`,program:'Demo community capacity grant',awardCeiling:50000,status:'OPEN',deadline:stamp(30+i)});
    await insert(tx,'proposal',key('grant-proposal',i),{opportunityId,title:`Demo proposal ${i+1}`,opportunityRef:opportunityId,lead:admin.name,requestedAmount:25000,status:'DRAFTING',dueDate:stamp(20+i)});
    const content=`${demoNote}\nProgram: ${title}.\nThe fictional project plans 12 community workshops and a draft budget of USD 25,000. Outcomes and funding are unverified. This source is supplied for independent review; it does not establish grant eligibility.`;
    const artifactId=key('grant-source-artifact',i);
    await insert(tx,'domainArtifact',artifactId,{subjectEntity:'Opportunity',subjectId:opportunityId,title:`Demo source brief ${i+1}`,content,contentHash:createHash('sha256').update(content).digest('hex'),actorId:admin.id});
    await insert(tx,'sourceDocument',key('grant-source',i),{opportunityId,title:`Demo source brief ${i+1}`,kind:'Demo text',storageRef:artifactId,approvedBy:'',status:'OPEN',ingestedAt:stamp()});
    await insert(tx,'requirementItem',key('grant-requirement',i),{opportunityId,section:'Program plan',requirement:'Demo: describe activities and measurable outcomes',responseRef:key('grant-draft',i),status:'OPEN',owner:admin.name,pageLimit:'2'});
    await insert(tx,'draftSection',key('grant-draft',i),{opportunityId,section:`Demo program plan ${i+1}`,content,version:'1',author:admin.name,status:'DRAFT',lastEditedAt:stamp()});
    await insert(tx,'claimValidation',key('grant-claim',i),{opportunityId,claim:'Demo project plans 12 workshops',sourceRef:artifactId,verdict:'PENDING_REVIEW',reviewer:'Unassigned',status:'OPEN'});
    await insert(tx,'budgetLine',key('grant-budget',i),{opportunityId,category:'Demo program delivery',description:demoNote,amount:25000,justification:'Draft planning estimate, not committed spending',status:'DRAFT',allowability:'NOT_REVIEWED'});
    await insert(tx,'reviewerAssignment',key('grant-reviewer',i),{opportunityId,reviewer:'Unassigned',section:'Demo full proposal',expertise:'Program review',status:'PENDING',dueDate:stamp(15+i)});
    await insert(tx,'deadlineItem',key('grant-deadline',i),{opportunityId,kind:'INTERNAL_REVIEW',title:`Demo review deadline ${i+1}`,owner:admin.name,status:'OPEN',dueAt:stamp(15+i)});
    await insert(tx,'meetingExtract',key('grant-meeting',i),{opportunityId,meeting:`Demo planning notes ${i+1}`,keyPoints:'Fictional workshop planning example',decisions:'No real decisions recorded',actions:'Review this example with the proposal team',status:'DRAFT'});
    await insert(tx,'submissionPackage',key('grant-submission',i),{opportunityId,portal:'Demo — no portal connected',packageRef:key('grant-proposal',i),status:'DRAFT',pageCount:0});
    await insert(tx,'complianceCheck',key('grant-check',i),{opportunityId,rule:'Demo source completeness check',result:'NOT_REVIEWED',evidence:artifactId,reviewer:'Unassigned',status:'OPEN'});
  }
}

main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect());
