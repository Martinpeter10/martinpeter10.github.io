/* ── Roulettedle - DailyJamm ────────────────────────────────────── */
const RLGame = (function () {
  'use strict';

  /* ── Constants ── */
  const MS_PER_HOUR = 3600000;
  const MS_PER_MIN  = 60000;
  const MS_PER_SEC  = 1000;

  const SPINS_PER_DAY   = 3;
  const STARTING_CHIPS  = 1000;
  const DAILY_BONUS_MIN = 50;
  const DAILY_BONUS_MAX = 100;

  /* ── Roulette data ── */
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  // American wheel order (clockwise from 0)
  const WHEEL_ORDER   = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,'00',27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];
  const WHEEL_COLORS  = WHEEL_ORDER.map(p => p === 0 || p === '00' ? 'green' : (RED_NUMBERS.has(p) ? 'red' : 'black'));

  // All pockets for random draw
  const ALL_POCKETS = [0, '00', 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36];

  /* ── Column sets ── */
  const COL1 = new Set([1,4,7,10,13,16,19,22,25,28,31,34]);
  const COL2 = new Set([2,5,8,11,14,17,20,23,26,29,32,35]);
  const COL3 = new Set([3,6,9,12,15,18,21,24,27,30,33,36]);

  /* ── State ── */
  let chips         = STARTING_CHIPS;
  let spinNum       = 0;          // 0-indexed, 0..2
  let activeBets    = {};         // betKey -> chip amount
  let selectedDenom = 10;
  let sessionResults = [];        // [{pocket, net}]
  let dailyDone     = false;
  let isSpinning    = false;

  /* ── DOM helper ── */
  const $ = (id) => document.getElementById(id);

  /* ── Chicago date helpers (via shared DJUtils) ── */
  const chicagoDate     = () => DJUtils.getChicagoDate();
  const chicagoMidnight = () => DJUtils.getChicagoMidnight();

  /* ── LocalStorage ── */
  function loadStats() {
    return DJUtils.loadJSON('rl_stats', { streak: 0, best: 0, played: 0 });
  }
  function saveStats(s) { DJUtils.saveJSON('rl_stats', s); }

  function loadToday() {
    try {
      const d = JSON.parse(localStorage.getItem('rl_today'));
      if (d && d.date === chicagoDate()) return d;
    } catch {}
    return null;
  }
  function saveToday() {
    localStorage.setItem('rl_today', JSON.stringify({
      date: chicagoDate(),
      chips,
      spinNum,
      results: sessionResults,
      done: dailyDone
    }));
  }

  function loadChips() {
    try {
      const c = JSON.parse(localStorage.getItem('rl_chips'));
      if (c !== null && typeof c === 'number') return c;
    } catch {}
    return STARTING_CHIPS;
  }
  function saveChips() { localStorage.setItem('rl_chips', JSON.stringify(chips)); }

  /* ── Pocket helpers ── */
  function pocketColor(pocket) {
    if (pocket === 0 || pocket === '00') return 'green';
    return RED_NUMBERS.has(pocket) ? 'red' : 'black';
  }

  /* ── Bet evaluation ── */
  function checkBet(betKey, pocket) {
    // Returns [won: bool, payout: number]
    if (betKey.startsWith('num-')) {
      const target = betKey.slice(4);
      const targetPocket = target === '00' ? '00' : parseInt(target, 10);
      return [pocket === targetPocket, 35];
    }
    // Zeros lose all outside bets
    if (pocket === 0 || pocket === '00') return [false, 1];
    const n = pocket;
    if (betKey === 'red')   return [RED_NUMBERS.has(n), 1];
    if (betKey === 'black') return [!RED_NUMBERS.has(n), 1];
    if (betKey === 'odd')   return [n % 2 === 1, 1];
    if (betKey === 'even')  return [n % 2 === 0, 1];
    if (betKey === 'low')   return [n >= 1 && n <= 18, 1];
    if (betKey === 'high')  return [n >= 19 && n <= 36, 1];
    if (betKey === 'd1')    return [n >= 1 && n <= 12, 2];
    if (betKey === 'd2')    return [n >= 13 && n <= 24, 2];
    if (betKey === 'd3')    return [n >= 25 && n <= 36, 2];
    if (betKey === 'c1')    return [COL1.has(n), 2];
    if (betKey === 'c2')    return [COL2.has(n), 2];
    if (betKey === 'c3')    return [COL3.has(n), 2];
    return [false, 0];
  }

  function evaluateBets(pocket) {
    let net = 0;
    for (const [key, amount] of Object.entries(activeBets)) {
      const [won, payout] = checkBet(key, pocket);
      net += won ? amount * payout : -amount;
    }
    return net;
  }

  function totalBetAmount() {
    return Object.values(activeBets).reduce((s, v) => s + v, 0);
  }

  /* ── Board building ── */
  function buildBoard() {
    const rows = [
      [3,6,9,12,15,18,21,24,27,30,33,36],
      [2,5,8,11,14,17,20,23,26,29,32,35],
      [1,4,7,10,13,16,19,22,25,28,31,34]
    ];
    [1, 2, 3].forEach(r => {
      const row = $('rl-row-' + r);
      row.innerHTML = '';
      rows[r - 1].forEach(n => {
        const btn = document.createElement('button');
        btn.className = 'rl-num ' + (RED_NUMBERS.has(n) ? 'rl-red' : 'rl-blk');
        btn.dataset.bet = 'num-' + n;
        btn.textContent = String(n);
        row.appendChild(btn);
      });
    });
  }

  /* ── Wheel SVG builder ── */
  function buildWheel() {
    const n      = WHEEL_ORDER.length; // 38
    const cx     = 60, cy = 60;
    const r      = 55, innerR = 20;
    const step   = (2 * Math.PI) / n;
    const FILL   = { red: '#b91c1c', black: '#1a1f2e', green: '#166534' };
    const STROKE = { red: '#7f1d1d', black: '#374151', green: '#14532d' };

    let svg = '';

    // Ball track ring (outer decorative rim where ball rolls)
    svg += '<circle cx="60" cy="60" r="58.5" fill="#1c1008" stroke="#92400e" stroke-width="1"/>';
    svg += '<circle cx="60" cy="60" r="57" fill="none" stroke="#fbbf24" stroke-width="0.5" opacity="0.6"/>';

    for (let i = 0; i < n; i++) {
      const a1 = i * step - Math.PI / 2;
      const a2 = (i + 1) * step - Math.PI / 2;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const x3 = cx + innerR * Math.cos(a2), y3 = cy + innerR * Math.sin(a2);
      const x4 = cx + innerR * Math.cos(a1), y4 = cy + innerR * Math.sin(a1);
      const color = WHEEL_COLORS[i];
      svg += '<path d="M' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
             ' A' + r + ' ' + r + ' 0 0 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
             ' L' + x3.toFixed(2) + ' ' + y3.toFixed(2) +
             ' A' + innerR + ' ' + innerR + ' 0 0 0 ' + x4.toFixed(2) + ' ' + y4.toFixed(2) +
             ' Z" fill="' + FILL[color] + '" stroke="' + STROKE[color] + '" stroke-width="0.6"/>';

      // Number label — placed closer to outer edge for readability
      const midA = (i + 0.5) * step - Math.PI / 2;
      const tr   = r - 9;
      const tx   = cx + tr * Math.cos(midA), ty = cy + tr * Math.sin(midA);
      const rot  = ((i + 0.5) * (360 / n));
      const num  = WHEEL_ORDER[i];
      svg += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) +
             '" text-anchor="middle" dominant-baseline="middle" font-size="4.8"' +
             ' font-weight="800" fill="white" transform="rotate(' + rot.toFixed(1) +
             ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')">' + num + '</text>';
    }

    // Outer pocket ring separator
    svg += '<circle cx="60" cy="60" r="' + (r + 0.5) + '" fill="none" stroke="#fbbf24" stroke-width="1"/>';
    // Inner hub
    svg += '<circle cx="60" cy="60" r="' + (innerR + 0.5) + '" fill="none" stroke="#fbbf24" stroke-width="0.8"/>';
    svg += '<circle cx="60" cy="60" r="' + (innerR - 1) + '" fill="#0f172a"/>';
    svg += '<circle cx="60" cy="60" r="7" fill="none" stroke="#fbbf24" stroke-width="0.8" opacity="0.5"/>';
    svg += '<circle cx="60" cy="60" r="3" fill="#fbbf24" opacity="0.7"/>';

    $('rl-wheel-rotor').innerHTML = '<svg viewBox="0 0 120 120" class="rl-wheel-svg">' + svg + '</svg>';
  }

  /* ── Chip/denom UI ── */
  function selectDenom(denom) {
    selectedDenom = denom;
    document.querySelectorAll('.rl-denom-chip').forEach(b => b.classList.remove('rl-denom-active'));
    const activeBtn = document.querySelector('.rl-denom-chip[data-denom="' + denom + '"]');
    if (activeBtn) activeBtn.classList.add('rl-denom-active');
  }

  function placeBet(betKey) {
    if (isSpinning || dailyDone) return;
    const currentTotal = totalBetAmount();
    const available    = chips - currentTotal;
    if (available <= 0) return;
    const add = selectedDenom === 'all' ? available : Math.min(selectedDenom, available);
    if (add <= 0) return;
    activeBets[betKey] = (activeBets[betKey] || 0) + add;
    updateBetDisplay();
    updateBoardBets();
    updateSpinBtn();
  }

  function clearBets() {
    if (isSpinning) return;
    activeBets = {};
    updateBetDisplay();
    updateBoardBets();
    updateSpinBtn();
  }

  function updateBetDisplay() {
    $('rl-total-bet').textContent = totalBetAmount().toLocaleString();
  }

  function updateBoardBets() {
    document.querySelectorAll('[data-bet]').forEach(btn => {
      const key = btn.dataset.bet;
      const amt = activeBets[key] || 0;
      let overlay = btn.querySelector('.rl-bet-overlay');
      if (amt > 0) {
        if (!overlay) {
          overlay = document.createElement('span');
          overlay.className = 'rl-bet-overlay';
          btn.appendChild(overlay);
        }
        overlay.textContent = amt >= 1000 ? (amt / 1000).toFixed(1) + 'k' : amt;
        btn.classList.add('rl-has-bet');
      } else {
        if (overlay) overlay.remove();
        btn.classList.remove('rl-has-bet');
      }
    });
  }

  function updateSpinBtn() {
    const btn = $('rl-spin-btn');
    if (btn) btn.disabled = totalBetAmount() === 0 || isSpinning;
  }

  function updateChipDisplay() {
    $('rl-chips').textContent = chips.toLocaleString();
  }

  function updateSpinIndicator() {
    $('rl-spin-indicator').textContent = 'Spin ' + (spinNum + 1) + ' of ' + SPINS_PER_DAY;
  }

  /* ── Wheel spin animation (returns finalDeg) ── */
  function startWheelAnimation() {
    const rotor = $('rl-wheel-rotor');
    rotor.style.transition = 'none';
    rotor.style.transform  = 'rotate(0deg)';
    rotor.getBoundingClientRect(); // force reflow

    // 3–7 full rotations plus a random offset
    const finalDeg = 1080 + Math.floor(Math.random() * 1440);
    rotor.style.transition = 'transform 5s cubic-bezier(0.15, 0.65, 0.10, 1)';
    rotor.style.transform  = 'rotate(' + finalDeg + 'deg)';
    return finalDeg;
  }

  /* ── Ball animation (counter-clockwise, lands on winning pocket) ── */
  function animateBall(finalDeg, pocketIdx, callback) {
    const ballEl = document.getElementById('rl-ball');
    if (!ballEl) { setTimeout(callback, 5500); return; }

    ballEl.setAttribute('visibility', 'visible');

    const TOTAL_MS = 5500;
    const cx = 60, cy = 60;
    const outerR = 55;   // ball track radius (just inside outer rim)
    const landR  = 46;   // pocket radius where ball settles (matches number position)

    // Compute the screen-space angle of the winning pocket after the wheel stops.
    // Pocket i spans angle i*step to (i+1)*step in wheel local coords, starting from -π/2.
    // After wheel rotates finalDeg CW, pocket center is at:
    const N = WHEEL_ORDER.length; // 38
    const pocketScreenAngle = (pocketIdx + 0.5) * (2 * Math.PI / N)
                              - Math.PI / 2
                              + finalDeg * Math.PI / 180;

    // Normalize to [0, 2π)
    const pocketAngleNorm = ((pocketScreenAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Ball starts at top: angle = 3π/2 (= -π/2 normalized)
    const startAngleNorm = 3 * Math.PI / 2;

    // Ball travels CCW (decreasing angle). CCW distance from start to landing:
    const ccwDist = ((startAngleNorm - pocketAngleNorm) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    // Total travel: 5 full CCW orbits + ccwDist to land exactly on pocket
    const totalTravel = 5 * 2 * Math.PI + ccwDist;
    const startAngle  = Math.PI / 2 * 3; // 270° = top of wheel

    let startTime = null;

    function easeOut(t) {
      // Smooth deceleration: cubic ease-out
      return 1 - Math.pow(1 - t, 2.2);
    }

    function frame(now) {
      if (!startTime) startTime = now;
      const elapsed  = now - startTime;
      const t        = Math.min(elapsed / TOTAL_MS, 1);
      const progress = easeOut(t);

      // Ball angle (going CCW = decreasing)
      const angle = startAngle - progress * totalTravel;

      // Radius: stay on outer track until 80%, then drop into pocket
      let r;
      if (t < 0.80) {
        r = outerR;
      } else {
        const dropT = (t - 0.80) / 0.20;
        r = outerR - (outerR - landR) * Math.pow(dropT, 0.6);
      }

      ballEl.setAttribute('cx', (cx + r * Math.cos(angle)).toFixed(2));
      ballEl.setAttribute('cy', (cy + r * Math.sin(angle)).toFixed(2));

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        callback();
      }
    }

    requestAnimationFrame(frame);
  }

  /* ── Main spin flow ── */
  function doSpin() {
    if (isSpinning || dailyDone || totalBetAmount() === 0) return;

    // Scroll wheel into view if not fully visible
    const wheelWrap = document.querySelector('.rl-wheel-wrap');
    if (wheelWrap) {
      const rect = wheelWrap.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        wheelWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    isSpinning = true;
    $('rl-spin-btn').disabled = true;
    $('rl-clear-bets').disabled = true;
    $('rl-spin-result').classList.add('hidden');

    // Deduct bet total upfront
    const betTotal = totalBetAmount();
    chips -= betTotal;
    updateChipDisplay();
    saveChips();

    // Pick random pocket and find its index on the wheel
    const pocket    = ALL_POCKETS[Math.floor(Math.random() * ALL_POCKETS.length)];
    const pocketIdx = WHEEL_ORDER.indexOf(pocket);

    // Reset result badge
    $('rl-result-num').textContent = '?';
    $('rl-result-badge').className = 'rl-result-badge';

    // Start wheel and ball animations in parallel; ball callback fires after both are done
    const finalDeg = startWheelAnimation();

    animateBall(finalDeg, pocketIdx, () => {
      isSpinning = false;
      $('rl-clear-bets').disabled = false;

      // Evaluate bets, return stake + net
      const net = evaluateBets(pocket);
      chips += betTotal + net;
      if (chips < 0) chips = 0;

      // Update result badge
      const color = pocketColor(pocket);
      $('rl-result-badge').className = 'rl-result-badge rl-result-' + color;
      $('rl-result-num').textContent = pocket;

      updateChipDisplay();
      saveChips();

      sessionResults.push({ pocket, net });
      pushHistory(pocket);
      updateAllTime(net);
      spinNum++;
      saveToday();

      showSpinResult(net, pocket);

      // Decide what comes next
      if (chips <= 0 && spinNum < SPINS_PER_DAY) {
        setTimeout(() => {
          activeBets = {};
          updateBoardBets();
          updateBetDisplay();
          showBrokeScreen();
        }, 2200);
      } else if (spinNum >= SPINS_PER_DAY) {
        setTimeout(() => {
          activeBets = {};
          updateBoardBets();
          updateBetDisplay();
          showFinalResults();
        }, 2200);
      } else {
        // Ready for next spin — hide ball
        setTimeout(() => {
          const ballEl = document.getElementById('rl-ball');
          if (ballEl) ballEl.setAttribute('visibility', 'hidden');
          activeBets = {};
          updateBoardBets();
          updateBetDisplay();
          $('rl-spin-result').classList.add('hidden');
          updateSpinIndicator();
          updateSpinBtn();
        }, 2200);
      }
    });
  }

  /* ── Spin result banner ── */
  function showSpinResult(net, pocket) {
    const color  = pocketColor(pocket);
    const label  = color === 'red' ? 'Red' : color === 'black' ? 'Black' : 'Green';
    const pStr   = String(pocket);
    let cls, msg;
    if (net > 0) {
      cls = 'rl-result-win';
      msg = label + ' ' + pStr + ' · +' + net.toLocaleString() + ' chips!';
    } else if (net < 0) {
      cls = 'rl-result-lose';
      msg = label + ' ' + pStr + ' · ' + net.toLocaleString() + ' chips';
    } else {
      cls = 'rl-result-push';
      msg = label + ' ' + pStr + ' · Even';
    }
    const el = $('rl-spin-result');
    el.textContent = msg;
    el.className   = 'rl-spin-result ' + cls;
    el.classList.remove('hidden');
  }

  /* ── Final results ── */
  function showFinalResults() {
    dailyDone = true;
    saveToday();

    const stats    = loadStats();
    const totalNet = sessionResults.reduce((s, r) => s + r.net, 0);
    stats.played++;
    if (totalNet >= 0) {
      stats.streak++;
      if (stats.streak > stats.best) stats.best = stats.streak;
    } else {
      stats.streak = 0;
    }
    saveStats(stats);

    $('rl-final-chips').textContent = chips.toLocaleString();

    const sign  = totalNet >= 0 ? '+' : '';
    const netEl = $('rl-session-net');
    netEl.textContent = 'Session: ' + sign + totalNet.toLocaleString() + ' chips';
    netEl.className   = totalNet >= 0
      ? 'text-sm font-bold mt-1 text-green-400'
      : 'text-sm font-bold mt-1 text-red-400';

    const row = $('rl-spin-results-row');
    row.textContent = '';
    sessionResults.forEach((r, i) => {
      const dot   = document.createElement('div');
      dot.className = 'rl-result-dot';
      const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : String(r.net);
      const c     = pocketColor(r.pocket);
      const pocketColor2 = c === 'red' ? '#ef4444' : c === 'green' ? '#22c55e' : '#9ca3af';
      const s1 = document.createElement('span'); s1.className = 'text-lg'; s1.textContent = emoji;
      const s2 = document.createElement('span'); s2.textContent = 'Spin ' + (i + 1);
      const s3 = document.createElement('span'); s3.style.cssText = 'color:' + pocketColor2 + ';font-weight:700'; s3.textContent = String(r.pocket);
      const s4 = document.createElement('span'); s4.className = 'font-bold'; s4.textContent = label;
      dot.appendChild(s1); dot.appendChild(s2); dot.appendChild(s3); dot.appendChild(s4);
      row.appendChild(dot);
    });

    $('rl-results').classList.remove('hidden');
    $('rl-bet-area').classList.add('hidden');
    $('rl-spin-result').classList.add('hidden');
    $('rl-spin-indicator').textContent = 'All spins done!';

    startCountdown();
  }

  /* ── Share ── */
  function buildShareText() {
    const totalNet = sessionResults.reduce((s, r) => s + r.net, 0);
    const emojis   = sessionResults.map(r =>
      r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1'
    ).join('');
    const sign = totalNet >= 0 ? '+' : '';
    return 'Roulettedle ' + chicagoDate() + '\n' +
      emojis + ' ' + sign + totalNet.toLocaleString() + ' chips\n' +
      'Stack: ' + chips.toLocaleString() + '\n' +
      'dailyjamm.com/roulettedle/';
  }

  function shareResults() {
    DJUtils.clipboardShare(buildShareText(), $('rl-share-btn'), 'Share Results');
  }

  function shareBrokeResults() {
    DJUtils.clipboardShare(buildShareText(), $('rl-broke-share-btn'), 'Share Results');
  }

  /* ── Countdown ── */
  function startCountdown() {
    const targets = ['rl-countdown', 'rl-broke-countdown'].map($).filter(Boolean);
    function tick() {
      const diff = chicagoMidnight() - Date.now();
      const t = diff <= 0 ? '00:00:00' :
        String(Math.floor(diff / MS_PER_HOUR)).padStart(2, '0') + ':' +
        String(Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN)).padStart(2, '0') + ':' +
        String(Math.floor((diff % MS_PER_MIN) / MS_PER_SEC)).padStart(2, '0');
      targets.forEach(el => { if (el) el.textContent = t; });
    }
    tick();
    setInterval(tick, MS_PER_SEC);
  }

  /* ── Broke screen ── */
  function showBrokeScreen() {
    dailyDone = true;
    saveToday();
    saveChips();

    const stats = loadStats();
    stats.played++;
    stats.streak = 0;
    saveStats(stats);

    const row = $('rl-broke-spins');
    row.textContent = '';
    sessionResults.forEach((r, i) => {
      const dot   = document.createElement('div');
      dot.className = 'rl-result-dot';
      const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : String(r.net);
      const s1 = document.createElement('span'); s1.className = 'text-lg'; s1.textContent = emoji;
      const s2 = document.createElement('span'); s2.textContent = 'Spin ' + (i + 1);
      const s3 = document.createElement('span'); s3.className = 'font-bold'; s3.textContent = label;
      dot.appendChild(s1); dot.appendChild(s2); dot.appendChild(s3);
      row.appendChild(dot);
    });

    $('rl-broke').classList.remove('hidden');
    $('rl-bet-area').classList.add('hidden');
    $('rl-spin-result').classList.add('hidden');
    $('rl-spin-indicator').textContent = 'Out of chips';

    startCountdown();
  }

  /* ── All-time stats ── */
  function loadAllTime() {
    try { return JSON.parse(localStorage.getItem('rl_alltime')) || { biggestWin: 0, biggestLoss: 0, totalNet: 0 }; }
    catch { return { biggestWin: 0, biggestLoss: 0, totalNet: 0 }; }
  }
  function updateAllTime(net) {
    const a = loadAllTime();
    if (net > 0 && net > a.biggestWin)   a.biggestWin  = net;
    if (net < 0 && net < a.biggestLoss)  a.biggestLoss = net;
    a.totalNet += net;
    localStorage.setItem('rl_alltime', JSON.stringify(a));
  }

  /* ── Spin history ── */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem('rl_history')) || []; }
    catch { return []; }
  }
  function pushHistory(pocket) {
    const h = loadHistory();
    h.unshift(pocket); // newest first
    if (h.length > 50) h.length = 50;
    localStorage.setItem('rl_history', JSON.stringify(h));
  }

  function showHistory() {
    const history = loadHistory();

    // Last 10 spins as colored chips
    const spinsEl = $('rl-hist-spins');
    spinsEl.textContent = '';
    if (history.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'color:#6b7280;font-size:12px';
      empty.textContent = 'No spins yet.';
      spinsEl.appendChild(empty);
    } else {
      history.slice(0, 10).forEach(pocket => {
        const color = pocketColor(pocket);
        const bg     = color === 'red' ? '#b91c1c' : color === 'green' ? '#166534' : '#1f2937';
        const border = color === 'red' ? '#ef4444' : color === 'green' ? '#22c55e' : '#6b7280';
        const chip = document.createElement('div');
        chip.style.cssText = 'width:36px;height:36px;border-radius:50%;background:' + bg +
          ';border:2px solid ' + border + ';display:flex;align-items:center;justify-content:center;' +
          'font-size:11px;font-weight:800;color:#fff;flex-shrink:0';
        chip.textContent = String(pocket);
        spinsEl.appendChild(chip);
      });
    }

    // Stats — exclude 0 and 00 from red/black and odd/even
    const filtered = history.filter(p => p !== 0 && p !== '00');
    const reds   = filtered.filter(p => pocketColor(p) === 'red').length;
    const blacks = filtered.filter(p => pocketColor(p) === 'black').length;
    const odds   = filtered.filter(p => typeof p === 'number' && p % 2 === 1).length;
    const evens  = filtered.filter(p => typeof p === 'number' && p % 2 === 0).length;

    function renderSplitBar(containerId, leftLabel, leftCount, rightLabel, rightCount, leftColor, rightColor) {
      const total    = leftCount + rightCount;
      const leftPct  = total > 0 ? Math.round(leftCount  / total * 100) : 50;
      const rightPct = 100 - leftPct;
      const wrap = document.createElement('div');
      const labels = document.createElement('div');
      labels.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-bottom:5px';
      const lSpan = document.createElement('span');
      lSpan.style.color = leftColor;
      lSpan.textContent = leftLabel + ' \u00b7 ' + leftPct + '% (' + leftCount + ')';
      const rSpan = document.createElement('span');
      rSpan.style.color = rightColor;
      rSpan.textContent = rightPct + '% (' + rightCount + ') \u00b7 ' + rightLabel;
      labels.appendChild(lSpan); labels.appendChild(rSpan);
      const bar = document.createElement('div');
      bar.style.cssText = 'height:10px;border-radius:5px;overflow:hidden;display:flex';
      const lBar = document.createElement('div');
      lBar.style.cssText = 'width:' + leftPct + '%;background:' + leftColor + ';transition:width .4s';
      const rBar = document.createElement('div');
      rBar.style.cssText = 'width:' + rightPct + '%;background:' + rightColor + ';transition:width .4s';
      bar.appendChild(lBar); bar.appendChild(rBar);
      wrap.appendChild(labels); wrap.appendChild(bar);
      const el = $(containerId);
      el.textContent = '';
      el.appendChild(wrap);
    }

    renderSplitBar('rl-hist-rb', 'Red', reds, 'Black', blacks, '#ef4444', '#6b7280');
    renderSplitBar('rl-hist-oe', 'Odd', odds, 'Even', evens, '#a78bfa', '#60a5fa');

    // Spins since last 0 / 00
    function spinsSince(pocket) {
      const idx = history.findIndex(p => p === pocket);
      if (history.length === 0) return '—';
      if (idx === -1) return String(history.length);
      return String(idx);
    }
    function makeZeroStat(containerId, since, label) {
      const el = $(containerId);
      el.textContent = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:24px;justify-content:center';
      const cell = document.createElement('div');
      cell.style.textAlign = 'center';
      const num = document.createElement('div');
      num.style.cssText = 'font-size:26px;font-weight:900;color:#22c55e;line-height:1';
      num.textContent = since;
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;color:#6b7280;margin-top:3px';
      lbl.textContent = 'spins since ';
      const lbl2 = document.createElement('span');
      lbl2.style.cssText = 'color:#22c55e;font-weight:700';
      lbl2.textContent = label;
      lbl.appendChild(lbl2);
      cell.appendChild(num); cell.appendChild(lbl);
      wrap.appendChild(cell);
      el.appendChild(wrap);
    }

    const zerosEl = $('rl-hist-zeros');
    zerosEl.textContent = '';
    const zerosWrap = document.createElement('div');
    zerosWrap.style.cssText = 'display:flex;gap:24px;justify-content:center';
    [{ pocket: 0, lbl: '0' }, { pocket: '00', lbl: '00' }].forEach(function (z) {
      const cell = document.createElement('div');
      cell.style.textAlign = 'center';
      const num = document.createElement('div');
      num.style.cssText = 'font-size:26px;font-weight:900;color:#22c55e;line-height:1';
      num.textContent = spinsSince(z.pocket);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;color:#6b7280;margin-top:3px';
      lbl.textContent = 'spins since ';
      const lbl2 = document.createElement('span');
      lbl2.style.cssText = 'color:#22c55e;font-weight:700';
      lbl2.textContent = z.lbl;
      lbl.appendChild(lbl2);
      cell.appendChild(num); cell.appendChild(lbl);
      zerosWrap.appendChild(cell);
    });
    zerosEl.appendChild(zerosWrap);

    // All-time stats
    const at = loadAllTime();
    const atSign  = at.totalNet >= 0 ? '+' : '';
    const atColor = at.totalNet >= 0 ? '#4ade80' : '#f87171';
    const alltimeEl = $('rl-hist-alltime');
    alltimeEl.textContent = '';
    const atWrap = document.createElement('div');
    atWrap.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap';
    [
      { val: '+' + at.biggestWin.toLocaleString(), color: '#4ade80', lbl: 'best single spin' },
      { val: at.biggestLoss.toLocaleString(),      color: '#f87171', lbl: 'worst single spin' },
      { val: atSign + at.totalNet.toLocaleString(), color: atColor,  lbl: 'all-time net' },
    ].forEach(function (item) {
      const cell = document.createElement('div');
      cell.style.cssText = 'text-align:center;min-width:70px';
      const num = document.createElement('div');
      num.style.cssText = 'font-size:20px;font-weight:900;color:' + item.color + ';line-height:1';
      num.textContent = item.val;
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;color:#6b7280;margin-top:3px';
      lbl.textContent = item.lbl;
      cell.appendChild(num); cell.appendChild(lbl);
      atWrap.appendChild(cell);
    });
    alltimeEl.appendChild(atWrap);

    const shareBtn = $('rl-hist-share-btn');
    if (shareBtn) {
      shareBtn.onclick = function () { shareStats(); };
    }

    $('rl-history-modal').classList.remove('hidden');
  }

  function shareStats() {
    const at = loadAllTime();
    const atSign = at.totalNet >= 0 ? '+' : '';
    const lines = [
      'Roulettedle Stats \u26AA',
      '',
      '\uD83C\uDFC6 Best Spin: +' + at.biggestWin.toLocaleString(),
      '\uD83D\uDCB8 Worst Spin: ' + at.biggestLoss.toLocaleString(),
      '\uD83D\uDCCA All-Time Net: ' + atSign + at.totalNet.toLocaleString(),
      '',
      'dailyjamm.com/roulettedle/',
    ];
    const btn = $('rl-hist-share-btn');
    if (btn) DJUtils.clipboardShare(lines.join('\n'), btn, 'Share Stats');
  }

  function closeHistory() {
    $('rl-history-modal').classList.add('hidden');
  }

  /* ── Modal ── */
  function showModal()  { $('rl-modal').classList.remove('hidden'); }
  function closeModal() {
    $('rl-modal').classList.add('hidden');
    localStorage.setItem('rl_seen_howto', '1');
  }

  /* ── Daily welcome ── */
  function showDailyWelcome(callback) {
    const steps = (DAILY_BONUS_MAX - DAILY_BONUS_MIN) / 10 + 1;
    const bonus = DAILY_BONUS_MIN + Math.floor(Math.random() * steps) * 10;
    chips += bonus;
    saveChips();
    localStorage.setItem('rl_bonus_date', chicagoDate());

    $('rl-bonus-amount').textContent = '+' + bonus;
    $('rl-new-stack').textContent    = chips.toLocaleString();
    $('rl-daily-modal').classList.remove('hidden');

    $('rl-daily-close').onclick = function () {
      $('rl-daily-modal').classList.add('hidden');
      updateChipDisplay();
      if (callback) callback();
    };
  }

  /* ── Init ── */
  function init() {
    buildBoard();
    buildWheel();

    chips = loadChips();

    const today          = loadToday();
    const isFirstVisit   = !localStorage.getItem('rl_seen_howto');
    const bonusDate      = localStorage.getItem('rl_bonus_date');
    const needsBonus     = !isFirstVisit && bonusDate !== chicagoDate();

    if (today && today.done) {
      // Already finished today
      spinNum        = today.spinNum;
      chips          = today.chips;
      sessionResults = today.results || [];
      dailyDone      = true;
      updateChipDisplay();
      updateSpinIndicator();
      if (chips <= 0 && spinNum < SPINS_PER_DAY) {
        showBrokeScreen();
      } else {
        showFinalResults();
      }
    } else if (today && today.spinNum > 0) {
      // Mid-session restore
      spinNum        = today.spinNum;
      chips          = today.chips;
      sessionResults = today.results || [];
      updateChipDisplay();
      updateSpinIndicator();
      if (spinNum >= SPINS_PER_DAY) {
        showFinalResults();
      } else if (chips <= 0) {
        showBrokeScreen();
      }
      // else: fall through to betting UI as normal
    } else {
      // Fresh start for the day
      if (isFirstVisit) {
        localStorage.setItem('rl_bonus_date', chicagoDate());
        updateChipDisplay();
        updateSpinIndicator();
        showModal();
      } else if (needsBonus) {
        updateChipDisplay();
        updateSpinIndicator();
        showDailyWelcome(() => {});
      } else {
        updateChipDisplay();
        updateSpinIndicator();
      }
    }

    // Chip denomination buttons
    document.querySelectorAll('.rl-denom-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.denom;
        selectDenom(d === 'all' ? 'all' : parseInt(d, 10));
      });
    });
    selectDenom(10);

    // Bet board (all [data-bet] elements, including dynamically built number cells)
    document.querySelectorAll('[data-bet]').forEach(btn => {
      btn.addEventListener('click', () => placeBet(btn.dataset.bet));
    });

    $('rl-clear-bets').addEventListener('click', clearBets);
    $('rl-spin-btn').addEventListener('click', doSpin);
    $('rl-share-btn').addEventListener('click', shareResults);
    $('rl-help-btn').addEventListener('click', showModal);
    $('rl-history-btn').addEventListener('click', showHistory);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeHistory();
        $('rl-daily-modal').classList.add('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { closeModal, showModal, shareResults, shareBrokeResults, showHistory, closeHistory };
})();
