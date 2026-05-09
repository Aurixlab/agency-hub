import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/auth';

const oauth2Client = new google.auth.OAuth2(
  process.env.AUTH_GOOGLE_CLIENT_ID,
  process.env.AUTH_GOOGLE_CLIENT_SECRET,
  process.env.AUTH_GOOGLE_REDIRECT_URI
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/login?error=google_cancelled', req.url));
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const googleEmail = data.email?.toLowerCase();

    if (!googleEmail) {
      return NextResponse.redirect(new URL('/login?error=no_email', req.url));
    }

    // Match by primary email or alt email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: googleEmail },
          { altEmail: googleEmail },
        ],
        disabled: false,
      },
    });

    if (!user) {
      return NextResponse.redirect(new URL('/login?error=not_authorized', req.url));
    }

    await createSession(user.id);
    return NextResponse.redirect(new URL('/dashboard', req.url));
  } catch (err) {
    console.error('Google OAuth error:', err);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url));
  }
}
