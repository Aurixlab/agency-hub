import { DIGEST_DAYS, dhakaToday, type AssignmentItem, type DigestData, type DigestTask, type MemberDigest } from './task-emails';

// HTML and plain-text builders for task emails. Dark theme, fluid up to 960px, table layout with
// inline styles and `bgcolor` fallbacks. The one embedded media query stacks columns on phones; the
// layout stays readable in clients that ignore it. Keep markup compact: Gmail clips at about 102 KB.
//
// task-emails.ts imports this module too, so only use its exports inside functions.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const PAGE = '#0b0b0c';
const SURFACE = '#121214';
const CARD = '#1a1a1e';
const LINE = '#2a2a30';
const INK = '#f4f4f5';
const MUTED = '#a1a1aa';
const GOLD = '#d4952a';
const DARK = '#111111';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const WRAP = 'word-wrap:break-word;overflow-wrap:anywhere;';

interface Tone {
  bg: string;
  border: string;
  text: string;
  solid: string;
  onSolid: string;
}

type Urgency = 'overdue' | 'today' | 'soon' | 'neutral';

const TONES: Record<Urgency, Tone> = {
  overdue: { bg: '#3a1517', border: '#b4313a', text: '#ff9a9f', solid: '#b91c1c', onSolid: '#ffffff' },
  today: { bg: '#3a2a0c', border: '#c98a1b', text: '#ffd27a', solid: GOLD, onSolid: DARK },
  soon: { bg: '#10263f', border: '#2f6fb8', text: '#9cc8ff', solid: '#2563eb', onSolid: '#ffffff' },
  neutral: { bg: CARD, border: LINE, text: MUTED, solid: LINE, onSolid: INK },
};
const CLEAR = { bg: '#14271c', border: '#2f7d4f', text: '#8fe0ae' };

const PRIORITY: Record<string, { label: string; bg: string; fg: string }> = {
  URGENT: { label: 'Urgent', bg: '#dc2626', fg: '#ffffff' },
  HIGH: { label: 'High', bg: '#c2410c', fg: '#ffffff' },
  MEDIUM: { label: 'Medium', bg: '#facc15', fg: DARK },
  LOW: { label: 'Low', bg: '#475569', fg: '#ffffff' },
};
const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape every piece of user-provided text before it goes into HTML. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ESCAPES[c]);

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const priorityLabel = (p: string) => PRIORITY[p]?.label ?? null;

const firstName = (name: string) => oneLine(name).split(' ')[0] || 'there';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------- Building blocks ----------

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/** Background as both attribute and inline style, for clients that drop one of them. */
const fill = (bg: string) => `bgcolor="${bg}" style="background-color:${bg};`;

const space = (px: number) => `<div style="height:${px}px;line-height:${px}px;font-size:${px}px;">&nbsp;</div>`;

/** A full-width one-cell box with a tinted or solid fill. */
function box(bg: string, border: string, style: string, content: string): string {
  return `<table ${TABLE} width="100%"><tr><td ${fill(bg)}border:1px solid ${border};border-radius:6px;${style}">${content}</td></tr></table>`;
}

const pill = (label: string, bg: string, fg: string) =>
  `<span style="display:inline-block;background-color:${bg};color:${fg};font-size:12px;font-weight:700;line-height:18px;padding:0 8px;border-radius:9px;margin:0 6px 4px 0;white-space:nowrap;">${escapeHtml(label)}</span>`;

const priorityPill = (p: string) => (PRIORITY[p] ? pill(PRIORITY[p].label, PRIORITY[p].bg, PRIORITY[p].fg) : '');

function link(title: string, appUrl: string, size: number): string {
  return `<a href="${escapeHtml(appUrl)}/dashboard" style="color:${INK};text-decoration:none;font-weight:700;font-size:${size}px;line-height:1.35;${WRAP}">${escapeHtml(title)}</a>`;
}

const mutedLine = (text: string, size = 13) =>
  `<div style="font-size:${size}px;color:${MUTED};padding-top:3px;${WRAP}">${escapeHtml(text)}</div>`;

const heading = (text: string) =>
  `<div style="font-size:20px;font-weight:700;color:${INK};padding:28px 0 12px;">${escapeHtml(text)}</div>`;

interface Column {
  tone: { bg: string; border: string };
  padding: number;
  html: string;
}

