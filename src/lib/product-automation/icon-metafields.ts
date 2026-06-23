export const REUSABLE_ICON_GROUPS = [
  {
    key: 'accordion1_icons',
    urls: [
      'https://cdn.shopify.com/s/files/1/0777/5879/files/Group.png?v=1760213337',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/Group_69.png?v=1760213338',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/Group_70.png?v=1760213338',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/arrows_x2C__Collapse_x2C__reduce.png?v=1760213338',
    ],
  },
  {
    key: 'accordion2_icons',
    urls: [
      'https://cdn.shopify.com/s/files/1/0777/5879/files/icon-material.png?v=1760034685',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/icon-fit.png?v=1760034684',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/icon-feature.png?v=1760034684',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/icon-formal.png?v=1760034685',
    ],
  },
  {
    key: 'accordion3_icons',
    urls: [
      'https://cdn.shopify.com/s/files/1/0777/5879/files/Material_icon_88a4229e-6f7d-48fe-bcbd-cc3524b11d18.svg?v=1760472976',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/care_icon_866bd99a-2fc4-4fd5-a806-cb4f17179186.svg?v=1760472976',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/note_icon_f412f9cc-e834-40af-846b-17bdb4888fd0.svg?v=1760472976',
    ],
  },
  {
    key: 'accordion4_icons',
    urls: [
      'https://cdn.shopify.com/s/files/1/0777/5879/files/classic_fit.svg?v=1760473194',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/smooth_fabric.svg?v=1760473194',
      'https://cdn.shopify.com/s/files/1/0777/5879/files/tear_away_icon_02dc5677-c55f-4f83-adca-f742b53460f2.svg?v=1760473193',
    ],
  },
] as const;

export const filenameFromShopifyCdnUrl = (url: string) =>
  decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
