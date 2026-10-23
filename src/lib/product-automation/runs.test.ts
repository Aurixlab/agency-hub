import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { SignJWT } from 'jose';

let GET: typeof import('@/app/api/product-automation/runs/route').GET;
const findMany = mock.fn(async (_query: any): Promise<Array<{ id: string }>> => []);
const testGlobal = globalThis as unknown as { prisma?: unknown };
const previousPrisma = testGlobal.prisma;

before(async () => {
  // Supply a database stub before loading the route; these tests never connect to a database.
  testGlobal.prisma = { productAutomationRun: { findMany } };
  ({ GET } = await import('@/app/api/product-automation/runs/route'));
});
beforeEach(() => findMany.mock.resetCalls());
after(() => { testGlobal.prisma = previousPrisma; });

async function request(cursor?: string) {
  const token = await new SignJWT({ userId: 'test-user', role: 'MEMBER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-secret-change-me'));
  return new Request(`http://localhost/api/product-automation/runs${cursor ? `?cursor=${cursor}` : ''}`, {
    headers: { cookie: `agency-hub-session=${token}` },
  });
}

test('product history requires authentication before querying products', async () => {
  const response = await GET(new Request('http://localhost/api/product-automation/runs'));
  assert.equal(response.status, 401);
  assert.equal(findMany.mock.callCount(), 0);
});

for (const count of [0, 25, 40, 41]) {
  test(`product history returns up to 40 rows and detects more history with ${count} results`, async () => {
    const rows = Array.from({ length: count }, (_, i) => ({ id: `run-${i}` }));
    findMany.mock.mockImplementation(async () => rows);
    const response = await GET(await request());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.runs, rows.slice(0, 40));
    assert.equal(payload.nextCursor, count > 40 ? 'run-39' : null);
    const query = findMany.mock.calls[0].arguments[0];
    assert.equal(query.take, 41);
    assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.equal(query.cursor, undefined);
  });
}

test('loading older products starts after the last visible row', async () => {
  const rows = [{ id: 'older-run' }];
  findMany.mock.mockImplementation(async () => rows);
  const response = await GET(await request('run-39'));
  assert.deepEqual(await response.json(), { runs: rows, nextCursor: null });
  const query = findMany.mock.calls[0].arguments[0];
  assert.deepEqual(query.cursor, { id: 'run-39' });
  assert.equal(query.skip, 1);
});