/** Equal-width cards, `perRow` to a row. Cells of a row share its height; short rows are padded. */
function grid(cards: Column[], perRow: number): string {
  const width = perRow === 1 ? '100%' : `${Math.floor(100 / perRow) - 1}%`;
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += perRow) {
    const cells: string[] = [];
    for (let j = 0; j < perRow; j++) {
      const card = cards[i + j];
      if (j > 0) cells.push(`<td class="gap${card ? '' : ' filler'}" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>`);
      cells.push(
        card
          ? `<td class="col" width="${width}" valign="top" ${fill(card.tone.bg)}border:1px solid ${card.tone.border};border-radius:8px;padding:${card.padding}px;vertical-align:top;">${card.html}</td>`
          : // Same box as a card, so a short row keeps the column widths of a full one.
            `<td class="col filler" width="${width}" style="border:1px solid ${SURFACE};padding:${cards[0].padding}px;">&nbsp;</td>`,
      );
    }
    rows.push(`<table class="grid" ${TABLE} width="100%" style="width:100%;table-layout:fixed;"><tr>${cells.join('')}</tr></table>`);
  }
  return rows.join(space(12));
}

function button(label: string, appUrl: string): string {
  return `<table ${TABLE} style="margin-top:28px;"><tr><td ${fill(GOLD)}border-radius:6px;"><a href="${escapeHtml(appUrl)}/dashboard" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:${DARK};text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

const STYLE = `:root{color-scheme:dark;supported-color-schemes:dark;}
@media only screen and (max-width:640px){
.pad{padding-left:12px!important;padding-right:12px!important;}
.grid,.grid>tbody,.grid>tbody>tr{display:block!important;width:100%!important;}
.col{display:block!important;width:100%!important;box-sizing:border-box!important;}
.gap{display:block!important;width:100%!important;height:12px!important;}
.filler{display:none!important;}
}`;

function layout(opts: {
  title: string;
  dateLabel: string;
  headline: string;
  subline: string;
  body: string;
  preheader: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(opts.title)}</title>
<style>${STYLE}</style></head>
<body ${fill(PAGE)}margin:0;padding:0;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};">${escapeHtml(opts.preheader)}</div>
<table ${TABLE} width="100%" ${fill(PAGE)}width:100%;"><tr><td align="center" ${fill(PAGE)}padding:16px 0;">
<!--[if mso]><table role="presentation" width="960" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table ${TABLE} width="100%" ${fill(SURFACE)}width:100%;max-width:960px;margin:0 auto;text-align:left;font-family:${FONT};color:${INK};">
<tr><td class="pad" align="left" ${fill(CARD)}border-bottom:1px solid ${LINE};padding:24px;">
<div style="font-size:24px;font-weight:700;color:${GOLD};">Mission Control</div>
<div style="font-size:14px;color:${MUTED};padding-top:4px;">${escapeHtml(opts.dateLabel)}</div>
<div style="font-size:22px;font-weight:700;color:${INK};padding-top:18px;${WRAP}">${escapeHtml(opts.headline)}</div>
<div style="font-size:15px;color:${MUTED};padding-top:4px;">${escapeHtml(opts.subline)}</div>
</td></tr>
<tr><td class="pad" align="left" ${fill(SURFACE)}padding:20px 24px 28px;">
${opts.body}
</td></tr>
<tr><td class="pad" align="left" ${fill(SURFACE)}border-top:1px solid ${LINE};padding:16px 24px;font-size:12px;color:${MUTED};">Sent by Mission Control · times shown in Bangladesh time</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

// ---------- Assignment email ----------

function urgencyOf(dueDay: number | null, todayDay: number): Urgency {
  if (dueDay === null || dueDay > todayDay + DIGEST_DAYS) return 'neutral';
  if (dueDay < todayDay) return 'overdue';
  return dueDay === todayDay ? 'today' : 'soon';
}

/** Most urgent first: overdue, today, then by date, with undated tasks last. */
function byUrgency(a: AssignmentItem, b: AssignmentItem): number {
  const rank = (p: string) => {
    const i = PRIORITY_ORDER.indexOf(p);
    return i === -1 ? PRIORITY_ORDER.length : i;
  };
  const day = (i: AssignmentItem) => i.dueDay ?? Number.MAX_SAFE_INTEGER;
  return day(a) - day(b) || rank(a.priority) - rank(b.priority) || a.title.localeCompare(b.title);
}

function assignmentCard(item: AssignmentItem, todayDay: number, appUrl: string): Column {
  const urgency = urgencyOf(item.dueDay, todayDay);
  const tone = TONES[urgency];
  let due = item.dueLabel ? `Due ${item.dueLabel}` : 'No due date';
  if (item.dueDay !== null && urgency === 'overdue') {
    due = `${plural(todayDay - item.dueDay, 'day', 'days')} overdue · ${due}`;
  } else if (urgency === 'today') {
    due = 'Due today';
  }
  return {
    tone,
    padding: 16,
    html: `<div style="padding-bottom:10px;">${box(tone.solid, tone.solid, `padding:6px 10px;font-size:13px;font-weight:700;color:${tone.onSolid};`, escapeHtml(due))}</div>
<div>${link(item.title, appUrl, 17)}</div>
${item.projectName ? mutedLine(item.projectName, 14) : ''}
<div style="padding-top:10px;">${priorityPill(item.priority)}</div>
<div style="font-size:13px;color:${INK};padding-top:4px;${WRAP}">${escapeHtml(`Assigned by ${item.actorName}`)}</div>`,
  };
}

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

  const todayDay = dhakaToday(input.now);
  const cards = [...items].sort(byUrgency).map(item => assignmentCard(item, todayDay, appUrl));
  const body = `${grid(cards, Math.min(2, cards.length))}
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
    html: layout({
      title: subject,
      dateLabel,
      headline: `${plural(items.length, 'new task', 'new tasks')} assigned to you`,
      subline: `Hi ${firstName(input.name)}, ${items.length === 1 ? 'here are the details.' : 'the most urgent are listed first.'}`,
      body,
      preheader: intro,
    }),
    text,
  };
}

