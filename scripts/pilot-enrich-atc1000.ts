import { prisma } from '../src/lib/prisma';
import {
  ATC1000_PILOT_HANDLE,
  ATC1000_PILOT_PRODUCT_ID,
  addIndustryCollectionReferences,
  buildAtc1000PilotDraft,
} from '../src/lib/product-automation/catalog-enrichment';
import {
  fetchShopifyEnrichmentTarget,
  resolveShopifyCollectionIds,
  setShopifyProductMetafieldsOnly,
} from '../src/lib/product-automation/shopify';

const APPLY_CONFIRMATION = 'ATC1000-ONLY';

async function main() {
  const apply = process.argv.includes('--apply');
  const product = await prisma.importedShopifyProduct.findUnique({
    where: { shopifyProductId: ATC1000_PILOT_PRODUCT_ID },
    select: {
      shopifyProductId: true,
      title: true,
      handle: true,
      vendor: true,
      tags: true,
      snapshot: true,
    },
  });
  if (!product) throw new Error('ATC1000 pilot product is missing from the imported catalog');

  const draft = buildAtc1000PilotDraft(product);
  if (!apply) {
    process.stdout.write(JSON.stringify({
      mode: 'dry-run',
      safeguard: 'No Shopify data was changed',
      draft,
    }, null, 2) + '\n');
    return;
  }

  if (process.env.ATC1000_PILOT_CONFIRM !== APPLY_CONFIRMATION) {
    throw new Error(`Set ATC1000_PILOT_CONFIRM=${APPLY_CONFIRMATION} to apply this one-product pilot`);
  }

  const liveProduct = await fetchShopifyEnrichmentTarget(ATC1000_PILOT_PRODUCT_ID);
  if (liveProduct.id !== ATC1000_PILOT_PRODUCT_ID || liveProduct.handle !== ATC1000_PILOT_HANDLE) {
    throw new Error('Live Shopify product failed the ATC1000 pilot guard');
  }

  const collectionIds = await resolveShopifyCollectionIds(draft.industryHandles);
  const finalDraft = addIndustryCollectionReferences(draft, collectionIds);
  const result = await setShopifyProductMetafieldsOnly(finalDraft.productId, finalDraft.metafields);

  process.stdout.write(JSON.stringify({
    mode: 'applied',
    product: { id: liveProduct.id, title: liveProduct.title, handle: liveProduct.handle },
    savedKeys: result.metafields.map(item => item.key),
    productUrl: result.productUrl,
  }, null, 2) + '\n');
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
