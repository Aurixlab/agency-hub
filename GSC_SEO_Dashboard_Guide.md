# Google Search Console SEO Dashboard — Integration Guide
### For Agency Hub (React + Node.js + Supabase) — Calgary Clients

---

## Overview

This guide walks you through adding a real Google Search Console (GSC) data layer to your existing Agency Hub. By the end you will have:

- A `/seo` dashboard route in your Next.js App Router
- GSC OAuth2 authentication via Next.js API routes
- Supabase tables that store daily snapshots for month-over-month comparisons
- A one-time backfill script that loads up to 13 months of historical data
- A scheduled nightly sync job that keeps data up to date automatically
- Three client views (Aurix Lab, Budget Promotion, CPC Clinics) plus an overview

### Dashboard Features

**Overview Dashboard**
- All 3 clients combined — total clicks, impressions, CTR, avg position
- Individual client cards side by side for quick comparison
- Daily snapshot view
- Weekly digest view
- Monthly summary view

**Individual Client View**
- Performance chart — clicks and impressions over time
- CTR and avg position trends
- Indexing status

**Keyword Rankings**
- Top queries per client
- Position tracking over time
- Month-over-month ranking comparison

**Indexing**
- Pages indexed vs not indexed
- Coverage status per property

**Reports (Downloadable)**
- Monthly PDF report per client — auto-generated at month end with full ranking comparison, traffic summary, and indexing status
- Weekly digest — summary of week's performance vs previous week
- Daily overview — quick daily snapshot of clicks, impressions, top keywords

### GSC Properties
| Client | GSC Property URL | Slug |
|---|---|---|
| Aurix Lab | `https://www.aurixlab.com/` | `aurixlab` |
| Budget Promotion | `https://budgetpromotion.ca/` | `budget-promotion` |
| CPC Clinics | `https://cpcclinics.ca/` | `cpc-clinics` |

---

## Architecture

```
Next.js App Router (Vercel)
    ↕ API Routes (src/app/api)
Google Search Console API (OAuth2)
    ↕ One-time backfill + nightly cron
Supabase (PostgreSQL)
    ↕ Read
SEO Dashboard (/seo)
```

---

## Phase 1 — Google API Setup

### Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project, e.g. `aurix-agency-hub`
3. Enable the **Google Search Console API** under APIs & Services → Library

### Step 2: Set Up OAuth2 Credentials

> Use OAuth2 (not Service Account) because GSC permissions are tied to user Google accounts, not service accounts.

