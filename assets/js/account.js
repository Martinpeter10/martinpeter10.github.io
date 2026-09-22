// DailyJamm accounts: sign in with Google, then claim a public username.
//
// Runs on every page with a site-header (after favorites.js). Injects the
// account button as the rightmost header child and owns the profile modal.
//
// Playing is FREE and never gated. An account buys you saved scores, streaks
// that follow you between devices, and a place on the daily leaderboards -
// so the modal is only ever opened deliberately, never forced in front of a
// puzzle.
//
// Identity is a Google account, which means the email is verified and unique
// without DailyJamm ever sending an email or storing a password. The username
// is separate: it is the only thing shown publicly, and the email is never
// displayed to anyone but its owner.
//
// Three states:
//   no session              -> viewSignIn     "Sign in with Google"
//   session, no profile     -> viewUsername   "Pick your leaderboard name"
//   session + profile       -> viewProfile    name, email, sign out
//
// Degrades to nothing: if DJConfig is unconfigured, supabase-js failed to load,
// or the network is down, the button removes itself and every game keeps
// working exactly as it does today.
window.DJAccount = (function () {
  'use strict';

  var CACHE_KEY = 'dj_account';        // { username } - for instant paint only
  var QUEUE_KEY = 'dj_score_queue';    // submissions awaiting a working network
  var MIN_LEN = 3;
  var MAX_LEN = 16;
  var SHAPE = /^[A-Za-z0-9_]{3,16}$/;

  // Static SVG only - never interpolate anything into these.
  var ICON_PERSON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  // Google's four-colour mark. Static, and the only place brand colours that
  // are not DailyJamm's appear in the site.
  var ICON_GOOGLE =
    '<svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">' +
    '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33z"/>' +
    '<path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58z"/></svg>';

  var MODAL_HTML =
    '<div class="dj-acct-backdrop" id="dj-acct-backdrop"></div>' +
    '<div class="dj-acct-modal" id="dj-acct-modal" role="dialog" aria-modal="true" aria-labelledby="dj-acct-title">' +
      '<div class="dj-acct-head">' +
        '<h2 id="dj-acct-title">Your profile</h2>' +
        '<button class="dj-acct-close" id="dj-acct-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="dj-acct-body" id="dj-acct-body"></div>' +
    '</div>';

  var client = null;
  var session = null;
  var profile = null;      // { username }
  var built = false;
  var checkTimer = null;
  var lastChecked = '';

  // ── Small helpers ────────────────────────────────────────────────────────

  function cached() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; }
    catch (e) { return null; }
  }

  function cache(p) {
    try {
      if (p) localStorage.setItem(CACHE_KEY, JSON.stringify({ username: p.username }));
      else localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* private mode - the session still works, just no fast paint */ }
  }

  function make(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;   // always textContent, never innerHTML
    return n;
  }

  function email() {
    return (session && session.user && session.user.email) || '';
  }

  // ── Header button ────────────────────────────────────────────────────────

  function injectButton() {
    var header = document.querySelector('header.site-header');
    if (!header || document.getElementById('dj-account-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'dj-account-btn';
    btn.type = 'button';
    btn.className = 'dj-acct-btn';
    btn.setAttribute('aria-label', 'Account');
    btn.addEventListener('click', open);
    header.appendChild(btn);   // rightmost, after stats, help and the bell
    paintButton();
  }

  function paintButton() {
    var btn = document.getElementById('dj-account-btn');
    if (!btn) return;
    var name = profile && profile.username;
    if (name) {
      btn.textContent = name.charAt(0).toUpperCase();
      btn.classList.add('is-signed-in');
      btn.setAttribute('aria-label', 'Profile: ' + name);
    } else {
      btn.textContent = '';
      btn.innerHTML = ICON_PERSON;   // static string, no interpolation
      btn.classList.remove('is-signed-in');
      btn.setAttribute('aria-label', 'Account');
    }
  }

  // ── Modal shell ──────────────────────────────────────────────────────────

  function build() {
    if (built) return;
    var host = document.createElement('div');
    host.innerHTML = MODAL_HTML;      // static string
    while (host.firstChild) document.body.appendChild(host.firstChild);
    document.getElementById('dj-acct-close').addEventListener('click', close);
    document.getElementById('dj-acct-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    built = true;
  }

  function open() {
    build();
    render();
    document.getElementById('dj-acct-backdrop').classList.add('open');
    document.getElementById('dj-acct-modal').classList.add('open');
  }

  function close() {
    if (!built) return;
    document.getElementById('dj-acct-backdrop').classList.remove('open');
    document.getElementById('dj-acct-modal').classList.remove('open');
  }

  // ── Views ────────────────────────────────────────────────────────────────

  function render() {
    var body = document.getElementById('dj-acct-body');
    if (!body) return;
    body.textContent = '';
    if (!client) body.appendChild(viewUnavailable());
    else if (!session) body.appendChild(viewSignIn());
    else if (!profile) body.appendChild(viewUsername());
    else body.appendChild(viewProfile());
  }

  function viewUnavailable() {
    var w = make('div', 'dj-acct-note');
    w.appendChild(make('p', null,
      'Profiles are not available right now. Your games and stats are saved on this device as usual.'));
    return w;
  }

  function viewSignIn() {
    var w = document.createDocumentFragment();

    w.appendChild(make('p', 'dj-acct-lede',
      'Every game is free to play without an account. Sign in to save your scores, keep your streaks on every device, and appear on the daily leaderboards.'));

    var btn = make('button', 'dj-acct-google');
    btn.type = 'button';
    btn.innerHTML = ICON_GOOGLE;                  // static string
    btn.appendChild(make('span', null, 'Sign in with Google'));
    btn.addEventListener('click', doSignIn);
    w.appendChild(btn);

    var err = make('p', 'dj-acct-msg');
    err.id = 'dj-acct-msg';
    w.appendChild(err);

    w.appendChild(make('p', 'dj-acct-fine',
      'We use Google only to confirm it is you. Your email address is never shown to other players - you pick a separate public name next.'));

    return w;
  }

  function viewUsername() {
    var w = document.createDocumentFragment();

    w.appendChild(make('p', 'dj-acct-lede',
      'You are signed in. Pick the name other players will see on the leaderboards.'));

    var field = make('div', 'dj-acct-field');
    var label = make('label', null, 'Username');
    label.setAttribute('for', 'dj-acct-name');
    var input = document.createElement('input');
    input.id = 'dj-acct-name';
    input.type = 'text';
    input.maxLength = MAX_LEN;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '3-16 letters, numbers or _';
    field.appendChild(label);
    field.appendChild(input);
    w.appendChild(field);

    var msg = make('p', 'dj-acct-msg');
    msg.id = 'dj-acct-msg';
    w.appendChild(msg);

    var btn = make('button', 'dj-acct-primary', 'Save name');
    btn.id = 'dj-acct-create';
    btn.type = 'button';
    btn.disabled = true;
    w.appendChild(btn);

    w.appendChild(make('p', 'dj-acct-fine',
      'This is public on leaderboards. Keep it clean - names are checked. Choose carefully; renaming is not available yet.'));

    input.addEventListener('input', function () { onNameInput(input.value); });
    btn.addEventListener('click', function () { doClaim(input.value.trim()); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !btn.disabled) doClaim(input.value.trim());
    });

    setTimeout(function () { input.focus(); }, 50);
    return w;
  }

  function viewProfile() {
    var w = document.createDocumentFragment();

    w.appendChild(make('div', 'dj-acct-badge', profile.username.charAt(0).toUpperCase()));
    w.appendChild(make('p', 'dj-acct-name-big', profile.username));

    var em = email();
    if (em) {
      var row = make('p', 'dj-acct-email');
      row.appendChild(make('span', null, em));
      w.appendChild(row);
      w.appendChild(make('p', 'dj-acct-fine',
        'Only you can see this. Other players see ' + profile.username + '.'));
    }

    w.appendChild(make('p', 'dj-acct-lede',
      'Your scores are saved to your account. Sign in with the same Google account on any device to pick up your streaks.'));

    var out = make('button', 'dj-acct-secondary', 'Sign out');
    out.type = 'button';
    out.addEventListener('click', doSignOut);
    w.appendChild(out);

    return w;
  }

  // ── Username checking ────────────────────────────────────────────────────

  function setMsg(text, kind) {
    var m = document.getElementById('dj-acct-msg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'dj-acct-msg' + (kind ? ' is-' + kind : '');
  }

  function setBusy(busy, label) {
    var b = document.getElementById('dj-acct-create');
    if (!b) return;
    b.disabled = busy;
    b.textContent = label || 'Save name';
  }

  function onNameInput(raw) {
    var v = raw.trim();
    clearTimeout(checkTimer);

    if (v.length < MIN_LEN) {
      setMsg('', null);
      setBusy(true);
      return;
    }
    if (!SHAPE.test(v)) {
      // Shape feedback is the one check that is safe and useful to explain,
      // because it describes a rule rather than revealing the filter.
      setMsg('Letters, numbers and underscores only.', 'bad');
      setBusy(true);
      return;
    }

    setMsg('Checking...', null);
    setBusy(true, 'Checking...');
    checkTimer = setTimeout(function () { doCheck(v); }, 350);
  }

  function callFn(action, username) {
    return fetch(window.DJConfig.functionUrl('username'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: action, username: username })
    }).then(function (r) { return r.json(); });
  }

  function authHeaders() {
    var h = {
      'content-type': 'application/json',
      'apikey': window.DJConfig.anonKey
    };
    if (session && session.access_token) {
      h['Authorization'] = 'Bearer ' + session.access_token;
    }
    return h;
  }

  function doCheck(v) {
    lastChecked = v;
    callFn('check', v).then(function (res) {
      if (lastChecked !== v) return;    // a newer keystroke won
      if (res && res.available) {
        setMsg(v + ' is available', 'good');
        setBusy(false);
      } else {
        setMsg((res && res.message) || "That name isn't available - try another.", 'bad');
        setBusy(true);
      }
    }).catch(function () {
      if (lastChecked !== v) return;
      setMsg('Could not check that name. Try again.', 'bad');
      setBusy(true);
    });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  /**
   * Hand off to Google. This navigates away; the browser comes back to the
   * same page with the session in the URL fragment, which supabase-js reads
   * because dj-config.js sets detectSessionInUrl.
   */
  function doSignIn() {
    if (!client) return;
    setMsg('', null);
    client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.href }
    }).then(function (res) {
      if (res.error) setMsg('Could not reach Google. Try again.', 'bad');
    }).catch(function () {
      setMsg('Could not reach Google. Try again.', 'bad');
    });
  }

  function doClaim(v) {
    if (!SHAPE.test(v) || !client || !session) return;
    setBusy(true, 'Saving...');
    setMsg('', null);

    callFn('claim', v).then(function (res) {
      if (res && res.ok) {
        profile = { username: res.username };
        cache(profile);
        paintButton();
        render();
      } else {
        setMsg((res && res.message) || 'Could not save that name.', 'bad');
        setBusy(true);
      }
    }).catch(function () {
      setMsg('Something went wrong. Try again.', 'bad');
      setBusy(true);
    });
  }

  function doSignOut() {
    if (!client) return;
    client.auth.signOut().catch(function () { /* clear locally regardless */ })
      .then(function () {
        session = null;
        profile = null;
        cache(null);
        paintButton();
        render();
      });
  }

  /** Read the profile row for the current session, if any. */
  function loadProfile() {
    if (!client || !session) return Promise.resolve(null);
    return client.from('profiles').select('username').maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) return null;
        return { username: res.data.username };
      })
      .catch(function () { return null; });
  }

  // ── Score submission ─────────────────────────────────────────────────────

  function readQueue() {
    try { var q = JSON.parse(localStorage.getItem(QUEUE_KEY)); return Array.isArray(q) ? q : []; }
    catch (e) { return []; }
  }

  function writeQueue(q) {
    try {
      // Cap it. An unreachable backend must not grow localStorage without limit.
      if (q.length > 40) q = q.slice(-40);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch (e) { /* storage full or blocked - the score is simply lost */ }
  }

  function post(item) {
    return client.rpc('submit_score', {
      p_game: item.game,
      p_score: item.score,
      p_detail: item.detail || null,
      p_extras: item.extras || null
    }).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  /** Send anything waiting from a previous failure. Silent either way. */
  function flushQueue() {
    if (!client || !session || !profile) return Promise.resolve();
    var q = readQueue();
    if (!q.length) return Promise.resolve();

    var remaining = [];
    return q.reduce(function (chain, item) {
      return chain.then(function () {
        return post(item).catch(function () { remaining.push(item); });
      });
    }, Promise.resolve()).then(function () {
      writeQueue(remaining);
    });
  }

  /**
   * Record a finished game. Safe to call unconditionally from any game - it
   * no-ops when the player has no account, and queues for retry when the
   * network fails. A game must never wait on this or branch on its result.
   *
   * extras keys carry meaning by suffix:
   *   _total  accumulates  (perfect games, Yachts rolled)
   *   _now    overwrites   (current chip stack, which is allowed to fall)
   *   other   keeps max    (personal bests)
   */
  function submitScore(game, score, detail, extras) {
    if (!client || !session || !profile) return Promise.resolve(null);
    if (typeof score !== 'number' || !isFinite(score)) return Promise.resolve(null);

    var item = {
      game: game,
      score: Math.round(score),
      detail: detail || null,
      extras: extras || null,
      at: Date.now()
    };

    return post(item).catch(function () {
      var q = readQueue();
      // One entry per game per day; a retry must not create a second row.
      q = q.filter(function (x) { return x.game !== game; });
      q.push(item);
      writeQueue(q);
      return null;
    });
  }

  // ── Leaderboard reads ────────────────────────────────────────────────────

  function board(game, metric, limit) {
    if (!client) return Promise.resolve([]);
    return client.rpc('get_game_board', {
      p_game: game, p_metric: metric || 'today', p_limit: limit || 10
    }).then(function (res) { return res.error ? [] : (res.data || []); })
      .catch(function () { return []; });
  }

  function siteStats() {
    if (!client) return Promise.resolve(null);
    return client.rpc('get_site_stats').then(function (res) {
      return res.error ? null : res.data;
    }).catch(function () { return null; });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  function boot() {
    if (!window.DJConfig) return;

    // Paint from cache first so the button does not flicker on a slow network.
    profile = cached();
    injectButton();

    client = window.DJConfig.getClient();
    if (!client) {
      // Unconfigured or the vendor bundle failed. Show nothing rather than a
      // broken control - but keep the cached name if we had one.
      if (!profile) {
        var b = document.getElementById('dj-account-btn');
        if (b) b.remove();
      }
      return;
    }

    client.auth.getSession().then(function (res) {
      session = (res && res.data && res.data.session) || null;
      if (!session) {
        // No session: any cached name is stale (signed out, or a new device).
        profile = null;
        cache(null);
        paintButton();
        return;
      }
      return loadProfile().then(function (p) {
        profile = p;
        cache(p);
        paintButton();
        if (built) render();
        flushQueue();

        // Just came back from Google without a name yet. Finish the job rather
        // than dropping them on the page with nothing to show for the round
        // trip - this is the only time the modal opens on its own.
        if (!p) open();
      });
    }).catch(function () { /* leave the cached paint in place */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    open: open,
    close: close,
    /** Current username, or null. Phase 2 uses this to gate score submission. */
    username: function () { return profile ? profile.username : null; },
    /** True when there is a signed-in account with a claimed name. */
    isReady: function () { return !!(session && profile); },
    submitScore: submitScore,
    board: board,
    siteStats: siteStats
  };
})();
