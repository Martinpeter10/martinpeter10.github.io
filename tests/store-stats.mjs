// The stats contract in store.js, checked against stubs.
//
//   node store-stats.mjs
//
// No browser and no credentials, which is the point: stats.mjs proves the real
// round trip but needs SB_TOKEN and a dev deploy, so it is the suite that does
// not get run. This one runs anywhere and covers the branches that matter -
// hydrate, seed-up-once, server-wins, coalescing, sign-out, and every failure
// path that must still open the gate.
//
// store.js is loaded into a vm context where `window` IS the context, because
// that is how a browser has it: the file writes window.DJStore and reads a bare
// DJAccount, and they have to be the same object for either to resolve.
//
// Two [DJStore] warnings in the output are expected - cases 10 and 11 make the
// RPC reject on purpose.
import fs from 'fs';
import vm from 'vm';

const HERE = new URL('.', import.meta.url).pathname;
const src = fs.readFileSync(HERE + '../assets/js/store.js', 'utf8');

/**
 * @param path      location.pathname
 * @param signedIn  what DJAccount.signedIn() reports
 * @param server    the get_game_state payload (null = reject the fetch)
 * @param prime     localStorage contents BEFORE store.js runs
 * @param failStats make save_game_stats reject
 */
function env({ path, signedIn, server, prime = {}, failStats = false }) {
  const store = new Map(Object.entries(prime).map(([k, v]) => [k, JSON.stringify(v)]));
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const rpcs = [];
  const ctx = {
    localStorage: ls, location: { pathname: path }, console,
    setTimeout, clearTimeout, Promise, JSON, Object, Array, Error,
    document: {
      readyState: 'complete', addEventListener() {}, getElementById: () => null,
      createElement: () => ({ setAttribute() {}, appendChild() {}, remove() {}, style: {} }),
      body: { appendChild() {} }, documentElement: { appendChild() {} },
    },
  };
  ctx.window = ctx;            // in a browser these are the same object
  ctx.globalThis = ctx;
  ctx.DJAccount = {
    whenResolved: (fn) => fn(),
    signedIn: () => signedIn,
    rpc: (name, args) => {
      rpcs.push({ name, args });
      if (name === 'get_game_state') {
        return server ? Promise.resolve({ data: server })
                      : Promise.reject(new Error('fetch failed'));
      }
      if (name === 'save_game_stats' && failStats) return Promise.reject(new Error('network down'));
      return Promise.resolve({ data: { saved: true } });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const get = (k) => { const v = ls.getItem(k); return v === null ? null : JSON.parse(v); };
  return { ctx, ls, get, rpcs, DJStore: () => ctx.DJStore,
           statsWrites: () => rpcs.filter((r) => r.name === 'save_game_stats') };
}

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? ' :: ' + detail : '')); }
};
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const HD_BLOB = {
  hd_stats_v2:    { played: 5, best: 3, streak: 1 },
  hd_alltime_v2:  { biggestWin: 820, biggestLoss: -400, totalNet: 310 },
  hd_ai_stats_v3: { 0: { w: 2, l: 1, f: 0, af: 1 } },
};

console.log('\nstore.js stats contract\n');

// 1. The reported bug, as a check: a second device must receive the account's stats.
{
  const e = env({ path: '/holdle/', signedIn: true,
    server: { signed_in: true, state: null, chips: 1200, bonus_day: null, stats: HD_BLOB } });
  await tick();
  check('hydrate: all three stats keys written',
    e.get('hd_stats_v2')?.played === 5 && e.get('hd_alltime_v2')?.totalNet === 310 &&
    e.get('hd_ai_stats_v3')?.['0']?.w === 2,
    JSON.stringify([e.get('hd_stats_v2'), e.get('hd_alltime_v2'), e.get('hd_ai_stats_v3')]));
  check('hydrate: no seed sent when the account already has stats',
    e.statsWrites().length === 0, JSON.stringify(e.statsWrites()));
  check('hydrate: gate opened', e.DJStore().debug().opened === true);
  check('hydrate: debug reports the blob', !!e.DJStore().debug().local.stats);
}

