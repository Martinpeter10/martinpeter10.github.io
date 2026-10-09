// BlackJackdle.
//
// NOT date-seeded: the deck is shuffled with Math.random(), and the daily chip
// bonus is random too. So unlike Chain Link or Spelldle, the test cannot
// predict an outcome.
//
// It therefore asserts the thing that actually matters for these games -
// SCREEN MATCHES DATABASE. Whatever the cards did, the session net shown to
// the player must be the score stored, the final stack must be the chips
// stored, and the day must be marked complete. That is precisely the wiring
// that was never verified, and where a wrong sign would quietly cost a player
// real winnings.

export const id = 'blackjackdle';
export const keys = ['bj_today', 'bj_chips', 'bj_bonus_date', 'bj_stats_v2', 'bj_alltime_v2'];
export const seen = 'bj_seen_howto';
export const seeded = false;
export const HANDS = 3;

export async function today() { return {}; }

export async function ready(page) {
  await page.waitForSelector('#bj-bet-area', { timeout: 20000 });
  await page.waitForTimeout(1500);
}

/** Dismiss the daily-bonus welcome if it is showing. */
async function clearOverlays(page) {
  for (const sel of ['#bj-welcome-ok', '#bj-welcome button', '.bj-welcome button']) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) { await el.click(); await page.waitForTimeout(500); return; }
  }
  // Some builds dismiss on any click inside the overlay.
  const ov = await page.$('#bj-welcome:not(.hidden)');
  if (ov) { await page.keyboard.press('Enter'); await page.waitForTimeout(500); }
}

async function playOneHand(page, bet = 10) {
  await clearOverlays(page);
  await page.waitForSelector('#bj-bet-area:not(.hidden)', { timeout: 15000 });

  await page.click(`.bj-bet-chip[data-amount="${bet}"]`);
  await page.waitForTimeout(250);
  await page.click('#bj-bet-deal');
  await page.waitForTimeout(1800);           // dealing animation

  // Stand immediately. The simplest legal action, and it keeps the test about
  // wiring rather than about playing well.
  for (let i = 0; i < 3; i++) {
    const stand = await page.$('#bj-btn-stand');
    if (stand && await stand.isVisible() && await stand.isEnabled()) {
      await stand.click();
      break;
    }
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2600);           // dealer plays out + hand result
}

export async function play(page, plan) {
  const bet = plan === 'bigbet' ? 100 : 10;
  for (let h = 0; h < HANDS; h++) {
    const done = await page.$('#bj-results:not(.hidden), #bj-broke:not(.hidden)');
    if (done) break;                          // went broke early
    await playOneHand(page, bet);
  }
  await page.waitForTimeout(1500);
}

/** What the player was shown. The database must agree with exactly this. */
export async function screen(page) {
  return page.evaluate(() => {
    const num = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const n = parseInt(String(el.textContent).replace(/[^0-9-]/g, ''), 10);
      return isNaN(n) ? null : n;
    };
    const netEl = document.getElementById('bj-session-net');
    let net = null;
    if (netEl) {
      const m = String(netEl.textContent).match(/-?\d[\d,]*/);
      if (m) net = parseInt(m[0].replace(/,/g, ''), 10);
      if (net !== null && /^\s*-/.test(netEl.textContent) && net > 0) net = -net;
    }
    const broke = !document.getElementById('bj-broke')?.classList.contains('hidden');
    return {
      finalChips: num('bj-final-chips') ?? num('bj-chips'),
      liveChips: num('bj-chips'),
      net,
      broke,
      finished: broke || !document.getElementById('bj-results')?.classList.contains('hidden'),
    };
  });
}

export async function isComplete(page) {
  return (await screen(page)).finished;
}

export async function shownScore() { return null; }
export function expect() { return { score: null, extras: {} }; }
