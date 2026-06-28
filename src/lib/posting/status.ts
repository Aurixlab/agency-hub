export function nextRetryAt(attemptNumber: number, now = new Date()) {
  const delays: Record<number, number> = {
    1: 60_000,
    2: 5 * 60_000,
    3: 15 * 60_000,
  };
  const delay = delays[attemptNumber];
  return delay ? new Date(now.getTime() + delay) : null;
}

export function isFinalFailure(attemptNumber: number) {
  return attemptNumber >= 4;
}

export function normalizeMediaUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}
