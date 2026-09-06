const {readFileSync,mkdirSync,chmodSync}=require('node:fs'),{parseEnv}=require('node:util'),{spawnSync}=require('node:child_process'),path=require('node:path');
const project=path.basename(process.cwd());if(!['homeservices','beautyhqio','ai-proposal-grant-development-workspace','petGrooming','independentRestaurant'].includes(project))throw Error('Unsupported restore-check directory');
const url=new URL(parseEnv(readFileSync('.env','utf8')).DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Restore rehearsal requires a local PostgreSQL server');
const target=`restore_check_${process.pid}_${Date.now()}`,dir=`/Users/erolakarsu/.codex/backups/${project}`,archive=`${dir}/restore-verified-${Date.now()}.dump`;
mkdirSync(dir,{recursive:true,mode:0o700});const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
function run(cmd,args,pgDatabase=env.PGDATABASE,input){const result=spawnSync(cmd,args,{env:{...env,PGDATABASE:pgDatabase},encoding:'utf8',input});if(result.status!==0)throw Error(`${cmd} failed during restore rehearsal`);return result.stdout;}
let created=false;try{
 run('pg_dump',['-Fc','-f',archive]);chmodSync(archive,0o600);run('pg_restore',['--list',archive]);
 run('psql',['-X','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE "${target}"`],'postgres');created=true;
 run('pg_restore',['--exit-on-error','--no-owner','--no-privileges','-d',target,archive],target);
 const summary=run('psql',['-X','-At','-v','ON_ERROR_STOP=1','-c',`SELECT json_build_object('tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'invalidIndexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND NOT i.indisvalid),'constraints',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON c.connamespace=n.oid WHERE n.nspname='public'));`],target).trim();
 const stats=JSON.parse(summary);if(!stats.tables||stats.invalidIndexes)throw Error('Restored schema validation failed');
 // Force a complete read of every public table, including any TOASTed data.
 run('psql',['-X','-v','ON_ERROR_STOP=1','-c',`DO $$ DECLARE t record; n bigint; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('SELECT count(*) FROM (SELECT md5(row_to_json(r)::text) FROM public.%I r) x WHERE md5 IS NOT NULL',t.tablename) INTO n; END LOOP; END $$;`],target);
 console.log(JSON.stringify({project,archive,...stats,fullRestore:'passed',tableReads:'passed'}));
}finally{if(created)run('psql',['-X','-v','ON_ERROR_STOP=1','-c',`DROP DATABASE "${target}" WITH (FORCE)`],'postgres');}
