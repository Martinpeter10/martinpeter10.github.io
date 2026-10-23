// The leaderboards page offers the top players on EVERY card that has them.
//
// THE BUG THIS COVERS. A signed-in player who had not played a game saw only
// "You have not played this one yet." and no way to look at the board -
// strictly LESS than the signed-OUT card, which has always offered one. The
// page's job is "my stats, and how I compare"; a card with no rank of your own
// is exactly where the comparison half still has something to say.
//
// WHY IT STUBS DJAccount. The page gets everything through DJAccount.rpc
// ('get_summary_v2') and DJAccount.board(), so feeding it fixtures pins the
// three card states exactly - including "signed in with zero history", which
// is otherwise unreachable without minting a session and is the one that
// regressed. Same approach globalpanels.mjs uses, and it needs no token and no
// database, so it runs anywhere. account.js is blocked from loading so it
// cannot overwrite the stub mid-boot.
//
// The negative case earns its keep: a game NOBODY has played must show no
// button, because there is nothing behind it. Without that, "always render the
// button" would pass this file and ship a control that opens an empty list.

import { launch, argOf } from './lib.mjs';

const BASE = argOf('base', 'https://dev.dailyjamm.com');
const URL_ = BASE + '/leaderboards/';

let pass = 0;
const fails = [];
const ok = () => { pass++; };
const bad = (m) => fails.push(m);

// Three cards, one per state we care about.
const ROWS = [
  // Never played, but 7 other people have -> MUST show the whole row set.
  // Carries a notable label so that row is exercised too.
  { game: 'chainlink', label: 'Chain Link', score_label: 'Score',
    notable_label: 'Perfect games', best_ranked: true,
    players: 7, my_played: 0 },
  // Played, with a rank -> ordinary stat rows.
  { game: 'themedle', label: 'Themedle', score_label: 'Guesses',
    players: 9, my_played: 12, my_best: 3, my_avg: 4.2, my_cur_streak: 5,
    my_best_streak: 8, rank_played: 2, rank_best: 1, rank_avg: 3,
    rank_streak: 2, avg_players: 9, best_ranked: true },
  // Nobody anywhere has played -> no button, nothing behind it.
  { game: 'yachtdle', label: 'Yachtdle', score_label: 'Points',
    players: 0, my_played: 0 },
];

const BOARD = [
  { rank: 1, username: 'Alice', value: '31', is_me: false },
  { rank: 2, username: 'Bob',   value: '24', is_me: false },
];

/** Install a fake DJAccount and stop the real one from loading. */
async function openPage(browser, { signedIn }) {
  const page = await browser.newPage();

  // Block the real account module so nothing clobbers the stub.
  await page.route('**/assets/js/account.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: '/* stubbed */',
  }));

  await page.addInitScript(({ rows, board, signedIn }) => {
    window.DJAccount = {
      isReady:      () => signedIn,
      username:     () => (signedIn ? 'TestPlayer' : null),
      whenResolved: (cb) => cb(),
      open:         () => {},
      close:        () => {},
      rpc: (name) => Promise.resolve(
        name === 'get_summary_v2' ? { data: rows } : { data: [] }),
      board: () => Promise.resolve(board),
    };
  }, { rows: ROWS, board: BOARD, signedIn });

  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('.lb-card', { timeout: 20000 });
  await page.waitForTimeout(400);
  return page;
}

function readCards(page) {
  return page.$$eval('.lb-card', (cards) => cards.map((c) => {
    const btn  = c.querySelector('.lb-see-top');
    const rows = [...c.querySelectorAll('.lb-stat:not(.lb-stat-head)')];
    return {
      text:     c.textContent.replace(/\s+/g, ' ').trim(),
      msg:      (c.querySelector('.lb-msg') || {}).textContent || '',
      rows:     rows.length,
      labels:   rows.map((r) => (r.querySelector('.lb-stat-label') || {}).textContent || ''),
      vals:     rows.map((r) => ((r.querySelector('.lb-stat-val') || {}).textContent || '').trim()),
      ranks:    rows.filter((r) => ((r.querySelector('.lb-stat-rank') || {}).textContent || '').trim()).length,
      chevrons: rows.filter((r) => r.querySelector('.lb-stat-see')).length,
      hasBtn:   !!btn,
      // An element can carry hidden and still render if author CSS sets
      // display - that shipped once. Measure the box, never the property.
      btnShown: !!btn && btn.getBoundingClientRect().height > 0,
    };
  }));
}

