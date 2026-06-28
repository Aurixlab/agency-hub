import { randomBytes } from 'node:crypto';

console.log(`CRON_SECRET=${randomBytes(32).toString('base64url')}`);
console.log(`TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
console.log('META_GRAPH_API_VERSION=v21.0');