// 2. A key the account does not have must not survive locally.
{
  const e = env({ path: '/holdle/', signedIn: true,
    prime: { hd_alltime_v2: { totalNet: 999 } },
    server: { signed_in: true, state: null, chips: null, bonus_day: null,
              stats: { hd_stats_v2: { played: 2 } } } });
  await tick();
  check('hydrate: key absent from the account is cleared locally',
    e.get('hd_alltime_v2') === null, JSON.stringify(e.get('hd_alltime_v2')));
  check('hydrate: key present is written', e.get('hd_stats_v2')?.played === 2);
}

// 3. First sign-in with real history seeds UP rather than being discarded.
{
  const e = env({ path: '/chainlink/', signedIn: true,
    prime: { cl_stats_v2: { played: 7, best: 4, streak: 2 } },
    server: { signed_in: true, state: null, chips: null, bonus_day: null, stats: null } });
  await tick();
  const w = e.statsWrites();
  check('seed: one save_game_stats sent', w.length === 1, JSON.stringify(w));
  check('seed: sent with p_merge true', w[0]?.args.p_merge === true, JSON.stringify(w[0]?.args));
  check('seed: carried the local blob', w[0]?.args.p_stats.cl_stats_v2.played === 7);
  check('seed: local stats not wiped', e.get('cl_stats_v2')?.played === 7);
}

// 4. A fresh install must not push zeros over another device's history.
{
  const e = env({ path: '/chainlink/', signedIn: true,
    prime: { cl_stats_v2: { played: 0, best: 0, streak: 0 } },
    server: { signed_in: true, state: null, chips: null, bonus_day: null, stats: null } });
  await tick();
  check('fresh install: nothing seeded from a zero-play blob',
    e.statsWrites().length === 0, JSON.stringify(e.statsWrites()));
}
{
  const e = env({ path: '/chainlink/', signedIn: true,
    server: { signed_in: true, state: null, chips: null, bonus_day: null, stats: null } });
  await tick();
  check('empty browser: nothing seeded at all', e.statsWrites().length === 0);
}

// 5. Themedle names the field gamesPlayed, not played.
{
  const e = env({ path: '/themedle/', signedIn: true,
    prime: { td_stats_v2: { gamesPlayed: 4, wins: 3, currentStreak: 2 } },
    server: { signed_in: true, state: null, chips: null, bonus_day: null, stats: null } });
  await tick();
  check('seed: themedle gamesPlayed counts as history',
    e.statsWrites().length === 1, JSON.stringify(e.statsWrites()));
}

// 6. Signed out: no fetch, no write, nothing touched.
{
  const e = env({ path: '/chainlink/', signedIn: false, server: null,
    prime: { cl_stats_v2: { played: 3 } } });
  e.ctx.DJStore.saveStats();
  await tick();
  check('signed-out: no RPCs at all', e.rpcs.length === 0,
    JSON.stringify(e.rpcs.map((r) => r.name)));
  check('signed-out: local stats kept', e.get('cl_stats_v2')?.played === 3);
  check('signed-out: gate opened', e.ctx.DJStore.debug().opened === true);
}

// 7. Consecutive writes coalesce into one round trip.
{
  const e = env({ path: '/holdle/', signedIn: true,
    server: { signed_in: true, state: null, chips: 1000, bonus_day: null,
              stats: { hd_stats_v2: { played: 1 } } } });
  await tick();
  e.rpcs.length = 0;
  e.ls.setItem('hd_stats_v2', JSON.stringify({ played: 2 }));
  e.ctx.DJStore.saveStats();
  e.ls.setItem('hd_alltime_v2', JSON.stringify({ totalNet: 50 }));
  e.ctx.DJStore.saveStats();
  e.ls.setItem('hd_ai_stats_v3', JSON.stringify({ 0: { w: 1 } }));
  e.ctx.DJStore.saveStats();
  await tick(700);
  const w = e.statsWrites();
  check('coalesce: three writes became one RPC', w.length === 1, 'n=' + w.length);
  check('coalesce: the one RPC carried all three keys',
    Object.keys(w[0]?.args.p_stats || {}).length === 3, JSON.stringify(w[0]?.args.p_stats));
  check('coalesce: an overwrite, not a merge', w[0]?.args.p_merge === undefined);
}

