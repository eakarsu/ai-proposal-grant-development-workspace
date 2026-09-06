// Release only this project's listeners before migrations, builds, or startup.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = fs.realpathSync(path.resolve(__dirname, '..'));
const ports = [...new Set(process.argv.slice(2))];
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`Required startup command unavailable: ${command}`);
  return result;
}
function listeners(port) {
  const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  if (result.status !== 0 && result.status !== 1) throw new Error(`Cannot inspect port ${port}`);
  return [...new Set(result.stdout.trim().split(/\s+/).filter(Boolean).map(Number))];
}
function cwd(pid) {
  const result = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const line = result.stdout.split('\n').find(value => value.startsWith('n'));
  if (!line) return null;
  try { return fs.realpathSync(line.slice(1)); } catch { return null; }
}
function owned(pid) {
  const directory = cwd(pid);
  return directory === project || directory?.startsWith(project + path.sep);
}
function identity(pid) {
  const result = run('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command=']);
  return result.status === 0 ? result.stdout.trim() : null;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  if (!ports.length || ports.some(port => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error('Assigned ports must be integers from 1 to 65535');
  const rows = run('ps', ['-axo', 'pid=,ppid=,command=']).stdout.split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean).map(([, pid, parent, command]) => ({ pid: Number(pid), parent: Number(parent), command }));
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const roots = new Set();
  // Inspect every requested port before stopping anything.
  for (const port of ports) for (const pid of listeners(port)) {
    if (!owned(pid)) throw new Error(`Port ${port} belongs to another application (PID ${pid}); it was not stopped.`);
    let root = pid;
    while (true) {
      const parent = byPid.get(byPid.get(root)?.parent);
      if (!parent || parent.pid === process.pid || parent.pid === process.ppid || !owned(parent.pid)) break;
      if (!/^(?:\S*\/)?(?:node|npm|next)(?:\s|$)|^(?:\S*\/)?(?:bash|sh|zsh)\s+(?:\S*\/)?start\.sh(?:\s|$)/.test(parent.command)) break;
      root = parent.pid;
    }
    roots.add(root);
    console.log(`Releasing ${path.basename(project)} port ${port} (PID ${pid})`);
  }
  const targets = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (targets.has(row.parent) && !targets.has(row.pid)) { targets.add(row.pid); changed = true; }
  }
  if (targets.has(process.pid) || targets.has(process.ppid)) throw new Error('Refusing to stop the current startup process');
  const identities = new Map([...targets].map(pid => [pid, identity(pid)]));
  function signal(pid, name) {
    if (!identities.get(pid) || identity(pid) !== identities.get(pid)) return;
    try { process.kill(pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  for (const pid of targets) signal(pid, 'SIGTERM');
  const deadline = Date.now() + 5000;
  while ([...targets].some(pid => identity(pid) === identities.get(pid) && identities.get(pid)) && Date.now() < deadline) await pause(100);
  for (const pid of targets) signal(pid, 'SIGKILL');
  for (let attempt = 0; attempt < 20; attempt++) {
    if (ports.every(port => listeners(port).length === 0)) { console.log(`Startup ports are free: ${ports.join(', ')}`); return; }
    await pause(100);
  }
  throw new Error('A startup port is still occupied; no new server was launched');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
