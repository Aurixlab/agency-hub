import { createHash } from 'node:crypto';
import { shopifyAdminGraphql } from './shopify';
import type { CatalogProductForEnrichment } from './catalog-enrichment';

type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type Connection<T> = {
  nodes: T[];
  pageInfo: PageInfo;
};

type ShopifyProductNode = {
  id: string;
  legacyResourceId?: string | number | null;
  title: string;
  handle?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  tags?: string[] | null;
  templateSuffix?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  featuredImage?: { url?: string | null } | null;
  options?: Array<Record<string, unknown>> | null;
  variants: Connection<Record<string, unknown>>;
  media: Connection<Record<string, unknown>>;
  metafields: Connection<Record<string, unknown>>;
};

export interface ImportedShopifyCatalogProduct {
  shopifyProductId: string;
  legacyResourceId: string | null;
  handle: string | null;
  title: string;
  vendor: string | null;
  productType: string | null;
  shopifyStatus: string | null;
  templateSuffix: string | null;
  tags: string[];
  descriptionHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImageUrl: string | null;
  variantCount: number;
  imageCount: number;
  metafieldCount: number;
  snapshot: Record<string, unknown>;
  snapshotBytes: number;
  sourceHash: string;
  shopifyUpdatedAt: Date | null;
}

export interface ShopifyCatalogPage {
  products: ImportedShopifyCatalogProduct[];
  pageInfo: PageInfo;
}

const variantFields = [
  'id',
  'title',
  'displayName',
  'sku',
  'barcode',
  'price',
  'compareAtPrice',
  'position',
  'inventoryQuantity',
  'taxable',
  'inventoryPolicy',
  'selectedOptions { name value }',
  'inventoryItem { id sku tracked }',
  'image { id url altText }',
].join('\n');

const mediaFields = [
  'id',
  'mediaContentType',
  'alt',
  '... on MediaImage { image { id url altText width height } }',
  '... on Video { sources { url mimeType format height width } }',
  '... on ExternalVideo { embeddedUrl host originUrl }',
  '... on Model3d { sources { url mimeType format } }',
].join('\n');

const metafieldFields = [
  'id',
  'namespace',
  'key',
  'type',
  'value',
  'description',
].join('\n');

// Keep each detailed request comfortably below Shopify's calculated-query-cost
// ceiling. Any overflow is fetched through the connection-specific cursors below.
const variantsConnection = 'variants(first: 50) { nodes { ' + variantFields + ' } pageInfo { hasNextPage endCursor } }';
const mediaConnection = 'media(first: 50) { nodes { ' + mediaFields + ' } pageInfo { hasNextPage endCursor } }';
const metafieldsConnection = 'metafields(first: 50) { nodes { ' + metafieldFields + ' } pageInfo { hasNextPage endCursor } }';

const productFields = [
  'id',
  'legacyResourceId',
  'title',
  'handle',
  'descriptionHtml',
  'vendor',
  'productType',
  'status',
  'tags',
  'templateSuffix',
  'createdAt',
  'updatedAt',
  'seo { title description }',
  'featuredImage { url }',
  'options { id name position optionValues { id name hasVariants } }',
  variantsConnection,
  mediaConnection,
  metafieldsConnection,
].join('\n');

const catalogPageQuery = [
  'query ImportShopifyCatalog($first: Int!, $after: String) {',
  '  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {',
  '    nodes {',
  '      id',
  '    }',
  '    pageInfo { hasNextPage endCursor }',
  '  }',
  '}',
].join('\n');

const productDetailQuery = [
  'query ImportShopifyProduct($id: ID!) {',
  '  product(id: $id) {',
  productFields,
  '  }',
  '}',
].join('\n');

const variantsPageQuery = [
  'query ImportProductVariants($id: ID!, $after: String) {',
  '  product(id: $id) {',
  '    variants(first: 50, after: $after) {',
  '      nodes {',
  variantFields,
  '      }',
  '      pageInfo { hasNextPage endCursor }',
  '    }',
  '  }',
  '}',
].join('\n');

const mediaPageQuery = [
  'query ImportProductMedia($id: ID!, $after: String) {',
  '  product(id: $id) {',
  '    media(first: 50, after: $after) {',
  '      nodes {',
  mediaFields,
  '      }',
  '      pageInfo { hasNextPage endCursor }',
  '    }',
  '  }',
  '}',
].join('\n');

const metafieldsPageQuery = [
  'query ImportProductMetafields($id: ID!, $after: String) {',
  '  product(id: $id) {',
  '    metafields(first: 50, after: $after) {',
  '      nodes {',
  metafieldFields,
  '      }',
  '      pageInfo { hasNextPage endCursor }',
  '    }',
  '  }',
  '}',
].join('\n');

async function collectAllConnection<T>(
  initial: Connection<T>,
  loadNext: (after: string) => Promise<Connection<T> | null>
): Promise<Connection<T>> {
  const nodes = [...initial.nodes];
  let pageInfo = initial.pageInfo;

  while (pageInfo.hasNextPage && pageInfo.endCursor) {
    const next = await loadNext(pageInfo.endCursor);
    if (!next) break;
    nodes.push(...next.nodes);
    pageInfo = next.pageInfo;
  }

  return { nodes, pageInfo };
}

