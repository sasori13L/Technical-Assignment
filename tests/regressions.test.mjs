import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSource, queryClient } from './helpers/load-source.mjs';

const response = (token) => ({ ok: true, json: async () => ({ token, expiresAt: Date.now() + 3_600_000 }) });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('a late token from a previous selection is rejected, including A → B → A', async () => {
  const pending = deferred();
  const auth = loadSource('src/lib/auth/token.ts', { globals: { fetch: () => pending.promise } });
  auth.setActiveUser('A');
  const old = assert.rejects(auth.getAccessToken(), /session changed/);
  auth.setActiveUser('B');
  auth.setActiveUser('A');
  pending.resolve(response('old-A-token'));
  await old;
});

test('concurrent token reads share a request and a valid token is cached', async () => {
  let requests = 0;
  const auth = loadSource('src/lib/auth/token.ts', { globals: { fetch: async () => {
    requests++; return response('current-token');
  } } });
  auth.setActiveUser('A');
  assert.deepEqual(await Promise.all([auth.getAccessToken(), auth.getAccessToken()]), ['current-token', 'current-token']);
  assert.equal(await auth.getAccessToken(), 'current-token');
  assert.equal(requests, 1);
  auth.setActiveUser(null);
  assert.equal(await auth.getAccessToken(), null);
});

test('failed token requests can be retried without retaining a rejected promise', async () => {
  let requests = 0;
  const auth = loadSource('src/lib/auth/token.ts', { globals: { fetch: async () => {
    if (++requests === 1) throw new Error('offline');
    return response('retry-token');
  } } });
  auth.setActiveUser('A');
  await assert.rejects(auth.getAccessToken(), /offline/);
  assert.equal(await auth.getAccessToken(), 'retry-token');
});

test('Admin member lookup works without a vessel and uses the public client', async () => {
  const db = queryClient(({ args, operations }) => {
    assert.equal(args.p_vessel_id, null);
    assert.equal(args.p_role, 'Admin');
    const from = operations.find(([name]) => name === 'range')[1];
    return { data: from === 0 ? [{ id: 'admin', full_name: 'Admin', role: 'Admin' }] : [], error: null };
  });
  const service = loadSource('src/services/switcher.ts', { mocks: {
    '@/lib/supabase/client': { getSwitcherSupabase: () => db.client, getSupabase: () => { throw new Error('Must not use the old user token'); } },
  } });
  assert.equal((await service.fetchSwitcherMembers(null, 'Admin'))[0].id, 'admin');
  assert.deepEqual(await service.fetchSwitcherMembers(null, 'Crew'), []);
  assert.deepEqual(await service.fetchSwitcherMembers(null, 'Captain'), []);
  assert.equal(db.calls.length, 2); // one populated page and one empty terminal page
});

test('complete-list reads handle server row caps smaller than the requested range', async () => {
  const { readAllRows } = loadSource('src/services/common.ts');
  const rows = Array.from({ length: 507 }, (_, id) => ({ id }));
  const starts = [];
  const result = await readAllRows(async (from) => {
    starts.push(from);
    return { data: rows.slice(from, from + 73), error: null };
  });
  assert.deepEqual(result, rows);
  assert.deepEqual(starts, [0, 73, 146, 219, 292, 365, 438, 507]);
});

test('complete-list reads surface failures instead of returning a partial roster', async () => {
  const { readAllRows } = loadSource('src/services/common.ts');
  await assert.rejects(readAllRows(async (from) => from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { code: 'XX000', message: 'read failed' } }), /read failed/);
});

test('work-order writes include exact timestamp, status, identity, and attestation predicates', async () => {
  let stored = { id: 1, status: 'In Progress', updated_at: '2026-10-19T01:00:00.123456+00:00', solution: 'Initial', attested_at: null };
  const db = queryClient(({ operations }) => {
    const filters = operations.filter(([name]) => name === 'eq' || name === 'is');
    if (!filters.every(([, field, expected]) => stored[field] === expected)) return { data: null, error: null };
    const patch = operations.find(([name]) => name === 'update')[1];
    stored = { ...stored, ...patch, updated_at: '2026-10-19T01:00:01.654321+00:00' };
    return { data: { ...stored }, error: null };
  });
  const service = loadSource('src/services/workOrders.ts', { mocks: { '@/lib/supabase/client': { getSupabase: () => db.client } } });
  const original = { ...stored };
  const saved = await service.saveSolution(original, 'Version A');
  assert.equal(saved.updated_at, stored.updated_at);
  await assert.rejects(service.saveSolution(original, 'Version B'), /draft has been kept/);
  assert.equal(stored.solution, 'Version A');
  assert.deepEqual(db.calls[0].operations.filter(([name]) => name === 'eq' || name === 'is'), [
    ['eq', 'id', 1], ['eq', 'status', 'In Progress'],
    ['eq', 'updated_at', original.updated_at], ['is', 'attested_at', null],
  ]);
});

