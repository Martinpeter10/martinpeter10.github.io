import { fetchJSON, chicagoParts } from '../lib.mjs';

export const id = 'chainlink';
export const keys = ['cl_today', 'cl_stats_v2'];
export const seen = 'cl_seen_howto';

export async function today() {
  const puzzles = await fetchJSON('/assets/data/chainlink-puzzles.json');
  const { year, month, day } = chicagoParts();
  const jan1 = new Date(Date.UTC(year, 0, 1, 12));
  const now  = new Date(Date.UTC(year, month - 1, day, 12));
  const doy  = Math.round((now - jan1) / 86400000) + 1;
  const p = puzzles[(doy - 1) % puzzles.length];
  return { puzzle: p, answers: p.words.slice(1) };
}

export async function ready(page) {
  await page.waitForSelector('#cl-guess-input', { timeout: 20000 });
  await page.waitForTimeout(1200);
}

/**
 * plan 'win'  every answer first time -> 15 + 5 perfect bonus = 20
 * plan 'lose' skip everything          -> 0
 * plan 'half' solve two, then skip     -> 6
 */
export async function play(page, plan, ctx) {
  const { answers } = ctx;
  if (plan === 'lose') {
    for (let i = 0; i < answers.length; i++) {
      await page.click('#cl-skip-btn');
      await page.waitForTimeout(600);
    }
    return;
  }
  const solve = plan === 'half' ? 2 : answers.length;
  for (let i = 0; i < answers.length; i++) {
    if (i < solve) {
      await page.fill('#cl-guess-input', answers[i]);
      await page.click('#cl-submit-btn');
    } else {
      await page.click('#cl-skip-btn');
    }
    await page.waitForTimeout(650);
  }
}

export function expect(plan) {
  if (plan === 'win')  return { score: 20, extras: { perfect_total: 1 } };
  if (plan === 'half') return { score: 6,  extras: {} };
  return { score: 0, extras: {} };
}

export async function shownScore(page) {
  return page.evaluate(() => {
    const el = document.getElementById('cl-final-score');
    return el ? parseInt(el.textContent, 10) : null;
  });
}

export async function isComplete(page) {
  return page.evaluate(() => !document.getElementById('cl-results')?.classList.contains('hidden'));
}
