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
