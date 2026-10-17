// The release bell glows until the player acknowledges it.
//
//   node bell.mjs
//   node bell.mjs --base https://tst.dailyjamm.com
//
// ONE rule: glow unless dj_seen_release already equals the shipped version.
//
// It used to also guess whether a browser looked "new" - no cookie consent, no
// favorites, no stats - and quietly mark the release seen for those, to avoid
// announcing news that predated them. That silently opted out anyone on a
// fresh browser, a cleared profile or a new device, and because it wrote the
// flag on that first load the glow never came back even once they started
// playing. Reported from a real tst visit. Nothing is inferred now.

import { chromium } from 'playwright';
const argOf = (n,d) => { const i = process.argv.indexOf('--'+n); return i===-1?d:process.argv[i+1]; };
const BASE = argOf('base', 'https://dev.dailyjamm.com');

let pass = 0, fail = 0;
const check = (l, ok, d) => { if (ok) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}${d?' :: '+d:''}`); } };

const b = await chromium.launch({ channel:'chrome', headless:true });

async function state(seed) {
  const ctx = await b.newContext({ viewport:{width:420,height:900} });
  // Seed ONCE - addInitScript runs on every navigation, and clearing on a
  // reload would hide exactly the persistence this test is about.
  await ctx.addInitScript((s) => {
    try {
      if (sessionStorage.getItem('__seeded')) return;
      localStorage.clear();
      Object.keys(s).forEach(k => localStorage.setItem(k, s[k]));
      sessionStorage.setItem('__seeded','1');
    } catch(e){}
  }, seed);
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil:'domcontentloaded', timeout:30000 });
  await p.waitForTimeout(1800);
  return { ctx, p };
}
const read = (p) => p.evaluate(() => ({
  glow: !!document.getElementById('dj-bell-btn')?.classList.contains('has-news'),
  seen: localStorage.getItem('dj_seen_release'),
  version: window.DJNotify && DJNotify.version,
}));

console.log(`\nrelease bell  ${BASE}\n`);

// Everyone who has not acknowledged this release sees it - including the
// brand-new visitor, which is the case that used to be suppressed.
for (const [label, seed] of [
  ['brand-new visitor (empty storage)', {}],
  ['returning player (cookie consent)', { dj_cookie_ok:'1' }],
  ['returning player (has stats)',      { td_stats_v2:'{"gamesPlayed":9}' }],
  ['saw an OLDER release',              { dj_seen_release:'3.4.0' }],
]) {
  const { ctx, p } = await state(seed);
  const r = await read(p);
  check(`${label}: glows`, r.glow === true, JSON.stringify(r));
  check(`${label}: not auto-marked as seen`, r.seen !== r.version, `seen=${r.seen}`);
  await ctx.close();
}

// Already acknowledged -> quiet.
{
  const { ctx, p } = await state({ dj_seen_release:'3.5.0' });
  const r = await read(p);
  check('already acknowledged: stays quiet', r.glow === false, JSON.stringify(r));
  await ctx.close();
}

// Acknowledging stops it, and it stays stopped across a reload.
{
  const { ctx, p } = await state({});
  const before = await read(p);
  check('before acknowledging: glowing', before.glow === true);
  await p.evaluate(() => document.getElementById('dj-bell-btn').click());
  await p.waitForTimeout(500);
  const after = await read(p);
  check('clicking the bell acknowledges it',
    after.glow === false && after.seen === after.version, JSON.stringify(after));
  await p.reload({ waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1800);
  const later = await read(p);
  check('still quiet after a reload', later.glow === false, JSON.stringify(later));
  await ctx.close();
}

await b.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
