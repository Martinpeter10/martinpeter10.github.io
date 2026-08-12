// Net Zero - daily card + dice game on DailyJamm
// Standard playing cards: black suits count plus, red suits count minus.
// Player + 3 daily AI opponents, 3 draw rounds, dice, closest to zero wins.
(function () {
  'use strict';

  const SEATS = 4;      // seat 0 = player, 1-3 = AIs
  const HAND_MAX = 5;
  const ROUNDS = 3;

  /* ── AI cast (shared names with Holdle / Bluffdle) ── */
  // standAt: stand when |total| is at or under this
  // swapGain: minimum |total| improvement to bother swapping
  // drawP: base chance of drawing when unhappy, chaos: chance of a random action
  const AI_DEFS = [
    { id: 0, name: 'David',   standAt: 1, swapGain: 1, drawP: 0.50, chaos: 0.22 },
    { id: 1, name: 'Peter',   standAt: 2, swapGain: 3, drawP: 0.05, chaos: 0.00 },
    { id: 2, name: 'Jon',     standAt: 1, swapGain: 2, drawP: 0.22, chaos: 0.00 },
    { id: 3, name: 'Caleb',   standAt: 1, swapGain: 2, drawP: 0.45, chaos: 0.10 },
    { id: 4, name: 'Mandy',   standAt: 1, swapGain: 2, drawP: 0.30, chaos: 0.08 },
    { id: 5, name: 'Madelyn', standAt: 0, swapGain: 1, drawP: 0.50, chaos: 0.50 },
    { id: 6, name: 'Josh',    standAt: 1, swapGain: 2, drawP: 0.18, chaos: 0.05 },
  ];

  /* ── Utilities ── */
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

  const SUIT_CHAR = { s: '♠', c: '♣', h: '♥', d: '♦' };
  const RED = { h: true, d: true };

  function cardValue(c) { return RED[c.s] ? -c.r : c.r; }
  function rankLabel(r) { return r === 1 ? 'A' : String(r); }
  function fmtTotal(t) { return (t > 0 ? '+' : '') + t; }
  function handTotal(hand) { return hand.reduce((a, c) => a + cardValue(c), 0); }

  /* ── State ── */
  let todayAIs = [];
  let deck = [];        // draw from the end (deck.pop())
  let upCard = null;    // the single face-up card on the table
  // Cards revealed so far during the opening deal. Infinity means "table is
  // fully dealt" and is the normal state for every other code path.
  let revealCount = Infinity;
  let pendingDeal = false;   // deal is waiting for the how-to modal to close
  const DEAL_GAP = 190;      // ms between cards leaving the deck
  let discard = [];
  let reshuffles = 0;
  let hands = [[], [], [], []];
  let round = 1;        // 1..3
  let turnSeat = 0;
  let turnCount = 0;    // total actions today (rng stream + persistence)
  let phase = 'act';    // 'act' | 'dice' | 'done'
  let shiftCount = 0;
  let outcome = null;   // { place, total, win, pure, winnerSeats }
  let selCard = -1;
  let actionLocked = false;

  const todayKey = 'sb_today';
  const statsKey = 'sb_stats_v2';
  const howtoKey = 'sb_seen_howto';

  /* ── Daily setup ── */
  function getDailyAIIndexes(dateStr) {
    const rng = mulberry32(dateToSeed(dateStr) + 17);
    const idx = AI_DEFS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, 3);
  }

  function freshDeck() {
    const cards = [];
    ['s', 'c', 'h', 'd'].forEach(s => {
      for (let r = 1; r <= 10; r++) cards.push({ r, s });
    });
    return cards;
  }

  function shuffleWith(cards, rng) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function drawCard() {
    if (!deck.length) {
      deck = shuffleWith(discard, mulberry32(dateToSeed(chicagoDate()) + 977 + reshuffles * 131));
      discard = [];
      reshuffles++;
    }
    return deck.pop();
  }

  /* ── Persistence ── */
  function saveToday() {
    DJUtils.saveJSON(todayKey, {
      date: chicagoDate(),
      ais: todayAIs.map(a => a.id),
      deck, discard, upCard, reshuffles, hands, round, turnSeat, turnCount,
      phase, shiftCount, outcome,
    });
  }

  function loadStats() {
    return DJUtils.loadJSON(statsKey, {
      played: 0, wins: 0, pure: 0, curStreak: 0, bestStreak: 0,
      bestAbs: null, place: [0, 0, 0, 0],
    });
  }

  /* ── Opening deal ── */
  // Cards go out one per seat, round the table, twice - so seat s receives its
  // k-th card on step k * SEATS + s.
  function visibleCount(seat) {
    if (revealCount === Infinity) return hands[seat].length;
    return Math.max(0, Math.min(hands[seat].length, Math.ceil((revealCount - seat) / SEATS)));
  }

  function upCardVisible() {
    return revealCount === Infinity || revealCount >= SEATS * 2 + 1;
  }

  function renderTable() {
    renderSeats(false, false);
    renderPlayerHand(false);
    renderMid();
  }

  function dealTarget(i) {
    if (i >= SEATS * 2) return $('sb-upcard');
    const seat = i % SEATS;
    return seat === 0 ? $('sb-player-cards')
      : $('sb-ai-seat-' + (seat - 1)).querySelector('.sb-ai-cards');
  }

  function dealOut() {
    pendingDeal = false;
    const total = SEATS * 2 + 1;          // 8 hand cards, then the face-up card
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealCount = Infinity;
      actionLocked = false;
      renderTable();
      renderControls();
      return;
    }
    revealCount = 0;
    actionLocked = true;
    renderTable();
    renderControls();
    setMessage('Dealing...');
    for (let i = 0; i < total; i++) {
      (function (idx) {
        setTimeout(function () {
          flyFrom($('sb-deck'), dealTarget(idx), idx % SEATS !== 0 || idx >= SEATS * 2, function () {
            if (idx + 1 > revealCount) revealCount = idx + 1;
            renderTable();
            if (idx === total - 1) {
              revealCount = Infinity;
              actionLocked = false;
              setMessage('');
              renderTable();
              renderControls();
            }
          });
        }, idx * DEAL_GAP);
      })(i);
    }
  }

  /* ── Card rendering ── */
  function makeCard(c, small) {
    const el = document.createElement('div');
    el.className = 'sb-card' + (small ? ' sb-card-sm' : '') + (RED[c.s] ? ' sb-card-red' : '');
    const corner = document.createElement('span');
    corner.className = 'sb-corner';
    corner.textContent = rankLabel(c.r) + SUIT_CHAR[c.s];
    const center = document.createElement('span');
    center.className = 'sb-center';
    center.textContent = fmtTotal(cardValue(c));
    el.appendChild(corner);
    el.appendChild(center);
    return el;
  }

  function makeCardBack(small) {
    const el = document.createElement('div');
    el.className = 'sb-card sb-card-back' + (small ? ' sb-card-sm' : '');
    return el;
  }

  // Animate a card back flying from the draw pile to a card row
  function flyFromDeck(targetEl, small, cb) {
    flyFrom($('sb-deck'), targetEl, small, cb);
  }

  function flyFrom(sourceEl, targetEl, small, cb) {
    const table = document.querySelector('.sb-table');
    const deckEl = sourceEl;
    if (!table || !deckEl || !targetEl ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cb(); return; }
    let ghost = null;
    try {
      const tr = table.getBoundingClientRect();
      const dr = deckEl.getBoundingClientRect();
      const gr = targetEl.getBoundingClientRect();
      ghost = makeCardBack(small);
      ghost.classList.add('sb-fly');
      ghost.style.left = (dr.left - tr.left + dr.width / 2) + 'px';
      ghost.style.top = (dr.top - tr.top + dr.height / 2) + 'px';
      table.appendChild(ghost);
      const dx = (gr.left + gr.width / 2) - (dr.left + dr.width / 2);
      const dy = (gr.top + gr.height / 2) - (dr.top + dr.height / 2);
      requestAnimationFrame(() => {
        ghost.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) rotate(360deg)';
      });
    } catch (e) {
      if (ghost) ghost.remove();
      cb();
      return;
    }
    setTimeout(() => { ghost.remove(); cb(); }, 400);
  }

  /* ── Dice rendering ── */
  const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  function setDieFace(die, face) {
    die.textContent = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('span');
      cell.className = 'sb-cell' + (DIE_PIPS[face].indexOf(i) >= 0 ? ' sb-pip' : '');
      die.appendChild(cell);
    }
  }

  /* ── Rendering ── */
  function renderSeats(reveal, dealAnim) {
    for (let s = 1; s < SEATS; s++) {
      const seat = $('sb-ai-seat-' + (s - 1));
      seat.querySelector('.sb-ai-name').textContent = todayAIs[s - 1].name;
      const row = seat.querySelector('.sb-ai-cards');
      row.textContent = '';
      hands[s].slice(0, visibleCount(s)).forEach((c, i) => {
        const el = reveal ? makeCard(c, true) : makeCardBack(true);
        if (dealAnim) { el.classList.add('sb-dealt'); el.style.animationDelay = (i * 90) + 'ms'; }
        row.appendChild(el);
      });
      const totEl = seat.querySelector('.sb-ai-total');
      if (reveal) {
        const t = handTotal(hands[s]);
        totEl.textContent = fmtTotal(t);
        totEl.className = 'sb-ai-total ' + (Math.abs(t) <= 1 ? 'sb-total-good' : 'sb-total-plain');
      } else {
        totEl.textContent = '';
      }
    }
  }

  function renderPlayerHand(dealAnim) {
    const row = $('sb-player-cards');
    row.textContent = '';
    hands[0].slice(0, visibleCount(0)).forEach((c, i) => {
      const el = makeCard(c, false);
      if (i === selCard) el.classList.add('sb-cardsel');
      if (dealAnim) { el.classList.add('sb-dealt'); el.style.animationDelay = (i * 110) + 'ms'; }
      el.addEventListener('click', () => onCardTap(i));
      row.appendChild(el);
    });
    const t = handTotal(hands[0].slice(0, visibleCount(0)));
    const totEl = $('sb-player-total');
    totEl.textContent = 'Your total: ' + fmtTotal(t);
    totEl.className = 'sb-player-total ' + (t === 0 ? 'sb-total-zero' : (Math.abs(t) <= 2 ? 'sb-total-good' : 'sb-total-plain'));
  }

  function renderMid() {
    $('sb-round-label').textContent = phase === 'done' ? 'Showdown' : 'Round ' + round + ' of ' + ROUNDS;
    $('sb-deck-count').textContent = deck.length + ' cards in deck';
    renderUpCard();
  }

  function renderUpCard() {
    const slot = $('sb-upcard');
    if (!slot) return;
    slot.textContent = '';
    if (upCard && upCardVisible()) {
      slot.appendChild(makeCard(upCard, true));
      slot.setAttribute('aria-label',
        'Face-up card ' + rankLabel(upCard.r) + SUIT_CHAR[upCard.s] +
        ', worth ' + fmtTotal(cardValue(upCard)) + ' - swap it with a card from your hand');
    } else {
      slot.setAttribute('aria-label', 'No face-up card');
    }
  }

  function setBubble(seat, text) {
    const el = seat === 0 ? $('sb-player-bubble') :
      $('sb-ai-seat-' + (seat - 1)).querySelector('.sb-ai-bubble');
    el.textContent = text;
  }

  function clearBubbles() {
    for (let s = 0; s < SEATS; s++) setBubble(s, '');
  }

  function setAISeatActive(seat) {
    for (let s = 1; s < SEATS; s++) {
      $('sb-ai-seat-' + (s - 1)).classList.toggle('sb-active', s === seat);
    }
  }

  function setMessage(text) { $('sb-msg').textContent = text || ''; }

  function renderControls() {
    const box = $('sb-controls');
    const myTurn = phase === 'act' && turnSeat === 0 && !outcome && !actionLocked;
    box.classList.toggle('hidden', !myTurn);
    $('sb-turn-note').classList.toggle('hidden', myTurn || phase !== 'act');
    if (!myTurn) return;
    $('sb-btn-draw').disabled = hands[0].length >= HAND_MAX;
    $('sb-btn-swap').disabled = !upCard;
    $('sb-btn-swap').textContent = (selCard >= 0 && upCard)
      ? 'Swap for ' + rankLabel(upCard.r) + SUIT_CHAR[upCard.s]
      : 'Swap';
    $('sb-deck').classList.toggle('sb-deck-ready', hands[0].length < HAND_MAX);
    $('sb-upcard').classList.toggle('sb-upcard-ready', selCard >= 0 && !!upCard);
  }

  /* ── AI decision ── */
  function aiDecide(seat) {
    const def = todayAIs[seat - 1];
    const rng = mulberry32(dateToSeed(chicagoDate()) + round * 7919 + turnCount * 97 + 353);
    const hand = hands[seat];
    const t = handTotal(hand);

    if (rng() < def.chaos) {
      const roll = rng();
      if (roll < 0.34 && hand.length < HAND_MAX) return { action: 'draw' };
      if (roll < 0.67 && upCard) return { action: 'swap', idx: Math.floor(rng() * hand.length) };
      return { action: 'stand' };
    }

    if (Math.abs(t) <= def.standAt) return { action: 'stand' };

    // Swapping is now a known quantity: trade card i for the face-up card.
    let bi = 0, bestAfter = Infinity;
    if (upCard) {
      const up = cardValue(upCard);
      hand.forEach((c, i) => {
        const after = Math.abs(t - cardValue(c) + up);
        if (after < bestAfter) { bestAfter = after; bi = i; }
      });
    }
    const gain = upCard ? Math.abs(t) - bestAfter : -Infinity;

    if (gain >= def.swapGain) return { action: 'swap', idx: bi };
    if (hand.length < HAND_MAX && rng() < def.drawP + (Math.abs(t) >= 6 ? 0.25 : 0)) return { action: 'draw' };
    if (Math.abs(t) >= 5 && gain > 0) return { action: 'swap', idx: bi };
    return { action: 'stand' };
  }

  /* ── Actions ── */
  function applyAction(seat, dec) {
    const fromDeck = dec.action === 'draw' || dec.action === 'swap';
    if (dec.action === 'draw') {
      hands[seat].push(drawCard());
      setBubble(seat, seat === 0 ? 'You draw a card' : 'draws a card');
    } else if (dec.action === 'swap') {
      // Trade the chosen card for the face-up card; yours becomes the new face-up.
      const mine = hands[seat][dec.idx];
      hands[seat][dec.idx] = upCard;
      upCard = mine;
      setBubble(seat, seat === 0 ? 'You take the face-up card' : 'takes the face-up card');
    } else {
      setBubble(seat, seat === 0 ? 'You stand' : 'stands');
    }
    turnCount++;
    const finish = () => {
      if (seat === 0) { selCard = -1; renderPlayerHand(fromDeck); }
      else renderSeats(false, fromDeck);
      renderMid();
    };
    if (fromDeck) {
      const target = seat === 0 ? $('sb-player-cards')
        : $('sb-ai-seat-' + (seat - 1)).querySelector('.sb-ai-cards');
      const source = dec.action === 'swap' ? $('sb-upcard') : $('sb-deck');
      flyFrom(source, target, seat !== 0, finish);
    } else {
      finish();
    }
  }

  function onCardTap(i) {
    if (phase !== 'act' || turnSeat !== 0 || actionLocked || outcome) return;
    selCard = (selCard === i) ? -1 : i;
    renderPlayerHand(false);
    renderControls();
  }

  function onPlayerAction(type) {
    if (phase !== 'act' || turnSeat !== 0 || actionLocked || outcome) return;
    if (type === 'draw' && hands[0].length >= HAND_MAX) return;
    if (type === 'swap' && !upCard) return;
    if (type === 'swap' && selCard < 0) {
      setMessage('Tap one of your cards first - then Swap trades it for the face-up card.');
      const row = $('sb-player-cards');
      row.classList.remove('sb-nudge');
      void row.offsetWidth;
      row.classList.add('sb-nudge');
      return;
    }
    setMessage('');
    actionLocked = true;
    applyAction(0, type === 'swap' ? { action: 'swap', idx: selCard } : { action: type });
    advanceSeat();
  }

  // The draw pile always draws; the face-up card always swaps.
  function onDeckTap() {
    if (phase !== 'act' || turnSeat !== 0 || actionLocked || outcome) return;
    if (hands[0].length < HAND_MAX) onPlayerAction('draw');
  }

  function onUpCardTap() {
    if (phase !== 'act' || turnSeat !== 0 || actionLocked || outcome) return;
    onPlayerAction('swap');
  }

  function advanceSeat() {
    turnSeat++;
    saveToday();
    renderControls();
    if (turnSeat < SEATS) {
      scheduleAITurn();
    } else {
      setAISeatActive(-1);
      setTimeout(endOfRound, 700);
    }
  }

  function scheduleAITurn() {
    setAISeatActive(turnSeat);
    setTimeout(() => {
      applyAction(turnSeat, aiDecide(turnSeat));
      advanceSeat();
    }, 900 + Math.random() * 450);
  }

  /* ── Dice / round transitions ── */
  function endOfRound() {
    if (round >= ROUNDS) { showdown(); return; }
    phase = 'dice';
    saveToday();
    resolveDice();
  }

  function diceForRound(r) {
    const rng = mulberry32(dateToSeed(chicagoDate()) + r * 499);
    return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  }

  function resolveDice() {
    actionLocked = true;
    renderControls();
    const dice = diceForRound(round);
    const d0 = $('sb-die-0'), d1 = $('sb-die-1');
    const area = $('sb-dice');
    area.classList.remove('hidden');
    setMessage('Rolling the dice...');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ticks = 0;
    d0.classList.add('sb-die-roll');
    d1.classList.add('sb-die-roll');
    const iv = reduced ? null : setInterval(() => {
      ticks++;
      setDieFace(d0, 1 + Math.floor(Math.random() * 6));
      setDieFace(d1, 1 + Math.floor(Math.random() * 6));
      if (ticks >= 9) { clearInterval(iv); settle(); }
    }, 90);
    if (reduced) settle();
    function settle() {
      d0.classList.remove('sb-die-roll');
      d1.classList.remove('sb-die-roll');
      setDieFace(d0, dice[0]);
      setDieFace(d1, dice[1]);
      setTimeout(() => {
        if (dice[0] === dice[1]) {
          doShift();
        } else {
          setMessage('No doubles - hands are safe.');
          setTimeout(nextRound, 1100);
        }
      }, 550);
    }
  }

  function doShift() {
    shiftCount++;
    const banner = $('sb-shift-banner');
    banner.classList.remove('hidden');
    setMessage('Doubles! Every hand is thrown out and redrawn.');
    setTimeout(() => {
      for (let s = 0; s < SEATS; s++) {
        const n = hands[s].length;
        hands[s].forEach(c => discard.push(c));
        hands[s] = [];
        for (let i = 0; i < n; i++) hands[s].push(drawCard());
      }
      if (upCard) discard.push(upCard);
      upCard = drawCard();
      selCard = -1;
      renderSeats(false, true);
      renderPlayerHand(true);
      renderMid();
      setTimeout(() => {
        banner.classList.add('hidden');
        nextRound();
      }, 1200);
    }, 1200);
  }

  function nextRound() {
    round++;
    phase = 'act';
    turnSeat = 0;
    actionLocked = false;
    clearBubbles();
    setMessage('');
    $('sb-dice').classList.add('hidden');
    renderMid();
    saveToday();
    renderControls();
  }

  /* ── Showdown ── */
  function seatKey(s) {
    const t = handTotal(hands[s]);
    return { abs: Math.abs(t), sign: t >= 0 ? 0 : 1, n: hands[s].length, t };
  }

  // Strictly better hand: closer to zero; ties go positive over negative, then more cards
  function betterKey(a, b) {
    if (a.abs !== b.abs) return a.abs < b.abs;
    if (a.sign !== b.sign) return a.sign < b.sign;
    if (a.n !== b.n) return a.n > b.n;
    return false;
  }

  function showdown() {
    phase = 'done';
    actionLocked = true;
    const keys = [];
    for (let s = 0; s < SEATS; s++) keys.push(seatKey(s));
    const winnerSeats = [];
    for (let s = 0; s < SEATS; s++) {
      let beaten = false;
      for (let o = 0; o < SEATS; o++) if (o !== s && betterKey(keys[o], keys[s])) beaten = true;
      if (!beaten) winnerSeats.push(s);
    }
    let place = 1;
    for (let o = 1; o < SEATS; o++) if (betterKey(keys[o], keys[0])) place++;
    const t = keys[0].t;
    const win = winnerSeats.indexOf(0) >= 0;
    outcome = { place, total: t, win, pure: t === 0, winnerSeats };

    const stats = loadStats();
    stats.played++;
    if (win) { stats.wins++; stats.curStreak++; stats.bestStreak = Math.max(stats.bestStreak, stats.curStreak); }
    else stats.curStreak = 0;
    if (t === 0) stats.pure++;
    if (stats.bestAbs === null || Math.abs(t) < stats.bestAbs) stats.bestAbs = Math.abs(t);
    stats.place[place - 1]++;
    DJUtils.saveJSON(statsKey, stats);
    saveToday();

    clearBubbles();
    renderSeats(true, true);
    renderPlayerHand(false);
    renderMid();
    renderControls();
    winnerSeats.forEach(s => {
      const el = s === 0 ? $('sb-player-area') : $('sb-ai-seat-' + (s - 1));
      el.classList.add('sb-winner');
    });
    setMessage(showdownLine(winnerSeats, keys));
    setTimeout(showResults, 1400);
  }

  function seatName(s) { return s === 0 ? 'You' : todayAIs[s - 1].name; }

  function showdownLine(winnerSeats, keys) {
    const names = winnerSeats.map(seatName).join(' & ');
    const wt = keys[winnerSeats[0]].t;
    return names + (winnerSeats.length === 1 && winnerSeats[0] !== 0 ? ' takes' : ' take') +
      ' the hand at ' + fmtTotal(wt) + (wt === 0 ? ' - Pure Net Zero!' : '');
  }

  function placeLabel(p) { return ['1st', '2nd', '3rd', '4th'][p - 1] + ' place'; }

  function showResults() {
    const panel = $('sb-results');
    panel.classList.remove('hidden');
    $('sb-result-title').textContent = outcome.win
      ? (outcome.pure ? 'Pure Net Zero! 🌟' : 'You Win! 🏆')
      : placeLabel(outcome.place);
    $('sb-result-sub').textContent = outcome.win
      ? 'Your hand of ' + fmtTotal(outcome.total) + ' was the closest to zero at the table.' +
        (outcome.winnerSeats.length > 1 ? ' (Shared with ' + outcome.winnerSeats.filter(s => s > 0).map(seatName).join(' & ') + ')' : '')
      : 'You finished at ' + fmtTotal(outcome.total) + ' - ' + seatName(outcome.winnerSeats[0]) +
        ' took the hand. New deal tomorrow!';
    startCountdown('sb-countdown');
  }

  function shareText() {
    const names = todayAIs.map(a => a.name).join(', ');
    const line = outcome.win
      ? '🏆 Won with ' + fmtTotal(outcome.total) + (outcome.pure ? ' - Pure Net Zero! 🌟' : '')
      : '🃏 Final hand: ' + fmtTotal(outcome.total) + ' - ' + placeLabel(outcome.place);
    return 'Net Zero ' + chicagoDate() + '\nvs ' + names + '\n' + line + '\ndailyjamm.com/netzero/';
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
    DJUtils.setStatRows('sb-stats-content', [
      { label: 'Games Played', value: stats.played },
      { label: 'Hands Won', value: stats.wins, color: '#4ade80' },
      { label: 'Win Rate', value: winRate },
      { label: 'Pure Net Zeros (exactly 0)', value: stats.pure, color: '#fbbf24' },
      { label: 'Closest Finish', value: stats.bestAbs === null ? '-' : stats.bestAbs },
      { label: 'Current Streak', value: stats.curStreak, color: '#fbbf24' },
      { label: 'Best Streak', value: stats.bestStreak, color: '#fbbf24' },
      { label: '1st / 2nd / 3rd / 4th', value: stats.place.join(' / ') },
    ]);
    $('sb-stats-modal').classList.remove('hidden');
  }

  function closeStats() { $('sb-stats-modal').classList.add('hidden'); }

  function shareStats() {
    const stats = loadStats();
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) + '%' : '-';
    const text = 'Net Zero Stats\n🃏 Played: ' + stats.played + '\n🏆 Won: ' + stats.wins + ' (' + winRate + ')' +
      '\n🌟 Pure Net Zeros: ' + stats.pure + '\n🔥 Streak: ' + stats.curStreak + ' (best ' + stats.bestStreak + ')' +
      '\ndailyjamm.com/netzero/';
    DJUtils.clipboardShare(text, $('sb-stats-share-btn'), 'Share Stats');
  }

  /* ── How to Play ── */
  function showModal() {
    const list = $('sb-howto-ai-list');
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
    $('sb-modal').classList.remove('hidden');
  }
  function closeModal() {
    $('sb-modal').classList.add('hidden');
    localStorage.setItem(howtoKey, '1');
    if (pendingDeal) dealOut();
  }

  /* ── Boot / restore ── */
  function freshGame(dateStr, defer) {
    deck = shuffleWith(freshDeck(), mulberry32(dateToSeed(dateStr) + 913));
    discard = [];
    reshuffles = 0;
    hands = [[], [], [], []];
    for (let k = 0; k < 2; k++) for (let s = 0; s < SEATS; s++) hands[s].push(drawCard());
    upCard = drawCard();          // one card face up on the table from the start
    round = 1;
    turnSeat = 0;
    turnCount = 0;
    phase = 'act';
    shiftCount = 0;
    outcome = null;
    selCard = -1;
    actionLocked = true;
    saveToday();
    if (defer) {
      // Hold the deal until the how-to modal is dismissed, so a first-time
      // player actually sees it instead of it playing behind the overlay.
      pendingDeal = true;
      revealCount = 0;
      renderTable();
      renderControls();
    } else {
      dealOut();
    }
  }

  function boot() {
    const dateStr = chicagoDate();
    const firstVisit = !localStorage.getItem(howtoKey);
    todayAIs = getDailyAIIndexes(dateStr).map(i => AI_DEFS[i]);

    let today = null;
    try { today = JSON.parse(localStorage.getItem(todayKey)); } catch (e) { today = null; }

    if (today && today.date === dateStr && Array.isArray(today.hands)) {
      todayAIs = today.ais.map(id => AI_DEFS.find(a => a.id === id)).filter(Boolean);
      deck = today.deck;
      discard = today.discard || [];
      upCard = today.upCard || null;
      // A save from before the face-up card existed would leave swapping dead
      // for the rest of the day - deal one so the table is always complete.
      if (!upCard && today.phase !== 'done') upCard = drawCard();
      reshuffles = today.reshuffles || 0;
      hands = today.hands;
      round = today.round;
      turnSeat = today.turnSeat;
      turnCount = today.turnCount || 0;
      phase = today.phase;
      shiftCount = today.shiftCount || 0;
      outcome = today.outcome;
      selCard = -1;

      renderMid();
      if (phase === 'done' && outcome) {
        renderSeats(true, false);
        renderPlayerHand(false);
        renderControls();
        outcome.winnerSeats.forEach(s => {
          const el = s === 0 ? $('sb-player-area') : $('sb-ai-seat-' + (s - 1));
          el.classList.add('sb-winner');
        });
        showResults();
      } else if (phase === 'dice') {
        renderSeats(false, false);
        renderPlayerHand(false);
        resolveDice();
      } else {
        renderSeats(false, false);
        renderPlayerHand(false);
        renderControls();
        if (turnSeat > 0 && turnSeat < SEATS) scheduleAITurn();
        else if (turnSeat >= SEATS) setTimeout(endOfRound, 500);
      }
    } else {
      freshGame(dateStr, firstVisit);
    }

    if (firstVisit) showModal();

    $('sb-btn-stand').addEventListener('click', () => onPlayerAction('stand'));
    $('sb-btn-draw').addEventListener('click', () => onPlayerAction('draw'));
    $('sb-btn-swap').addEventListener('click', () => onPlayerAction('swap'));
    $('sb-deck').addEventListener('click', onDeckTap);
    $('sb-upcard').addEventListener('click', onUpCardTap);
    $('sb-share-btn').addEventListener('click', () => {
      DJUtils.clipboardShare(shareText(), $('sb-share-btn'), 'Share Results');
    });
    $('sb-stats-btn').addEventListener('click', showStats);
    $('sb-help-btn').addEventListener('click', showModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeStats(); closeModal(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SBGame = { showStats, closeStats, shareStats, showModal, closeModal };
})();
