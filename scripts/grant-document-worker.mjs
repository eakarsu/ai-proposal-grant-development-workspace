import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yauzl from 'yauzl';
const [directory,type]=process.argv.slice(2);
console.log=()=>{};console.warn=()=>{};
async function inspectZip(buffer){
 await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
  if(error)return reject(error);let total=0,count=0,hasDocument=false;
  zip.on('error',reject);zip.on('entry',entry=>{
   total+=entry.uncompressedSize;count++;if(entry.fileName==='word/document.xml')hasDocument=true;
   if(count>2000||total>20000000||entry.generalPurposeBitFlag&1){zip.close();reject(Error('DOCX archive exceeds safe limits or is encrypted'));return}
   zip.readEntry();
  });zip.on('end',()=>hasDocument?resolve():reject(Error('The file is not a Word DOCX document')));zip.readEntry();
 }))
}
async function main(){
 const bytes=await fs.readFile(path.join(directory,'input'));
 let chunks=[];
 if(type==='text/plain'){
  const content=new TextDecoder('utf8',{fatal:true}).decode(bytes);chunks=content.split(/\n\s*\n/).filter(s=>s.trim()).map((text,i)=>({id:`paragraph-${i+1}`,label:`Paragraph ${i+1}`,text:text.trim()}));
 }else if(type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
  await inspectZip(bytes);const mammoth=await import('mammoth');const result=await mammoth.extractRawText({buffer:bytes},{externalFileAccess:false});
  chunks=result.value.split(/\n\s*\n/).filter(s=>s.trim()).map((text,i)=>({id:`paragraph-${i+1}`,label:`Paragraph ${i+1}`,text:text.trim()}));
 }else if(type==='application/pdf'){
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('The file does not have a PDF signature');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
  const document=await loading.promise;
  try{
   if(document.numPages>100)throw Error('PDF sources support up to 100 pages');
   let ocrPages=0;
   for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const page=await document.getPage(pageNumber),content=await page.getTextContent();
    let text=content.items.map(item=>'str'in item?item.str+('hasEOL'in item&&item.hasEOL?'\n':' '):'').join('').trim();let ocr=false;
    if(text.length<20){
     if(++ocrPages>20)throw Error('Split scanned documents into files of at most 20 scanned pages');
     const prefix=path.join(directory,`page-${pageNumber}`);
     try{
      execFileSync('pdftoppm',['-f',String(pageNumber),'-l',String(pageNumber),'-singlefile','-scale-to','1800','-png',path.join(directory,'input'),prefix],{timeout:15000,maxBuffer:1000000,stdio:['ignore','pipe','pipe']});
      text=execFileSync('tesseract',[prefix+'.png','stdout','-l','eng'],{timeout:20000,maxBuffer:2000000,stdio:['ignore','pipe','pipe']}).toString('utf8').trim();ocr=true;
     }catch{throw Error('Scanned-page OCR failed. Install Poppler and Tesseract with English language data, or upload reviewed source text.')}
    }
    chunks.push({id:`page-${pageNumber}`,label:`Page ${pageNumber}${ocr?' (OCR; verify against original)':''}`,text});
    page.cleanup();
   }
  }finally{await loading.destroy()}
 }else throw Error('Use a PDF, DOCX or UTF-8 text file');
 if(!chunks.some(c=>c.text.trim()))throw Error('No readable source text was found');
 if(chunks.length>3000||JSON.stringify(chunks).length>1000000)throw Error('Extracted source exceeds 1,000,000 characters; split the document');
 process.stdout.write(JSON.stringify({chunks}));
}
main().catch(error=>{process.stdout.write(JSON.stringify({error:error instanceof Error?error.message:'Source extraction failed'}));process.exitCode=1});
