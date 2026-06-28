import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const searchConsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

/**
 * Fetches aggregated site metrics for a specific property and date range
 */
export async function getSiteMetrics(propertyUrl: string, startDate: string, endDate: string) {
  try {
    const res = await searchConsole.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 90,
      },
    });
    return res.data.rows || [];
  } catch (error) {
    console.error(`Error fetching site metrics for ${propertyUrl}:`, error);
    throw error;
  }
}

/**
 * Fetches top keywords with position and click data
 */
export async function getKeywordRankings(
  propertyUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 50
) {
  try {
    const res = await searchConsole.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        // Optional: filter by country if needed
        /*
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'country',
            operator: 'equals',
            expression: 'can' // Canada
          }]
        }],
        */
        rowLimit,
      },
    });

    const rows = res.data.rows || [];

    // Sort by clicks descending (since orderBy is not supported in current types)
    return rows.sort((a, b) => (Number(b.clicks) || 0) - (Number(a.clicks) || 0));
  } catch (error) {
    console.error(`Error fetching keyword rankings for ${propertyUrl}:`, error);
    throw error;
  }
}

/**
 * Fetches queries matching a keyword filter with full metrics
 */
export async function getFilteredQueries(
  propertyUrl: string,
  startDate: string,
  endDate: string,
  filterExpression: string,
  rowLimit = 100
) {
  try {
    const res = await searchConsole.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'query',
            operator: 'contains',
            expression: filterExpression,
          }],
        }],
        rowLimit,
      },
    });
    const rows = res.data.rows || [];
    return rows.sort((a, b) => (Number(b.clicks) || 0) - (Number(a.clicks) || 0));
  } catch (error) {
    console.error(`Error fetching filtered queries for ${propertyUrl}:`, error);
    throw error;
  }
}

/**
 * Fetches daily time series for a specific query filter (for compare chart)
 */
export async function getQueryTimeSeries(
  propertyUrl: string,
  startDate: string,
  endDate: string,
  queryFilter: string
) {
  try {
    const res = await searchConsole.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['date'],
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'query',
            operator: 'contains',
            expression: queryFilter,
          }],
        }],
        rowLimit: 90,
      },
    });
    const rows = res.data.rows || [];
    return rows.sort((a: any, b: any) => a.keys[0].localeCompare(b.keys[0]));
  } catch (error) {
    console.error(`Error fetching query time series for ${propertyUrl}:`, error);
    throw error;
  }
}

/**
 * Fetches indexing status (indexed vs total) from Sitemaps API
 */
export async function getIndexingStatus(propertyUrl: string) {
  try {
    const res = await searchConsole.sitemaps.list({
      siteUrl: propertyUrl,
    });
    
    const sitemaps = res.data.sitemap || [];
    let indexedPages = 0;
    
    for (const sitemap of sitemaps) {
      // Sum up indexed pages from all sitemaps
      // Note: contents[0].indexed is a common pattern in the API response
      const contents = sitemap.contents || [];
      for (const content of contents) {
        indexedPages += Number(content.indexed) || 0;
      }
    }

    // Since we don't have a direct "not indexed" total from GSC API, 
    // we use the impressions as a proxy for "discovered" pages or 
    // just return the indexed count and let the sync job handle the 'not indexed' logic
    return {
      indexed: indexedPages,
      // For the sake of the dashboard, we'll estimate not_indexed as a small % or based on sitemap submitted count
      submitted: sitemaps.reduce((acc, s) => acc + Number(s.contents?.[0]?.submitted || 0), 0)
    };
  } catch (error) {
    console.error(`Error fetching indexing status for ${propertyUrl}:`, error);
    return { indexed: 0, submitted: 0 };
  }
}
