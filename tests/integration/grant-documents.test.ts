import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {prisma as db} from '../../src/lib/prisma'
import {mutation,editors,managers} from '../../src/lib/grants/access'
import {replacementSource,revokeReplacedApproval} from '../../src/lib/grants/source-versions'
import {addReceipt} from '../../src/lib/grants/receipts'
import {emptyDocument,validateCitations} from '../../src/lib/grants/document'
if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/inspection_test_grant_'))throw Error('Use isolated grant database')
after(()=>db.$disconnect())
async function fixture(){const owner=await db.user.create({data:{name:'Document Owner',passwordHash:'unused-test-password',email:randomUUID()+'@test.invalid',role:'ADMIN'}}),reviewer=await db.user.create({data:{name:'Reviewer',passwordHash:'unused-test-password',email:randomUUID()+'@test.invalid',role:'ANALYST'}}),client=await db.user.create({data:{name:'Client',passwordHash:'unused-test-password',email:randomUUID()+'@test.invalid',role:'ANALYST'}}),org=await db.grantOrganization.create({data:{name:'Document test org',memberships:{create:[{userId:owner.id,role:'OWNER'},{userId:reviewer.id,role:'REVIEWER'},{userId:client.id,role:'CLIENT'}]}}}),project=await db.grantProject.create({data:{organizationId:org.id,title:'Document proposal',funder:'Fixture funder',authorId:owner.id,document:emptyDocument,access:{create:[{userId:reviewer.id},{userId:client.id}]}}});return{owner,reviewer,client,org,project}}
test('Source replacement retains old bytes, revokes old approval and prevents branches, cross-project replacement and frozen edits',async()=>{
 const f=await fixture(),old=await db.grantSource.create({data:{projectId:f.project.id,title:'Original',fileName:'original.txt',mediaType:'text/plain',bytes:Buffer.from('Original evidence'),contentHash:'a'.repeat(64),chunks:[{id:'paragraph-1',label:'Paragraph 1',text:'Original evidence'}],actorId:f.owner.id,approvedBy:f.reviewer.id,approvedAt:new Date()}})
 const replace=(previousId:string)=>mutation(f.owner.id,f.org.id,randomUUID(),'source.replace',{previousId},async tx=>{const previous=await replacementSource(tx,f.owner.id,f.project.id,previousId);const next=await tx.grantSource.create({data:{projectId:f.project.id,title:'Replacement',fileName:'replacement.txt',mediaType:'text/plain',bytes:Buffer.from('New evidence'),contentHash:'b'.repeat(64),chunks:[{id:'paragraph-1',label:'Paragraph 1',text:'New evidence'}],actorId:f.owner.id,supersedesId:previousId}});await revokeReplacedApproval(tx,f.owner.id,previous!,next.id);return{id:next.id}},editors)
 const results=await Promise.allSettled([replace(old.id),replace(old.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 const original=await db.grantSource.findUniqueOrThrow({where:{id:old.id}});assert.equal(original.approvedBy,null);assert.equal(Buffer.from(original.bytes!).toString(),'Original evidence')
 const document={...emptyDocument,sections:[{id:'section',title:'Evidence',content:'Original evidence',wordLimit:100,citations:[{sourceId:old.id,chunkId:'paragraph-1',quote:'Original evidence'}]}]};assert.throws(()=>validateCitations(document,[original],true),/approval/)
 assert.equal(await db.auditLog.count({where:{action:'GRANT_SOURCE_SUPERSEDED',entityId:old.id}}),1)
 await assert.rejects(()=>replace(old.id),/newer version/)
 const other=await fixture();await assert.rejects(()=>replacementSource(db,f.owner.id,other.project.id,old.id),/access/)
 await assert.rejects(()=>replacementSource(db,other.owner.id,other.project.id,old.id),/not in/)
 const next=await db.grantSource.findFirstOrThrow({where:{supersedesId:old.id}});await db.grantProject.update({where:{id:f.project.id},data:{status:'FROZEN'}});await assert.rejects(()=>replacementSource(db,f.owner.id,f.project.id,next.id),/draft proposal/)
})
test('Receipt attachments bind a recorded package, require current manager authority, retain exact bytes once and reject invalid files',async()=>{
 const f=await fixture(),bundle=await db.grantPackage.create({data:{projectId:f.project.id,projectVersion:1,contentHash:'a'.repeat(64),manifest:{},docx:Buffer.from('fixture'),pdf:Buffer.from('fixture'),archive:Buffer.from('fixture'),frozenBy:f.owner.id}}),bytes=Buffer.from('Funder confirmation: fixture receipt 12345'),input={packageId:bundle.id,fileName:'receipt.txt',mediaType:'text/plain',note:'Received through the fixture funder portal',sharingConfirmed:true}
 const attach=(actorId:string,body:unknown=input,file:Uint8Array=bytes,key=randomUUID())=>mutation(actorId,f.org.id,key,'receipt.attach',{body,hash:createHash('sha256').update(file).digest('hex')},tx=>addReceipt(tx,actorId,f.project.id,body,file),managers)
 await assert.rejects(()=>attach(f.owner.id),/Record the actual submission/)
 await db.grantProject.update({where:{id:f.project.id},data:{status:'SUBMITTED'}});await db.grantPackage.update({where:{id:bundle.id},data:{submittedAt:new Date(),receiptReference:'FIXTURE-12345'}})
 await assert.rejects(()=>attach(f.client.id),/access/);await assert.rejects(()=>attach(f.reviewer.id),/access/)
 await assert.rejects(()=>attach(f.owner.id,{...input,sharingConfirmed:false}),/true/)
 await assert.rejects(()=>attach(f.owner.id,{...input,mediaType:'application/pdf'}),/do not match/)
 await assert.rejects(()=>attach(f.owner.id,input,new Uint8Array(5000001)),/5 MB/)
 const key=randomUUID(),saved=await attach(f.owner.id,input,bytes,key) as {id:string};await attach(f.owner.id,input,bytes,key)
 const row=await db.grantSubmissionReceipt.findUniqueOrThrow({where:{id:saved.id}});assert.deepEqual(Buffer.from(row.bytes),bytes);assert.equal(row.contentHash,createHash('sha256').update(bytes).digest('hex'));assert.equal(await db.grantSubmissionReceipt.count({where:{packageId:bundle.id}}),1)
 await assert.rejects(()=>attach(f.owner.id),/already attached/)
 await assert.rejects(()=>db.grantSubmissionReceipt.update({where:{id:row.id},data:{bytes:Buffer.from('changed')}}),/append-only/)
 await assert.rejects(()=>db.grantSubmissionReceipt.delete({where:{id:row.id}}),/append-only/)
 await db.grantMembership.update({where:{organizationId_userId:{organizationId:f.org.id,userId:f.owner.id}},data:{active:false}});await assert.rejects(()=>attach(f.owner.id,input,bytes,key),/access/)
})
