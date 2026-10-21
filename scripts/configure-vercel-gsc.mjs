// Run with: node scripts/configure-vercel-gsc.mjs
// Adds missing production GSC/MCP variables through Vercel CLI. Never exports
// existing values or rotates existing secrets. Requires `vercel login` first.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const scope = 'aurixlabs-projects';
const project = 'agency-hub';
const origin = 'https://agency-hub-lilac.vercel.app';
const npx = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
function cli(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npx, '--yes', 'vercel@65.0.0', ...args, '--scope', scope], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    // Avoid forwarding CLI output: future versions may print readable values.
    child.stderr.resume();
    child.on('error', () => reject(new Error('Unable to start Vercel CLI')));
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Vercel CLI failed for ${args[0]} (exit ${code}); no values printed`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}
async function keys() {
  const response = JSON.parse(await cli(['api', `/v10/projects/${project}/env`]));
  if (!Array.isArray(response.envs)) throw new Error('Unexpected Vercel environment metadata response');
  return new Set(response.envs.filter(env => env.target?.includes('production')).map(env => env.key));
}

const existing = await keys();
const values = {
  GSC_ALLOWED_CLIENT_SLUGS: 'aurixlab,budget-promotion,cpc-clinics',
  MCP_ORIGIN: origin,
  MCP_CLIENT_ID: 'aurixlab-gsc',
  MCP_REDIRECT_URIS: 'https://claude.ai/api/mcp/auth_callback,http://localhost:8080/callback',
};
for (const [name, value] of Object.entries(values)) {
  if (existing.has(name)) { console.log(`Preserved ${name}`); continue; }
  await cli(['env', 'add', name, '--environment', 'production', '--project', project, '--no-sensitive', '--yes'], value);
  console.log(`Added ${name}`);
}
for (const name of ['MCP_CLIENT_SECRET', 'MCP_SIGNING_SECRET']) {
  if (existing.has(name)) { console.log(`Preserved ${name}`); continue; }
  let value = randomBytes(32).toString('base64');
  if (name === 'MCP_CLIENT_SECRET') {
    // Keep only the newly generated client secret locally for Claude setup.
    // .vercel is git-ignored. This does not export any existing production secret.
    await mkdir('.vercel', { recursive: true });
    const file = '.vercel/claude-oauth-client-secret.txt';
    try { value = (await readFile(file, 'utf8')).trim(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeFile(file, value, { flag: 'wx', mode: 0o600 });
    }
    if (value.length < 32) throw new Error('Invalid locally generated MCP client secret');
  }
  await cli(['env', 'add', name, '--environment', 'production', '--project', project, '--sensitive', '--yes'], value);
  console.log(`Added ${name} (sensitive)`);
}
const required = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_SECRET', 'TOKEN_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'CRON_SECRET', ...Object.keys(values), 'MCP_CLIENT_SECRET', 'MCP_SIGNING_SECRET'];
const configured = await keys();
const missing = required.filter(name => !configured.has(name));
console.log(JSON.stringify({ project, productionOrigin: origin, requiredCount: required.length, presentCount: required.length - missing.length, missing }));
if (missing.length) process.exitCode = 1;
