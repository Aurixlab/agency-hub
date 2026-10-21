# Google Search Console + Claude on Vercel

The existing Next.js deployment hosts the dashboard, Google API service and a
stateless Streamable HTTP MCP endpoint at `/api/mcp`. No Cloudflare or Redis is
required. This implementation uses the official MCP TypeScript SDK.

## 1. Prepare the database and Vercel settings

Run `scripts/sql/gsc-connection.sql` once in the existing Supabase/PostgreSQL SQL
editor. It creates an encrypted credential store and enables RLS without browser
policies. The existing Prisma database role must be able to read/write it. This is
an additive change; do not reset the existing database. `npm run build` regenerates
the Prisma client. OAuth grants use the existing `sessions` table; they store only
digests, are consumed atomically, and expired grants are removed during SEO sync.

Configure these **server-side** Vercel environment variables for Production:

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Existing Prisma database settings |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing SEO database settings |
| `AUTH_SECRET` | Existing app session secret; at least 32 characters for Google connection |
| `TOKEN_ENCRYPTION_KEY` | Base64-encoded random 32-byte key; preserve any existing posting encryption key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Web application OAuth credentials |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-DOMAIN/api/auth/google/callback` |
| `GSC_ALLOWED_CLIENT_SLUGS` | `aurixlab,budget-promotion,cpc-clinics` (verify against `seo_clients`) |
| `MCP_ORIGIN` | `https://YOUR-DOMAIN` without a trailing slash; use a stable domain |
| `MCP_CLIENT_ID` | `aurixlab-gsc` |
| `MCP_CLIENT_SECRET` | A separately generated random client secret |
| `MCP_SIGNING_SECRET` | Another random secret, at least 32 characters |
| `MCP_REDIRECT_URIS` | Exact comma-separated Claude callback URLs; see below |
| `CRON_SECRET` | Existing Vercel cron bearer secret |

Generate independent secrets locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
Do not paste secrets into chat or commit them. Redeploy after changing settings.
Vercel deployment protection must allow the MCP, discovery and OAuth routes to be
reachable by Claude. Application OAuth still protects the data.

`GOOGLE_REFRESH_TOKEN` is an optional legacy fallback. The encrypted database
connection takes priority. An existing environment-based installation can keep
working before the new table is provisioned.

## 2. Connect Google once

1. Enable the Google Search Console API in the Google Cloud project.
2. Configure the consent screen and a **Web application** OAuth client. Register
   exactly the `GOOGLE_REDIRECT_URI` above, using your actual deployed domain.
3. Request only `https://www.googleapis.com/auth/webmasters.readonly`. If the app
   is External + Testing, Google refresh tokens for this scope expire after seven
   days. Configure an appropriate production/internal app state for unattended use.
4. Sign in to Agency Hub as an active ADMIN who has finished changing their initial
   password. On `/seo`, click **Connect Google** and choose the Google account that
   has access to all three properties.
5. Google returns to Agency Hub. The refresh token is encrypted with AES-256-GCM
   and stored in PostgreSQL, never included in the callback response or MCP output.

`seo_clients.gsc_property_url` must exactly match Google's property identifier:
`sc-domain:example.com` or a URL-prefix property such as `https://example.com/`.
Google sign-in for app users (`AUTH_GOOGLE_*`) is separate from this GSC connection.
The old `scripts/get-gsc-token.mjs` uses Google's retired OOB flow; use the hosted
Connect Google flow instead.

## 3. Connect Claude chat

Set `MCP_REDIRECT_URIS` to include `https://claude.ai/api/mcp/auth_callback`, or the
exact callback shown by your Claude connector setup. Never allow arbitrary domains
or wildcard callbacks.

In Claude, open Customize → Connectors → Add custom connector:

- URL: `https://YOUR-DOMAIN/api/mcp`
- Authentication: sign in
- OAuth client: **Use your own OAuth client**
- Client ID / secret: your `MCP_CLIENT_ID` / `MCP_CLIENT_SECRET`

This server intentionally supports a pre-registered client. It does not advertise
dynamic registration or Claude's published-identity flow. Do not enter your Google
client credentials into these MCP client fields.

