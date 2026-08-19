import assert from 'node:assert/strict';
import test from 'node:test';
import { REUSABLE_ICON_GROUPS } from './icon-metafields';
import {
  ATC1000_PILOT_PRODUCT_ID,
  addIndustryCollectionReferences,
  buildAtc1000PilotDraft,
  classifyCatalogDecoration,
} from './catalog-enrichment';
import { composeShopifyPayload } from './payload';
import { calculatePricing } from './pricing';
import { buildShopifyVariantInput, matchIndustryCollectionIds } from './shopify';
import { generateVariants } from './variants';

test('calculates print and embroidery pricing tiers', () => {
  assert.deepEqual(calculatePricing(20, 'print').tiers, [
    { range: '1-24', price: 44.65 },
    { range: '25-99', price: 39.89 },
    { range: '100-499', price: 38.07 },
    { range: '500+', price: 33.31 },
  ]);
  assert.deepEqual(calculatePricing(20, 'embroidery').tiers, [
    { range: '12-23', price: 49.18 },
    { range: '24-47', price: 48.17 },
    { range: '48-99', price: 43.31 },
    { range: '100+', price: 40.58 },
  ]);
});

test('generates six sizes per unique color', () => {
  const variants = generateVariants(['Black', 'Navy', 'Black'], 'ABC-1', 25);
  assert.equal(variants.length, 12);
  assert.equal(variants[0].sku, 'ABC-1-BLACK-S');
  assert.equal(variants.at(-1)?.sku, 'ABC-1-NAVY-3XL');
});

test('composes Shopify draft fields and list metafields', () => {
  const { payload } = composeShopifyPayload({
    scrapedData: {
      title: 'Test Product',
      brand: 'Test Brand',
      sku: 'TEST-1',
      fabric: 'Cotton',
      weight: '8 oz',
      raw_description: 'Test description',
      confidence: {
        title: 'high', brand: 'high', sku: 'high', fabric: 'high', weight: 'high', raw_description: 'high',
      },
    },
    aiCopy: {
      key_features: ['Feature one', 'Feature two'],
      best_use: ['Workwear'],
      material_care: ['Machine wash'],
      customization_fit: ['Classic fit'],
      seo_description: 'Test SEO description',
    },
    basePrice: 20,
    decorationType: 'print',
    colors: ['Black'],
  });

  assert.equal(payload.status, 'DRAFT');
  assert.equal(payload.templateSuffix, 'custom-quote');
  assert.equal(payload.variants.length, 6);
  assert.equal(payload.bodyHtml, '<p>Test description</p>');
  assert.equal(payload.bodyHtml.includes('Key Features'), false);
  const features = payload.metafields.find(item => item.key === 'accordion1_texts');
  assert.equal(features?.type, 'list.single_line_text_field');
  assert.deepEqual(JSON.parse(features?.value || '[]'), ['Feature one', 'Feature two']);
});

test('calculates and maps bulk savings to the exact Shopify metafield', () => {
  const { payload } = composeShopifyPayload({
    scrapedData: {
      title: 'Test Product', brand: 'Test Brand', sku: 'TEST-1', fabric: '', weight: '', raw_description: '',
      confidence: {
        title: 'high', brand: 'high', sku: 'high', fabric: 'missing', weight: 'missing', raw_description: 'missing',
      },
    },
    aiCopy: {
      key_features: [], best_use: [], material_care: [], customization_fit: [], seo_description: '',
    },
    basePrice: 39,
    decorationType: 'embroidery',
    colors: ['Black'],
  });

  const savings = payload.metafields.find(item => item.key === 'bulk_savings');
  assert.equal(savings?.type, 'list.single_line_text_field');
  assert.deepEqual(JSON.parse(savings?.value || '[]'), ['Save 0%', 'Save 2%', 'Save 10%', 'Save 15%']);
});

test('uses the exact Shopify accordion and icon metafield keys', () => {
  assert.deepEqual(
    REUSABLE_ICON_GROUPS.map(group => group.key),
    ['accordion1_icons', 'accordion2_icons', 'accordion3_icons', 'accordion4_icons']
  );
});

test('places variant SKU inside inventoryItem for Shopify bulk input', () => {
  const input = buildShopifyVariantInput({
    color: 'Black',
    size: 'M',
    title: 'Black / M',
    sku: 'TEST-BLACK-M',
    price: 25,
  });

  assert.deepEqual(input, {
    price: '25.00',
    inventoryItem: { sku: 'TEST-BLACK-M' },
    optionValues: [
      { optionName: 'Color', name: 'Black' },
      { optionName: 'Size', name: 'M' },
    ],
  });
  assert.equal('sku' in input, false);
});