1. Go to APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Authorized JavaScript origin: `http://localhost:3001` (dev)
4. Authorized redirect URI: `http://localhost:3001/api/auth/google/callback` (dev)
5. Download the JSON — never commit this file, add `client_secret*.json` to `.gitignore`
6. Add your credentials to `.env`:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=         ← filled in after one-time auth flow
```

### Step 3: One-Time Auth Flow (Get Your Refresh Token)

Create two Next.js API routes:

**`src/app/api/auth/google/route.ts`** — redirects to Google sign-in:

```typescript
import { google } from 'googleapis';
import { redirect } from 'next/navigation';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET() {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/webmasters.readonly']
  });
  redirect(url);
}
```

**`src/app/api/auth/google/callback/route.ts`** — captures the refresh token:

```typescript
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'No code provided' }, { status: 400 });

  try {
    const { tokens } = await oauth2Client.getToken(code);
    return NextResponse.json({
      message: 'SUCCESS! Copy the refresh_token below into your .env file.',
      refresh_token: tokens.refresh_token,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to exchange code' }, { status: 500 });
  }
}
```

Visit `http://localhost:3001/api/auth/google`, sign in with `aurixlab@gmail.com`, copy the `refresh_token` into your `.env`. This is done once — the token persists indefinitely.

---

## Phase 2 — Supabase Schema

Run these in your Supabase SQL editor.

### Clients Table

```sql
create table seo_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gsc_property_url text not null unique,
  slug text not null unique,
  created_at timestamptz default now()
);

insert into seo_clients (name, gsc_property_url, slug) values
  ('Aurix Lab',        'https://www.aurixlab.com/',   'aurixlab'),
  ('Budget Promotion', 'https://budgetpromotion.ca/', 'budget-promotion'),
  ('CPC Clinics',      'https://cpcclinics.ca/',      'cpc-clinics');
```

### Daily Snapshot Table

```sql
create table seo_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  date date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(5,4) not null default 0,
  avg_position numeric(5,2) not null default 0,
  created_at timestamptz default now(),
  unique(client_id, date)
);
```

### Keyword Rankings Table

```sql
create table seo_keyword_rankings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  date date not null,
  keyword text not null,
  position numeric(6,2) not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(5,4) not null default 0,
  created_at timestamptz default now(),
  unique(client_id, date, keyword)
);

create index on seo_keyword_rankings(client_id, date);
```

### Indexing Table

```sql
create table seo_indexing (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  date date not null,
  indexed_pages integer not null default 0,
  not_indexed_pages integer not null default 0,
  coverage_issues jsonb,
  created_at timestamptz default now(),
  unique(client_id, date)
);
```

### Monthly Comparison View

```sql
create view seo_monthly_keyword_comparison as
select
  a.client_id,
  a.keyword,
  a.date as current_month_start,
  a.position as current_position,
  b.position as prev_position,
  (b.position - a.position) as position_delta
from seo_keyword_rankings a
join seo_keyword_rankings b
  on a.client_id = b.client_id
  and a.keyword = b.keyword
  and date_trunc('month', b.date) = date_trunc('month', a.date) - interval '1 month'
where date_trunc('month', a.date) = date_trunc('month', current_date);
```

### Reports Table

```sql
create table seo_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_at timestamptz default now()
);
```

### Full Schema — Run All at Once

```sql
create table seo_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gsc_property_url text not null unique,
  slug text not null unique,
  created_at timestamptz default now()
);

create table seo_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  date date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(5,4) not null default 0,
  avg_position numeric(5,2) not null default 0,
  created_at timestamptz default now(),
  unique(client_id, date)
);

create table seo_keyword_rankings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  date date not null,
  keyword text not null,
  position numeric(6,2) not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(5,4) not null default 0,
  created_at timestamptz default now(),
  unique(client_id, date, keyword)
);

create index on seo_keyword_rankings(client_id, date);

create table seo_indexing (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  date date not null,
  indexed_pages integer not null default 0,
  not_indexed_pages integer not null default 0,
  coverage_issues jsonb,
  created_at timestamptz default now(),
  unique(client_id, date)
);

create table seo_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_at timestamptz default now()
);

insert into seo_clients (name, gsc_property_url, slug) values
  ('Aurix Lab',        'https://www.aurixlab.com/',   'aurixlab'),
  ('Budget Promotion', 'https://budgetpromotion.ca/', 'budget-promotion'),
  ('CPC Clinics',      'https://cpcclinics.ca/',      'cpc-clinics');
```

---

## Phase 3 — Historical Data Backfill

> GSC stores up to 13 months of historical data. Since you already have real data going back to May 2025, run this one-time backfill script to load everything into Supabase before the nightly sync starts. This gives your month-over-month comparisons real historical context from day one instead of starting from zero.

### What the backfill does:
1. Pulls all historical data from GSC for all 3 properties (back to ~April 2025)
2. Stores it in Supabase exactly the same way the nightly sync does
3. From today onwards the nightly cron takes over automatically

### Install Dependencies

```bash
npm install googleapis @supabase/supabase-js dotenv
```

### Backfill Script (`scripts/backfillGSC.mjs`)

Create this file in your project root and run it once:

```javascript
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const searchConsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GSC gives 13 months of history — start from April 2025
const BACKFILL_START = '2025-04-01';
const BACKFILL_END = new Date().toISOString().split('T')[0];

async function backfillClient(client) {
  console.log(`\nBackfilling ${client.name}...`);

  // 1. Backfill daily site metrics (chunks of 90 days to avoid limits)
  let currentStart = new Date(BACKFILL_START);
  const endDate = new Date(BACKFILL_END);

  while (currentStart < endDate) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setDate(chunkEnd.getDate() + 89);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const startStr = currentStart.toISOString().split('T')[0];
    const endStr = chunkEnd.toISOString().split('T')[0];

    const res = await searchConsole.searchanalytics.query({
      siteUrl: client.gsc_property_url,
      requestBody: {
        startDate: startStr,
        endDate: endStr,
        dimensions: ['date'],
        rowLimit: 90
      }
    });

    const rows = res.data.rows || [];
    for (const row of rows) {
      await supabase.from('seo_daily_snapshots').upsert({
        client_id: client.id,
        date: row.keys[0],
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: row.ctr,
        avg_position: row.position
      }, { onConflict: 'client_id,date' });
    }

    console.log(`  ✓ Metrics ${startStr} → ${endStr}: ${rows.length} days`);
    currentStart.setDate(currentStart.getDate() + 90);
    await new Promise(r => setTimeout(r, 1000)); // rate limit pause
  }

  // 2. Backfill keyword rankings (monthly chunks)
  let kwStart = new Date(BACKFILL_START);
  while (kwStart < endDate) {
    const kwEnd = new Date(kwStart);
    kwEnd.setMonth(kwEnd.getMonth() + 1);
    kwEnd.setDate(kwEnd.getDate() - 1);
    if (kwEnd > endDate) kwEnd.setTime(endDate.getTime());

    const startStr = kwStart.toISOString().split('T')[0];
    const endStr = kwEnd.toISOString().split('T')[0];

    const res = await searchConsole.searchanalytics.query({
      siteUrl: client.gsc_property_url,
      requestBody: {
        startDate: startStr,
        endDate: endStr,
        dimensions: ['query'],
        dimensionFilterGroups: [{
          filters: [{ dimension: 'country', operator: 'equals', expression: 'can' }]
        }],
        rowLimit: 100,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }]
      }
    });

    const rows = res.data.rows || [];
    const kwRows = rows.map(row => ({
      client_id: client.id,
      date: endStr,
      keyword: row.keys[0],
      position: row.position,
      clicks: Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr: row.ctr
    }));

    if (kwRows.length > 0) {
      await supabase.from('seo_keyword_rankings').upsert(kwRows, {
        onConflict: 'client_id,date,keyword'
      });
    }

    console.log(`  ✓ Keywords ${startStr} → ${endStr}: ${kwRows.length} keywords`);
    kwStart.setMonth(kwStart.getMonth() + 1);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`✅ ${client.name} backfill complete`);
}

async function runBackfill() {
  const { data: clients } = await supabase.from('seo_clients').select('*');
  for (const client of clients) {
    await backfillClient(client);
  }
  console.log('\n🎉 All clients backfilled successfully!');
}

runBackfill().catch(console.error);
```

### Run the backfill

Add to your `package.json` scripts:

```json
"scripts": {
  "backfill": "node scripts/backfillGSC.mjs"
}
```

Then run:

```bash
npm run backfill
```

This will take 5-10 minutes to complete for all 3 clients. After it's done, your Supabase tables will have 13 months of real data and month-over-month comparisons will work immediately.

---

## Phase 4 — Next.js API Routes (GSC Service)

### Install Dependencies

```bash
npm install googleapis @supabase/supabase-js node-cron dotenv
```

### OAuth2 Setup (`/src/lib/gscClient.ts`)

```javascript
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Generate auth URL for first-time setup
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/webmasters.readonly']
  });
}

// Exchange code for tokens (run once per Google account)
async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

module.exports = { oauth2Client, getAuthUrl, getTokens };
```

> **One-time setup**: Visit `/auth/google` in your browser, authorize, and save the returned `refresh_token` to your `.env` as `GOOGLE_REFRESH_TOKEN`. You only do this once. The refresh token persists indefinitely unless revoked.

### GSC Data Fetcher (`/src/services/gscService.js`)

```typescript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const searchConsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

export async function getSiteMetrics(propertyUrl: string, startDate: string, endDate: string) {
  try {
    const res = await searchConsole.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 90,
      },
    });
    return res.data.rows || [];
  } catch (error) {
    console.error(`Error fetching site metrics for ${propertyUrl}:`, error);
    throw error;
  }
}

export async function getKeywordRankings(
  propertyUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 50
) {
  try {
    const res = await searchConsole.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit,
        // Note: orderBy not supported in current googleapis types — sort in JS below
      },
    });
    const rows = res.data.rows || [];
    return rows.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
  } catch (error) {
    console.error(`Error fetching keyword rankings for ${propertyUrl}:`, error);
    throw error;
  }
}
```

### Daily Sync Job (`/src/jobs/syncSeoData.js`)

```javascript
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { getSiteMetrics, getKeywordRankings } = require('../services/gscService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncClient(client, date) {
  const startDate = date;  // sync yesterday's confirmed data
  const endDate = date;

  // 1. Sync site-level metrics
  const metrics = await getSiteMetrics(client.gsc_property_url, startDate, endDate);
  for (const row of metrics) {
    await supabase.from('seo_daily_snapshots').upsert({
      client_id: client.id,
      date: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      avg_position: row.position
    }, { onConflict: 'client_id,date' });
  }

  // 2. Sync keyword rankings
  const keywords = await getKeywordRankings(client.gsc_property_url, startDate, endDate);
  const kwRows = keywords.map(row => ({
    client_id: client.id,
    date: endDate,
    keyword: row.keys[0],
    position: row.position,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr
  }));
  if (kwRows.length > 0) {
    await supabase.from('seo_keyword_rankings').upsert(kwRows, {
      onConflict: 'client_id,date,keyword'
    });
  }

  console.log(`Synced ${client.name}: ${metrics.length} days, ${kwRows.length} keywords`);
}

async function runSync() {
  // GSC data is typically 2-3 days delayed; sync yesterday to be safe
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  const { data: clients } = await supabase.from('seo_clients').select('*');
  for (const client of clients) {
    await syncClient(client, date);
  }
}

// Run every day at 3:00 AM Calgary time (UTC-6/7)
cron.schedule('0 9 * * *', runSync);  // 9 AM UTC = 3 AM MDT

module.exports = { runSync };
```

### API Routes (`/src/routes/seo.js`)

```javascript
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/seo/overview?period=30
router.get('/overview', async (req, res) => {
  const days = parseInt(req.query.period) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('seo_daily_snapshots')
    .select('*, seo_clients(name, slug)')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  res.json(data);
});

// GET /api/seo/client/:slug?period=30
router.get('/client/:slug', async (req, res) => {
  const { slug } = req.params;
  const days = parseInt(req.query.period) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data: client } = await supabase
    .from('seo_clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!client) return res.status(404).json({ error: 'Client not found' });

  const { data: snapshots } = await supabase
    .from('seo_daily_snapshots')
    .select('*')
    .eq('client_id', client.id)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  const { data: keywords } = await supabase
    .from('seo_keyword_rankings')
    .select('*')
    .eq('client_id', client.id)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('clicks', { ascending: false })
    .limit(20);

  res.json({ client, snapshots, keywords });
});

// GET /api/seo/comparison/:slug — month vs prior month keyword delta
router.get('/comparison/:slug', async (req, res) => {
  const { slug } = req.params;
  const { data: client } = await supabase
    .from('seo_clients').select('id').eq('slug', slug).single();

  const { data } = await supabase
    .from('seo_monthly_keyword_comparison')
    .select('*')
    .eq('client_id', client.id)
    .order('position_delta', { ascending: false })
    .limit(20);

  res.json(data);
});

module.exports = router;
```

---

## Phase 5 — React Dashboard

### Install Frontend Dependencies

```bash
npm install recharts date-fns
```

### Folder Structure

```
src/
  app/
    api/
      auth/google/route.ts         ← OAuth2 redirect
      auth/google/callback/route.ts ← captures refresh token
      seo/overview/route.ts
      seo/client/[slug]/route.ts
      seo/comparison/[slug]/route.ts
      cron/sync-seo/route.ts        ← nightly sync
  pages/
    SEODashboard.jsx               ← main page, tab routing
  components/seo/
    MetricCards.jsx
    KeywordTable.jsx
    RankingComparison.jsx
    TrendChart.jsx
    IndexingStatus.jsx             ← pages indexed vs not indexed
    ClientSelector.jsx
  hooks/
    useSeoData.js
  lib/
    gscClient.ts                   ← shared OAuth2 client
  scripts/
    backfillGSC.mjs                ← run once to load history
```

### Data Hook (`/src/hooks/useSeoData.js`)

```javascript
import { useState, useEffect } from 'react';

export function useSeoData(slug = null, period = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = slug
      ? `/api/seo/client/${slug}?period=${period}`
      : `/api/seo/overview?period=${period}`;

    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, period]);

  return { data, loading };
}
```

### Main Dashboard Page (`/src/pages/SEODashboard.jsx`)

```jsx
import { useState } from 'react';
import { useSeoData } from '../hooks/useSeoData';
import MetricCards from '../components/seo/MetricCards';
import TrendChart from '../components/seo/TrendChart';
import KeywordTable from '../components/seo/KeywordTable';
import RankingComparison from '../components/seo/RankingComparison';
import IndexingStatus from '../components/seo/IndexingStatus';

const CLIENTS = [
  { label: 'Overview',          slug: null               },
  { label: 'Aurix Lab',         slug: 'aurixlab'         },
  { label: 'Budget Promotion',  slug: 'budget-promotion' },
  { label: 'CPC Clinics',       slug: 'cpc-clinics'      },
];

export default function SEODashboard() {
  const [activeClient, setActiveClient] = useState(CLIENTS[0]);
  const [period, setPeriod] = useState(30);
  const { data, loading } = useSeoData(activeClient.slug, period);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {CLIENTS.map(c => (
            <button
              key={c.label}
              onClick={() => setActiveClient(c)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition
                ${activeClient.slug === c.slug
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 hover:border-gray-400'}`}
            >{c.label}</button>
          ))}
        </div>
        <select value={period} onChange={e => setPeriod(Number(e.target.value))}
          className="text-sm border rounded-lg px-3 py-1.5">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading ? <p className="text-gray-400">Loading...</p> : (
        <>
          <MetricCards data={data} />
          <div className="grid grid-cols-2 gap-4 mt-4">
            <TrendChart snapshots={data?.snapshots} />
            <RankingComparison slug={activeClient.slug} />
          </div>
          <KeywordTable keywords={data?.keywords} />
        </>
      )}
    </div>
  );
}
```

---

## Phase 6 — Month-over-Month Comparison Logic

The comparison works by querying the same keywords across two date ranges and computing position delta.

### How Position Delta Is Calculated

```
delta = previous_month_avg_position - current_month_avg_position
```

A **positive delta** means the keyword moved UP in rankings (improved). A **negative delta** means it dropped.

In the `seo_monthly_keyword_comparison` view (defined above in Supabase), this is pre-computed. On the frontend, display it with colour coding:

```jsx
const PositionDelta = ({ delta }) => {
  if (delta > 0) return <span className="text-green-600">↑{delta}</span>;
  if (delta < 0) return <span className="text-red-500">↓{Math.abs(delta)}</span>;
  return <span className="text-gray-400">—</span>;
};
```

### Manual Month Comparison Query (alternative)

```javascript
async function getMonthComparison(clientId, currentMonth, prevMonth) {
  // Get current month averages per keyword
  const { data: current } = await supabase
    .from('seo_keyword_rankings')
    .select('keyword, position, clicks')
    .eq('client_id', clientId)
    .gte('date', currentMonth.start)
    .lte('date', currentMonth.end);

  // Get previous month averages
  const { data: prev } = await supabase
    .from('seo_keyword_rankings')
    .select('keyword, position')
    .eq('client_id', clientId)
    .gte('date', prevMonth.start)
    .lte('date', prevMonth.end);

  // Merge and compute delta
  return current.map(curr => {
    const previous = prev.find(p => p.keyword === curr.keyword);
    return {
      keyword: curr.keyword,
      currentPosition: curr.position,
      previousPosition: previous?.position ?? null,
      delta: previous ? (previous.position - curr.position) : null,
      clicks: curr.clicks
    };
  });
}
```

---

## Phase 7 — Deployment Checklist

### Environment Variables (production)

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback
GOOGLE_REFRESH_TOKEN=...   ← from one-time auth flow
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Vercel (Frontend)

- Add all `VITE_` prefixed env vars to Vercel project settings
- API base URL should point to your Node.js backend (Railway, Render, or Vercel serverless functions)

### Backend Hosting Options

| Option | Best for | Notes |
|---|---|---|
| Railway | Simple Node.js apps | Supports cron jobs natively |
| Render | Free tier | Cron jobs via Render Cron |
| Vercel Functions | Serverless | Use Vercel Cron for scheduled sync |

### Recommended: Vercel Cron (if backend is on Vercel)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-seo",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/weekly-digest",
      "schedule": "0 10 * * 1"
    },
    {
      "path": "/api/cron/monthly-report",
      "schedule": "0 11 1 * *"
    }
  ]
}
```

