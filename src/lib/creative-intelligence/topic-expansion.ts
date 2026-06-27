import type { ExpandedTopic } from './types';

const BASE_LOCATIONS = ['Calgary', 'Alberta', 'Canada'];

const BASE_PRODUCTS = [
  'custom apparel',
  'branded t-shirts',
  'embroidered hats',
  'staff uniforms',
  'promotional items',
  'event giveaways',
  'corporate merch',
  'custom hoodies',
  'branded jackets',
  'custom tote bags',
];

const BASE_AUDIENCES = [
  'Calgary businesses',
  'local business owners',
  'event organizers',
  'HR teams',
  'marketing teams',
  'sales teams',
  'employee engagement teams',
];

type TopicPreset = {
  match: string[];
  primaryTopic: string;
  relatedKeywords: string[];
  hashtags: string[];
  productKeywords: string[];
  audienceKeywords: string[];
  eventKeywords: string[];
  negativeKeywords?: string[];
};

const PRESETS: TopicPreset[] = [
  {
    match: ['non profit custom apparel', 'nonprofit custom apparel', 'non profit apparel', 'nonprofit apparel', 'charity apparel', 'fundraising shirts'],
    primaryTopic: 'Nonprofit Custom Apparel',
    relatedKeywords: [
      'nonprofit shirts',
      'charity t-shirts',
      'fundraising shirts',
      'volunteer shirts',
      'awareness campaign apparel',
      'team shirts for nonprofits',
      'event shirts',
    ],
    hashtags: [
      'nonprofit',
      'nonprofitorganization',
      'nonprofitmarketing',
      'fundraising',
      'fundraiser',
      'charityevent',
      'volunteer',
      'customshirts',
      'customtshirts',
      'teamshirts',
      'eventshirts',
      'awarenessshirts',
    ],
    productKeywords: ['custom t-shirts', 'volunteer shirts', 'event shirts', 'fundraising shirts', 'awareness shirts'],
    audienceKeywords: ['nonprofits', 'charities', 'fundraising teams', 'volunteer coordinators', 'community organizers'],
    eventKeywords: ['fundraiser', 'charity event', 'awareness campaign', 'volunteer event', 'community event'],
  },
  {
    match: ['stampede', 'calgary stampede'],
    primaryTopic: 'Calgary Stampede',
    relatedKeywords: [
      'Calgary Stampede',
      'stampede 2026',
      'Calgary rodeo',
      'western event',
      'stampede breakfast',
      'stampede party',
      'stampede parade',
      'country concert Calgary',
      'rodeo style',
      'western wear Calgary',
    ],
    hashtags: [
      'calgarystampede',
      'stampede2026',
      'yycevents',
      'calgaryevents',
      'yycbusiness',
      'westernwear',
      'stampedefashion',
      'rodeostyle',
      'corporateevents',
    ],
    productKeywords: [
      'custom cowboy hats',
      'embroidered hats',
      'branded shirts',
      'western shirts',
      'custom bandanas',
      'event t-shirts',
      'staff uniforms',
      'branded giveaways',
    ],
    audienceKeywords: [
      'corporate Stampede event',
      'company Stampede party',
      'staff Stampede outfit',
      'Stampede breakfast sponsor',
      'Calgary client event',
    ],
    eventKeywords: ['Stampede breakfast', 'Stampede party', 'rodeo', 'parade', 'festival', 'local event'],
    negativeKeywords: ['animal stampede unrelated', 'sports team unrelated', 'game stampede unrelated'],
  },
  {
    match: ['golf', 'golf event', 'golf tournament', 'golfcanada', 'canadagolf'],
    primaryTopic: 'Canadian Golf Events',
    relatedKeywords: [
      'golf tournament',
      'corporate golf event',
      'charity golf tournament',
      'Calgary golf',
      'golf giveaway',
      'golf team apparel',
      'golf sponsor gifts',
    ],
    hashtags: ['golfcanada', 'canadagolf', 'calgarygolf', 'yycgolf', 'golftournament', 'corporategolf', 'golfgiveaway'],
    productKeywords: ['embroidered golf polos', 'branded golf towels', 'custom hats', 'golf giveaways', 'sponsor merch'],
    audienceKeywords: ['corporate golf organizers', 'sponsors', 'sales teams', 'charity event teams'],
    eventKeywords: ['golf tournament', 'sponsor event', 'team outing', 'charity event'],
  },
  {
    match: ['canada day', 'canadaday'],
    primaryTopic: 'Canada Day Campaigns',
    relatedKeywords: ['Canada Day events', 'red and white outfits', 'July 1 celebration', 'Canada Day giveaway'],
    hashtags: ['canadaday', 'canadaday2026', 'canadadayevents', 'yycevents', 'calgaryevents', 'canadianbusiness'],
    productKeywords: ['red shirts', 'branded hats', 'flags', 'event giveaways', 'custom t-shirts'],
    audienceKeywords: ['local businesses', 'community events', 'festival vendors', 'staff teams'],
    eventKeywords: ['Canada Day event', 'community festival', 'July 1 campaign'],
  },
  {
    match: ['trade show', 'tradeshows', 'trade shows', 'expo'],
    primaryTopic: 'Trade Show Marketing',
    relatedKeywords: ['trade show booth', 'expo booth', 'conference giveaway', 'booth staff uniforms'],
    hashtags: ['tradeshow', 'exhibitor', 'eventmarketing', 'boothdesign', 'corporateevents', 'promotionalproducts'],
    productKeywords: ['lanyards', 'table covers', 'branded polos', 'giveaway items', 'tote bags', 'pens'],
    audienceKeywords: ['exhibitors', 'sales teams', 'B2B marketers', 'conference organizers'],
    eventKeywords: ['trade show', 'expo', 'conference', 'booth activation'],
  },
  {
    match: ['corporate event', 'corporate events', 'company event'],
    primaryTopic: 'Corporate Events',
    relatedKeywords: ['company event', 'corporate party', 'client appreciation event', 'team event'],
    hashtags: ['corporateevents', 'companyevent', 'eventmarketing', 'yycbusiness', 'brandedmerch'],
    productKeywords: ['staff shirts', 'embroidered hats', 'corporate gifts', 'event signage', 'branded drinkware'],
    audienceKeywords: ['HR teams', 'marketing teams', 'office managers', 'business owners'],
    eventKeywords: ['company party', 'client event', 'employee event', 'team celebration'],
  },
  {
    match: ['back to school', 'backtoschool'],
    primaryTopic: 'Back to School Campaigns',
    relatedKeywords: ['school spirit wear', 'student giveaways', 'campus merch', 'orientation week'],
    hashtags: ['backtoschool', 'schoolspirit', 'campuslife', 'studentgiveaway'],
    productKeywords: ['school hoodies', 'tote bags', 'water bottles', 'orientation shirts', 'staff shirts'],
    audienceKeywords: ['schools', 'student unions', 'campus teams', 'parent councils'],
    eventKeywords: ['orientation', 'school launch', 'student event'],
  },
  {
    match: ['winter apparel', 'winter', 'holiday gifting', 'holiday gifts', 'christmas gifts'],
    primaryTopic: 'Winter and Holiday Gifting',
    relatedKeywords: ['holiday corporate gifts', 'winter staff apparel', 'employee gifts', 'client gifts'],
    hashtags: ['corporategifts', 'holidaygifts', 'winterapparel', 'employeeappreciation', 'brandedgifts'],
    productKeywords: ['embroidered jackets', 'toques', 'hoodies', 'gift boxes', 'drinkware', 'blankets'],
    audienceKeywords: ['HR teams', 'client success teams', 'business owners', 'office managers'],
    eventKeywords: ['holiday party', 'year end gifting', 'winter campaign'],
  },
  {
    match: ['staff uniforms', 'uniforms'],
    primaryTopic: 'Staff Uniforms',
    relatedKeywords: ['team uniforms', 'branded staff apparel', 'front desk uniforms', 'restaurant uniforms'],
    hashtags: ['staffuniforms', 'teamapparel', 'customapparel', 'workwear', 'brandedapparel'],
    productKeywords: ['embroidered polos', 'aprons', 'jackets', 'name badges', 'staff shirts'],
    audienceKeywords: ['restaurants', 'clinics', 'retail teams', 'service businesses'],
    eventKeywords: ['new staff launch', 'brand refresh', 'team onboarding'],
  },
  {
    match: ['company picnic', 'employee appreciation', 'team event'],
    primaryTopic: 'Employee Appreciation Events',
    relatedKeywords: ['company picnic', 'employee appreciation day', 'team building event', 'staff giveaway'],
    hashtags: ['employeeappreciation', 'companypicnic', 'teambuilding', 'staffgifts', 'corporateevents'],
    productKeywords: ['team t-shirts', 'picnic blankets', 'water bottles', 'caps', 'giveaway bags'],
    audienceKeywords: ['HR teams', 'culture teams', 'business owners', 'department managers'],
    eventKeywords: ['company picnic', 'team building', 'employee appreciation event'],
  },
  {
    match: ['calgary events', 'local calgary events', 'yyc events', 'local events'],
    primaryTopic: 'Local Calgary Events',
    relatedKeywords: ['Calgary events', 'YYC events', 'local festival', 'community event', 'Calgary business event'],
    hashtags: ['yycevents', 'calgaryevents', 'yycbusiness', 'calgarysmallbusiness', 'eventmarketing'],
    productKeywords: ['event t-shirts', 'volunteer shirts', 'branded tents', 'giveaways', 'custom hats'],
    audienceKeywords: ['Calgary businesses', 'festival organizers', 'community groups', 'local sponsors'],
    eventKeywords: ['festival', 'community event', 'business event', 'sponsor activation'],
  },
];

