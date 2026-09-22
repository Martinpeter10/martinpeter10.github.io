// DailyJamm release notifications: a bell in the header that appears when the
// player has not yet seen the latest release, and links them to /releases/.
//
// Runs on every page with a site-header, after favorites.js. No backend - this
// is a localStorage version comparison, nothing more.
//
// ── TO ANNOUNCE A NEW RELEASE ───────────────────────────────────────────────
// Bump RELEASE below in the same commit that adds the release notes to
// README.md and /releases/index.html. Those three must agree or the bell will
// point at a release page that does not mention the version it is announcing.
window.DJNotify = (function () {
  'use strict';

  var RELEASE = {
    version: '3.5.0',
    title: 'Accounts and Leaderboards',
    summary: 'Claim a username, save your scores, and see how you stack up on the daily boards.'
  };

  var SEEN_KEY = 'dj_seen_release';

  // Any one of these means the browser has played DailyJamm before. Used to
  // tell a returning player (who should hear about the release) from a brand
  // new one (who should not be greeted by news of a version they never missed).
  var PRIOR_USE_KEYS = [
    'dj_cookie_ok', 'dj_favorites', 'dj_account',
    'td_stats_v2', 'cl_stats_v2', 'spd_stats_v2', 'bj_stats_v2', 'rl_stats_v2',
    'hd_stats_v2', 'bf_stats_v2', 'sb_stats_v2', 'stb_stats_v2', 'yc_stats_v2'
  ];

  var BELL_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

  var panelBuilt = false;

  function read(key) {
    try { return localStorage.getItem(key); }
    catch (e) { return null; }   // private mode - behave as a new visitor
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, RELEASE.version); }
    catch (e) { /* nothing to do - the bell simply returns next load */ }
  }

  function hasPlayedBefore() {
    for (var i = 0; i < PRIOR_USE_KEYS.length; i++) {
      if (read(PRIOR_USE_KEYS[i])) return true;
    }
    return false;
  }

  /** True when this browser should be told about RELEASE.version. */
  function isUnread() {
    var seen = read(SEEN_KEY);
    if (seen === RELEASE.version) return false;
    if (seen) return true;              // saw an older release, has missed this one

    // Never recorded a release. A returning player missed this one; a first-time
    // visitor did not, so quietly bring them up to date instead of announcing
    // news that predates them.
    if (hasPlayedBefore()) return true;
    markSeen();
    return false;
  }

  // ── Panel ────────────────────────────────────────────────────────────────

  function buildPanel() {
    if (panelBuilt) return;

    var wrap = document.createElement('div');
    wrap.className = 'dj-bell-panel';
    wrap.id = 'dj-bell-panel';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'New release');

    var eyebrow = document.createElement('p');
    eyebrow.className = 'dj-bell-eyebrow';
    eyebrow.textContent = 'New in v' + RELEASE.version;

    var h = document.createElement('p');
    h.className = 'dj-bell-title';
    h.textContent = RELEASE.title;

    var p = document.createElement('p');
    p.className = 'dj-bell-sum';
    p.textContent = RELEASE.summary;

    var go = document.createElement('a');
    go.className = 'dj-bell-go';
    go.href = '/releases/';
    go.textContent = "See what's new";
    go.addEventListener('click', acknowledge);

    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'dj-bell-dismiss';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', function () {
      acknowledge();
      closePanel();
    });

    var row = document.createElement('div');
    row.className = 'dj-bell-row';
    row.appendChild(go);
    row.appendChild(dismiss);

    wrap.appendChild(eyebrow);
    wrap.appendChild(h);
    wrap.appendChild(p);
    wrap.appendChild(row);
    document.body.appendChild(wrap);
    panelBuilt = true;
  }

  function togglePanel() {
    buildPanel();
    var panel = document.getElementById('dj-bell-panel');
    var btn = document.getElementById('dj-bell-btn');
    if (!panel || !btn) return;

    var opening = !panel.classList.contains('open');
    panel.classList.toggle('open', opening);
    btn.setAttribute('aria-expanded', String(opening));

    // Seeing the panel counts as reading the news, so clicking away leaves a
    // plain bell rather than one still demanding attention.
    if (opening) acknowledge();

    if (opening) {
      // Anchor under the bell, clamped so it never runs off a narrow screen.
      var r = btn.getBoundingClientRect();
      var width = Math.min(268, window.innerWidth - 20);
      var left = Math.min(r.right - width, window.innerWidth - width - 10);
      panel.style.width = width + 'px';
      panel.style.left = Math.max(10, left) + 'px';
      panel.style.top = (r.bottom + 10) + 'px';
    }
  }

  function closePanel() {
    var panel = document.getElementById('dj-bell-panel');
    var btn = document.getElementById('dj-bell-btn');
    if (panel) panel.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /**
   * The bell is permanent; only the glow comes and goes. Removing the control
   * once read would shift every other header button sideways, so what changes
   * is its state, not its existence.
   */
  function paintBell(unread) {
    var btn = document.getElementById('dj-bell-btn');
    if (!btn) return;
    btn.classList.toggle('has-news', !!unread);
    btn.setAttribute('aria-label', unread
      ? 'New release: ' + RELEASE.title
      : "What's new");
  }

  /** Stop glowing. Called on any acknowledgement - open, dismiss, or navigate. */
  function acknowledge() {
    markSeen();
    paintBell(false);
  }

  // ── Bell ─────────────────────────────────────────────────────────────────

  function injectBell() {
    var header = document.querySelector('header.site-header');
    if (!header || document.getElementById('dj-bell-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'dj-bell-btn';
    btn.type = 'button';
    btn.className = 'dj-bell-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = BELL_SVG;   // static string, no interpolation

    var dot = document.createElement('span');
    dot.className = 'dj-bell-dot';
    dot.setAttribute('aria-hidden', 'true');
    btn.appendChild(dot);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });

    // Sits to the LEFT of the account button so the account control stays the
    // rightmost anchor. account.js may not have run yet, so insert before it
    // when present and append otherwise.
    var acct = document.getElementById('dj-account-btn');
    if (acct) header.insertBefore(btn, acct);
    else header.appendChild(btn);
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  function boot() {
    // The bell is always in the header. isUnread() decides whether it glows,
    // not whether it exists - a control that appears and disappears shifts the
    // buttons beside it and is harder to find the second time.
    var unread = isUnread();
    injectBell();
    paintBell(unread);

    document.addEventListener('click', function (e) {
      var panel = document.getElementById('dj-bell-panel');
      if (panel && panel.classList.contains('open') && !panel.contains(e.target)) {
        closePanel();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    version: RELEASE.version,
    /** Force the panel open - handy for testing from the console. */
    show: function () { injectBell(); togglePanel(); },
    /** Clear the seen flag so the bell returns on next load. */
    reset: function () {
      try { localStorage.removeItem(SEEN_KEY); } catch (e) {}
    }
  };
})();
