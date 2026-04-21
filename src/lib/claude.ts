import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface TaskSummaryInput {
  taskTitle: string;
  projectName: string;
  activities: Array<{
    actor: string;
    action: string;
    before?: unknown;
    after?: unknown;
    at: string;
  }>;
}

export interface DigestUserActivity {
  name: string;
  actionsCount: number;
  actions: Array<{
    action: string;
    entityType: string;
    entityName: string;
    at: Date;
  }>;
}

export interface DigestData {
  period: { from: Date; to: Date };
  users: DigestUserActivity[];
}

export async function summarizeTaskActivity(input: TaskSummaryInput): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `You are summarizing recent activity on a task for a project management tool. Be concise and factual. Write 2-3 sentences only.

Task: "${input.taskTitle}" (Project: ${input.projectName})

Recent activity:
${JSON.stringify(input.activities, null, 2)}

Write a short summary of what has happened on this task recently.`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

export async function generateDigestEmail(digest: DigestData): Promise<string> {
  const from = digest.period.from.toDateString();
  const to = digest.period.to.toDateString();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Write a professional but friendly activity digest email for an agency project manager.

Period: ${from} to ${to}

Team activity data:
${JSON.stringify(digest.users, null, 2)}

Requirements:
- Write a brief intro paragraph mentioning the period covered
- For each team member, write one short paragraph summarizing what they did
- End with a brief closing line
- Do NOT use markdown, bullet points, or headers — plain paragraphs only
- Keep it under 300 words total`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}
