// Shut the Box - daily dice + tile game on DailyJamm
// Roll two dice, flip down tiles that add up to the roll, try to shut all 9.
(function () {
  'use strict';

  const TILES = 9;

  const $ = id => document.getElementById(id);

  function chicagoDate() { return DJUtils.getChicagoDate(); }

  function dateToSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return h;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── State ── */
  let open = [];        // open[i] = tile (i+1) still up
  let rollIndex = 0;    // rolls taken today (drives the deterministic dice stream)
  let curRoll = null;   // { d1, d2, target, oneDie }
  let selected = [];    // tile numbers currently selected
  let phase = 'roll';   // 'roll' | 'pick' | 'anim' | 'done'
  let outcome = null;   // { score, shut }
  let rolling = false;

  const todayKey = 'stb_today';
  const statsKey = 'stb_stats_v2';
  const howtoKey = 'stb_seen_howto';

  /* ── Rules ── */
  // Dice for roll n come from a fixed daily stream - refreshing cannot reroll.
  function drawDice(idx) {
    const rng = mulberry32(dateToSeed(chicagoDate()) + idx * 7919);
    return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  }

  // Classic pub rule: one die may be rolled once 7, 8 and 9 are all shut
  function oneDieAllowed() {
    return !open[6] && !open[7] && !open[8];
  }

  function openTiles() {
    const t = [];
    for (let i = 0; i < TILES; i++) if (open[i]) t.push(i + 1);
    return t;
  }

  function boxScore() { return openTiles().reduce((a, b) => a + b, 0); }

  // Can any subset of the open tiles sum to target?
  function canMake(target) {
    let sums = new Set([0]);
    openTiles().forEach(t => {
      const next = new Set(sums);
      sums.forEach(s => { if (s + t <= target) next.add(s + t); });
      sums = next;
    });
    return sums.has(target);
  }

  function selSum() { return selected.reduce((a, b) => a + b, 0); }

  /* ── Persistence ── */
  function saveToday() {
    DJUtils.saveJSON(todayKey, {
      date: chicagoDate(), open, rollIndex, curRoll, phase, outcome,
    });
  }

  function loadStats() {
    return DJUtils.loadJSON(statsKey, {
      played: 0, shut: 0, totalScore: 0, best: null,
      curStreak: 0, bestStreak: 0, lastPlayed: null,
    });
  }

  function yesterdayStr(dateStr) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2] - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ── Dice rendering (real 3D cubes) ── */
  const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // Face placement: front=1 back=6 right=3 left=4 top=2 bottom=5 (opposites sum to 7)
  const FACE_PLACE = {
    1: '', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)',
    2: 'rotateX(90deg)', 5: 'rotateX(-90deg)',
  };
  // Cube rotation that brings each face to the front
  const FACE_SHOW = {
    1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0],
  };

  function buildCube(cubeEl) {
    cubeEl.textContent = '';
    for (let f = 1; f <= 6; f++) {
      const face = document.createElement('div');
      face.className = 'stb-cface';
      face.style.transform = FACE_PLACE[f] + ' translateZ(var(--stb-die-z))';
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('span');
        cell.className = 'stb-cell' + (DIE_PIPS[f].indexOf(i) >= 0 ? ' stb-pip' : '');
        face.appendChild(cell);
      }
      cubeEl.appendChild(face);
    }
  }

  function setCubeFace(cubeEl, face, instant) {
    const show = FACE_SHOW[face];
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cubeEl.style.transition = 'none';
      cubeEl.style.transform = 'rotateX(' + show[0] + 'deg) rotateY(' + show[1] + 'deg)';
      return;
    }
    // Reset without transition, force reflow, then tumble two full turns onto the face
    cubeEl.style.transition = 'none';
    cubeEl.style.transform = 'rotateX(0deg) rotateY(0deg)';
    void cubeEl.offsetWidth;
    cubeEl.style.transition = 'transform 1s cubic-bezier(.2,.7,.3,1.05)';
    cubeEl.style.transform = 'rotateX(' + (720 + show[0]) + 'deg) rotateY(' + (720 + show[1]) + 'deg)';
  }

  function animateRoll(d1, d2, oneDie, cb) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const die0 = $('stb-die-0'), die1 = $('stb-die-1');
    die1.classList.toggle('stb-die-off', oneDie);
    if (reduced) {
      setCubeFace($('stb-cube-0'), d1, true);
      if (!oneDie) setCubeFace($('stb-cube-1'), d2, true);
      cb();
      return;
    }
    rolling = true;
    die0.classList.add('stb-die-rolling');
    if (!oneDie) die1.classList.add('stb-die-rolling');
    setCubeFace($('stb-cube-0'), d1);
    if (!oneDie) setCubeFace($('stb-cube-1'), d2);
    setTimeout(() => {
      die0.classList.remove('stb-die-rolling');
      die1.classList.remove('stb-die-rolling');
      rolling = false;
      cb();
    }, 1060);
  }

  /* ── Tiles rendering ── */
  function buildTiles() {
    const row = $('stb-tiles');
    row.textContent = '';
    for (let i = 1; i <= TILES; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'stb-tile-slot';
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'stb-tile';
      tile.id = 'stb-tile-' + i;
      tile.textContent = i;
      tile.setAttribute('aria-label', 'Tile ' + i);
      tile.addEventListener('click', () => onTileTap(i));
      wrap.appendChild(tile);
      row.appendChild(wrap);
    }
  }

  function renderTiles() {
    for (let i = 1; i <= TILES; i++) {
      const tile = $('stb-tile-' + i);
      tile.classList.toggle('stb-shut', !open[i - 1]);
      tile.classList.toggle('stb-sel', selected.indexOf(i) >= 0);
      tile.disabled = !open[i - 1] || phase !== 'pick';
    }
  }

  /* ── Status / controls ── */
  function setStatus(main, sub) {
    $('stb-status').textContent = main;
    $('stb-substatus').textContent = sub || '';
  }

  function renderControls() {
    const rollBtn = $('stb-roll-btn');
    const roll1Btn = $('stb-roll1-btn');
    const showRoll = phase === 'roll' && !outcome;
    rollBtn.classList.toggle('hidden', !showRoll);
    roll1Btn.classList.toggle('hidden', !(showRoll && oneDieAllowed()));
    rollBtn.textContent = (showRoll && oneDieAllowed()) ? 'Roll 2 Dice' : 'Roll Dice';
  }

  function renderPickStatus() {
    const sum = selSum();
    if (!selected.length) {
      setStatus('You rolled ' + curRoll.target,
        'Tap tiles that add up to ' + curRoll.target);
    } else {
      setStatus('You rolled ' + curRoll.target,
        selected.slice().sort((a, b) => a - b).join(' + ') + ' = ' + sum +
        (sum === curRoll.target ? '' : ' of ' + curRoll.target));
    }
  }

  /* ── Game flow ── */
  function onRoll(oneDie) {
    if (phase !== 'roll' || rolling || outcome) return;
    const dice = drawDice(rollIndex);
    rollIndex++;
    const d1 = dice[0], d2 = dice[1];
    curRoll = { d1, d2, target: oneDie ? d1 : d1 + d2, oneDie };
    phase = 'anim';
    renderControls();
    setStatus('Rolling...', '');
    saveToday();
    animateRoll(d1, d2, oneDie, () => {
      if (!canMake(curRoll.target)) {
        deadRoll();
      } else {
        phase = 'pick';
        selected = [];
        renderTiles();
        renderPickStatus();
        saveToday();
      }
    });
  }

  function deadRoll() {
    phase = 'anim';
    setStatus('You rolled ' + curRoll.target, 'No tiles add up to ' + curRoll.target + ' - the box stays open!');
    openTiles().forEach((t, i) => {
      setTimeout(() => $('stb-tile-' + t).classList.add('stb-stuck'), 350 + i * 90);
    });
    setTimeout(() => endGame(false), 350 + openTiles().length * 90 + 900);
  }

  function onTileTap(n) {
    if (phase !== 'pick' || !open[n - 1]) return;
    const idx = selected.indexOf(n);
    if (idx >= 0) {
      selected.splice(idx, 1);
      renderTiles();
      renderPickStatus();
      return;
    }
    if (selSum() + n > curRoll.target) {
      const tile = $('stb-tile-' + n);
      tile.classList.remove('stb-deny');
      void tile.offsetWidth;
      tile.classList.add('stb-deny');
      return;
    }
    selected.push(n);
    renderTiles();
    renderPickStatus();
    if (selSum() === curRoll.target) setTimeout(commitSelection, 260);
  }

  function commitSelection() {
    if (phase !== 'pick' || selSum() !== curRoll.target) return;
    phase = 'anim';
    const tiles = selected.slice().sort((a, b) => a - b);
    setStatus('You rolled ' + curRoll.target, tiles.join(' + ') + ' = ' + curRoll.target + ' - shut!');
    tiles.forEach((t, i) => {
      setTimeout(() => {
        open[t - 1] = false;
        const tile = $('stb-tile-' + t);
        tile.classList.remove('stb-sel');
        tile.classList.add('stb-shut');
      }, i * 140);
    });
    setTimeout(() => {
      selected = [];
      renderTiles();
      if (openTiles().length === 0) {
        endGame(true);
      } else {
        phase = 'roll';
        curRoll = null;
        setStatus(boxScore() + ' left on the box', 'Roll again!');
        renderControls();
        saveToday();
      }
    }, tiles.length * 140 + 620);
  }

  function endGame(shut) {
    const score = shut ? 0 : boxScore();
    phase = 'done';
    outcome = { score, shut };
    const stats = loadStats();
    const today = chicagoDate();
    if (stats.lastPlayed !== today) {
      stats.curStreak = (stats.lastPlayed === yesterdayStr(today)) ? stats.curStreak + 1 : 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.curStreak);
      stats.lastPlayed = today;
      stats.played++;
      stats.totalScore += score;
      if (shut) stats.shut++;
      if (stats.best === null || score < stats.best) stats.best = score;
      DJUtils.saveJSON(statsKey, stats);
    }
    saveToday();
    renderTiles();
    renderControls();
    if (shut) {
      setStatus('SHUT THE BOX!', 'Every tile down - a perfect game!');
      $('stb-box').classList.add('stb-box-won');
    } else {
      setStatus('Box score: ' + score, 'The lower the better - 0 shuts the box.');
    }
    showResults();
  }

  /* ── Results ── */
  function tileEmojis() {
    const KEYS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    let s = '';
    for (let i = 0; i < TILES; i++) s += open[i] ? KEYS[i] : '🟫';
    return s;
  }

  function showResults() {
    const panel = $('stb-results');
    panel.classList.remove('hidden');
    $('stb-result-title').textContent = outcome.shut ? 'Shut the Box! 🎉' : 'Box Score: ' + outcome.score;
    $('stb-result-sub').textContent = outcome.shut
      ? 'You flipped down all 9 tiles. Perfection!'
      : 'The tiles left standing add up to ' + outcome.score + '. Come back tomorrow for a fresh box!';
    $('stb-result-tiles').textContent = tileEmojis();
    startCountdown('stb-countdown');
  }

  function shareText() {
    return 'Shut the Box ' + chicagoDate() + '\n' +
      (outcome.shut ? '🎲 SHUT THE BOX! 🎉' : '🎲 Score: ' + outcome.score) + '\n' +
      tileEmojis() + '\ndailyjamm.com/shutthebox/';
  }

  function startCountdown(id) {
    const el = $(id);
    if (!el) return;
    function tick() {
      const ms = DJUtils.getChicagoMidnight() - Date.now();
      if (ms <= 0) { el.textContent = '00:00:00'; return; }
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      setTimeout(tick, 1000);
    }
    tick();
  }

  /* ── Stats modal ── */
  function showStats() {
    const stats = loadStats();
    const shutRate = stats.played ? Math.round((stats.shut / stats.played) * 100) + '%' : '-';
    const avg = stats.played ? (stats.totalScore / stats.played).toFixed(1) : '-';
    DJUtils.setStatRows('stb-stats-content', [
      { label: 'Games Played', value: stats.played },
      { label: 'Boxes Shut', value: stats.shut, color: '#4ade80' },
      { label: 'Shut Rate', value: shutRate },
      { label: 'Best Score', value: stats.best === null ? '-' : stats.best, color: '#4ade80' },
      { label: 'Average Score', value: avg },
      { label: 'Day Streak', value: stats.curStreak, color: '#fbbf24' },
      { label: 'Best Day Streak', value: stats.bestStreak, color: '#fbbf24' },
    ]);
    $('stb-stats-modal').classList.remove('hidden');
  }

  function closeStats() { $('stb-stats-modal').classList.add('hidden'); }

  function shareStats() {
    const stats = loadStats();
    const avg = stats.played ? (stats.totalScore / stats.played).toFixed(1) : '-';
    const text = 'Shut the Box Stats\n🎲 Played: ' + stats.played + '\n📦 Boxes shut: ' + stats.shut +
      '\n🎯 Best: ' + (stats.best === null ? '-' : stats.best) + ' · Avg: ' + avg +
      '\n🔥 Day streak: ' + stats.curStreak + ' (best ' + stats.bestStreak + ')\ndailyjamm.com/shutthebox/';
    DJUtils.clipboardShare(text, $('stb-stats-share-btn'), 'Share Stats');
  }

  /* ── How to Play ── */
  function showModal() { $('stb-modal').classList.remove('hidden'); }
  function closeModal() {
    $('stb-modal').classList.add('hidden');
    localStorage.setItem(howtoKey, '1');
  }

  /* ── Boot / restore ── */
  function boot() {
    buildTiles();
    buildCube($('stb-cube-0'));
    buildCube($('stb-cube-1'));
    setCubeFace($('stb-cube-0'), 5, true);
    setCubeFace($('stb-cube-1'), 2, true);

    const dateStr = chicagoDate();
    let today = null;
    try { today = JSON.parse(localStorage.getItem(todayKey)); } catch (e) { today = null; }

    if (today && today.date === dateStr && Array.isArray(today.open)) {
      open = today.open;
      rollIndex = today.rollIndex || 0;
      curRoll = today.curRoll || null;
      outcome = today.outcome || null;
      selected = [];
      if (today.phase === 'done' && outcome) {
        phase = 'done';
        renderTiles();
        renderControls();
        if (outcome.shut) {
          setStatus('SHUT THE BOX!', 'Every tile down - a perfect game!');
          $('stb-box').classList.add('stb-box-won');
        } else {
          setStatus('Box score: ' + outcome.score, 'The lower the better - 0 shuts the box.');
        }
        showResults();
      } else if ((today.phase === 'pick' || today.phase === 'anim') && curRoll) {
        // Restore mid-pick: show the roll again and let them finish the move
        phase = 'pick';
        setCubeFace($('stb-cube-0'), curRoll.d1, true);
        if (!curRoll.oneDie) setCubeFace($('stb-cube-1'), curRoll.d2, true);
        $('stb-die-1').classList.toggle('stb-die-off', !!curRoll.oneDie);
        renderTiles();
        renderControls();
        if (!canMake(curRoll.target)) { deadRoll(); } else { renderPickStatus(); }
      } else {
        phase = 'roll';
        curRoll = null;
        renderTiles();
        renderControls();
        setStatus(boxScore() + ' left on the box', 'Roll the dice!');
      }
    } else {
      open = Array(TILES).fill(true);
      rollIndex = 0;
      curRoll = null;
      outcome = null;
      phase = 'roll';
      renderTiles();
      renderControls();
      setStatus('All 9 tiles up', 'Roll the dice to start!');
      saveToday();
    }

    if (!localStorage.getItem(howtoKey)) showModal();

    $('stb-roll-btn').addEventListener('click', () => onRoll(false));
    $('stb-roll1-btn').addEventListener('click', () => onRoll(true));
    $('stb-share-btn').addEventListener('click', () => {
      DJUtils.clipboardShare(shareText(), $('stb-share-btn'), 'Share Results');
    });
    $('stb-stats-btn').addEventListener('click', showStats);
    $('stb-help-btn').addEventListener('click', showModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeStats(); $('stb-modal').classList.add('hidden'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.STBGame = { showStats, closeStats, shareStats, showModal, closeModal };
})();