- Daily sync runs every day at 3 AM MDT (9 AM UTC)
- Weekly digest runs every Monday at 4 AM MDT
- Monthly report generates on the 1st of each month for the previous month

---

## Phase 8 — GSC API Limits & Best Practices

| Limit | Value |
|---|---|
| Queries per day | 200 per project (sufficient for 3 clients) |
| Max rows per request | 25,000 |
| Data delay | 2-3 days (always query with `-3d` buffer) |
| Date range max | 16 months |
| Free tier | Completely free |

### Best Practices

- **Always sync yesterday minus 2 days** (`date - 3`) to avoid incomplete data from GSC's delay
- **Use `upsert` not `insert`** to handle re-syncs without duplicates
- **Cache in Supabase** — never query GSC live from the dashboard (too slow, rate limited)
- **Filter by country** (`can`) to get Canada-specific rankings for Calgary clients
- **Limit to top 50-100 keywords** per client per day — enough for actionable insights

---

## Add to Your React Router

```jsx
import SEODashboard from './pages/SEODashboard';

// In your router config:
<Route path="/seo" element={<SEODashboard />} />
```

Add a nav link in your existing sidebar:

```jsx
<NavLink to="/seo">
  <BarChart2 size={16} /> SEO Rankings
</NavLink>
```

