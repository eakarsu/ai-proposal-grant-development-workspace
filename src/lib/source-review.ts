import {createHash} from 'node:crypto';
import {RequestError} from './record-policy';
export function validateSourceReview(source:{actorId:string;content:string;contentHash:string}, reviewerId:string, expectedHash:unknown) {
  if(source.actorId===reviewerId) throw new RequestError('A different reviewer must approve this source',403);
  if(typeof expectedHash!=='string'||expectedHash!==source.contentHash||createHash('sha256').update(source.content).digest('hex')!==source.contentHash) throw new RequestError('Read the current source text before approving it',409);
}
