// Bluffdle - daily Liar's Dice on DailyJamm
// Player + 3 daily AI opponents, 5 dice each, no wilds, sudden-death challenges.
(function () {
  'use strict';

  const DICE_EACH = 5;
  const FACES = 6;

  /* ── AI cast (shared names with Holdle) ── */
  // challenge: call "Liar!" when P(bid is true) drops below this
  // bluff: chance of bidding a face they barely hold
  // jump: chance of raising quantity by 2 instead of the minimum
  const AI_DEFS = [
    { id: 0, name: 'David',   challenge: 0.12, bluff: 0.45, jump: 0.35 },
    { id: 1, name: 'Peter',   challenge: 0.42, bluff: 0.00, jump: 0.00 },
    { id: 2, name: 'Jon',     challenge: 0.32, bluff: 0.05, jump: 0.05 },
    { id: 3, name: 'Caleb',   challenge: 0.22, bluff: 0.15, jump: 0.25 },
    { id: 4, name: 'Mandy',   challenge: 0.30, bluff: 0.20, jump: 0.10 },
    { id: 5, name: 'Madelyn', challenge: 0.10, bluff: 0.60, jump: 0.30 },
    { id: 6, name: 'Josh',    challenge: 0.30, bluff: 0.20, jump: 0.05 },
  ];

  /* ── Utilities ── */
  const $ = id => document.getElementById(id);

  function chicagoDate() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  }

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

  // P(X >= need) for X ~ Binomial(n, 1/6)
  function probAtLeast(need, n) {
    if (need <= 0) return 1;
    if (need > n) return 0;
    const p = 1 / 6;
    let term = Math.pow(1 - p, n); // P(X = 0)
    let cum = term;
    for (let k = 1; k < need; k++) {
      term = term * ((n - k + 1) / k) * (p / (1 - p));
      cum += term;
    }
    return Math.max(0, 1 - cum);
  }

  function bidText(bid) { return bid.q + ' × ' + bid.f + 's'; }

  /* ── State ── */
  const SEATS = 4; // seat 0 = player, 1-3 = AIs
  let todayAIs = [];        // 3 AI defs (seat 1..3 -> todayAIs[seat-1])
  let alive = [true, true, true, true];
  let dice = [[], [], [], []];
  let round = 1;
  let turnSeat = 0;
  let turnCount = 0;        // total actions taken today (rng stream + persistence)
  let curBid = null;        // { q, f, seat }
  let phase = 'bidding';    // 'bidding' | 'reveal' | 'done'
  let revealInfo = null;    // { bid, challengerSeat, count, bidTrue, loserSeat }
  let eliminatedOrder = [];
  let outcome = null;       // { win, aisBeaten }
  let actionLocked = false;
  let aiTimer = null;

  const todayKey = 'bf_today';
  const statsKey = 'bf_stats_v2';
  const howtoKey = 'bf_seen_howto';

  /* ── Daily setup ── */
  function getDailyAIIndexes(dateStr) {
    const rng = mulberry32(dateToSeed(dateStr));
    const idx = AI_DEFS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, 3);
  }

  function rollDice(rnd) {
    const rng = mulberry32(dateToSeed(chicagoDate()) + rnd * 7919);
    for (let s = 0; s < SEATS; s++) {
      dice[s] = [];
      if (!alive[s]) continue;
      for (let i = 0; i < DICE_EACH; i++) dice[s].push(1 + Math.floor(rng() * FACES));
      dice[s].sort((a, b) => a - b);
    }
  }

  function totalDice() {
    return alive.reduce((n, a, s) => n + (a ? dice[s].length : 0), 0);
  }

  function aliveAICount() { return alive.filter((a, s) => a && s > 0).length; }

  function nextAliveSeat(from) {
    for (let k = 1; k <= SEATS; k++) {
      const s = (from + k) % SEATS;
      if (alive[s]) return s;
    }
    return -1;
  }

  function decisionRng() {
    return mulberry32(dateToSeed(chicagoDate()) + round * 7919 + 131 + turnCount * 97);
  }

  /* ── Persistence ── */
  function saveToday() {
    DJUtils.saveJSON(todayKey, {
      date: chicagoDate(),
      ais: todayAIs.map(a => a.id),
      alive, dice, round, turnSeat, turnCount, curBid, phase,
      revealInfo, eliminatedOrder, outcome,
    });
  }

  function loadStats() {
    return DJUtils.loadJSON(statsKey, {
      played: 0, wins: 0, curStreak: 0, bestStreak: 0,
      place: [0, 0, 0, 0],   // index = AIs outlasted (3 = won the table)
      hh: {},                // aiId -> { beat, lostTo }
    });
  }

  /* ── Bidding rules ── */
  function isLegalRaise(bid, q, f) {
    if (q < 1 || q > totalDice() || f < 1 || f > FACES) return false;
    if (!bid) return true;
    return q > bid.q || (q === bid.q && f > bid.f);
  }

  function hasLegalRaise(bid) {
    if (!bid) return true;
    return !(bid.q >= totalDice() && bid.f >= FACES);
  }

  function minimalRaise(bid) {
    if (!bid) return { q: 2, f: 3 };
    if (bid.f < FACES) return { q: bid.q, f: bid.f + 1 };
    return { q: bid.q + 1, f: 1 };
  }

  /* ── AI decision ── */
  function aiDecide(seat) {
    const def = todayAIs[seat - 1];
    const rng = decisionRng();
    const counts = [0, 0, 0, 0, 0, 0, 0];
    dice[seat].forEach(d => counts[d]++);
    const total = totalDice();
    const unknown = total - dice[seat].length;

    const pTrue = bid => probAtLeast(bid.q - counts[bid.f], unknown);

    // Forced challenge when the bid can't be raised
    if (curBid && !hasLegalRaise(curBid)) return { action: 'liar' };

    // Challenge decision
    if (curBid) {
      const p = pTrue(curBid);
      let thresh = def.challenge + (rng() - 0.5) * 0.08;
      // Everyone gets more suspicious of huge bids relative to the table
      if (curBid.q > total / 2) thresh += 0.10;
      if (def.id === 5 && rng() < 0.15) return { action: 'liar' }; // Madelyn chaos call
      if (p < thresh) return { action: 'liar' };
    }

    // Build candidate raises
    const cands = [];
    if (!curBid) {
      let bestF = 1;
      for (let f = 2; f <= FACES; f++) if (counts[f] >= counts[bestF]) bestF = f;
      for (let f = 1; f <= FACES; f++) {
        const q = Math.max(1, counts[f]);
        if (isLegalRaise(null, q, f)) cands.push({ q, f });
      }
      if (isLegalRaise(null, counts[bestF] + 1, bestF)) cands.push({ q: counts[bestF] + 1, f: bestF });
    } else {
      for (let f = curBid.f + 1; f <= FACES; f++) {
        if (isLegalRaise(curBid, curBid.q, f)) cands.push({ q: curBid.q, f });
      }
      for (let f = 1; f <= FACES; f++) {
        if (isLegalRaise(curBid, curBid.q + 1, f)) cands.push({ q: curBid.q + 1, f });
        if (def.jump > 0 && rng() < def.jump && isLegalRaise(curBid, curBid.q + 2, f)) {
          cands.push({ q: curBid.q + 2, f });
        }
      }
    }
    if (!cands.length) return { action: 'liar' };

    // Bluff: pick a candidate they barely hold, favoring bigger bids
    if (rng() < def.bluff) {
      const weak = cands.filter(c => counts[c.f] <= 1);
      const pool = weak.length ? weak : cands;
      return { action: 'bid', bid: pool[Math.floor(rng() * pool.length)] };
    }

    // Honest: pick the most plausible candidate, preferring faces they hold
    let best = cands[0], bestScore = -1;
    cands.forEach(c => {
      const score = pTrue(c) + counts[c.f] * 0.06 - c.q * 0.01;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    // If even the best raise is hopeless, challenge instead
    if (curBid && pTrue(best) < 0.05 && pTrue(curBid) < 0.5) return { action: 'liar' };
    return { action: 'bid', bid: best };
  }

  /* ── Rendering ── */
  const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  function makeDie(face, cls) {
    const die = document.createElement('span');
    die.className = 'bf-die' + (cls ? ' ' + cls : '');
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('span');
      cell.className = 'bf-cell' + (DIE_PIPS[face].indexOf(i) >= 0 ? ' bf-pip' : '');
      die.appendChild(cell);
    }
    return die;
  }

  function setDieFace(die, face) {
    const cells = die.children;
    for (let i = 0; i < 9; i++) {
      cells[i].className = 'bf-cell' + (DIE_PIPS[face].indexOf(i) >= 0 ? ' bf-pip' : '');
    }
  }

  // Tumble the player's dice with random faces, then settle onto the real roll
  function animateRoll(cb) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cb(); return; }
    const mine = $('bf-player-dice');
    const table = document.querySelector('.bf-table');
    table.classList.add('bf-rolling');
    $('bf-controls').classList.add('hidden');
    const note = $('bf-turn-note');
    note.classList.remove('hidden');
    note.textContent = 'Shaking cups...';
    mine.textContent = '';
    const els = dice[0].map(() => {
      const el = makeDie(1 + Math.floor(Math.random() * 6), 'bf-die-roll');
      mine.appendChild(el);
      return el;
    });
    let ticks = 0;
    const iv = setInterval(() => {
      ticks++;
      els.forEach(el => setDieFace(el, 1 + Math.floor(Math.random() * 6)));
      if (ticks >= 9) {
        clearInterval(iv);
        els.forEach((el, i) => {
          setTimeout(() => {
            el.classList.remove('bf-die-roll');
            el.classList.add('bf-die-settle');
            setDieFace(el, dice[0][i]);
          }, i * 90);
        });
        setTimeout(() => {
          table.classList.remove('bf-rolling');
          note.textContent = 'Waiting for opponents...';
          cb();
        }, els.length * 90 + 280);
      }
    }, 90);
  }

  function renderSeats() {
    for (let s = 1; s < SEATS; s++) {
      const seat = $('bf-ai-seat-' + (s - 1));
      if (!seat) continue;
      seat.querySelector('.bf-ai-name').textContent = todayAIs[s - 1].name;
      seat.classList.toggle('bf-out', !alive[s]);
      seat.classList.remove('bf-active');
      const cup = seat.querySelector('.bf-ai-dicearea');
      cup.textContent = '';
      if (!alive[s]) {
        const out = document.createElement('span');
        out.className = 'bf-out-label';
        out.textContent = 'OUT';
        cup.appendChild(out);
      } else if (phase === 'reveal' || phase === 'done') {
        dice[s].forEach(d => cup.appendChild(makeDie(d, 'bf-die-sm' +
          (revealInfo && d === revealInfo.bid.f ? ' bf-die-hit' : ''))));
      } else {
        for (let i = 0; i < dice[s].length; i++) {
          const hid = document.createElement('span');
          hid.className = 'bf-die bf-die-sm bf-die-hidden';
          hid.textContent = '?';
          cup.appendChild(hid);
        }
      }
    }
    // Player dice
    const mine = $('bf-player-dice');
    mine.textContent = '';
    if (alive[0]) {
      dice[0].forEach(d => mine.appendChild(makeDie(d,
        (phase === 'reveal' && revealInfo && d === revealInfo.bid.f) ? 'bf-die-hit' : '')));
    } else {
      const out = document.createElement('span');
      out.className = 'bf-out-label';
      out.textContent = 'OUT';
      mine.appendChild(out);
    }
    $('bf-total-dice').textContent = totalDice() + ' dice on the table';
    $('bf-round-label').textContent = 'Round ' + round;
  }

  function setBubble(seat, text, kind) {
    const el = seat === 0 ? $('bf-player-bubble') :
      $('bf-ai-seat-' + (seat - 1)).querySelector('.bf-ai-bubble');
    if (!el) return;
    el.textContent = text;
    el.className = (seat === 0 ? 'bf-player-bubble' : 'bf-ai-bubble') + (kind ? ' bf-bubble-' + kind : '');
  }

  function clearBubbles() {
    for (let s = 0; s < SEATS; s++) setBubble(s, '', '');
  }

  function renderBid() {
    const el = $('bf-current-bid');
    el.textContent = '';
    if (!curBid) {
      const span = document.createElement('span');
      span.className = 'bf-bid-none';
      span.textContent = 'No bid yet - open the round';
      el.appendChild(span);
      return;
    }
    const who = document.createElement('div');
    who.className = 'bf-bid-who';
    who.textContent = (curBid.seat === 0 ? 'You bid' : todayAIs[curBid.seat - 1].name + ' bids');
    const val = document.createElement('div');
    val.className = 'bf-bid-val';
    const qty = document.createElement('span');
    qty.className = 'bf-bid-qty';
    qty.textContent = curBid.q + ' ×';
    val.appendChild(qty);
    val.appendChild(makeDie(curBid.f, 'bf-die-bid'));
    const sub = document.createElement('div');
    sub.className = 'bf-bid-sub';
    sub.textContent = '"There are at least ' + curBid.q + ' dice showing ' + curBid.f +
      ' among all ' + totalDice() + '"';
    el.appendChild(who);
    el.appendChild(val);
    el.appendChild(sub);
  }

  function setAISeatActive(seat) {
    for (let s = 1; s < SEATS; s++) {
      $('bf-ai-seat-' + (s - 1)).classList.toggle('bf-active', s === seat);
    }
  }

  /* ── Player controls ── */
  let selQ = 2, selF = 3;

  function clampSelection() {
    const total = totalDice();
    const m = minimalRaise(curBid);
    if (!isLegalRaise(curBid, selQ, selF)) { selQ = m.q; selF = m.f; }
    if (selQ > total) selQ = total;
  }

  function minQtyForFace(f) {
    if (!curBid) return 1;
    return f > curBid.f ? curBid.q : curBid.q + 1;
  }

  function renderControls() {
    const box = $('bf-controls');
    const myTurn = phase === 'bidding' && turnSeat === 0 && alive[0] && !outcome;
    box.classList.toggle('hidden', !myTurn);
    $('bf-turn-note').classList.toggle('hidden', myTurn || phase !== 'bidding');
    if (!myTurn) return;

    clampSelection();
    const total = totalDice();
    const canRaise = hasLegalRaise(curBid);

    $('bf-qty-val').textContent = selQ;
    $('bf-qty-minus').disabled = !canRaise || selQ <= minQtyForFace(selF);
    $('bf-qty-plus').disabled = !canRaise || selQ >= total;

    const faceRow = $('bf-face-row');
    faceRow.textContent = '';
    for (let f = 1; f <= FACES; f++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bf-face-btn' + (f === selF ? ' bf-face-sel' : '');
      b.setAttribute('aria-label', 'Face ' + f);
      b.appendChild(makeDie(f, 'bf-die-pick'));
      const legalAtAll = canRaise && minQtyForFace(f) <= total;
      b.disabled = !legalAtAll;
      b.addEventListener('click', () => {
        selF = f;
        if (selQ < minQtyForFace(f)) selQ = minQtyForFace(f);
        renderControls();
      });
      faceRow.appendChild(b);
    }

    const bidBtn = $('bf-btn-bid');
    bidBtn.disabled = !canRaise || !isLegalRaise(curBid, selQ, selF);
    bidBtn.textContent = canRaise ? ('Bid ' + selQ + ' × ' + selF + 's') : 'No higher bid possible';

    const liarBtn = $('bf-btn-liar');
    liarBtn.disabled = !curBid;
  }

  /* ── Game flow ── */
  function startRound(starterSeat) {
    phase = 'bidding';
    curBid = null;
    revealInfo = null;
    rollDice(round);
    turnSeat = starterSeat;
    clearBubbles();
    const m = minimalRaise(null);
    selQ = m.q; selF = m.f;
    renderSeats();
    renderBid();
    saveToday();
    $('bf-reveal-panel').classList.add('hidden');
    animateRoll(() => {
      renderSeats();
      renderControls();
      if (turnSeat !== 0) scheduleAITurn();
    });
  }

  function scheduleAITurn() {
    setAISeatActive(turnSeat);
    aiTimer = setTimeout(() => {
      const dec = aiDecide(turnSeat);
      turnCount++;
      if (dec.action === 'liar') {
        doChallenge(turnSeat);
      } else {
        curBid = { q: dec.bid.q, f: dec.bid.f, seat: turnSeat };
        setBubble(turnSeat, 'bids ' + bidText(curBid), 'bid');
        renderBid();
        advanceTurn();
      }
    }, 950 + Math.random() * 500);
  }

  function advanceTurn() {
    turnSeat = nextAliveSeat(turnSeat);
    saveToday();
    renderControls();
    if (turnSeat !== 0) {
      setTimeout(scheduleAITurn, 350);
    } else {
      setAISeatActive(-1);
    }
  }

  function onPlayerBid() {
    if (actionLocked || turnSeat !== 0 || phase !== 'bidding') return;
    if (!isLegalRaise(curBid, selQ, selF)) return;
    turnCount++;
    curBid = { q: selQ, f: selF, seat: 0 };
    setBubble(0, 'You bid ' + bidText(curBid), 'bid');
    renderBid();
    advanceTurn();
  }

  function onPlayerLiar() {
    if (actionLocked || turnSeat !== 0 || phase !== 'bidding' || !curBid) return;
    turnCount++;
    doChallenge(0);
  }

  function doChallenge(challengerSeat) {
    actionLocked = true;
    setAISeatActive(-1);
    let count = 0;
    for (let s = 0; s < SEATS; s++) {
      if (alive[s]) dice[s].forEach(d => { if (d === curBid.f) count++; });
    }
    const bidTrue = count >= curBid.q;
    const loserSeat = bidTrue ? challengerSeat : curBid.seat;
    revealInfo = { bid: curBid, challengerSeat, count, bidTrue, loserSeat };
    phase = 'reveal';
    setBubble(challengerSeat, 'LIAR!', 'liar');
    saveToday();
    setTimeout(showReveal, 900);
  }

  function seatName(s) { return s === 0 ? 'You' : todayAIs[s - 1].name; }

  function showReveal() {
    renderSeats(); // reveals all dice, highlights the bid face
    renderControls();
    const r = revealInfo;
    const panel = $('bf-reveal-panel');
    panel.classList.remove('hidden');
    const chalName = seatName(r.challengerSeat);
    const bidName = seatName(r.bid.seat);
    $('bf-reveal-title').textContent = chalName + (r.challengerSeat === 0 ? ' call' : ' calls') + ' Liar on ' +
      (r.bid.seat === 0 ? 'your' : bidName + "'s") + ' bid of ' + bidText(r.bid);
    $('bf-reveal-count').textContent = 'The cups come up: ' + r.count + ' × ' + r.bid.f + 's on the table.';
    const verdict = $('bf-reveal-verdict');
    if (r.bidTrue) {
      verdict.textContent = 'The bid was good! ' + chalName + (r.challengerSeat === 0 ? ' are' : ' is') + ' out!';
    } else {
      verdict.textContent = bidName + (r.bid.seat === 0 ? ' were' : ' was') + ' bluffing! ' +
        bidName + (r.bid.seat === 0 ? ' are' : ' is') + ' out!';
    }
    verdict.className = 'bf-reveal-verdict ' + (r.loserSeat === 0 ? 'bf-verdict-bad' : 'bf-verdict-good');
    $('bf-continue-btn').focus();
    actionLocked = false;
  }

  function onContinue() {
    if (phase !== 'reveal' || !revealInfo) return;
    const loser = revealInfo.loserSeat;
    alive[loser] = false;
    eliminatedOrder.push(loser);
    recordChallengeStats(revealInfo);
    $('bf-reveal-panel').classList.add('hidden');

    if (loser === 0) { endDay(false); return; }
    if (aliveAICount() === 0) { endDay(true); return; }
    round++;
    const starter = nextAliveSeat(loser);
    startRound(starter);
  }

  // Head-to-head is only tracked for challenges the player was part of
  function recordChallengeStats(r) {
    if (r.loserSeat !== 0 && r.challengerSeat !== 0 && r.bid.seat !== 0) return;
    const stats = loadStats();
    if (r.loserSeat === 0) {
      const winnerSeat = r.loserSeat === r.challengerSeat ? r.bid.seat : r.challengerSeat;
      if (winnerSeat > 0) {
        const id = todayAIs[winnerSeat - 1].id;
        stats.hh[id] = stats.hh[id] || { beat: 0, lostTo: 0 };
        stats.hh[id].lostTo++;
      }
    } else if (r.challengerSeat === 0 || r.bid.seat === 0) {
      const id = todayAIs[r.loserSeat - 1].id;
      stats.hh[id] = stats.hh[id] || { beat: 0, lostTo: 0 };
      stats.hh[id].beat++;
    }
    DJUtils.saveJSON(statsKey, stats);
  }

  function endDay(win) {
    phase = 'done';
    const beaten = eliminatedOrder.filter(s => s > 0).length;
    outcome = { win, aisBeaten: win ? 3 : beaten };
    const stats = loadStats();
    stats.played++;
    if (win) { stats.wins++; stats.curStreak++; stats.bestStreak = Math.max(stats.bestStreak, stats.curStreak); }
    else stats.curStreak = 0;
    stats.place[outcome.aisBeaten]++;
    DJUtils.saveJSON(statsKey, stats);
    saveToday();
    renderSeats();
    renderControls();
    showResults();
  }

  /* ── Results ── */
  function placeLabel(aisBeaten, win) {
    if (win) return 'Last one standing!';
    return ['Out in 4th place', 'Out in 3rd place', 'Out in 2nd place'][aisBeaten] || 'Out';
  }

  function showResults() {
    const panel = $('bf-results');
    panel.classList.remove('hidden');
    $('bf-controls').classList.add('hidden');
    $('bf-turn-note').classList.add('hidden');
    $('bf-result-title').textContent = outcome.win ? 'You Win! 🏆' : 'Knocked Out!';
    $('bf-result-sub').textContent = outcome.win
      ? 'You outlasted all 3 opponents. See you tomorrow!'
      : placeLabel(outcome.aisBeaten, false) + ' - ' + (3 - outcome.aisBeaten) +
        (3 - outcome.aisBeaten === 1 ? ' opponent was' : ' opponents were') + ' still in. Try again tomorrow!';
    const row = $('bf-result-dots');
    row.textContent = '';
    for (let i = 0; i < outcome.aisBeaten; i++) {
      const d = document.createElement('span'); d.textContent = '🟢'; row.appendChild(d);
    }
    if (!outcome.win) { const d = document.createElement('span'); d.textContent = '🔴'; row.appendChild(d); }
    if (outcome.win) { const d = document.createElement('span'); d.textContent = '🏆'; row.appendChild(d); }
    startCountdown('bf-countdown');
  }

  function shareText() {
    let dots = '';
    for (let i = 0; i < outcome.aisBeaten; i++) dots += '🟢';
    if (!outcome.win) dots += '🔴';
    const names = todayAIs.map(a => a.name).join(', ');
    return 'Bluffdle ' + chicagoDate() + '\nvs ' + names + '\n🎲 ' + dots +
      (outcome.win ? ' 🏆 ' : ' ') + placeLabel(outcome.aisBeaten, outcome.win) +
      '\ndailyjamm.com/bluffdle/';
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
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '-';
    DJUtils.setStatRows('bf-stats-content', [
      { label: 'Games Played', value: stats.played },
      { label: 'Tables Won', value: stats.wins, color: '#4ade80' },
      { label: 'Win Rate', value: winRate },
      { label: 'Current Streak', value: stats.curStreak, color: '#fbbf24' },
      { label: 'Best Streak', value: stats.bestStreak, color: '#fbbf24' },
    ]);

    // Placement distribution
    const sec = $('bf-place-section');
    sec.textContent = '';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.07em;margin:14px 0 8px;padding-top:14px;border-top:1px solid #1f2937';
    hdr.textContent = 'Finishes';
    sec.appendChild(hdr);
    const labels = ['Out 4th', 'Out 3rd', 'Out 2nd', 'Won the table'];
    const max = Math.max.apply(null, stats.place.concat([1]));
    const colors = ['#ef4444', '#fb923c', '#fbbf24', '#4ade80'];
    labels.forEach((lab, i) => {
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px';
      const l = document.createElement('div');
      l.style.cssText = 'width:88px;font-size:11px;font-weight:700;color:#d1d5db;flex-shrink:0;text-align:right';
      l.textContent = lab;
      const track = document.createElement('div');
      track.style.cssText = 'flex:1;background:#111827;border-radius:4px;height:20px;overflow:hidden';
      const bar = document.createElement('div');
      const pct = Math.round((stats.place[i] / max) * 100);
      bar.style.cssText = 'height:100%;border-radius:4px;display:flex;align-items:center;padding:0 7px;font-size:11px;font-weight:800;color:#0b1220;background:' + colors[i] + ';min-width:' + (stats.place[i] > 0 ? '24px' : '0') + ';width:' + pct + '%';
      if (stats.place[i] > 0) bar.textContent = String(stats.place[i]);
      track.appendChild(bar);
      rowEl.appendChild(l);
      rowEl.appendChild(track);
      sec.appendChild(rowEl);
    });

    // Head-to-head
    const hhSec = $('bf-hh-section');
    hhSec.textContent = '';
    const ids = Object.keys(stats.hh);
    if (ids.length) {
      const h2 = hdr.cloneNode(false);
      h2.textContent = 'Head-to-Head (challenges vs you)';
      hhSec.appendChild(h2);
      ids.forEach(id => {
        const def = AI_DEFS.find(a => a.id === Number(id));
        if (!def) return;
        const rec = stats.hh[id];
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1f2937;font-size:13px';
        const n = document.createElement('span');
        n.style.cssText = 'color:#d1d5db;font-weight:700';
        n.textContent = def.name;
        const v = document.createElement('span');
        v.style.cssText = 'color:#9ca3af';
        v.textContent = rec.beat + 'W - ' + rec.lostTo + 'L';
        rowEl.appendChild(n);
        rowEl.appendChild(v);
        hhSec.appendChild(rowEl);
      });
    }
    $('bf-stats-modal').classList.remove('hidden');
  }

  function closeStats() { $('bf-stats-modal').classList.add('hidden'); }

  function shareStats() {
    const stats = loadStats();
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '-';
    const text = 'Bluffdle Stats\n🎲 Played: ' + stats.played + '\n🏆 Tables won: ' + stats.wins +
      ' (' + winRate + ')\n🔥 Streak: ' + stats.curStreak + ' (best ' + stats.bestStreak + ')\ndailyjamm.com/bluffdle/';
    DJUtils.clipboardShare(text, $('bf-stats-share-btn'), 'Share Stats');
  }

  /* ── How to Play ── */
  function showModal() {
    const list = $('bf-howto-ai-list');
    if (list && todayAIs.length) {
      list.textContent = '';
      todayAIs.forEach(a => {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;background:#111827;border:1px solid #1f2937;border-radius:8px;padding:8px 10px';
        const dot = document.createElement('span');
        dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#a855f7;flex-shrink:0';
        const n = document.createElement('span');
        n.style.cssText = 'font-size:13px;font-weight:700;color:#fff';
        n.textContent = a.name;
        rowEl.appendChild(dot);
        rowEl.appendChild(n);
        list.appendChild(rowEl);
      });
    }
    $('bf-modal').classList.remove('hidden');
  }
  function closeModal() {
    $('bf-modal').classList.add('hidden');
    localStorage.setItem(howtoKey, '1');
  }

  /* ── Boot / restore ── */
  function boot() {
    const dateStr = chicagoDate();
    todayAIs = getDailyAIIndexes(dateStr).map(i => AI_DEFS[i]);

    let today = null;
    try { today = JSON.parse(localStorage.getItem(todayKey)); } catch (e) { today = null; }

    if (today && today.date === dateStr && Array.isArray(today.ais)) {
      // Restore
      todayAIs = today.ais.map(id => AI_DEFS.find(a => a.id === id)).filter(Boolean);
      alive = today.alive;
      dice = today.dice;
      round = today.round;
      turnSeat = today.turnSeat;
      turnCount = today.turnCount || 0;
      curBid = today.curBid;
      phase = today.phase;
      revealInfo = today.revealInfo;
      eliminatedOrder = today.eliminatedOrder || [];
      outcome = today.outcome;

      renderSeats();
      renderBid();
      if (phase === 'done' && outcome) {
        showResults();
      } else if (phase === 'reveal' && revealInfo) {
        curBid = revealInfo.bid;
        renderBid();
        showReveal();
      } else {
        const m = minimalRaise(curBid);
        selQ = m.q; selF = m.f;
        renderControls();
        if (turnSeat !== 0) scheduleAITurn();
      }
    } else {
      // Fresh day
      alive = [true, true, true, true];
      eliminatedOrder = [];
      outcome = null;
      round = 1;
      turnCount = 0;
      startRound(0);
    }

    if (!localStorage.getItem(howtoKey)) showModal();

    // Wire controls
    $('bf-btn-bid').addEventListener('click', onPlayerBid);
    $('bf-btn-liar').addEventListener('click', onPlayerLiar);
    $('bf-continue-btn').addEventListener('click', onContinue);
    $('bf-qty-minus').addEventListener('click', () => { selQ--; renderControls(); });
    $('bf-qty-plus').addEventListener('click', () => { selQ++; renderControls(); });
    $('bf-share-btn').addEventListener('click', () => {
      DJUtils.clipboardShare(shareText(), $('bf-share-btn'), 'Share Results');
    });
    $('bf-stats-btn').addEventListener('click', showStats);
    $('bf-help-btn').addEventListener('click', showModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeStats(); $('bf-modal').classList.add('hidden'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.BFGame = { showStats, closeStats, shareStats, showModal, closeModal };
})();
