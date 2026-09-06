// Exercises the real route implementations and real PostgreSQL transactions.
// Only the session provider and outbound providers are synthetic fixtures.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { NextRequest } = require('next/server');
const database = new URL(process.env.DATABASE_URL || '').pathname.slice(1);
if (!/^inspection_test_[a-z0-9_]+$/.test(database)) throw new Error('Integration tests require an isolated inspection_test_ database');
const prisma = new PrismaClient();
const root = process.cwd();
const metadata = require('../src/config/record-metadata.json');
let identity;
let providerMode = 'valid';
let connectorCalls=0; let connectorMode='valid';
let suppliedPrompt = '';
const moduleCache = new Map();
function load(file) {
  file = path.resolve(file);
  if (moduleCache.has(file)) return moduleCache.get(file);
  const exports = {}; moduleCache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText.replace('error instanceof Error ? error.name : "UnknownError"', 'String(error)');
  const imports = name => {
    if (name === 'next-auth') return {getServerSession:async()=>identity?{user:{id:identity,authVersion:(await prisma.user.findUnique({where:{id:identity},select:{authVersion:true}}))?.authVersion}}:null};
    if (name.endsWith('/auth') || (name === './auth' && file.endsWith('api-auth.ts'))) return {authOptions:{}};
    if (name === '@/lib/prisma' || name === './prisma') return {prisma,default:prisma};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root,'src',name.slice(2)) : path.resolve(path.dirname(file),name);
      if (base.endsWith('.json')) return require(base);
      if (fs.existsSync(base+'.ts')) return load(base+'.ts');
    }
    return require(name);
  };
  const fetchFixture = async (_url, options) => {
    if (String(_url).startsWith('https://connector.fixture.invalid/')) {
      connectorCalls++;
      const data=JSON.parse(options.body);
      return Response.json({status:connectorMode==='valid'?'completed':'pending',schemaVersion:'1',receiptId:'fixture-receipt',idempotencyKey:data.idempotencyKey});
    }
    const request = JSON.parse(options.body); suppliedPrompt = request.messages[1].content;
    const context = JSON.parse(suppliedPrompt); const citation=context.evidence[0].citation;
    const content=providerMode === 'invalid' ? 'I cannot perform this analysis.' : JSON.stringify({status:'draft',summary:'Review saved source evidence',findings:['The record is present'],recommendations:[],citations:[citation],limitations:['Fixture assessment'],...(context.artifacts?.length?{claims:[{claim:'A source has supporting evidence.',sourceId:context.artifacts[0].citation,quote:context.artifacts[0].content}]}:{})});
    return Response.json({id:'fixture-receipt',model:'fixture-model',choices:[{message:{content},finish_reason:'stop'}]});
  };
  vm.runInNewContext(code,{exports,require:imports,process,console,Error,Date,URL,Response,Request,TextDecoder,TextEncoder,Uint8Array,Buffer,AbortSignal,fetch:fetchFixture,setTimeout,clearTimeout},{filename:file});
  return exports;
}
const route=load(path.join(root,'src/app/api/records/[entity]/route.ts'));
const review=load(path.join(root,'src/app/api/reviews/[entity]/route.ts'));
const ai=load(path.join(root,'src/app/api/ai/[workflow]/route.ts'));
const bulk=load(path.join(root,'src/app/api/import/[entity]/route.ts'));
const sessions=load(path.join(root,'src/app/api/sessions/route.ts'));
const accounts=load(path.join(root,'src/app/api/users/route.ts'));
const artifacts=load(path.join(root,'src/app/api/artifacts/route.ts'));
const connectors=load(path.join(root,'src/app/api/connectors/route.ts'));
const config=load(path.join(root,'src/config/app.ts'));
function request(url,method='GET',body) {return new NextRequest('http://fixture.invalid'+url,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});}
const context=entity=>({params:Promise.resolve({entity})});
function valid(entity,parentId) {return Object.fromEntries(metadata[entity].fields.map(f=>[f.name,f.relation?parentId:f.kind==='number'?1:f.kind==='boolean'?false:f.kind==='date'?'2026-09-05T00:00:00.000Z':f.name==='status'?'Draft':`Fixture ${f.name}`]));}
let checks=0;
function check(value,message){assert(value,message);checks++;}
(async()=>{
  const [creator,analyst,reviewer1,reviewer2]=await Promise.all(['MANAGER','ANALYST','ADMIN','MANAGER'].map((role,i)=>prisma.user.create({data:{email:`fixture-${i}@example.invalid`,name:`Fixture ${i}`,passwordHash:'not-a-password',role}})));
  await prisma.grantMembership.createMany({data:[creator,analyst,reviewer1,reviewer2].map(user=>({organizationId:"legacy",userId:user.id,role:user.role==="ADMIN"?"OWNER":user.role==="MANAGER"?"MANAGER":"EDITOR"}))});
  const rootEntity=Object.keys(metadata)[0]; const child=Object.values(metadata).find(m=>m.parent?.entity===rootEntity)?.name;
  identity=analyst.id;
  check((await route.POST(request('/api/records/'+rootEntity,'POST',valid(rootEntity)),context(rootEntity))).status===403,'analyst write denied');
  check((await route.DELETE(request('/api/records/'+rootEntity,'DELETE',{id:'none'}),context(rootEntity))).status===403,'analyst delete denied');
  identity=creator.id;
  let r=await route.POST(request('/api/records/'+rootEntity,'POST',valid(rootEntity)),context(rootEntity));
  check(r.status===201,'manager can create');let parent=(await r.json()).row;
  const createChild=async values=>route.POST(request('/api/records/'+child,'POST',values),context(child));
  check((await createChild(valid(child))).status===422,'child requires real parent');
  r=await createChild(valid(child,parent.id));check(r.status===201,'associated child can be created');const childRow=(await r.json()).row;
  check(childRow[metadata[child].parent.field]===parent.id,'parent relationship persisted');
  check((await route.PUT(request('/api/records/'+rootEntity,'PUT',{...valid(rootEntity),id:parent.id,updatedAt:'2020-01-01'}),context(rootEntity))).status===409,'stale update rejected');
  r=await review.POST(request('/api/reviews/'+rootEntity,'POST',{id:parent.id,updatedAt:parent.updatedAt,reason:'Reviewed source evidence and approve this record.'}),context(rootEntity)); if(r.status!==403)console.log('review response',r.status,await r.clone().text());check(r.status===403,'editor cannot self-approve');
  identity=reviewer1.id;
  const reviewBody={id:parent.id,updatedAt:parent.updatedAt,reason:'Reviewed source evidence and approve this record.'};
  r=await review.POST(request('/api/reviews/'+rootEntity,'POST',reviewBody),context(rootEntity));check(r.status===200,'first independent reviewer accepted');
  r=await review.POST(request('/api/reviews/'+rootEntity,'POST',reviewBody),context(rootEntity));check(r.status===409,'duplicate reviewer rejected');
  identity=reviewer2.id;
  r=await review.POST(request('/api/reviews/'+rootEntity,'POST',reviewBody),context(rootEntity));check(r.status===200,'second independent reviewer accepted');check((await r.json()).reviews===2,'two reviews counted');
  const rootDelegate=prisma[rootEntity[0].toLowerCase()+rootEntity.slice(1)];
  parent=await rootDelegate.findUnique({where:{id:parent.id}});
  if ('status' in parent)check(parent.status==='Approved','approval state applied after two reviews');
  process.env.DOMAIN_CONNECTORS_JSON=JSON.stringify([{id:'fixture',label:'Fixture',endpoint:'https://connector.fixture.invalid',actions:['submit','uncertain'],schemaVersion:'1'}]);
  const execution={connectorId:'fixture',action:'submit',entity:rootEntity,id:parent.id};
  r=await connectors.POST(request('/api/connectors','POST',execution));check(r.status===200,'approved version executes with receipt');
  r=await connectors.POST(request('/api/connectors','POST',execution));check(r.status===200&&connectorCalls===1,'completed execution is not repeated');
  connectorMode='invalid';r=await connectors.POST(request('/api/connectors','POST',{...execution,action:'uncertain'}));check(r.status===502,'missing completion receipt fails');
  r=await connectors.POST(request('/api/connectors','POST',{...execution,action:'uncertain'}));check(r.status===409&&connectorCalls===2,'uncertain execution is not repeated');
  identity=creator.id;
  const afterApproval=await route.PUT(request('/api/records/'+rootEntity,'PUT',{...valid(rootEntity),id:parent.id,updatedAt:parent.updatedAt}),context(rootEntity));check(afterApproval.status===200,'approved record can be revised');
  parent=await rootDelegate.findUnique({where:{id:parent.id}});if('status'in parent)check(parent.status==='Draft','revision invalidates approval');
  check((await connectors.POST(request('/api/connectors','POST',execution))).status===409,'revised source cannot use old approval');
  delete process.env.DOMAIN_CONNECTORS_JSON;
  // Force an actual database audit failure; domain writes must roll back.
  const before=await rootDelegate.count();
  await prisma.$executeRawUnsafe(`CREATE FUNCTION fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fixture_audit_failure()`);
  check((await route.POST(request('/api/records/'+rootEntity,'POST',valid(rootEntity)),context(rootEntity))).status===503,'audit failure returns error');
  check(await rootDelegate.count()===before,'audit failure rolls back record creation');
  await prisma.$executeRawUnsafe('DROP TRIGGER fixture_audit_failure ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION fixture_audit_failure()');
  await rootDelegate.createMany({data:Array.from({length:24},(_,i)=>({...valid(rootEntity),[metadata[rootEntity].fields.find(f=>f.kind==='string').name]:`Pagination ${i}`}))});
  const first=await (await route.GET(request('/api/records/'+rootEntity+'?page=1'),context(rootEntity))).json();
  const second=await (await route.GET(request('/api/records/'+rootEntity+'?page=2'),context(rootEntity))).json();
  check(first.rows.length===20&&second.rows.length===5&&second.total===25,'all rows accessible through pagination');
  check(!second.rows.some(a=>first.rows.some(b=>a.id===b.id)),'pagination has no duplicate rows');
  const workflow=config.workflows.find(w=>!['section-draft','claim-audit'].includes(w.slug));const ctx={params:Promise.resolve({workflow:workflow.slug})};
  const body={input:{[workflow.fields[0]]:'Fixture evidence'},scope:{entity:rootEntity,id:parent.id},evidence:[{entity:child,id:childRow.id}]};
  delete process.env.OPENROUTER_API_KEY;
  check((await ai.POST(request('/api/ai/'+workflow.slug,'POST',body),ctx)).status===503,'unconfigured AI produces no assessment');
  check((await ai.POST(request('/api/ai/'+workflow.slug,'POST',{...body,input:{[workflow.fields[0]]:42}}),ctx)).status===422,'invalid AI input rejected');
  process.env.OPENROUTER_API_KEY='fixture-not-a-real-key';
  r=await ai.POST(request('/api/ai/'+workflow.slug,'POST',body),ctx);check(r.status===200,'valid provider draft saved');
  const result=await r.json();check(result.result.riskLevel===null,'no fabricated risk');check(await prisma.workflowAnalysis.count()===1,'analysis persisted server-side');
  check(suppliedPrompt.includes('2026-09-05'),'source dates preserved');
  providerMode='invalid';check((await ai.POST(request('/api/ai/'+workflow.slug,'POST',body),ctx)).status===502,'provider refusal is failure');check(await prisma.workflowAnalysis.count()===1,'failed result not saved');
  r=await artifacts.POST(request('/api/artifacts','POST',{entity:rootEntity,id:parent.id,title:'Source',content:'Complete source text with supporting evidence.'}));check(r.status===201,'source ingestion works');const artifact=await r.json();
  check((await artifacts.PUT(request('/api/artifacts','PUT',{id:artifact.id}))).status===403,'source author cannot approve source');
  identity=reviewer1.id;check((await artifacts.PUT(request('/api/artifacts','PUT',{id:artifact.id,expectedHash:artifact.contentHash}))).status===200,'independent source review works');
  const proposalWorkflow=config.workflows.find(w=>w.slug==='section-draft');
  if(proposalWorkflow){
    identity=creator.id;providerMode='valid';
    r=await ai.POST(request('/api/ai/section-draft','POST',{input:{[proposalWorkflow.fields[0]]:'Use the approved source'},scope:{entity:rootEntity,id:parent.id},artifactIds:[artifact.id]}),{params:Promise.resolve({workflow:'section-draft'})});
    check(r.status===200,'approved-source draft succeeds');const draft=await r.json();check(draft.result.claims[0].quote==='Complete source text with supporting evidence.','source excerpts preserved in returned draft');
    const saved=await prisma.workflowAnalysis.findUnique({where:{id:draft.result.id}});check(saved.result.claims[0].sourceId==='DomainArtifact:'+artifact.id,'source excerpts persisted for later review');
  }
  const prWorkflow=config.workflows.find(w=>w.slug==='pr-draft');
  if(prWorkflow){
    providerMode='valid';identity=creator.id;
    r=await ai.POST(request('/api/ai/pr-draft','POST',{input:{[prWorkflow.fields[0]]:'Draft from requirements'},scope:{entity:rootEntity,id:parent.id}}),{params:Promise.resolve({workflow:'pr-draft'})});
    check(r.status===422,'PR draft requires an approved specification');
  }
  identity=creator.id;
  let countBefore = await rootDelegate.count();
  r=await bulk.POST(request('/api/import/'+rootEntity,'POST',{rows:[valid(rootEntity),{unknown:'bad'}]}),context(rootEntity));check(r.status===422,'invalid bulk row rejects entire import');check(await rootDelegate.count()===countBefore,'invalid bulk import creates no records');
  r=await bulk.POST(request('/api/import/'+rootEntity,'POST',{rows:[valid(rootEntity)]}),context(rootEntity));check(r.status===201,'valid bulk import succeeds');
  r=await bulk.POST(request('/api/import/'+rootEntity,'POST',{rows:[valid(rootEntity)]}),context(rootEntity));check(r.status===409,'identical bulk import is idempotently rejected');
  const assessmentType=['Simulation','RecordedSimulation','ExamSession','Assignment'].find(e=>metadata[e]);
  if(assessmentType){
    r=await route.POST(request('/api/records/'+assessmentType,'POST',valid(assessmentType,parent.id)),context(assessmentType));check(r.status===201,'assessment fixture created');const assessment=(await r.json()).row;
    r=await sessions.POST(request('/api/sessions','POST',{action:'start',subjectEntity:assessmentType,subjectId:assessment.id,respondentEmail:creator.email,minutes:30,questions:[{prompt:'Explain the decision',maximum:10,difficulty:1},{prompt:'Explain a difficult counterexample',maximum:10,difficulty:2}]}));
    check(r.status===200,'timed session starts');let session=(await r.json()).item;
    r=await sessions.POST(request('/api/sessions','POST',{action:'respond',id:session.id,text:'My evidence-based answer'}));check(r.status===200,'assigned respondent submits');
    r=await sessions.POST(request('/api/sessions','POST',{action:'review',id:session.id,score:9,rationale:'The answer meets the anchored rubric criteria.'}));check(r.status===403,'respondent cannot score their own answer');
    identity=reviewer1.id;r=await sessions.POST(request('/api/sessions','POST',{action:'review',id:session.id,score:9,rationale:'The answer meets the anchored rubric criteria.'}));check(r.status===200,'independent human rating accepted');session=(await r.json()).item;check(session.currentQuestion==='2','sequence advances by reviewed difficulty');
    await prisma.workSession.update({where:{id:session.id},data:{deadline:new Date('2020-01-01')}});identity=creator.id;
    r=await sessions.POST(request('/api/sessions','POST',{action:'respond',id:session.id,text:'Late answer'}));check(r.status===409,'server enforces session deadline');
  }
  const credentialEntity=['Credential','BadgeAward','EmployerTranscript'].find(e=>metadata[e]);
  if(credentialEntity){
    identity=creator.id;r=await route.POST(request('/api/records/'+credentialEntity,'POST',valid(credentialEntity,parent.id)),context(credentialEntity));check(r.status===201,'credential fixture created');let credential=(await r.json()).row;
    const payload={id:credential.id,updatedAt:credential.updatedAt,reason:'Independently reviewed credential evidence and assessment records.'};
    identity=reviewer1.id;r=await review.POST(request('/api/reviews/'+credentialEntity,'POST',payload),context(credentialEntity));check(r.status===200,'first credential review');
    identity=reviewer2.id;r=await review.POST(request('/api/reviews/'+credentialEntity,'POST',payload),context(credentialEntity));const issued=await r.json();check(r.status===200&&/^[a-f0-9]{64}$/.test(issued.verificationToken),'credential issued with opaque verification token');
    const verifier=load(path.join(root,'src/app/api/verify/[token]/route.ts'));const tokenContext={params:Promise.resolve({token:issued.verificationToken})};
    r=await verifier.GET(request('/api/verify/'+issued.verificationToken),tokenContext);check((await r.json()).valid===true,'human-reviewed credential verifies');
    credential=await prisma[credentialEntity[0].toLowerCase()+credentialEntity.slice(1)].findUnique({where:{id:credential.id}});
    identity=creator.id;r=await route.PUT(request('/api/records/'+credentialEntity,'PUT',{...valid(credentialEntity,parent.id),id:credential.id,updatedAt:credential.updatedAt}),context(credentialEntity));check(r.status===200,'credential can be revised');
    r=await verifier.GET(request('/api/verify/'+issued.verificationToken),tokenContext);check((await r.json()).valid===false,'revision invalidates public verification');
  }
  if(metadata.Diagnosis?.fields.some(f=>f.name==='memberId')){
    identity=creator.id;
    const create=async(entity,data)=>{const response=await route.POST(request('/api/records/'+entity,'POST',data),context(entity));check(response.status===201,'subject evidence fixture created');return (await response.json()).row;};
    const firstMember=await create('Member',valid('Member',parent.id));const secondMember=await create('Member',valid('Member',parent.id));
    const diagnosis=await create('Diagnosis',{...valid('Diagnosis',parent.id),memberId:firstMember.id});
    const document=await create('EvidenceDocument',{...valid('EvidenceDocument',parent.id),memberId:secondMember.id});
    const evidence=load(path.join(root,'src/lib/ai-evidence.ts'));
    await assert.rejects(evidence.loadEvidence(prisma,{entity:'Diagnosis',id:diagnosis.id},[{entity:'EvidenceDocument',id:document.id}]),/different linked subject/);checks++;
  }
  if(metadata.OutcomeMeasure?.fields.some(f=>f.name==='interventionId')){
    identity=creator.id;
    const create=async(entity,data)=>{const response=await route.POST(request('/api/records/'+entity,'POST',data),context(entity));check(response.status===201,'student fixture created');return (await response.json()).row;};
    const firstStudent=await create('Student',{...valid('Student',parent.id),studentId:'subject-one'});const secondStudent=await create('Student',{...valid('Student',parent.id),studentId:'subject-two'});
    const intervention=await create('Intervention',{...valid('Intervention',parent.id),studentId:firstStudent.id});
    r=await route.POST(request('/api/records/OutcomeMeasure','POST',{...valid('OutcomeMeasure',parent.id),studentId:secondStudent.id,interventionId:intervention.id}),context('OutcomeMeasure'));check(r.status===422,'outcome cannot refer to another student intervention');
  }
  identity=creator.id;check((await accounts.GET()).status===403,'managers cannot manage accounts');
  identity=reviewer1.id;r=await accounts.PUT(request('/api/users','PUT',{id:analyst.id,role:'ANALYST',active:false}));check(r.status===200,'administrator disables account');
  identity=analyst.id;check((await route.GET(request('/api/records/'+rootEntity),context(rootEntity))).status===401,'disabled account loses access');
  identity=analyst.id;await prisma.user.delete({where:{id:analyst.id}});
  check((await route.GET(request('/api/records/'+rootEntity),context(rootEntity))).status===401,'deleted user loses API access immediately');
  console.log(JSON.stringify({project:path.basename(root),checks,status:'passed'}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
