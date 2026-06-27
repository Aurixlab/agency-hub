export type ExpandedTopic = {
  originalTopic: string;
  normalizedTopic: string;
  primaryTopic: string;
  relatedKeywords: string[];
  hashtags: string[];
  locations: string[];
  productKeywords: string[];
  audienceKeywords: string[];
  eventKeywords: string[];
  negativeKeywords: string[];
};

export type CreativeProviderName =
  | 'apify-instagram-hashtag'
  | 'meta-ad-library'
  | 'youtube'
  | 'manual';

export type RawCreativeItem = {
  source: string;
  sourceItemId: string;
  type: string;
  platform: string;
  url: string;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  caption?: string | null;
  adCopy?: string | null;
  creatorName?: string | null;
  creatorHandle?: string | null;
  country?: string | null;
  city?: string | null;
  topic: string;
  eventName?: string | null;
  publishedAt?: Date | null;
  viewCount?: bigint | number;
  likeCount?: bigint | number;
  commentCount?: bigint | number;
  shareCount?: bigint | number;
  metadata?: Record<string, unknown>;
};

export type CreativeItemDto = {
  id: string;
  source: string;
  sourceItemId: string;
  type: string;
  platform: string;
  url: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  adCopy: string | null;
  creatorName: string | null;
  creatorHandle: string | null;
  topic: string;
  eventName: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  relevanceScore: number;
  viralScore: number;
  recencyScore: number;
  localityScore: number;
  businessScore: number;
  creativeScore: number;
  finalScore: number;
  hook: string | null;
  visualStyle: string | null;
  contentAngle: string | null;
  productFit: string | null;
  targetAudience: string | null;
  aiSummary: string | null;
  createdAt: string;
};

export type CampaignIdea = {
  title: string;
  hook: string;
  products: string[];
  visualDirection: string;
  targetAudience: string;
  cta: string;
};

export type CreativeInsights = {
  topHooks: string[];
  visualPatterns: string[];
  productOpportunities: string[];
  campaignIdeas: CampaignIdea[];
  contentBuckets: {
    label: string;
    description: string;
    itemIds: string[];
  }[];
};

export type ProviderInput = {
  topic: ExpandedTopic;
  token: string;
};

export type ProviderStartResult =
  | {
      status: 'success';
      providerRunId: string;
      defaultDatasetId?: string;
      items: RawCreativeItem[];
    }
  | {
      status: 'pending';
      providerRunId: string;
      providerStatus: string;
    };

export type ProviderStatusInput = {
  providerRunId: string;
  topic: ExpandedTopic;
  token: string;
};

export type ProviderStatusResult =
  | {
      status: 'success';
      providerRunId: string;
      providerStatus: string;
      items: RawCreativeItem[];
    }
  | {
      status: 'pending';
      providerRunId: string;
      providerStatus: string;
    }
  | {
      status: 'failed';
      providerRunId: string;
      providerStatus: string;
      error: string;
    };

export interface CreativeProvider {
  name: CreativeProviderName;
  startCollection(input: ProviderInput): Promise<ProviderStartResult>;
  checkStatus(input: ProviderStatusInput): Promise<ProviderStatusResult>;
}
