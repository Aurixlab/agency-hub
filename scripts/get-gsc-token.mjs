/**
 * Run this once to get a fresh GSC refresh token:
 *   node scripts/get-gsc-token.mjs
 *
 * Then paste the refresh_token value into your .env as GOOGLE_REFRESH_TOKEN=
 */

import { readFileSync } from 'fs';
import { createServer } from 'http';
import { URL } from 'url';
import readline from 'readline';

// Load .env manually (no dotenv dep needed for a one-off script)
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const CLIENT_ID     = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
// We use a loopback redirect so no running server is needed
const REDIRECT_URI  = 'urn:ietf:wg:oauth:2.0:oob';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing from .env');
  process.exit(1);
}

// GSC read-only scope (add webmasters for write access)
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
].join(' ');

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;           // ← forces refresh_token to be returned every time

console.log('\n─────────────────────────────────────────────────────────────');
console.log('  GSC Token Generator');
console.log('─────────────────────────────────────────────────────────────');
console.log('\n1. Open this URL in your browser (the Google account that owns');
console.log('   the Search Console properties):\n');
console.log('  ', authUrl);
console.log('\n2. Approve the permission request.');
console.log('3. Copy the authorization code shown on the page.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  code = code.trim();

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error('\n❌  Token exchange failed:', data.error, data.error_description);
      process.exit(1);
    }

    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('✅  Success! Add this line to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('Then restart your dev server.');

    if (!data.refresh_token) {
      console.warn('\n⚠️  No refresh_token in response.');
      console.warn('   Make sure you used prompt=consent in the URL above.');
      console.warn('   Also revoke old tokens at: https://myaccount.google.com/permissions');
    }
  } catch (e) {
    console.error('\n❌  Fetch error:', e.message);
    process.exit(1);
  }
});
