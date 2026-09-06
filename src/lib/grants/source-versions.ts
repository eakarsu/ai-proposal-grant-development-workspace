import type {Prisma} from '@prisma/client'
import {projectAccess,editors,audit} from './access'
import {RequestError} from '@/lib/record-policy'
export async function replacementSource(tx:Prisma.TransactionClient,actorId:string,projectId:string,previousId:string|undefined){
 if(!previousId)return null
 const {project}=await projectAccess(tx,actorId,projectId,editors)
 if(project.status!=='DRAFT')throw new RequestError('Source replacement requires a draft proposal',409)
 const source=await tx.grantSource.findFirst({where:{id:previousId,projectId}})
 if(!source)throw new RequestError('Previous source is not in this proposal',404)
 if(await tx.grantSource.findFirst({where:{supersedesId:previousId}}))throw new RequestError('This source already has a newer version; replace the latest version',409)
 return source
}
export async function revokeReplacedApproval(tx:Prisma.TransactionClient,actorId:string,source:NonNullable<Awaited<ReturnType<typeof replacementSource>>>,replacementId:string){
 const replacement=await tx.grantSource.findFirst({where:{id:replacementId,projectId:source.projectId,supersedesId:source.id}})
 if(!replacement)throw new RequestError('Source replacement does not match',409)
 await tx.grantSource.update({where:{id:source.id},data:{approvedBy:null,approvedAt:null}})
 await audit(tx,actorId,'GRANT_SOURCE_SUPERSEDED',source.id,{projectId:source.projectId,replacementId,previousHash:source.contentHash,previousApprovedBy:source.approvedBy,previousApprovedAt:source.approvedAt,newHash:replacement.contentHash})
}
