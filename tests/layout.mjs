// Layout sanity across every page, at the narrowest phone and at desktop.
//
//   node final.mjs
//
// What it actually catches: a control pushed outside the viewport where it
// cannot be tapped. Holdle hit this - it carries a sixth header control (its
// opponent guide) on top of the five every game now has, and at 375px the
// account button sat 9px off the right edge.
//
// Elements inside a deliberately side-scrolling container are NOT flagged.
// Spelldle's 9-attribute grid and BlackJackdle's table both overflow on
// purpose, identically on production, so flagging them would be noise that
// trains you to ignore the output.
import { chromium } from 'playwright';
const B = 'https://dev.dailyjamm.com';
const PAGES = ['', 'leaderboards', 'about', 'releases', 'terms', 'privacy',
  'themedle','chainlink','spelldle','blackjackdle','roulettedle','holdle',
  'liarsdice','netzero','shutthebox','yachtdle'];
let bad = 0;
const b = await chromium.launch({ channel: 'chrome', headless: true });
// 375px is the tightest real phone, and CLAUDE.md notes the header is tight there.
for (const [w,h,label] of [[375,812,'iPhone-ish 375'],[1280,800,'desktop']]) {
  console.log(`\n  ${label}`);
  const ctx = await b.newContext({ viewport:{width:w,height:h} });
  await ctx.addInitScript(() => { try {
    localStorage.setItem('dj_cookie_ok','1'); localStorage.setItem('dj_seen_release','99.0.0');
    localStorage.setItem('dj_seen_favs_intro','1');
    ['td','cl','spd','bj','rl','hd','bf','sb','stb','yc'].forEach(p=>localStorage.setItem(p+'_seen_howto','1'));
  } catch(e){} });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(`${B}/${path}${path?'/':''}`, { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({
      // Horizontal overflow is the classic phone bug.
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Anything VISIBLE poking outside the viewport. The closed drawer is
      // parked off-canvas on purpose, so an off-screen rect alone proves
      // nothing - what matters is whether a player can see it there.
      wide: [...document.querySelectorAll('body *')].filter(el => {
        if (el.closest('#drawer, .backdrop, .dj-acct-modal, .dj-acct-backdrop')) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
        if (el.offsetParent === null && cs.position !== 'fixed') return false;
        // Inside something the player can scroll sideways on purpose? Then
        // being off-screen is the design, not a bug - Spelldle's 9-attribute
        // grid and BlackJackdle's table both do this, on prod as well as here.
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (a.scrollWidth > a.clientWidth + 2) return false;
          if (a === document.body) break;
        }
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && (b.right > window.innerWidth + 2 || b.left < -2);
      }).slice(0,3).map(el => el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:'')),
      // Header controls must sit inside the viewport at phone width.
      hdrRight: (() => {
        const b = document.getElementById('dj-account-btn');
        return b ? Math.round(window.innerWidth - b.getBoundingClientRect().right) : null;
      })(),
      header: !!document.querySelector('header.site-header'),
    }));
    const ok = r.overflow <= 1 && r.wide.length === 0 && r.header && (r.hdrRight === null || r.hdrRight >= 0);
    if (!ok) bad++;
    console.log(`    ${ok?'ok  ':'FAIL'} ${(path||'(home)').padEnd(13)} overflow=${r.overflow}px acctGap=${r.hdrRight}px ${r.wide.length?'wide='+r.wide.join(','):''}`);
  }
  await ctx.close();
}
await b.close();
console.log(`\n  ${bad===0?'no layout overflow anywhere':bad+' page/size combos overflow'}`);
process.exit(bad?1:0);
