import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET() {
  const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Critical for getting a refresh token
    prompt: 'consent',
    scope: scopes,
  });

  return NextResponse.redirect(url);
}