function normalizeTopic(input: string): string {
  return input.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
}

function toHashtag(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^#+/, '')
    .replace(/[^a-zA-Z0-9_]+/g, '')
    .toLowerCase();
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function findPreset(normalizedTopic: string): TopicPreset | undefined {
  return PRESETS.find((preset) => preset.match.some((term) => normalizedTopic.includes(term)));
}

function genericHashtagsFor(normalizedTopic: string): string[] {
  const words = normalizedTopic.split(/\s+/).map(toHashtag).filter((word) => word.length > 2);
  const base = toHashtag(normalizedTopic);
  const hashtags = [base];

  hashtags.push(...words);
  if (words.length >= 2) {
    for (let i = 0; i < words.length - 1; i += 1) hashtags.push(`${words[i]}${words[i + 1]}`);
  }

  if (words.includes('custom') && words.includes('apparel')) {
    hashtags.push('customapparel', 'customshirts', 'customtshirts', 'brandedapparel');
  }
  if (words.includes('non') || words.includes('nonprofit') || words.includes('profit')) {
    hashtags.push('nonprofit', 'nonprofitorganization', 'fundraising', 'charityevent');
  }

  hashtags.push(`${base}canada`, `calgary${base}`);
  return uniq(hashtags).slice(0, 12);
}

export function expandTopic(rawTopic: string): ExpandedTopic {
  const originalTopic = rawTopic.trim();
  const normalizedTopic = normalizeTopic(originalTopic);
  const preset = findPreset(normalizedTopic);
  const primaryTopic = preset?.primaryTopic ?? originalTopic;
  const genericHashtags = genericHashtagsFor(normalizedTopic);

  return {
    originalTopic,
    normalizedTopic,
    primaryTopic,
    relatedKeywords: uniq([
      primaryTopic,
      normalizedTopic,
      ...(preset?.relatedKeywords ?? []),
      `${primaryTopic} ideas`,
      `${primaryTopic} campaign`,
    ]),
    hashtags: uniq([...(preset?.hashtags ?? []), ...genericHashtags]).slice(0, 12),
    locations: BASE_LOCATIONS,
    productKeywords: uniq([...(preset?.productKeywords ?? []), ...BASE_PRODUCTS]),
    audienceKeywords: uniq([...(preset?.audienceKeywords ?? []), ...BASE_AUDIENCES]),
    eventKeywords: uniq([...(preset?.eventKeywords ?? []), primaryTopic]),
    negativeKeywords: uniq(preset?.negativeKeywords ?? ['unrelated sports team', 'unrelated video game', 'unrelated news']),
  };
}