async function completeProductConnections(product: ShopifyProductNode): Promise<ShopifyProductNode> {
  const [variants, media, metafields] = await Promise.all([
    collectAllConnection(product.variants, async after => {
      const data = await shopifyAdminGraphql<{ product: { variants: Connection<Record<string, unknown>> } | null }>(
        variantsPageQuery,
        { id: product.id, after }
      );
      return data.product?.variants || null;
    }),
    collectAllConnection(product.media, async after => {
      const data = await shopifyAdminGraphql<{ product: { media: Connection<Record<string, unknown>> } | null }>(
        mediaPageQuery,
        { id: product.id, after }
      );
      return data.product?.media || null;
    }),
    collectAllConnection(product.metafields, async after => {
      const data = await shopifyAdminGraphql<{ product: { metafields: Connection<Record<string, unknown>> } | null }>(
        metafieldsPageQuery,
        { id: product.id, after }
      );
      return data.product?.metafields || null;
    }),
  ]);

  return { ...product, variants, media, metafields };
}

function normalizeProduct(product: ShopifyProductNode): ImportedShopifyCatalogProduct {
  const snapshot = JSON.parse(JSON.stringify(product)) as Record<string, unknown>;
  const serialized = JSON.stringify(snapshot);
  const updatedAt = product.updatedAt ? new Date(product.updatedAt) : null;

  return {
    shopifyProductId: product.id,
    legacyResourceId: product.legacyResourceId === undefined || product.legacyResourceId === null
      ? null
      : String(product.legacyResourceId),
    handle: product.handle || null,
    title: product.title || 'Untitled Shopify product',
    vendor: product.vendor || null,
    productType: product.productType || null,
    shopifyStatus: product.status || null,
    templateSuffix: product.templateSuffix || null,
    tags: Array.isArray(product.tags) ? product.tags : [],
    descriptionHtml: product.descriptionHtml || '',
    seoTitle: product.seo?.title || null,
    seoDescription: product.seo?.description || null,
    featuredImageUrl: product.featuredImage?.url || null,
    variantCount: product.variants.nodes.length,
    imageCount: product.media.nodes.length,
    metafieldCount: product.metafields.nodes.length,
    snapshot,
    snapshotBytes: Buffer.byteLength(serialized, 'utf8'),
    sourceHash: createHash('sha256').update(serialized).digest('hex'),
    shopifyUpdatedAt: updatedAt && !Number.isNaN(updatedAt.valueOf()) ? updatedAt : null,
  };
}

export async function fetchShopifyCatalogPage(after?: string | null, first = 3): Promise<ShopifyCatalogPage> {
  const data = await shopifyAdminGraphql<{
    products: { nodes: Array<{ id: string }>; pageInfo: PageInfo };
  }>(catalogPageQuery, { first, after: after || null });

  // Fetch individual products after the lightweight catalog page. Combining a large
  // product page with deep variants, media, and metafields would exceed Shopify's
  // calculated GraphQL cost limit before an import ever starts.
  const products = [];
  for (const item of data.products.nodes) {
    const detail = await shopifyAdminGraphql<{ product: ShopifyProductNode | null }>(
      productDetailQuery,
      { id: item.id }
    );
    if (detail.product) products.push(normalizeProduct(await completeProductConnections(detail.product)));
  }

  return { products, pageInfo: data.products.pageInfo };
}

// Lightweight read-only catalog fetch for enrichment previews. It deliberately
// excludes descriptions, variants, inventory, media, and pricing, and requests
// only the product data needed to build the additive metafield drafts.
export async function fetchShopifyEnrichmentCatalog(): Promise<CatalogProductForEnrichment[]> {
  const query = `
    query ProductEnrichmentCatalog($after: String) {
      products(first: 10, after: $after, sortKey: TITLE) {
        nodes {
          id
          title
          handle
          vendor
          tags
          options {
            name
            optionValues {
              name
            }
          }
          metafields(first: 50, namespace: "custom") {
            nodes {
              namespace
              key
              value
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  type EnrichmentNode = {
    id: string;
    title: string;
    handle: string | null;
    vendor: string | null;
    tags: string[];
    options: Array<{ name: string; optionValues: Array<{ name: string }> }>;
    metafields: { nodes: Array<{ namespace: string; key: string; value: string }> };
  };
  type EnrichmentPage = {
    products: {
      nodes: EnrichmentNode[];
      pageInfo: PageInfo;
    };
  };

  const products: CatalogProductForEnrichment[] = [];
  let after: string | null = null;
  do {
    const data: EnrichmentPage = await shopifyAdminGraphql<EnrichmentPage>(query, { after });
    products.push(...data.products.nodes.map(product => ({
      shopifyProductId: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      tags: product.tags,
      snapshot: {
        options: product.options,
        metafields: product.metafields,
      },
    })));
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);

  return products;
}
