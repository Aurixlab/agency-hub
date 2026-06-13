import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export interface ExtractedTask {
  title: string;
  description: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeIds: string[];
  dueDate?: string | null;
}

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

/**
 * Reads a meeting transcript and returns a list of actionable tasks, each
 * pre-assigned to the best-matched team member(s) based on their bio.
 * Uses Gemini structured output. Defensively validates the result so a bad
 * model response can never produce invalid assignees or priorities.
 */
export async function extractTasksFromTranscript(
  transcript: string,
  members: { id: string; name: string; bio: string | null }[]
): Promise<ExtractedTask[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: 'Short, actionable task title' },
            description: { type: SchemaType.STRING, description: 'One or two sentences of context from the transcript' },
            priority: { type: SchemaType.STRING, enum: PRIORITIES, format: 'enum' },
            assigneeIds: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description: 'IDs of the team members best suited for this task',
            },
            dueDate: { type: SchemaType.STRING, description: 'ISO date (YYYY-MM-DD) only if a deadline is explicitly stated, else empty' },
          },
          required: ['title', 'description', 'priority', 'assigneeIds'],
        },
      },
    },
  });

  const roster = members
    .map(m => `- ${m.name} (id: ${m.id}): ${m.bio?.trim() || 'No description available.'}`)
    .join('\n');

  const prompt = `You are a project manager assistant for a digital marketing agency. Read the following meeting transcript and extract every concrete, actionable task that was discussed or assigned.

For each task:
- Write a clear, short title and a one-to-two sentence description grounded in what the transcript actually says.
- Assign it to the best-suited team member(s) by matching the work to their role description below. You MAY assign multiple people if the task clearly needs them. Use ONLY the exact "id" values listed — never invent IDs or names.
- Set a priority (URGENT, HIGH, MEDIUM, LOW, or NONE) based on urgency cues in the transcript.
- Only set dueDate (as YYYY-MM-DD) if a specific deadline is explicitly mentioned; otherwise leave it empty.
- Ignore small talk, status updates with no follow-up, and anything that is not an actionable task.

If no actionable tasks exist, return an empty array.

TEAM MEMBERS:
${roster}

MEETING TRANSCRIPT:
"""
${transcript}
"""`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const validIds = new Set(members.map(m => m.id));

  return parsed
    .map((raw: any): ExtractedTask | null => {
      const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
      if (!title) return null;
      const priority = PRIORITIES.includes(raw?.priority) ? raw.priority : 'NONE';
      const assigneeIds = Array.isArray(raw?.assigneeIds)
        ? raw.assigneeIds.filter((id: unknown): id is string => typeof id === 'string' && validIds.has(id))
        : [];
      const rawDue = typeof raw?.dueDate === 'string' ? raw.dueDate.trim() : '';
      const dueDate = rawDue && !Number.isNaN(Date.parse(rawDue)) ? rawDue : null;
      return {
        title,
        description: typeof raw?.description === 'string' ? raw.description.trim() : '',
        priority,
        assigneeIds,
        dueDate,
      };
    })
    .filter((t): t is ExtractedTask => t !== null);
}
