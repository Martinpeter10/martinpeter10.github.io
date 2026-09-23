# Browser tests

Drives the real Chrome on this machine against a live environment. Catches the
class of bug `curl` cannot see: CORS preflight rejections, uncaught
`ReferenceError`s from script-ordering assumptions, and a hydration gate that
fails to open.

Not part of the site. `tests` is excluded from the GitHub Pages build by
`_config.yml` and from the Cloudflare upload by `.assetsignore`; `node_modules`
is gitignored.

## Setup

Needs Node. Homebrew's `node` wants an accepted Xcode licence; the prebuilt
tarball does not:

```sh
curl -sSL https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.gz | tar xz
export PATH="$PWD/node-v24.21.0-darwin-arm64/bin:$PATH"
```

Then, once:

```sh
cd tests && npm install
```

Playwright uses the Chrome already installed (`channel: 'chrome'`), so there is
no browser download.

## Running

```sh
node smoke.mjs                        # dev, signed out
node smoke.mjs --signed-in            # dev, with an injected session
node smoke.mjs --base https://tst.dailyjamm.com
node smoke.mjs --headed               # watch it happen
```

`--signed-in` needs a Supabase personal access token:

```sh
export SB_TOKEN=sbp_...
export DJ_PUBLISHABLE=sb_publishable_...
```

## games.mjs - plays each game, several ways

```sh
node games.mjs                    # every game, every case
node games.mjs --only chainlink   # one game
node games.mjs --case win         # one case
node games.mjs --headed           # watch it play
```

Per game: a win, a partial/alternative outcome, and a loss - then two cases that
are not game-specific but are where the real bugs lived:

| Case | What it protects |
|---|---|
| outcomes | score stored, matches the screen, stats rolled up, extras counted **once**, day complete |
| replay-after-finish | reloading a finished game does not double-count or reopen the day |
| signed-out | the result is **queued**, not submitted, and never reaches the boards |

### It plays as a dedicated account

`session.mjs` creates and uses `autotest@dailyjamm.invalid`, never the site
owner's account, and every read and wipe is scoped to that user id. `wipe()`
throws if called without one.

This matters: the tests delete rows. An earlier version played as the first user
in the project and destroyed real play data, then left a fake score behind -
and one row per player per game per day means a leftover blocks the real score
for the rest of the day.

### Replicated puzzle rules will drift

`games/*.mjs` recomputes each game's answer using the same rule the game uses.
That duplication is the weak point: the Spelldle module first used canonical
mulberry32 while the game uses a variant (`>>> 0` not `| 0`, and `| 0` not
`^ t`), so every computed answer was wrong. The suite reported it as "nothing
was stored", which looked like an app bug.

`games.mjs` now guards for this: if a winning plan does not end the game, it
fails with *"this test's puzzle rule has drifted from the game"* rather than
the downstream symptom.

## play.mjs - the original single-game script

```sh
node play.mjs            # plays today's Chain Link to a perfect 20
node play.mjs --headed   # watch it type
node play.mjs --keep     # leave the rows for inspection
```

Chain Link is deterministic - the puzzle comes from the day of year - so the
test computes today's answers, types them, and asserts a known 20/20. Then it
reads the database and checks the score landed, matches the screen, rolled up
into lifetime stats, counted the perfect game exactly once, reached the
leaderboard, and marked the day complete.

This is the half `smoke.mjs` cannot reach. It would have caught `submit_score`
failing on every call, extras being double-counted on a first play, and
Spelldle reporting a loss for every win.

**Use `dj_today()`, never `current_date`.** The games stamp rows with the
Chicago date; Postgres `current_date` is UTC. For five hours every evening they
are different days, and a query using the wrong one silently finds nothing -
which is how the first run of this test "failed".

## What smoke.mjs checks

Every page and all ten games:

- HTTP 200, and the page actually rendered text
- **no uncaught errors or console errors** (analytics blocked by consent is ignored)
- the shared header is present
- **the DJStore gate opened** - a gate that does not open is a permanently
  blank game, the worst failure in the state design
- `synced` is true when signed in and false when signed out

## Why sign-in is injected rather than driven

Google actively blocks automated sign-in, so the OAuth click-through cannot be
scripted. `session.mjs` mints a genuine JWT from the real auth server via the
admin API and writes it to the `sb-<ref>-auth-token` key supabase-js reads.
Everything after the redirect is exercised for real; only Google's own page is
skipped.

**Test data lands in `app_dev`.** Delete rows afterwards if a test submits a
score - one row per player per game per day means a leftover blocks the real one.
