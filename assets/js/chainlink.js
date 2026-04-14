(function () {
  'use strict';

  const SECONDS_PER_DAY  = 86400;
  const SECONDS_PER_HOUR = 3600;

  // Puzzle data lives in /assets/data/chainlink-puzzles.json.
  // To add new puzzles, edit that file only - no changes needed here.

  // ── Puzzle selection ─────────────────────────────────────────────────────
  // Puzzle #1 plays on Jan 1 of each year. The day-of-year (1–365/366) maps
  // directly to puzzle ID, cycling back to #1 if we run out.
  function getPuzzle(puzzles) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const year  = parseInt(map.year);
    const month = parseInt(map.month);
    const day   = parseInt(map.day);
    // Day of year (1-indexed), DST-safe via noon UTC
    const jan1  = new Date(Date.UTC(year, 0, 1, 12));
    const today = new Date(Date.UTC(year, month - 1, day, 12));
    const dayOfYear = Math.round((today - jan1) / 86400000) + 1;
    const offset = (dayOfYear - 1) % puzzles.length;
    return puzzles[offset];
  }

  // ── State ────────────────────────────────────────────────────────────────
  const todayCST = DJUtils.getChicagoDate();
  let puzzle; // set after fetch
  let currentStep = 0;
  let results     = [];   // { points: number }[]
  let gameOver    = false;
  // 'hidden' = no hints seen (worth 3 pts if correct)
  // 'letter' = first letter revealed (worth 2 pts if correct)
  // 'phrase' = phrase clue revealed (worth 1 pt if correct, 0 if wrong/skip)
  let clueState   = 'hidden';

  // ── localStorage (keyed by today's Chicago date, matching Themedle) ──────
  const STATS_KEY = 'cl_stats';
  const TODAY_KEY = 'cl_today';
  const SEEN_KEY  = 'cl_seen_howto';

  function loadStats() {
    return DJUtils.loadJSON(STATS_KEY, { streak: 0, best: 0, played: 0, totalScore: 0, perfectGames: 0 });
  }

  function saveStats(score) {
    const s = loadStats();
    s.played++;
    s.totalScore  = (s.totalScore  || 0) + score;
    if (score >= 20) s.perfectGames = (s.perfectGames || 0) + 1;
    if (score > 0) {
      s.streak++;
      if (s.streak > s.best) s.best = s.streak;
    } else {
      s.streak = 0;
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
    } catch { return null; }
  }

  function saveTodayState() {
    DJUtils.saveJSON(TODAY_KEY, {
      todayDate: todayCST,
      puzzleId: puzzle.id,
      results, currentStep, gameOver, clueState,
    });
  }

  // ── Game helpers ─────────────────────────────────────────────────────────
  function wordState(i) {
    if (i === 0) return 'given';
    const ri = i - 1;
    if (ri < results.length) return 'solved';
    if (ri === currentStep && !gameOver) return 'active';
    return 'locked';
  }

  function totalScore() {
    return results.reduce((s, r) => s + r.points, 0);
  }

  function isPerfect() {
    return results.length === 5 && results.every(r => r.points === 3);
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const chainEl    = document.getElementById('cl-chain');
  const inputArea  = document.getElementById('cl-input-area');
  const resultsEl  = document.getElementById('cl-results');
  const scoreEl    = document.getElementById('cl-score');
  const metaEl     = document.getElementById('cl-meta');
  const clueArea   = document.getElementById('cl-clue-area');
  const clueNumEl  = document.getElementById('cl-clue-num');
  const clueTextEl = document.getElementById('cl-clue-text');
  const clueBtnEl  = document.getElementById('cl-clue-btn');
  const inputEl    = document.getElementById('cl-guess-input');
  const inputRow   = document.getElementById('cl-input-row');
  const finalScEl  = document.getElementById('cl-final-score');
  const scoreMaxEl = document.getElementById('cl-score-max');
  const resultMsg  = document.getElementById('cl-result-msg');
  const bonusMsgEl = document.getElementById('cl-bonus-msg');
  const dotsEl     = document.getElementById('cl-dots');
  const shareBtn   = document.getElementById('cl-share-btn');
  const statStreak = document.getElementById('cl-stat-streak');
  const statBest   = document.getElementById('cl-stat-best');
  const statPlayed = document.getElementById('cl-stat-played');
  const helpBtn    = document.getElementById('cl-help-btn');
  const modal      = document.getElementById('cl-modal');
  const modalClose = document.getElementById('cl-modal-close');

  // ── Render chain ─────────────────────────────────────────────────────────
  function renderChain() {
    chainEl.innerHTML = '';
    puzzle.words.forEach((word, i) => {
      const state = wordState(i);
      const ri  = i - 1;
      const res = (ri >= 0 && ri < results.length) ? results[ri] : null;

      if (i > 0) {
        const conn = document.createElement('div');
        conn.className = 'cl-connector';
        const line = document.createElement('div');
        line.className = 'cl-conn-line' + (state === 'solved' ? ' done' : '');
        conn.appendChild(line);
        if (state === 'solved') {
          const label = document.createElement('span');
          label.className = 'cl-compound';
          label.textContent = puzzle.words[i - 1] + ' ' + word;
          conn.appendChild(label);
        }
        chainEl.appendChild(conn);
      }

      const tile = document.createElement('div');
      // 0-point words (skipped or auto-filled) get a distinct missed style
      const tileClass = (state === 'solved' && res && res.points === 0) ? 'missed' : state;
      tile.className = 'cl-tile cl-tile-' + tileClass;

      const text = document.createElement('span');
      text.className = 'cl-tile-text';
      if (state === 'active' && clueState !== 'hidden') {
        text.textContent = puzzle.words[currentStep + 1][0];
      } else {
        text.textContent = (state === 'locked' || state === 'active') ? '?' : word;
      }
      tile.appendChild(text);

      if (res !== null) {
        const pts = document.createElement('span');
        pts.className = 'cl-tile-pts';
        pts.textContent = res.points > 0 ? '+' + res.points : '×';
        pts.style.color = res.points > 0 ? '#4ade80' : '#ef4444';
        tile.appendChild(pts);
      }

      chainEl.appendChild(tile);
    });
  }

  function updateScore() {
    scoreEl.textContent = totalScore();
  }

  // ── showClue / resetClueUI ───────────────────────────────────────────────
  function showClue() {
    if (clueState === 'letter') {
      clueNumEl.textContent  = 'Hint 1 of 2';
      clueTextEl.textContent = 'First letter: ' + puzzle.words[currentStep + 1][0];
      clueBtnEl.textContent  = 'Show Clue';
      clueBtnEl.classList.remove('hidden');
    } else {
      clueNumEl.textContent  = 'Hint 2 of 2 · ' + (currentStep + 1) + '/5';
      clueTextEl.textContent = puzzle.clues[currentStep];
      clueBtnEl.textContent  = 'No hints left';
      clueBtnEl.disabled     = true;
      clueBtnEl.style.opacity = '0.4';
      clueBtnEl.style.cursor  = 'not-allowed';
    }
    clueArea.classList.remove('hidden');
  }

  function resetClueUI() {
    clueArea.classList.add('hidden');
    clueBtnEl.textContent   = 'Hint';
    clueBtnEl.disabled      = false;
    clueBtnEl.style.opacity = '';
    clueBtnEl.style.cursor  = '';
  }

  // ── advance ──────────────────────────────────────────────────────────────
  function advance(pts) {
    results.push({ points: pts });
    clueState = 'hidden';
    if (currentStep < 4) {
      currentStep++;
      renderChain();
      updateScore();
      resetClueUI();
      inputEl.value = '';
      setTimeout(() => inputEl.focus(), 50);
    } else {
      gameOver = true;
      renderChain();
      updateScore();
      showResults(false);
    }
    saveTodayState();
  }

  // ── handleGuess ──────────────────────────────────────────────────────────
  function handleGuess() {
    const val = inputEl.value.trim().toUpperCase();
    if (!val) return;
    const correct = val === puzzle.words[currentStep + 1];
    if (correct) {
      const pts = clueState === 'hidden' ? 3 : clueState === 'letter' ? 2 : 1;
      advance(pts);
    } else {
      inputRow.classList.remove('cl-shake');
      void inputRow.offsetWidth;
      inputRow.classList.add('cl-shake');
      setTimeout(() => inputRow.classList.remove('cl-shake'), 400);
      inputEl.value = '';
      if (clueState === 'phrase') {
        // Phrase already visible + wrong → auto-fill, 0 pts
        advance(0);
      } else if (clueState === 'letter') {
        // Had first-letter hint + wrong → reveal phrase clue
        clueState = 'phrase';
        showClue();
        saveTodayState();
      } else {
        // No hints yet + wrong → reveal first letter (same as pressing Hint once)
        clueState = 'letter';
        showClue();
        saveTodayState();
      }
    }
  }

  // ── handleSkip ───────────────────────────────────────────────────────────
  function handleSkip() {
    advance(0);
  }

  // ── handleClueBtn ─────────────────────────────────────────────────────────
  function handleClueBtn() {
    clueState = clueState === 'hidden' ? 'letter' : 'phrase';
    showClue();
    saveTodayState();
  }

  // ── showResults ──────────────────────────────────────────────────────────
  function showResults(isRestore) {
    inputArea.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    resultsEl.classList.add('cl-fade-in');

    const score   = totalScore();
    const perfect = isPerfect();
    const display = perfect ? score + 5 : score;
    const stats   = isRestore ? loadStats() : saveStats(display);

    finalScEl.textContent  = display;
    scoreMaxEl.textContent = perfect ? '/20' : '/15';
    bonusMsgEl.classList.toggle('hidden', !perfect);
    resultMsg.textContent =
      perfect      ? 'Perfect chain!'  :
      score >= 12  ? 'Excellent!'      :
      score >= 8   ? 'Nice work!'      : 'Keep practicing!';

    dotsEl.innerHTML = results
      .map(r => `<span>${r.points === 3 ? '🟢' : r.points > 0 ? '🟡' : '🔴'}</span>`)
      .join('');

    statStreak.textContent = stats.streak;
    statBest.textContent   = stats.best;
    statPlayed.textContent = stats.played;
  }

  // ── Countdown (DST-safe Chicago, matching Themedle) ──────────────────────
  function updateCountdown() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const secsToday = parseInt(map.hour) * SECONDS_PER_HOUR + parseInt(map.minute) * 60 + parseInt(map.second);
    let remaining = SECONDS_PER_DAY - secsToday;
    if (remaining < 0) remaining = 0;
    const h = Math.floor(remaining / SECONDS_PER_HOUR);
    const m = Math.floor((remaining % SECONDS_PER_HOUR) / 60);
    const s = remaining % 60;
    const el = document.getElementById('cl-countdown');
    if (el) el.textContent =
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0');
  }

  // ── handleShare ──────────────────────────────────────────────────────────
  function handleShare() {
    const icons   = results.map(r => r.points === 3 ? '🟢' : r.points > 0 ? '🟡' : '🔴').join('');
    const perfect = isPerfect();
    const score   = perfect ? totalScore() + 5 : totalScore();
    const max     = perfect ? 20 : 15;
    const suffix  = perfect ? ' 🌟' : '';
    const text  = `Chain Link #${puzzle.id}\n${icons} ${score}/${max}${suffix}\nhttps://dailyjamm.com/chainlink/`;
    DJUtils.clipboardShare(text, shareBtn, 'Share Results');
  }

  // ── How to Play modal with animated demo ─────────────────────────────────
  let demoInterval = null;
  let demoStep  = 0;
  let demoPhase = 0;
  const demoWords   = ['LINCOLN', 'LOG', 'CABIN', 'FEVER'];
  const demoPhrases = ['Lincoln Log', 'Log Cabin', 'Cabin Fever'];

  function renderDemo() {
    const demoEl = document.getElementById('cl-demo');
    if (!demoEl) return;
    demoEl.innerHTML = '';
    demoWords.forEach((w, i) => {
      if (i > 0) {
        const conn = document.createElement('div');
        conn.className = 'cl-demo-conn';
        const showPhrase = (i <= demoStep + 1) && (i < demoStep + 1 || demoPhase >= 2);
        const child = document.createElement('span');
        child.className   = showPhrase ? 'cl-demo-phrase' : 'cl-demo-dot';
        child.textContent = showPhrase ? demoPhrases[i - 1] : '·';
        conn.appendChild(child);
        demoEl.appendChild(conn);
      }

      const isRevealed     = i <= demoStep + 1;
      const isJustRevealed = i === demoStep + 1 && demoPhase >= 1;
      let cls;
      if (i === 0)                          cls = 'cl-demo-word cl-demo-given';
      else if (isJustRevealed)              cls = 'cl-demo-word cl-demo-new';
      else if (isRevealed && i <= demoStep) cls = 'cl-demo-word cl-demo-solved';
      else                                  cls = 'cl-demo-word cl-demo-locked';

      const wordEl = document.createElement('div');
      wordEl.className   = cls;
      wordEl.textContent = isRevealed ? w : '?';
      demoEl.appendChild(wordEl);
    });
  }

  function startDemoAnimation() {
    demoStep = 0; demoPhase = 0;
    renderDemo();
    demoInterval = setInterval(() => {
      if (demoPhase < 2) { demoPhase++; }
      else { demoPhase = 0; demoStep = demoStep < 2 ? demoStep + 1 : 0; }
      renderDemo();
    }, 1200);
  }

  function stopDemoAnimation() {
    clearInterval(demoInterval);
    demoInterval = null;
  }

  function openModal() {
    modal.classList.remove('hidden');
    startDemoAnimation();
  }

  function closeModal() {
    modal.classList.add('hidden');
    stopDemoAnimation();
    if (!gameOver) setTimeout(() => inputEl.focus(), 50);
  }

  // ── Init (runs after puzzle data is loaded) ───────────────────────────────
  function init() {
    metaEl.textContent = 'Puzzle #' + puzzle.id;

    const saved = loadTodayState();
    if (saved) {
      results     = saved.results     || [];
      currentStep = saved.currentStep || 0;
      gameOver    = saved.gameOver    || false;
      clueState   = saved.clueState   || 'hidden';
    }

    renderChain();
    updateScore();

    if (gameOver) {
      showResults(true);
    } else {
      // Restore clue visibility if the player had already revealed it
      if (clueState !== 'hidden') {
        showClue();
      }
      if (!localStorage.getItem(SEEN_KEY)) {
        localStorage.setItem(SEEN_KEY, '1');
        openModal();
      } else {
        setTimeout(() => inputEl.focus(), 50);
      }
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    document.getElementById('cl-submit-btn').addEventListener('click', handleGuess);
    document.getElementById('cl-skip-btn').addEventListener('click', handleSkip);
    clueBtnEl.addEventListener('click', handleClueBtn);
    shareBtn.addEventListener('click', handleShare);
    helpBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') handleGuess(); });

    const clStatsBtn = document.getElementById('cl-stats-btn');
    if (clStatsBtn) clStatsBtn.addEventListener('click', showStats);
    const clStatsClose = document.getElementById('cl-stats-close');
    if (clStatsClose) clStatsClose.addEventListener('click', closeStats);
    const clStatsModal = document.getElementById('cl-stats-modal');
    if (clStatsModal) clStatsModal.addEventListener('click', e => { if (e.target === clStatsModal) closeStats(); });
  }

  function showStats() {
    const s      = loadStats();
    const played = s.played || 0;
    const avg    = played > 0 ? (((s.totalScore || 0) / played)).toFixed(1) : '—';

    function row(label, value, color) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2937">' +
        '<span style="color:#9ca3af;font-size:13px">' + label + '</span>' +
        '<span style="font-weight:800;font-size:15px;color:' + (color || '#fff') + '">' + value + '</span>' +
      '</div>';
    }

    const el = document.getElementById('cl-stats-content');
    if (el) {
      el.innerHTML =
        row('Games Played', played) +
        row('Average Score', avg + ' / 20', '#facc15') +
        row('Perfect Games (20/20)', s.perfectGames || 0, '#4ade80') +
        row('Current Streak', s.streak, '#facc15') +
        row('Best Streak', s.best, '#a78bfa');
    }
    const modal = document.getElementById('cl-stats-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeStats() {
    const modal = document.getElementById('cl-stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  // ── Boot: fetch puzzles, then init ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    fetch('/assets/data/chainlink-puzzles.json')
      .then(function (r) { return r.json(); })
      .then(function (puzzles) {
        puzzle = getPuzzle(puzzles);
        init();
      })
      .catch(function () {
        chainEl.innerHTML =
          '<p class="text-sm text-red-400 text-center py-8">Failed to load puzzle. Please refresh.</p>';
      });
  });
})();