Sign in to Agency Hub in the same browser, reload the consent page if necessary,
then approve read-only access. The consent page validates the real admin session.
OAuth uses S256 PKCE, exact callback matching, five-minute single-use authorization
codes, one-hour audience-bound access tokens and rotating 30-day refresh tokens.
Every MCP request rechecks that the administrator is active. Disabling the admin
immediately blocks tool access. Rotating `MCP_SIGNING_SECRET` invalidates all MCP
tokens. Disconnecting Claude locally does not revoke Google access.

## 4. Connect Claude Code

Use the same endpoint and client credentials:

```sh
claude mcp add --transport http --client-id aurixlab-gsc --client-secret --callback-port 8080 aurixlab-gsc https://YOUR-DOMAIN/api/mcp
```

`--client-secret` prompts for the secret without including it in the command.
Include Claude Code's exact loopback callback in `MCP_REDIRECT_URIS` as well. With
port 8080 this is normally `http://localhost:8080/callback`; confirm the actual
`redirect_uri` generated by your Claude Code version. Do not add arbitrary ports.
Run `/mcp` in Claude Code and complete authorization.

## 5. Verify data and use the tools

Ask Claude:

> List my approved clients and verify Google property permissions. Fetch finalized
> property totals for each for the last complete seven-day period. Include the
> exact dates, search type and retrieval timestamp. Then identify pages with
> declining clicks compared with the previous equal-length period.

Tools: `list_clients`, `get_performance`, `get_queries`, `get_pages`,
`compare_periods`, `inspect_url`, and `get_sitemaps`. All are read-only. Only
properties mapped to the explicit slug allowlist are exposed.

`get_performance` accepts explicit dates, dimensions, filters, search type,
`dataState`, `rowLimit` (up to 25,000), and `startRow`. Follow `nextStartRow` for
another page; this does not bypass Google's daily export limits. Use
`dimensions: []` for property totals. Query/page rows can omit data and must not be
summed to reconstruct full site totals. CTR is returned as a fraction.

For recent hourly data, use `dimensions: ["hour"]` and
`dataState: "hourly_all"` with a date range in the latest ten days. For recent
daily data use `dataState: "all"`; for settled reports use `"final"`. Fresh results
are provisional and Google's incomplete-data metadata is retained. Google data
has processing delays: this is not instantaneous click/visitor monitoring.
Daily GSC dates use Pacific time; hour keys include timezone offsets.

The shared authenticated dashboard endpoint is `POST /api/seo/live` with the same
analytics JSON arguments. Existing dashboard charts use stored daily snapshots.
The daily Vercel cron refreshes five days; **Sync Now** refreshes the selected
client and selected 7/30/90-day period. Syncs are limited to three clients at once
and upstream calls have timeouts. Large historical imports should be split into
multiple date ranges/clients. No heavy backfill runs inside an MCP request.

Full Page indexing coverage is unavailable through this API. Sitemap counts are
not presented as full indexing totals; use URL Inspection for individual URLs.
The existing stored keyword history includes only the top 50 queries per synced
day. Use live tools for wider query requests; historical keyword tables are not a
complete archive. Larger-volume storage can be added separately with BigQuery.

## Validation and deployment boundary

Run `npm run test:gsc`, `npx tsc --noEmit`, and `npm run build`. The tests cover
metric aggregation, input validation, PKCE and redirect binding, code replay,
refresh rotation, expired/tampered tokens, anonymous MCP rejection and discovery
of the seven read-only tools. Tests use a fake grant store, not production data.

This repository alone cannot verify live Google permissions, deployment secrets,
database access, or the Claude browser consent flow. After deploying, complete
Google authorization and compare all three properties with the GSC UI using the
same date range, filters and search type.

`npm audit` also reports vulnerabilities in the current dependency tree, including
the existing Next.js/Auth.js versions and the MCP SDK. The MCP surface validates
its own audience-bound tokens, has no task support, and bounds incoming JSON size
and depth. These controls do not replace dependency security updates. Review and
upgrade affected packages before making this a production client-data service.

References:
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://code.claude.com/docs/en/mcp
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
