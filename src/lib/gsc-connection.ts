import { prisma } from './prisma';

// Called only after checking the real admin session. Setup stays on the server;
// no database credentials need to be exported to a developer's computer.
export async function ensureGscStorage(db = prisma) {
  try {
    await db.gscConnection.findUnique({ where: { id: 'agency' }, select: { id: true } });
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2021') throw error;
    await db.$transaction(async (tx: typeof prisma) => {
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS public.gsc_connections (
          id TEXT PRIMARY KEY DEFAULT 'agency',
          ciphertext TEXT NOT NULL,
          iv TEXT NOT NULL,
          tag TEXT NOT NULL,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await tx.$executeRaw`ALTER TABLE public.gsc_connections ENABLE ROW LEVEL SECURITY`;
    });
  }
}

export type GoogleConnectionStage = 'configuration' | 'storage_setup' | 'state' | 'exchange' | 'encryption' | 'storage';
export function connectionFailure(stage: GoogleConnectionStage, error: unknown) {
  const googleError = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  const dbCode = (error as { code?: unknown })?.code;
  if (stage === 'state') return { code: 'oauth_state_invalid', message: 'The authorization session expired or changed. Start Connect Google again in the same browser tab.' };
  if (stage === 'configuration') return { code: 'google_configuration_invalid', message: 'Check the server Google OAuth settings, AUTH_SECRET length, and token encryption key.' };
  if (stage === 'encryption') return { code: 'token_encryption_invalid', message: 'TOKEN_ENCRYPTION_KEY must decode from Base64 to exactly 32 bytes. Preserve the existing key if posting accounts use it.' };
  if (stage === 'storage_setup' || stage === 'storage') return {
    code: dbCode === 'P2021' ? 'gsc_storage_missing' : 'gsc_storage_unavailable',
    message: 'The app could not prepare or save the Google connection in PostgreSQL. Check database access and apply scripts/sql/gsc-connection.sql to the Prisma database if its role cannot create tables.',
  };
  if (googleError === 'invalid_grant') return { code: 'google_authorization_expired', message: 'Google rejected an expired or already-used authorization code. Start Connect Google again; do not reload the callback URL.' };
  if (googleError === 'invalid_client') return { code: 'google_client_invalid', message: 'Google rejected the OAuth client credentials. Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET belong to the same Web application client.' };
  if (googleError === 'redirect_uri_mismatch') return { code: 'google_redirect_mismatch', message: 'The Google Web application must allow the exact GOOGLE_REDIRECT_URI configured on the server.' };
  return { code: 'google_token_exchange_failed', message: 'Google could not provide a refresh token. Start Connect Google again and approve read-only Search Console access.' };
}
