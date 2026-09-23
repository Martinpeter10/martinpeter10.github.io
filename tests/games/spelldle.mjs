import { fetchJSON, chicagoParts, mulberry32 } from '../lib.mjs';

export const id = 'spelldle';
export const keys = ['spd_today', 'spd_stats_v2'];
export const seen = 'spd_seen_howto';

const MAX_GUESSES = 8;
const EPOCH = new Date('2026-01-01T12:00:00Z');

// Mirrors getShuffledSpellIndex in spelldle.js: a per-cycle Fisher-Yates
// shuffle seeded from the cycle number, so no repeat within a full pass.
function shuffledIndex(dayIndex, count) {
  const cycle = Math.floor((dayIndex - 1) / count);
  const pos   = (dayIndex - 1) % count;
  const rng   = mulberry32((0xABCD1234 + cycle * 0x9E3779B9) >>> 0);
  const arr   = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr[pos];
}

export async function today() {
  const spells = await fetchJSON('/assets/data/spelldle-spells.json');
  const { year, month, day } = chicagoParts();
  const local = new Date(Date.UTC(year, month - 1, day, 12));
  const dayIndex = Math.round((local - EPOCH) / 86400000) + 1;
  const answer = spells[shuffledIndex(dayIndex, spells.length)];
  // A wrong guess that is definitely not the answer.
  const wrong = spells.filter((s) => s.name !== answer.name).slice(0, MAX_GUESSES);
  return { spells, answer, wrong };
}

export async function ready(page) {
  await page.waitForSelector('#spd-input', { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function guess(page, name) {
  await page.fill('#spd-input', name);
  await page.waitForTimeout(250);          // debounce the suggestion list
  await page.click('#spd-submit-btn');
  await page.waitForTimeout(600);
}

/**
 * plan 'win'    first guess correct  -> score 1 (guesses used, lower is better)
 * plan 'win3'   two wrong then right -> score 3
 * plan 'lose'   eight wrong          -> score 9 (MAX_GUESSES + 1)
 */
export async function play(page, plan, ctx) {
  if (plan === 'win')  { await guess(page, ctx.answer.name); return; }
  if (plan === 'win3') {
    await guess(page, ctx.wrong[0].name);
    await guess(page, ctx.wrong[1].name);
    await guess(page, ctx.answer.name);
    return;
  }
  for (let i = 0; i < MAX_GUESSES; i++) await guess(page, ctx.wrong[i].name);
}

export function expect(plan) {
  if (plan === 'win')  return { score: 1, extras: { wins_total: 1 } };
  if (plan === 'win3') return { score: 3, extras: { wins_total: 1 } };
  return { score: MAX_GUESSES + 1, extras: {} };
}

export async function shownScore() { return null; }   // no single score element

export async function isComplete(page) {
  return page.evaluate(() => !!document.querySelector('#spd-results:not(.hidden), .spd-results:not(.hidden)')
    || document.getElementById('spd-input')?.disabled === true
    || !!document.querySelector('#spd-input-area.hidden'));
}
