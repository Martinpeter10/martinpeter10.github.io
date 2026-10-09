// DailyJamm game state: server-owned when signed in, browser-owned when not.
//
// THE CONSTRAINT THIS SOLVES
// Every game reads its state synchronously at DOMContentLoaded and paints
// immediately. A server read cannot be synchronous. Rather than rewrite ten
// games around promises, this module keeps localStorage as the working store
// and makes it a *cache* of server state: it fetches, writes localStorage, and
// only then lets the game boot.
//
// So a game changes exactly one line:
//   document.addEventListener('DOMContentLoaded', boot)   ->   DJStore.ready(boot)
//
// Signed out, nothing is fetched and the gate opens immediately - behaviour is
// identical to before any of this existed.
window.DJStore = (function () {
  'use strict';

  // Which localStorage keys belong to which game. `daily` expires at midnight;
  // chips, bonus and stats survive the rollover and live in the progress table.
  //
  // `stats` is the game's own lifetime stats modal - the numbers a player sees
  // when they tap the bar-chart button. It is a LIST because some games spread
  // theirs over several keys (Holdle keeps all-time net and per-opponent
  // records separately), and they must travel together or a device shows half
  // a history. Stored verbatim: the server does not interpret these, and they
  // never rank - leaderboards read `scores` and the structured game_stats
  // columns that submit_score computes server-side.
  var GAMES = {
    themedle:     { daily: 'themedleDailyState', stats: ['td_stats_v2'] },
    chainlink:    { daily: 'cl_today',  stats: ['cl_stats_v2'] },
    spelldle:     { daily: 'spd_today', stats: ['spd_stats_v2'] },
    blackjackdle: { daily: 'bj_today', chips: 'bj_chips', bonus: 'bj_bonus_date',
                    stats: ['bj_stats_v2', 'bj_alltime_v2'] },
    roulettedle:  { daily: 'rl_today', chips: 'rl_chips', bonus: 'rl_bonus_date',
                    stats: ['rl_stats_v2', 'rl_alltime_v2'] },
    holdle:       { daily: 'hd_today', chips: 'hd_chips', bonus: 'hd_bonus_date',
                    stats: ['hd_stats_v2', 'hd_alltime_v2', 'hd_ai_stats_v3'] },
    liarsdice:    { daily: 'bf_today',  stats: ['bf_stats_v2'] },
    netzero:      { daily: 'sb_today',  stats: ['sb_stats_v2'] },
    shutthebox:   { daily: 'stb_today', stats: ['stb_stats_v2'] },
    yachtdle:     { daily: 'yc_today',  stats: ['yc_stats_v2'] }
  };

  var PATHS = {
    '/themedle/': 'themedle', '/chainlink/': 'chainlink', '/spelldle/': 'spelldle',
    '/blackjackdle/': 'blackjackdle', '/roulettedle/': 'roulettedle', '/holdle/': 'holdle',
    '/liarsdice/': 'liarsdice', '/netzero/': 'netzero', '/shutthebox/': 'shutthebox',
    '/yachtdle/': 'yachtdle'
  };

  var WRITE_DEBOUNCE = 2500;   // a game calls save() after every move

  var gameId = PATHS[location.pathname] || null;
  var keys = gameId ? GAMES[gameId] : null;
  var opened = false;          // has the gate released
  var waiting = [];
  var synced = false;          // is the server authoritative this session
  var pending = null;          // debounced payload
  var timer = null;

  function log(msg, extra) {
    if (window.console && console.warn) console.warn('[DJStore] ' + msg, extra || '');
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ── The gate ─────────────────────────────────────────────────────────────

  var loaderTimer = null;

  /**
   * Only shown if the gate is still closed after a moment. A signed-in player
   * on a fast connection should never see it; one on a slow connection should
   * not be left staring at a blank board wondering if the game is broken.
   */
  function showLoader() {
    if (document.getElementById('dj-store-loading')) return;
    var el = document.createElement('div');
    el.id = 'dj-store-loading';
    el.className = 'dj-store-loading';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    var dot = document.createElement('span');
    dot.className = 'dj-store-spin';
    dot.setAttribute('aria-hidden', 'true');
    var txt = document.createElement('span');
    txt.textContent = 'Loading your game...';
    el.appendChild(dot);
    el.appendChild(txt);
    (document.body || document.documentElement).appendChild(el);
  }

  function hideLoader() {
    clearTimeout(loaderTimer);
    loaderTimer = null;
    var el = document.getElementById('dj-store-loading');
    if (el) el.remove();
  }

  function open() {
    if (opened) return;
    opened = true;
    hideLoader();
    var fns = waiting; waiting = [];
    fns.forEach(function (fn) {
      try { fn(); } catch (e) { log('boot callback threw', e); }
    });
  }

  /**
   * Run fn once state is settled. Replaces DOMContentLoaded in each game.
   * Guaranteed to fire on every path - signed out, offline, or error - because
   * a gate that can fail to open means a game that never starts.
   */
  function ready(fn) {
    if (opened) { setTimeout(fn, 0); return; }
    waiting.push(fn);
  }

  // ── Hydration ────────────────────────────────────────────────────────────

  function hydrate() {
    // Not a game page, or a game we do not track: nothing to do.
    if (!gameId || !keys) { open(); return; }

    if (!window.DJAccount || !DJAccount.whenResolved) { open(); return; }

    // Last-resort net. Everything below is written to always resolve, but a
    // gate that fails to open is a permanently blank game - the single worst
    // outcome in this design - so it gets a backstop regardless.
    setTimeout(function () {
      if (!opened) { log('gate backstop fired; booting from local state'); open(); }
    }, 8000);

    DJAccount.whenResolved(function () {
      if (!DJAccount.signedIn || !DJAccount.signedIn()) { open(); return; }

      // Signed in means a round trip before the board can paint. Say so, but
      // only if it actually takes long enough to notice.
      loaderTimer = setTimeout(showLoader, 400);

      // Guard against a hung request holding the board blank forever. Opening
      // late with local state is far better than never opening.
      var released = false;
      var bail = setTimeout(function () {
        if (released) return;
        released = true;
        log('state fetch timed out; falling back to local');
        open();
      }, 6000);

      fetchState(function () { if (!released) { released = true; clearTimeout(bail); } open(); });
    });
  }

  /**
   * Fetch and apply, retrying once on failure. A first-attempt failure used to
   * leave the page local-only until reload, with every subsequent write
   * silently dropped - the gate opens either way, so a retry costs nothing the
   * player can see.
   */
  function fetchState(done, attempt) {
    attempt = attempt || 1;
    DJAccount.rpc('get_game_state', { p_game: gameId }).then(function (res) {
      if (res && res.error) throw res.error;
      applyServerState(res && res.data);
      done();
    }).catch(function (err) {
      log('get_game_state failed (attempt ' + attempt + ')', err);
      if (attempt < 3) {
        done();                                   // never hold the gate on a retry
        setTimeout(function () { fetchState(function () {}, attempt + 1); }, 1500 * attempt);
      } else {
        done();
      }
    });
  }

  /**
   * Server wins. Nothing merges - an imported local chip stack can be whatever
   * devtools says it is, so a player signing in starts from base values.
   */
  function applyServerState(d) {
    if (!d || !d.signed_in) return;
    synced = true;

    if (d.state) {
      lsSet(keys.daily, JSON.stringify(d.state));
    } else {
      // Server has nothing for today. Clear local so a second device cannot
      // resurrect a day this account has not started.
      lsDel(keys.daily);
    }

    if (keys.chips) {
      if (d.chips === null || typeof d.chips === 'undefined') {
        // Never played signed in. Drop the browser stack and let the game seed
        // its own starting chips, which it does when the key is absent.
        lsDel(keys.chips);
      } else {
        lsSet(keys.chips, JSON.stringify(d.chips));
      }
    }

    if (keys.bonus) {
      if (d.bonus_day) lsSet(keys.bonus, d.bonus_day);
      else lsDel(keys.bonus);
    }

    applyServerStats(d.stats);
  }

  // ── Lifetime stats ───────────────────────────────────────────────────────
  //
  // The gap this closes: signing in adopted today's board, the chip stack and
  // the daily bonus, but not the game's own stats modal. A player who played
  // on a desktop and signed in on a phone was correctly told they had already
  // played today, and then shown an empty stats modal.
  //
  // Stats are the ONE piece of state that is seeded from the browser rather
  // than reset. Chips are discarded on first sign-in because an imported
  // stack is unverifiable winnings; a games-played count is not a reward, and
  // throwing away a player's whole history the moment they create an account
  // is a worse answer than carrying it forward. So: if the account has no
  // stats for this game and this browser has real ones, they become the
  // account's. After that the server wins, with no merging - the same rule as
  // everything else here.

  /** The blob of every tracked stats key currently in this browser. */
  function collectStats() {
    if (!keys || !keys.stats) return null;
    var blob = {};
    var any = false;
    keys.stats.forEach(function (k) {
      var raw = lsGet(k);
      if (!raw) return;
      try { blob[k] = JSON.parse(raw); any = true; } catch (e) {}
    });
    return any ? blob : null;
  }

  /**
   * Has this browser actually played, or is it just holding default objects?
   * Games differ on the field name, and nothing else in the blob reliably
   * distinguishes "never played" from "played zero times".
   */
  function hasHistory(blob) {
    if (!blob) return false;
    return Object.keys(blob).some(function (k) {
      var s = blob[k];
      if (!s || typeof s !== 'object') return false;
      return (typeof s.played === 'number' && s.played > 0) ||
             (typeof s.gamesPlayed === 'number' && s.gamesPlayed > 0);
    });
  }

  function applyServerStats(remote) {
    if (!keys || !keys.stats) return;

    if (!remote || typeof remote !== 'object') {
      // The account has nothing for this game. Hand this browser's history to
      // it, once. p_merge makes the server refuse if another device got there
      // first, so a freshly installed phone cannot blank a desktop's numbers.
      var mine = collectStats();
      if (hasHistory(mine)) {
        DJAccount.rpc('save_game_stats', { p_game: gameId, p_stats: mine, p_merge: true })
          .catch(function (err) { log('seeding stats failed', err); });
      }
      return;
    }

    // Server wins. A tracked key absent from the blob is absent from the
    // account, so it goes - otherwise a second device keeps showing numbers
    // the account does not have.
    keys.stats.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(remote, k)) {
        lsSet(k, JSON.stringify(remote[k]));
      } else {
        lsDel(k);
      }
    });
  }

  /**
   * Mirror the stats modal to the account. Called by each game right after it
   * writes its stats key.
   *
   * Barely debounced: a game writes its stats once, at the end, but several
   * write two or three keys in consecutive statements (Holdle writes the
   * session stats, the all-time net and the head-to-head record). The short
   * window turns those into one round trip; anything longer would risk losing
   * the write on a game that ends and is immediately closed.
   */
  var statsDirty = false;
  var statsTimer = null;

  function saveStats() {
    if (!synced || !keys || !keys.stats) return Promise.resolve(null);
    statsDirty = true;
    clearTimeout(statsTimer);
    statsTimer = setTimeout(flushStats, 400);
    return Promise.resolve(null);
  }

  function flushStats() {
    clearTimeout(statsTimer);
    statsTimer = null;
    if (!statsDirty || !synced) return Promise.resolve(null);
    statsDirty = false;
    var blob = collectStats();
    if (!blob) return Promise.resolve(null);
    return DJAccount.rpc('save_game_stats', { p_game: gameId, p_stats: blob })
      .then(function (res) {
        if (res && res.error) log('save_game_stats failed', res.error);
        return res;
      })
      .catch(function (err) { log('save_game_stats threw', err); return null; });
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  function push(payload) {
    if (!synced || !window.DJAccount || !DJAccount.rpc) return Promise.resolve(null);
    var body = { p_game: gameId };
    if (payload.state !== undefined)    body.p_state = payload.state;
    if (payload.complete !== undefined) body.p_complete = payload.complete;
    if (payload.chips !== undefined)    body.p_chips = payload.chips;
    if (payload.bonusDay !== undefined) body.p_bonus_day = payload.bonusDay;

    return DJAccount.rpc('save_game_state', body).then(function (res) {
      if (res && res.error) log('save_game_state failed', res.error);
      return res;
    }).catch(function (err) { log('save_game_state threw', err); return null; });
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    flushStats();                       // a pending stats write must not outlive the tab
    if (!pending) return Promise.resolve(null);
    var p = pending; pending = null;
    return push(p);
  }

  /**
   * Mirror a state change to the server. Debounced, because games call their
   * save function after every card, tile and guess - mirroring each would be
   * dozens of round trips per session for no benefit.
   *
   * Pass { now: true } for changes that must not be lost: completion, and any
   * chip movement.
   */
  var warnedUnsynced = false;

  function save(opts) {
    if (!synced) {
      // Signed in but unhydrated means every write is silently dropped and the
      // player's progress quietly diverges from their account. Say so once.
      if (window.DJAccount && DJAccount.signedIn && DJAccount.signedIn() && !warnedUnsynced) {
        warnedUnsynced = true;
        log('signed in but NOT synced - writes are being dropped. Hydration failed earlier this page load.');
      }
      return Promise.resolve(null);
    }
    opts = opts || {};

    pending = pending || {};
    if (opts.state !== undefined)    pending.state = opts.state;
    if (opts.complete !== undefined) pending.complete = opts.complete;
    if (opts.chips !== undefined)    pending.chips = opts.chips;
    if (opts.bonusDay !== undefined) pending.bonusDay = opts.bonusDay;

    if (opts.now || opts.complete || opts.chips !== undefined) return flush();

    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DEBOUNCE);
    return Promise.resolve(null);
  }

  /** Convenience: mirror whatever the game just wrote to its daily key. */
  function saveDaily(complete) {
    if (!synced || !keys) return Promise.resolve(null);
    var raw = lsGet(keys.daily);
    if (!raw) return Promise.resolve(null);
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return Promise.resolve(null); }
    return save({ state: obj, complete: !!complete, now: !!complete });
  }

  // A closing tab is the most common way a session is lost. visibilitychange
  // fires where unload does not, notably on mobile Safari.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate);
  } else {
    hydrate();
  }

  /**
   * Drop every scrap of server-adopted state from this browser.
   *
   * Called on sign-out. Signing in overwrites local state with the account's;
   * leaving that behind afterwards means a shared computer reports "already
   * played today" to whoever uses it next, and shows them someone else's
   * board. Signed out, the browser should own its own game again.
   *
   * Lifetime stats are cleared too, which they were NOT before stats became
   * account state. They are now adopted from the server on sign-in, so
   * leaving them behind would show the next person on a shared computer
   * someone else's history - the same leak the daily keys had.
   */
  function clearLocal() {
    Object.keys(GAMES).forEach(function (id) {
      var k = GAMES[id];
      if (k.daily) lsDel(k.daily);
      if (k.chips) lsDel(k.chips);
      if (k.bonus) lsDel(k.bonus);
      if (k.stats) k.stats.forEach(lsDel);
    });
    synced = false;
    pending = null;
    clearTimeout(timer);
    timer = null;
    statsDirty = false;
    clearTimeout(statsTimer);
    statsTimer = null;
  }

  return {
    ready: ready,
    clearLocal: clearLocal,
    save: save,
    saveDaily: saveDaily,
    saveStats: saveStats,
    flush: flush,
    game: function () { return gameId; },
    /** True when the server is authoritative for this page load. */
    isSynced: function () { return synced; },
    debug: function () {
      var signedIn = !!(window.DJAccount && DJAccount.signedIn && DJAccount.signedIn());
      return {
        game: gameId,
        signedIn: signedIn,
        synced: synced,
        opened: opened,
        pending: pending,
        verdict: !gameId ? 'not a tracked game page'
               : !signedIn ? 'signed out - localStorage is truth, nothing syncs'
               : synced ? 'syncing to the server'
               : 'SIGNED IN BUT NOT SYNCED - writes are being dropped',
        local: keys ? {
          daily: lsGet(keys.daily),
          chips: keys.chips ? lsGet(keys.chips) : null,
          bonus: keys.bonus ? lsGet(keys.bonus) : null,
          stats: collectStats()
        } : null
      };
    }
  };
})();
