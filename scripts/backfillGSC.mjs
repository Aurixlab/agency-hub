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

// GSC gives 13-16 months of history — start from April 2025
const BACKFILL_START = '2025-04-01';
const BACKFILL_END = new Date().toISOString().split('T')[0];

async function backfillClient(client) {
  console.log(`\n🔍 Backfilling ${client.name}...`);

  // 1. Backfill daily site metrics (chunks of 90 days to avoid limits)
  let currentStart = new Date(BACKFILL_START);
  const endDate = new Date(BACKFILL_END);

  while (currentStart < endDate) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setDate(chunkEnd.getDate() + 89);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const startStr = currentStart.toISOString().split('T')[0];
    const endStr = chunkEnd.toISOString().split('T')[0];

    try {
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
      if (rows.length > 0) {
        const snapshots = rows.map(row => ({
          client_id: client.id,
          date: row.keys[0],
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: row.ctr,
          avg_position: row.position
        }));

        await supabase.from('seo_daily_snapshots').upsert(snapshots, { onConflict: 'client_id,date' });
        console.log(`  ✓ Metrics ${startStr} → ${endStr}: ${rows.length} days`);
      }
    } catch (err) {
      console.error(`  ❌ Error fetching metrics for ${startStr} → ${endStr}:`, err.message);
    }

    currentStart.setDate(currentStart.getDate() + 90);
    await new Promise(r => setTimeout(r, 1000)); // rate limit pause
  }

  // 2. Backfill keyword rankings (monthly chunks)
  console.log(`  📦 Fetching keyword history...`);
  let kwStart = new Date(BACKFILL_START);
  while (kwStart < endDate) {
    const kwEnd = new Date(kwStart);
    kwEnd.setMonth(kwEnd.getMonth() + 1);
    kwEnd.setDate(kwEnd.getDate() - 1);
    if (kwEnd > endDate) kwEnd.setTime(endDate.getTime());

    const startStr = kwStart.toISOString().split('T')[0];
    const endStr = kwEnd.toISOString().split('T')[0];

    try {
      const res = await searchConsole.searchanalytics.query({
        siteUrl: client.gsc_property_url,
        requestBody: {
          startDate: startStr,
          endDate: endStr,
          dimensions: ['query'],
          // Filter by Canada to match your guide's preference
          dimensionFilterGroups: [{
            filters: [{ dimension: 'country', operator: 'equals', expression: 'can' }]
          }],
          rowLimit: 100,
        }
      });

      const rows = res.data.rows || [];
      const kwRows = rows.map(row => ({
        client_id: client.id,
        date: endStr, // Store monthly aggregated as "monthly snapshot"
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
    } catch (err) {
      console.error(`  ❌ Error fetching keywords for ${startStr} → ${endStr}:`, err.message);
    }

    kwStart.setMonth(kwStart.getMonth() + 1);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`✅ ${client.name} backfill complete`);
}

async function runBackfill() {
  console.log('🚀 GSC API Backfill Starting...');
  const { data: clients, error } = await supabase.from('seo_clients').select('*');
  
  if (error) {
    console.error('Error fetching clients:', error);
    return;
  }

  for (const client of clients) {
    await backfillClient(client);
  }
  console.log('\n🎉 All clients backfilled successfully via API!');
}

runBackfill().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
