import type { CreativeInsights, CreativeItemDto, ExpandedTopic } from './types';

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export function generateInsights(items: CreativeItemDto[], expandedTopic: ExpandedTopic): CreativeInsights {
  const topItems = items.slice(0, 8);
  const topHooks = uniq([
    ...topItems.map((item) => item.hook).filter((hook): hook is string => !!hook),
    `Make your team ${expandedTopic.primaryTopic}-ready`,
    `Do not show up to ${expandedTopic.primaryTopic} empty-handed`,
    `Best branded items for ${expandedTopic.primaryTopic}`,
  ]).slice(0, 6);

  const visualPatterns = uniq([
    ...topItems.map((item) => item.visualStyle).filter((style): style is string => !!style),
    'Quick product or outfit reveal',
    'Team/event setup montage',
    'Close-up shots of branded apparel in use',
    'Before-and-after brand transformation',
  ]).slice(0, 6);

  const productOpportunities = uniq([
    ...topItems.map((item) => item.productFit).filter((product): product is string => !!product),
    ...expandedTopic.productKeywords,
  ]).slice(0, 8);

  const targetAudience = expandedTopic.audienceKeywords[0] ?? 'Canadian businesses';

  return {
    topHooks,
    visualPatterns,
    productOpportunities,
    campaignIdeas: [
      {
        title: `Make Your Team ${expandedTopic.primaryTopic}-Ready`,
        hook: `Your ${expandedTopic.primaryTopic} moment is coming. Is your team ready?`,
        products: productOpportunities.slice(0, 3),
        visualDirection: 'Start with a plain team/event setup, then quick-cut into branded apparel and merch in use.',
        targetAudience,
        cta: `Order custom merch before ${expandedTopic.primaryTopic}.`,
      },
      {
        title: `Do Not Show Up Empty-Handed`,
        hook: `The easiest way to make your ${expandedTopic.primaryTopic} activation more memorable.`,
        products: productOpportunities.slice(1, 4),
        visualDirection: 'Show event guests receiving useful branded items, then cut to close-ups of the products.',
        targetAudience: expandedTopic.audienceKeywords[1] ?? targetAudience,
        cta: 'Build your giveaway kit with Budget Promotion.',
      },
      {
        title: `Merch People Will Actually Use`,
        hook: 'Skip throwaway swag. Make branded items your audience keeps.',
        products: productOpportunities.slice(0, 4),
        visualDirection: 'Compare generic giveaways against apparel, hats, and drinkware people keep using after the event.',
        targetAudience: expandedTopic.audienceKeywords[2] ?? targetAudience,
        cta: 'Plan your next branded merch drop.',
      },
    ],
    contentBuckets: [
      {
        label: 'Organic Content Signals',
        description: 'Reels with useful reach, engagement, and seasonal relevance.',
        itemIds: topItems.filter((item) => item.type.includes('reel')).map((item) => item.id),
      },
      {
        label: 'Business Fit',
        description: 'Items that connect most clearly to apparel, merch, events, or local business needs.',
        itemIds: topItems.filter((item) => item.businessScore >= 50).map((item) => item.id),
      },
      {
        label: 'Creative Formats',
        description: 'Items with reusable hooks, visual structure, or campaign angles.',
        itemIds: topItems.filter((item) => item.creativeScore >= 40).map((item) => item.id),
      },
    ],
  };
}
