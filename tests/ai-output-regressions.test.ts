import test from 'node:test';import assert from 'node:assert/strict';import {parseModelResult} from '../src/lib/ai-evidence';import {emptyDocument,validateCitations} from '../src/lib/grants/document';
test('AI cannot report blank findings as a completed draft',()=>{const value={status:'draft',summary:'Review draft',findings:['  '],recommendations:[],citations:['Source:a'],limitations:[]};assert.throws(()=>parseModelResult(JSON.stringify(value),new Set(['Source:a'])),/invalid findings/);value.findings=['Source evidence requires reviewer confirmation'];assert.equal(parseModelResult(JSON.stringify(value),new Set(['Source:a'])).status,'draft')});
test('citations reject short fragments and partial-word matches',()=>{
 const sources=[{id:'source-1',approvedBy:'reviewer-1',chunks:[{id:'paragraph-1',label:'Paragraph 1',text:'The program served 240 households in total.'}]}];
 const document=(quote:string)=>({...emptyDocument,sections:[{id:'need',title:'Need',content:'Claim',wordLimit:100,citations:[{sourceId:'source-1',chunkId:'paragraph-1',quote}]}]});
 assert.throws(()=>validateCitations(document('24') as never,sources),/citation/);
 assert.throws(()=>validateCitations(document('house') as never,sources),/citation/);
 assert.throws(()=>validateCitations(document('rogram served 2') as never,sources),/citation/);
 assert.doesNotThrow(()=>validateCitations(document('served 240 households') as never,sources));
});
