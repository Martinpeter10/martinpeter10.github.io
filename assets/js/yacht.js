// Yacht - one five-dice scorecard per day on DailyJamm.
// 13 turns, up to 3 rolls each, every box must be filled. Dice are rolled
// per player (not date-seeded), so state is persisted after every single
// action - a refresh restores the exact dice on the table rather than
// handing out a fresh roll.
(function () {
  'use strict';

  const DICE_COUNT = 5;
  const ROLLS_PER_TURN = 3;
  const UPPER_TARGET = 63;
  const UPPER_BONUS = 35;

  const todayKey = 'yc_today';
  const statsKey = 'yc_stats_v2';
  const howtoKey = 'yc_seen_howto';

  /* ── Categories ────────────────────────────────────────────── */
  // section: 'upper' | 'lower'; score(counts, dice) -> points
  const CATEGORIES = [
    { id: 'ones',   label: 'Ones',            section: 'upper', hint: 'Sum of 1s',      score: (c) => c[1] * 1 },
    { id: 'twos',   label: 'Twos',            section: 'upper', hint: 'Sum of 2s',      score: (c) => c[2] * 2 },
    { id: 'threes', label: 'Threes',          section: 'upper', hint: 'Sum of 3s',      score: (c) => c[3] * 3 },
    { id: 'fours',  label: 'Fours',           section: 'upper', hint: 'Sum of 4s',      score: (c) => c[4] * 4 },
    { id: 'fives',  label: 'Fives',           section: 'upper', hint: 'Sum of 5s',      score: (c) => c[5] * 5 },
    { id: 'sixes',  label: 'Sixes',           section: 'upper', hint: 'Sum of 6s',      score: (c) => c[6] * 6 },
    { id: 'three',  label: 'Three of a Kind', section: 'lower', hint: 'Total of dice',  score: (c, d) => hasOfAKind(c, 3) ? sum(d) : 0 },
    { id: 'four',   label: 'Four of a Kind',  section: 'lower', hint: 'Total of dice',  score: (c, d) => hasOfAKind(c, 4) ? sum(d) : 0 },
    { id: 'full',   label: 'Full House',      section: 'lower', hint: '25',             score: (c) => isFullHouse(c) ? 25 : 0 },
    { id: 'small',  label: 'Small Straight',  section: 'lower', hint: '30',             score: (c) => hasStraight(c, 4) ? 30 : 0 },
    { id: 'large',  label: 'Large Straight',  section: 'lower', hint: '40',             score: (c) => hasStraight(c, 5) ? 40 : 0 },
    { id: 'yacht',  label: 'Yacht',           section: 'lower', hint: '50',             score: (c) => hasOfAKind(c, 5) ? 50 : 0 },
    { id: 'chance', label: 'Chance',          section: 'lower', hint: 'Total of dice',  score: (c, d) => sum(d) }
  ];

  function sum(dice) {
    return dice.reduce((a, b) => a + b, 0);
  }

  function countFaces(dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(d => { c[d]++; });
    return c;
  }

  function hasOfAKind(counts, n) {
    for (let f = 1; f <= 6; f++) if (counts[f] >= n) return true;
    return false;
  }

  function isFullHouse(counts) {
    let three = false, two = false;
    for (let f = 1; f <= 6; f++) {
      if (counts[f] === 3) three = true;
      if (counts[f] === 2) two = true;
    }
    return three && two;
  }

  // Longest run of distinct consecutive faces reaches `need`
  function hasStraight(counts, need) {
    let run = 0;
    for (let f = 1; f <= 6; f++) {
      run = counts[f] > 0 ? run + 1 : 0;
      if (run >= need) return true;
    }
    return false;
  }

  function scoreFor(catId, dice) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat || !dice.length) return 0;
    return cat.score(countFaces(dice), dice);
  }

  /* ── State ─────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  let dice = [];                 // current face values (empty before first roll)
  let held = [false, false, false, false, false];
  let rollsLeft = ROLLS_PER_TURN;
  let rolledThisTurn = false;
  let turn = 1;                  // 1..13
  let scores = {};               // catId -> points (only filled boxes)
  let done = false;
  let countdownTimer = null;

  const chicagoDate = () => DJUtils.getChicagoDate();

  /* ── Persistence ───────────────────────────────────────────── */
  function saveToday() {
    DJUtils.saveJSON(todayKey, {
      date: chicagoDate(),
      dice, held, rollsLeft, rolledThisTurn, turn, scores, done
    });
  }

  function loadToday() {
    const d = DJUtils.loadJSON(todayKey, null);
    if (!d || d.date !== chicagoDate()) return null;
    return d;
  }

  function loadStats() {
    return DJUtils.loadJSON(statsKey, {
      played: 0, best: 0, totalScore: 0,
      curStreak: 0, bestStreak: 0, lastDate: '',
      yachts: 0, bonuses: 0
    });
  }

  /* ── Totals ────────────────────────────────────────────────── */
  function upperTotal() {
    return CATEGORIES.filter(c => c.section === 'upper')
      .reduce((t, c) => t + (scores[c.id] || 0), 0);
  }

  function lowerTotal() {
    return CATEGORIES.filter(c => c.section === 'lower')
      .reduce((t, c) => t + (scores[c.id] || 0), 0);
  }

  function bonusEarned() {
    return upperTotal() >= UPPER_TARGET ? UPPER_BONUS : 0;
  }

  function grandTotal() {
    return upperTotal() + bonusEarned() + lowerTotal();
  }

  /* ── Dice rendering ────────────────────────────────────────── */
  const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  function makeDie(face, isHeld, idx) {
    const die = document.createElement('button');
    die.className = 'yc-die' + (isHeld ? ' yc-die-held' : '');
    die.type = 'button';
    die.setAttribute('aria-label',
      'Die ' + (idx + 1) + ', showing ' + face + (isHeld ? ', held' : ''));
    die.setAttribute('aria-pressed', isHeld ? 'true' : 'false');
    const spots = PIPS[face] || [];
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('span');
      cell.className = 'yc-pip-cell';
      if (spots.indexOf(i) !== -1) {
        const pip = document.createElement('span');
        pip.className = 'yc-pip';
        cell.appendChild(pip);
      }
      die.appendChild(cell);
    }
    die.addEventListener('click', function () { toggleHold(idx); });
    return die;
  }

  function makeBlankDie(idx) {
    const die = document.createElement('div');
    die.className = 'yc-die yc-die-empty';
    die.setAttribute('aria-label', 'Die ' + (idx + 1) + ', not rolled yet');
    return die;
  }

  function renderDice() {
    const wrap = $('yc-dice');
    wrap.textContent = '';
    for (let i = 0; i < DICE_COUNT; i++) {
      wrap.appendChild(dice.length ? makeDie(dice[i], held[i], i) : makeBlankDie(i));
    }
  }

  /* ── Scorecard rendering ───────────────────────────────────── */
  function makeRow(cat) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'yc-row';
    row.id = 'yc-row-' + cat.id;

    const label = document.createElement('span');
    label.className = 'yc-row-label';
    label.textContent = cat.label;

    const hint = document.createElement('span');
    hint.className = 'yc-row-hint';
    hint.textContent = cat.hint;

    const val = document.createElement('span');
    val.className = 'yc-row-val';

    const left = document.createElement('span');
    left.className = 'yc-row-left';
    left.appendChild(label);
    left.appendChild(hint);

    row.appendChild(left);
    row.appendChild(val);
    row.addEventListener('click', function () { assign(cat.id); });
    return row;
  }

  function buildCard() {
    const upper = $('yc-upper-rows');
    const lower = $('yc-lower-rows');
    upper.textContent = '';
    lower.textContent = '';
    CATEGORIES.forEach(function (cat) {
      (cat.section === 'upper' ? upper : lower).appendChild(makeRow(cat));
    });
  }

  function renderCard() {
    CATEGORIES.forEach(function (cat) {
      const row = $('yc-row-' + cat.id);
      const val = row.querySelector('.yc-row-val');
      const used = Object.prototype.hasOwnProperty.call(scores, cat.id);

      row.classList.toggle('yc-row-used', used);
      row.classList.remove('yc-row-open', 'yc-row-zero');

      if (used) {
        val.textContent = String(scores[cat.id]);
        row.disabled = true;
        return;
      }
      if (done || !rolledThisTurn) {
        val.textContent = '-';
        row.disabled = true;
        return;
      }
      const preview = scoreFor(cat.id, dice);
      val.textContent = String(preview);
      row.disabled = false;
      row.classList.add('yc-row-open');
      if (preview === 0) row.classList.add('yc-row-zero');
    });

    const up = upperTotal();
    $('yc-upper-progress').textContent = up + ' / ' + UPPER_TARGET;
    $('yc-bonus-val').textContent = String(bonusEarned());
    $('yc-total-val').textContent = String(grandTotal());
    $('yc-turn-val').firstChild.nodeValue = String(Math.min(turn, 13));
  }

  /* ── Turn flow ─────────────────────────────────────────────── */
  function rollDie() {
    return 1 + Math.floor(Math.random() * 6);
  }

  function doRoll() {
    if (done || rollsLeft <= 0) return;
    if (!dice.length) dice = new Array(DICE_COUNT).fill(1);
    for (let i = 0; i < DICE_COUNT; i++) {
      if (!held[i]) dice[i] = rollDie();
    }
    rollsLeft--;
    rolledThisTurn = true;
    saveToday();                 // persist before painting - refresh cannot reroll
    renderDice();
    renderCard();
    renderControls();
  }

  function toggleHold(idx) {
    if (done || !rolledThisTurn || rollsLeft === 0) return;
    held[idx] = !held[idx];
    saveToday();
    renderDice();
  }

  function assign(catId) {
    if (done || !rolledThisTurn) return;
    if (Object.prototype.hasOwnProperty.call(scores, catId)) return;
    scores[catId] = scoreFor(catId, dice);

    if (Object.keys(scores).length >= CATEGORIES.length) {
      done = true;
      saveToday();
      recordStats();
      renderDice();
      renderCard();
      renderControls();
      showResults();
      return;
    }

    turn++;
    dice = [];
    held = [false, false, false, false, false];
    rollsLeft = ROLLS_PER_TURN;
    rolledThisTurn = false;
    saveToday();
    renderDice();
    renderCard();
    renderControls();
  }

  function renderControls() {
    const btn = $('yc-roll-btn');
    const hint = $('yc-hold-hint');
    if (done) {
      btn.disabled = true;
      btn.textContent = 'All boxes filled';
      hint.textContent = 'Come back tomorrow for a fresh scorecard.';
      return;
    }
    if (rollsLeft === ROLLS_PER_TURN) {
      btn.disabled = false;
      btn.textContent = 'Roll Dice';
      hint.textContent = 'Roll to start turn ' + turn + ' of 13';
    } else if (rollsLeft > 0) {
      btn.disabled = false;
      btn.textContent = 'Reroll (' + rollsLeft + ' left)';
      hint.textContent = 'Tap dice to hold them, or pick a box to score';
    } else {
      btn.disabled = true;
      btn.textContent = 'No rolls left';
      hint.textContent = 'Pick a box to score into';
    }
  }

  /* ── Results ───────────────────────────────────────────────── */
  function showResults() {
    const panel = $('yc-results');
    panel.classList.remove('hidden');
    $('yc-result-score').textContent = String(grandTotal());

    const parts = ['Upper ' + upperTotal() + (bonusEarned() ? ' +' + UPPER_BONUS + ' bonus' : '')];
    if (scores.yacht) parts.push('Yacht!');
    $('yc-result-sub').textContent = parts.join(' · ');

    startCountdown();
  }

  function shareText() {
    const lines = [
      'Yacht ' + chicagoDate(),
      'Score: ' + grandTotal(),
      'Upper: ' + upperTotal() + (bonusEarned() ? ' (+' + UPPER_BONUS + ')' : '')
    ];
    if (scores.yacht) lines.push('Yacht!');
    lines.push('dailyjamm.com/yacht/');
    return lines.join('\n');
  }

  function startCountdown() {
    const el = $('yc-countdown');
    if (!el || countdownTimer) return;
    function tick() {
      const ms = DJUtils.getChicagoMidnight() - Date.now();
      if (ms <= 0) { el.textContent = '00:00:00'; return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      el.textContent = String(h).padStart(2, '0') + ':' +
                       String(m).padStart(2, '0') + ':' +
                       String(s).padStart(2, '0');
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /* ── Stats ─────────────────────────────────────────────────── */
  function recordStats() {
    const stats = loadStats();
    const today = chicagoDate();
    if (stats.lastDate === today) return;   // already counted

    const total = grandTotal();
    stats.played += 1;
    stats.totalScore += total;
    if (total > stats.best) stats.best = total;
    if (scores.yacht) stats.yachts += 1;
    if (bonusEarned()) stats.bonuses += 1;

    const yesterday = new Date(Date.now() - 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    stats.curStreak = stats.lastDate === yesterday ? stats.curStreak + 1 : 1;
    if (stats.curStreak > stats.bestStreak) stats.bestStreak = stats.curStreak;
    stats.lastDate = today;

    DJUtils.saveJSON(statsKey, stats);
  }

  function showStats() {
    const s = loadStats();
    const avg = s.played ? Math.round(s.totalScore / s.played) : 0;
    DJUtils.setStatRows('yc-stats-content', [
      { label: 'Scorecards Played', value: s.played },
      { label: 'Best Score',        value: s.best, color: '#34d399' },
      { label: 'Average Score',     value: avg },
      { label: 'Current Streak',    value: s.curStreak },
      { label: 'Best Streak',       value: s.bestStreak },
      { label: 'Yachts Rolled',     value: s.yachts, color: '#fbbf24' },
      { label: 'Upper Bonuses',     value: s.bonuses }
    ]);
    $('yc-stats-modal').classList.remove('hidden');
  }

  function closeStats() { $('yc-stats-modal').classList.add('hidden'); }

  function shareStats() {
    const s = loadStats();
    const avg = s.played ? Math.round(s.totalScore / s.played) : 0;
    const text = 'Yacht Stats\n' +
      'Played: ' + s.played + '\n' +
      'Best: ' + s.best + '  Avg: ' + avg + '\n' +
      'Streak: ' + s.curStreak + ' (best ' + s.bestStreak + ')\n' +
      'dailyjamm.com/yacht/';
    DJUtils.clipboardShare(text, $('yc-stats-share-btn'), 'Share Stats');
  }

  /* ── How to Play ───────────────────────────────────────────── */
  function showModal() { $('yc-modal').classList.remove('hidden'); }
  function closeModal() {
    $('yc-modal').classList.add('hidden');
    localStorage.setItem(howtoKey, '1');
  }

  /* ── Boot ──────────────────────────────────────────────────── */
  function restore(saved) {
    dice = Array.isArray(saved.dice) ? saved.dice : [];
    held = Array.isArray(saved.held) && saved.held.length === DICE_COUNT
      ? saved.held : [false, false, false, false, false];
    rollsLeft = typeof saved.rollsLeft === 'number' ? saved.rollsLeft : ROLLS_PER_TURN;
    rolledThisTurn = !!saved.rolledThisTurn;
    turn = typeof saved.turn === 'number' ? saved.turn : 1;
    scores = (saved.scores && typeof saved.scores === 'object') ? saved.scores : {};
    done = !!saved.done;
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildCard();

    const saved = loadToday();
    if (saved) restore(saved);

    renderDice();
    renderCard();
    renderControls();
    if (done) showResults();

    $('yc-roll-btn').addEventListener('click', doRoll);
    $('yc-stats-btn').addEventListener('click', showStats);
    $('yc-help-btn').addEventListener('click', showModal);
    $('yc-share-btn').addEventListener('click', function () {
      DJUtils.clipboardShare(shareText(), $('yc-share-btn'), 'Share Results');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeStats(); closeModal(); }
    });

    if (!localStorage.getItem(howtoKey)) showModal();
  });

  window.YCGame = {
    showStats: showStats,
    closeStats: closeStats,
    shareStats: shareStats,
    showModal: showModal,
    closeModal: closeModal
  };
})();
