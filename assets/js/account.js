// DailyJamm accounts: player profile with a moderated username.
//
// Runs on every page (after menu.js and favorites.js). Injects the account
// button as the rightmost child of the site header and owns the profile modal.
//
// Phase 1 scope: anonymous sign-in, username creation, sign out. Score
// submission and leaderboards land in Phase 2 - deliberately not here.
//
// Degrades to nothing: if DJConfig is unconfigured, supabase-js failed to load,
// or the network is down, the button simply does not appear and every game
// keeps working exactly as it does today.
window.DJAccount = (function () {
  'use strict';

  var CACHE_KEY = 'dj_account';        // { username } - for instant paint only
  var MIN_LEN = 3;
  var MAX_LEN = 16;
  var SHAPE = /^[A-Za-z0-9_]{3,16}$/;

  // Static SVG only - never interpolate anything into these.
  var ICON_PERSON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

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
    header.appendChild(btn);   // rightmost, after stats and help where present
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
    else if (profile) body.appendChild(viewProfile());
    else body.appendChild(viewCreate());
  }

  function viewUnavailable() {
    var w = make('div', 'dj-acct-note');
    w.appendChild(make('p', null,
      'Profiles are not available right now. Your games and stats are saved on this device as usual.'));
    return w;
  }

  function viewCreate() {
    var w = document.createDocumentFragment();

    w.appendChild(make('p', 'dj-acct-lede',
      'Pick a name to save your scores and appear on the daily leaderboards. No email needed.'));

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

    var btn = make('button', 'dj-acct-primary', 'Create profile');
    btn.id = 'dj-acct-create';
    btn.type = 'button';
    btn.disabled = true;
    w.appendChild(btn);

    w.appendChild(make('p', 'dj-acct-fine',
      'Your name is public on leaderboards. Keep it clean - names are checked.'));

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

    var badge = make('div', 'dj-acct-badge', profile.username.charAt(0).toUpperCase());
    w.appendChild(badge);
    w.appendChild(make('p', 'dj-acct-name-big', profile.username));

    w.appendChild(make('p', 'dj-acct-lede',
      'Your scores are saved to your profile from now on.'));

    // Phase 4 replaces this with a real "link an account" flow.
    var warn = make('div', 'dj-acct-warn');
    warn.appendChild(make('p', null,
      'This profile lives on this device only. Clearing your browser will lose it. ' +
      'Signing in with an email or Google is coming soon.'));
    w.appendChild(warn);

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
    b.textContent = label || 'Create profile';
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

  function doClaim(v) {
    if (!SHAPE.test(v) || !client) return;
    setBusy(true, 'Creating...');
    setMsg('', null);

    ensureSession()
      .then(function () { return callFn('claim', v); })
      .then(function (res) {
        if (res && res.ok) {
          profile = { username: res.username };
          cache(profile);
          paintButton();
          render();
        } else {
          setMsg((res && res.message) || 'Could not create that profile.', 'bad');
          setBusy(true);
        }
      })
      .catch(function () {
        setMsg('Something went wrong. Try again.', 'bad');
        setBusy(true);
      });
  }

  /** Create an anonymous auth user if there is not already a session. */
  function ensureSession() {
    if (session) return Promise.resolve(session);
    return client.auth.signInAnonymously().then(function (res) {
      if (res.error) throw res.error;
      session = res.data.session;
      return session;
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
        // No session: any cached name is stale (cleared storage, new device).
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
    username: function () { return profile ? profile.username : null; }
  };
})();
