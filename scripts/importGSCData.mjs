/**
 * GSC CSV Historical Data Import Script
 * Run once to load your exported GSC data into Supabase
 *
 * Usage:
 *   1. Place your 3 unzipped GSC folders next to this script:
 *      scripts/gsc_data/aurixlab/Chart.csv
 *      scripts/gsc_data/aurixlab/Queries.csv
 *      scripts/gsc_data/cpcclinics/Chart.csv
 *      scripts/gsc_data/cpcclinics/Queries.csv
 *      scripts/gsc_data/budgetpromotion/Chart.csv
 *      scripts/gsc_data/budgetpromotion/Queries.csv
 *
 *   2. npm install @supabase/supabase-js dotenv csv-parse
 *   3. node scripts/importGSCData.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map folder name to GSC slug
const CLIENT_MAP = [
  { folder: 'aurixlab',        slug: 'aurixlab' },
  { folder: 'cpcclinics',      slug: 'cpc-clinics' },
  { folder: 'budgetpromotion', slug: 'budget-promotion' },
];

// Convert CTR string like "25%" or "0.32%" to decimal number
function parseCTR(ctrStr) {
  if (!ctrStr || ctrStr === '0%') return 0;
  const cleaned = ctrStr.replace('%', '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num / 100;
}

// Parse a CSV file and return array of objects
function readCSV(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

// Chunk array into batches
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function importClient(folder, slug) {
  console.log(`\n📥 Importing ${slug}...`);

  // Get client ID from Supabase
  const { data: client, error } = await supabase
    .from('seo_clients')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (error || !client) {
    console.error(`  ❌ Client "${slug}" not found in seo_clients table. Did you run the SQL schema?`);
    return;
  }

  console.log(`  ✓ Found client: ${client.name} (${client.id})`);

  // ─── 1. Import daily snapshots from Chart.csv ───────────────────
  const chartPath = resolve(__dirname, `gsc_data/${folder}/Chart.csv`);
  const chartRows = readCSV(chartPath);

  const snapshots = chartRows.map(row => ({
    client_id: client.id,
    date: row['Date'],
    clicks: parseInt(row['Clicks']) || 0,
    impressions: parseInt(row['Impressions']) || 0,
    ctr: parseCTR(row['CTR']),
    avg_position: parseFloat(row['Position']) || 0,
  }));

  const snapshotChunks = chunk(snapshots, 100);
  let snapshotCount = 0;

  for (const batch of snapshotChunks) {
    const { error } = await supabase
      .from('seo_daily_snapshots')
      .upsert(batch, { onConflict: 'client_id,date' });

    if (error) {
      console.error('  ❌ Snapshot insert error:', error.message);
    } else {
      snapshotCount += batch.length;
    }
  }

  console.log(`  ✓ Imported ${snapshotCount} daily snapshots (${snapshots[0]?.date} → ${snapshots[snapshots.length - 1]?.date})`);

  // ─── 2. Import keyword rankings from Queries.csv ────────────────
  // Queries.csv has aggregated totals (not per day)
  // We'll store them with today's date as a snapshot date
  // The backfill API will fill in day-by-day keyword history separately
  const queriesPath = resolve(__dirname, `gsc_data/${folder}/Queries.csv`);
  const queryRows = readCSV(queriesPath);

  // Use the last date from Chart.csv as the reference date
  const lastDate = snapshots[snapshots.length - 1]?.date || new Date().toISOString().split('T')[0];

  const keywords = queryRows.map(row => ({
    client_id: client.id,
    date: lastDate,
    keyword: row['Top queries'],
    position: parseFloat(row['Position']) || 0,
    clicks: parseInt(row['Clicks']) || 0,
    impressions: parseInt(row['Impressions']) || 0,
    ctr: parseCTR(row['CTR']),
  }));

  const kwChunks = chunk(keywords, 100);
  let kwCount = 0;

  for (const batch of kwChunks) {
    const { error } = await supabase
      .from('seo_keyword_rankings')
      .upsert(batch, { onConflict: 'client_id,date,keyword' });

    if (error) {
      console.error('  ❌ Keyword insert error:', error.message);
    } else {
      kwCount += batch.length;
    }
  }

  console.log(`  ✓ Imported ${kwCount} keyword rankings`);
  console.log(`  ✅ ${client.name} complete`);
}

async function run() {
  console.log('🚀 GSC CSV Import Starting...');
  console.log(`   Supabase URL: ${process.env.SUPABASE_URL}`);

  for (const { folder, slug } of CLIENT_MAP) {
    await importClient(folder, slug);
  }

  console.log('\n🎉 All clients imported successfully!');
  console.log('   Daily snapshots and keyword rankings are now in Supabase.');
  console.log('   Run the backfill script next for month-by-month keyword history.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
