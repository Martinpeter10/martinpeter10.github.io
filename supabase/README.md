# DailyJamm backend (Supabase)

Not part of the website. Excluded from the GitHub Pages build via `_config.yml`
and from the Cloudflare Workers upload via `.assetsignore`, so nothing in this
directory is ever served from dailyjamm.com.

---

## The two keys, and which one can be public

Supabase issues two kinds of key. Getting this distinction right is the whole
security story.

| Key | Looks like | Where it goes | If it leaks |
|---|---|---|---|
| **Publishable** | `sb_publishable_...` | Browser. Committed to this public repo. Designed for it. | Nothing. It can only do what RLS policies allow the `anon` role to do. |
| **Secret** | `sb_secret_...` | Edge Functions only, as a dashboard secret. | **Total compromise.** It bypasses RLS entirely - read, edit, delete anything. |

The publishable key is safe *only because* every table in `0001_init.sql` has
RLS enabled with no client-writable policy. The key is not the lock; the
policies are. If you ever add a table, it ships with RLS off by default - turn
it on in the same migration.

Legacy `anon` / `service_role` JWT keys still work but are deprecated by end of
2026. Use the new `sb_publishable_` / `sb_secret_` formats.

**The secret key must never appear in:** any file in this repo, any
`assets/js/` file, a CSP header, a commit message, or a screenshot. It lives in
exactly one place - Edge Function secrets in the Supabase dashboard, where
`SUPABASE_SERVICE_ROLE_KEY` is injected automatically. You do not have to paste
it anywhere for this project to work.

---

## Setup

### 1. Projects

Create two, both on the free tier:

- `dailyjamm-prod` - schema `public`
- `dailyjamm-nonprod` - schemas `app_tst` and `app_dev`

```sql
-- in dailyjamm-nonprod, SQL editor
create schema if not exists app_tst;
create schema if not exists app_dev;
```

### 2. Migration

`0001_init.sql` is a **template** and will not run - it contains a `__SCHEMA__`
token. Use the generated files beside it, which need no editing:

| Project | Paste this file | Creates |
|---|---|---|
| prod | `0001_init.public.sql` | `public` |
| nonprod | `0001_init.app_tst.sql` | `app_tst` |
| nonprod | `0001_init.app_dev.sql` | `app_dev` |

Each generated file creates its own schema, grants `usage` on it to `anon` and
`authenticated`, and pins every function's `search_path` to that schema.

**Why generated instead of a session `set search_path`:** a `security definer`
function's `search_path` must be a literal, so it cannot inherit the session's.
A function created in `app_tst` carrying `search_path = public` resolves
`scores` and `profiles` to the **production** tables. Substituting the name
mechanically is the only way to be certain that never happens.

After editing the template, regenerate with `./supabase/migrations/generate.sh`.

Then expose the non-public schemas to the API:
**Settings → API → Exposed schemas** must list `app_tst` and `app_dev`.

### 3. Auth - Google sign-in

Identity is a Google account. DailyJamm sends **no email and stores no password**,
so there is no SMTP provider, no sending domain, and no DNS to configure. The
email address arrives already verified and unique.

**Google Cloud Console** (console.cloud.google.com) - do this first:

1. Create a project (or reuse one) → **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID → Web application**
3. Under *Authorised redirect URIs* add **your Supabase callback**, which is:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   Add it once per Supabase project, so twice: prod and nonprod.
4. Copy the **Client ID** and **Client secret**

**Supabase dashboard → Authentication → Providers → Google:**

- Enable it, paste the Client ID and Client secret
- Leave "Skip nonce check" off

**Supabase dashboard → Authentication → URL Configuration:**

`signInWithOAuth` sends the player back to the page they started on, so every
origin they can start from must be on the allowlist or the round trip dead-ends.

| Project | Site URL | Redirect allowlist |
|---|---|---|
| prod | `https://dailyjamm.com` | `https://dailyjamm.com/**` |
| nonprod | `https://dailyjammtest.<sub>.workers.dev` | `https://dailyjammtest.<sub>.workers.dev/**`, `https://dailyjammdev.<sub>.workers.dev/**`, `http://localhost:8080/**` |

The `/**` wildcard matters: players sign in from `/chainlink/`, `/yachtdle/` and
every other page, not just the root.

**Authentication → Rate limits:** the defaults are fine for OAuth - there are no
emails to throttle. Leave them.

> **Anonymous sign-ins are NOT used.** If you enabled them from an earlier draft
> of this plan, turn them back off - an enabled anonymous provider is a free
> unlimited account factory pointed at your database.

### 4. Edge Function

```bash
supabase functions deploy username --project-ref <ref>
```

No secrets to set - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform.

The function refuses any request whose `Origin` is not a known DailyJamm host,
and derives the target schema from that origin. The schema is deliberately not
a request parameter: if the client could name it, the dev site could write to
production tables.

---

## Security checklist

Run through this before Phase 1 ships, and again before prod.

- [ ] Every table reports **RLS enabled** in Table Editor. No exceptions.
- [ ] `profiles`, `scores`, `game_stats` have **no** INSERT/UPDATE/DELETE policy.
- [ ] **Settings → API → Exposed schemas** lists only what is needed. `auth` is
      not in the list.
- [ ] Secret key has never been pasted into a file, and `git log -p` does not
      contain a string starting `sb_secret_`.
- [ ] Anonymous sign-ins are **disabled** (Authentication -> Providers).
- [ ] Google is the only enabled provider, and its redirect allowlist contains
      only DailyJamm origins.
- [ ] **Database → Advisors** (Security) is clean - it flags definer functions
      with a mutable `search_path`, which is the classic Postgres escalation.
- [ ] Auth **Site URL** and redirect allowlist name only DailyJamm hosts.
- [ ] Point Release / PITR expectations understood: the free tier has **no
      backups**. A bad `delete` is permanent. Take a manual dump before any
      migration that touches existing rows.

---

## Verifying the name filter

The moderation rule has two layers, and they fail differently:

1. **Character set** - `^[A-Za-z0-9_]{3,16}$`. `@$$` is rejected here as
   invalid characters, before any wordlist is consulted. This also removes
   zero-width characters, RTL overrides, and homoglyph alphabets.
2. **Normalise, then match** - for what survives, i.e. digit and underscore
   substitution.

Cases that must be **rejected**:

```
@$$        invalid characters
a55        -> ass
4ss        -> ass
sh1t       -> shit
f_u_c_k    -> fuck  (underscores stripped)
@$$h0l3    -> asshole
fuuuuck    -> fuck  (repeat collapse)
admin      reserved
chainlink  reserved
```

Cases that must be **accepted** - the Scunthorpe check, and the reason the soft
list matches on boundaries rather than substrings:

```
Cassandra
Bassmaster
Peter2
Shell_Game
Hasselhoff
```

Run the unit tests before deploying - they cover both failure modes, a masked
name getting through and an innocent name being rejected:

```bash
cd supabase/functions/username
deno test --allow-net --allow-env --allow-read moderation_test.ts
```

The logic lives in `moderation.ts` precisely so it can be tested without a
server. `index.ts` is only the HTTP handler.

Test against the deployed function:

```bash
curl -s -X POST "https://<ref>.supabase.co/functions/v1/username" \
  -H "Origin: https://dailyjamm.com" \
  -H "apikey: <publishable key>" \
  -H "content-type: application/json" \
  -d '{"action":"check","username":"a55"}'
```

Expect `{"available":false,...}`. Every rejection returns the same message on
purpose: a filter that explains itself teaches people how to beat it, and
telling someone their surname is profane is worse than telling them nothing.
