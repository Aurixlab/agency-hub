import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDigestEmail(to: string, subject: string, body: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 24px; }
    .card { background: #fff; border-radius: 8px; max-width: 600px; margin: 0 auto; padding: 32px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    h2 { color: #1a1a2e; margin-top: 0; }
    p { color: #444; line-height: 1.7; margin: 0 0 16px; }
    .footer { margin-top: 24px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${subject}</h2>
    ${body
      .split('\n\n')
      .filter(Boolean)
      .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
      .join('')}
    <div class="footer">Agency Hub &mdash; Activity Digest</div>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    html,
  });
}
