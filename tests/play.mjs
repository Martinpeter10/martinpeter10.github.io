// DailyJamm gameplay tests: actually play a game to completion, then verify
// what reached the database.
//
//   node play.mjs                 # dev
//   node play.mjs --headed        # watch it play
//   node play.mjs --keep          # leave the test rows behind
//
// Needs SB_TOKEN and DJ_PUBLISHABLE.
//
// WHY: smoke.mjs proves pages load. It would not have caught submit_score
// failing on every call, extras being double-counted, or Spelldle reporting a
// loss for every win - all of which were real. Those only surface by playing a
// game and reading back what was stored.
//
// Chain Link is the first because it is fully deterministic: the puzzle comes
// from the day of year, so the test can compute today's answers and drive a
// known-perfect 20/20 rather than hoping.

import { chromium } from 'playwright';
import { mintSession } from './session.mjs';

const has = (n) => process.argv.includes('--' + n);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };

const BASE = arg('base', 'https://dev.dailyjamm.com');
const REF = process.env.DJ_REF || 'uyvozabvhhaqhypnquzd';
const SCHEMA = process.env.DJ_SCHEMA || 'app_dev';

let pass = 0, fail = 0;
const notes = [];
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`); notes.push(label); }
}

// ── Database access, via the Management API ──────────────────────────────
// The game stamps rows with dj_today() (Chicago). Using Postgres current_date
// (UTC) silently targets tomorrow for five hours every evening - which is
// exactly how the first run of this test "found" nothing.
const DJ_DAY = () => `${SCHEMA}.dj_today()`;

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Today's Chain Link puzzle, by the same day-of-year rule the game uses. */
async function todaysChainLink() {
  const puzzles = await (await fetch(`${BASE}/assets/data/chainlink-puzzles.json`)).json();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const jan1 = new Date(Date.UTC(+m.year, 0, 1, 12));
  const today = new Date(Date.UTC(+m.year, +m.month - 1, +m.day, 12));
  const dayOfYear = Math.round((today - jan1) / 86400000) + 1;
  return puzzles[(dayOfYear - 1) % puzzles.length];
}

async function playChainLink(browser, session) {
  const puzzle = await todaysChainLink();
  // words[0] is the given start word; the five answers follow.
  const answers = puzzle.words.slice(1);
  console.log(`\nChain Link puzzle #${puzzle.id} - answers: ${answers.join(', ')}`);

  // Start from a clean slate so the game does not restore a finished day.
  await sql(`delete from ${SCHEMA}.scores where game='chainlink' and day=${DJ_DAY()};
             delete from ${SCHEMA}.game_stats where game='chainlink';
             delete from ${SCHEMA}.game_state where game='chainlink';`);

  const ctx = await browser.newContext();
  await ctx.addInitScript(([k, v]) => {
    try {
      localStorage.setItem(k, v);
      localStorage.removeItem('cl_today');      // force a fresh board
      localStorage.setItem('cl_seen_howto', '1'); // skip the how-to modal
      localStorage.setItem('dj_cookie_ok', '1');
    } catch (e) {}
  }, [session.key, session.value]);

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|clarity|gtag/i.test(m.text())) errors.push(m.text()); });

  await page.goto(`${BASE}/chainlink/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cl-guess-input', { timeout: 20000 });
  await page.waitForTimeout(1500);   // let the gate settle

  check('gate opened and board is live', await page.isVisible('#cl-guess-input'));

  for (const word of answers) {
    await page.fill('#cl-guess-input', word);
    await page.click('#cl-submit-btn');
    await page.waitForTimeout(700);   // tile animation
  }
  await page.waitForTimeout(2500);    // results render + submit fires

  const shown = await page.evaluate(() => {
    // cl-final-score is what the game submits; cl-score is the running total
    // before the perfect bonus is added.
    const el = document.getElementById('cl-final-score');
    return el ? parseInt(el.textContent, 10) : null;
  });
  // Five correct first-time guesses = 15, plus the 5-point perfect bonus.
  check('game shows a perfect 20', shown === 20, `showed ${shown}`);
  check('no uncaught errors while playing', errors.length === 0, errors.slice(0, 2).join(' | '));

  await ctx.close();

  // ── the half smoke tests cannot reach ──────────────────────────────────
  const rows = await sql(`select score from ${SCHEMA}.scores where game='chainlink' and day=${DJ_DAY()};`);
  check('score reached the database', rows.length === 1, `${rows.length} rows`);
  check('stored score matches the screen', rows[0]?.score === shown, `db=${rows[0]?.score} screen=${shown}`);

  const stats = await sql(`select played, best, extras from ${SCHEMA}.game_stats where game='chainlink';`);
  check('lifetime stats rolled up', stats[0]?.played === 1, `played=${stats[0]?.played}`);
  check('perfect game counted exactly once', String(stats[0]?.extras?.perfect_total) === '1',
        `perfect_total=${stats[0]?.extras?.perfect_total}`);

  const board = await sql(`
    select username, value from ${SCHEMA}.get_game_board('chainlink','today',10);`);
  check('appears on the leaderboard', board.length >= 1 && Number(board[0].value) === shown,
        JSON.stringify(board[0] || null));

  const state = await sql(`select complete from ${SCHEMA}.game_state where game='chainlink' and day=${DJ_DAY()};`);
  check('daily state synced and marked complete', state[0]?.complete === true,
        JSON.stringify(state[0] || null));

  if (!has('keep')) {
    await sql(`delete from ${SCHEMA}.scores where game='chainlink' and day=${DJ_DAY()};
               delete from ${SCHEMA}.game_stats where game='chainlink';
               delete from ${SCHEMA}.game_state where game='chainlink';`);
    console.log('  (test rows cleaned up)');
  }
}

async function main() {
  if (!process.env.SB_TOKEN) throw new Error('SB_TOKEN not set');
  const session = await mintSession();
  console.log(`playing as ${session.email} against ${BASE}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: !has('headed') });
  try {
    await playChainLink(browser, session);
  } finally {
    await browser.close();
  }

  console.log(`\n  ${pass} passed, ${fail} failed`);
  if (notes.length) notes.forEach((n) => console.log('   - ' + n));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
