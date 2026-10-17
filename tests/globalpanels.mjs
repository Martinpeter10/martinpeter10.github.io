// The "Everyone" panel renders the right SHAPE for each kind of game.
//
//   node globalpanels.mjs
//
// globalstats.mjs covers the signed-OUT case (the pitch). This covers what a
// signed-in player sees, by stubbing DJAccount and feeding fixtures shaped
// exactly like get_game_global returns. It tests the rendering, not the SQL -
// the SQL is verified directly against the database.
//
// Three shapes, because one uniform panel was wrong in two places:
//   guesses  full distribution including empty buckets, losses shown as X
//   chips    "finished up" as a share of players, plus both ends of the swing
//   default  no distribution at all - a 0-20 score chart is noise
//
// The empty buckets matter: a distribution with the zeros missing reads as
// though those scores are impossible rather than unachieved, and the bars
// stop lining up from one day to the next.

import { chromium } from 'playwright';

const argOf = (n, d) => { const i = process.argv.indexOf('--' + n); return i === -1 ? d : process.argv[i + 1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d ? ' :: ' + d : ''}`); } };

const CASES = [
  { game: 'themedle', btn: 'td-stats-btn', modal: '#td-stats-modal > div', mine: 3,
    data: { game:'themedle', kind:null, score_label:'Guesses', notable_label:'Wins',
      sort_mult:-1, plays:37, players:37, avg:3.43, notable:31, best:1, worst:7,
      dist:[{v:1,n:2,loss:false},{v:2,n:5,loss:false},{v:3,n:11,loss:false},
            {v:4,n:9,loss:false},{v:5,n:3,loss:false},{v:6,n:1,loss:false},
            {v:7,n:6,loss:true}] },
    expect: { bars: 7, hasX: true, zeroRows: 0, must: ['Players today','Wins','Average guesses'],
              mustNot: ['Finished up','Biggest win'] } },

  { game: 'spelldle', btn: 'spd-stats-btn', modal: '#spd-stats-modal > div', mine: 2,
    data: { game:'spelldle', kind:null, score_label:'Guesses', notable_label:'Wins',
      sort_mult:-1, plays:3, players:3, avg:4.33, notable:3, best:2, worst:7,
      dist:[{v:1,n:0,loss:false},{v:2,n:1,loss:false},{v:3,n:0,loss:false},
            {v:4,n:0,loss:false},{v:5,n:0,loss:false},{v:6,n:1,loss:false},
            {v:7,n:1,loss:false},{v:8,n:0,loss:false},{v:9,n:0,loss:true}] },
    expect: { bars: 9, hasX: true, zeroRows: 6, must: ['Players today','Wins'],
              mustNot: ['Finished up'] } },

  { game: 'chainlink', btn: 'cl-stats-btn', modal: '#cl-stats-modal > div', mine: null,
    data: { game:'chainlink', kind:null, score_label:'Score', notable_label:'Perfect games',
      sort_mult:1, plays:24, players:24, avg:14.2, notable:3, best:20, worst:4, dist:[] },
    expect: { bars: 0, hasX: false, zeroRows: 0,
              must: ['Players today','Perfect games','Average score','Best result'],
              mustNot: ['DISTRIBUTION','Finished up'] } },

  { game: 'blackjackdle', btn: 'bj-stats-btn', modal: '#bj-stats-modal > div', mine: null,
    data: { game:'blackjackdle', kind:'chips', score_label:'Session net',
      notable_label:'Winning days', sort_mult:1, plays:18, players:18, avg:47.5,
      notable:11, best:1240, worst:-860, dist:[] },
    expect: { bars: 0, hasX: false, zeroRows: 0,
              must: ['Players today','Finished up','Biggest win','Biggest loss','Average net',
                     '+1,240','-860','61%'],
              // "Winning days" is a lifetime phrase and must not survive into
              // a panel that only ever shows one day.
              mustNot: ['Winning days','DISTRIBUTION','Average session net'] } },
];

const b = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
console.log(`\nglobal panel shapes  ${BASE}  (signed in, stubbed)\n`);

for (const c of CASES) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 950 } });
  await ctx.addInitScript(() => { try {
    localStorage.setItem('dj_cookie_ok', '1');
    localStorage.setItem('dj_seen_release', '99.0.0');
    ['td','cl','spd','bj','rl','hd','bf','sb','stb','yc']
      .forEach((p) => localStorage.setItem(p + '_seen_howto', '1'));
    const d = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Chicago',
      year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    ['bj','rl','hd'].forEach((p) => localStorage.setItem(p + '_bonus_date', d));
  } catch (e) {} });

  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message));
  await p.goto(`${BASE}/${c.game}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForFunction(() => window.DJAccount && window.DJGlobal, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  for (const id of ['bj-daily-close','rl-daily-close','hd-daily-close']) {
    const el = await p.$('#' + id); if (el && await el.isVisible()) await el.click().catch(()=>{});
  }

  await p.evaluate((d) => {
    window.DJAccount.signedIn = () => true;
    window.DJAccount.rpc = () => Promise.resolve({ data: d });
    if (window.DJGlobal) { try { DJGlobal.invalidate(); } catch (e) {} }
  }, c.data);

  await p.click('#' + c.btn); await p.waitForTimeout(350);
  await p.evaluate(() => { const t = [...document.querySelectorAll('.dj-g-tab')]
    .find((e) => /everyone/i.test(e.textContent)); if (t) t.click(); });
  await p.waitForTimeout(800);

  const r = await p.evaluate(() => {
    const panel = document.querySelector('.dj-g-panel');
    const bars = [...panel.querySelectorAll('.dj-g-bar-row')];
    return {
      text: (panel.textContent || '').replace(/\s+/g, ' ').trim(),
      bars: bars.length,
      hasX: bars.some((b) => b.querySelector('.dj-g-key').textContent.trim() === 'X'),
      zeroRows: bars.filter((b) => b.querySelector('.dj-g-fill.is-empty')).length,
      mine: bars.filter((b) => b.querySelector('.dj-g-fill.is-mine')).length,
    };
  });

  console.log(`\n  ${c.game}`);
  check(`${c.game}: ${c.expect.bars} distribution rows`, r.bars === c.expect.bars, `got ${r.bars}`);
  check(`${c.game}: loss bucket shown as X`, r.hasX === c.expect.hasX, `got ${r.hasX}`);
  check(`${c.game}: ${c.expect.zeroRows} empty buckets kept`, r.zeroRows === c.expect.zeroRows,
    `got ${r.zeroRows}`);
  const missing = c.expect.must.filter((t) => !r.text.includes(t));
  const present = c.expect.mustNot.filter((t) => r.text.includes(t));
  check(`${c.game}: shows what it should`, missing.length === 0, 'missing: ' + missing.join(', '));
  check(`${c.game}: shows nothing it should not`, present.length === 0, 'present: ' + present.join(', '));
  check(`${c.game}: no uncaught errors`, errors.length === 0, errors.slice(0,2).join(' | '));
  await ctx.close();
}

await b.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
