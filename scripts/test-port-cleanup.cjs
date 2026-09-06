const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const helper = path.join(__dirname, 'clear-project-ports.cjs');
async function server(cwd) {
  const child = spawn(process.execPath, ['-e', "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port));"], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    child.stdout.once('data', data => resolve(Number(String(data).trim())));
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Fixture exited before listening')));
  });
  return { child, port };
}
const alive = child => child.exitCode === null && child.signalCode === null;
const tick = () => new Promise(resolve => setTimeout(resolve, 50));
(async () => {
  const own = await server(project);
  try {
    const result = spawnSync(process.execPath, [helper, String(own.port)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await tick(); assert.equal(alive(own.child), false);
    console.log('Existing project listener stopped and port released');
  } finally { if (alive(own.child)) own.child.kill('SIGKILL'); }
  const first = await server(project), foreign = await server(os.tmpdir());
  try {
    const result = spawnSync(process.execPath, [helper, String(first.port), String(foreign.port)], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /another application/);
    assert.ok(alive(first.child)); assert.ok(alive(foreign.child));
    console.log('Foreign port owner rejected before stopping any listener');
  } finally { first.child.kill(); foreign.child.kill(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
