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

  const SECONDS_PER_DAY  = 86400;
  const SECONDS_PER_HOUR = 3600;
  const SHARE_RESET_MS   = 2000;

  // Cached formatter for countdown — avoids creating a new object every second
  const COUNTDOWN_FMT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  // ── Puzzle selection (days since epoch, shuffled per cycle) ─────────────
  // Epoch = Jan 1 2026. Each cycle of N spells uses a seeded Fisher-Yates
  // shuffle so the order is random but deterministic (same spell for all
  // players on the same day) and every spell appears once before repeating.
  const SPELL_EPOCH = new Date('2026-01-01T12:00:00Z');

  function getPuzzleIndex() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const map   = Object.fromEntries(parts.map(function (p) { return [p.type, p.value]; }));
    const year  = parseInt(map.year);
    const month = parseInt(map.month);
    const day   = parseInt(map.day);
    const local = new Date(Date.UTC(year, month - 1, day, 12));
    return Math.round((local - SPELL_EPOCH) / 86400000) + 1; // 1-indexed days since epoch
  }

  // Mulberry32 seeded RNG — deterministic, fast, good distribution
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Returns the spell array index for a given 1-indexed puzzle day
  function getShuffledSpellIndex(dayIndex, count) {
    const cycle      = Math.floor((dayIndex - 1) / count);
    const posInCycle = (dayIndex - 1) % count;
    const seed       = (0xABCD1234 + cycle * 0x9E3779B9) >>> 0;
    const rng        = mulberry32(seed);
    const arr        = [];
    for (let i = 0; i < count; i++) arr[i] = i;
    for (let i = count - 1; i > 0; i--) {
      const j   = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr[posInCycle];
  }

  // ── State ────────────────────────────────────────────────────────────────
  const todayCST  = DJUtils.getChicagoDate();
  let spells      = [];
  let answer      = null;
  let puzzleNum   = 1;
  let guesses     = []; // [{ spellName, results: [{attr,status,arrow,display},...] }]
  let gameOver    = false;

  // ── localStorage ─────────────────────────────────────────────────────────
  // guessDistribution: indices 0..(MAX_GUESSES-1) = won on guess N; last = losses
  const DIST_LEN = MAX_GUESSES + 1;

  function loadStats() {
    const defaults = { streak: 0, best: 0, played: 0, wins: 0, guessDistribution: new Array(DIST_LEN).fill(0) };
    const s = DJUtils.loadJSON(STATS_KEY, defaults);
    if (!Array.isArray(s.guessDistribution) || s.guessDistribution.length !== DIST_LEN) {
      s.guessDistribution = new Array(DIST_LEN).fill(0);
    }
    return s;
  }

  function saveStats(won) {
    const s = loadStats();
    s.played++;
    if (won) {
      s.wins = (s.wins || 0) + 1;
      s.streak++;
      if (s.streak > s.best) s.best = s.streak;
      const idx = Math.min(guesses.length - 1, MAX_GUESSES - 1);
      s.guessDistribution[idx] = (s.guessDistribution[idx] || 0) + 1;
    } else {
      s.streak = 0;
      s.guessDistribution[MAX_GUESSES] = (s.guessDistribution[MAX_GUESSES] || 0) + 1;
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
    return s;
  }

  function loadTodayState() {
    try {
      const raw = localStorage.getItem(TODAY_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (d.todayDate !== todayCST) return null;
      return d;
    } catch (e) { return null; }
  }

  function saveTodayState() {
    DJUtils.saveJSON(TODAY_KEY, {
      todayDate: todayCST,
      puzzleNum: puzzleNum,
      guesses:   guesses,
      gameOver:  gameOver,
    });
  }

  // ── Comparison logic ─────────────────────────────────────────────────────
  function compareGuess(guess, ans) {
    const results = [];

    // Level (0-9): green=exact, yellow=within ±2 with arrow, red=>2 off
    (function () {
      let status, arrow = null;
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
      const gi = RANGE_TIERS.indexOf(guess.range);
      const ai = RANGE_TIERS.indexOf(ans.range);
      let status, arrow = null;
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
      const gc = guess.components;
      const ac = ans.components;
      let status;
      if (gc === ac) {
        status = 'green';
      } else {
        let shared = false;
        for (let i = 0; i < gc.length; i++) {
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
      const gi = DURATION_TIERS.indexOf(guess.duration);
      const ai = DURATION_TIERS.indexOf(ans.duration);
      let status, arrow = null;
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
      const gc = (guess.classes || []).slice().sort();
      const ac = (ans.classes   || []).slice().sort();
      let status;
      if (gc.join(',') === ac.join(',')) {
        status = 'green';
      } else {
        const shared = gc.some(function (c) { return ac.indexOf(c) !== -1; });
        status = shared ? 'yellow' : 'red';
      }
      const names = (guess.classes || []).map(function (c) { return CLASS_ABBREVS[c] || c; });
      let display;
      if (names.length <= 2) {
        display = names.join('/');
      } else if (names.length <= 4) {
        const half = Math.ceil(names.length / 2);
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
  let selectedDropdownIndex = -1;
  let dropdownItems = [];

  function guessedNames() {
    return guesses.map(function (g) { return g.spellName.toLowerCase(); });
  }

  function filterSpells(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const already = new Set(guessedNames());
    const startsWith = [], contains = [];
    spells.forEach(function (s) {
      const n = s.name.toLowerCase();
      if (already.has(n)) return;
      if (n.startsWith(q)) startsWith.push(s);
      else if (n.indexOf(q) !== -1) contains.push(s);
    });
    return startsWith.concat(contains).slice(0, 8);
  }

  function renderDropdown(matches) {
    const ul = document.getElementById('spd-dropdown');
    if (!matches.length) { ul.classList.add('hidden'); dropdownItems = []; selectedDropdownIndex = -1; return; }
    ul.innerHTML = '';
    dropdownItems = matches;
    selectedDropdownIndex = -1;
    matches.forEach(function (spell, i) {
      const li = document.createElement('li');
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
    const ul = document.getElementById('spd-dropdown');
    ul.classList.add('hidden');
    dropdownItems = [];
    selectedDropdownIndex = -1;
  }

  function selectSpell(spell) {
    const input = document.getElementById('spd-input');
    input.value = spell.name;
    hideDropdown();
    input.focus();
  }

  function highlightDropdownItem(index) {
    const items = document.querySelectorAll('#spd-dropdown li');
    items.forEach(function (li, i) {
      li.classList.toggle('spd-dropdown-active', i === index);
    });
  }

  // ── Board rendering ──────────────────────────────────────────────────────
  function renderBoard(animateLastRow) {
    const board     = document.getElementById('spd-board');
    const namesCol  = document.getElementById('spd-names');
    board.innerHTML    = '';
    namesCol.innerHTML = '';

    guesses.forEach(function (guess, rowIndex) {
      // Name cell in frozen left column
      const nameCell = document.createElement('div');
      nameCell.className = 'spd-cell spd-name-cell';
      nameCell.textContent = guess.spellName;
      namesCol.appendChild(nameCell);

      // Attribute row in scrollable right panel
      const row = document.createElement('div');
      row.className = 'spd-row';

      guess.results.forEach(function (r, colIndex) {
        const cell = document.createElement('div');
        cell.className = 'spd-cell spd-tile spd-' + r.status;
        if (animateLastRow && rowIndex === guesses.length - 1) {
          cell.style.animationDelay = (colIndex * 100) + 'ms';
          cell.classList.add('spd-tile-pop');
        }

        const top = document.createElement('span');
        top.className = 'spd-tile-val';
        top.textContent = r.display;
        cell.appendChild(top);

        if (r.arrow) {
          const arrow = document.createElement('span');
          arrow.className = 'spd-tile-arrow';
          arrow.textContent = r.arrow;
          cell.appendChild(arrow);
        }

        row.appendChild(cell);
      });

      board.appendChild(row);
    });

    // Empty rows for remaining guesses
    const remaining = MAX_GUESSES - guesses.length;
    for (let i = 0; i < remaining; i++) {
      const emptyName = document.createElement('div');
      emptyName.className = 'spd-cell spd-name-cell spd-empty-cell';
      namesCol.appendChild(emptyName);

      const row = document.createElement('div');
      row.className = 'spd-row spd-row-empty';
      for (let j = 0; j < 9; j++) {
        const cell = document.createElement('div');
        cell.className = 'spd-cell spd-tile spd-empty';
        row.appendChild(cell);
      }
      board.appendChild(row);
    }

    updateGuessCounter();

    // Scroll attr panel to show latest row; sync name column
    if (animateLastRow) {
      const attrScroll = document.getElementById('spd-attr-scroll');
      attrScroll.scrollTop = attrScroll.scrollHeight;
      namesCol.scrollTop   = attrScroll.scrollTop;
    }
  }

  function updateGuessCounter() {
    const el = document.getElementById('spd-guess-count');
    if (el) el.textContent = guesses.length + ' / ' + MAX_GUESSES;
  }

  // ── Animations / toast ────────────────────────────────────────────────────
  function shakeInput() {
    const row = document.getElementById('spd-input-row');
    row.classList.remove('spd-shake');
    void row.offsetWidth; // reflow
    row.classList.add('spd-shake');
    setTimeout(function () { row.classList.remove('spd-shake'); }, 400);
  }

  function toastMessage(text) {
    const toast = document.getElementById('spd-toast');
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

    const input = document.getElementById('spd-input');
    const raw   = input.value.trim();
    if (!raw) return;

    // Find matching spell (case-insensitive)
    let guessSpell = null;
    const rawLower = raw.toLowerCase();
    for (let i = 0; i < spells.length; i++) {
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

    const results = compareGuess(guessSpell, answer);
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
    const stats = saveStats(true);
    showResults(false, true, stats);
  }

  function handleLoss() {
    const stats = saveStats(false);
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
    const inputArea  = document.getElementById('spd-input-area');
    const resultsEl  = document.getElementById('spd-results');
    const heading    = document.getElementById('spd-result-heading');
    const sub        = document.getElementById('spd-result-sub');
    const ansReveal  = document.getElementById('spd-answer-reveal');

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

  }

  // ── Share ────────────────────────────────────────────────────────────────
  function handleShare() {
    const won       = guesses.length > 0 && isWin(guesses[guesses.length - 1].results);
    const winLine   = won ? guesses.length + '/' + MAX_GUESSES : 'X/' + MAX_GUESSES;
    const text      = 'Spelldle #' + puzzleNum + ' \u2014 ' + winLine + '\nhttps://dailyjamm.com/spelldle/';
    const btn       = document.getElementById('spd-share-btn');
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Share Results'; }, SHARE_RESET_MS);
    }).catch(function () {
      toastMessage('Copy failed — try selecting the text manually.');
    });
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  function updateCountdown() {
    const parts = COUNTDOWN_FMT.formatToParts(new Date());
    const map = Object.fromEntries(parts.map(function (p) { return [p.type, p.value]; }));
    const secsToday = parseInt(map.hour) * SECONDS_PER_HOUR + parseInt(map.minute) * 60 + parseInt(map.second);
    const remaining = Math.max(0, SECONDS_PER_DAY - secsToday);
    const h = Math.floor(remaining / SECONDS_PER_HOUR);
    const m = Math.floor((remaining % SECONDS_PER_HOUR) / 60);
    const s = remaining % 60;
    const el = document.getElementById('spd-countdown');
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
    const dayIndex = getPuzzleIndex();
    puzzleNum    = dayIndex;
    answer       = spells[getShuffledSpellIndex(dayIndex, spells.length)];

    document.getElementById('spd-meta').textContent = 'Daily Spelldle #' + puzzleNum;

    // Restore saved state
    const saved = loadTodayState();
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
    const input     = document.getElementById('spd-input');
    const submitBtn = document.getElementById('spd-submit-btn');
    const shareBtn  = document.getElementById('spd-share-btn');
    const helpBtn   = document.getElementById('spd-help-btn');
    const modal     = document.getElementById('spd-modal');

    input.addEventListener('input', function () {
      renderDropdown(filterSpells(input.value));
    });

    input.addEventListener('keydown', function (e) {
      const items = document.querySelectorAll('#spd-dropdown li');
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
    const attrScroll = document.getElementById('spd-attr-scroll');
    attrScroll.addEventListener('scroll', function () {
      document.getElementById('spd-names').scrollTop = attrScroll.scrollTop;
    });

    submitBtn.addEventListener('click', submitGuess);
    shareBtn.addEventListener('click', handleShare);
    helpBtn.addEventListener('click', openModal);
    document.getElementById('spd-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    const statsBtn   = document.getElementById('spd-stats-btn');
    const statsModal = document.getElementById('spd-stats-modal');
    if (statsBtn)   statsBtn.addEventListener('click', showStats);
    if (statsModal) statsModal.addEventListener('click', function (e) { if (e.target === statsModal) closeStats(); });
    const statsClose = document.getElementById('spd-stats-close');
    if (statsClose) statsClose.addEventListener('click', closeStats);

    // ESC closes the modal (per site convention)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!modal.classList.contains('hidden')) closeModal();
        closeStats();
      }
    });
  }

  function shareStatsText() {
    const s      = loadStats();
    const played = s.played || 0;
    const wins   = s.wins   || 0;
    const winPct = played > 0 ? Math.round(wins / played * 100) : 0;
    const dist   = s.guessDistribution || new Array(DIST_LEN).fill(0);
    const maxVal = Math.max.apply(null, dist.concat([1]));
    const NUMS   = ['1\uFE0F\u20E3','2\uFE0F\u20E3','3\uFE0F\u20E3','4\uFE0F\u20E3',
                    '5\uFE0F\u20E3','6\uFE0F\u20E3','7\uFE0F\u20E3','8\uFE0F\u20E3','\u274C'];

    function bar(n) {
      var filled = Math.round((n / maxVal) * 8);
      return '\u2588'.repeat(filled) + '\u2591'.repeat(8 - filled) + ' ' + n;
    }

    return [
      'Spelldle All-Time Stats \uD83E\uDDD9',
      'Played: ' + played + ' \u2502 Wins: ' + wins + ' \u2502 Win Rate: ' + winPct + '%',
      'Streak: ' + (s.streak || 0) + ' \uD83D\uDD25 \u2502 Best: ' + (s.best || 0),
      '',
      'Guess Distribution:',
    ].concat(dist.map(function (c, i) { return NUMS[i] + ' ' + bar(c); }))
     .concat(['', 'dailyjamm.com/spelldle'])
     .join('\n');
  }

  function showStats() {
    const s      = loadStats();
    const played = s.played || 0;
    const wins   = s.wins   || 0;
    const winPct = played > 0 ? Math.round(wins / played * 100) : 0;

    DJUtils.setStatRows('spd-stats-content', [
      { label: 'Games Played', value: played },
      { label: 'Wins', value: wins, color: '#4ade80' },
      { label: 'Win Rate', value: winPct + '%', color: winPct >= 50 ? '#4ade80' : '#f87171' },
      { label: 'Current Streak', value: s.streak, color: '#facc15' },
      { label: 'Best Streak', value: s.best, color: '#a78bfa' },
    ]);

    DJUtils.renderGuessDist('spd-stats-dist', s.guessDistribution || new Array(DIST_LEN).fill(0));

    var shareBtn = document.getElementById('spd-stats-share-btn');
    if (shareBtn) {
      shareBtn.textContent = 'Share Stats';
      shareBtn.onclick = function () { DJUtils.clipboardShare(shareStatsText(), shareBtn, 'Share Stats'); };
    }
    const statsModal = document.getElementById('spd-stats-modal');
    if (statsModal) statsModal.classList.remove('hidden');
  }

  function closeStats() {
    const statsModal = document.getElementById('spd-stats-modal');
    if (statsModal) statsModal.classList.add('hidden');
  }

  // Expose for HTML onclick handlers
  window.SPDGame = { showStats: showStats };

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
