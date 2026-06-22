import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { AiProductCopy, ScrapedProductData } from './types';

const cleanList = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, max);

export function validateAiCopy(raw: unknown): AiProductCopy {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    key_features: cleanList(source.key_features, 4),
    best_use: cleanList(source.best_use, 4),
    material_care: cleanList(source.material_care, 3),
    customization_fit: cleanList(source.customization_fit, 3),
    seo_description: typeof source.seo_description === 'string' ? source.seo_description.trim().slice(0, 320) : '',
  };
}

export async function generateProductCopy(scrapedData: ScrapedProductData): Promise<AiProductCopy> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.PRODUCT_COPY_GEMINI_MODEL || 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          key_features: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          best_use: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          material_care: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          customization_fit: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          seo_description: { type: SchemaType.STRING },
        },
        required: ['key_features', 'best_use', 'material_care', 'customization_fit', 'seo_description'],
      },
    },
  });

  const prompt = `You are writing short, professional apparel catalog copy for a product.

Output only JSON with these exact keys:
- key_features: 4 short bullets
- best_use: 4 short bullets
- material_care: 3 short bullets
- customization_fit: 3 short bullets
- seo_description: one short plain catalog sentence

Rules:
- Do not include links, citations, references, brand stories, extra notes, pricing, variants, inventory, or image instructions.
- Do not mention gender.
- Keep every bullet short, clear, non-repetitive, and free of marketing hype.
- Use a consistent plain catalog tone across all sections.
- Avoid long sentences and fluff.
- If a detail is unknown, do not guess. Write it generally, such as "performance fabric blend".
- Key features must focus on fabric type, weight, construction, durability, and performance traits.
- Best use must use practical situations such as uniforms, events, workwear, everyday wear, training, or travel.
- Material care must include fabric composition only if available, plus simple wash and dry instructions.
- Customization fit must include fit type, realistic apparel decoration methods, and label type only if confirmed.
- Decoration methods may include screen print, DTG, heat transfer, embroidery, and sublimation when realistic.
- Use "embroidery-only" only if the product data explicitly says that.

Product data:
${JSON.stringify(scrapedData, null, 2)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return validateAiCopy(JSON.parse(text));
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini did not return valid JSON');
    return validateAiCopy(JSON.parse(match[0]));
  }
}
