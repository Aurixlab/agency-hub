import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import {
  INDUSTRY_OPTIONS,
  INTERNAL_LINK_STRATEGIES,
  PRODUCT_CONTENT_CATEGORIES,
  industryName,
  normalizeDecorationMethods,
  normalizeIndustryHandles,
} from './content-config';
import type {
  AiProductCopy,
  DecorationMethod,
  DecorationType,
  ProductContentCategory,
  ProductFaq,
  ProductIndustryContext,
  ProductSpecification,
  ScrapedProductData,
} from './types';

export interface ProductCopyGenerationOptions {
  pricingDecoration: DecorationType;
  availableDecorationMethods?: DecorationMethod[];
  preferredIndustryHandles?: string[];
  colors?: string[];
  sizes?: string[];
}

const cleanText = (value: unknown, max = 4_000) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

const cleanList = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === 'string')
    .map(item => cleanText(item, 500))
    .filter(Boolean)
    .slice(0, max);

const cleanSpecifications = (value: unknown): ProductSpecification[] =>
  (Array.isArray(value) ? value : [])
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .map(item => ({ label: cleanText(item.label, 80), value: cleanText(item.value, 400) }))
    .filter(item => item.label && item.value)
    .slice(0, 8);

const cleanFaqs = (value: unknown): ProductFaq[] =>
  (Array.isArray(value) ? value : [])
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .map(item => ({ question: cleanText(item.question, 220), answer: cleanText(item.answer, 900) }))
    .filter(item => item.question && item.answer)
    .slice(0, 3);

