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

const parseJsonObject = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('DeepSeek did not return JSON');
    return JSON.parse(match[0]);
  }
};

export async function generateProductCopy(scrapedData: ScrapedProductData): Promise<AiProductCopy> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You write short, professional apparel catalog copy.',
            'Return only valid JSON with keys: key_features, best_use, material_care, customization_fit, seo_description.',
            'Do not include links, citations, references, brand stories, extra notes, pricing, variants, inventory, or image instructions.',
            'Do not mention gender. Keep every bullet short, clear, non-repetitive, and free of marketing hype.',
            'Use a consistent plain catalog tone across all sections. Avoid long sentences and fluff.',
            'If a product detail is unknown, do not guess; write it generally, such as "performance fabric blend".',
            'For key_features, focus on fabric type, weight, construction, durability, and performance traits.',
            'For best_use, use practical situations such as uniforms, events, workwear, everyday wear, training, or travel.',
            'For material_care, include fabric composition only if available, plus simple wash and dry instructions.',
            'For customization_fit, include fit type, realistic apparel decoration methods, and label type only if confirmed.',
            'Decoration methods may include screen print, DTG, heat transfer, embroidery, and sublimation when realistic.',
            'Use "embroidery-only" only if the product data explicitly says that.',
            'seo_description must be one short, plain catalog sentence in the same tone.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            product: scrapedData,
            limits: {
              key_features: 4,
              best_use: 4,
              material_care: 3,
              customization_fit: 3,
            },
          }),
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('DeepSeek billing or credits are not available for this API key');
    }
    throw new Error(`DeepSeek request failed (${response.status})`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('DeepSeek returned an empty response');

  return validateAiCopy(parseJsonObject(content));
}
