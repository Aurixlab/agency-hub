import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { shopifyAdminGraphql } from '@/lib/product-automation/shopify';

export const maxDuration = 60;

const COLLECTION_HANDLE = 't-shirts';
const COLLECTION_URL = 'https://budgetpromotion.ca/collections/t-shirts';
const CONFIRMATION = 'APPLY-T-SHIRT-CONTENT-ROLLOUT';
const BATCH_SIZE = 10;
const KEYWORD_PARAGRAPH_CLASS = 'bp-tshirt-keywords';
const KEYWORDS = [
  'custom t-shirt',
  'custom t shirt merchandise',
  'custom apparel',
  'Custom merchandise',
] as const;

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  visibility: { namespace: string; key: string; type: string; value: string } | null;
};
type ProductDefinition = {
  id: string;
  name: string;
  namespace: string;
  key: string;
  description: string | null;
  type: { name: string };
};

function matchesOneTimeToken(request: Request) {
  const expected = process.env.PRODUCT_TSHIRT_ROLLOUT_TOKEN || '';
  const supplied = request.headers.get('x-tshirt-rollout-token') || '';
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function authorize(request: Request) {
  if (matchesOneTimeToken(request)) return true;
  const session = await getSessionFromRequestFull(request);
  return Boolean(session?.role === 'ADMIN');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function removeExistingKeywordParagraph(descriptionHtml: string) {
  const escapedClass = KEYWORD_PARAGRAPH_CLASS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const paragraphPattern = new RegExp(
    `<p\\b[^>]*class=["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/p>`,
    'gi'
  );
  return descriptionHtml.replace(paragraphPattern, '').trim();
}

function buildKeywordParagraph(title: string) {
  const link = (label: string) => `<a href="${COLLECTION_URL}">${label}</a>`;
  return `<p class="${KEYWORD_PARAGRAPH_CLASS}">The ${escapeHtml(title)} supports branded programs ranging from a ${link(KEYWORDS[0])} and coordinated ${link(KEYWORDS[1])} to versatile ${link(KEYWORDS[2])} and event-ready ${link(KEYWORDS[3])}.</p>`;
}

function buildDescription(descriptionHtml: string, title: string) {
  const existing = removeExistingKeywordParagraph(descriptionHtml);
  return [existing, buildKeywordParagraph(title)].filter(Boolean).join('\n');
}

function hasLinkedKeywords(descriptionHtml: string) {
  return KEYWORDS.every(keyword => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `<a\\b[^>]*href=["']${COLLECTION_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*${escaped}\\s*<\\/a>`,
      'i'
    );
    return pattern.test(descriptionHtml);
  });
}

async function fetchDefinitions() {
  const data = await shopifyAdminGraphql<{
    metafieldDefinitions: { nodes: ProductDefinition[] };
  }>(`
    query ProductMetafieldDefinitions {
      metafieldDefinitions(first: 250, ownerType: PRODUCT, query: "namespace:custom") {
        nodes {
          id
          name
          namespace
          key
          description
          type { name }
        }
      }
    }
  `);
  return data.metafieldDefinitions.nodes;
}

async function fetchTshirtCollection() {
  const data = await shopifyAdminGraphql<{
    collections: { nodes: Array<{ id: string; title: string; handle: string }> };
  }>(`
    query Collections {
      collections(first: 250) {
        nodes { id title handle }
      }
    }
  `);
  const matches = data.collections.nodes.filter(collection => collection.handle === COLLECTION_HANDLE);
  if (matches.length !== 1) {
    throw new Error(`Expected one collection with handle ${COLLECTION_HANDLE}; found ${matches.length}`);
  }
  return matches[0];
}

async function fetchTshirtProductIds(collectionId: string) {
  const ids = new Set<string>();
  let after: string | null = null;
  do {
    const data: {
      collection: {
        products: {
          nodes: Array<{ id: string }>;
          pageInfo: PageInfo;
        };
      } | null;
    } = await shopifyAdminGraphql(`
      query TshirtCollectionProducts($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 100, after: $after, sortKey: TITLE) {
            nodes { id }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `, { id: collectionId, after });
    if (!data.collection) throw new Error('T-shirt collection was not found');
    for (const product of data.collection.products.nodes) ids.add(product.id);
    after = data.collection.products.pageInfo.hasNextPage
      ? data.collection.products.pageInfo.endCursor
      : null;
  } while (after);
  return ids;
}