const cleanIndustryContexts = (value: unknown): ProductIndustryContext[] =>
  (Array.isArray(value) ? value : [])
    .map(item => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .map(item => ({ industry: cleanText(item.industry, 80), context: cleanText(item.context, 500) }))
    .filter(item => item.industry && item.context);

function inferCategory(source: Record<string, unknown>, scrapedData?: ScrapedProductData): ProductContentCategory {
  const rawCandidate = cleanText(source.product_category, 40).toLowerCase();
  const candidate = ({
    tshirt: 't-shirt',
    't shirt': 't-shirt',
    tee: 't-shirt',
    cap: 'headwear',
    hat: 'headwear',
    jacket: 'outerwear',
    vest: 'outerwear',
    pants: 'bottoms',
    shorts: 'bottoms',
    bag: 'bags',
  }[rawCandidate] || rawCandidate) as ProductContentCategory;
  if (PRODUCT_CONTENT_CATEGORIES.includes(candidate)) return candidate;

  const text = `${scrapedData?.title || ''} ${scrapedData?.raw_description || ''}`.toLowerCase();
  if (/\b(t-?shirt|tee)\b/.test(text)) return 't-shirt';
  if (/\bpolo\b/.test(text)) return 'polo';
  if (/\bhoodie\b/.test(text)) return 'hoodie';
  if (/\bsweatshirt\b/.test(text)) return 'sweatshirt';
  if (/\b(jacket|vest|coat|shell)\b/.test(text)) return 'outerwear';
  if (/\b(cap|hat|toque|beanie|headwear)\b/.test(text)) return 'headwear';
  if (/\b(shorts?|pants?|sweatpants?|bottoms?)\b/.test(text)) return 'bottoms';
  if (/\b(bag|backpack|duffel)\b/.test(text)) return 'bags';
  return 'other';
}

function linkedCopyWithFallback(
  source: Record<string, unknown>,
  category: ProductContentCategory,
  overview: string,
  decorationGuide: string,
  title: string
) {
  const empty = {
    overview_linked_copy: '',
    audience_linked_copy: '',
    customization_linked_copy: '',
    collection_linked_copy: '',
  };
  const strategy = INTERNAL_LINK_STRATEGIES[category];
  if (!strategy) return empty;

  const fallbacks: typeof empty = {
    overview_linked_copy: `${overview} This custom t-shirt is prepared for consistent branded group orders.`.trim(),
    audience_linked_copy: 'A practical custom apparel choice for coordinated teams, staff, organizations, and events.',
    customization_linked_copy: `${decorationGuide} It gives custom t shirt merchandise a consistent, quote-ready production path.`.trim(),
    collection_linked_copy: `Compare ${title || 'this style'} with more Custom merchandise in our T-shirt collection to find the right fit, fabric, colour range, and style for your order.`,
  };

  return Object.fromEntries(strategy.fields.map(({ key, keyword }) => {
    const generated = cleanText(source[key], 1_500);
    const value = generated.toLowerCase().includes(keyword.toLowerCase()) ? generated : fallbacks[key];
    return [key, value];
  })) as typeof empty;
}

export const emptyAiProductCopy = (): AiProductCopy => ({
  key_features: [],
  best_use: [],
  material_care: [],
  customization_fit: [],
  seo_description: '',
  product_category: 'other',
  quick_spec_tagline: '',
  quick_spec_overview: '',
  specifications: [],
  industry_handles: [],
  who_its_great_for: [],
  available_decoration_methods: [],
  decoration_guide: '',
  product_faqs: [],
  overview_linked_copy: '',
  audience_linked_copy: '',
  customization_linked_copy: '',
  collection_linked_copy: '',
});

export function validateAiCopy(
  raw: unknown,
  scrapedData?: ScrapedProductData,
  options: ProductCopyGenerationOptions = { pricingDecoration: 'print' }
): AiProductCopy {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const productCategory = inferCategory(source, scrapedData);
  const preferredIndustries = normalizeIndustryHandles(options.preferredIndustryHandles);
  const industryHandles = preferredIndustries.length
    ? preferredIndustries
    : normalizeIndustryHandles(source.industry_handles).slice(0, 5);
  const generatedContexts = cleanIndustryContexts(source.who_its_great_for);
  const whoItsGreatFor = industryHandles.map(handle => {
    const name = industryName(handle);
    const match = generatedContexts.find(item =>
      item.industry.toLowerCase().replace(/[^a-z0-9]+/g, '') === name.toLowerCase().replace(/[^a-z0-9]+/g, '')
    );
    return match || {
      industry: name,
      context: `A practical branded product for ${name.toLowerCase()} teams, programs, and group orders.`,
    };
  });
  const overview = cleanText(source.quick_spec_overview, 1_500);
  const decorationGuide = cleanText(source.decoration_guide, 1_500);
  const linkedCopy = linkedCopyWithFallback(
    source,
    productCategory,
    overview,
    decorationGuide,
    scrapedData?.title || ''
  );

  return {
    key_features: cleanList(source.key_features, 4),
    best_use: cleanList(source.best_use, 4),
    material_care: cleanList(source.material_care, 3),
    customization_fit: cleanList(source.customization_fit, 3),
    seo_description: cleanText(source.seo_description, 320),
    product_category: productCategory,
    quick_spec_tagline: cleanText(source.quick_spec_tagline, 240),
    quick_spec_overview: overview,
    specifications: cleanSpecifications(source.specifications),
    industry_handles: industryHandles,
    who_its_great_for: whoItsGreatFor,
    available_decoration_methods: normalizeDecorationMethods(
      options.availableDecorationMethods || source.available_decoration_methods,
      options.pricingDecoration
    ),
    decoration_guide: decorationGuide,
    product_faqs: cleanFaqs(source.product_faqs),
    ...linkedCopy,
  };
}

export function assertAiCopyReady(copy: AiProductCopy) {
  const failures: string[] = [];
  if (copy.key_features.length !== 4) failures.push('4 product features');
  if (copy.best_use.length !== 4) failures.push('4 best-use items');
  if (copy.material_care.length !== 3) failures.push('3 material-and-care items');
  if (copy.customization_fit.length !== 3) failures.push('3 customization-and-fit items');
  if (!copy.quick_spec_tagline) failures.push('quick-spec tagline');
  if (!copy.quick_spec_overview) failures.push('quick-spec overview');
  if (copy.specifications.length < 4) failures.push('at least 4 specifications');
  if (!copy.industry_handles.length) failures.push('at least 1 industry');
  if (copy.who_its_great_for.length !== copy.industry_handles.length) failures.push('industry contexts');
  if (!copy.available_decoration_methods.length) failures.push('decoration methods');
  if (!copy.decoration_guide) failures.push('decoration guide');
  if (copy.product_faqs.length !== 3) failures.push('3 product FAQs');

  const linkStrategy = INTERNAL_LINK_STRATEGIES[copy.product_category];
  if (linkStrategy) {
    for (const { key, keyword } of linkStrategy.fields) {
      if (!copy[key].toLowerCase().includes(keyword.toLowerCase())) failures.push(`${key} with “${keyword}”`);
    }
  }

  if (failures.length) {
    throw new Error(`Generated content is incomplete: ${failures.join(', ')}. Generate the copy again or complete the missing fields before previewing.`);
  }
}

export async function generateProductCopy(
  scrapedData: ScrapedProductData,
  options: ProductCopyGenerationOptions
): Promise<AiProductCopy> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.PRODUCT_COPY_GEMINI_MODEL || 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          key_features: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          best_use: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          material_care: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          customization_fit: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          seo_description: { type: SchemaType.STRING },
          product_category: { type: SchemaType.STRING },
          quick_spec_tagline: { type: SchemaType.STRING },
          quick_spec_overview: { type: SchemaType.STRING },
          specifications: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                label: { type: SchemaType.STRING },
                value: { type: SchemaType.STRING },
              },
              required: ['label', 'value'],
            },
          },
          industry_handles: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          who_its_great_for: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                industry: { type: SchemaType.STRING },
                context: { type: SchemaType.STRING },
              },
              required: ['industry', 'context'],
            },
          },
          available_decoration_methods: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          decoration_guide: { type: SchemaType.STRING },
          product_faqs: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                question: { type: SchemaType.STRING },
                answer: { type: SchemaType.STRING },
              },
              required: ['question', 'answer'],
            },
          },
          overview_linked_copy: { type: SchemaType.STRING },
          audience_linked_copy: { type: SchemaType.STRING },
          customization_linked_copy: { type: SchemaType.STRING },
          collection_linked_copy: { type: SchemaType.STRING },
        },
        required: [
          'key_features',
          'best_use',
          'material_care',
          'customization_fit',
          'seo_description',
          'product_category',
          'quick_spec_tagline',
          'quick_spec_overview',
          'specifications',
          'industry_handles',
          'who_its_great_for',
          'available_decoration_methods',
          'decoration_guide',
          'product_faqs',
          'overview_linked_copy',
          'audience_linked_copy',
          'customization_linked_copy',
          'collection_linked_copy',
        ],
      },
    },
  });

  const primaryMethod = options.pricingDecoration === 'embroidery' ? 'Embroidery' : 'Print';
  const availableMethods = normalizeDecorationMethods(options.availableDecorationMethods, options.pricingDecoration);
  const preferredIndustries = normalizeIndustryHandles(options.preferredIndustryHandles);
  const industryList = INDUSTRY_OPTIONS.map(option => `${option.handle} (${option.name})`).join(', ');
  const linkingInstructions = `For product_category "t-shirt" only, create four natural, non-repetitive linked-copy paragraphs. Use each exact phrase once in its assigned field: overview_linked_copy contains "custom t-shirt" and is a complete 50-70 word overview; audience_linked_copy contains "custom apparel"; customization_linked_copy contains "custom t shirt merchandise" and is a complete decoration guide; collection_linked_copy contains "Custom merchandise" and invites comparison with the T-shirt collection. Do not use any of these T-shirt phrases for another category. For a non-T-shirt, return an empty string for all four linked-copy fields.`;

  const prompt = `You are producing fact-safe, professional Shopify product content for Budget Promotion.

Return only JSON matching the supplied schema. This one response powers both the existing product accordions and the enriched product-details section.

Required structure:
- key_features: exactly 4 concise product facts.
- best_use: exactly 4 concise, practical use cases.
- material_care: exactly 3 concise items covering material and safe care guidance.
- customization_fit: exactly 3 concise items covering fit, approved decoration, and label/construction only when supported.
- seo_description: one plain catalog sentence, maximum 160 characters.
- product_category: exactly one of ${PRODUCT_CONTENT_CATEGORIES.join(', ')}.
- quick_spec_tagline: a concise editorial product promise; one or two short sentences.
- quick_spec_overview: 50-70 words in 2-3 sentences.
- specifications: 4-7 objects with factual label/value pairs. Prefer Fabric or Material, Weight, Fit, Sizes, Colours, and Care. Do not invent a missing technical value.
- industry_handles: choose 1-5 handles only from ${industryList}.${preferredIndustries.length ? ` Use exactly these user-approved handles: ${preferredIndustries.join(', ')}.` : ' Select conservatively from the supplied product facts and practical use cases.'}
- who_its_great_for: one object for every selected industry, using its customer-facing name and one short specific context sentence.
- available_decoration_methods: return exactly ${JSON.stringify(availableMethods)}. The pricing ladder is ${primaryMethod}.
- decoration_guide: 2-3 useful sentences explaining the approved method(s), product surface/construction, and that quantity tiers determine pricing. Do not invent decoration compatibility.
- product_faqs: exactly 3 useful question/answer pairs covering current options, decoration/pricing, and material/care or fit.
- ${linkingInstructions}

Rules:
- Use Canadian spelling (colour, customised where applicable).
- Never invent certifications, inventory, lead times, fabric percentages, weights, dimensions, performance claims, or supplier facts.
- If care specifics are unavailable, say to follow the sewn-in care label instead of guessing temperatures.
- Do not include HTML, Markdown, links, citations, references, or pricing figures.
- Do not mention gender unless it is necessary to distinguish the exact supplier style.
- Avoid hype, repetition, keyword stuffing, and generic filler.
- Current generated variants use sizes ${(options.sizes || []).join(', ') || 'S, M, L, XL, 2XL, 3XL'} and colours ${(options.colors || []).join(', ') || 'provided in Mission Control'}.

Verified supplier data:
${JSON.stringify(scrapedData, null, 2)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini did not return valid JSON');
    raw = JSON.parse(match[0]);
  }

  const copy = validateAiCopy(raw, scrapedData, options);
  assertAiCopyReady(copy);
  return copy;
}
