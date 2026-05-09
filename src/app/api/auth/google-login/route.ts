import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const oauth2Client = new google.auth.OAuth2(
  process.env.AUTH_GOOGLE_CLIENT_ID,
  process.env.AUTH_GOOGLE_CLIENT_SECRET,
  process.env.AUTH_GOOGLE_REDIRECT_URI
);

export async function GET() {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });

  return NextResponse.redirect(url);
}