async function fetchCatalog(booleanKey?: string) {
  const products: CatalogProduct[] = [];
  let after: string | null = null;
  do {
    const data: {
      products: {
        nodes: CatalogProduct[];
        pageInfo: PageInfo;
      };
    } = await shopifyAdminGraphql(`
      query ProductCatalog($after: String, $namespace: String!, $key: String!) {
        products(first: 100, after: $after, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            descriptionHtml
            visibility: metafield(namespace: $namespace, key: $key) {
              namespace
              key
              type
              value
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { after, namespace: 'custom', key: booleanKey || '__not_selected__' });
    products.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return products;
}

async function loadRollout(booleanKey?: string) {
  const [definitions, collection, catalog] = await Promise.all([
    fetchDefinitions(),
    fetchTshirtCollection(),
    fetchCatalog(booleanKey),
  ]);
  const tshirtProductIds = await fetchTshirtProductIds(collection.id);
  const targetProducts = catalog.filter(product => tshirtProductIds.has(product.id));
  return { definitions, collection, catalog, tshirtProductIds, targetProducts };
}

function validatedBooleanDefinition(definitions: ProductDefinition[], key: unknown) {
  if (typeof key !== 'string' || !/^[a-z0-9_]+$/.test(key)) {
    throw new Error('A valid custom boolean metafield key is required');
  }
  const definition = definitions.find(item =>
    item.namespace === 'custom' && item.key === key && item.type.name === 'boolean'
  );
  if (!definition) throw new Error(`custom.${key} is not a product boolean metafield definition`);
  return definition;
}

function assertExpectedCounts(catalogCount: number, targetCount: number, body: Record<string, unknown>) {
  if (body.expectedCatalogCount !== catalogCount || body.expectedTargetCount !== targetCount) {
    throw new Error(
      `Catalog changed after audit: expected ${body.expectedCatalogCount}/${body.expectedTargetCount}, found ${catalogCount}/${targetCount}`
    );
  }
}

async function updateProduct(product: CatalogProduct, booleanKey: string, isTarget: boolean) {
  const descriptionHtml = isTarget
    ? buildDescription(product.descriptionHtml || '', product.title)
    : product.descriptionHtml;
  const input: Record<string, unknown> = {
    id: product.id,
    metafields: [{
      namespace: 'custom',
      key: booleanKey,
      type: 'boolean',
      value: isTarget ? 'true' : 'false',
    }],
  };
  if (isTarget) input.descriptionHtml = descriptionHtml;

  const data = await shopifyAdminGraphql<{
    productUpdate: {
      product: {
        id: string;
        descriptionHtml: string;
        visibility: { value: string } | null;
      } | null;
      userErrors: Array<{ field?: string[]; message: string; code?: string }>;
    };
  }>(`
    mutation UpdateTshirtContent($input: ProductInput!, $namespace: String!, $key: String!) {
      productUpdate(input: $input) {
        product {
          id
          descriptionHtml
          visibility: metafield(namespace: $namespace, key: $key) { value }
        }
        userErrors { field message code }
      }
    }
  `, { input, namespace: 'custom', key: booleanKey });
  const errors = data.productUpdate?.userErrors || [];
  if (errors.length) throw new Error(errors.map(error => error.message).join('; '));
  const saved = data.productUpdate?.product;
  if (!saved) throw new Error('Shopify did not return the updated product');
  const expectedVisibility = isTarget ? 'true' : 'false';
  if (saved.visibility?.value !== expectedVisibility) {
    throw new Error(`Boolean verification failed: expected ${expectedVisibility}`);
  }
  if (isTarget && !hasLinkedKeywords(saved.descriptionHtml)) {
    throw new Error('Linked keyword paragraph verification failed');
  }
  return {
    productId: product.id,
    title: product.title,
    handle: product.handle,
    visibility: expectedVisibility,
    descriptionUpdated: isTarget,
  };
}

export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const mode = body.mode === 'apply' || body.mode === 'verify' || body.mode === 'preview'
      ? body.mode
      : 'audit';
    const booleanKey = typeof body.booleanKey === 'string' ? body.booleanKey : undefined;
    const rollout = await loadRollout(booleanKey);

    if (mode === 'audit') {
      return NextResponse.json({
        collection: rollout.collection,
        totals: {
          catalogProducts: rollout.catalog.length,
          tshirtProducts: rollout.targetProducts.length,
          nonTshirtProducts: rollout.catalog.length - rollout.targetProducts.length,
        },
        booleanDefinitions: rollout.definitions
          .filter(definition => definition.type.name === 'boolean')
          .map(definition => ({
            name: definition.name,
            namespace: definition.namespace,
            key: definition.key,
            type: definition.type.name,
            description: definition.description,
          })),
        tshirtProducts: rollout.targetProducts.map(product => ({
          productId: product.id,
          title: product.title,
          handle: product.handle,
          descriptionLength: product.descriptionHtml?.length || 0,
          alreadyHasLinkedKeywords: hasLinkedKeywords(product.descriptionHtml || ''),
        })),
      });
    }

    const definition = validatedBooleanDefinition(rollout.definitions, booleanKey);
    if (mode === 'preview') {
      return NextResponse.json({
        collection: rollout.collection,
        booleanDefinition: {
          name: definition.name,
          namespace: definition.namespace,
          key: definition.key,
          type: definition.type.name,
        },
        totals: {
          catalogProducts: rollout.catalog.length,
          tshirtProducts: rollout.targetProducts.length,
          setTrue: rollout.targetProducts.length,
          setFalse: rollout.catalog.length - rollout.targetProducts.length,
          descriptionsUpdated: rollout.targetProducts.length,
        },
        targetProducts: rollout.targetProducts.map(product => ({
          productId: product.id,
          title: product.title,
          handle: product.handle,
          currentVisibility: product.visibility?.value || null,
          proposedVisibility: 'true',
          currentDescriptionLength: product.descriptionHtml?.length || 0,
          proposedDescriptionHtml: buildDescription(product.descriptionHtml || '', product.title),
        })),
      });
    }

    if (body.confirmation !== CONFIRMATION) {
      return NextResponse.json({ error: 'Exact rollout confirmation is required' }, { status: 400 });
    }
    assertExpectedCounts(rollout.catalog.length, rollout.targetProducts.length, body);
    if (mode === 'apply' && process.env.PRODUCT_TSHIRT_ROLLOUT_WRITES_ENABLED !== 'true') {
      return NextResponse.json({ error: 'T-shirt rollout writes are locked' }, { status: 423 });
    }

    const offset = Number(body.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > rollout.catalog.length) {
      return NextResponse.json({ error: 'Batch offset is invalid' }, { status: 400 });
    }
    const batch = rollout.catalog.slice(offset, offset + BATCH_SIZE);
    const succeeded: Array<Record<string, unknown>> = [];
    const failures: Array<Record<string, unknown>> = [];

    for (const product of batch) {
      const isTarget = rollout.tshirtProductIds.has(product.id);
      try {
        if (mode === 'apply') {
          succeeded.push(await updateProduct(product, definition.key, isTarget));
        } else {
          const expectedVisibility = isTarget ? 'true' : 'false';
          const mismatches: string[] = [];
          if (product.visibility?.value !== expectedVisibility) mismatches.push('boolean');
          if (isTarget && !hasLinkedKeywords(product.descriptionHtml || '')) mismatches.push('linked keywords');
          if (mismatches.length) throw new Error(`Verification mismatch: ${mismatches.join(', ')}`);
          succeeded.push({
            productId: product.id,
            title: product.title,
            handle: product.handle,
            visibility: expectedVisibility,
            descriptionVerified: isTarget,
          });
        }
      } catch (error) {
        failures.push({
          productId: product.id,
          title: product.title,
          handle: product.handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextOffset = offset + batch.length;
    return NextResponse.json({
      mode,
      totals: {
        catalogProducts: rollout.catalog.length,
        tshirtProducts: rollout.targetProducts.length,
        nonTshirtProducts: rollout.catalog.length - rollout.targetProducts.length,
      },
      batch: {
        offset,
        attempted: batch.length,
        succeeded: succeeded.length,
        failed: failures.length,
      },
      succeeded,
      failures,
      nextOffset,
      done: nextOffset >= rollout.catalog.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process the T-shirt content rollout';
    console.error('T-shirt content rollout error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
