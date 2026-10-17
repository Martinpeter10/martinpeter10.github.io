// Shared hamburger menu logic for all DailyJamm pages
(function () {
  const drawer   = document.getElementById('drawer');
  const backdrop = document.getElementById('backdrop');
  const btn      = document.querySelector('.hamburger');

  function openMenu() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    document.documentElement.classList.add('overflow-hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey);
  }
  function closeMenu() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    document.documentElement.classList.remove('overflow-hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey);
  }
  function toggleMenu() {
    if (drawer.classList.contains('open')) { closeMenu(); } else { openMenu(); }
  }
  function onKey(e) { if (e.key === 'Escape') closeMenu(); }

  // ── Leaderboards button ──────────────────────────────────────────────────
  // Injected rather than hardcoded, for the same reason as the account button
  // and the bell: sixteen copies of the same markup drift apart. menu.js runs
  // before account.js and notify.js, so appending here yields the intended
  // order: stats -> help -> trophy -> bell -> account.
  var TROPHY =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/>' +
    '<path d="M7 6H4v2a4 4 0 0 0 3 3.87M17 6h3v2a4 4 0 0 1-3 3.87"/></svg>';

  function injectBoards() {
    var header = document.querySelector('header.site-header');
    if (!header || document.getElementById('dj-boards-btn')) return;
    // No point linking the page to itself.
    if (location.pathname.indexOf('/leaderboards') === 0) return;

    var a = document.createElement('a');
    a.id = 'dj-boards-btn';
    a.className = 'dj-boards-btn';
    a.href = '/leaderboards/';
    a.setAttribute('aria-label', 'Leaderboards');
    a.innerHTML = TROPHY;   // static string, no interpolation
    header.appendChild(a);
  }

  // ── One-time "there is a leaderboards button now" intro ──────────────────
  //
  // Same contract as the favorites intro: shown once, dismissed forever. A new
  // control in the header is invisible to someone who already knows where
  // everything is, which is exactly the returning player this is for.
  //
  // It spotlights the REAL button rather than drawing a picture of one. The
  // backdrop sits at z-index 1000, just UNDER the header's 1001, so the header
  // stays lit while the page behind it dims - a child of the header cannot be
  // raised above a backdrop that covers the header, because the header's own
  // z-index makes it a stacking context.
  var BOARDS_INTRO_KEY = 'dj_seen_boards_intro';
  var FAVS_INTRO_KEY   = 'dj_seen_favs_intro';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return '1'; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function closeBoardsIntro() {
    var bd = document.getElementById('dj-boards-intro');
    if (bd) bd.remove();
    var t = document.getElementById('dj-boards-btn');
    if (t) t.classList.remove('is-spotlit');
    lsSet(BOARDS_INTRO_KEY, '1');
    document.removeEventListener('keydown', onBoardsKey);
  }

  function onBoardsKey(e) { if (e.key === 'Escape') closeBoardsIntro(); }

  function showBoardsIntro() {
    var trophy = document.getElementById('dj-boards-btn');
    if (!trophy || document.getElementById('dj-boards-intro')) return;

    var bd = document.createElement('div');
    bd.id = 'dj-boards-intro';
    bd.className = 'dj-bi-backdrop';
    bd.addEventListener('click', function (e) {
      if (e.target === bd) closeBoardsIntro();
    });

    var card = document.createElement('div');
    card.className = 'dj-bi-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'dj-bi-title');

    var h = document.createElement('h3');
    h.id = 'dj-bi-title';
    h.textContent = 'New: Leaderboards';
    card.appendChild(h);

    var p1 = document.createElement('p');
    p1.textContent = 'Tap the trophy up here to see how you compare on every game - '
                   + 'your streaks, your averages and where you rank.';
    card.appendChild(p1);

    var p2 = document.createElement('p');
    p2.className = 'dj-bi-fine';
    p2.textContent = 'Sign in to appear on them. Playing stays free either way.';
    card.appendChild(p2);

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'dj-bi-ok';
    ok.textContent = 'Got it';
    ok.addEventListener('click', closeBoardsIntro);
    card.appendChild(ok);

    bd.appendChild(card);
    document.body.appendChild(bd);
    trophy.classList.add('is-spotlit');
    document.addEventListener('keydown', onBoardsKey);

    // Point the caret at where the trophy ACTUALLY is. A fixed offset looked
    // right at one width and pointed at the bell at another - the header has
    // a different number of controls per page and shrinks under 420px.
    try {
      var t = trophy.getBoundingClientRect();
      var c = card.getBoundingClientRect();
      var fromRight = c.right - (t.left + t.width / 2);
      // Keep it on the card, and clear of the rounded corners.
      fromRight = Math.max(18, Math.min(c.width - 30, fromRight));
      card.style.setProperty('--dj-bi-caret', fromRight + 'px');
    } catch (e) { /* the default offset in CSS still looks deliberate */ }

    // Focus the dialog itself rather than its button: a screen reader
    // announces the whole thing, and a programmatic focus ring on a big green
    // button reads as an error state.
    try { card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true }); } catch (e) {}
  }

  function maybeShowBoardsIntro() {
    // Home only, matching the favorites intro. A modal over a game someone
    // opened deliberately is worse than one they never see.
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    if (lsGet(BOARDS_INTRO_KEY)) return;
    // Never two at once. A first-ever visitor gets the favorites intro now and
    // this one on their next visit.
    if (!lsGet(FAVS_INTRO_KEY)) return;
    setTimeout(showBoardsIntro, 900);
  }

  function boot() {
    injectBoards();
    maybeShowBoardsIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.toggleMenu = toggleMenu;
  window.closeMenu  = closeMenu;
  // Console helper, same as DJNotify.reset(): clear the flag to see it again.
  window.DJBoardsIntro = {
    show: showBoardsIntro,
    reset: function () { try { localStorage.removeItem(BOARDS_INTRO_KEY); } catch (e) {} }
  };
})();
