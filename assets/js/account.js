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
  var resolvedFns = [];      // callbacks waiting on the session question
  var resolved = false;
  var checkTimer = null;
  var lastChecked = '';
  var renaming = false;

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
    else if (!profile) body.appendChild(viewUsername('claim'));
    else if (renaming) body.appendChild(viewUsername('rename'));
    else body.appendChild(viewProfile());

    // Google's renderButton needs its container attached to the document, so
    // this cannot happen inside viewSignIn().
    if (client && !session) mountGsi();
  }

  function viewUnavailable() {
    var w = make('div', 'dj-acct-note');
    w.appendChild(make('p', null,
      'Profiles are not available right now. Your games and stats are saved on this device as usual.'));
    return w;
  }

  function viewSignIn() {
    var w = document.createDocumentFragment();

    if (!storageWorks()) {
      var blocked = make('div', 'dj-acct-note');
      blocked.appendChild(make('p', null,
        'This browser is blocking site data, so we cannot keep you signed in. ' +
        'Private browsing usually causes this. Try a normal window, or allow ' +
        'site data for dailyjamm.com.'));
      w.appendChild(blocked);
      return w;
    }

    w.appendChild(make('p', 'dj-acct-lede',
      'Every game is free to play without an account. Sign in to save your scores, keep your streaks on every device, and appear on the daily leaderboards.'));

    // Google renders its own button in here. Empty until mountGsi() runs,
    // which render() kicks off once this fragment is actually in the DOM.
    var slot = make('div', 'dj-gis-slot');
    slot.id = 'dj-gis-btn';
    w.appendChild(slot);

    // Our button, kept for when GIS cannot run at all. Hidden by default so
    // there is never a moment with two sign-in buttons offering the same
    // thing; showFallback() reveals it.
    var fb = make('div', 'dj-acct-fallback-wrap');
    fb.id = 'dj-acct-fallback';
    fb.hidden = true;
    var btn = make('button', 'dj-acct-google');
    btn.type = 'button';
    btn.innerHTML = ICON_GOOGLE;                  // static string
    btn.appendChild(make('span', null, 'Sign in with Google'));
    btn.addEventListener('click', doSignIn);
    fb.appendChild(btn);
    w.appendChild(fb);

    var err = make('p', 'dj-acct-msg');
    err.id = 'dj-acct-msg';
    w.appendChild(err);

    w.appendChild(make('p', 'dj-acct-fine',
      'We use Google only to confirm it is you. Your email address is never shown to other players - you pick a separate public name next.'));

    return w;
  }

  function viewUsername(mode) {
    var w = document.createDocumentFragment();
    var isRename = mode === 'rename';

    w.appendChild(make('p', 'dj-acct-lede', isRename
      ? 'Pick a new name. The same rules apply, and your scores and streaks stay with you.'
      : 'You are signed in. Pick the name other players will see on the leaderboards.'));

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
    if (isRename && profile) input.value = profile.username;
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

    if (isRename) {
      var cancel = make('button', 'dj-acct-secondary', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', function () { renaming = false; render(); });
      w.appendChild(cancel);
    }

    w.appendChild(make('p', 'dj-acct-fine', isRename
      ? 'Changing your name updates it everywhere, including past leaderboard entries. You can change it again after 30 days.'
      : 'This is public on leaderboards. Keep it clean - names are checked. You can change it later.'));

    input.addEventListener('input', function () { onNameInput(input.value); });
    btn.addEventListener('click', function () { submitName(input.value.trim(), mode); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !btn.disabled) submitName(input.value.trim(), mode);
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

    var edit = make('button', 'dj-acct-secondary', 'Change username');
    edit.type = 'button';
    edit.addEventListener('click', function () { renaming = true; render(); });
    w.appendChild(edit);

    var out = make('button', 'dj-acct-secondary', 'Sign out');
    out.type = 'button';
    out.addEventListener('click', doSignOut);
    w.appendChild(out);

    w.appendChild(make('p', 'dj-acct-fine',
      'Signing out clears this device back to a fresh game. Your scores, streaks and chips stay on your account and come back when you sign in.'));

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
    if (renaming && profile && v === profile.username) {
      setMsg('That is already your name.', null);
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
        // The server distinguishes "taken" from "not allowed"; it deliberately
        // does not say WHY a name is not allowed, because explaining the filter
        // teaches people how to beat it.
        setMsg((res && res.message) || "That name isn't available - try another.", 'bad');
        setBusy(true);
      }
    }).catch(function (err) {
      if (lastChecked !== v) return;
      // A thrown fetch is a connectivity or CORS problem, never a verdict on
      // the name. Say so, and leave a breadcrumb in the console - this branch
      // previously swallowed a CORS failure and read as a rejection.
      if (window.console && console.warn) {
        console.warn('[DJAccount] username check failed:', err);
      }
      setMsg('Could not reach the server. Check your connection and try again.', 'bad');
      setBusy(true);
    });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  //
  // WHY THERE ARE TWO SIGN-IN PATHS
  //
  // The visible problem: Google's consent screen said "continue to
  // uyvozabvh....supabase.co" instead of DailyJamm. That string is not a
  // branding setting we failed to fill in. Google shows an app's configured
  // name only after **brand verification**, and brand verification requires
  // proving ownership in Search Console of the top private domain of every
  // redirect URI and JavaScript origin on every web client in the project.
  // `signInWithOAuth` sends the browser to
  // <project>.supabase.co/auth/v1/callback, so `supabase.co` is one of those
  // domains - and it cannot be verified, because we do not own it. That is
  // why the earlier verification attempt failed, and why setting the App name
  // on its own changes nothing.
  //
  // Google Identity Services avoids the problem instead of fighting it. The
  // browser asks Google for an ID token directly, using a client whose only
  // registered URL is an Authorized JavaScript origin on dailyjamm.com, and
  // hands that token to Supabase. Nothing redirects through supabase.co, so
  // Google has no supabase.co to name: the prompt shows our own domain (or
  // "DailyJamm" once brand verification passes, which is now possible).
  //
  // `signInWithOAuth` is KEPT as a fallback and is not dead code. GIS needs a
  // third-party script, a popup, and browser support for the credential APIs;
  // any of those can be blocked - script blockers, a locked-down iOS
  // configuration, an embedded webview. A player who cannot sign in at all is
  // a far worse outcome than a consent screen with the wrong name on it, so
  // the redirect path stays until GIS has been seen to work everywhere.

  var GSI_SRC = 'https://accounts.google.com/gsi/client';
  var gsiState = 'idle';      // idle | loading | ready | failed
  var gsiWaiting = [];
  var gsiNonce = null;        // raw nonce; Supabase needs the un-hashed one
  var gsiMounted = false;

  /**
   * Load Google's library once, on demand. Not on every page view: this is a
   * third-party script that only matters to the handful of visitors who open
   * the account modal.
   *
   * Always calls back. A blocked or slow script resolves as 'failed' so the
   * fallback button appears, rather than leaving a modal with no way out.
   */
  function loadGsi(done) {
    if (gsiState === 'ready' || gsiState === 'failed') { done(gsiState === 'ready'); return; }
    gsiWaiting.push(done);
    if (gsiState === 'loading') return;
    gsiState = 'loading';

    function settle(ok) {
      if (gsiState !== 'loading') return;
      gsiState = ok ? 'ready' : 'failed';
      var fns = gsiWaiting; gsiWaiting = [];
      fns.forEach(function (fn) { try { fn(ok); } catch (e) {} });
    }

    var s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = function () {
      // onload fires for a script the CSP let through but that failed to
      // define its global; check for what we actually need.
      settle(!!(window.google && window.google.accounts && window.google.accounts.id));
    };
    s.onerror = function () { settle(false); };
    document.head.appendChild(s);

    // A blocker can leave a script element that never fires either handler.
    setTimeout(function () { settle(false); }, 8000);
  }

  /**
   * A nonce binds the token Google issues to this page load, so a token
   * captured elsewhere cannot be replayed into our sign-in. Google is given
   * the SHA-256 hash; Supabase is given the raw value and checks they match.
   *
   * Resolves with null where SubtleCrypto is unavailable (an http:// origin,
   * an old browser). A missing nonce is a weaker check, not a broken one -
   * Supabase still validates the token's signature, issuer and audience - so
   * it is better than refusing to sign anybody in.
   */
  function makeNonce() {
    try {
      if (!window.crypto || !crypto.getRandomValues || !crypto.subtle) {
        return Promise.resolve(null);
      }
      var bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      var raw = Array.prototype.map.call(bytes, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');

      var enc = new TextEncoder().encode(raw);
      return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
        var hashed = Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
        return { raw: raw, hashed: hashed };
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /** Google handed us an ID token. Trade it for a Supabase session. */
  function onGoogleCredential(resp) {
    if (!client || !resp || !resp.credential) return;
    setMsg('Signing you in...', null);
    var args = { provider: 'google', token: resp.credential };
    if (gsiNonce) args.nonce = gsiNonce;

    client.auth.signInWithIdToken(args).then(function (res) {
      if (res && res.error) throw res.error;
      // Nothing else to do here: onAuthStateChange owns what happens next,
      // exactly as it does for the redirect path.
      setMsg('', null);
    }).catch(function (err) {
      if (window.console && console.warn) {
        console.warn('[DJAccount] signInWithIdToken failed:', err);
      }
      // The token was fine and Supabase refused it - usually the client ID is
      // not on the provider's allowed list. The redirect path does not depend
      // on that, so offer it.
      setMsg('Google signed you in but we could not finish. Try the button below.', 'bad');
      showFallback();
    });
  }

  function showFallback() {
    var fb = document.getElementById('dj-acct-fallback');
    if (fb) fb.hidden = false;
  }

  /**
   * Render Google's own button into the modal. Their button rather than ours
   * because `renderButton` is what delivers an ID token to the callback, and
   * because a popup has none of One Tap's suppression rules - One Tap goes
   * quiet after a few dismissals and would leave a button that does nothing.
   */
  function mountGsi() {
    var slot = document.getElementById('dj-gis-btn');
    if (!slot || gsiMounted) return;
    var cid = window.DJConfig && DJConfig.googleClientId;
    if (!cid) { showFallback(); return; }
    gsiMounted = true;

    loadGsi(function (ok) {
      gsiMounted = false;
      if (!ok) { showFallback(); return; }
      // The modal may have been closed and re-rendered while loading.
      slot = document.getElementById('dj-gis-btn');
      if (!slot) return;

      makeNonce().then(function (n) {
        gsiNonce = n ? n.raw : null;
        var init = {
          client_id: cid,
          callback: onGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
          itp_support: true
        };
        if (n) init.nonce = n.hashed;

        try {
          google.accounts.id.initialize(init);
          google.accounts.id.renderButton(slot, {
            type: 'standard', theme: 'filled_blue', size: 'large',
            text: 'signin_with', shape: 'pill', logo_alignment: 'left',
            width: 260
          });
        } catch (e) {
          if (window.console && console.warn) {
            console.warn('[DJAccount] GIS init failed:', e);
          }
          showFallback();
        }
      });
    });
  }

  /**
   * The fallback: hand off to Google the old way. This navigates away; the
   * browser comes back to the same page with the session in the URL fragment,
   * which supabase-js reads because dj-config.js sets detectSessionInUrl.
   *
   * Reaching this means the consent screen will name the Supabase host. That
   * is the trade being made deliberately - see the note at the top of this
   * section.
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

  function submitName(v, mode) {
    if (!SHAPE.test(v) || !client || !session) return;
    var action = mode === 'rename' ? 'rename' : 'claim';
    setBusy(true, 'Saving...');
    setMsg('', null);

    callFn(action, v).then(function (res) {
      if (res && res.ok) {
        profile = { username: res.username };
        cache(profile);
        renaming = false;
        paintButton();
        render();
        // Anything played before signing in is waiting in the queue.
        flushQueue();
      } else {
        // The server distinguishes taken, not-allowed, and a rename cooldown.
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
        renaming = false;
        cache(null);
        // Drop state adopted from the account. Without this a shared computer
        // keeps reporting "already played today" to the next person and shows
        // them someone else's board. The account's own copy is safe on the
        // server and comes back on the next sign-in.
        if (window.DJStore && DJStore.clearLocal) DJStore.clearLocal();
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

  /**
   * Today's Chicago date, without depending on DJUtils. utils.js loads AFTER
   * account.js on game pages and not at all on /leaderboards/, so a bare
   * DJUtils reference throws ReferenceError rather than evaluating as falsy.
   */
  /**
   * supabase-js persists the session in localStorage. Where that is blocked -
   * a private window, or a browser set to refuse site data - sign-in completes
   * at Google, returns, and then evaporates, which looks exactly like sign-in
   * being broken. Detect it so we can say what actually happened.
   */
  function storageWorks() {
    try {
      var k = '__dj_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function chicagoToday() {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    } catch (e) {
      return null;
    }
  }

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
      if (res.error) {
        // Surface it. A silently queued failure is how a broken submit_score
        // went unnoticed through several rounds of "scores are not saving".
        if (window.console && console.warn) {
          console.warn('[DJAccount] submit_score failed:', res.error);
        }
        throw res.error;
      }
      return res.data;
    });
  }

  /** Send anything waiting - from a failed post, or from before sign-in. */
  function flushQueue() {
    if (!client || !session || !profile) return Promise.resolve();
    var q = readQueue();
    if (!q.length) return Promise.resolve();

    // Drop anything not earned today. submit_score stamps the server's date, so
    // flushing an older entry would file it under the wrong day.
    var today = chicagoToday();
    if (today) q = q.filter(function (x) { return !x.day || x.day === today; });
    if (!q.length) { writeQueue([]); return Promise.resolve(); }

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
    if (typeof score !== 'number' || !isFinite(score)) return Promise.resolve(null);

    var item = {
      game: game,
      score: Math.round(score),
      detail: detail || null,
      extras: extras || null,
      // The server pins the date, so a queued entry must carry the day it was
      // actually earned - otherwise yesterday's result flushes as today's.
      day: chicagoToday(),
      at: Date.now()
    };

    function queue() {
      var q = readQueue();
      // One entry per game per day; a retry must not create a second row.
      q = q.filter(function (x) { return !(x.game === game && x.day === item.day); });
      q.push(item);
      writeQueue(q);
      return null;
    }

    // No account yet. Hold the result rather than dropping it: a player who
    // finishes a puzzle and THEN signs in should still get credit for the day.
    // Every game records its result inside a "not yet recorded today" guard, so
    // this is the only chance to capture it.
    if (!client || !session || !profile) return Promise.resolve(queue());

    return post(item).catch(queue);
  }

  // ── Leaderboard reads ────────────────────────────────────────────────────

  /**
   * One board. Metrics are played | best | notable | total | cur_streak |
   * best_streak | extras:<key>. Period is daily | weekly | lifetime, and is
   * ignored for streaks and extras, which have no windowed form.
   */
  function board(game, metric, limit, period) {
    if (!client) return Promise.resolve([]);
    return client.rpc('get_game_board', {
      p_game: game,
      p_metric: metric || 'played',
      p_limit: limit || 10,
      p_period: period || 'lifetime'
    }).then(function (res) {
      if (res.error) {
        if (window.console && console.warn) console.warn('[DJAccount] board failed:', res.error);
        return [];
      }
      return res.data || [];
    }).catch(function () { return []; });
  }

  /** The signed-in player's own row for every game they have played. */
  function myStats() {
    if (!client || !session || !profile) return Promise.resolve([]);
    return client.rpc('get_my_stats').then(function (res) {
      return res.error ? [] : (res.data || []);
    }).catch(function () { return []; });
  }

  function siteStats() {
    if (!client) return Promise.resolve(null);
    return client.rpc('get_site_stats').then(function (res) {
      return res.error ? null : res.data;
    }).catch(function () { return null; });
  }

  /**
   * Fire fn once we know whether anyone is signed in - not whether they are.
   * DJStore blocks the first paint of every game on this, so it must resolve
   * on every path including failure, or games never boot.
   */
  function whenResolved(fn) {
    if (resolved) { fn(); return; }
    resolvedFns.push(fn);
  }

  function markResolved() {
    if (resolved) return;
    resolved = true;
    var fns = resolvedFns; resolvedFns = [];
    fns.forEach(function (fn) {
      try { fn(); } catch (e) {
        if (window.console && console.warn) console.warn('[DJAccount] resolve cb:', e);
      }
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  function boot() {
    // Every exit from boot MUST resolve. DJStore blocks the first paint of
    // every game on this, so an unresolved path is a permanently blank board.
    if (!window.DJConfig) { markResolved(); return; }

    // Paint from cache first so the button does not flicker on a slow network.
    profile = cached();
    injectButton();

    client = window.DJConfig.getClient();
    if (!client) {
      markResolved();
      // Unconfigured or the vendor bundle failed. Show nothing rather than a
      // broken control - but keep the cached name if we had one.
      if (!profile) {
        var b = document.getElementById('dj-account-btn');
        if (b) b.remove();
      }
      return;
    }

    // React to auth events, do not just sample once.
    //
    // detectSessionInUrl parses the OAuth fragment asynchronously during client
    // construction. getSession() below can therefore run BEFORE the returning
    // session has been parsed, report null, and paint a signed-out header - the
    // player clicks Sign in, comes back, and appears signed out. Listening
    // catches the session whenever it actually arrives.
    client.auth.onAuthStateChange(function (event, s) {
      if (event === 'SIGNED_OUT') {
        session = null;
        profile = null;
        cache(null);
        if (window.DJStore && DJStore.clearLocal) DJStore.clearLocal();
        paintButton();
        if (built) render();
        return;
      }
      if (!s) return;

      var hadNone = !session;
      session = s;
      if (!hadNone && profile) return;   // nothing new to do

      loadProfile().then(function (p) {
        profile = p;
        cache(p);
        paintButton();
        if (built) render();
        flushQueue();
        // Back from Google with no name yet: finish the job rather than
        // dropping them on the page with nothing to show for the round trip.
        if (!p && event === 'SIGNED_IN') open();
      });
    });

    client.auth.getSession().then(function (res) {
      session = (res && res.data && res.data.session) || null;
      if (!session) {
        // No session: any cached name is stale (signed out, or a new device).
        profile = null;
        cache(null);
        paintButton();
        markResolved();
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
        markResolved();
        if (!p) open();
      });
    }).catch(function (err) {
      markResolved();
      // Leave the cached paint in place, but say something - a swallowed
      // exception here previously looked like "scores are not recording".
      if (window.console && console.warn) {
        console.warn('[DJAccount] boot failed:', err);
      }
    });
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
    whenResolved: whenResolved,
    signedIn: function () { return !!(session && profile); },
    rpc: function (fn, args) {
      if (!client) return Promise.reject(new Error('no client'));
      return client.rpc(fn, args || {});
    },
    submitScore: submitScore,
    /** Console helper: why is nothing recording? */
    debug: function () {
      return {
        env: window.DJConfig && DJConfig.env,
        schema: window.DJConfig && DJConfig.schema,
        configured: !!(window.DJConfig && DJConfig.configured),
        client: !!client,
        signedIn: !!session,
        username: profile ? profile.username : null,
        storageWorks: storageWorks(),
        queued: readQueue()
      };
    },
    board: board,
    siteStats: siteStats,
    myStats: myStats
  };
})();
