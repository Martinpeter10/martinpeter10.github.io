(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const MAX_GUESSES = 8;
  const STATS_KEY   = 'spd_stats';
  const TODAY_KEY   = 'spd_today';
  const SEEN_KEY    = 'spd_seen_howto';

  const RANGE_TIERS    = ['self', 'touch', 'short', 'medium', 'long', 'special'];
  const DURATION_TIERS = ['instant', 'round', 'minute', '10min', 'hour', '8hours', 'day', 'permanent'];

  const LEVEL_LABELS = ['Cantrip','1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];
  const RANGE_LABELS    = { self:'Self', touch:'Touch', short:'30 ft', medium:'60-120 ft', long:'150+ ft', special:'Special' };
  const DURATION_LABELS = { instant:'Instant', round:'1 Round', minute:'1 Min', '10min':'10 Min', hour:'1 Hour', '8hours':'8 Hours', day:'24 Hours', permanent:'Permanent' };
  const CASTING_LABELS  = { action:'Action', bonus:'Bonus', reaction:'Reaction', minute:'1+ Min' };
  const CLASS_ABBREVS   = { bard:'Brd', cleric:'Clr', druid:'Drd', paladin:'Pal', ranger:'Rgr', sorcerer:'Sor', warlock:'Wlk', wizard:'Wiz' };
  const SCHOOL_ABBREVS  = { Abjuration:'Abj', Conjuration:'Conj', Divination:'Div', Enchantment:'Ench', Evocation:'Evoc', Illusion:'Illus', Necromancy:'Necro', Transmutation:'Trans' };

  // Cached formatter for countdown — avoids creating a new object every second
  const COUNTDOWN_FMT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  // ── Date helpers (DST-safe Chicago) ──────────────────────────────────────
  function getTodayCST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  }

  // ── Puzzle selection (day-of-year, same as Chain Link) ───────────────────
  function getPuzzleIndex() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const map  = Object.fromEntries(parts.map(function (p) { return [p.type, p.value]; }));
    const year  = parseInt(map.year);
    const month = parseInt(map.month);
    const day   = parseInt(map.day);
    const jan1  = new Date(Date.UTC(year, 0, 1, 12));
    const today = new Date(Date.UTC(year, month - 1, day, 12));
    return Math.round((today - jan1) / 86400000) + 1; // 1-indexed day of year
  }

  // ── State ────────────────────────────────────────────────────────────────
  const todayCST  = getTodayCST();
  let spells      = [];
  let answer      = null;
  let puzzleNum   = 1;
  let guesses     = []; // [{ spellName, results: [{attr,status,arrow,display},...] }]
  let gameOver    = false;

  // ── localStorage ─────────────────────────────────────────────────────────
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { streak: 0, best: 0, played: 0, wins: 0 }; }
    catch (e) { return { streak: 0, best: 0, played: 0, wins: 0 }; }
  }

  function saveStats(won) {
    var s = loadStats();
    s.played++;
    if (won) {
      s.wins = (s.wins || 0) + 1;
      s.streak++;
      if (s.streak > s.best) s.best = s.streak;
    } else { s.streak = 0; }
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
    return s;
  }

  function loadTodayState() {
    try {
      var raw = localStorage.getItem(TODAY_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (d.todayDate !== todayCST) return null;
      return d;
    } catch (e) { return null; }
  }

  function saveTodayState() {
    localStorage.setItem(TODAY_KEY, JSON.stringify({
      todayDate: todayCST,
      puzzleNum: puzzleNum,
      guesses:   guesses,
      gameOver:  gameOver,
    }));
  }

  // ── Comparison logic ─────────────────────────────────────────────────────
  function compareGuess(guess, ans) {
    var results = [];

    // Level (0-9): green=exact, yellow=within ±2 with arrow, red=>2 off
    (function () {
      var status, arrow = null;
      if (guess.level === ans.level) {
        status = 'green';
      } else if (Math.abs(guess.level - ans.level) <= 2) {
        status = 'yellow';
        arrow  = ans.level > guess.level ? '↑' : '↓';
      } else {
        status = 'red';
        arrow  = ans.level > guess.level ? '↑' : '↓';
      }
      results.push({ attr: 'level', status: status, arrow: arrow, display: LEVEL_LABELS[guess.level] });
    })();

    // School: green=exact, red=wrong
    results.push({
      attr: 'school', arrow: null,
      status:  guess.school === ans.school ? 'green' : 'red',
      display: SCHOOL_ABBREVS[guess.school] || guess.school,
    });

    // Casting time: green=exact, red=wrong
    results.push({
      attr: 'castingTime', arrow: null,
      status:  guess.castingTime === ans.castingTime ? 'green' : 'red',
      display: CASTING_LABELS[guess.castingTime] || guess.castingTime,
    });

    // Range: green=exact, yellow=adjacent tier with arrow, red=>1 tier off
    (function () {
      var gi = RANGE_TIERS.indexOf(guess.range);
      var ai = RANGE_TIERS.indexOf(ans.range);
      var status, arrow = null;
      if (gi === ai) {
        status = 'green';
      } else if (Math.abs(gi - ai) === 1) {
        status = 'yellow';
        arrow  = ai > gi ? '↑' : '↓';
      } else {
        status = 'red';
        arrow  = ai > gi ? '↑' : '↓';
      }
      results.push({ attr: 'range', status: status, arrow: arrow, display: RANGE_LABELS[guess.range] || guess.range });
    })();

    // Components: green=exact, yellow=≥1 shared letter, red=no overlap
    (function () {
      var gc = guess.components;
      var ac = ans.components;
      var status;
      if (gc === ac) {
        status = 'green';
      } else {
        var shared = false;
        for (var i = 0; i < gc.length; i++) {
          if (ac.indexOf(gc[i]) !== -1) { shared = true; break; }
        }
        status = shared ? 'yellow' : 'red';
      }
      results.push({ attr: 'components', status: status, arrow: null, display: guess.components });
    })();

    // Concentration: green=exact, red=wrong
    results.push({
      attr: 'concentration', arrow: null,
      status:  guess.concentration === ans.concentration ? 'green' : 'red',
      display: guess.concentration ? 'Yes' : 'No',
    });

    // Ritual: green=exact, red=wrong
    results.push({
      attr: 'ritual', arrow: null,
      status:  guess.ritual === ans.ritual ? 'green' : 'red',
      display: guess.ritual ? 'Yes' : 'No',
    });

    // Duration: green=exact, yellow=adjacent tier with arrow, red=>1 tier off
    (function () {
      var gi = DURATION_TIERS.indexOf(guess.duration);
      var ai = DURATION_TIERS.indexOf(ans.duration);
      var status, arrow = null;
      if (gi === ai) {
        status = 'green';
      } else if (Math.abs(gi - ai) === 1) {
        status = 'yellow';
        arrow  = ai > gi ? '↑' : '↓';
      } else {
        status = 'red';
        arrow  = ai > gi ? '↑' : '↓';
      }
      results.push({ attr: 'duration', status: status, arrow: arrow, display: DURATION_LABELS[guess.duration] || guess.duration });
    })();

    // Classes: green=exact same set, yellow=≥1 class in common, red=no overlap
    (function () {
      var gc = (guess.classes || []).slice().sort();
      var ac = (ans.classes   || []).slice().sort();
      var status;
      if (gc.join(',') === ac.join(',')) {
        status = 'green';
      } else {
        var shared = gc.some(function (c) { return ac.indexOf(c) !== -1; });
        status = shared ? 'yellow' : 'red';
      }
      var names = (guess.classes || []).map(function (c) { return CLASS_ABBREVS[c] || c; });
      var display;
      if (names.length <= 2) {
        display = names.join('/');
      } else if (names.length <= 4) {
        var half = Math.ceil(names.length / 2);
        display = names.slice(0, half).join('/') + '\n' + names.slice(half).join('/');
      } else {
        display = names.slice(0, 2).join('/') + '\n' + names[2] + '+' + (names.length - 3);
      }
      results.push({ attr: 'classes', status: status, arrow: null, display: display });
    })();

    return results;
  }

  function isWin(results) {
    return results.every(function (r) { return r.status === 'green'; });
  }

  // ── Autocomplete ─────────────────────────────────────────────────────────
  var selectedDropdownIndex = -1;
  var dropdownItems = [];

  function guessedNames() {
    return guesses.map(function (g) { return g.spellName.toLowerCase(); });
  }

  function filterSpells(query) {
    var q = query.toLowerCase().trim();
    if (!q) return [];
    var already = new Set(guessedNames());
    var startsWith = [], contains = [];
    spells.forEach(function (s) {
      var n = s.name.toLowerCase();
      if (already.has(n)) return;
      if (n.startsWith(q)) startsWith.push(s);
      else if (n.indexOf(q) !== -1) contains.push(s);
    });
    return startsWith.concat(contains).slice(0, 8);
  }

  function renderDropdown(matches) {
    var ul = document.getElementById('spd-dropdown');
    if (!matches.length) { ul.classList.add('hidden'); dropdownItems = []; selectedDropdownIndex = -1; return; }
    ul.innerHTML = '';
    dropdownItems = matches;
    selectedDropdownIndex = -1;
    matches.forEach(function (spell, i) {
      var li = document.createElement('li');
      li.textContent = spell.name;
      li.setAttribute('role', 'option');
      li.setAttribute('data-index', i);
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        selectSpell(spell);
      });
      ul.appendChild(li);
    });
    ul.classList.remove('hidden');
  }

  function hideDropdown() {
    var ul = document.getElementById('spd-dropdown');
    ul.classList.add('hidden');
    dropdownItems = [];
    selectedDropdownIndex = -1;
  }

  function selectSpell(spell) {
    var input = document.getElementById('spd-input');
    input.value = spell.name;
    hideDropdown();
    submitGuess();
  }

  function highlightDropdownItem(index) {
    var items = document.querySelectorAll('#spd-dropdown li');
    items.forEach(function (li, i) {
      li.classList.toggle('spd-dropdown-active', i === index);
    });
  }

  // ── Board rendering ──────────────────────────────────────────────────────
  function renderBoard(animateLastRow) {
    var board     = document.getElementById('spd-board');
    var namesCol  = document.getElementById('spd-names');
    board.innerHTML    = '';
    namesCol.innerHTML = '';

    guesses.forEach(function (guess, rowIndex) {
      // Name cell in frozen left column
      var nameCell = document.createElement('div');
      nameCell.className = 'spd-cell spd-name-cell';
      nameCell.textContent = guess.spellName;
      namesCol.appendChild(nameCell);

      // Attribute row in scrollable right panel
      var row = document.createElement('div');
      row.className = 'spd-row';

      guess.results.forEach(function (r, colIndex) {
        var cell = document.createElement('div');
        cell.className = 'spd-cell spd-tile spd-' + r.status;
        if (animateLastRow && rowIndex === guesses.length - 1) {
          cell.style.animationDelay = (colIndex * 100) + 'ms';
          cell.classList.add('spd-tile-pop');
        }

        var top = document.createElement('span');
        top.className = 'spd-tile-val';
        top.textContent = r.display;
        cell.appendChild(top);

        if (r.arrow) {
          var arrow = document.createElement('span');
          arrow.className = 'spd-tile-arrow';
          arrow.textContent = r.arrow;
          cell.appendChild(arrow);
        }

        row.appendChild(cell);
      });

      board.appendChild(row);
    });

    // Empty rows for remaining guesses
    var remaining = MAX_GUESSES - guesses.length;
    for (var i = 0; i < remaining; i++) {
      var emptyName = document.createElement('div');
      emptyName.className = 'spd-cell spd-name-cell spd-empty-cell';
      namesCol.appendChild(emptyName);

      var row = document.createElement('div');
      row.className = 'spd-row spd-row-empty';
      for (var j = 0; j < 9; j++) {
        var cell = document.createElement('div');
        cell.className = 'spd-cell spd-tile spd-empty';
        row.appendChild(cell);
      }
      board.appendChild(row);
    }

    updateGuessCounter();

    // Scroll attr panel to show latest row; sync name column
    if (animateLastRow) {
      var attrScroll = document.getElementById('spd-attr-scroll');
      attrScroll.scrollTop = attrScroll.scrollHeight;
      namesCol.scrollTop   = attrScroll.scrollTop;
    }
  }

  function updateGuessCounter() {
    var el = document.getElementById('spd-guess-count');
    if (el) el.textContent = guesses.length + ' / ' + MAX_GUESSES;
  }

  // ── Animations / toast ────────────────────────────────────────────────────
  function shakeInput() {
    var row = document.getElementById('spd-input-row');
    row.classList.remove('spd-shake');
    void row.offsetWidth; // reflow
    row.classList.add('spd-shake');
    setTimeout(function () { row.classList.remove('spd-shake'); }, 400);
  }

  function toastMessage(text) {
    var toast = document.getElementById('spd-toast');
    toast.textContent = text;
    toast.classList.remove('hidden');
    toast.classList.add('spd-toast-show');
    setTimeout(function () {
      toast.classList.remove('spd-toast-show');
      setTimeout(function () { toast.classList.add('hidden'); }, 300);
    }, 1500);
  }

  // ── Submit / game flow ────────────────────────────────────────────────────
  function submitGuess() {
    if (gameOver) return;

    var input = document.getElementById('spd-input');
    var raw   = input.value.trim();
    if (!raw) return;

    // Find matching spell (case-insensitive)
    var guessSpell = null;
    var rawLower = raw.toLowerCase();
    for (var i = 0; i < spells.length; i++) {
      if (spells[i].name.toLowerCase() === rawLower) { guessSpell = spells[i]; break; }
    }

    if (!guessSpell) {
      shakeInput();
      toastMessage('Spell not found — check the spelling!');
      return;
    }

    // Already guessed?
    if (guessedNames().indexOf(guessSpell.name.toLowerCase()) !== -1) {
      shakeInput();
      toastMessage('Already guessed that one!');
      return;
    }

    var results = compareGuess(guessSpell, answer);
    guesses.push({ spellName: guessSpell.name, results: results });
    saveTodayState();
    input.value = '';
    hideDropdown();
    renderBoard(true);

    if (isWin(results)) {
      gameOver = true;
      saveTodayState();
      setTimeout(function () { handleWin(); }, 600);
    } else if (guesses.length >= MAX_GUESSES) {
      gameOver = true;
      saveTodayState();
      setTimeout(function () { handleLoss(); }, 600);
    } else {
      setTimeout(function () { input.focus(); }, 50);
    }
  }

  function handleWin() {
    var stats = saveStats(true);
    showResults(false, true, stats);
  }

  function handleLoss() {
    var stats = saveStats(false);
    showResults(false, false, stats);
  }

  // ── Results panel ─────────────────────────────────────────────────────────
  function buildShareEmojis() {
    return guesses.map(function (g) {
      return g.results.map(function (r) {
        return r.status === 'green' ? '🟢' : r.status === 'yellow' ? '🟡' : '🔴';
      }).join('');
    }).join('\n');
  }

  function showResults(isRestore, won, stats) {
    var inputArea  = document.getElementById('spd-input-area');
    var resultsEl  = document.getElementById('spd-results');
    var heading    = document.getElementById('spd-result-heading');
    var sub        = document.getElementById('spd-result-sub');
    var ansReveal  = document.getElementById('spd-answer-reveal');

    inputArea.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    resultsEl.classList.add('spd-fade-up');

    if (isRestore) {
      won   = guesses.length > 0 && isWin(guesses[guesses.length - 1].results);
      stats = loadStats();
    }

    if (won) {
      heading.textContent = guesses.length === 1 ? 'First try! 🧙' : 'Spell identified! ✨';
      sub.textContent     = 'You got it in ' + guesses.length + '/' + MAX_GUESSES + ' guesses.';
      ansReveal.classList.add('hidden');
    } else {
      heading.textContent = 'Out of guesses!';
      sub.textContent     = 'Better luck tomorrow.';
      ansReveal.textContent = 'The spell was: ' + answer.name;
      ansReveal.classList.remove('hidden');
    }

    // Stats
    document.getElementById('spd-stat-streak').textContent = stats ? stats.streak : loadStats().streak;
    document.getElementById('spd-stat-best').textContent   = stats ? stats.best   : loadStats().best;
    document.getElementById('spd-stat-played').textContent = stats ? stats.played : loadStats().played;
  }

  // ── Share ────────────────────────────────────────────────────────────────
  function handleShare() {
    var won       = guesses.length > 0 && isWin(guesses[guesses.length - 1].results);
    var winLine   = won ? guesses.length + '/' + MAX_GUESSES : 'X/' + MAX_GUESSES;
    var text      = 'Spelldle #' + puzzleNum + ' \u2014 ' + winLine + '\nhttps://dailyjamm.com/spelldle/';
    var btn       = document.getElementById('spd-share-btn');
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Share Results'; }, 2000);
    }).catch(function () {
      toastMessage('Copy failed — try selecting the text manually.');
    });
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  function updateCountdown() {
    var parts = COUNTDOWN_FMT.formatToParts(new Date());
    var map = Object.fromEntries(parts.map(function (p) { return [p.type, p.value]; }));
    var secsToday = parseInt(map.hour) * 3600 + parseInt(map.minute) * 60 + parseInt(map.second);
    var remaining = Math.max(0, 86400 - secsToday);
    var h = Math.floor(remaining / 3600);
    var m = Math.floor((remaining % 3600) / 60);
    var s = remaining % 60;
    var el = document.getElementById('spd-countdown');
    if (el) el.textContent =
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0');
  }

  // ── How to Play modal ────────────────────────────────────────────────────
  function openModal() {
    document.getElementById('spd-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('spd-modal').classList.add('hidden');
    if (!gameOver) setTimeout(function () { document.getElementById('spd-input').focus(); }, 50);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    var dayIndex = getPuzzleIndex();
    puzzleNum    = dayIndex;
    answer       = spells[(dayIndex - 1) % spells.length];

    document.getElementById('spd-meta').textContent = 'Daily Spelldle #' + puzzleNum;

    // Restore saved state
    var saved = loadTodayState();
    if (saved) {
      guesses  = saved.guesses  || [];
      gameOver = saved.gameOver || false;
    }

    renderBoard(false);

    if (gameOver) {
      showResults(true, null, null);
    } else {
      if (!localStorage.getItem(SEEN_KEY)) {
        localStorage.setItem(SEEN_KEY, '1');
        openModal();
      } else {
        setTimeout(function () { document.getElementById('spd-input').focus(); }, 50);
      }
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    // Events
    var input     = document.getElementById('spd-input');
    var submitBtn = document.getElementById('spd-submit-btn');
    var shareBtn  = document.getElementById('spd-share-btn');
    var helpBtn   = document.getElementById('spd-help-btn');
    var modal     = document.getElementById('spd-modal');

    input.addEventListener('input', function () {
      renderDropdown(filterSpells(input.value));
    });

    input.addEventListener('keydown', function (e) {
      var items = document.querySelectorAll('#spd-dropdown li');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedDropdownIndex = Math.min(selectedDropdownIndex + 1, items.length - 1);
        highlightDropdownItem(selectedDropdownIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedDropdownIndex = Math.max(selectedDropdownIndex - 1, -1);
        highlightDropdownItem(selectedDropdownIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedDropdownIndex >= 0 && dropdownItems[selectedDropdownIndex]) {
          selectSpell(dropdownItems[selectedDropdownIndex]);
        } else {
          submitGuess();
        }
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });

    input.addEventListener('blur', function () {
      // Delay hide so mousedown on dropdown fires first
      setTimeout(hideDropdown, 150);
    });

    // Sync name column vertical scroll with attr panel
    var attrScroll = document.getElementById('spd-attr-scroll');
    attrScroll.addEventListener('scroll', function () {
      document.getElementById('spd-names').scrollTop = attrScroll.scrollTop;
    });

    submitBtn.addEventListener('click', submitGuess);
    shareBtn.addEventListener('click', handleShare);
    helpBtn.addEventListener('click', openModal);
    document.getElementById('spd-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    var statsBtn   = document.getElementById('spd-stats-btn');
    var statsModal = document.getElementById('spd-stats-modal');
    if (statsBtn)   statsBtn.addEventListener('click', showStats);
    if (statsModal) statsModal.addEventListener('click', function (e) { if (e.target === statsModal) closeStats(); });
    var statsClose = document.getElementById('spd-stats-close');
    if (statsClose) statsClose.addEventListener('click', closeStats);

    // ESC closes the modal (per site convention)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!modal.classList.contains('hidden')) closeModal();
        closeStats();
      }
    });
  }

  function showStats() {
    var s      = loadStats();
    var played = s.played || 0;
    var wins   = s.wins   || 0;
    var winPct = played > 0 ? Math.round(wins / played * 100) : 0;

    function row(label, value, color) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2937">' +
        '<span style="color:#9ca3af;font-size:13px">' + label + '</span>' +
        '<span style="font-weight:800;font-size:15px;color:' + (color || '#fff') + '">' + value + '</span>' +
      '</div>';
    }

    var el = document.getElementById('spd-stats-content');
    if (el) {
      el.innerHTML =
        row('Games Played', played) +
        row('Wins', wins, '#4ade80') +
        row('Win Rate', winPct + '%', winPct >= 50 ? '#4ade80' : '#f87171') +
        row('Current Streak', s.streak, '#facc15') +
        row('Best Streak', s.best, '#a78bfa');
    }
    var statsModal = document.getElementById('spd-stats-modal');
    if (statsModal) statsModal.classList.remove('hidden');
  }

  function closeStats() {
    var statsModal = document.getElementById('spd-stats-modal');
    if (statsModal) statsModal.classList.add('hidden');
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    fetch('/assets/data/spelldle-spells.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        spells = data;
        init();
      })
      .catch(function () {
        document.getElementById('spd-board').innerHTML =
          '<p class="text-sm text-red-400 text-center py-8">Failed to load spells. Please refresh.</p>';
      });
  });
})();