test('resolves an industry collection by title when its Shopify handle was renamed', () => {
  const resolved = matchIndustryCollectionIds(['events', 'trades', 'non-profits'], [
    { id: 'gid://shopify/Collection/1', handle: 'events', title: 'Events' },
    { id: 'gid://shopify/Collection/2', handle: 'trade-workwear', title: 'Trades' },
    { id: 'gid://shopify/Collection/3', handle: 'charities', title: 'Non-Profits' },
  ]);

  assert.deepEqual(resolved, {
    events: 'gid://shopify/Collection/1',
    trades: 'gid://shopify/Collection/2',
    'non-profits': 'gid://shopify/Collection/3',
  });
});

test('prefers an exact industry handle over a duplicate collection title', () => {
  const resolved = matchIndustryCollectionIds(['trades'], [
    { id: 'gid://shopify/Collection/title-match', handle: 'trade-workwear', title: 'Trades' },
    { id: 'gid://shopify/Collection/handle-match', handle: 'trades', title: 'Trade Products' },
  ]);

  assert.equal(resolved.trades, 'gid://shopify/Collection/handle-match');
});

test('classifies approved catalog bulk ladder rules', () => {
  assert.equal(classifyCatalogDecoration({ bulkRanges: [] }), 'skip');
  assert.equal(classifyCatalogDecoration({ bulkRanges: ['1-24', '25-99', '100-499', '500+'] }), 'print');
  assert.equal(classifyCatalogDecoration({ bulkRanges: ['1-20', '21-50', '51-100', '101+'] }), 'print');
  assert.equal(classifyCatalogDecoration({ bulkRanges: ['12-23', '24-47', '48-99', '100+'] }), 'embroidery');
  assert.equal(classifyCatalogDecoration({ bulkRanges: ['100+'] }), 'skip');
  assert.equal(classifyCatalogDecoration({ bulkRanges: ['15-49', '50-99', '100+'] }), 'skip');
  assert.equal(classifyCatalogDecoration({
    bulkRanges: ['25-47', '48-99', '100+'],
    handle: 'strathmore-ivory-straw-hat',
  }), 'embroidery');
});

test('builds an additive ATC1000-only enrichment draft without a size chart', () => {
  const draft = buildAtc1000PilotDraft({
    shopifyProductId: ATC1000_PILOT_PRODUCT_ID,
    title: 'ATC 1000 Short Sleeve (Men)',
    handle: 'atc-1000-short-sleeve',
    vendor: 'Sanmar',
    tags: ['events', 'non-profits', 'schools', 'trades', 'men'],
    snapshot: {
      options: [
        { name: 'Color', optionValues: [{ name: 'Black' }, { name: 'Bright Aqua' }] },
        { name: 'Size', optionValues: [{ name: 'S' }, { name: 'M' }, { name: 'L' }] },
      ],
      metafields: {
        nodes: [
          { namespace: 'custom', key: 'product_style_number', value: 'ATC1000' },
          { namespace: 'custom', key: 'bulk_ranges', value: '["1-24","25-99","100-499","500+"]' },
        ],
      },
    },
  }, new Date('2026-08-20T00:00:00.000Z'));

  const finalDraft = addIndustryCollectionReferences(draft, {
    events: 'gid://shopify/Collection/1',
    'non-profits': 'gid://shopify/Collection/2',
    schools: 'gid://shopify/Collection/3',
    trades: 'gid://shopify/Collection/4',
  });
  const keys = finalDraft.metafields.map(item => item.key);
  assert.equal(draft.decoration, 'print');
  assert.deepEqual(draft.industryHandles, ['events', 'trades', 'schools', 'non-profits']);
  assert.equal(keys.includes('industries'), true);
  assert.equal(keys.includes('size_chart'), false);
  assert.equal(keys.includes('bulk_ranges'), false);
  assert.equal(keys.includes('accordion1_texts'), false);
  assert.equal(finalDraft.metafields.find(item => item.key === 'last_enriched_at')?.value, '2026-08-20T00:00:00.000Z');
});

test('rejects non-pilot products from the ATC1000 draft builder', () => {
  assert.throws(() => buildAtc1000PilotDraft({
    shopifyProductId: 'gid://shopify/Product/other',
    title: 'ATC 1000L Short Sleeve (Women)',
    handle: 'atc-1000l-short-sleeve-women',
    vendor: 'Sanmar',
    tags: ['events'],
    snapshot: { metafields: { nodes: [] } },
  }), /pilot guard rejected/);
});
