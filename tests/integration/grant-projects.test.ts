import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/lib/prisma'
import { mutation,projectAccess,membership,hash } from '../../src/lib/grants/access'
import { createProject,saveProject,projectAction,snapshot } from '../../src/lib/grants/projects'
import { freezePackage,recordSubmission } from '../../src/lib/grants/packages'
import { documentSchema,emptyDocument,calculateBudget,validateCitations } from '../../src/lib/grants/document'
import { extractDocument } from '../../src/lib/grants/ingest'
import { bytesHash } from '../../src/lib/grants/export'
import { Document,Paragraph,Packer } from 'docx'
import { PDFDocument,StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
if(!new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid').pathname.startsWith('/inspection_test_grant_'))throw Error('Use npm run test:grants:isolated with a disposable database')
test('budget uses exact quantities, effort, fringe, indirect and cost share; invented citations fail',()=>{
 const document=documentSchema.parse({...emptyDocument,indirectBps:1000,budget:[{id:'line',year:1,category:'PERSONNEL',description:'Program staff',quantity:'10',unitRate:'100.25',effortBps:5000,fringeBps:2000,indirectEligible:true,costShareBps:1000,justification:'Ten units at half effort',allowability:'UNREVIEWED',policyCitation:null}]})
 const budget=calculateBudget(document);assert.equal(budget.totalCents,66165);assert.equal(budget.costShareCents,6617);assert.equal(budget.requestedCents,59548)
 assert.throws(()=>calculateBudget({...document,budget:[{...document.budget[0],quantity:'99999999',unitRate:'999999999.99'}]}),/precision|limit/)
 assert.throws(()=>validateCitations({...document,sections:[{id:'s',title:'Section',content:'Claim',wordLimit:10,citations:[{sourceId:'fake',chunkId:'x',quote:'invented'}]}]},[]),/citation/)
})
test('PDF and DOCX files extract real source text and reject malformed input',async()=>{
 const docx=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Grant evidence: the program served 240 households.'),new Paragraph('Eligible personnel costs are permitted under section 4.')]}]}))
 const word=await extractDocument(docx,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');assert.equal(word[0].id,'paragraph-1');assert.match(word[0].text,/240 households/)
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Grant evidence: the program served 240 households.',{font,size:12,x:50,y:700})
 const pages=await extractDocument(await pdf.save(),'application/pdf');assert.equal(pages[0].id,'page-1');assert.match(pages[0].text,/240 households/)
 await assert.rejects(()=>extractDocument(Buffer.from('not a PDF'),'application/pdf'),/PDF signature/)
 await assert.rejects(()=>extractDocument(new Uint8Array(5000001),'text/plain'),/5 MB/)
})
test('scanned PDF uses real local OCR with page citations',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'grant-ocr-fixture-'))
 try{
  const original=await PDFDocument.create(),font=await original.embedFont(StandardFonts.Helvetica)
  original.addPage().drawText('GRANT PROGRAM SUPPORTS 240 HOUSEHOLDS',{font,size:18,x:35,y:700})
  await writeFile(path.join(dir,'text.pdf'),await original.save())
  execFileSync('pdftoppm',['-singlefile','-r','150','-png',path.join(dir,'text.pdf'),path.join(dir,'scan')],{stdio:'pipe',timeout:15000})
  const scanned=await PDFDocument.create(),image=await scanned.embedPng(await readFile(path.join(dir,'scan.png')))
  scanned.addPage([612,792]).drawImage(image,{x:0,y:0,width:612,height:792})
  const extracted=await extractDocument(await scanned.save(),'application/pdf')
  assert.match(extracted[0].label,/OCR/);assert.match(extracted[0].text,/240 HOUSEHOLDS/)
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('organization isolation and independent proposal review produce frozen files with verified hashes and manual receipt evidence',async()=>{
 const suffix=randomUUID(),people=await Promise.all(['Owner','Reviewer One','Reviewer Two','Client','Outsider'].map(name=>prisma.user.create({data:{name,email:name.replaceAll(' ','')+suffix+'@example.test',passwordHash:'unused',role:'ANALYST'}})))
 const [owner,reviewer1,reviewer2,client,outsider]=people
 const organization=await prisma.grantOrganization.create({data:{name:'Fixture nonprofit',memberships:{create:[{userId:owner.id,role:'OWNER'},{userId:reviewer1.id,role:'REVIEWER'},{userId:reviewer2.id,role:'REVIEWER'},{userId:client.id,role:'CLIENT'}]}}})
 await prisma.grantOrganization.create({data:{name:'Different organization',memberships:{create:{userId:outsider.id,role:'OWNER'}}}})
 const input={title:'Community support proposal',funder:'Fixture Foundation',program:'Household support',dueAt:'2030-06-30T17:00:00.000Z',currency:'USD' as const,document:emptyDocument}
 const key=randomUUID(),created=await mutation(owner.id,organization.id,key,'create',input,tx=>createProject(tx,owner.id,organization.id,input),['OWNER']) as {id:string;version:number}
 assert.deepEqual(await mutation(owner.id,organization.id,key,'create',input,tx=>createProject(tx,owner.id,organization.id,input),['OWNER']),created)
 await assert.rejects(()=>mutation(owner.id,organization.id,key,'create',{...input,title:'Changed'},tx=>createProject(tx,owner.id,organization.id,input)),/different input/)
 await assert.rejects(()=>projectAccess(prisma,outsider.id,created.id),/Organization access/)
 await assert.rejects(()=>projectAccess(prisma,reviewer1.id,created.id),/Project access/)
 await assert.rejects(()=>membership(prisma,client.id,'legacy'),/access/)
 await prisma.grantProjectAccess.createMany({data:[reviewer1,reviewer2,client].map(u=>({projectId:created.id,userId:u.id}))})
 await assert.rejects(()=>projectAccess(prisma,client.id,created.id,['OWNER','EDITOR']),/access/)
 const original=Buffer.from('The program served 240 households. Eligible personnel expenses are permitted.')
 const source=await prisma.grantSource.create({data:{projectId:created.id,title:'Funder eligibility and program evidence',fileName:'evidence.txt',mediaType:'text/plain',bytes:original,contentHash:bytesHash(original),chunks:[{id:'paragraph-1',label:'Paragraph 1',text:original.toString()}],actorId:owner.id,approvedBy:reviewer1.id,approvedAt:new Date()}})
 const citation={sourceId:source.id,chunkId:'paragraph-1',quote:'Eligible personnel expenses are permitted.'}
 const document=documentSchema.parse({...emptyDocument,organizationNarrative:'A registered community nonprofit.',sections:[{id:'need',title:'Statement of need',content:'The program served 240 households.',wordLimit:100,citations:[{...citation,quote:'The program served 240 households.'}]}],requirements:[{id:'eligibility',text:'Document eligible personnel expenses',sectionIds:['need'],citations:[citation],decision:'SATISFIED',rationale:'The published rule permits personnel expenses.',reviewedBy:null}],budget:[{id:'staff',year:1,category:'PERSONNEL',description:'Program staff',quantity:'10',unitRate:'100.00',effortBps:10000,fringeBps:0,indirectEligible:false,costShareBps:0,justification:'Ten hours of direct program support',allowability:'ALLOWED',policyCitation:citation}]})
 const save={...input,document,expectedVersion:1,reason:'Completed initial source-backed draft'}
 const project=await mutation(owner.id,organization.id,randomUUID(),'save',save,tx=>saveProject(tx,owner.id,created.id,save)) as {id:string;version:number}
 await assert.rejects(()=>mutation(owner.id,organization.id,randomUUID(),'stale',save,tx=>saveProject(tx,owner.id,created.id,save)),/changed/)
 const current=await snapshot(prisma,project.id),contentHash=hash(current)
 await mutation(owner.id,organization.id,randomUUID(),'review.request',{},tx=>projectAction(tx,owner.id,project.id,{action:'REQUEST_REVIEW',expectedVersion:project.version}))
 await assert.rejects(()=>mutation(owner.id,organization.id,randomUUID(),'selfreview',{},tx=>projectAction(tx,owner.id,project.id,{action:'REVIEW',expectedVersion:project.version,contentHash,approved:true,reason:'Self approval must not count'})),/contributor/)
 for(const reviewer of [reviewer1,reviewer2])await mutation(reviewer.id,organization.id,randomUUID(),'review',{},tx=>projectAction(tx,reviewer.id,project.id,{action:'REVIEW',expectedVersion:project.version,contentHash,approved:true,reason:'Independently checked requirements, sources and the budget.'}))
 assert.equal((await prisma.grantProject.findUniqueOrThrow({where:{id:project.id}})).status,'APPROVED')
 const freezeInput={expectedVersion:project.version,contentHash,attachmentIds:[source.id]}
 const frozen=await mutation(owner.id,organization.id,randomUUID(),'freeze',freezeInput,tx=>freezePackage(tx,owner.id,project.id,freezeInput)) as {id:string}
 const bundle=await prisma.grantPackage.findUniqueOrThrow({where:{id:frozen.id}}),zip=await JSZip.loadAsync(bundle.archive),manifest=JSON.parse(await zip.file('manifest.json')!.async('string')) as {files:{name:string;sha256:string}[]}
 for(const file of manifest.files)assert.equal(bytesHash(await zip.file(file.name)!.async('uint8array')),file.sha256)
 const exported=await extractDocument(bundle.docx,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');assert.match(exported.map(c=>c.text).join('\n'),/240 households/)
 assert.ok((await PDFDocument.load(bundle.pdf)).getPageCount()>0)
 await mkdir('/tmp/grant-export-qa',{recursive:true});await writeFile('/tmp/grant-export-qa/proposal.pdf',bundle.pdf);await writeFile('/tmp/grant-export-qa/proposal.docx',bundle.docx)
 await assert.rejects(()=>mutation(owner.id,organization.id,randomUUID(),'editfrozen',{},tx=>saveProject(tx,owner.id,project.id,{...save,expectedVersion:project.version})),/Reopen/)
 await mutation(owner.id,organization.id,randomUUID(),'submit',{},tx=>recordSubmission(tx,owner.id,project.id,{packageId:bundle.id,expectedVersion:project.version,submittedAt:new Date().toISOString(),receiptReference:'FIXTURE PORTAL RECEIPT 12345'}))
 assert.equal((await prisma.grantProject.findUniqueOrThrow({where:{id:project.id}})).status,'SUBMITTED')
 await mutation(owner.id,organization.id,randomUUID(),'award',{},tx=>projectAction(tx,owner.id,project.id,{action:'OUTCOME',expectedVersion:project.version,status:'AWARDED',reason:'Fictional award letter for integration test'}))
 assert.equal((await prisma.grantProject.findUniqueOrThrow({where:{id:project.id}})).status,'AWARDED')
 await prisma.$disconnect()
})
