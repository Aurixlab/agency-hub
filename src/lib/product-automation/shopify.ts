import { REUSABLE_ICON_GROUPS, filenameFromShopifyCdnUrl } from './icon-metafields';
import type { ProductVariant, ShopifyPayload } from './types';

const gidToAdminId = (gid: string) => gid.split('/').pop() || gid;

let cachedIconMetafields: ShopifyPayload['metafields'] | null = null;

export const buildShopifyVariantInput = (variant: ProductVariant) => ({
  price: variant.price.toFixed(2),
  inventoryItem: {
    sku: variant.sku,
  },
  optionValues: [
    { optionName: 'Color', name: variant.color },
    { optionName: 'Size', name: variant.size },
  ],
});

async function shopifyGraphql<T>(
  endpoint: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  retryCount = 0
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    if (response.status === 429 && retryCount < 4) {
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1500));
      return shopifyGraphql<T>(endpoint, token, query, variables, retryCount + 1);
    }
    throw new Error('Shopify request failed (' + String(response.status) + ')');
  }

  const result = await response.json();
  if (result.errors?.length) {
    const throttled = result.errors.some((error: any) => error.extensions?.code === 'THROTTLED');
    if (throttled && retryCount < 4) {
      const cost = result.extensions?.cost;
      const throttle = cost?.throttleStatus;
      const requested = Number(cost?.requestedQueryCost || 100);
      const available = Number(throttle?.currentlyAvailable || 0);
      const restoreRate = Number(throttle?.restoreRate || 50);
      const waitMs = Math.max(1000, Math.ceil(Math.max(requested - available, 50) / restoreRate * 1000));
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return shopifyGraphql<T>(endpoint, token, query, variables, retryCount + 1);
    }
    throw new Error(result.errors.map((error: any) => error.message).join('; '));
  }

  return result.data as T;
}

async function resolveFileIdByUrl(endpoint: string, token: string, url: string) {
  const filename = filenameFromShopifyCdnUrl(url);
  const basename = filename.replace(/\.[^.]+$/, '');
  const expectedPath = new URL(url).pathname.split('?')[0];
  const query = `
    query Files($query: String!) {
      files(first: 10, query: $query) {
        nodes {
          id
          ... on MediaImage {
            image {
              url
            }
          }
          ... on GenericFile {
            url
          }
        }
      }
    }
  `;

  for (const search of [`filename:${filename}`, filename, basename]) {
    const data = await shopifyGraphql<{
      files: { nodes: Array<{ id: string; image?: { url?: string }; url?: string }> };
    }>(endpoint, token, query, { query: search });

    const nodes = data.files.nodes;
    const match = nodes.find(node => {
      const fileUrl = node.image?.url || node.url || '';
      return fileUrl.includes(expectedPath) || fileUrl.includes(filename);
    }) || nodes[0];

    if (match?.id) return match.id;
  }

  throw new Error(`Could not find reusable Shopify file: ${filename}`);
}

async function resolveReusableIconMetafields(endpoint: string, token: string): Promise<ShopifyPayload['metafields']> {
  if (cachedIconMetafields) return cachedIconMetafields;

  const urls = Array.from(new Set(REUSABLE_ICON_GROUPS.flatMap(group => group.urls)));
  const resolved = await Promise.all(urls.map(async url => [url, await resolveFileIdByUrl(endpoint, token, url)] as const));
  const idsByUrl = new Map(resolved);
  const metafields: ShopifyPayload['metafields'] = [];
  for (const group of REUSABLE_ICON_GROUPS) {
    const ids = group.urls.map(url => idsByUrl.get(url)).filter((id): id is string => Boolean(id));
    metafields.push({
      namespace: 'custom',
      key: group.key,
      type: 'list.file_reference',
      value: JSON.stringify(ids),
    });
  }

  cachedIconMetafields = metafields;
  return metafields;
}

