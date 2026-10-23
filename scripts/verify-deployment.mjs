#!/usr/bin/env node
// Production smoke test using a dedicated real Supabase Auth test account.
// Never use a human user's credentials in CI.
//
// node scripts/verify-deployment.mjs --app <url> --supabase <url> --anon <key> \
//   --email <test-account> --password <test-password>

const pairs = process.argv.slice(2).reduce((out, value, index, all) => {
  if (value.startsWith('--')) out[value.slice(2)] = all[index + 1];
  return out;
}, {});
const APP = (pairs.app ?? 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE = (pairs.supabase ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON = pairs.anon ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const EMAIL = pairs.email ?? process.env.FLEETOPS_TEST_EMAIL ?? '';
const PASSWORD = pairs.password ?? process.env.FLEETOPS_TEST_PASSWORD ?? '';
if (!SUPABASE || !ANON || !EMAIL || !PASSWORD) {
  console.error('Provide --app, --supabase, --anon, --email and --password (or the matching environment variables).');
  process.exit(2);
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        -> ${detail}`}`);
};

async function rest(path, token = ANON) {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

console.log(`App:      ${APP}\nSupabase: ${SUPABASE}\n`);
const home = await fetch(APP, { redirect: 'manual' }).catch((error) => ({ status: 0, error }));
check('protected home redirects signed-out visitors', [301, 302, 303, 307, 308].includes(home.status), `status ${home.status}`);
const login = await fetch(`${APP}/login`);
check('login page responds', login.status === 200, `status ${login.status}`);

const anonOrders = await rest('work_orders?select=id&limit=1');
check('anonymous users cannot read work orders', anonOrders.status >= 400 || anonOrders.json?.length === 0, `status ${anonOrders.status}`);
const anonUsers = await rest('users?select=id&limit=1');
check('anonymous users cannot read profiles', anonUsers.status >= 400 || anonUsers.json?.length === 0, `status ${anonUsers.status}`);

const authResponse = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const auth = await authResponse.json().catch(() => ({}));
check('test account can sign in', authResponse.ok && !!auth.access_token, `status ${authResponse.status}`);
if (!auth.access_token) process.exit(1);

const profile = await rest('users?select=id,auth_user_id,role,is_active', auth.access_token);
check('Auth identity resolves to one active profile', profile.status === 200 && profile.json?.length === 1 && profile.json[0].is_active,
  `status ${profile.status}, rows ${profile.json?.length ?? 0}`);
const vessels = await rest('vessels?select=id,name&is_active=eq.true', auth.access_token);
check('signed-in account can read its RLS-visible vessels', vessels.status === 200 && Array.isArray(vessels.json), `status ${vessels.status}`);
const orders = await rest('work_orders?select=id,vessel_id,assigned_to&limit=10', auth.access_token);
check('signed-in account can read its RLS-visible work orders', orders.status === 200 && Array.isArray(orders.json), `status ${orders.status}`);

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
