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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBoards);
  } else {
    injectBoards();
  }

  window.toggleMenu = toggleMenu;
  window.closeMenu  = closeMenu;
})();
