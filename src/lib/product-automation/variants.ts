import type { ProductVariant } from './types';

export const FIXED_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const;

const cleanSkuPart = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

export function generateVariants(colors: string[], baseSku: string, price: number): ProductVariant[] {
  const cleanedColors = Array.from(new Set(colors.map(c => c.trim()).filter(Boolean)));
  const skuRoot = cleanSkuPart(baseSku || 'SPAE');

  return cleanedColors.flatMap(color =>
    FIXED_SIZES.map(size => ({
      color,
      size,
      title: `${color} / ${size}`,
      sku: `${skuRoot}-${cleanSkuPart(color) || 'COLOR'}-${size}`,
      price,
    }))
  );
}
