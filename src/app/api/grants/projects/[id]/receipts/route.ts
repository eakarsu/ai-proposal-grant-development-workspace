import {createHash} from 'node:crypto'
import {prisma} from '@/lib/prisma'
import {endpoint,projectAccess,managers,mutation} from '@/lib/grants/access'
import {addReceipt,receiptFileSchema} from '@/lib/grants/receipts'
import {readBounded} from '@/lib/request-body'
import {RequestError} from '@/lib/record-policy'
type Context={params:Promise<{id:string}>}
export const GET=endpoint<Context>(async(request,actor,context)=>{
 const id=(await context.params).id,{member}=await projectAccess(prisma,actor.id,id)
 if(member.role==='CLIENT')throw new RequestError('Original submission receipts require staff or reviewer access',403)
 const receiptId=request.nextUrl.searchParams.get('receiptId')
 if(receiptId){const receipt=await prisma.grantSubmissionReceipt.findFirst({where:{id:receiptId,projectId:id}});if(!receipt)throw new RequestError('Receipt not found',404)
  return new Response(new Uint8Array(receipt.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${receipt.fileName.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
 }
 return{receipts:await prisma.grantSubmissionReceipt.findMany({where:{projectId:id},orderBy:{createdAt:'desc'},take:100,select:{id:true,packageId:true,actorId:true,fileName:true,mediaType:true,contentHash:true,note:true,createdAt:true}})}
})
export const POST=endpoint<Context>(async(request,actor,context)=>{
 const id=(await context.params).id,{project}=await projectAccess(prisma,actor.id,id,managers)
 const input=receiptFileSchema.parse({packageId:request.headers.get('X-Package-Id'),fileName:decodeURIComponent(request.headers.get('X-File-Name')||''),mediaType:request.headers.get('Content-Type'),note:decodeURIComponent(request.headers.get('X-Receipt-Note')||''),sharingConfirmed:request.headers.get('X-Sharing-Confirmed')==='true'}),bytes=await readBounded(request,5000000),contentHash=createHash('sha256').update(bytes).digest('hex')
 return mutation(actor.id,project.organizationId,request.headers.get('Idempotency-Key'),'submission.attach',{id,...input,contentHash},tx=>addReceipt(tx,actor.id,id,input,bytes),managers)
})
