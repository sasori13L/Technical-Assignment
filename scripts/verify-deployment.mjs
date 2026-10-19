#!/usr/bin/env node
// Smoke test for a running copy of the app against its Supabase project.
// Run it locally before deploying, then again against the live URL.
//
//   node scripts/verify-deployment.mjs --app https://your-app.vercel.app \
//        --supabase https://YOUR-REF.supabase.co --anon YOUR-ANON-KEY
//
// It only reads data, and its one write attempts are made as the wrong role so
// they must be refused. It expects the demo data from supabase/seed.sql.
import { createHmac } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const APP = (args.app ?? 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE = (args.supabase ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON = args.anon ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
if (!SUPABASE || !ANON) {
  console.error('Usage: node scripts/verify-deployment.mjs --app <app url> --supabase <project url> --anon <anon or publishable key>');
  process.exit(2);
}

const ID = {
  captainPD: 'c0000000-0000-4000-8000-000000000001', // Rafael Mendoza, MV Pacific Dawn
  captainCS: 'c0000000-0000-4000-8000-000000000002', // Elena Rojas, MV Cebu Star
  crewNoel: 'd0000000-0000-4000-8000-000000000001',  // Noel Bautista, MV Pacific Dawn
  crewLiza: 'd0000000-0000-4000-8000-000000000002',  // Liza Tan, MV Pacific Dawn
  vesselPD: 'b0000000-0000-4000-8000-000000000001',
  inactiveCrew: 'd0000000-0000-4000-8000-000000000009', // Rico Santos
};

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        -> ${detail}`}`); return ok; };

async function rest(path, { token = ANON, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, range: res.headers.get('content-range') };
}
async function tokenFor(userId) {
  const res = await fetch(`${APP}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

console.log(`App:      ${APP}\nSupabase: ${SUPABASE}\n`);

// 1. The app is up and the token route behaves
const home = await fetch(APP).catch((e) => ({ status: 0, error: e }));
check('app responds', home.status === 200, `status ${home.status}`);
check('token route rejects a malformed id', (await tokenFor('nope')).status === 400);
check('token route rejects an unknown user', (await tokenFor('00000000-0000-4000-8000-000000000000')).status === 404);
const inactive = await tokenFor(ID.inactiveCrew);
check('token route rejects an inactive user', inactive.status === 404, `status ${inactive.status}`);

// 2. The anon key can only reach the dropdown RPCs
const vessels = await rest('rpc/switcher_vessels', { method: 'POST', body: {} });
check('anon can load the vessel dropdown (3 active vessels)', vessels.status === 200 && Array.isArray(vessels.json) && vessels.json.length === 3, `status ${vessels.status} ${vessels.text.slice(0, 120)}`);
const anonOrders = await rest('work_orders?select=id&limit=1');
check('anon cannot read work orders', anonOrders.status >= 400 || (Array.isArray(anonOrders.json) && anonOrders.json.length === 0), `status ${anonOrders.status} ${anonOrders.text.slice(0, 120)}`);
const anonUsers = await rest('users?select=email&limit=1');
check('anon cannot read users', anonUsers.status >= 400 || (Array.isArray(anonUsers.json) && anonUsers.json.length === 0), `status ${anonUsers.status} ${anonUsers.text.slice(0, 120)}`);

// 3. The signed token is accepted by Supabase. This is the main deployment risk.
const rafael = await tokenFor(ID.captainPD);
if (!check('token route issues a token (needs SUPABASE_JWT_SECRET)', rafael.status === 200 && !!rafael.body.token, `status ${rafael.status} ${JSON.stringify(rafael.body)}`)) process.exit(1);
const cap = await rest('work_orders?select=id,vessel_id&limit=1000', { token: rafael.body.token, headers: { Prefer: 'count=exact' } });
if (!check('Supabase accepts the token (captain can read orders)', cap.status === 200 && Array.isArray(cap.json) && cap.json.length > 0,
  `status ${cap.status} ${cap.text.slice(0, 200)}\n        A 401 here means Supabase is not verifying with the secret you set. See DEPLOYMENT.md, "JWT problems".`)) process.exit(1);
check('captain sees only their own vessel', new Set(cap.json.map((r) => r.vessel_id)).size === 1 && cap.json[0].vessel_id === ID.vesselPD, `vessels: ${[...new Set(cap.json.map((r) => r.vessel_id))]}`);

// 4. Row level security per role
const noel = await tokenFor(ID.crewNoel);
const crew = await rest('work_orders?select=id,assigned_to&limit=1000', { token: noel.body.token });
check('crew sees only orders assigned to them', crew.status === 200 && crew.json.length > 0 && crew.json.every((r) => r.assigned_to === ID.crewNoel), `status ${crew.status} rows ${crew.json?.length}`);
const elena = await tokenFor(ID.captainCS);
const other = await rest(`work_orders?select=id&vessel_id=eq.${ID.vesselPD}`, { token: elena.body.token });
check("a captain cannot see another vessel's orders", other.status === 200 && other.json.length === 0, `status ${other.status} rows ${other.json?.length}`);
const crewUsers = await rest('users?select=email', { token: noel.body.token });
check('crew sees only people on their own vessel', crewUsers.status === 200 && crewUsers.json.length > 0 && crewUsers.json.length < 15, `rows ${crewUsers.json?.length}`);

// 5. Writes the wrong role must not be able to make (these should all be refused, so nothing changes)
const lizaOrder = await rest(`work_orders?select=id&assigned_to=eq.${ID.crewLiza}&limit=1`, { token: rafael.body.token });
const lizaId = lizaOrder.json?.[0]?.id;
if (lizaId) {
  const steal = await rest(`work_orders?id=eq.${lizaId}`, { token: noel.body.token, method: 'PATCH', body: { status: 'Done', solution: 'x' }, headers: { Prefer: 'return=representation' } });
  check("crew cannot update someone else's order", steal.status >= 400 || (Array.isArray(steal.json) && steal.json.length === 0), `status ${steal.status} ${steal.text.slice(0, 120)}`);
}
const crewCreate = await rest('work_orders', { token: noel.body.token, method: 'POST', body: { vessel_id: ID.vesselPD, title: 'Should be refused', issue: 'Crew cannot create orders', assigned_to: ID.crewNoel } });
check('crew cannot create a work order', crewCreate.status >= 400, `status ${crewCreate.status} ${crewCreate.text.slice(0, 120)}`);
const crewUser = await rest('users', { token: noel.body.token, method: 'POST', body: { full_name: 'Should Fail', email: 'should.fail@example.com', role: 'Admin' } });
check('crew cannot create a user', crewUser.status >= 400, `status ${crewUser.status} ${crewUser.text.slice(0, 120)}`);

// 6. A token signed with the wrong secret is rejected
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ role: 'authenticated', app_user_id: ID.captainPD, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
const forged = `${head}.${body}.${createHmac('sha256', 'definitely-not-the-secret').update(`${head}.${body}`).digest('base64url')}`;
const forgedRes = await rest('work_orders?select=id&limit=1', { token: forged });
check('a token signed with the wrong secret is rejected', forgedRes.status === 401, `status ${forgedRes.status}`);

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
