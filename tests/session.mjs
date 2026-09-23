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

  const users = await j(`${URL}/auth/v1/admin/users`,
    { headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
  const user = users.users[0];
  if (!user) throw new Error('no users in this project to mint a session for');

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