// 8. flush() must not leave a stats write behind on a closing tab.
{
  const e = env({ path: '/chainlink/', signedIn: true,
    server: { signed_in: true, state: null, chips: null, bonus_day: null,
              stats: { cl_stats_v2: { played: 1 } } } });
  await tick();
  e.rpcs.length = 0;
  e.ls.setItem('cl_stats_v2', JSON.stringify({ played: 2 }));
  e.ctx.DJStore.saveStats();
  e.ctx.DJStore.flush();
  await tick();
  check('flush: pending stats write sent immediately', e.statsWrites().length === 1,
    JSON.stringify(e.rpcs.map((r) => r.name)));
  check('flush: sent the current value', e.statsWrites()[0]?.args.p_stats.cl_stats_v2.played === 2);
}

// 9. Sign-out must not leave the account's stats on a shared computer.
{
  const ALL = ['td_stats_v2','cl_stats_v2','spd_stats_v2','bj_stats_v2','bj_alltime_v2',
    'rl_stats_v2','rl_alltime_v2','hd_stats_v2','hd_alltime_v2','hd_ai_stats_v3','bf_stats_v2',
    'sb_stats_v2','stb_stats_v2','yc_stats_v2'];
  const prime = {};
  ALL.forEach((k) => { prime[k] = { played: 1 }; });
  prime.cl_today = { date: 'x' };
  prime.bj_chips = 1500;
  const e = env({ path: '/holdle/', signedIn: true, prime,
    server: { signed_in: true, state: null, chips: 1000, bonus_day: null, stats: null } });
  await tick();
  e.ctx.DJStore.clearLocal();
  const left = ALL.concat(['cl_today', 'bj_chips']).filter((k) => e.ls.getItem(k) !== null);
  check('clearLocal: every stats key gone', left.length === 0, left.join(','));
  check('clearLocal: stops syncing', e.ctx.DJStore.isSynced() === false);
}

// 10. Nothing about stats may break the game.
{
  const e = env({ path: '/chainlink/', signedIn: true, failStats: true,
    prime: { cl_stats_v2: { played: 7 } },
    server: { signed_in: true, state: null, chips: null, bonus_day: null, stats: null } });
  await tick();
  check('seed failure: gate still opened', e.ctx.DJStore.debug().opened === true);
  check('seed failure: local stats intact', e.get('cl_stats_v2')?.played === 7);
}
{
  const e = env({ path: '/chainlink/', signedIn: true,
    server: { signed_in: true, state: null, chips: null, bonus_day: null,
              stats: 'not-an-object' } });
  await tick();
  check('garbage blob: treated as absent, gate opens', e.ctx.DJStore.debug().opened === true);
}
{
  const e = env({ path: '/chainlink/', signedIn: true, server: null,
    prime: { cl_stats_v2: { played: 9 } } });
  await tick();
  check('fetch failure: gate opens and stats are left alone',
    e.ctx.DJStore.debug().opened === true && e.get('cl_stats_v2')?.played === 9);
}

// 11. A game page that is not a game page must do nothing.
{
  const e = env({ path: '/leaderboards/', signedIn: true,
    server: { signed_in: true, stats: HD_BLOB } });
  await tick();
  check('non-game page: no RPCs', e.rpcs.length === 0);
  check('non-game page: saveStats is a safe no-op',
    e.ctx.DJStore.saveStats() instanceof Promise);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