// ---------- Daily digest ----------

function dueText(task: DigestTask): string {
  if (task.daysOverdue > 0) return `${plural(task.daysOverdue, 'day', 'days')} overdue`;
  return task.dayLabel;
}

function statBox(label: string, value: number, urgency: Urgency): string {
  // A zero is drawn neutral so that only real work is coloured.
  const tone = TONES[value > 0 ? urgency : 'neutral'];
  const color = value > 0 ? tone.onSolid : MUTED;
  return `<td width="32%" align="center" valign="top" ${fill(tone.solid === LINE ? CARD : tone.solid)}border:1px solid ${tone.solid};border-radius:8px;padding:18px 6px;text-align:center;"><div style="font-size:48px;font-weight:800;line-height:1;color:${color};">${value}</div><div style="font-size:14px;font-weight:700;padding-top:6px;color:${color};">${escapeHtml(label)}</div></td>`;
}

function statRow(c: MemberDigest['counts']): string {
  const gap = '<td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>';
  return `<table ${TABLE} width="100%" style="width:100%;table-layout:fixed;"><tr>${[
    statBox('Overdue', c.overdue, 'overdue'),
    statBox('Due today', c.today, 'today'),
    statBox('Next 5 days', c.upcoming, 'soon'),
  ].join(gap)}</tr></table>`;
}

/** Cards shown per column of "Your tasks" before pointing to the app. */
const OWN_CAP = 8;

function ownColumn(opts: {
  urgency: Urgency;
  title: string;
  empty: string;
  tasks: DigestTask[];
  due: (task: DigestTask) => string;
  appUrl: string;
}): Column {
  const tone = TONES[opts.urgency];
  const header = box(
    tone.solid,
    tone.solid,
    `padding:9px 12px;font-size:15px;font-weight:700;color:${tone.onSolid};`,
    escapeHtml(`${opts.title} (${opts.tasks.length})`),
  );
  const cards = opts.tasks.slice(0, OWN_CAP).map(task =>
    box(
      SURFACE,
      tone.border,
      'padding:10px 8px;',
      `<div>${link(task.title, opts.appUrl, 15)}</div>${task.projectName ? mutedLine(task.projectName) : ''}<div style="padding-top:8px;">${priorityPill(task.priority)}<span style="display:inline-block;font-size:13px;font-weight:700;line-height:18px;color:${tone.text};">${escapeHtml(opts.due(task))}</span></div>`,
    ),
  );
  const more = opts.tasks.length - cards.length;
  if (more > 0) {
    cards.push(
      `<div style="font-size:13px;font-weight:700;padding:2px 4px;"><a href="${escapeHtml(opts.appUrl)}/dashboard" style="color:${tone.text};text-decoration:none;">+${more} more in Mission Control</a></div>`,
    );
  }
  if (cards.length === 0) {
    cards.push(`<div style="font-size:14px;color:${MUTED};padding:6px 4px;">${escapeHtml(opts.empty)}</div>`);
  }
  return { tone, padding: 6, html: [header, ...cards].join(space(8)) };
}

