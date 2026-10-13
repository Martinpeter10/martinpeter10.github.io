// The curated "Our Favorite Games" list, checked for agreement.
//
//   node curated.mjs
//
// No browser and no credentials - it reads the repo. The list lives in THREE
// places that drift apart silently: the home page cards, the drawer nav on
// all 16 pages, and the SITES catalog in favorites.js. A game missing from
// the catalog cannot be favourited; a game missing from one page's nav is
// invisible from that page; a stale nav entry is a dead link.
//
// Ordering matters too: the list is alphabetical by design, and an entry
// added in the wrong place is the kind of thing nobody notices for months.

import fs from 'fs';
import path from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

// ── the three sources ────────────────────────────────────────────────────
const home = read('index.html');

const cardIds = [...home.matchAll(/data-fav-id="([a-z|]+)"/g)].map((m) => m[1]);
const ourGames = ['themedle', 'chainlink', 'blackjackdle', 'spelldle', 'roulettedle',
                  'holdle', 'liarsdice', 'netzero', 'shutthebox', 'yachtdle'];
const curatedCards = cardIds.filter((id) => !ourGames.includes(id));

const fav = read('assets/js/favorites.js');
const sites = [...fav.matchAll(/^\s{4}([a-z]+):\s*\{ title: '([^']+)',\s*url: '([^']+)'(, ext: true)?/gm)]
  .map((m) => ({ id: m[1], title: m[2], url: m[3], ext: !!m[4] }));
const external = sites.filter((s) => s.ext);

// ── 1. every curated card is in the catalog, and vice versa ──────────────
const catalogIds = external.map((s) => s.id).sort();
check('every curated card has a catalog entry',
  curatedCards.every((id) => catalogIds.includes(id)),
  curatedCards.filter((id) => !catalogIds.includes(id)).join(','));
check('every external catalog entry has a card',
  catalogIds.every((id) => curatedCards.includes(id)),
  catalogIds.filter((id) => !curatedCards.includes(id)).join(','));

// ── 2. the cards are in alphabetical order ───────────────────────────────
const titleOf = {};
external.forEach((s) => { titleOf[s.id] = s.title; });
const cardTitles = curatedCards.map((id) => titleOf[id] || id);
const sorted = [...cardTitles].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
check('curated cards are alphabetical',
  JSON.stringify(cardTitles) === JSON.stringify(sorted),
  `got ${cardTitles.join(', ')}`);

// ── 3. every page's nav matches the catalog, in order ────────────────────
const pages = fs.readdirSync(ROOT)
  .filter((d) => fs.existsSync(path.join(ROOT, d, 'index.html')))
  .map((d) => `${d}/index.html`)
  .concat(['index.html'])
  .filter((p) => read(p).includes('Our Favorite Games'))
  .sort();

check('every page with the drawer was found', pages.length >= 15, `${pages.length} pages`);

const wantUrls = external.map((s) => s.url);
let navOk = 0;
for (const p of pages) {
  const src = read(p);
  const navUrls = [...src.matchAll(/class="menu-link" href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  if (JSON.stringify(navUrls) === JSON.stringify(wantUrls)) { navOk++; continue; }
  const missing = wantUrls.filter((u) => !navUrls.includes(u));
  const extra = navUrls.filter((u) => !wantUrls.includes(u));
  check(`${p}: nav matches the catalog`, false,
    `missing=[${missing.join(' ')}] extra=[${extra.join(' ')}] orderDiffers=${!missing.length && !extra.length}`);
}
check(`all ${pages.length} pages' navs match the catalog exactly`, navOk === pages.length,
  `${navOk}/${pages.length}`);

// ── 4. nothing removed is still linked anywhere ──────────────────────────
const GONE = ['contexto.me', 'linxicon.com', 'puzzles/spelling-bee'];
const stale = [];
for (const p of pages) {
  const src = read(p);
  GONE.forEach((g) => { if (src.includes(g)) stale.push(`${p}:${g}`); });
}
GONE.forEach((g) => { if (fav.includes(g)) stale.push(`favorites.js:${g}`); });
check('no links to removed games remain', stale.length === 0, stale.join(' '));

// ── 5. every card has a description and an icon ──────────────────────────
const cardBlocks = [...home.matchAll(/<article class="card" data-fav-id="([a-z|]+)"[\s\S]*?<\/article>/g)];
const noDesc = [], noIcon = [];
cardBlocks.forEach((m) => {
  const id = m[1];
  if (ourGames.includes(id)) return;
  const b = m[0];
  const desc = /<p>([^<]*)<\/p>/.exec(b);
  if (!desc || desc[1].trim().length < 8) noDesc.push(id);
  if (!/<svg[\s\S]*?<\/svg>/.test(b)) noIcon.push(id);
});
check('every curated card has a real description', noDesc.length === 0, noDesc.join(','));
check('every curated card has an icon', noIcon.length === 0, noIcon.join(','));

// ── 6. no em dashes in the new copy (house style) ────────────────────────
const emDash = cardBlocks.filter((m) => /<p>[^<]*—[^<]*<\/p>/.test(m[0])).map((m) => m[1]);
check('no em dashes in card descriptions', emDash.length === 0, emDash.join(','));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