test('all six mutation entry points use the timestamp guard', async () => {
  const db = queryClient(() => ({ data: { id: 7, status: 'In Progress', updated_at: 'new' }, error: null }));
  const service = loadSource('src/services/workOrders.ts', { mocks: { '@/lib/supabase/client': { getSupabase: () => db.client } } });
  const expected = { id: 7, status: 'In Progress', updated_at: 'original' };
  await service.startWorkOrder(expected);
  await service.completeWorkOrder(expected, 'solution');
  await service.attestWorkOrder(expected);
  await service.rejectWorkOrder(expected, 'reason');
  await service.editWorkOrder(expected, { title: 'Updated title' });
  await service.saveSolution(expected, 'draft');
  assert.equal(db.calls.length, 6);
  for (const call of db.calls) assert.ok(call.operations.some((op) => op[0] === 'eq' && op[1] === 'updated_at' && op[2] === 'original'));
});

test('displayed codes retain all digits above 99,999', () => {
  const { workOrderCode } = loadSource('src/lib/format.ts');
  assert.deepEqual([1, 10000, 99999, 100000, 100001].map(workOrderCode), ['WO-00001', 'WO-10000', 'WO-99999', 'WO-100000', 'WO-100001']);
});

test('list/detail/create normalize legacy codes and full-code search uses the primary key', async () => {
  const db = queryClient(({ operations }) => ({
    data: operations.some(([name]) => name === 'range') ? [{ id: 100000, code: 'WO-10000' }] : { id: 100000, code: 'WO-10000' },
    count: 1, error: null,
  }));
  const service = loadSource('src/services/workOrders.ts', { mocks: { '@/lib/supabase/client': { getSupabase: () => db.client } } });
  const result = await service.listWorkOrders({ vesselId: 'vessel', view: 'all', assigneeId: 'all', search: 'WO-100000', page: 1, pageSize: 10 });
  assert.equal(result.rows[0].code, 'WO-100000');
  assert.ok(db.calls[0].operations.some((op) => op[0] === 'eq' && op[1] === 'id' && op[2] === '100000'));
  assert.ok(!db.calls[0].operations.some(([name]) => name === 'or'));
  assert.equal((await service.fetchWorkOrder(100000)).code, 'WO-100000');
  assert.equal((await service.createWorkOrder('vessel', { title: 'New work', issue: 'An issue', assigned_to: 'crew' })).code, 'WO-100000');
});

test('assignment user/vessel search can request pages beyond the old 500-record limit', async () => {
  const signal = new AbortController().signal;
  const db = queryClient(() => ({ data: [{ id: 'record-501' }], count: 501, error: null }));
  const mocks = { '@/lib/supabase/client': { getSupabase: () => db.client } };
  const users = loadSource('src/services/users.ts', { mocks });
  const vessels = loadSource('src/services/vessels.ts', { mocks });
  assert.equal((await users.listAssignableUsers('QA user', 21, signal)).rows[0].id, 'record-501');
  assert.equal((await vessels.listVesselOptions('QA vessel', 21, true, signal, 'current')).rows[0].id, 'record-501');
  for (const call of db.calls) {
    assert.ok(call.operations.some((op) => op[0] === 'range' && op[1] === 500 && op[2] === 524));
    assert.ok(call.operations.some((op) => op[0] === 'abortSignal' && op[1] === signal));
    assert.ok(call.operations.some(([name]) => name === 'or'));
    assert.deepEqual(call.operations.filter(([name]) => name === 'order').at(-1), ['order', 'id']);
  }
  assert.ok(db.calls[1].operations.some((op) => op[0] === 'neq' && op[1] === 'id' && op[2] === 'current'));
});

test('a history error renders an explicit failure and retry, not an empty timeline', () => {
  const { WorkOrderDetailModal } = loadSource('src/components/work-orders/WorkOrderDetailModal.tsx', { mocks: {
    '@tanstack/react-query': { useQuery: ({ queryKey }) => queryKey[0] === 'wo'
      ? { data: { id: 1, code: 'WO-00001', title: 'Inspection', status: 'Open', created_at: '2026-10-19', updated_at: '2026-10-19', attested_at: null }, isPending: false, isError: false }
      : { data: undefined, isPending: false, isError: true, error: new Error('Offline'), refetch: () => {} } },
    '@/components/ui/Modal': { Modal: ({ children }) => React.createElement('div', null, children) },
    './WorkOrderActions': { WorkOrderActions: () => null },
    './WorkOrderTimeline': { WorkOrderTimeline: () => React.createElement('p', null, 'EMPTY TIMELINE') },
  } });
  const html = renderToStaticMarkup(React.createElement(WorkOrderDetailModal, { id: 1, user: { id: 'admin', role: 'Admin' }, onClose: () => {} }));
  assert.match(html, /Could not load history: Offline/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /EMPTY TIMELINE/);
});
