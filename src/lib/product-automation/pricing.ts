import type { DecorationType, PricingTable } from './types';

const money = (value: number) => Math.round(value * 100) / 100;

// Supplier cost discounts: the base price entered is the list price, and the discount is
// taken off before the pricing formulas run (e.g. Helly Hansen $400 -> $240 -> formulas).
const SUPPLIER_DISCOUNTS: Array<{ match: RegExp; discount: number }> = [
  { match: /helly[\s-]*hansen/i, discount: 0.4 },
];

export function discountedBasePrice(basePrice: number, brand: string | undefined | null) {
  const rule = SUPPLIER_DISCOUNTS.find(item => item.match.test(brand || ''));
  return rule ? money(basePrice * (1 - rule.discount)) : basePrice;
}

export function calculatePricing(basePrice: number, decorationType: DecorationType): PricingTable {
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error('Base price must be a positive number');
  }

  if (decorationType === 'print') {
    return {
      decoration_type: decorationType,
      tiers: [
        { range: '1-24', price: money(basePrice * 1.9 + 9) },
        { range: '25-99', price: money(basePrice * 1.85 + 4) },
        { range: '100-499', price: money(basePrice * 1.8 + 2.5) },
        { range: '500+', price: money(basePrice * 1.6 + 1.25) },
      ],
    };
  }

  return {
    decoration_type: decorationType,
    tiers: [
      { range: '12-23', price: money((basePrice + 5.52) * 1.95) },
      { range: '24-47', price: money((basePrice + 5.52) * 1.9) },
      { range: '48-99', price: money((basePrice + 4.61) * 1.8) },
      { range: '100+', price: money((basePrice + 3.84) * 1.6) },
    ],
  };
}
