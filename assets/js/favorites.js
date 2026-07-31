// DailyJamm favorites: user-curated "Your Favorite Games" list.
// Runs on every page (renders the drawer section); the home page additionally
// gets star toggles on game cards, the favorites card grid, and the add-link modal.
window.DJFav = (function () {
  'use strict';

  var KEY = 'dj_favorites';

  // Built-in games that can be favorited (id -> link info). ext = opens in new tab.
  var SITES = {
    themedle:     { title: 'Themedle',            url: '/themedle/' },
    chainlink:    { title: 'Chain Link',          url: '/chainlink/' },
    blackjackdle: { title: 'BlackJackdle',        url: '/blackjackdle/' },
    spelldle:     { title: 'Spelldle',            url: '/spelldle/' },
    roulettedle:  { title: 'Roulettedle',         url: '/roulettedle/' },
    holdle:       { title: 'Holdle',              url: '/holdle/' },
    bluffdle:     { title: 'Bluffdle',            url: '/bluffdle/' },
    akari:        { title: 'Akari',               url: 'https://dailyakari.com/', ext: true },
    bandle:       { title: 'Bandle',              url: 'https://bandle.app/', ext: true },
    circuits:     { title: 'Circuits',            url: 'https://www.puzzmo.com/play/circuits/', ext: true },
    connections:  { title: 'Connections',         url: 'https://www.nytimes.com/games/connections', ext: true },
    contexto:     { title: 'Contexto',            url: 'https://contexto.me/en/', ext: true },
    costcodle:    { title: 'Costcodle',           url: 'https://costcodle.com/', ext: true },
    crossword:    { title: 'Cross|word',          url: 'https://www.puzzmo.com/play/crossword/', ext: true },
    dailydozen:   { title: 'Daily Dozen',         url: 'https://dailydozentrivia.com/', ext: true },
    framed:       { title: 'Framed',              url: 'https://framed.wtf/', ext: true },
    guessthegame: { title: 'Guess the Game',      url: 'https://guessthe.game/', ext: true },
    heardle:      { title: 'Heardle',             url: 'https://heardlewordle.io/', ext: true },
    linxicon:     { title: 'Linxicon',            url: 'https://linxicon.com/', ext: true },
    minecraftle:  { title: 'Minecraftle',         url: 'https://minecraftle.zachmanson.com/', ext: true },
    pips:         { title: 'Pips',                url: 'https://www.nytimes.com/games/pips', ext: true },
    raddle:       { title: 'Raddle',              url: 'https://raddle.quest/', ext: true },
    songless:     { title: 'Songless',            url: 'https://lessgames.com/songless', ext: true },
    spotle:       { title: 'Spotle',              url: 'https://spotle.io/', ext: true },
    spellingbee:  { title: 'Spelling Bee',        url: 'https://www.nytimes.com/puzzles/spelling-bee', ext: true },
    tsheardle:    { title: 'Taylor Swift Heardle', url: 'https://heardlewordle.io/taylor-swift-heardle', ext: true },
    wordle:       { title: 'Wordle',              url: 'https://www.nytimes.com/games/wordle/index.html', ext: true }
  };

  // Preset icons for custom links. Static SVG strings only - never interpolate
  // user data into these.
  var ICONS = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.3 6.1-.8L12 3z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>',
    controller: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12a4 4 0 0 1 4 4v2a3 3 0 0 1-3 3h-2l-2-2h-6l-2 2H5a3 3 0 0 1-3-3v-2a4 4 0 0 1 4-4zM8 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="white"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="white" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="white" stroke-width="2"/><path d="M3 12h18" stroke="white" stroke-width="2"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="white" stroke-width="2"/><circle cx="8.7" cy="8.7" r="1.3" fill="white"/><circle cx="15.3" cy="8.7" r="1.3" fill="white"/><circle cx="12" cy="12" r="1.3" fill="white"/><circle cx="8.7" cy="15.3" r="1.3" fill="white"/><circle cx="15.3" cy="15.3" r="1.3" fill="white"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/><path d="M7 6H4v2a4 4 0 0 0 3 3.87M17 6h3v2a4 4 0 0 1-3 3.87" fill="none" stroke="white" stroke-width="2"/></svg>'
  };
  var DEFAULT_ICON = 'star';

  /* ── storage ─────────────────────────────────────────────── */

  function safeUrl(u) {
    try {
      var url = new URL(String(u), window.location.origin);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (e) { /* invalid URL */ }
    return null;
  }

  function load() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(KEY)); }
    catch (e) { raw = null; }
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (it) {
      if (!it || typeof it !== 'object') return false;
      if (it.type === 'site') return !!SITES[it.id];
      if (it.type === 'custom') {
        return typeof it.id === 'string' && typeof it.title === 'string' &&
               it.title.trim().length > 0 && !!safeUrl(it.url);
      }
      return false;
    });
  }

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function isFav(siteId) {
    return load().some(function (it) { return it.type === 'site' && it.id === siteId; });
  }

  function toggleSite(siteId) {
    if (!SITES[siteId]) return;
    var list = load();
    var idx = list.findIndex(function (it) { return it.type === 'site' && it.id === siteId; });
    if (idx >= 0) list.splice(idx, 1);
    else list.push({ type: 'site', id: siteId });
    save(list);
    renderAll();
  }

  function addCustom(title, url, icon) {
    var cleanTitle = String(title || '').trim().slice(0, 40);
    var cleanUrl = safeUrl(url);
    if (!cleanTitle || !cleanUrl) return false;
    var list = load();
    list.push({
      type: 'custom',
      id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
      title: cleanTitle,
      url: cleanUrl,
      icon: ICONS[icon] ? icon : DEFAULT_ICON
    });
    save(list);
    renderAll();
    return true;
  }

  function removeItem(id) {
    var list = load().filter(function (it) { return it.id !== id; });
    save(list);
    renderAll();
  }

  function moveItem(id, delta) {
    var list = load();
    var idx = list.findIndex(function (it) { return it.id === id; });
    var to = idx + delta;
    if (idx < 0 || to < 0 || to >= list.length) return;
    var item = list.splice(idx, 1)[0];
    list.splice(to, 0, item);
    save(list);
    renderAll();
  }

  function itemInfo(it) {
    if (it.type === 'site') {
      var s = SITES[it.id];
      return { title: s.title, url: s.url, ext: !!s.ext };
    }
    return { title: it.title, url: safeUrl(it.url), ext: true };
  }

  function openItem(it) {
    var info = itemInfo(it);
    if (!info.url) return;
    if (info.ext) window.open(info.url, '_blank', 'noopener,noreferrer');
    else window.location.href = info.url;
  }

  /* ── drawer section (all pages) ──────────────────────────── */

  function renderDrawer() {
    var drawer = document.getElementById('drawer');
    if (!drawer) return;
    var old = document.getElementById('fav-menu-sec');
    if (old) old.remove();
    var list = load();
    if (!list.length) return;

    var sec = document.createElement('div');
    sec.className = 'menu-sec';
    sec.id = 'fav-menu-sec';
    var title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'Your Favorite Games';
    sec.appendChild(title);

    list.forEach(function (it) {
      var info = itemInfo(it);
      if (!info.url) return;
      var a = document.createElement('a');
      a.className = 'menu-link';
      a.textContent = info.title;
      a.setAttribute('href', info.url);
      if (info.ext) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      sec.appendChild(a);
    });

    // Insert right after the "Our Games" section
    var after = null;
    drawer.querySelectorAll('.menu-sec').forEach(function (s) {
      var t = s.querySelector('.menu-title');
      if (t && t.textContent.trim() === 'Our Games') after = s;
    });
    if (after) after.insertAdjacentElement('afterend', sec);
    else drawer.appendChild(sec);
  }

  /* ── home page: star toggles on game cards ───────────────── */

  function starSvg() {
    var span = document.createElement('span');
    span.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.3 6.1-.8L12 3z"/></svg>';
    return span.firstChild;
  }

  function injectStars() {
    document.querySelectorAll('[data-fav-id]').forEach(function (card) {
      var id = card.getAttribute('data-fav-id');
      if (!SITES[id] || card.querySelector('.fav-star')) return;
      var btn = document.createElement('button');
      btn.className = 'fav-star';
      btn.type = 'button';
      btn.appendChild(starSvg());
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleSite(id);
      });
      card.appendChild(btn);
    });
    refreshStars();
  }

  function refreshStars() {
    document.querySelectorAll('[data-fav-id]').forEach(function (card) {
      var id = card.getAttribute('data-fav-id');
      var btn = card.querySelector('.fav-star');
      if (!btn) return;
      var fav = isFav(id);
      btn.classList.toggle('active', fav);
      btn.setAttribute('aria-label', (fav ? 'Remove ' : 'Add ') + (SITES[id] ? SITES[id].title : id) +
        (fav ? ' from your favorites' : ' to your favorites'));
      btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
    });
  }

  /* ── home page: favorites card grid ──────────────────────── */

  function iconEl(it) {
    var wrap = document.createElement('div');
    wrap.className = 'icon our';
    if (it.type === 'site') {
      var src = document.querySelector('[data-fav-id="' + it.id + '"] .icon svg');
      if (src) { wrap.appendChild(src.cloneNode(true)); return wrap; }
    }
    // Custom link (or site card not found): preset icon. Static strings only.
    wrap.innerHTML = ICONS[it.icon] || ICONS[DEFAULT_ICON];
    return wrap;
  }

  function ctrlBtn(className, label, textArrow, onClick, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.setAttribute('aria-label', label);
    b.textContent = textArrow;
    if (disabled) b.disabled = true;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function renderGrid() {
    var grid = document.getElementById('yf-grid');
    if (!grid) return;
    grid.textContent = '';
    var list = load();

    var empty = document.getElementById('yf-empty');
    if (empty) empty.style.display = list.length ? 'none' : '';

    list.forEach(function (it, i) {
      var info = itemInfo(it);
      if (!info.url) return;

      var card = document.createElement('article');
      card.className = 'card our yf-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Play ' + info.title);
      card.addEventListener('click', function () { openItem(it); });

      var ctrls = document.createElement('div');
      ctrls.className = 'yf-ctrls';
      ctrls.appendChild(ctrlBtn('yf-ctrl', 'Move ' + info.title + ' earlier', '‹',
        function () { moveItem(it.id, -1); }, i === 0));
      ctrls.appendChild(ctrlBtn('yf-ctrl', 'Move ' + info.title + ' later', '›',
        function () { moveItem(it.id, 1); }, i === list.length - 1));
      card.appendChild(ctrls);

      card.appendChild(ctrlBtn('yf-ctrl yf-remove', 'Remove ' + info.title + ' from your favorites', '×',
        function () { removeItem(it.id); }, false));

      card.appendChild(iconEl(it));

      var h3 = document.createElement('h3');
      h3.textContent = info.title;
      card.appendChild(h3);

      var p = document.createElement('p');
      if (it.type === 'site') {
        var srcP = document.querySelector('[data-fav-id="' + it.id + '"] p');
        p.textContent = srcP ? srcP.textContent : '';
      } else {
        try { p.textContent = new URL(info.url).hostname.replace(/^www\./, ''); }
        catch (e) { p.textContent = ''; }
      }
      card.appendChild(p);

      grid.appendChild(card);
    });

    // "Add your own" card, always last
    var add = document.createElement('article');
    add.className = 'card yf-add-card';
    add.setAttribute('role', 'button');
    add.setAttribute('tabindex', '0');
    add.setAttribute('aria-label', 'Add your own game link');
    add.addEventListener('click', openModal);
    var addIcon = document.createElement('div');
    addIcon.className = 'icon';
    addIcon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>';
    add.appendChild(addIcon);
    var addH3 = document.createElement('h3');
    addH3.textContent = 'Add Your Own';
    add.appendChild(addH3);
    var addP = document.createElement('p');
    addP.textContent = 'Link any daily game you love';
    add.appendChild(addP);
    grid.appendChild(add);
  }

  /* ── home page: add-link modal ───────────────────────────── */

  var selectedIcon = DEFAULT_ICON;

  function buildIconPicker() {
    var holder = document.getElementById('yf-icons');
    if (!holder) return;
    holder.textContent = '';
    Object.keys(ICONS).forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'yf-icon-btn';
      b.dataset.icon = key;
      b.setAttribute('aria-label', key + ' icon');
      b.innerHTML = ICONS[key];
      b.addEventListener('click', function () { selectIcon(key); });
      holder.appendChild(b);
    });
    selectIcon(DEFAULT_ICON);
  }

  function selectIcon(key) {
    selectedIcon = ICONS[key] ? key : DEFAULT_ICON;
    document.querySelectorAll('.yf-icon-btn').forEach(function (b) {
      var sel = b.dataset.icon === selectedIcon;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
    });
  }

  function showError(msg) {
    var err = document.getElementById('yf-error');
    if (!err) return;
    err.textContent = msg || '';
    err.hidden = !msg;
  }

  function openModal() {
    var bd = document.getElementById('yf-modal-backdrop');
    if (!bd) return;
    showError('');
    document.getElementById('yf-name').value = '';
    document.getElementById('yf-url').value = '';
    selectIcon(DEFAULT_ICON);
    bd.classList.add('open');
    document.addEventListener('keydown', onModalKey);
    setTimeout(function () { document.getElementById('yf-name').focus(); }, 50);
  }

  function closeModal() {
    var bd = document.getElementById('yf-modal-backdrop');
    if (!bd) return;
    bd.classList.remove('open');
    document.removeEventListener('keydown', onModalKey);
  }

  function onModalKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  function submitModal() {
    var title = document.getElementById('yf-name').value.trim();
    var url = document.getElementById('yf-url').value.trim();
    if (!title) { showError('Please enter a name for this game.'); return; }
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!url || !safeUrl(url) || url.indexOf('.') < 0) {
      showError('Please enter a valid link, like https://example.com');
      return;
    }
    if (!addCustom(title, url, selectedIcon)) {
      showError('Please enter a valid link, like https://example.com');
      return;
    }
    closeModal();
  }

  function wireModal() {
    var bd = document.getElementById('yf-modal-backdrop');
    if (!bd) return;
    buildIconPicker();
    bd.addEventListener('click', function (e) { if (e.target === bd) closeModal(); });
    document.getElementById('yf-cancel').addEventListener('click', closeModal);
    document.getElementById('yf-save').addEventListener('click', submitModal);
    ['yf-name', 'yf-url'].forEach(function (id) {
      document.getElementById(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitModal(); }
      });
    });
  }

  /* ── intro modal (one-time on home; re-shown via DJFav.showIntro) ── */

  var INTRO_KEY = 'dj_seen_favs_intro';

  // Static markup only - never interpolate user data into this.
  var INTRO_HTML =
    '<div class="yf-modal" role="dialog" aria-modal="true" aria-labelledby="yf-intro-title">' +
      '<h3 id="yf-intro-title">New: Your Favorite Games</h3>' +
      '<p class="yf-modal-sub">Build your own list of daily games, right on the home page.</p>' +
      '<div class="yf-demo" aria-hidden="true">' +
        '<div class="yfd-card" id="yfd-a">' +
          '<span class="yfd-star">★</span><span class="yfd-arrow">‹ ›</span>' +
          '<div class="yfd-icon"></div><div class="yfd-bar"></div><div class="yfd-bar short"></div>' +
        '</div>' +
        '<div class="yfd-card" id="yfd-b">' +
          '<span class="yfd-star">★</span><span class="yfd-arrow">‹ ›</span>' +
          '<div class="yfd-icon"></div><div class="yfd-bar"></div><div class="yfd-bar short"></div>' +
        '</div>' +
        '<div class="yfd-pointer"></div>' +
      '</div>' +
      '<ul class="yf-intro-list">' +
        '<li><strong>Star any game</strong> on the home page to pin it to Your Favorite Games</li>' +
        '<li><strong>Add your own links</strong> to any daily game on the web - pick an icon, a name, and a link</li>' +
        '<li><strong>Reorder</strong> with the arrows on each card, <strong>remove</strong> with the x</li>' +
        '<li>Your list also appears in the <strong>menu</strong> on every page</li>' +
      '</ul>' +
      '<div class="yf-modal-btns">' +
        '<button id="yf-intro-ok" class="yf-btn yf-btn-primary" type="button">Got it!</button>' +
      '</div>' +
    '</div>';

  function ensureIntro() {
    var bd = document.getElementById('yf-intro-backdrop');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.id = 'yf-intro-backdrop';
    bd.className = 'yf-modal-backdrop';
    bd.innerHTML = INTRO_HTML;
    document.body.appendChild(bd);
    bd.addEventListener('click', function (e) { if (e.target === bd) closeIntro(); });
    bd.querySelector('#yf-intro-ok').addEventListener('click', closeIntro);
    return bd;
  }

  function onIntroKey(e) { if (e.key === 'Escape') closeIntro(); }

  function showIntro() {
    ensureIntro().classList.add('open');
    document.addEventListener('keydown', onIntroKey);
  }

  function closeIntro() {
    var bd = document.getElementById('yf-intro-backdrop');
    if (bd) bd.classList.remove('open');
    localStorage.setItem(INTRO_KEY, '1');
    document.removeEventListener('keydown', onIntroKey);
  }

  /* ── boot ────────────────────────────────────────────────── */

  function renderAll() {
    renderDrawer();
    renderGrid();
    refreshStars();
  }

  function boot() {
    renderDrawer();
    if (document.getElementById('yf-grid')) {
      injectStars();
      wireModal();
      renderGrid();
      if (!localStorage.getItem(INTRO_KEY)) {
        setTimeout(showIntro, 600);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { openModal: openModal, closeModal: closeModal, showIntro: showIntro };
})();
