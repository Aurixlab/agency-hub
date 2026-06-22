import { REUSABLE_ICON_GROUPS, filenameFromShopifyCdnUrl } from './icon-metafields';
import type { ShopifyPayload } from './types';

const gidToAdminId = (gid: string) => gid.split('/').pop() || gid;

let cachedIconMetafields: ShopifyPayload['metafields'] | null = null;

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

export async function createShopifyDraftProduct(payload: ShopifyPayload) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';

  if (!storeDomain) throw new Error('SHOPIFY_STORE_DOMAIN is not configured');
  if (!token) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN is not configured');

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const endpoint = `https://${cleanDomain}/admin/api/${apiVersion}/graphql.json`;
  const reusableIconMetafields = await resolveReusableIconMetafields(endpoint, token);

  const mutation = `
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

  const result = await shopifyGraphql<{
    productCreate: {
      product?: { id: string; handle?: string; onlineStoreUrl?: string };
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(endpoint, token, mutation, {
    input: {
      title: payload.title,
      bodyHtml: payload.bodyHtml,
      vendor: payload.vendor,
      productType: payload.productType,
      status: payload.status,
      tags: payload.tags,
      templateSuffix: payload.templateSuffix,
      options: payload.options,
      variants: payload.variants.map(variant => ({
        sku: variant.sku,
        price: String(variant.price.toFixed(2)),
        options: [variant.color, variant.size],
      })),
      metafields: [
        ...payload.metafields,
        ...reusableIconMetafields,
      ],
    },
  });

  const userErrors = result.productCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e: any) => e.message).join('; '));
  }

  const product = result.productCreate?.product;
  if (!product?.id) throw new Error('Shopify did not return a product ID');

  const adminId = gidToAdminId(product.id);
  return {
    productId: product.id as string,
    productUrl: `https://${cleanDomain}/admin/products/${adminId}`,
  };
}
