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
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error(`Shopify request failed (${response.status})`);

  const result = await response.json();
  if (result.errors?.length) {
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

  const metafields: ShopifyPayload['metafields'] = [];
  for (const group of REUSABLE_ICON_GROUPS) {
    const ids = await Promise.all(group.urls.map(url => resolveFileIdByUrl(endpoint, token, url)));
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

export async function createShopifyDraftProduct(payload: ShopifyPayload) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';

  if (!storeDomain) throw new Error('SHOPIFY_STORE_DOMAIN is not configured');
  if (!token) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN is not configured');

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const endpoint = `https://${cleanDomain}/admin/api/${apiVersion}/graphql.json`;
  const reusableIconMetafields = await resolveReusableIconMetafields(endpoint, token);
  const metafields = await alignMetafieldsWithDefinitions(endpoint, token, [
    ...payload.metafields,
    ...reusableIconMetafields,
  ]);

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
      metafields,
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
