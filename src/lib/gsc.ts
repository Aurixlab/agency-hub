import { gscApi } from './gsc-service';

// Dashboard routes and MCP tools use the same Google credential provider.
export async function getSiteMetrics(propertyUrl: string, startDate: string, endDate: string) {
  const { data } = await (await gscApi()).searchanalytics.query({ siteUrl: propertyUrl, requestBody: { startDate, endDate, dimensions: ['date'], rowLimit: 25000, dataState: 'final' } }, { timeout: 15000, retry: false });
  return data.rows || [];
}
export async function getKeywordRankings(propertyUrl: string, startDate: string, endDate: string, rowLimit = 50) {
  const { data } = await (await gscApi()).searchanalytics.query({ siteUrl: propertyUrl, requestBody: { startDate, endDate, dimensions: ['query'], rowLimit } }, { timeout: 15000, retry: false });
  return data.rows || [];
}
export async function getFilteredQueries(propertyUrl: string, startDate: string, endDate: string, filterExpression: string, rowLimit = 100) {
  const { data } = await (await gscApi()).searchanalytics.query({ siteUrl: propertyUrl, requestBody: { startDate, endDate, dimensions: ['query'], rowLimit, dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'contains', expression: filterExpression }] }] } }, { timeout: 15000, retry: false });
  return data.rows || [];
}
export async function getQueryTimeSeries(propertyUrl: string, startDate: string, endDate: string, queryFilter: string) {
  const { data } = await (await gscApi()).searchanalytics.query({ siteUrl: propertyUrl, requestBody: { startDate, endDate, dimensions: ['date'], rowLimit: 25000, dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'contains', expression: queryFilter }] }] } }, { timeout: 15000, retry: false });
  return (data.rows || []).sort((a, b) => (a.keys?.[0] || '').localeCompare(b.keys?.[0] || ''));
}
