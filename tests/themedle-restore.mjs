// Themedle mid-game reload: the clip LABEL must match the clip.
//
//   node themedle-restore.mjs
//
// No credentials needed - it primes themedleDailyState directly and loads the
// page signed out, which is exactly the reported scenario.
//
// The reported symptom was "reloading drops the clip back to 1 second". The
// clip was never wrong: playback reads currentClipLength, which
// restoreGameState() derives from currentGuess. The LABEL was wrong - it is
// hardcoded "1 second" in the HTML and was only updated when a guess was
// submitted, so a reload left it reading 1 second while the clip really was
// 15. Worth a test precisely because the bug was in what the player is TOLD,
// which no amount of checking the audio would have caught.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

// guess number -> what the label must read. timeIncrements = [1,2,3,5,10,15].
const CASES = [[1, '1 second'], [2, '2 seconds'], [4, '5 seconds'], [6, '15 seconds']];

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
console.log(`\nThemedle mid-game restore  ${BASE}\n`);

for (const [guessNo, expected] of CASES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((n) => {
    try {
      localStorage.setItem('dj_cookie_ok', '1');
      localStorage.setItem('dj_seen_release', '99.0.0');
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const guesses = [];
      const inc = [1, 2, 3, 5, 10, 15];
      for (let i = 0; i < n - 1; i++) {
        guesses.push({ type: 'wrong', text: 'wrong ' + (i + 1), clipLength: inc[i] });
      }
      localStorage.setItem('themedleDailyState', JSON.stringify({
        date: d, completed: false, won: false, guesses, currentGuess: n, songIndex: 0,
      }));
    } catch (e) {}
  }, guessNo);

  const p = await ctx.newPage();
  await p.goto(`${BASE}/themedle/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForFunction(() => window.DJStore && DJStore.debug().opened === true, null, { timeout: 15000 });
  await p.waitForTimeout(1200);

  const r = await p.evaluate(() => ({
    label: (document.getElementById('clipLength') || {}).textContent,
    // Empty slots carry placeholder text, so count the ones restoreGameState
    // actually marked rather than anything with characters in it.
    filled: [...document.querySelectorAll('[id^="guessSlot-"]')]
      .filter((el) => /border-(red|green|yellow)-500/.test(el.className)).length,
  }));
  check(`guess ${guessNo}: label reads "${expected}"`, r.label === expected, `got "${r.label}"`);
  check(`guess ${guessNo}: ${guessNo - 1} previous guesses still shown`,
    r.filled === guessNo - 1, `filled=${r.filled}`);
  await ctx.close();
}

await b.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
