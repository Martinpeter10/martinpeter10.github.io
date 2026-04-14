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

  window.toggleMenu = toggleMenu;
  window.closeMenu  = closeMenu;
})();
