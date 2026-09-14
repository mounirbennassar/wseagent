import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(`${root}.venv/bin/python`)) { console.error('Run npm run setup first.'); process.exit(1); }
const children = [
 spawn(`${root}.venv/bin/python`, ['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8010','--reload'], {cwd:root,stdio:'inherit'}),
 spawn('npm',['run','dev','--prefix','frontend'],{cwd:root,stdio:'inherit'}),
];
let stopping = false;
function stop(code = 0) { if(stopping) return; stopping=true; for(const child of children) child.kill('SIGTERM'); process.exitCode=code; }
for (const child of children) { child.on('exit',code=>stop(code || 0)); child.on('error',error=>{console.error(error.message);stop(1)}); }
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
