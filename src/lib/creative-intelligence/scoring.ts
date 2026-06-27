import type { ExpandedTopic, RawCreativeItem } from './types';

const BUSINESS_TERMS = [
  'custom apparel',
  'branded',
  'merch',
  'promotional',
  'giveaway',
  'uniform',
  'staff',
  'event',
  'corporate',
  'team',
  'hat',
  'shirt',
  'hoodie',
  'jacket',
  'bandana',
  'polo',
  'trade show',
  'golf tournament',
];

const CREATIVE_TERMS = [
  'before after',
  'transition',
  'reveal',
  'setup',
  'giveaway',
  'behind the scenes',
  'unboxing',
  'testimonial',
  'problem',
  'solution',
  'what to wear',
  "don't show up",
  'get ready with me',
  'pov',
  '3 ideas',
  'mistakes',
  'best items',
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function textFor(item: RawCreativeItem): string {
  return [
    item.caption,
    item.adCopy,
    item.creatorHandle,
    item.creatorName,
    item.city,
    item.country,
    JSON.stringify(item.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function countMatches(text: string, terms: string[]): number {
  return terms.filter((term) => text.includes(term.toLowerCase())).length;
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function metadataNumber(item: RawCreativeItem, keys: string[]): number {
  const metadata = item.metadata ?? {};
  for (const key of keys) {
    const value = (metadata as any)?.[key];
    const n = safeNumber(value);
    if (n > 0) return n;
  }
  const owner = (metadata as any)?.owner ?? (metadata as any)?.user;
  for (const key of keys) {
    const n = safeNumber(owner?.[key]);
    if (n > 0) return n;
  }
  return 0;
}

function detectHook(text: string): string | null {
  const hooks = [
    'POV',
    'What to wear',
    'Get ready with me',
    'Before and after',
    'Behind the scenes',
    '3 ideas',
    'Mistakes to avoid',
    'Do not show up without',
    'Best items for your event',
  ];
  return hooks.find((hook) => text.includes(hook.toLowerCase())) ?? null;
}

function detectVisualStyle(text: string): string | null {
  if (text.includes('behind the scenes') || text.includes('setup')) return 'Behind-the-scenes event setup';
  if (text.includes('transition') || text.includes('reveal')) return 'Fast transition or outfit reveal';
  if (text.includes('unboxing')) return 'Product unboxing or merch reveal';
  if (text.includes('pov')) return 'POV-style short-form reel';
  return null;
}

function detectContentAngle(text: string): string | null {
  if (text.includes('giveaway')) return 'Giveaway and event freebie angle';
  if (text.includes('what to wear') || text.includes('outfit')) return 'Event outfit planning';
  if (text.includes('team') || text.includes('staff')) return 'Team identity and staff apparel';
  if (text.includes('sponsor')) return 'Sponsor visibility and branded merch';
  return null;
}

function productFit(text: string, expandedTopic: ExpandedTopic): string | null {
  return expandedTopic.productKeywords.find((product) => text.includes(product.toLowerCase())) ?? null;
}

function targetAudience(text: string, expandedTopic: ExpandedTopic): string | null {
  return expandedTopic.audienceKeywords.find((audience) => text.includes(audience.toLowerCase())) ?? null;
}

export function scoreCreativeItem(item: RawCreativeItem, expandedTopic: ExpandedTopic) {
  const text = textFor(item);
  const normalizedTopicTerms = expandedTopic.normalizedTopic.split(/\s+/).filter(Boolean);
  const relevanceTerms = [
    expandedTopic.primaryTopic,
    expandedTopic.normalizedTopic,
    ...normalizedTopicTerms,
    ...expandedTopic.relatedKeywords,
    ...expandedTopic.eventKeywords,
    ...expandedTopic.hashtags,
  ];
  const relevanceMatches = countMatches(text, relevanceTerms);
  const exactTopicMatch = text.includes(expandedTopic.normalizedTopic.toLowerCase()) ? 1 : 0;
  const relevanceScore = clamp(exactTopicMatch * 45 + relevanceMatches * 12);

  const engagement = safeNumber(item.viewCount) + safeNumber(item.likeCount) * 2 + safeNumber(item.commentCount) * 5 + safeNumber(item.shareCount) * 8;
  const views = safeNumber(item.viewCount);
  const likes = safeNumber(item.likeCount);
  const comments = safeNumber(item.commentCount);
  const followers = metadataNumber(item, ['ownerFollowersCount', 'followersCount', 'followerCount', 'followers']);
  const engagementRate = views > 0 ? (likes + comments * 3) / views : 0;
  const followerLift = followers > 0 ? views / Math.max(1, followers) : 0;
  const rawReachScore = Math.log10(views + 1) * 13;
  const engagementRateScore = Math.min(35, engagementRate * 550);
  const followerLiftScore = followers > 0 ? Math.min(40, Math.log10(followerLift + 1) * 35) : 15;
  const viralScore = clamp(rawReachScore + engagementRateScore + followerLiftScore + Math.log10(engagement + 1) * 4);

  const publishedAt = item.publishedAt?.getTime();
  const ageDays = publishedAt ? (Date.now() - publishedAt) / 86_400_000 : 14;
  const recencyScore = clamp(100 - Math.max(0, ageDays) * 4);

  const localityScore = clamp(20 + countMatches(text, [...expandedTopic.locations, 'yyc']) * 25);
  const businessScore = clamp(15 + countMatches(text, [...BUSINESS_TERMS, ...expandedTopic.productKeywords, ...expandedTopic.audienceKeywords]) * 12);
  const creativeScore = clamp(15 + countMatches(text, CREATIVE_TERMS) * 15);

  const finalScore = clamp(
    relevanceScore * 0.45 +
      viralScore * 0.35 +
      recencyScore * 0.1 +
      creativeScore * 0.1
  );

  const hook = detectHook(text);
  const visualStyle = detectVisualStyle(text);
  const contentAngle = detectContentAngle(text);
  const fit = productFit(text, expandedTopic);
  const audience = targetAudience(text, expandedTopic);

  return {
    relevanceScore,
    viralScore,
    recencyScore,
    localityScore,
    businessScore,
    creativeScore,
    finalScore,
    hook,
    visualStyle,
    contentAngle,
    productFit: fit,
    targetAudience: audience,
    aiSummary: followers > 0
      ? `${expandedTopic.primaryTopic} reel with viral lift of ${followerLift.toFixed(2)}x audience size and ${Math.round(engagementRate * 1000) / 10}% engagement per view.`
      : `${expandedTopic.primaryTopic} reel ranked by topic match, views, comments, likes, recency, and reusable creative signals.`,
  };
}

export function rankCreativeItems<T extends { finalScore: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.finalScore - a.finalScore);
}
