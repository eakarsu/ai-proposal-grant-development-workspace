const fs=require('node:fs'),{parseEnv}=require('node:util'),{spawnSync}=require('node:child_process'),{PrismaClient}=require('@prisma/client');
async function main(){
 const source={...parseEnv(fs.readFileSync('.env','utf8')),...process.env},url=new URL(source.DATABASE_URL)
 if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Grant integration tests require local PostgreSQL')
 const database='inspection_test_grant_'+process.pid+'_'+Date.now();url.pathname='/postgres';url.searchParams.set('schema','public')
 const admin=new PrismaClient({datasources:{db:{url:url.toString()}}});let created=false
 try{
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);created=true;url.pathname='/'+database
  const env={...source,DATABASE_URL:url.toString(),OPENROUTER_API_KEY:'',DOMAIN_CONNECTORS_JSON:'',NODE_ENV:'test'}
  const run=(cmd,args)=>{const r=spawnSync(cmd,args,{env,stdio:'inherit'});if(r.status!==0)throw Error('Validation command failed')}
  run('npx',['prisma','migrate','deploy']);run('npx',['tsx','--test','--test-concurrency=1','tests/integration/grant-projects.test.ts','tests/integration/grant-ai.test.ts','tests/integration/grant-documents.test.ts','tests/integration/grant-billing.test.ts','tests/integration/grant-client-portal.test.ts']);run('node',['scripts/integration-test.cjs'])
 }finally{if(created)await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);await admin.$disconnect()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
