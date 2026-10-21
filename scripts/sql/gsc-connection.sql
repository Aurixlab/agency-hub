-- Run once in the existing PostgreSQL/Supabase SQL editor before connecting Google.
CREATE TABLE IF NOT EXISTS public.gsc_connections (
  id TEXT PRIMARY KEY DEFAULT 'agency',
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.gsc_connections ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies. Prisma uses the existing trusted database role.