async function alignMetafieldsWithDefinitions(
  endpoint: string,
  token: string,
  metafields: ShopifyPayload['metafields']
): Promise<ShopifyPayload['metafields']> {
  const query = `
    query ProductMetafieldDefinitions {
      metafieldDefinitions(first: 100, ownerType: PRODUCT, query: "namespace:custom") {
        nodes {
          namespace
          key
          type {
            name
          }
        }
      }
    }
  `;
  const data = await shopifyGraphql<{
    metafieldDefinitions: {
      nodes: Array<{ namespace: string; key: string; type: { name: string } }>;
    };
  }>(endpoint, token, query, {});
  const definitions = new Map(
    data.metafieldDefinitions.nodes.map(definition => [
      `${definition.namespace}.${definition.key}`,
      definition.type.name,
    ])
  );

  return metafields.map(metafield => {
    const definedType = definitions.get(`${metafield.namespace}.${metafield.key}`);
    if (!definedType || definedType === metafield.type) return metafield;

    let value = metafield.value;
    if (definedType.startsWith('list.') && !metafield.type.startsWith('list.')) {
      value = JSON.stringify(value ? [value] : []);
    } else if (!definedType.startsWith('list.') && metafield.type.startsWith('list.')) {
      try {
        const items = JSON.parse(value);
        value = Array.isArray(items) ? items.filter(Boolean).join(' • ') : String(items ?? '');
      } catch {
        // Keep the original value and let Shopify return a precise validation error.
      }
    }

    return { ...metafield, type: definedType, value };
  });
}

async function deleteProduct(endpoint: string, token: string, productId: string) {
  const mutation = `
    mutation DeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          message
        }
      }
    }
  `;

  await shopifyGraphql(endpoint, token, mutation, { input: { id: productId } });
}

async function setProductMetafields(
  endpoint: string,
  token: string,
  productId: string,
  metafields: ShopifyPayload['metafields'],
  descriptionHtml?: string
) {
  if (!metafields.length) return [];

  const mutation = `
    mutation UpdateProductMetafields($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          metafields(first: 100, namespace: "custom") {
            nodes {
              key
              value
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const result = await shopifyGraphql<{
    productUpdate: {
      product: { metafields: { nodes: Array<{ key: string; value: string }> } } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(endpoint, token, mutation, {
    input: {
      id: productId,
      metafields,
      ...(descriptionHtml !== undefined ? { descriptionHtml } : {}),
    },
  });
  const userErrors = result.productUpdate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map(error => error.message).join('; '));
  }

  const saved = result.productUpdate?.product?.metafields.nodes || [];
  const requiredKeys = metafields.filter(metafield => metafield.value !== '[]').map(metafield => metafield.key);
  const savedKeys = new Set(saved.filter(metafield => metafield.value).map(metafield => metafield.key));
  const missing = requiredKeys.filter(key => !savedKeys.has(key));
  if (missing.length) throw new Error(`Shopify rejected required metafields: ${missing.join(', ')}`);

  return saved;
}

async function verifyProductMetafields(
  endpoint: string,
  token: string,
  productId: string,
  expected: ShopifyPayload['metafields']
) {
  const requiredKeys = expected
    .filter(metafield => metafield.type.startsWith('list.') && metafield.value !== '[]')
    .map(metafield => metafield.key);
  if (!requiredKeys.length) return;

  const query = `
    query VerifyProductMetafields($id: ID!) {
      product(id: $id) {
        metafields(first: 100, namespace: "custom") {
          nodes {
            key
            value
          }
        }
      }
    }
  `;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
    const result = await shopifyGraphql<{
      product: { metafields: { nodes: Array<{ key: string; value: string }> } } | null;
    }>(endpoint, token, query, { id: productId });
    const saved = new Map((result.product?.metafields.nodes || []).map(item => [item.key, item.value]));
    if (requiredKeys.every(key => Boolean(saved.get(key)))) return;
  }

  // metafieldsSet already returned every saved value. A newly created product can
  // take a few seconds to expose those values through the product connection.
}

export function shopifyConfig() {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';

  if (!storeDomain) throw new Error('SHOPIFY_STORE_DOMAIN is not configured');
  if (!token) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN is not configured');

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return {
    cleanDomain,
    endpoint: `https://${cleanDomain}/admin/api/${apiVersion}/graphql.json`,
    token,
  };
}