function ownSection(member: MemberDigest, appUrl: string): string {
  if (member.counts.total === 0) return '';
  const columns = [
    ownColumn({
      urgency: 'overdue', title: 'Overdue', empty: 'Nothing overdue',
      tasks: member.overdue, due: dueText, appUrl,
    }),
    ownColumn({
      urgency: 'today', title: 'Today', empty: 'Nothing today',
      tasks: member.today, due: () => 'Due today', appUrl,
    }),
    ownColumn({
      urgency: 'soon', title: 'Next 5 days', empty: 'Nothing upcoming',
      tasks: member.upcoming.flatMap(d => d.tasks), due: task => task.dayLabel, appUrl,
    }),
  ];
  return `${statRow(member.counts)}
${heading('Your tasks')}
${grid(columns, 3)}`;
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

function memberCard(member: MemberDigest, todayDay: number, appUrl: string): Column {
  const c = member.counts;
  const counts = (
    [
      [c.overdue, 'overdue', 'overdue'],
      [c.today, 'today', 'today'],
      [c.upcoming, 'upcoming', 'soon'],
    ] as Array<[number, string, Urgency]>
  )
    .filter(([n]) => n > 0)
    .map(([n, label, urgency]) => pill(`${n} ${label}`, TONES[urgency].solid, TONES[urgency].onSolid))
    .join('');

  const tasks = overviewTasks(member);
  const chips = tasks.slice(0, TITLE_CAP).map(task => {
    const urgency = urgencyOf(task.day, todayDay);
    const tone = TONES[urgency];
    const label =
      urgency === 'overdue' ? `${task.daysOverdue}d overdue` : urgency === 'today' ? 'Today' : task.dayLabel;
    return box(
      tone.bg,
      tone.border,
      'padding:7px 8px;',
      `<div>${link(task.title, appUrl, 13)}</div><div style="font-size:12px;font-weight:700;color:${tone.text};padding-top:2px;">${escapeHtml(label)}</div>`,
    );
  });
  const more = tasks.length - chips.length;
  if (more > 0) chips.push(`<div style="font-size:13px;color:${MUTED};padding-left:2px;">+${more} more</div>`);

  return {
    tone: TONES.neutral,
    padding: 8,
    html: `<div style="font-size:16px;font-weight:700;color:${INK};padding-bottom:8px;${WRAP}">${escapeHtml(member.name)}</div><div style="padding-bottom:4px;">${counts}</div>${chips.join(space(6))}`,
  };
}

/** Members with work as cards (most overdue first), everyone else named together in one strip. */
function teamSection(digest: DigestData, appUrl: string): string {
  const busy = digest.members
    .filter(m => m.counts.total > 0)
    .sort(
      (a, b) =>
        b.counts.overdue - a.counts.overdue ||
        b.counts.today - a.counts.today ||
        b.counts.upcoming - a.counts.upcoming ||
        a.name.localeCompare(b.name),
    );
  const clear = digest.members.filter(m => m.counts.total === 0);

  const parts: string[] = [];
  if (busy.length > 0) {
    parts.push(grid(busy.map(m => memberCard(m, digest.todayDay, appUrl)), Math.min(3, busy.length)));
  }
  if (clear.length > 0) {
    parts.push(
      box(
        CLEAR.bg,
        CLEAR.border,
        `padding:12px 14px;font-size:15px;line-height:1.5;color:${CLEAR.text};${WRAP}`,
        `<strong>All clear:</strong> ${escapeHtml(clear.map(m => m.name).join(', '))}`,
      ),
    );
  }
  return parts.join(space(12));
}

export function digestEmail(input: { digest: DigestData; member: MemberDigest; appUrl: string }): EmailContent {
  const { digest, member, appUrl } = input;
  const c = member.counts;

  const subject =
    c.total === 0
      ? `Team update for ${digest.todayShort}`
      : `Your day: ${c.overdue} overdue, ${c.today} due today, ${c.upcoming} in the next 5 days`;

  const body = `${ownSection(member, appUrl)}
${heading('Team this week')}
${teamSection(digest, appUrl)}
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
      headline: `Hi ${firstName(member.name)},`,
      subline:
        c.total === 0
          ? 'You have nothing due in the next 5 days. Here is the team.'
          : 'Here is what is due for you and the team.',
      body,
      preheader: `${c.overdue} overdue, ${c.today} due today, ${c.upcoming} in the next 5 days`,
    }),
    text: textLines.join('\n'),
  };
}