---

## Phase 9 — Reports & Digests

### Supabase Table for Generated Reports

```sql
create table seo_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete cascade,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_at timestamptz default now()
);
```

### Daily Overview (`src/app/api/cron/sync-seo/route.ts`)

After the nightly sync, generate and store a daily snapshot summary:

```typescript
async function generateDailyOverview(clientId: string, date: string) {
  const { data: snapshot } = await supabase
    .from('seo_daily_snapshots')
    .select('*')
    .eq('client_id', clientId)
    .eq('date', date)
    .single();

  const { data: topKeywords } = await supabase
    .from('seo_keyword_rankings')
    .select('keyword, position, clicks')
    .eq('client_id', clientId)
    .eq('date', date)
    .order('clicks', { ascending: false })
    .limit(10);

  await supabase.from('seo_reports').upsert({
    client_id: clientId,
    report_type: 'daily',
    period_start: date,
    period_end: date,
    summary: {
      clicks: snapshot?.clicks ?? 0,
      impressions: snapshot?.impressions ?? 0,
      ctr: snapshot?.ctr ?? 0,
      avg_position: snapshot?.avg_position ?? 0,
      top_keywords: topKeywords ?? []
    }
  }, { onConflict: 'client_id,report_type,period_start' });
}
```

### Weekly Digest (`src/app/api/cron/weekly-digest/route.ts`)

