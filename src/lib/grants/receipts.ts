import type {Prisma} from '@prisma/client'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import {projectAccess,managers,audit} from './access'
import {RequestError} from '@/lib/record-policy'
export const receiptFileSchema=z.object({packageId:z.string().min(1).max(100),fileName:z.string().trim().min(1).max(200),mediaType:z.enum(['text/plain','application/pdf','image/png','image/jpeg']),note:z.string().trim().min(10).max(2000),sharingConfirmed:z.literal(true)}).strict()
export async function addReceipt(tx:Prisma.TransactionClient,actorId:string,projectId:string,raw:unknown,bytes:Uint8Array){
 const input=receiptFileSchema.parse(raw),{project}=await projectAccess(tx,actorId,projectId,managers)
 const bundle=await tx.grantPackage.findFirst({where:{id:input.packageId,projectId}})
 if(!bundle?.submittedAt||!['SUBMITTED','AWARDED','DECLINED','WITHDRAWN'].includes(project.status))throw new RequestError('Record the actual submission before attaching its receipt',409)
 if(!bytes.length||bytes.length>5000000)throw new RequestError('Receipt must contain 1 byte to 5 MB',413)
 const buffer=Buffer.from(bytes),valid=input.mediaType==='application/pdf'?buffer.subarray(0,5).toString()==='%PDF-':input.mediaType==='image/png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):input.mediaType==='image/jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:true
 if(!valid)throw new RequestError('Receipt bytes do not match the declared file type',422)
 if(input.mediaType==='text/plain'){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(text.includes('\u0000'))throw Error('Binary')}catch{throw new RequestError('Text receipts must be valid UTF-8 text',422)}}
 const contentHash=createHash('sha256').update(bytes).digest('hex')
 const existing=await tx.grantSubmissionReceipt.findFirst({where:{packageId:bundle.id,contentHash}});if(existing)throw new RequestError('This receipt file is already attached',409)
 const totals=await tx.$queryRaw<{count:bigint;size:bigint}[]>`SELECT COUNT(*)::bigint AS count,COALESCE(SUM(octet_length(bytes)),0)::bigint AS size FROM "GrantSubmissionReceipt" WHERE "packageId"=${bundle.id}`
 if(Number(totals[0].count)>=10||Number(totals[0].size)+bytes.length>25000000)throw new RequestError('Package receipt quota reached (10 files / 25 MB)',413)
 const receipt=await tx.grantSubmissionReceipt.create({data:{projectId,packageId:bundle.id,actorId,fileName:input.fileName,mediaType:input.mediaType,bytes:buffer,contentHash,note:input.note,createdAt:new Date()},select:{id:true,fileName:true,mediaType:true,contentHash:true,note:true,createdAt:true}})
 await audit(tx,actorId,'GRANT_RECEIPT_ATTACHED',bundle.id,{receiptId:receipt.id,projectId,contentHash,note:input.note,sharingConfirmed:true,evidence:'UPLOADED_BY_MANAGER_NOT_AUTOMATIC_FUNDER_VERIFICATION'})
 return receipt
}
