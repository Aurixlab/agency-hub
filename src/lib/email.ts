// Minimal Resend client over plain fetch. Never throws: callers decide what to do with a failed send.

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** `error` is for server logs only (it may quote an address). `status` is Resend's HTTP status, when it answered. */
export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string; status?: number };

const RESEND_URL = 'https://api.resend.com/emails';

/** Resend allows 2 requests per second, so batch senders wait this long between messages. */
export const SEND_GAP_MS = 600;

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** `noreply@aurixlab.com` becomes `Mission Control <noreply@aurixlab.com>`; a value that already has a name is kept. */
export function fromAddress(): string | null {
  const raw = process.env.EMAIL_FROM?.trim();
  if (!raw) return null;
  return raw.includes('<') ? raw : `Mission Control <${raw}>`;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not set' };
  if (!from) return { ok: false, error: 'EMAIL_FROM is not set' };

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      // Resend error bodies describe the problem and never echo the API key.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      return { ok: false, status: res.status, error: `Resend responded ${res.status}${detail ? `: ${detail}` : ''}` };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Email request failed' };
  }
}
