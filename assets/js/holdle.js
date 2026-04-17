/* ── Holdle - DailyJamm ───────────────────────────────────────── */
const HDGame = (function () {
  'use strict';

  /* ── Constants ── */
  const MS_PER_HOUR   = 3600000;
  const MS_PER_MIN    = 60000;
  const MS_PER_SEC    = 1000;

  const HANDS_PER_DAY  = 3;
  const STARTING_CHIPS = 1000;
  const DEAL_DELAY_MS  = 190;   // ms between each card dealt
  const SMALL_BLIND    = 10;
  const BIG_BLIND      = 20;
  const DAILY_BONUS_MIN = 50;
  const DAILY_BONUS_MAX = 100;

  const SUITS      = ['h', 'd', 'c', 's'];
  const RANKS      = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RANK_VAL   = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  const SUIT_SYM   = { h:'\u2665', d:'\u2666', c:'\u2663', s:'\u2660' };
  const SUIT_COLOR = { h:'#ef4444', d:'#ef4444', c:'#1a1a2e', s:'#1a1a2e' };

  /* ── AI Definitions ── */
  const AI_DEFS = [
    { id:0, name:'Bluffington',   tagline:'Raises into the void with nothing.' },
    { id:1, name:'Granite Greta', tagline:'Only shows up for premiums. Be afraid.' },
    { id:2, name:'Reckless Rex',  tagline:'All gas, no brakes. Every street.' },
    { id:3, name:'Otto the Odds', tagline:'Calculates pot odds. Won\'t call without equity.' },
    { id:4, name:'River Rita',    tagline:'Lives for the flush. Drawing forever.' },
    { id:5, name:'Steady Sam',    tagline:'Reads the table, mixes it up.' },
  ];

  /* ── State ── */
  let chips        = STARTING_CHIPS;
  let handNum      = 0;
  let deck         = [];
  let playerHole   = [];
  let community    = [];
  let pot          = 0;
  let sessionResults = [];
  let dailyDone    = false;
  let todayAIs     = [];      // array of 3 AI state objects for this session
  let street       = 'preflop';
  let playerFolded = false;
  let currentStreetBet = 0;  // highest bet on current street
  let playerStreetBet  = 0;  // how much player has put in this street
  let dailyRng     = null;   // seeded rng function
  let actionLocked = false;  // prevent double-clicks during AI animation

  /* ── DOM helper ── */
  const $ = (id) => document.getElementById(id);

  /* ── Chicago date helpers ── */
  const chicagoDate     = () => DJUtils.getChicagoDate();
  const chicagoMidnight = () => DJUtils.getChicagoMidnight();

  /* ── LocalStorage ── */
  function loadStats() {
    return DJUtils.loadJSON('hd_stats_v2', { streak: 0, best: 0, played: 0 });
  }
  function saveStats(s) { DJUtils.saveJSON('hd_stats_v2', s); }

  function loadToday() {
    try {
      const d = JSON.parse(localStorage.getItem('hd_today'));
      if (d && d.date === chicagoDate()) return d;
    } catch {}
    return null;
  }
  function saveToday() {
    localStorage.setItem('hd_today', JSON.stringify({
      date:       chicagoDate(),
      chips,
      handNum,
      results:    sessionResults,
      done:       dailyDone,
      aiIndexes:  todayAIs.map(a => a.def.id),
    }));
  }

  function loadChips() {
    try {
      const c = JSON.parse(localStorage.getItem('hd_chips'));
      if (c !== null && typeof c === 'number') return c;
    } catch {}
    return STARTING_CHIPS;
  }
  function saveChips() { localStorage.setItem('hd_chips', JSON.stringify(chips)); }

  function loadAllTime() {
    try { return JSON.parse(localStorage.getItem('hd_alltime_v2')) || { biggestWin:0, biggestLoss:0, totalNet:0 }; }
    catch { return { biggestWin:0, biggestLoss:0, totalNet:0 }; }
  }
  function updateAllTime(net) {
    const a = loadAllTime();
    if (net > 0 && net > a.biggestWin)  a.biggestWin  = net;
    if (net < 0 && net < a.biggestLoss) a.biggestLoss = net;
    a.totalNet += net;
    localStorage.setItem('hd_alltime_v2', JSON.stringify(a));
  }

  /* ── Seeded RNG (mulberry32) ── */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dateToSeed(s) {
    return s.split('-').reduce((acc, n) => acc * 100 + parseInt(n, 10), 0);
  }
  function getDailyAIIndexes(dateStr) {
    const rng  = mulberry32(dateToSeed(dateStr));
    const idxs = [0,1,2,3,4,5];
    for (let i = 5; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    return idxs.slice(0, 3);
  }

  /* ── Deck ── */
  function createDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
    return d;
  }
  function shuffleDeck(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function drawCard() { return deck.pop(); }

  /* ── Hand Evaluator ── */
  function rankVal(r) { return RANK_VAL[r]; }

  /* Score a 5-card hand. Returns { score: integer, label: string } */
  function evalFive(cards) {
    const rv   = cards.map(c => rankVal(c.rank)).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush    = suits.every(s => s === suits[0]);
    const uniqueRanks = [...new Set(rv)].sort((a, b) => b - a);

    // Count occurrences
    const cnt = {};
    rv.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
    const counts = Object.values(cnt).sort((a, b) => b - a);
    const byCount = {};
    Object.entries(cnt).forEach(([r, c]) => {
      if (!byCount[c]) byCount[c] = [];
      byCount[c].push(parseInt(r));
      byCount[c].sort((a, b) => b - a);
    });

    // Straight detection (including A-low wheel: A-2-3-4-5)
    function isStraight(ranks) {
      const u = [...new Set(ranks)].sort((a, b) => b - a);
      if (u.length < 5) return false;
      if (u[0] - u[4] === 4) return u[0];
      // Wheel: A=14, then 5-4-3-2 => treat A as 1
      if (u[0] === 14 && u[1] === 5 && u[2] === 4 && u[3] === 3 && u[4] === 2) return 5;
      return false;
    }

    const strHigh = isStraight(rv);

    function pack(arr, n) {
      let s = 0;
      for (let i = 0; i < n; i++) s += (arr[i] || 0) * Math.pow(100, n - 1 - i);
      return s;
    }

    function labelRank(n) {
      const m = { 14:'Ace',13:'King',12:'Queen',11:'Jack',10:'Ten',9:'Nine',8:'Eight',7:'Seven',6:'Six',5:'Five',4:'Four',3:'Three',2:'Two' };
      return m[n] || String(n);
    }
    function labelRankP(n) { // plural
      const m = { 14:'Aces',13:'Kings',12:'Queens',11:'Jacks',10:'Tens',9:'Nines',8:'Eights',7:'Sevens',6:'Sixes',5:'Fives',4:'Fours',3:'Threes',2:'Twos' };
      return m[n] || String(n) + 's';
    }

    // Straight flush
    if (isFlush && strHigh) {
      if (strHigh === 14) return { score: 8e10 + 14, label: 'Royal Flush' };
      return { score: 8e10 + strHigh, label: 'Straight Flush, ' + labelRank(strHigh) + ' high' };
    }
    // Quads
    if (counts[0] === 4) {
      const quad = byCount[4][0];
      const kick = byCount[1] ? byCount[1][0] : 0;
      return { score: 7e10 + quad * 100 + kick, label: 'Four of a Kind, ' + labelRankP(quad) };
    }
    // Full house
    if (counts[0] === 3 && counts[1] === 2) {
      const trip = byCount[3][0], pair = byCount[2][0];
      return { score: 6e10 + trip * 100 + pair, label: 'Full House, ' + labelRankP(trip) + ' over ' + labelRankP(pair) };
    }
    // Flush
    if (isFlush) {
      return { score: 5e10 + pack(rv, 5), label: 'Flush, ' + labelRank(rv[0]) + ' high' };
    }
    // Straight
    if (strHigh) {
      return { score: 4e10 + strHigh, label: 'Straight, ' + labelRank(strHigh) + ' high' };
    }
    // Trips
    if (counts[0] === 3) {
      const trip = byCount[3][0];
      const kick = byCount[1] ? byCount[1].slice(0, 2) : [];
      return { score: 3e10 + trip * 10000 + pack(kick, 2), label: 'Three of a Kind, ' + labelRankP(trip) };
    }
    // Two pair
    if (counts[0] === 2 && counts[1] === 2) {
      const pairs = byCount[2].slice(0, 2);
      const kick  = byCount[1] ? byCount[1][0] : 0;
      return { score: 2e10 + pairs[0] * 10000 + pairs[1] * 100 + kick, label: 'Two Pair, ' + labelRankP(pairs[0]) + ' and ' + labelRankP(pairs[1]) };
    }
    // One pair
    if (counts[0] === 2) {
      const pair = byCount[2][0];
      const kick = byCount[1] ? byCount[1].slice(0, 3) : [];
      return { score: 1e10 + pair * 1000000 + pack(kick, 3), label: 'Pair of ' + labelRankP(pair) };
    }
    // High card
    return { score: pack(rv, 5), label: labelRank(rv[0]) + ' high' };
  }

  /* Pick best 5-card hand from up to 7 cards */
  function evalBest(hole, comm) {
    const all = hole.concat(comm);
    const n   = all.length;
    let best  = null;
    // Enumerate all C(n,5) combos
    for (let a = 0; a < n - 4; a++)
      for (let b = a+1; b < n - 3; b++)
        for (let c = b+1; c < n - 2; c++)
          for (let d = c+1; d < n - 1; d++)
            for (let e = d+1; e < n; e++) {
              const res = evalFive([all[a],all[b],all[c],all[d],all[e]]);
              if (!best || res.score > best.score) best = res;
            }
    return best || evalFive(all.slice(0, 5));
  }

  /* Normalised hand strength 0-1 */
  function handStrength(hole, comm) {
    if (!hole || hole.length < 2) return 0;
    const res = evalBest(hole, comm);
    const MAX = 8e10 + 14; // Royal Flush
    return Math.min(res.score / MAX, 1);
  }

  /* Preflop rank 0-10 */
  function preflopRank(hole) {
    if (!hole || hole.length < 2) return 0;
    const [c1, c2] = [hole[0], hole[1]].sort((a, b) => rankVal(b.rank) - rankVal(a.rank));
    const r1 = rankVal(c1.rank), r2 = rankVal(c2.rank);
    const suited = c1.suit === c2.suit;
    if (r1 === r2) {
      if (r1 >= 14) return 10; // AA
      if (r1 >= 13) return 9;  // KK
      if (r1 >= 12) return 8;  // QQ
      if (r1 >= 11) return 7;  // JJ
      if (r1 >= 10) return 6;  // TT
      if (r1 >= 9)  return 5;  // 99
      if (r1 >= 7)  return 4;  // 88, 77
      if (r1 >= 5)  return 3;  // 66-55
      return 2;                // 44-22
    }
    // AK
    if (r1 === 14 && r2 === 13) return suited ? 9 : 8;
    // AQ
    if (r1 === 14 && r2 === 12) return suited ? 8 : 7;
    // AJ
    if (r1 === 14 && r2 === 11) return suited ? 7 : 5;
    // AT
    if (r1 === 14 && r2 === 10) return suited ? 6 : 4;
    // A9-A2
    if (r1 === 14) return suited ? 4 : 2;
    // KQ
    if (r1 === 13 && r2 === 12) return suited ? 7 : 6;
    // KJ, KT
    if (r1 === 13 && r2 >= 10) return suited ? 5 : 3;
    // K9+
    if (r1 === 13 && r2 >= 9)  return suited ? 4 : 2;
    // QJ
    if (r1 === 12 && r2 === 11) return suited ? 6 : 4;
    // QT
    if (r1 === 12 && r2 === 10) return suited ? 5 : 3;
    // JT
    if (r1 === 11 && r2 === 10) return suited ? 5 : 3;
    // suited connectors (gap <= 1)
    if (suited && r1 - r2 <= 2) return 4;
    if (suited) return 2;
    return 1;
  }

  /* Count draw outs */
  function outCount(hole, comm) {
    if (!comm || comm.length < 3) return 0;
    const all   = hole.concat(comm);
    const suits  = all.map(c => c.suit);
    const rv     = all.map(c => rankVal(c.rank));
    // Flush draw: 4 of same suit
    const suitCnt = {};
    suits.forEach(s => { suitCnt[s] = (suitCnt[s] || 0) + 1; });
    let flushOuts = 0;
    for (const s in suitCnt) { if (suitCnt[s] === 4) { flushOuts = 9; break; } }
    // Open-ended straight draw: 4 consecutive ranks
    const u = [...new Set(rv)].sort((a, b) => a - b);
    let oesd = 0, gutshot = 0;
    for (let i = 0; i <= u.length - 4; i++) {
      if (u[i+3] - u[i] === 3) { oesd = 8; break; }
      if (u[i+3] - u[i] === 4) gutshot = Math.max(gutshot, 4);
    }
    return Math.max(flushOuts, oesd, gutshot);
  }

  function potOdds(toCall, currentPot) {
    if (toCall <= 0) return 0;
    return toCall / (currentPot + toCall);
  }

  /* ── AI Decision Functions ── */

  function bluffingtonDecide(ctx) {
    const { toCall, pot: p, myChips, street: st, rand } = ctx;
    // Preflop: never fold, raise 40% of time
    if (st === 'preflop') {
      if (rand() < 0.40) return { action: 'raise', amount: Math.min(p + BIG_BLIND * 3, myChips) };
      return toCall > 0 ? { action: 'call' } : { action: 'check' };
    }
    // Postflop: 55% bluff-raise, else call/check
    const r = rand();
    if (r < 0.55) {
      const amt = Math.min(Math.floor(p * 1.25), myChips);
      return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
    }
    if (toCall > 0) {
      if (rand() < 0.15) return { action: 'fold' }; // occasionally fold to aggression
      return { action: 'call' };
    }
    return { action: 'check' };
  }

  function graniteGretaDecide(ctx) {
    const { hand, community: comm, toCall, myChips, street: st, rand } = ctx;
    const pr  = preflopRank(hand);
    const hs  = handStrength(hand, comm);
    if (st === 'preflop') {
      if (pr >= 8) return { action: 'raise', amount: Math.min(BIG_BLIND * 3, myChips) };
      if (pr >= 6) return toCall <= BIG_BLIND * 2 ? { action: 'call' } : { action: 'fold' };
      return { action: 'fold' };
    }
    if (hs < 0.45) return { action: 'fold' };
    if (hs < 0.65) return toCall > 0 ? { action: 'call' } : { action: 'check' };
    const amt = Math.min(Math.floor(pot * 0.75), myChips);
    return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
  }

  function recklessRexDecide(ctx) {
    const { toCall, pot: p, myChips, rand } = ctx;
    const r = rand();
    if (r < 0.30) return { action: 'allin' };
    if (r < 0.75) {
      const amt = Math.min(Math.max(p, BIG_BLIND * 4), myChips);
      return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  function ottoDecide(ctx) {
    const { hand, community: comm, toCall, pot: p, myChips, street: st, rand } = ctx;
    const pr = preflopRank(hand);
    const hs = handStrength(hand, comm);
    const oc = outCount(hand, comm);
    const equity = hs + oc * 0.035;
    if (st === 'preflop') {
      if (pr >= 8) return { action: 'raise', amount: Math.min(Math.floor(BIG_BLIND * 2.5), myChips) };
      if (pr >= 5) return toCall <= BIG_BLIND * 2 ? { action: 'call' } : { action: 'fold' };
      return { action: 'fold' };
    }
    const needed = potOdds(toCall, p);
    if (equity < needed) return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    if (equity > 0.65) {
      const amt = Math.min(Math.floor(p * 0.75), myChips);
      return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  function riverRitaDecide(ctx) {
    const { hand, community: comm, toCall, myChips, street: st, rand } = ctx;
    const pr = preflopRank(hand);
    const oc = outCount(hand, comm);
    const hs = handStrength(hand, comm);
    if (st === 'preflop') {
      // Loves suited hands
      const suited = hand.length >= 2 && hand[0].suit === hand[1].suit;
      if (suited || pr >= 4) return toCall > 0 ? { action: 'call' } : { action: 'check' };
      if (rand() < 0.55) return toCall > 0 ? { action: 'call' } : { action: 'check' };
      return { action: 'fold' };
    }
    if (st === 'river') {
      // Missed draw - mostly fold, small bluff
      if (oc === 0 && hs < 0.35) return rand() < 0.20 ? { action: 'raise', amount: Math.min(Math.floor(pot * 0.4), myChips) } : (toCall > 0 ? { action: 'fold' } : { action: 'check' });
    }
    // Has a draw - always play it
    if (oc >= 8) {
      const amt = Math.min(Math.floor(pot * 0.6), myChips);
      return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
    }
    if (oc >= 4) return toCall > 0 ? { action: 'call' } : { action: 'check' };
    if (hs < 0.35) return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  function steadySamDecide(ctx) {
    const { hand, community: comm, toCall, pot: p, myChips, street: st, rand } = ctx;
    const pr = preflopRank(hand);
    const hs = handStrength(hand, comm);
    const oc = outCount(hand, comm);
    const equity = hs + oc * 0.035;
    if (st === 'preflop') {
      if (pr >= 7) return { action: 'raise', amount: Math.min(BIG_BLIND * 3, myChips) };
      if (pr >= 4) return toCall <= BIG_BLIND * 2 ? { action: 'call' } : { action: 'fold' };
      return { action: 'fold' };
    }
    // 60% pot-odds, 40% adds aggression layer
    const needed = potOdds(toCall, p);
    if (rand() < 0.40 && equity > 0.40) {
      const amt = Math.min(Math.floor(p * 0.65), myChips);
      return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
    }
    if (equity < needed && toCall > 0) return { action: 'fold' };
    if (equity > 0.70) {
      const amt = Math.min(Math.floor(p * 0.75), myChips);
      return { action: amt >= myChips ? 'allin' : 'raise', amount: amt };
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  const AI_DECIDE = [
    bluffingtonDecide,
    graniteGretaDecide,
    recklessRexDecide,
    ottoDecide,
    riverRitaDecide,
    steadySamDecide,
  ];

  /* ── Build AI state objects ── */
  function buildAIStates(indexes) {
    return indexes.map(idx => ({
      def:          AI_DEFS[idx],
      decide:       AI_DECIDE[idx],
      chips:        STARTING_CHIPS,
      hole:         [],
      folded:       false,
      allIn:        false,
      streetBet:    0,
      totalBet:     0,
    }));
  }

  /* ── Card element creation (no innerHTML with card data) ── */
  function cardEl(card, faceDown) {
    const wrap = document.createElement('div');
    if (faceDown) {
      wrap.className = 'hd-card hd-card-back hd-card-dealt';
      const pat = document.createElement('div');
      pat.className = 'hd-card-back-pattern';
      wrap.appendChild(pat);
      return wrap;
    }
    const color = SUIT_COLOR[card.suit];
    wrap.className = 'hd-card hd-card-front hd-card-dealt';
    wrap.style.color = color;

    const tl = document.createElement('div');
    tl.className = 'hd-card-corner hd-card-tl';
    const tlR = document.createElement('span'); tlR.className = 'hd-card-rank'; tlR.textContent = card.rank;
    const tlS = document.createElement('span'); tlS.className = 'hd-card-suit'; tlS.textContent = SUIT_SYM[card.suit];
    tl.appendChild(tlR); tl.appendChild(tlS);

    const ctr = document.createElement('div');
    ctr.className = 'hd-card-center'; ctr.textContent = SUIT_SYM[card.suit];

    const br = document.createElement('div');
    br.className = 'hd-card-corner hd-card-br';
    const brR = document.createElement('span'); brR.className = 'hd-card-rank'; brR.textContent = card.rank;
    const brS = document.createElement('span'); brS.className = 'hd-card-suit'; brS.textContent = SUIT_SYM[card.suit];
    br.appendChild(brR); br.appendChild(brS);

    wrap.appendChild(tl); wrap.appendChild(ctr); wrap.appendChild(br);
    return wrap;
  }

  /* ── Render helpers ── */
  function updateChipDisplay() {
    const el = $('hd-chips');
    if (el) el.textContent = chips.toLocaleString();
  }

  function renderAISeat(ai, index) {
    const seat  = $('hd-ai-seat-' + index);
    if (!seat) return;
    const nameEl   = seat.querySelector('.hd-ai-name');
    const chipsEl  = seat.querySelector('.hd-ai-chips');
    const actionEl = seat.querySelector('.hd-ai-action');
    const cardsEl  = seat.querySelector('.hd-ai-cards');

    if (nameEl)   nameEl.textContent  = ai.def.name;
    if (chipsEl)  chipsEl.textContent = ai.chips.toLocaleString() + ' chips';
    if (actionEl) actionEl.textContent = '';
    if (cardsEl)  cardsEl.textContent  = '';

    seat.className = 'hd-ai-seat';
    if (ai.folded) seat.classList.add('hd-ai-folded');
    if (ai.allIn)  seat.classList.add('hd-ai-allin');
  }

  function renderAICards(ai, index, reveal) {
    const seat    = $('hd-ai-seat-' + index);
    if (!seat) return;
    const cardsEl = seat.querySelector('.hd-ai-cards');
    if (!cardsEl) return;
    cardsEl.textContent = '';
    if (ai.hole.length < 2) return;
    for (let i = 0; i < 2; i++) {
      const c = cardEl(ai.hole[i], !reveal);
      c.classList.add('hd-ai-card-size');
      cardsEl.appendChild(c);
    }
  }

  function renderPlayerCards() {
    const el = $('hd-player-cards');
    if (!el) return;
    el.textContent = '';
    playerHole.forEach((card, i) => {
      const c = cardEl(card, false);
      c.style.animationDelay = (i * 0.08) + 's';
      el.appendChild(c);
    });
  }

  /* ── AI seat highlighting ── */
  function setAIActive(index) {
    for (let i = 0; i < todayAIs.length; i++) {
      const s = $('hd-ai-seat-' + i);
      if (s) s.classList.toggle('hd-ai-active', i === index);
    }
  }
  function clearAIActive() {
    for (let i = 0; i < todayAIs.length; i++) {
      const s = $('hd-ai-seat-' + i);
      if (s) s.classList.remove('hd-ai-active');
    }
  }

  /* ── Sequential card dealing ── */
  function dealHoleCardsSequentially(callback) {
    const steps = [];
    // Round 1: one card to each seat in order
    steps.push({ target: 'player', cardIdx: 0 });
    for (let i = 0; i < todayAIs.length; i++) {
      if (!todayAIs[i].folded) steps.push({ target: 'ai', aiIdx: i, cardIdx: 0 });
    }
    // Round 2: second card to each seat
    steps.push({ target: 'player', cardIdx: 1 });
    for (let i = 0; i < todayAIs.length; i++) {
      if (!todayAIs[i].folded) steps.push({ target: 'ai', aiIdx: i, cardIdx: 1 });
    }

    const playerCardEl = $('hd-player-cards');
    if (playerCardEl) playerCardEl.textContent = '';

    let step = 0;
    function dealNext() {
      if (step >= steps.length) {
        if (callback) callback();
        return;
      }
      const s = steps[step++];
      if (s.target === 'player') {
        if (playerCardEl && playerHole[s.cardIdx]) {
          const c = cardEl(playerHole[s.cardIdx], false);
          playerCardEl.appendChild(c);
        }
      } else {
        const ai   = todayAIs[s.aiIdx];
        const seat = $('hd-ai-seat-' + s.aiIdx);
        const cEl  = seat ? seat.querySelector('.hd-ai-cards') : null;
        if (cEl && ai.hole[s.cardIdx]) {
          const c = cardEl(ai.hole[s.cardIdx], true);
          c.classList.add('hd-ai-card-size');
          cEl.appendChild(c);
        }
      }
      setTimeout(dealNext, DEAL_DELAY_MS);
    }
    dealNext();
  }

  /* Deal flop cards one at a time */
  function dealFlop(callback) {
    let idx = 0;
    function next() {
      if (idx >= 3) { if (callback) callback(); return; }
      renderCommunityCard(idx, community[idx]);
      idx++;
      setTimeout(next, DEAL_DELAY_MS + 30);
    }
    next();
  }

  function renderCommunityCard(idx, card) {
    const slot = $('hd-comm-' + idx);
    if (!slot) return;
    slot.textContent = '';
    slot.classList.add('filled');
    const c = cardEl(card, false);
    slot.appendChild(c);
  }

  function clearCommunityCards() {
    for (let i = 0; i < 5; i++) {
      const slot = $('hd-comm-' + i);
      if (slot) { slot.textContent = ''; slot.classList.remove('filled'); }
    }
  }

  function updatePot() {
    const el = $('hd-pot');
    if (el) el.textContent = 'POT: ' + pot.toLocaleString() + ' chips';
  }

  function setAIAction(index, text) {
    const seat = $('hd-ai-seat-' + index);
    if (!seat) return;
    const el = seat.querySelector('.hd-ai-action');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hd-action-anim');
    void el.offsetHeight; // force reflow to restart animation
    el.classList.add('hd-action-anim');
  }

  function setStreetLabel(text) {
    const el = $('hd-street-label');
    if (el) el.textContent = text;
  }

  function setHandResult(text, type) {
    // type: 'win' | 'lose' | 'push' | 'fold'
    const el = $('hd-hand-result');
    if (!el) return;
    el.textContent = text;
    el.className = 'hd-hand-result hd-result-' + (type || 'push');
    el.classList.remove('hidden');
  }

  function hideHandResult() {
    const el = $('hd-hand-result');
    if (el) el.classList.add('hidden');
  }

  function showActions(toCall) {
    actionLocked = false;
    const actDiv   = $('hd-actions');
    const raiseDiv = $('hd-raise-picker');
    if (!actDiv) return;
    actDiv.classList.remove('hidden');
    if (raiseDiv) raiseDiv.classList.add('hidden');

    const foldBtn  = $('hd-btn-fold');
    const callBtn  = $('hd-btn-call');
    const checkBtn = $('hd-btn-check');
    const raiseBtn = $('hd-btn-raise');

    if (toCall > 0) {
      if (foldBtn)  { foldBtn.classList.remove('hidden');  foldBtn.textContent = 'Fold'; }
      if (callBtn)  { callBtn.classList.remove('hidden');  callBtn.textContent = 'Call ' + toCall; }
      if (checkBtn) checkBtn.classList.add('hidden');
    } else {
      if (foldBtn)  foldBtn.classList.add('hidden');
      if (callBtn)  callBtn.classList.add('hidden');
      if (checkBtn) checkBtn.classList.remove('hidden');
    }
    if (raiseBtn) raiseBtn.classList.remove('hidden');

    // Disable raise if player can't afford a min-raise
    if (raiseBtn) raiseBtn.disabled = chips <= toCall;
  }

  function hideActions() {
    const el = $('hd-actions');
    if (el) el.classList.add('hidden');
    const rp = $('hd-raise-picker');
    if (rp) rp.classList.add('hidden');
  }

  /* ── Betting UI (between hands) ── */
  let pendingBet = 0;

  function showBetting() {
    pendingBet = 0;
    updateChipDisplay();

    const betArea = $('hd-bet-area');
    if (betArea) betArea.classList.remove('hidden');

    hideActions();
    hideHandResult();

    const betAmtEl = $('hd-bet-amount');
    if (betAmtEl) betAmtEl.textContent = '0';
    const dealBtn = $('hd-bet-deal');
    if (dealBtn) dealBtn.disabled = true;

    const indEl = $('hd-hand-indicator');
    if (indEl) indEl.textContent = 'Hand ' + (handNum + 1) + ' of ' + HANDS_PER_DAY;

    setStreetLabel('');
    clearCommunityCards();
    updatePot();
    $('hd-pot').textContent = '';

    // Clear AI seats
    todayAIs.forEach((ai, i) => renderAISeat(ai, i));

    // Hide player cards
    const pc = $('hd-player-cards');
    if (pc) pc.textContent = '';
  }

  function addBet(amount) {
    if (amount === 'all') {
      pendingBet = chips;
    } else {
      pendingBet = Math.min(pendingBet + parseInt(amount, 10), chips);
    }
    const el = $('hd-bet-amount');
    if (el) el.textContent = pendingBet.toLocaleString();
    const dealBtn = $('hd-bet-deal');
    if (dealBtn) dealBtn.disabled = pendingBet <= 0;
  }

  function clearBet() {
    pendingBet = 0;
    const el = $('hd-bet-amount');
    if (el) el.textContent = '0';
    const dealBtn = $('hd-bet-deal');
    if (dealBtn) dealBtn.disabled = true;
  }

  /* ── Game Flow ── */

  function startHand() {
    if (pendingBet <= 0 || pendingBet > chips) return;
    const betArea = $('hd-bet-area');
    if (betArea) betArea.classList.add('hidden');

    // Reset hand state
    playerFolded     = false;
    community        = [];
    pot              = 0;
    currentStreetBet = 0;
    playerStreetBet  = 0;

    // Reset per-hand AI state
    todayAIs.forEach(ai => {
      ai.hole       = [];
      ai.folded     = false;
      ai.allIn      = false;
      ai.streetBet  = 0;
      ai.totalBet   = 0;
      if (ai.chips <= 0) ai.folded = true; // busted AI sits out
    });

    // Re-init seeded rng for this hand
    dailyRng = mulberry32(dateToSeed(chicagoDate()) + handNum * 1000);

    // Create and shuffle deck
    deck = shuffleDeck(createDeck());

    // Post blinds
    // AI[handNum % 3] = SB, AI[(handNum+1) % 3] = BB
    const sbIdx = handNum % 3;
    const bbIdx = (handNum + 1) % 3;

    const sbAI = todayAIs[sbIdx];
    const bbAI = todayAIs[bbIdx];

    if (!sbAI.folded) {
      const sbAmt = Math.min(SMALL_BLIND, sbAI.chips);
      sbAI.chips     -= sbAmt;
      sbAI.streetBet += sbAmt;
      pot            += sbAmt;
    }
    if (!bbAI.folded) {
      const bbAmt = Math.min(BIG_BLIND, bbAI.chips);
      bbAI.chips     -= bbAmt;
      bbAI.streetBet += bbAmt;
      pot            += bbAmt;
      currentStreetBet = bbAmt;
    }

    // Deal hole cards
    playerHole = [drawCard(), drawCard()];
    todayAIs.forEach(ai => {
      if (!ai.folded) ai.hole = [drawCard(), drawCard()];
    });

    // Render AI seat names/chips; cards dealt sequentially below
    todayAIs.forEach((ai, i) => {
      renderAISeat(ai, i);
      const seat = $('hd-ai-seat-' + i);
      const cEl  = seat ? seat.querySelector('.hd-ai-cards') : null;
      if (cEl) cEl.textContent = '';
    });
    updatePot();
    setStreetLabel('PRE-FLOP');

    // Deal cards one at a time in poker order, then begin the street
    dealHoleCardsSequentially(() => {
      beginStreet('preflop');
    });
  }

  /* Pre-flop: player acts last (button) - AIs act first */
  function beginStreet(st) {
    street           = st;
    currentStreetBet = st === 'preflop' ? BIG_BLIND : 0;
    playerStreetBet  = 0;
    todayAIs.forEach(ai => { ai.streetBet = 0; });

    if (st === 'preflop') {
      // BB already put in their blind; adjust their streetBet tracking
      const bbIdx = (handNum + 1) % 3;
      const bbAI  = todayAIs[bbIdx];
      if (!bbAI.folded) bbAI.streetBet = BIG_BLIND;
      // SB streetBet
      const sbIdx = handNum % 3;
      const sbAI  = todayAIs[sbIdx];
      if (!sbAI.folded) sbAI.streetBet = SMALL_BLIND;
      currentStreetBet = BIG_BLIND;
    }

    const activePlayers = todayAIs.filter(a => !a.folded && !a.allIn);
    if (activePlayers.length === 0) {
      // All AIs folded or all-in - go straight to player action
      const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
      showActions(Math.max(toCall, 0));
      return;
    }

    if (st === 'preflop') {
      // AIs act first preflop (player is button, acts last)
      runAIActions(function () {
        if (playerFolded) { doShowdown(); return; }
        const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
        showActions(Math.max(toCall, 0));
      });
    } else {
      // Post-flop: player acts first
      const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
      showActions(Math.max(toCall, 0));
    }
  }

  function runAIActions(callback) {
    const active = todayAIs.filter(ai => !ai.folded && !ai.allIn);
    let i = 0;
    function next() {
      if (i >= active.length) {
        clearAIActive();
        if (callback) callback();
        return;
      }
      const ai      = active[i];
      const seatIdx = todayAIs.indexOf(ai);

      // Highlight the seat so it's clear whose turn it is
      setAIActive(seatIdx);

      const toCall = Math.max(currentStreetBet - ai.streetBet, 0);
      const ctx    = {
        hand:      ai.hole,
        community: community,
        pot:       pot,
        toCall:    Math.min(toCall, ai.chips),
        myChips:   ai.chips,
        street:    street,
        rand:      dailyRng,
      };

      // Brief "thinking" pause, then show the action
      setTimeout(() => {
        const dec = ai.decide(ctx);
        applyAIDecision(ai, dec, seatIdx);
        updatePot();
        i++;
        // Hold the action visible, then move on
        setTimeout(next, 700);
      }, 380);
    }
    setTimeout(next, 200);
  }

  function applyAIDecision(ai, dec, seatIndex) {
    const toCall = Math.max(currentStreetBet - ai.streetBet, 0);
    switch (dec.action) {
      case 'fold':
        ai.folded = true;
        setAIAction(seatIndex, 'FOLDED');
        break;
      case 'check':
        setAIAction(seatIndex, 'CHECK');
        break;
      case 'call': {
        const amt = Math.min(toCall, ai.chips);
        ai.chips     -= amt;
        ai.streetBet += amt;
        ai.totalBet  += amt;
        pot          += amt;
        if (ai.chips === 0) { ai.allIn = true; setAIAction(seatIndex, 'ALL IN'); }
        else setAIAction(seatIndex, 'CALL ' + amt);
        break;
      }
      case 'raise': {
        const raiseAmt = Math.min(dec.amount || BIG_BLIND * 2, ai.chips);
        const extra    = raiseAmt - ai.streetBet; // extra beyond what's already in
        const paid     = Math.min(extra, ai.chips);
        ai.chips         -= paid;
        ai.streetBet     += paid;
        ai.totalBet      += paid;
        pot              += paid;
        currentStreetBet  = Math.max(currentStreetBet, ai.streetBet);
        if (ai.chips === 0) { ai.allIn = true; setAIAction(seatIndex, 'ALL IN'); }
        else setAIAction(seatIndex, 'RAISE ' + ai.streetBet);
        break;
      }
      case 'allin': {
        const amt    = ai.chips;
        ai.streetBet += amt;
        ai.totalBet  += amt;
        pot          += amt;
        ai.chips      = 0;
        ai.allIn      = true;
        currentStreetBet = Math.max(currentStreetBet, ai.streetBet);
        setAIAction(seatIndex, 'ALL IN');
        break;
      }
    }
    // Update chip display and visual state
    const seat = $('hd-ai-seat-' + seatIndex);
    if (seat) {
      const chipsEl = seat.querySelector('.hd-ai-chips');
      if (chipsEl) chipsEl.textContent = ai.chips.toLocaleString() + ' chips';
      if (ai.folded) {
        seat.classList.add('hd-ai-folded');
        const cEl = seat.querySelector('.hd-ai-cards');
        if (cEl) cEl.classList.add('hd-cards-folded');
      }
    }
  }

  /* Player actions */
  function onPlayerFold() {
    if (actionLocked) return;
    actionLocked = true;
    hideActions();
    playerFolded = true;
    // AIs win the pot - give it to last non-folded AI or split
    const remaining = todayAIs.filter(ai => !ai.folded);
    if (remaining.length === 1) {
      remaining[0].chips += pot;
    } else if (remaining.length > 1) {
      // Split among remaining (shouldn't happen in a real pot - just give to first)
      remaining[0].chips += pot;
    }
    finishHand(-playerStreetBet, 'fold');
  }

  function onPlayerCall() {
    if (actionLocked) return;
    actionLocked = true;
    hideActions();
    const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
    if (toCall > 0) {
      chips           -= toCall;
      playerStreetBet += toCall;
      pot             += toCall;
    }
    updateChipDisplay();
    updatePot();
    proceedAfterPlayerAction();
  }

  function onPlayerCheck() {
    if (actionLocked) return;
    actionLocked = true;
    hideActions();
    proceedAfterPlayerAction();
  }

  function onPlayerRaise(amount) {
    if (actionLocked) return;
    actionLocked = true;
    const rp = $('hd-raise-picker');
    if (rp) rp.classList.add('hidden');
    hideActions();

    const raiseTotal = Math.min(amount, chips);
    const paid       = raiseTotal - playerStreetBet;
    chips           -= paid;
    playerStreetBet += paid;
    pot             += paid;
    currentStreetBet = Math.max(currentStreetBet, playerStreetBet);
    if (chips === 0) { /* player all-in */ }

    updateChipDisplay();
    updatePot();
    proceedAfterPlayerAction();
  }

  /* After player acts, let remaining AIs respond, then advance street */
  function proceedAfterPlayerAction() {
    // Give AIs a chance to respond to player's action on post-flop streets
    if (street !== 'preflop') {
      runAIActions(advanceStreet);
    } else {
      advanceStreet();
    }
  }

  function advanceStreet() {
    const active = [!playerFolded, ...todayAIs.map(a => !a.folded && !a.allIn)];
    const activeCnt = active.filter(Boolean).length;

    if (activeCnt <= 1) {
      doShowdown();
      return;
    }

    if (street === 'preflop') {
      community.push(drawCard(), drawCard(), drawCard());
      setStreetLabel('FLOP');
      street = 'flop';
      // Deal flop cards one at a time, then start betting
      dealFlop(() => beginStreet('flop'));
    } else if (street === 'flop') {
      community.push(drawCard());
      renderCommunityCard(3, community[3]);
      setStreetLabel('TURN');
      street = 'turn';
      // Short pause after card lands before betting resumes
      setTimeout(() => beginStreet('turn'), 420);
    } else if (street === 'turn') {
      community.push(drawCard());
      renderCommunityCard(4, community[4]);
      setStreetLabel('RIVER');
      street = 'river';
      setTimeout(() => beginStreet('river'), 420);
    } else {
      doShowdown();
    }
  }

  function doShowdown() {
    setStreetLabel('SHOWDOWN');
    hideActions();

    // Reveal all AI cards with delay
    let delay = 200;
    todayAIs.forEach((ai, i) => {
      setTimeout(() => renderAICards(ai, i, true), delay);
      delay += 350;
    });

    setTimeout(() => {
      // Evaluate hands
      const players = [];
      if (!playerFolded) {
        const res = evalBest(playerHole, community);
        players.push({ who: 'player', score: res.score, label: res.label });
      }
      todayAIs.forEach((ai, i) => {
        if (!ai.folded && ai.hole.length >= 2) {
          const res = evalBest(ai.hole, community);
          players.push({ who: i, score: res.score, label: res.label });
        }
      });

      if (players.length === 0) { finishHand(0, 'push'); return; }

      // Find winner(s)
      const maxScore = Math.max(...players.map(p => p.score));
      const winners  = players.filter(p => p.score === maxScore);
      const share    = Math.floor(pot / winners.length);

      let playerNet = -playerStreetBet; // started as a loss of what player put in

      winners.forEach(w => {
        if (w.who === 'player') {
          playerNet += share;
          chips     += share;
        } else {
          todayAIs[w.who].chips += share;
          // Highlight winning AI seat
          const seat = $('hd-ai-seat-' + w.who);
          if (seat) seat.classList.add('hd-winner');
        }
      });

      // Show result label
      if (playerFolded) {
        const winnerName = typeof winners[0].who === 'number' ? todayAIs[winners[0].who].def.name : 'Opponent';
        setHandResult(winnerName + ' wins', 'lose');
      } else if (winners.length === 1 && winners[0].who === 'player') {
        setHandResult('You win! ' + winners[0].label, 'win');
      } else if (winners.some(w => w.who === 'player')) {
        setHandResult('Split pot - ' + winners[0].label, 'push');
      } else {
        const winnerName = typeof winners[0].who === 'number' ? todayAIs[winners[0].who].def.name : 'Opponent';
        setHandResult(winnerName + ' wins with ' + winners[0].label, 'lose');
      }

      updateChipDisplay();
      setTimeout(() => finishHand(playerNet, playerNet > 0 ? 'win' : playerNet < 0 ? 'lose' : 'push'), 1800);
    }, delay + 200);
  }

  function finishHand(net, type) {
    updateAllTime(net);
    sessionResults.push({ net });
    handNum++;
    saveToday();
    saveChips();

    if (chips <= 0) {
      showBrokeScreen();
      return;
    }
    if (handNum >= HANDS_PER_DAY) {
      showFinalResults();
      return;
    }

    // Brief pause then show next bet UI
    setTimeout(showBetting, 1200);
  }

  /* ── Final Results ── */
  function showFinalResults() {
    dailyDone = true;
    saveToday();
    saveChips();

    const stats    = loadStats();
    const totalNet = sessionResults.reduce((s, r) => s + r.net, 0);
    const won      = totalNet >= 0;
    stats.played++;
    if (won) { stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
    else     { stats.streak = 0; }
    saveStats(stats);

    const finalChipsEl = $('hd-final-chips');
    if (finalChipsEl) finalChipsEl.textContent = chips.toLocaleString();

    const netEl = $('hd-session-net');
    if (netEl) {
      if (totalNet > 0) {
        netEl.textContent = '+' + totalNet.toLocaleString() + ' today';
        netEl.className   = 'text-sm font-bold mt-1 text-green-400';
      } else if (totalNet < 0) {
        netEl.textContent = totalNet.toLocaleString() + ' today';
        netEl.className   = 'text-sm font-bold mt-1 text-red-400';
      } else {
        netEl.textContent = 'Even today';
        netEl.className   = 'text-sm font-bold mt-1 text-yellow-300';
      }
    }

    // Hand result dots
    const row = $('hd-hand-results-row');
    if (row) {
      row.textContent = '';
      sessionResults.forEach((r, i) => {
        const dot   = document.createElement('div');
        dot.className = 'hd-result-dot';
        const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
        const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : '' + r.net;
        const s1 = document.createElement('span'); s1.className = 'text-lg'; s1.textContent = emoji;
        const s2 = document.createElement('span'); s2.textContent = 'Hand ' + (i + 1);
        const s3 = document.createElement('span'); s3.className = 'font-bold'; s3.textContent = label;
        dot.appendChild(s1); dot.appendChild(s2); dot.appendChild(s3);
        row.appendChild(dot);
      });
    }

    // AI reveal row in results
    const aiRow = $('hd-ai-reveal-row');
    if (aiRow) {
      aiRow.textContent = '';
      todayAIs.forEach(ai => {
        const item  = document.createElement('div');
        item.className = 'hd-ai-reveal-item';
        const nm    = document.createElement('div');
        nm.className = 'hd-ai-reveal-name';
        nm.textContent = ai.def.name;
        const tg    = document.createElement('div');
        tg.style.cssText = 'font-size:9px;color:#6b7280;text-align:center;max-width:80px';
        tg.textContent = ai.def.tagline;
        item.appendChild(nm); item.appendChild(tg);
        aiRow.appendChild(item);
      });
    }

    $('hd-results').classList.remove('hidden');
    $('hd-bet-area').classList.add('hidden');
    hideActions();
    hideHandResult();

    const indEl = $('hd-hand-indicator');
    if (indEl) indEl.textContent = 'All hands played';

    startCountdown('hd-countdown');
  }

  /* ── Broke Screen ── */
  function showBrokeScreen() {
    dailyDone = true;
    saveToday();
    saveChips();

    const stats = loadStats();
    stats.played++;
    stats.streak = 0;
    saveStats(stats);

    const row = $('hd-broke-hands');
    if (row) {
      row.textContent = '';
      sessionResults.forEach((r, i) => {
        const dot   = document.createElement('div');
        dot.className = 'hd-result-dot';
        const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
        const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : '' + r.net;
        const s1 = document.createElement('span'); s1.className = 'text-lg'; s1.textContent = emoji;
        const s2 = document.createElement('span'); s2.textContent = 'Hand ' + (i + 1);
        const s3 = document.createElement('span'); s3.className = 'font-bold'; s3.textContent = label;
        dot.appendChild(s1); dot.appendChild(s2); dot.appendChild(s3);
        row.appendChild(dot);
      });
    }

    $('hd-broke').classList.remove('hidden');
    $('hd-bet-area').classList.add('hidden');
    hideActions();
    hideHandResult();

    const indEl = $('hd-hand-indicator');
    if (indEl) indEl.textContent = 'Out of chips';

    startCountdown('hd-broke-countdown');
  }

  /* ── Share ── */
  function buildShareText() {
    const totalNet = sessionResults.reduce((s, r) => s + r.net, 0);
    const names    = todayAIs.map(a => a.def.name);
    const nameStr  = names.length === 3
      ? names[0] + ', ' + names[1] + ' and ' + names[2]
      : names.join(', ');
    const emojis   = sessionResults.map(r => r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1').join('');
    const sign     = totalNet >= 0 ? '+' : '';
    if (chips <= 0) {
      return 'Holdle ' + chicagoDate() + '\nvs. ' + nameStr + '\n\n\uD83D\uDC80 Out of chips!\ndailyjamm.com/holdle/';
    }
    return 'Holdle ' + chicagoDate() + '\nvs. ' + nameStr + '\n\n' +
      emojis + ' (' + sign + totalNet.toLocaleString() + ' chips)\n' +
      'Stack: ' + chips.toLocaleString() + '\ndailyjamm.com/holdle/';
  }

  function shareResults() {
    DJUtils.clipboardShare(buildShareText(), $('hd-share-btn'), 'Share Results');
  }
  function shareBrokeResults() {
    DJUtils.clipboardShare(buildShareText(), $('hd-broke-share-btn'), 'Share Results');
  }

  /* ── Stats ── */
  function showStats() {
    const s  = loadStats();
    const at = loadAllTime();
    const atSign  = at.totalNet >= 0 ? '+' : '';
    const atColor = at.totalNet >= 0 ? '#4ade80' : '#f87171';

    DJUtils.setStatRows('hd-stats-content', [
      { label: 'Current Stack',    value: chips.toLocaleString() + ' chips', color: '#4ade80' },
      { label: 'Games Played',     value: s.played || 0 },
      { label: 'Current Streak',   value: s.streak,                          color: '#facc15' },
      { label: 'Best Streak',      value: s.best,                            color: '#a78bfa' },
      { label: 'Best Session Hand', value: '+' + at.biggestWin.toLocaleString(), color: '#4ade80' },
      { label: 'Worst Session Hand', value: at.biggestLoss.toLocaleString(), color: '#f87171' },
      { label: 'All-Time Net',     value: atSign + at.totalNet.toLocaleString(), color: atColor },
    ]);
    const modal = $('hd-stats-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeStats() {
    const modal = $('hd-stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  function shareStats() {
    const s  = loadStats();
    const at = loadAllTime();
    const atSign = at.totalNet >= 0 ? '+' : '';
    const lines = [
      'Holdle Stats \uD83C\uDCCF',
      '',
      '\uD83C\uDFAE Played: ' + (s.played || 0),
      '\uD83D\uDD25 Streak: ' + s.streak + '  |  Best: ' + s.best,
      '\uD83D\uDCB0 Best Hand: +' + at.biggestWin.toLocaleString(),
      '\uD83D\uDCC9 Worst Hand: ' + at.biggestLoss.toLocaleString(),
      '\uD83D\uDCCA All-Time Net: ' + atSign + at.totalNet.toLocaleString(),
      '',
      'dailyjamm.com/holdle/',
    ];
    const btn = $('hd-stats-share-btn');
    if (btn) DJUtils.clipboardShare(lines.join('\n'), btn, 'Share Stats');
  }

  /* ── Countdown ── */
  function startCountdown(elId) {
    const el = $(elId);
    if (!el) return;
    function tick() {
      const diff = chicagoMidnight() - Date.now();
      if (diff <= 0) { el.textContent = '00:00:00'; return; }
      const h = Math.floor(diff / MS_PER_HOUR);
      const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
      const s = Math.floor((diff % MS_PER_MIN)  / MS_PER_SEC);
      el.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }
    tick();
    setInterval(tick, MS_PER_SEC);
  }

  /* ── Modals ── */
  function showModal()  { $('hd-modal').classList.remove('hidden'); }
  function closeModal() { $('hd-modal').classList.add('hidden'); localStorage.setItem('hd_seen_howto', '1'); }

  function showDailyWelcome(callback) {
    const steps = (DAILY_BONUS_MAX - DAILY_BONUS_MIN) / 10 + 1;
    const bonus = DAILY_BONUS_MIN + Math.floor(Math.random() * steps) * 10;
    chips += bonus;
    saveChips();
    localStorage.setItem('hd_bonus_date', chicagoDate());

    const bonusEl    = $('hd-bonus-amount');
    const newStackEl = $('hd-new-stack');
    if (bonusEl)    bonusEl.textContent    = '+' + bonus;
    if (newStackEl) newStackEl.textContent = chips.toLocaleString();
    $('hd-daily-modal').classList.remove('hidden');

    $('hd-daily-close').onclick = function () {
      $('hd-daily-modal').classList.add('hidden');
      updateChipDisplay();
      if (callback) callback();
    };
  }

  /* ── Raise picker ── */
  const RAISE_LABELS = { min: 'Min', half: 'Half Pot', pot: 'Pot', allin: 'All In' };

  function showRaisePicker() {
    const rp = $('hd-raise-picker');
    if (!rp) return;

    // Refresh chip costs on each open so amounts reflect current pot/stack
    rp.querySelectorAll('.hd-raise-opt').forEach(btn => {
      const type  = btn.dataset.raise;
      const total = getRaiseAmount(type);
      const cost  = total - playerStreetBet; // additional chips leaving the player's stack

      btn.textContent = '';
      const lbl = document.createElement('span');
      lbl.textContent = RAISE_LABELS[type] || type;
      const amt = document.createElement('span');
      amt.className   = 'hd-raise-cost';
      amt.textContent = cost.toLocaleString() + ' chips';
      btn.appendChild(lbl);
      btn.appendChild(amt);
    });

    rp.classList.toggle('hidden');
  }

  function getRaiseAmount(type) {
    const minRaise = currentStreetBet + BIG_BLIND;
    switch (type) {
      case 'min':   return Math.min(minRaise, chips + playerStreetBet);
      case 'half':  return Math.min(playerStreetBet + Math.floor(pot / 2), chips + playerStreetBet);
      case 'pot':   return Math.min(playerStreetBet + pot, chips + playerStreetBet);
      case 'allin': return chips + playerStreetBet;
      default:      return minRaise;
    }
  }

  /* ── Init ── */
  function init() {
    chips = loadChips();

    // Determine daily AIs
    const today       = loadToday();
    const aiIndexes   = today ? today.aiIndexes : getDailyAIIndexes(chicagoDate());
    todayAIs          = buildAIStates(aiIndexes);

    // Render AI seat names early
    todayAIs.forEach((ai, i) => {
      const seat    = $('hd-ai-seat-' + i);
      if (!seat) return;
      const nameEl  = seat.querySelector('.hd-ai-name');
      const chipsEl = seat.querySelector('.hd-ai-chips');
      if (nameEl)  nameEl.textContent  = ai.def.name;
      if (chipsEl) chipsEl.textContent = STARTING_CHIPS.toLocaleString() + ' chips';
    });

    updateChipDisplay();

    const isFirstVisit = !localStorage.getItem('hd_seen_howto');
    const bonusDate    = localStorage.getItem('hd_bonus_date');
    const needsBonus   = !isFirstVisit && bonusDate !== chicagoDate();

    if (today && today.done) {
      handNum        = today.handNum;
      chips          = today.chips;
      sessionResults = today.results || [];
      dailyDone      = true;
      updateChipDisplay();
      if (chips <= 0 && handNum < HANDS_PER_DAY) {
        showBrokeScreen();
      } else {
        showFinalResults();
      }
    } else if (today && today.handNum > 0) {
      handNum        = today.handNum;
      chips          = today.chips;
      sessionResults = today.results || [];
      updateChipDisplay();
      if (handNum >= HANDS_PER_DAY || chips <= 0) {
        chips <= 0 ? showBrokeScreen() : showFinalResults();
      } else {
        showBetting();
      }
    } else {
      localStorage.setItem('hd_bonus_date', chicagoDate());
      if (isFirstVisit) {
        updateChipDisplay();
        showBetting();
        showModal();
      } else if (needsBonus) {
        updateChipDisplay();
        showDailyWelcome(() => showBetting());
      } else {
        updateChipDisplay();
        showBetting();
      }
    }

    /* ── Event listeners ── */
    document.querySelectorAll('.hd-bet-chip').forEach(btn => {
      btn.addEventListener('click', () => addBet(btn.dataset.amount));
    });
    const clearBtn = $('hd-bet-clear');
    const dealBtn  = $('hd-bet-deal');
    if (clearBtn) clearBtn.addEventListener('click', clearBet);
    if (dealBtn)  dealBtn.addEventListener('click', startHand);

    const foldBtn  = $('hd-btn-fold');
    const callBtn  = $('hd-btn-call');
    const checkBtn = $('hd-btn-check');
    const raiseBtn = $('hd-btn-raise');
    if (foldBtn)  foldBtn.addEventListener('click', onPlayerFold);
    if (callBtn)  callBtn.addEventListener('click', onPlayerCall);
    if (checkBtn) checkBtn.addEventListener('click', onPlayerCheck);
    if (raiseBtn) raiseBtn.addEventListener('click', showRaisePicker);

    document.querySelectorAll('.hd-raise-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const amt = getRaiseAmount(btn.dataset.raise);
        onPlayerRaise(amt);
      });
    });

    const shareBtn = $('hd-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', shareResults);

    const helpBtn  = $('hd-help-btn');
    const statsBtn = $('hd-stats-btn');
    if (helpBtn)  helpBtn.addEventListener('click', showModal);
    if (statsBtn) statsBtn.addEventListener('click', showStats);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeStats();
        const dm = $('hd-daily-modal');
        if (dm) dm.classList.add('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showModal, closeModal, showStats, closeStats, shareResults, shareBrokeResults, shareStats };
})();