Runs every Monday — compares this week vs last week:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const today = new Date();
  const thisWeekEnd = new Date(today);
  thisWeekEnd.setDate(today.getDate() - 1);
  const thisWeekStart = new Date(thisWeekEnd);
  thisWeekStart.setDate(thisWeekEnd.getDate() - 6);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
  const lastWeekStart = new Date(lastWeekEnd);
  lastWeekStart.setDate(lastWeekEnd.getDate() - 6);

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const { data: clients } = await supabase.from('seo_clients').select('*');

  for (const client of clients!) {
    const { data: thisWeek } = await supabase
      .from('seo_daily_snapshots')
      .select('clicks, impressions, ctr, avg_position')
      .eq('client_id', client.id)
      .gte('date', fmt(thisWeekStart))
      .lte('date', fmt(thisWeekEnd));

    const { data: lastWeek } = await supabase
      .from('seo_daily_snapshots')
      .select('clicks, impressions, ctr, avg_position')
      .eq('client_id', client.id)
      .gte('date', fmt(lastWeekStart))
      .lte('date', fmt(lastWeekEnd));

    const sum = (rows: any[], key: string) =>
      rows?.reduce((acc, r) => acc + (r[key] ?? 0), 0) ?? 0;
    const avg = (rows: any[], key: string) =>
      rows?.length ? sum(rows, key) / rows.length : 0;

    await supabase.from('seo_reports').insert({
      client_id: client.id,
      report_type: 'weekly',
      period_start: fmt(thisWeekStart),
      period_end: fmt(thisWeekEnd),
      summary: {
        this_week: {
          clicks: sum(thisWeek!, 'clicks'),
          impressions: sum(thisWeek!, 'impressions'),
          avg_position: avg(thisWeek!, 'avg_position').toFixed(2)
        },
        last_week: {
          clicks: sum(lastWeek!, 'clicks'),
          impressions: sum(lastWeek!, 'impressions'),
          avg_position: avg(lastWeek!, 'avg_position').toFixed(2)
        },
        delta: {
          clicks: sum(thisWeek!, 'clicks') - sum(lastWeek!, 'clicks'),
          impressions: sum(thisWeek!, 'impressions') - sum(lastWeek!, 'impressions'),
        }
      }
    });
  }

  return NextResponse.json({ success: true });
}
```

### Monthly PDF Report (`src/app/api/reports/monthly/[slug]/route.ts`)

Install PDF generation library:

```bash
npm install @react-pdf/renderer
```

This API route generates and streams a downloadable PDF for the requested client and month:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const month = req.nextUrl.searchParams.get('month'); // e.g. '2026-04'
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

  const [year, mon] = month.split('-').map(Number);
  const periodStart = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const periodEnd = `${month}-${lastDay}`;

  const { data: client } = await supabase
    .from('seo_clients').select('*').eq('slug', params.slug).single();

  const { data: snapshots } = await supabase
    .from('seo_daily_snapshots').select('*')
    .eq('client_id', client.id)
    .gte('date', periodStart).lte('date', periodEnd)
    .order('date');

  const { data: keywords } = await supabase
    .from('seo_keyword_rankings').select('*')
    .eq('client_id', client.id)
    .gte('date', periodStart).lte('date', periodEnd)
    .order('clicks', { ascending: false }).limit(20);

  const { data: prevKeywords } = await supabase
    .from('seo_keyword_rankings').select('keyword, position')
    .eq('client_id', client.id)
    .gte('date', new Date(year, mon - 2, 1).toISOString().split('T')[0])
    .lte('date', new Date(year, mon - 1, 0).toISOString().split('T')[0]);

  const totalClicks = snapshots?.reduce((a, r) => a + r.clicks, 0) ?? 0;
  const totalImpressions = snapshots?.reduce((a, r) => a + r.impressions, 0) ?? 0;
  const avgPosition = snapshots?.length
    ? (snapshots.reduce((a, r) => a + r.avg_position, 0) / snapshots.length).toFixed(1)
    : 'N/A';

  // Build keyword comparison
  const kwComparison = keywords?.map(kw => {
    const prev = prevKeywords?.find(p => p.keyword === kw.keyword);
    return {
      keyword: kw.keyword,
      position: kw.position,
      prevPosition: prev?.position ?? null,
      delta: prev ? (prev.position - kw.position).toFixed(1) : null,
      clicks: kw.clicks
    };
  });

  // Return JSON — use this data to render PDF on frontend with @react-pdf/renderer
  return NextResponse.json({
    client: client.name,
    period: { start: periodStart, end: periodEnd },
    summary: { totalClicks, totalImpressions, avgPosition },
    keywords: kwComparison,
    dailyData: snapshots
  });
}
```

