# Product Description Automation — Next Steps

The Shopify catalog is now imported into Product Automation. Importing only reads product data; it does not change anything in Shopify.

## Recommended workflow

1. In **Imported Products**, select a small test batch of 10 products.
2. Create an enrichment batch and choose the fields to generate:
   - product description
   - SEO title and meta description
   - feature, use, care, and customization metafields
   - optional tags and image alt text
3. Generate draft content from the imported Shopify data. Drafting must not update Shopify.
4. Review the current and proposed values side by side. Edit, approve, or skip each product.
5. Apply only approved products to Shopify.
6. Check the updated products in the storefront and Shopify Admin.
7. If the test batch looks correct, continue in batches of 25–50 products.

## Safeguards

- Do not automatically change titles, variants, prices, inventory, images, or manually managed fields.
- Only apply fields explicitly approved in the review step.
- Preserve the imported Shopify snapshot so every proposed change can be compared with the original.
- Use supplier or product-spec data when available; do not invent material, fit, care, or performance claims.

## Next build

Add a **Bulk Enrichment** area to Product Automation with product selection, draft generation, review, approval, and an **Apply approved changes** action.
