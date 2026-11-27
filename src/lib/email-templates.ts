import type { AssignmentItem, DigestData, DigestTask, MemberDigest } from './task-emails';

// HTML and plain-text builders for task emails. Table layout, inline styles only: email clients
// ignore external CSS and mangle dark themes, so the body is light and only the header band is dark.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const GOLD = '#d4952a';
const INK = '#111111';
const MUTED = '#6b7280';
const RED = '#b91c1c';
const LINE = '#e5e7eb';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape every piece of user-provided text before it goes into HTML. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ESCAPES[c]);

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const PRIORITY_LABEL: Record<string, string> = { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const priorityLabel = (p: string) => PRIORITY_LABEL[p] ?? null;

const firstName = (name: string) => oneLine(name).split(' ')[0] || 'there';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function layout(opts: { title: string; dateLabel: string; body: string; preheader: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f4;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;font-family:${FONT};color:${INK};">
<tr><td style="background:${INK};padding:20px 24px;">
<div style="font-size:20px;font-weight:700;letter-spacing:0.3px;color:${GOLD};">Mission Control</div>
<div style="font-size:13px;color:#a3a3a3;padding-top:4px;">${escapeHtml(opts.dateLabel)}</div>
</td></tr>
<tr><td style="padding:24px;">
${opts.body}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};">Sent by Mission Control · times shown in Bangladesh time</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const heading = (text: string, color = INK) =>
  `<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${color};padding:20px 0 8px;">${escapeHtml(text)}</div>`;

function link(title: string, appUrl: string, color = INK): string {
  return `<a href="${escapeHtml(appUrl)}/dashboard" style="color:${color};text-decoration:none;font-weight:600;">${escapeHtml(title)}</a>`;
}

function metaLine(parts: Array<{ text: string; color?: string }>): string {
  const html = parts
    .filter(p => p.text)
    .map(p => `<span style="color:${p.color ?? MUTED};">${escapeHtml(p.text)}</span>`)
    .join(`<span style="color:#d1d5db;"> · </span>`);
  return html ? `<div style="font-size:13px;padding-top:2px;">${html}</div>` : '';
}

function taskRow(opts: { title: string; appUrl: string; meta: string; flagged?: boolean }): string {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:15px;line-height:1.4;">${link(opts.title, opts.appUrl, opts.flagged ? RED : INK)}${opts.meta}</td></tr>`;
}

const table = (rows: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;

function button(label: string, appUrl: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td style="background:${GOLD};border-radius:6px;"><a href="${escapeHtml(appUrl)}/dashboard" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:${INK};text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

// ---------- Assignment email ----------

export function assignmentEmail(input: {
  name: string;
  items: AssignmentItem[];
  appUrl: string;
  now: Date;
}): EmailContent {
  const { items, appUrl } = input;
  const first = items[0];
  const subject =
    items.length === 1
      ? oneLine(`New task from ${first.actorName}: ${first.title}`)
      : `${items.length} new tasks assigned to you`;

  const intro =
    items.length === 1 ? 'You have a new task.' : `You have ${items.length} new tasks.`;

  const rows = items
    .map(item =>
      taskRow({
        title: item.title,
        appUrl,
        meta: metaLine([
          { text: item.projectName ?? '' },
          { text: item.dueLabel ? `Due ${item.dueLabel}` : 'No due date' },
          { text: priorityLabel(item.priority) ? `${priorityLabel(item.priority)} priority` : '' },
          { text: `Assigned by ${item.actorName}` },
        ]),
      }),
    )
    .join('');

  const body = `<div style="font-size:18px;font-weight:700;padding-bottom:4px;">Hi ${escapeHtml(firstName(input.name))},</div>
<div style="font-size:15px;color:${MUTED};padding-bottom:8px;">${escapeHtml(intro)}</div>
${table(rows)}
${button('Open Mission Control', appUrl)}`;

  const dateLabel = input.now.toLocaleDateString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const text = [
    `Hi ${firstName(input.name)},`,
    '',
    intro,
    '',
    ...items.map(item =>
      [
        `- ${oneLine(item.title)}`,
        `  ${[
          item.projectName ? oneLine(item.projectName) : '',
          item.dueLabel ? `Due ${item.dueLabel}` : 'No due date',
          priorityLabel(item.priority) ? `${priorityLabel(item.priority)} priority` : '',
          `Assigned by ${oneLine(item.actorName)}`,
        ]
          .filter(Boolean)
          .join(' · ')}`,
      ].join('\n'),
    ),
    '',
    `${appUrl}/dashboard`,
    '',
    'Sent by Mission Control · times shown in Bangladesh time',
  ].join('\n');

  return {
    subject,
    html: layout({ title: subject, dateLabel, body, preheader: intro }),
    text,
  };
}

// ---------- Daily digest ----------

function dueText(task: DigestTask): string {
  if (task.daysOverdue > 0) return `${plural(task.daysOverdue, 'day', 'days')} overdue`;
  return task.dayLabel;
}

function digestTaskRow(task: DigestTask, appUrl: string): string {
  const overdue = task.daysOverdue > 0;
  return taskRow({
    title: task.title,
    appUrl,
    flagged: overdue,
    meta: metaLine([
      { text: task.projectName ?? '' },
      { text: priorityLabel(task.priority) ? `${priorityLabel(task.priority)} priority` : '' },
      { text: dueText(task), color: overdue ? RED : MUTED },
    ]),
  });
}

function chip(label: string, value: number, color = INK): string {
  return `<td width="33%" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#f4f4f4;border-radius:6px;padding:12px 4px;"><div style="font-size:24px;font-weight:700;color:${value > 0 ? color : INK};line-height:1;">${value}</div><div style="font-size:12px;color:${MUTED};padding-top:4px;">${escapeHtml(label)}</div></td></tr></table></td>`;
}

function ownSection(member: MemberDigest, appUrl: string): string {
  if (member.counts.total === 0) return '';
  const parts: string[] = [heading('Your tasks')];
  if (member.overdue.length > 0) {
    parts.push(heading('Overdue', RED), table(member.overdue.map(t => digestTaskRow(t, appUrl)).join('')));
  }
  if (member.today.length > 0) {
    parts.push(heading('Today'), table(member.today.map(t => digestTaskRow(t, appUrl)).join('')));
  }
  for (const day of member.upcoming) {
    parts.push(heading(day.label), table(day.tasks.map(t => digestTaskRow(t, appUrl)).join('')));
  }
  return parts.join('\n');
}

const TITLE_CAP = 4;

/** Titles for the team overview: overdue first (flagged), then today, then upcoming in date order. */
function overviewTasks(member: MemberDigest): DigestTask[] {
  return [...member.overdue, ...member.today, ...member.upcoming.flatMap(d => d.tasks)];
}

function countsLine(m: MemberDigest): string {
  if (m.counts.total === 0) return 'Nothing due';
  const parts: string[] = [];
  if (m.counts.overdue > 0) parts.push(`${m.counts.overdue} overdue`);
  if (m.counts.today > 0) parts.push(`${m.counts.today} today`);
  if (m.counts.upcoming > 0) parts.push(`${m.counts.upcoming} upcoming`);
  return parts.join(', ');
}

function teamBlock(member: MemberDigest, appUrl: string): string {
  const tasks = overviewTasks(member);
  const shown = tasks.slice(0, TITLE_CAP);
  const more = tasks.length - shown.length;
  const titles = shown
    .map(t => {
      const overdue = t.daysOverdue > 0;
      return `<div style="font-size:13px;line-height:1.5;padding-top:2px;">${link(t.title, appUrl, overdue ? RED : '#374151')}${overdue ? `<span style="color:${RED};"> (overdue)</span>` : ''}</div>`;
    })
    .join('');
  const moreHtml = more > 0 ? `<div style="font-size:13px;color:${MUTED};padding-top:2px;">+${more} more</div>` : '';
  const countsColor = member.counts.overdue > 0 ? RED : MUTED;
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE};"><div style="font-size:15px;font-weight:700;">${escapeHtml(member.name)}</div><div style="font-size:13px;color:${countsColor};padding-top:2px;">${escapeHtml(countsLine(member))}</div>${titles}${moreHtml}</td></tr>`;
}

export function digestEmail(input: { digest: DigestData; member: MemberDigest; appUrl: string }): EmailContent {
  const { digest, member, appUrl } = input;
  const c = member.counts;

  const subject =
    c.total === 0
      ? `Team update for ${digest.todayShort}`
      : `Your day: ${c.overdue} overdue, ${c.today} due today, ${c.upcoming} in the next 5 days`;

  const own = ownSection(member, appUrl);
  const emptyNote =
    c.total === 0
      ? `<div style="font-size:14px;color:${MUTED};padding-top:16px;">You have nothing due in the next 5 days.</div>`
      : '';

  const body = `<div style="font-size:18px;font-weight:700;">Hi ${escapeHtml(firstName(member.name))},</div>
<div style="font-size:15px;color:${MUTED};padding:4px 0 16px;">Here is what is due for you and the team.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${chip('Overdue', c.overdue, RED)}${chip('Due today', c.today)}${chip('Next 5 days', c.upcoming)}</tr></table>
${emptyNote}
${own}
${heading('Team this week')}
${table(digest.members.map(m => teamBlock(m, appUrl)).join(''))}
${button('Open Mission Control', appUrl)}`;

  const textTask = (t: DigestTask) =>
    `- ${oneLine(t.title)}${t.projectName ? ` (${oneLine(t.projectName)})` : ''} · ${dueText(t)}`;

  const textLines: string[] = [`Hi ${firstName(member.name)},`, '', `Overdue ${c.overdue} | Due today ${c.today} | Next 5 days ${c.upcoming}`, ''];
  if (c.total === 0) {
    textLines.push('You have nothing due in the next 5 days.', '');
  } else {
    textLines.push('YOUR TASKS');
    if (member.overdue.length > 0) textLines.push('', 'Overdue', ...member.overdue.map(textTask));
    if (member.today.length > 0) textLines.push('', 'Today', ...member.today.map(textTask));
    for (const day of member.upcoming) textLines.push('', day.label, ...day.tasks.map(textTask));
    textLines.push('');
  }
  textLines.push('TEAM THIS WEEK');
  for (const m of digest.members) {
    textLines.push('', `${oneLine(m.name)}: ${countsLine(m)}`);
    const tasks = overviewTasks(m);
    for (const t of tasks.slice(0, TITLE_CAP)) {
      textLines.push(`  - ${oneLine(t.title)}${t.daysOverdue > 0 ? ' (overdue)' : ''}`);
    }
    if (tasks.length > TITLE_CAP) textLines.push(`  +${tasks.length - TITLE_CAP} more`);
  }
  textLines.push('', `${appUrl}/dashboard`, '', 'Sent by Mission Control · times shown in Bangladesh time');

  return {
    subject,
    html: layout({
      title: subject,
      dateLabel: digest.todayLabel,
      body,
      preheader: `${c.overdue} overdue, ${c.today} due today, ${c.upcoming} in the next 5 days`,
    }),
    text: textLines.join('\n'),
  };
}
