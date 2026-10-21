import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, 'Invalid calendar date');
export const analyticsShape = {
  client: z.string().min(1).describe('Approved client slug from list_clients'),
  startDate: date,
  endDate: date,
  dimensions: z.array(z.enum(['date', 'hour', 'query', 'page', 'country', 'device', 'searchAppearance'])).max(5).default(['date']),
  dataState: z.enum(['final', 'all', 'hourly_all']).default('final'),
  type: z.enum(['web', 'image', 'video', 'news', 'discover', 'googleNews']).default('web'),
  filters: z.array(z.object({
    dimension: z.enum(['query', 'page', 'country', 'device', 'searchAppearance']),
    operator: z.enum(['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex']).default('equals'),
    expression: z.string().min(1).max(1000),
  })).max(10).default([]),
  rowLimit: z.number().int().min(1).max(25000).default(1000),
  startRow: z.number().int().min(0).max(50000).default(0),
};
export const analyticsSchema = z.object(analyticsShape).superRefine((v, ctx) => {
  if (v.startDate > v.endDate) ctx.addIssue({ code: 'custom', message: 'startDate must precede endDate' });
  if (new Set(v.dimensions).size !== v.dimensions.length) ctx.addIssue({ code: 'custom', message: 'Dimensions must be unique' });
  if (v.dimensions.includes('hour') !== (v.dataState === 'hourly_all')) ctx.addIssue({ code: 'custom', message: 'hour dimension and hourly_all must be used together' });
  if (v.dataState === 'hourly_all' && Date.parse(v.startDate) < Date.now() - 10 * 86400000) ctx.addIssue({ code: 'custom', message: 'Hourly requests must be within the last 10 days' });
});
export type AnalyticsInput = z.infer<typeof analyticsSchema>;

export function summarizeMetrics(rows: { clicks?: number | null; impressions?: number | null; position?: number | null; avg_position?: number | null }[]) {
  const clicks = rows.reduce((sum, r) => sum + Number(r.clicks || 0), 0);
  const impressions = rows.reduce((sum, r) => sum + Number(r.impressions || 0), 0);
  const weightedPosition = rows.reduce((sum, r) => sum + Number(r.position ?? r.avg_position ?? 0) * Number(r.impressions || 0), 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? weightedPosition / impressions : null };
}