### Frontend Download Button

Add this to your dashboard for each client:

```tsx
async function downloadMonthlyReport(slug: string, month: string) {
  const res = await fetch(`/api/reports/monthly/${slug}?month=${month}`);
  const data = await res.json();

  // Use @react-pdf/renderer to generate PDF from data
  // Or use a simple HTML-to-PDF approach with window.print()
  const printWindow = window.open('', '_blank');
  printWindow!.document.write(`
    <html>
      <head>
        <title>SEO Report — ${data.client} — ${month}</title>
        <style>
          body { font-family: sans-serif; padding: 40px; }
          h1 { font-size: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .up { color: green; } .down { color: red; }
        </style>
      </head>
      <body>
        <h1>SEO Monthly Report — ${data.client}</h1>
        <p>Period: ${data.period.start} to ${data.period.end}</p>
        <h2>Summary</h2>
        <p>Total Clicks: <strong>${data.summary.totalClicks.toLocaleString()}</strong></p>
        <p>Total Impressions: <strong>${data.summary.totalImpressions.toLocaleString()}</strong></p>
        <p>Avg Position: <strong>#${data.summary.avgPosition}</strong></p>
        <h2>Keyword Rankings</h2>
        <table>
          <thead><tr><th>Keyword</th><th>Position</th><th>Prev</th><th>Change</th><th>Clicks</th></tr></thead>
          <tbody>
            ${data.keywords.map((k: any) => `
              <tr>
                <td>${k.keyword}</td>
                <td>#${k.position}</td>
                <td>${k.prevPosition ? '#' + k.prevPosition : '—'}</td>
                <td class="${k.delta > 0 ? 'up' : 'down'}">${k.delta ? (k.delta > 0 ? '↑' : '↓') + Math.abs(k.delta) : '—'}</td>
                <td>${k.clicks}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow!.document.close();
  printWindow!.print(); // triggers browser Save as PDF
}

// In your JSX:
<button onClick={() => downloadMonthlyReport('cpc-clinics', '2026-04')}>
  Download April Report (PDF)
</button>
```

> The browser's native print dialog lets users save as PDF — no extra library needed for a clean, simple report. For a more polished branded PDF, use `@react-pdf/renderer` to build a proper layout.

---

```
One-time (run now):
  npm run backfill → GSC API → pulls 13 months of history for all 3 clients
                             → stores in Supabase (seo_daily_snapshots + seo_keyword_rankings)

Daily at 3 AM MDT (automatic):
  Vercel Cron → GSC API → pulls yesterday's confirmed data → upserts into Supabase
                        → generates daily overview snapshot per client

Every Monday at 4 AM MDT:
  Vercel Cron → compares this week vs last week → stores weekly digest in seo_reports

1st of every month at 5 AM MDT:
  Vercel Cron → generates monthly summary → available as downloadable PDF per client

React dashboard (/seo):
  Overview tab    → all 3 clients combined metrics + individual client cards
  Client tabs     → performance chart, CTR trend, avg position trend
  Keywords tab    → top queries, position tracking, month-over-month comparison
  Indexing tab    → pages indexed vs not indexed, coverage status
  Reports tab     → daily snapshot, weekly digest, monthly PDF download
```

Total time to implement: ~3-4 days for a full working version. The priority order is: Supabase schema → backfill script → nightly sync → dashboard UI → reports.