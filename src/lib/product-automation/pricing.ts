import type { DecorationType, PricingTable } from './types';

const money = (value: number) => Math.round(value * 100) / 100;

export function calculatePricing(basePrice: number, decorationType: DecorationType): PricingTable {
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error('Base price must be a positive number');
  }

  if (decorationType === 'print') {
    return {
      decoration_type: decorationType,
      tiers: [
        { range: '1-24', price: money((basePrice + 3.5) * 1.9) },
        { range: '25-99', price: money((basePrice + 1.56) * 1.85) },
        { range: '100-499', price: money((basePrice + 1.15) * 1.8) },
        { range: '500+', price: money((basePrice + 0.82) * 1.6) },
      ],
    };
  }

  return {
    decoration_type: decorationType,
    tiers: [
      { range: '12-23', price: money((basePrice + 5.35) * 1.94) },
      { range: '24-47', price: money((basePrice + 5.35) * 1.9) },
      { range: '48-99', price: money((basePrice + 4.06) * 1.8) },
      { range: '100+', price: money((basePrice + 3.87) * 1.7) },
    ],
  };
}
