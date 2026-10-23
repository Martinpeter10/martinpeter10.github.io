// Two things that were wrong about the moment the session is decided.
//
// 1. NOTHING FLASHES. The leaderboards page took up to 1200ms to settle the
//    session, and the ranking footnote and period filter had no `hidden`, so
//    they painted immediately and then vanished as the sign-in bar arrived -
//    reported as "a text block that shows up and then the page fully loads".
//    Asserted by sampling the page DURING the wait, not after it, because
//    after it everything is correct either way.
//
// 2. THE PAGE REPAINTS ITSELF ON AN AUTH CHANGE. Every page reads the session
//    once at boot, so nothing re-ran when it changed later: signing out left
//    other players' standings on screen, and signing in showed no figures
//    until a manual refresh. account.js now navigates on a real transition.
//
// The navigation assertions check the URL has no fragment and that the event
// guard holds: a reload on INITIAL_SESSION or TOKEN_REFRESHED would fire on
// an ordinary page load or on a timer and pull the page out from under a
// player mid-game, which is far worse than the bug being fixed.

import { launch, argOf } from './lib.mjs';

const BASE = argOf('base', 'https://dev.dailyjamm.com');

let pass = 0;
const fails = [];
const ok = () => { pass++; };
const bad = (m) => fails.push(m);

const browser = await launch();

// ── 1. no flash of furniture while the session settles ────────────────────
{
  const page = await browser.newPage();

  // Hold the session unresolved so the "still deciding" window is observable
  // instead of a 1200ms race.
  await page.route('**/assets/js/account.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: '/* stubbed */',
  }));
  await page.addInitScript(() => {
    window.DJAccount = {
      isReady: () => false,
      username: () => null,
      // Never calls back: the page must look sane while waiting.
      whenResolved: () => {},
      open: () => {}, close: () => {},
      rpc: () => Promise.resolve({ data: [] }),
      board: () => Promise.resolve([]),
    };
  });

  await page.goto(BASE + '/leaderboards/', { waitUntil: 'domcontentloaded' });

  // Sample repeatedly across the window where the flash used to happen.
  const seen = { foot: false, filter: false, cta: false };
  for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => {
      const vis = (el) => !!el && el.getBoundingClientRect().height > 0;
      return {
        foot:   vis(document.querySelector('.lb-foot')),
        filter: vis(document.getElementById('lb-filter')),
        cta:    vis(document.getElementById('lb-signedout')),
      };
    });
    seen.foot   = seen.foot   || s.foot;
    seen.filter = seen.filter || s.filter;
    seen.cta    = seen.cta    || s.cta;
    await page.waitForTimeout(120);
  }

  if (!seen.foot) ok();
  else bad('the ranking footnote appears before the session is known - this is the flash');
  if (!seen.filter) ok();
  else bad('the period filter appears before the session is known');
  if (!seen.cta) ok();
  else bad('the sign-in bar appears before the session is known');

  // Something must hold the space, or the wait reads as a broken page.
  const txt = await page.$eval('#lb-grid', (e) => e.textContent.trim());
  if (txt.length) ok();
  else bad('nothing at all is shown while the session settles - reads as broken');

  await page.close();
}

// ── 2. an auth change repaints the page ───────────────────────────────────
// account.js is the real module here. Its client is replaced so the auth
// callback can be fired by hand; everything downstream of that is real code.
async function authPage(browser) {
  const page = await browser.newPage();
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });

  // The vendored bundle defines window.supabase and loads AFTER any init
  // script, so it would overwrite the fake client and leave the auth callback
  // unwired - which looks exactly like "the code does not reload". Serve the
  // stub in its place instead.
  await page.route('**/assets/js/vendor/supabase.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: 'void 0;',
  }));

  await page.addInitScript(() => {
    let cb = null;
    window.__fireAuth = (event, session) => cb && cb(event, session);
    const fakeClient = {
      auth: {
        onAuthStateChange: (fn) => { cb = fn; return { data: { subscription: { unsubscribe() {} } } }; },
        getSession: () => Promise.resolve({ data: { session: null } }),
        signOut: () => Promise.resolve({}),
        signInWithOAuth: () => Promise.resolve({}),
      },
      from: () => ({
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { username: 'Tester' } }) }),
      }),
      rpc: () => Promise.resolve({ data: [] }),
    };
    window.supabase = { createClient: () => fakeClient };
  });

  await page.goto(BASE + '/leaderboards/', { waitUntil: 'load' });
  await page.waitForTimeout(1600);
  navs.length = 0;                     // ignore the initial load
  return { page, navs };
}

// Each transition gets a FRESH page. Firing several events down one page
// leaves module state from the earlier ones - an INITIAL_SESSION followed by a
// SIGNED_IN is a different code path from a plain sign-in, and reusing the page
// made a passing fix look broken.
{
  // Events that must NOT navigate. INITIAL_SESSION fires on every ordinary
  // load and TOKEN_REFRESHED fires on a timer.
  for (const ev of ['INITIAL_SESSION', 'TOKEN_REFRESHED']) {
    const { page, navs } = await authPage(browser);
    await page.evaluate((e) => window.__fireAuth(e, { user: { id: 'u1' } }), ev);
    await page.waitForTimeout(1200);
    if (navs.length === 0) ok();
    else bad(`${ev} navigated the page - it fires on an ordinary load or on a `
             + 'timer and would interrupt a player mid-game');
    await page.close();
  }
}

{
  // The ordinary case: signed out, then signs in.
  const { page, navs } = await authPage(browser);
  await page.evaluate(() => window.__fireAuth('SIGNED_IN', { user: { id: 'u1' } }));
  await page.waitForTimeout(1800);
  if (navs.length > 0) ok();
  else bad('SIGNED_IN did not repaint the page - the player still has to refresh by hand');
  if (navs.every((u) => !u.includes('#'))) ok();
  else bad(`navigated to a URL still carrying a fragment (${navs.join(', ')}) - `
           + 'the OAuth hash would be re-parsed and loop');
  await page.close();
}

{
  // Account SWITCH. A session and profile already exist, so the "nothing new
  // to do" short-circuit used to swallow this and leave the previous player's
  // figures on screen - the shared-computer leak, arriving by a different door.
  const { page, navs } = await authPage(browser);
  await page.evaluate(() => window.__fireAuth('INITIAL_SESSION', { user: { id: 'u1' } }));
  await page.waitForTimeout(1200);
  navs.length = 0;
  await page.evaluate(() => window.__fireAuth('SIGNED_IN', { user: { id: 'u2' } }));
  await page.waitForTimeout(1800);
  if (navs.length > 0) ok();
  else bad('a SIGNED_IN for a different account did not repaint - the previous '
           + "player's stats stay on screen");
  await page.close();
}

{
  const { page, navs } = await authPage(browser);
  await page.evaluate(() => window.__fireAuth('SIGNED_OUT', null));
  await page.waitForTimeout(1800);
  if (navs.length > 0) ok();
  else bad('SIGNED_OUT did not repaint the page - standings stay on screen after '
           + 'signing out, including when the sign-out happened in another tab');
  await page.close();
}

await browser.close();
console.log(`authpaint.mjs  ${pass} passed, ${fails.length} failed`);
fails.forEach((f) => console.log('  FAIL ' + f));
process.exit(fails.length ? 1 : 0);
