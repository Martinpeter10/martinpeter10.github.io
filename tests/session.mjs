// Mint a real Supabase session for an existing user and shape it the way
// supabase-js persists it, so a test page can be "signed in" without Google.
//
// Google actively blocks automated sign-in, so driving the real OAuth flow is
// not an option. This produces a genuine JWT from the real auth server - only
// the browser's click-through is skipped.
//
// Needs SB_TOKEN (a Supabase personal access token) in the environment.

const REF = process.env.DJ_REF || 'uyvozabvhhaqhypnquzd';
const URL = `https://${REF}.supabase.co`;

async function j(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url} :: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export async function mintSession() {
  const pat = process.env.SB_TOKEN;
  if (!pat) throw new Error('SB_TOKEN not set - needed to mint a test session');

  const keys = await j(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${pat}` } });
  const svc = keys.find((k) => (k.name || k.type) === 'service_role').api_key;
  const pub = keys.find((k) => (k.name || k.type) === 'anon')?.api_key
           || process.env.DJ_PUBLISHABLE;

  // A DEDICATED test account, never the site owner's.
  //
  // The tests wipe scores, stats and state for whatever account they play as.
  // Using the first user in the project meant every run destroyed real play
  // data and left fake rows behind - and one row per player per game per day
  // means a leftover test score blocks the real one for the rest of the day.
  const TEST_EMAIL = process.env.DJ_TEST_EMAIL || 'autotest@dailyjamm.invalid';

  const users = await j(`${URL}/auth/v1/admin/users`,
    { headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
  let user = users.users.find((u) => u.email === TEST_EMAIL);

  if (!user) {
    user = await j(`${URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, email_confirm: true,
                             user_metadata: { autotest: true } }),
    });
    console.log(`  created test account ${TEST_EMAIL}`);
  }

  // submit_score refuses a player with no profile, so make sure it has one.
  const schema = process.env.DJ_SCHEMA || 'app_dev';
  const ref = REF;
  await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query:
      `insert into ${schema}.profiles (id, username, username_key)
       values ('${user.id}', 'AutoTest', 'autotest')
       on conflict (id) do nothing;` }),
  });

  const link = await j(`${URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: user.email }),
  });

  const sess = await j(`${URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: pub, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  });

  return {
    userId: user.id,
    email: user.email,
    key: `sb-${REF}-auth-token`,
    value: JSON.stringify({
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (sess.expires_in ?? 3600),
      expires_in: sess.expires_in ?? 3600,
      token_type: 'bearer',
      user: sess.user,
    }),
  };
}