const browser = await launch();

// ── signed in ─────────────────────────────────────────────────────────────
{
  const page = await openPage(browser, { signedIn: true });
  const [unplayed, played, nobody] = await readCards(page);

  if (!unplayed || !played || !nobody) {
    bad(`signed in: expected 3 cards, got ${(await readCards(page)).length}`);
  } else {
    // THE REGRESSION. An unplayed card must carry the game's whole row set,
    // not a sentence and not one button standing in for all of them. Named
    // explicitly rather than counted, so the assertion cannot pass by
    // coincidence when the set changes shape.
    // Chain Link's own labels, from AVG_LABEL/BEST_LABEL - not the generic
    // fallbacks. Asserting the per-game wording is deliberate: it is what
    // proves the unplayed card goes through the same labelling as a played
    // one rather than a simplified copy of it.
    const WANT = ['Days played', 'Average score', 'Best score', 'Perfect games',
                  'Current streak', 'Best streak'];
    const missing = WANT.filter((w) => !unplayed.labels.some((l) => l.trim() === w));
    if (!missing.length) ok();
    else bad(`signed in, never played: missing stat rows [${missing.join(', ')}] `
             + `- card showed [${unplayed.labels.join(', ')}]`);

    // Days played reads "0", everything else "-", and the difference is the
    // point: you really have played zero days, which is a true figure, but
    // you have no average or best at all. A dash there would be a lie and a
    // zero in the others would read as a terrible score rather than no score.
    const [first, ...rest] = unplayed.vals;
    if (first === '0') ok();
    else bad(`signed in, never played: days played should read "0", got "${first}"`);
    if (rest.length && rest.every((v) => v === '-')) ok();
    else bad('signed in, never played: stats with no value should read "-", got '
             + JSON.stringify(rest));

    // No rank pills, because there is no rank to claim.
    if (unplayed.ranks === 0) ok();
    else bad(`signed in, never played: ${unplayed.ranks} rank pills shown`);

    // Every row's board must actually open - that is the whole point. Guarded
    // so a card with no chevrons reports the failure instead of throwing a
    // timeout and taking the rest of the run with it.
    if (unplayed.chevrons > 0) {
      ok();
      await page.click('.lb-card:nth-of-type(1) .lb-stat-see');
      await page.waitForTimeout(600);
      const opened = await page.$eval('.lb-card:nth-of-type(1)', (c) => c.textContent);
      if (/Alice/.test(opened)) ok();
      else bad('signed in, never played: opening a row showed no board rows');
    } else {
      bad('signed in, never played: no row offers its board (nothing to open)');
    }

    // The replaced design must not come back.
    if (!unplayed.hasBtn) ok();
    else bad('signed in, never played: a single "See the top players" button is '
             + 'back - it answers for one stat and hides the rest');

    if (played.rows > 0) ok();
    else bad('signed in, played: no stat rows rendered');

    // Nothing behind it -> a sentence, no rows, nothing to open.
    if (nobody.rows === 0 && !nobody.hasBtn) ok();
    else bad('nobody has played this game anywhere, yet the card offers boards');
  }
  await page.close();
}

// ── signed out (the behaviour that was already right) ─────────────────────
{
  const page = await openPage(browser, { signedIn: false });
  const [unplayed, played, nobody] = await readCards(page);

  if (unplayed.btnShown) ok();
  else bad('signed out: card with 7 players offers no See-top button');
  if (played.btnShown) ok();
  else bad('signed out: card with 9 players offers no See-top button');
  if (!nobody.hasBtn) ok();
  else bad('signed out: button offered for a game nobody has played');

  const txt = await page.$eval('.lb-card', (c) => c.textContent);
  if (/sign in/i.test(txt)) ok();
  else bad('signed out: no "sign in to compare" pitch on the card');

  await page.close();
}

await browser.close();
console.log(`boards.mjs  ${pass} passed, ${fails.length} failed`);
fails.forEach((f) => console.log('  FAIL ' + f));
process.exit(fails.length ? 1 : 0);
