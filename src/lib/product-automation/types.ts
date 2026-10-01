export type DecorationType = 'print' | 'embroidery';
export type Confidence = 'high' | 'medium' | 'low' | 'missing';
export type DecorationMethod = 'Print' | 'Embroidery';

export type ProductContentCategory =
  | 't-shirt'
  | 'polo'
  | 'hoodie'
  | 'sweatshirt'
  | 'outerwear'
  | 'headwear'
  | 'bottoms'
  | 'bags'
  | 'other';

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface ProductIndustryContext {
  industry: string;
  context: string;
}

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface ProductAutomationInput {
  product_link: string;
  base_price: number;
  decoration_type: DecorationType;
  colors: string[];
  images_ready: boolean;
}

export interface ScrapedProductData {
  title: string;
  brand: string;
  sku: string;
  fabric: string;
  weight: string;
  raw_description: string;
  confidence: Record<'title' | 'brand' | 'sku' | 'fabric' | 'weight' | 'raw_description', Confidence>;
}

export interface AiProductCopy {
  key_features: string[];
  best_use: string[];
  material_care: string[];
  customization_fit: string[];
  seo_description: string;
  product_category: ProductContentCategory;
  quick_spec_tagline: string;
  quick_spec_overview: string;
  specifications: ProductSpecification[];
  industry_handles: string[];
  who_its_great_for: ProductIndustryContext[];
  available_decoration_methods: DecorationMethod[];
  decoration_guide: string;
  product_faqs: ProductFaq[];
  overview_linked_copy: string;
  audience_linked_copy: string;
  customization_linked_copy: string;
  collection_linked_copy: string;
}

export interface PricingTier {
  range: string;
  price: number;
}

export interface PricingTable {
  decoration_type: DecorationType;
  tiers: PricingTier[];
}

export interface ProductVariant {
  color: string;
  size: string;
  title: string;
  sku: string;
  price: number;
}

export interface ShopifyPayload {
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: 'Apparel';
  status: 'DRAFT';
  tags: string[];
  templateSuffix: 'custom-quote';
  options: string[];
  variants: ProductVariant[];
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}
