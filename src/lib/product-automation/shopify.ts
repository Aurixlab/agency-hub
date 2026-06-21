import type { ShopifyPayload } from './types';

const gidToAdminId = (gid: string) => gid.split('/').pop() || gid;

export async function createShopifyDraftProduct(payload: ShopifyPayload) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';

  if (!storeDomain) throw new Error('SHOPIFY_STORE_DOMAIN is not configured');
  if (!token) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN is not configured');

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const endpoint = `https://${cleanDomain}/admin/api/${apiVersion}/graphql.json`;

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
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
          metafields: payload.metafields,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`Shopify request failed (${response.status})`);

  const result = await response.json();
  if (result.errors?.length) {
    throw new Error(result.errors.map((e: any) => e.message).join('; '));
  }

  const userErrors = result.data?.productCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e: any) => e.message).join('; '));
  }

  const product = result.data?.productCreate?.product;
  if (!product?.id) throw new Error('Shopify did not return a product ID');

  const adminId = gidToAdminId(product.id);
  return {
    productId: product.id as string,
    productUrl: `https://${cleanDomain}/admin/products/${adminId}`,
  };
}
