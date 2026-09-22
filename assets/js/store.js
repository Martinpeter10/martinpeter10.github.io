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
  // chips and bonus survive the rollover and live in the progress table.
  var GAMES = {
    themedle:     { daily: 'themedleDailyState' },
    chainlink:    { daily: 'cl_today' },
    spelldle:     { daily: 'spd_today' },
    blackjackdle: { daily: 'bj_today', chips: 'bj_chips', bonus: 'bj_bonus_date' },
    roulettedle:  { daily: 'rl_today', chips: 'rl_chips', bonus: 'rl_bonus_date' },
    holdle:       { daily: 'hd_today', chips: 'hd_chips', bonus: 'hd_bonus_date' },
    liarsdice:    { daily: 'bf_today' },
    netzero:      { daily: 'sb_today' },
    shutthebox:   { daily: 'stb_today' },
    yachtdle:     { daily: 'yc_today' }
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

  function open() {
    if (opened) return;
    opened = true;
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

      // Guard against a hung request holding the board blank forever. Opening
      // late with local state is far better than never opening.
      var released = false;
      var bail = setTimeout(function () {
        if (released) return;
        released = true;
        log('state fetch timed out; falling back to local');
        open();
      }, 6000);

      DJAccount.rpc('get_game_state', { p_game: gameId }).then(function (res) {
        if (released) return;
        released = true;
        clearTimeout(bail);
        if (res && res.error) { log('get_game_state failed', res.error); open(); return; }
        applyServerState(res && res.data);
        open();
      }).catch(function (err) {
        if (released) return;
        released = true;
        clearTimeout(bail);
        log('get_game_state threw', err);
        open();
      });
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
  function save(opts) {
    if (!synced) return Promise.resolve(null);
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

  return {
    ready: ready,
    save: save,
    saveDaily: saveDaily,
    flush: flush,
    game: function () { return gameId; },
    /** True when the server is authoritative for this page load. */
    isSynced: function () { return synced; },
    debug: function () {
      return { game: gameId, keys: keys, opened: opened, synced: synced, pending: pending };
    }
  };
})();