// Shared server-only Admin API helper. Catalog import uses the same configured
// Shopify connection as draft creation, so credentials never reach the browser.
export async function shopifyAdminGraphql<T>(query: string, variables: Record<string, unknown> = {}) {
  const { endpoint, token } = shopifyConfig();
  return shopifyGraphql<T>(endpoint, token, query, variables);
}

type ShopifyCollectionCandidate = {
  id: string;
  handle: string;
  title: string;
};

const INDUSTRY_COLLECTION_TITLES: Record<string, string> = {
  events: 'Events',
  trades: 'Trades',
  camps: 'Camps',
  schools: 'Schools',
  sports: 'Sports',
  'non-profits': 'Non-Profits',
  restaurants: 'Restaurants',
  corporates: 'Corporates',
  retail: 'Retail',
};

const normalizeCollectionLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export function matchIndustryCollectionIds(
  handles: string[],
  collections: ShopifyCollectionCandidate[]
) {
  const uniqueHandles = Array.from(new Set(handles.map(handle => handle.trim().toLowerCase()).filter(Boolean)));
  const resolved: Record<string, string> = {};

  for (const handle of uniqueHandles) {
    const exactHandleMatch = collections.find(item => item.handle.trim().toLowerCase() === handle);
    const expectedTitle = INDUSTRY_COLLECTION_TITLES[handle] || handle.replace(/-/g, ' ');
    const normalizedExpectedTitle = normalizeCollectionLabel(expectedTitle);
    const titleMatch = collections.find(
      item => normalizeCollectionLabel(item.title) === normalizedExpectedTitle
    );
    const collection = exactHandleMatch || titleMatch;

    if (!collection) throw new Error(`Shopify collection not found for industry: ${handle}`);
    resolved[handle] = collection.id;
  }

  return resolved;
}

export async function resolveShopifyCollectionIds(handles: string[]) {
  const uniqueHandles = Array.from(new Set(handles.map(handle => handle.trim()).filter(Boolean)));
  if (!uniqueHandles.length) return {};

  const query = `
    query ResolveIndustryCollections($after: String) {
      collections(first: 250, after: $after) {
        nodes {
          id
          handle
          title
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  const collections: ShopifyCollectionCandidate[] = [];
  type CollectionPageResult = {
    collections: {
      nodes: ShopifyCollectionCandidate[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  let after: string | null = null;

  do {
    const data: CollectionPageResult = await shopifyAdminGraphql<CollectionPageResult>(query, { after });
    collections.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (after);

  return matchIndustryCollectionIds(uniqueHandles, collections);
}

export async function fetchShopifyEnrichmentTarget(productId: string) {
  const query = `
    query ProductEnrichmentTarget($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        vendor
        tags
        updatedAt
        metafields(first: 100, namespace: "custom") {
          nodes {
            namespace
            key
            type
            value
          }
        }
      }
    }
  `;
  const data = await shopifyAdminGraphql<{
    product: {
      id: string;
      title: string;
      handle: string;
      vendor: string;
      tags: string[];
      updatedAt: string;
      metafields: { nodes: Array<{ namespace: string; key: string; type: string; value: string }> };
    } | null;
  }>(query, { id: productId });
  if (!data.product) throw new Error('Shopify enrichment target was not found');
  return data.product;
}

export async function setShopifyProductMetafieldsOnly(
  productId: string,
  requestedMetafields: ShopifyPayload['metafields']
) {
  const { cleanDomain, endpoint, token } = shopifyConfig();
  const metafields = await alignMetafieldsWithDefinitions(endpoint, token, requestedMetafields);
  const mutation = `
    mutation SetProductEnrichmentMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          namespace
          key
          type
          value
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const result = await shopifyGraphql<{
    metafieldsSet: {
      metafields: Array<{ namespace: string; key: string; type: string; value: string }>;
      userErrors: Array<{ field?: string[]; message: string; code?: string }>;
    };
  }>(endpoint, token, mutation, {
    metafields: metafields.map(metafield => ({ ownerId: productId, ...metafield })),
  });
  const errors = result.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map(error => error.message).join('; '));

  const saved = new Map((result.metafieldsSet?.metafields || []).map(item => [item.key, item.value]));
  const missing = metafields
    .filter(metafield => metafield.value !== '' && metafield.value !== '[]')
    .filter(metafield => !saved.get(metafield.key))
    .map(metafield => metafield.key);
  if (missing.length) throw new Error(`Shopify did not save enrichment metafields: ${missing.join(', ')}`);

  return {
    productId,
    productUrl: `https://${cleanDomain}/admin/products/${gidToAdminId(productId)}`,
    metafields: result.metafieldsSet?.metafields || [],
  };
}

async function resolvedMetafields(
  endpoint: string,
  token: string,
  payload: ShopifyPayload
) {
  const reusableIconMetafields = await resolveReusableIconMetafields(endpoint, token);
  return alignMetafieldsWithDefinitions(endpoint, token, [
    ...payload.metafields,
    ...reusableIconMetafields,
  ]);
}

export async function updateShopifyProductMetafields(productId: string, payload: ShopifyPayload) {
  const { cleanDomain, endpoint, token } = shopifyConfig();
  const metafields = await resolvedMetafields(endpoint, token, payload);
  await setProductMetafields(endpoint, token, productId, metafields, payload.bodyHtml);
  await verifyProductMetafields(endpoint, token, productId, metafields);

  return {
    productId,
    productUrl: `https://${cleanDomain}/admin/products/${gidToAdminId(productId)}`,
  };
}

export async function createShopifyDraftProduct(payload: ShopifyPayload) {
  const { cleanDomain, endpoint, token } = shopifyConfig();
  const metafields = await resolvedMetafields(endpoint, token, payload);

  const createProductMutation = `
    mutation CreateDraftProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
          onlineStoreUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const createResult = await shopifyGraphql<{
    productCreate: {
      product?: { id: string; handle?: string; onlineStoreUrl?: string };
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(endpoint, token, createProductMutation, {
    input: {
      title: payload.title,
      descriptionHtml: payload.bodyHtml,
      vendor: payload.vendor,
      productType: payload.productType,
      status: payload.status,
      tags: payload.tags,
      templateSuffix: payload.templateSuffix,
      productOptions: [
        {
          name: 'Color',
          values: Array.from(new Set(payload.variants.map(variant => variant.color))).map(name => ({ name })),
        },
        {
          name: 'Size',
          values: Array.from(new Set(payload.variants.map(variant => variant.size))).map(name => ({ name })),
        },
      ],
    },
  });

  const createUserErrors = createResult.productCreate?.userErrors || [];
  if (createUserErrors.length) {
    throw new Error(createUserErrors.map((e: any) => e.message).join('; '));
  }

  const product = createResult.productCreate?.product;
  if (!product?.id) throw new Error('Shopify did not return a product ID');

  const createVariantsMutation = `
    mutation CreateProductVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(
        productId: $productId,
        variants: $variants,
        strategy: REMOVE_STANDALONE_VARIANT
      ) {
        productVariants {
          id
          sku
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const variantsResult = await shopifyGraphql<{
      productVariantsBulkCreate: {
        productVariants: Array<{ id: string; sku?: string }>;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>(endpoint, token, createVariantsMutation, {
      productId: product.id,
      variants: payload.variants.map(buildShopifyVariantInput),
    });

    const variantUserErrors = variantsResult.productVariantsBulkCreate?.userErrors || [];
    if (variantUserErrors.length) {
      throw new Error(variantUserErrors.map((e: any) => e.message).join('; '));
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    await setProductMetafields(endpoint, token, product.id, metafields);
    await verifyProductMetafields(endpoint, token, product.id, metafields);
  } catch (error) {
    try {
      await deleteProduct(endpoint, token, product.id);
    } catch {
      // Preserve the original variant error; cleanup is best effort.
    }
    throw error;
  }

  const adminId = gidToAdminId(product.id);
  return {
    productId: product.id as string,
    productUrl: `https://${cleanDomain}/admin/products/${adminId}`,
  };
}
