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
  const DAILY_BONUS_MIN = 100;
  const DAILY_BONUS_MAX = 500;

  const SUITS      = ['h', 'd', 'c', 's'];
  const RANKS      = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const RANK_VAL   = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  const SUIT_SYM   = { h:'\u2665', d:'\u2666', c:'\u2663', s:'\u2660' };
  const SUIT_COLOR = { h:'#ef4444', d:'#ef4444', c:'#1a1a2e', s:'#1a1a2e' };

  /* ── AI Definitions ── */
  const AI_DEFS = [
    { id:0, name:'David',  tagline:'Raises with nothing and loves it.' },
    { id:1, name:'Peter',  tagline:'Only plays premiums. Patience is a virtue.' },
    { id:2, name:'Jon',    tagline:'Calculates pot odds. Won\'t call without equity.' },
    { id:3, name:'Caleb',  tagline:'Lives for the flush. Drawing forever.' },
    { id:4, name:'Mandy',  tagline:'Reads the table and mixes it up.' },
    { id:5, name:'Madelyn',tagline:'Completely unpredictable. Good luck.' },
    { id:6, name:'Josh',   tagline:'Mostly plays it straight, but don\'t count him out.' },
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
  let streetRaiseCount = 0;  // total raises on current street (capped at 2)
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
      aiChips:    todayAIs.map(a => a.chips),
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

  /* Per-AI head-to-head stats: { [aiId]: { w, l, f } } */
  function loadAIStats() {
    try { return JSON.parse(localStorage.getItem('hd_ai_stats_v2')) || {}; }
    catch { return {}; }
  }
  function saveAIStats(s) { localStorage.setItem('hd_ai_stats_v2', JSON.stringify(s)); }
  function recordAIStats(type) {
    // type: 'win' | 'lose' | 'fold'
    const s = loadAIStats();
    todayAIs.forEach(ai => {
      const id = String(ai.def.id);
      if (!s[id]) s[id] = { w:0, l:0, f:0 };
      if (type === 'win')  s[id].w++;
      else if (type === 'fold') s[id].f++;
      else                 s[id].l++;
    });
    saveAIStats(s);
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
    const idxs = [0,1,2,3,4,5,6];
    for (let i = 6; i > 0; i--) {
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

  /* Same as evalBest but also returns the 5 cards that make the best hand */
  function evalBestWithCards(hole, comm) {
    const all = hole.concat(comm);
    const n   = all.length;
    let best  = null;
    let bestCombo = null;
    for (let a = 0; a < n - 4; a++)
      for (let b = a+1; b < n - 3; b++)
        for (let c = b+1; c < n - 2; c++)
          for (let d = c+1; d < n - 1; d++)
            for (let e = d+1; e < n; e++) {
              const combo = [all[a], all[b], all[c], all[d], all[e]];
              const res   = evalFive(combo);
              if (!best || res.score > best.score) { best = res; bestCombo = combo; }
            }
    if (!best) { bestCombo = all.slice(0, 5); best = evalFive(bestCombo); }
    return { score: best.score, label: best.label, cards: bestCombo };
  }

  /* From a 5-card best combo, return only the cards that form the named hand (no kickers) */
  function getRelevantCards(combo) {
    const rv    = combo.map(c => rankVal(c.rank));
    const suits = combo.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    const cnt = {};
    rv.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
    const counts = Object.values(cnt).sort((a, b) => b - a);

    function isStraightCheck(ranks) {
      const u = [...new Set(ranks)].sort((a, b) => b - a);
      if (u.length < 5) return false;
      if (u[0] - u[4] === 4) return true;
      if (u[0] === 14 && u[1] === 5 && u[2] === 4 && u[3] === 3 && u[4] === 2) return true;
      return false;
    }
    const isStraightHand = isStraightCheck(rv);

    // All 5 cards matter: straight flush, flush, straight, full house
    if ((isFlush && isStraightHand) || isFlush || isStraightHand || (counts[0] === 3 && counts[1] === 2)) {
      return combo;
    }
    // Four of a kind: just the 4 matching cards
    if (counts[0] === 4) {
      const qr = parseInt(Object.entries(cnt).find(([, c]) => c === 4)[0]);
      return combo.filter(c => rankVal(c.rank) === qr);
    }
    // Three of a kind: just the 3 matching cards
    if (counts[0] === 3) {
      const tr = parseInt(Object.entries(cnt).find(([, c]) => c === 3)[0]);
      return combo.filter(c => rankVal(c.rank) === tr);
    }
    // Two pair: just the 4 paired cards
    if (counts[0] === 2 && counts[1] === 2) {
      const prs = Object.entries(cnt).filter(([, c]) => c === 2).map(([r]) => parseInt(r));
      return combo.filter(c => prs.includes(rankVal(c.rank)));
    }
    // One pair: just the 2 paired cards
    if (counts[0] === 2) {
      const pr = parseInt(Object.entries(cnt).find(([, c]) => c === 2)[0]);
      return combo.filter(c => rankVal(c.rank) === pr);
    }
    // High card: just the top card
    const maxR = Math.max(...rv);
    return [combo.find(c => rankVal(c.rank) === maxR)];
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

  // Helper: cap a raise to avoid all-in on early hands
  function safeRaise(amt, myChips, handNum) {
    if (handNum === 0) return Math.min(amt, Math.floor(myChips * 0.45));
    if (handNum === 1) return Math.min(amt, Math.floor(myChips * 0.70));
    return amt; // last hand - no cap
  }

  function davidDecide(ctx) {
    const { toCall, pot: p, myChips, street: st, rand, handNum: hn } = ctx;
    const isLast = hn === 2;
    if (st === 'preflop') {
      if (rand() < 0.40) return { action: 'raise', amount: safeRaise(Math.min(p + BIG_BLIND * 3, myChips), myChips, hn) };
      return toCall > 0 ? { action: 'call' } : { action: 'check' };
    }
    const r = rand();
    if (r < 0.55) {
      const amt = safeRaise(Math.min(Math.floor(p * 1.25), myChips), myChips, hn);
      // Last hand: if the raise would be near all-in, just go all-in
      if (isLast && amt >= myChips * 0.85) return { action: 'allin' };
      return { action: 'raise', amount: amt };
    }
    if (toCall > 0) {
      if (rand() < 0.15) return { action: 'fold' };
      return { action: 'call' };
    }
    return { action: 'check' };
  }

  function peterDecide(ctx) {
    const { hand, community: comm, toCall, myChips, street: st, handNum: hn } = ctx;
    const pr = preflopRank(hand);
    const hs = handStrength(hand, comm);
    if (st === 'preflop') {
      if (pr >= 8) return { action: 'raise', amount: safeRaise(Math.min(BIG_BLIND * 3, myChips), myChips, hn) };
      if (pr >= 6) return toCall <= BIG_BLIND * 2 ? { action: 'call' } : { action: 'fold' };
      return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    }
    if (hs < 0.45) return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    if (hs < 0.65) return toCall > 0 ? { action: 'call' } : { action: 'check' };
    const amt = safeRaise(Math.min(Math.floor(pot * 0.75), myChips), myChips, hn);
    // Peter (rock) never goes all-in - too conservative
    return { action: 'raise', amount: amt };
  }

  function jonDecide(ctx) {
    const { hand, community: comm, toCall, pot: p, myChips, street: st, handNum: hn } = ctx;
    const pr = preflopRank(hand);
    const hs = handStrength(hand, comm);
    const oc = outCount(hand, comm);
    const equity = hs + oc * 0.035;
    if (st === 'preflop') {
      if (pr >= 8) return { action: 'raise', amount: safeRaise(Math.min(Math.floor(BIG_BLIND * 2.5), myChips), myChips, hn) };
      if (pr >= 5) return toCall <= BIG_BLIND * 2 ? { action: 'call' } : { action: 'fold' };
      return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    }
    const needed = potOdds(toCall, p);
    if (equity < needed) return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    if (equity > 0.65) {
      // Last hand with very strong equity: go all-in
      if (hn === 2 && equity > 0.80) return { action: 'allin' };
      const amt = safeRaise(Math.min(Math.floor(p * 0.75), myChips), myChips, hn);
      return { action: 'raise', amount: amt };
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  function calebDecide(ctx) {
    const { hand, community: comm, toCall, myChips, street: st, rand, handNum: hn } = ctx;
    const pr = preflopRank(hand);
    const oc = outCount(hand, comm);
    const hs = handStrength(hand, comm);
    if (st === 'preflop') {
      const suited = hand.length >= 2 && hand[0].suit === hand[1].suit;
      if (suited || pr >= 4) return toCall > 0 ? { action: 'call' } : { action: 'check' };
      if (rand() < 0.55) return toCall > 0 ? { action: 'call' } : { action: 'check' };
      return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    }
    if (st === 'river') {
      if (oc === 0 && hs < 0.35) return rand() < 0.20 ? { action: 'raise', amount: safeRaise(Math.min(Math.floor(pot * 0.4), myChips), myChips, hn) } : (toCall > 0 ? { action: 'fold' } : { action: 'check' });
    }
    if (oc >= 8) {
      // Last hand: go all-in on a strong flush/straight draw
      if (hn === 2) return { action: 'allin' };
      const amt = safeRaise(Math.min(Math.floor(pot * 0.6), myChips), myChips, hn);
      return { action: 'raise', amount: amt };
    }
    if (oc >= 4) return toCall > 0 ? { action: 'call' } : { action: 'check' };
    if (hs < 0.35) return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  function mandyDecide(ctx) {
    const { hand, community: comm, toCall, pot: p, myChips, street: st, rand, handNum: hn } = ctx;
    const pr = preflopRank(hand);
    const hs = handStrength(hand, comm);
    const oc = outCount(hand, comm);
    const equity = hs + oc * 0.035;
    if (st === 'preflop') {
      if (pr >= 7) return { action: 'raise', amount: safeRaise(Math.min(BIG_BLIND * 3, myChips), myChips, hn) };
      if (pr >= 4) return toCall <= BIG_BLIND * 2 ? { action: 'call' } : { action: 'fold' };
      return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    }
    const needed = potOdds(toCall, p);
    if (rand() < 0.40 && equity > 0.40) {
      const amt = safeRaise(Math.min(Math.floor(p * 0.65), myChips), myChips, hn);
      return { action: 'raise', amount: amt };
    }
    if (equity < needed && toCall > 0) return { action: 'fold' };
    if (equity > 0.70) {
      // Last hand with strong hand: go all-in
      if (hn === 2) return { action: 'allin' };
      const amt = safeRaise(Math.min(Math.floor(p * 0.75), myChips), myChips, hn);
      return { action: 'raise', amount: amt };
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  function madelynDecide(ctx) {
    // Completely random - ignores all card info
    const { toCall, myChips, rand, handNum: hn } = ctx;
    const r = rand();
    if (r < 0.22) return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    if (r < 0.55) return toCall > 0 ? { action: 'call' } : { action: 'check' };
    if (r < 0.80) {
      const amt = safeRaise(Math.min(Math.floor(myChips * (0.1 + rand() * 0.5)), myChips), myChips, hn);
      return { action: 'raise', amount: Math.max(amt, 1) };
    }
    // All-in only available on last hand
    if (hn === 2) return { action: 'allin' };
    const amt = safeRaise(Math.min(Math.floor(myChips * 0.6), myChips), myChips, hn);
    return { action: 'raise', amount: Math.max(amt, 1) };
  }

  function joshDecide(ctx) {
    // Semi-bluffer: mostly sensible play with occasional bluffs
    const { hand, community: comm, toCall, pot: p, myChips, street: st, rand, handNum: hn } = ctx;
    const pr     = preflopRank(hand);
    const hs     = handStrength(hand, comm);
    const needed = potOdds(toCall, p);

    if (st === 'preflop') {
      // Play decent hands, fold weak ones, bluff ~15% of the time
      if (pr >= 6) return { action: 'raise', amount: safeRaise(Math.min(BIG_BLIND * 2, myChips), myChips, hn) };
      if (pr >= 3) return toCall <= BIG_BLIND * 3 ? { action: 'call' } : { action: 'fold' };
      if (rand() < 0.15) return { action: 'raise', amount: safeRaise(Math.min(BIG_BLIND * 2, myChips), myChips, hn) };
      return toCall > 0 ? { action: 'fold' } : { action: 'check' };
    }

    // Post-flop: ~18% bluff, otherwise stay in when odds are decent
    const r = rand();
    if (r < 0.18) {
      const amt = safeRaise(Math.min(Math.floor(p * 0.5), myChips), myChips, hn);
      if (hn === 2 && amt >= myChips * 0.85) return { action: 'allin' };
      return { action: 'raise', amount: Math.max(amt, BIG_BLIND) };
    }
    if (hs < needed && toCall > 0) return { action: 'fold' };
    if (hs > 0.60) {
      if (hn === 2 && hs > 0.75) return { action: 'allin' };
      const amt = safeRaise(Math.min(Math.floor(p * 0.55), myChips), myChips, hn);
      return { action: 'raise', amount: Math.max(amt, BIG_BLIND) };
    }
    return toCall > 0 ? { action: 'call' } : { action: 'check' };
  }

  const AI_DECIDE = [
    davidDecide,   // 0: David   (bluffer)
    peterDecide,   // 1: Peter   (rock)
    jonDecide,     // 2: Jon     (math)
    calebDecide,   // 3: Caleb   (draw chaser)
    mandyDecide,   // 4: Mandy   (balanced)
    madelynDecide, // 5: Madelyn (random)
    joshDecide,    // 6: Josh    (semi-bluffer)
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
    wrap.dataset.rank = card.rank;
    wrap.dataset.suit = card.suit;

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
    if (cardsEl) {
      cardsEl.textContent = '';
      cardsEl.classList.remove('hd-cards-folded');
    }

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

  /* ── Live hand label + card highlighting ── */
  const PREFLOP_RANK_NAMES = {
    '2':'Twos','3':'Threes','4':'Fours','5':'Fives','6':'Sixes',
    '7':'Sevens','8':'Eights','9':'Nines','10':'Tens',
    'J':'Jacks','Q':'Queens','K':'Kings','A':'Aces',
  };

  function clearHandHighlights() {
    document.querySelectorAll('.hd-card-highlight').forEach(el => el.classList.remove('hd-card-highlight'));
  }

  function clearPlayerHandDisplay() {
    const el = $('hd-player-hand-label');
    if (el) el.textContent = '';
    clearHandHighlights();
  }

  function updatePlayerHandDisplay() {
    const labelEl = $('hd-player-hand-label');
    if (!labelEl || playerHole.length < 2) {
      clearPlayerHandDisplay();
      return;
    }

    clearHandHighlights();

    let label, winCards;
    const total = playerHole.length + community.length;

    if (total < 5) {
      // Pre-flop: only 2 cards, evaluate manually
      const [c1, c2] = playerHole;
      if (c1.rank === c2.rank) {
        label    = 'Pair of ' + (PREFLOP_RANK_NAMES[c1.rank] || c1.rank);
        winCards = [c1, c2];
      } else {
        const hc = RANK_VAL[c1.rank] >= RANK_VAL[c2.rank] ? c1 : c2;
        label    = hc.rank + ' high';
        winCards = [hc];
      }
    } else {
      const result = evalBestWithCards(playerHole, community);
      label    = result.label;
      winCards = getRelevantCards(result.cards);
    }

    labelEl.textContent = label;

    // Highlight contributing cards - scope to player area + community only
    const searchEls = [];
    const pc = $('hd-player-cards');
    if (pc) pc.querySelectorAll('.hd-card[data-rank]').forEach(el => searchEls.push(el));
    for (let i = 0; i < 5; i++) {
      const slot = $('hd-comm-' + i);
      if (slot) slot.querySelectorAll('.hd-card[data-rank]').forEach(el => searchEls.push(el));
    }
    searchEls.forEach(el => {
      if (winCards.some(c => c.rank === el.dataset.rank && c.suit === el.dataset.suit)) {
        el.classList.add('hd-card-highlight');
      }
    });
  }

  /* ── Guide modal ── */
  function showGuide()  { const m = $('hd-guide-modal'); if (m) m.classList.remove('hidden'); }
  function closeGuide() { const m = $('hd-guide-modal'); if (m) m.classList.add('hidden'); }

  /* ── Madelyn peek (1% chance her cards flash face-up before action) ── */
  function maybeShowMadelynPeek(callback) {
    const mIdx = todayAIs.findIndex(ai => ai.def.id === 6);
    if (mIdx === -1 || Math.random() >= 0.01) { callback(); return; }

    // Flip Madelyn's cards face-up and show chat bubble
    renderAICards(todayAIs[mIdx], mIdx, true);
    const seat = $('hd-ai-seat-' + mIdx);
    if (seat) {
      const bubble = document.createElement('div');
      bubble.className = 'hd-chat-bubble';
      bubble.id = 'hd-madelyn-bubble';
      bubble.textContent = 'Is this good??';
      seat.appendChild(bubble);
    }

    // After 2.4 s, hide bubble and flip cards back
    setTimeout(() => {
      const b = $('hd-madelyn-bubble');
      if (b) {
        b.classList.add('hd-chat-bubble-out');
        setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 300);
      }
      setTimeout(() => {
        renderAICards(todayAIs[mIdx], mIdx, false);
        callback();
      }, 350);
    }, 2400);
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

    // Fold is always available
    if (foldBtn) { foldBtn.classList.remove('hidden'); foldBtn.textContent = 'Fold'; }
    if (toCall > 0) {
      if (callBtn)  { callBtn.classList.remove('hidden');  callBtn.textContent = 'Call ' + toCall; }
      if (checkBtn) checkBtn.classList.add('hidden');
    } else {
      if (callBtn)  callBtn.classList.add('hidden');
      if (checkBtn) checkBtn.classList.remove('hidden');
    }
    // Hide raise when cap is reached or player can't afford it
    if (raiseBtn) {
      const canRaise = streetRaiseCount < 2 && chips > toCall;
      raiseBtn.classList.toggle('hidden', !canRaise);
    }
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

    // Reset chip button states; disable denominations the player can't afford
    document.querySelectorAll('.hd-bet-chip').forEach(btn => {
      btn.classList.remove('hd-bet-chip--active');
      const amt = parseInt(btn.dataset.amount, 10);
      btn.disabled = amt > chips;
    });
    const dealBtn = $('hd-bet-deal');
    if (dealBtn) dealBtn.disabled = true;

    const indEl = $('hd-hand-indicator');
    if (indEl) indEl.textContent = 'Hand ' + (handNum + 1) + ' of ' + HANDS_PER_DAY;

    setStreetLabel('');
    clearCommunityCards();
    clearPlayerHandDisplay();
    updatePot();
    $('hd-pot').textContent = '';

    // Clear AI seats
    todayAIs.forEach((ai, i) => renderAISeat(ai, i));

    // Hide player cards
    const pc = $('hd-player-cards');
    if (pc) pc.textContent = '';
  }

  function selectBet(amount) {
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt > chips) return;
    pendingBet = amt;
    // Toggle active state on chip buttons
    document.querySelectorAll('.hd-bet-chip').forEach(btn => {
      btn.classList.toggle('hd-bet-chip--active', parseInt(btn.dataset.amount, 10) === amt);
    });
    const dealBtn = $('hd-bet-deal');
    if (dealBtn) dealBtn.disabled = false;
  }

  function clearBetSelection() {
    pendingBet = 0;
    document.querySelectorAll('.hd-bet-chip').forEach(btn => btn.classList.remove('hd-bet-chip--active'));
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

    // Reset per-hand AI state - chips persist across hands within the day
    todayAIs.forEach(ai => {
      ai.hole      = [];
      ai.folded    = ai.chips <= 0; // busted AI sits out
      ai.allIn     = false;
      ai.streetBet = 0;
      ai.totalBet  = 0;
    });

    // Re-init seeded rng for this hand
    dailyRng = mulberry32(dateToSeed(chicagoDate()) + handNum * 1000);

    // Create and shuffle deck
    deck = shuffleDeck(createDeck());

    // Player antes their chosen amount
    chips           -= pendingBet;
    pot              = pendingBet;
    playerStreetBet  = pendingBet;
    currentStreetBet = pendingBet;

    // All active AIs must match the ante (mandatory buy-in)
    todayAIs.forEach(ai => {
      if (!ai.folded) {
        const ante    = Math.min(pendingBet, ai.chips);
        ai.chips     -= ante;
        ai.streetBet  = ante;
        ai.totalBet   = ante;
        pot          += ante;
        if (ai.chips === 0) ai.allIn = true;
      }
    });

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
    updateChipDisplay();
    setStreetLabel('PRE-FLOP');

    // Deal cards one at a time in poker order, then begin the street
    dealHoleCardsSequentially(() => {
      updatePlayerHandDisplay();
      maybeShowMadelynPeek(() => beginStreet('preflop'));
    });
  }

  /* Pre-flop: player acts last (button) - AIs act first */
  function beginStreet(st) {
    street = st;
    streetRaiseCount = 0;
    if (st !== 'preflop') {
      // Post-flop streets: everyone starts fresh at 0
      currentStreetBet = 0;
      playerStreetBet  = 0;
    }
    // On preflop, currentStreetBet/playerStreetBet/ai.streetBet are already set
    // from the ante posted in startHand() — don't reset them.
    todayAIs.forEach((ai, i) => {
      if (st !== 'preflop') {
        ai.streetBet = 0;
        const seat = $('hd-ai-seat-' + i);
        if (seat) {
          const el = seat.querySelector('.hd-ai-action');
          if (el) el.textContent = '';
        }
      }
    });

    const activePlayers = todayAIs.filter(a => !a.folded && !a.allIn);
    if (activePlayers.length === 0) {
      // All AIs folded or all-in
      if (playerFolded) {
        doShowdown();
      } else {
        const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
        showActions(Math.max(toCall, 0));
      }
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
      if (playerFolded) {
        runAIActions(advanceStreet);
        return;
      }
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
      // If only 1 participant remains in total (player folded + 1 AI left),
      // there's nobody to bet against — end AI actions immediately
      const remainingAIs = active.slice(i).filter(a => !a.folded && !a.allIn).length;
      const totalLeft    = remainingAIs + (playerFolded ? 0 : 1);
      if (totalLeft <= 1) {
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
        handNum:   handNum,   // 0 = hand 1, 1 = hand 2, 2 = hand 3 (last)
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
    // Enforce 2-raise-per-street cap: downgrade raise/allin to call or check
    if (streetRaiseCount >= 2 && (dec.action === 'raise' || dec.action === 'allin')) {
      const owed = Math.max(currentStreetBet - ai.streetBet, 0);
      dec = owed > 0 ? { action: 'call' } : { action: 'check' };
    }
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
        let raiseAmt = dec.amount || BIG_BLIND * 2;
        // Hand 1: cap AI raises at half the pot (min 2×BB to keep it meaningful)
        if (handNum === 0) raiseAmt = Math.min(raiseAmt, Math.max(Math.floor(pot * 0.5), BIG_BLIND * 2));
        raiseAmt = Math.min(raiseAmt, ai.chips);
        const extra = raiseAmt - ai.streetBet; // extra beyond what's already in
        const paid  = Math.min(extra, ai.chips);
        ai.chips         -= paid;
        ai.streetBet     += paid;
        ai.totalBet      += paid;
        pot              += paid;
        currentStreetBet  = Math.max(currentStreetBet, ai.streetBet);
        streetRaiseCount++;
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
        streetRaiseCount++;
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
    // Let the hand play out - AIs will finish their streets and go to showdown
    proceedAfterPlayerAction();
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
    streetRaiseCount++;
    if (chips === 0) { /* player all-in */ }

    updateChipDisplay();
    updatePot();
    proceedAfterPlayerAction();
  }

  /* After player acts, let remaining AIs respond, then advance street */
  function proceedAfterPlayerAction() {
    if (street !== 'preflop') {
      // Post-flop: player acted first, now let AIs respond
      runAIActions(function() {
        if (playerFolded) { advanceStreet(); return; }
        // If an AI raised, player needs to respond before advancing
        const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
        if (toCall > 0) {
          actionLocked = false;
          showActions(toCall);
        } else {
          advanceStreet();
        }
      });
    } else {
      // Pre-flop: player acted last (button position)
      // If player raised, any AI whose streetBet < currentStreetBet must respond
      const aisNeedAct = todayAIs.some(ai => !ai.folded && !ai.allIn && ai.streetBet < currentStreetBet);
      if (aisNeedAct) {
        runAIActions(function() {
          // After AIs respond, check if an AI re-raised - player must respond again
          if (!playerFolded && currentStreetBet > playerStreetBet) {
            const toCall = Math.min(currentStreetBet - playerStreetBet, chips);
            actionLocked = false;
            showActions(toCall);
          } else {
            advanceStreet();
          }
        });
      } else {
        advanceStreet();
      }
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
      dealFlop(() => { updatePlayerHandDisplay(); beginStreet('flop'); });
    } else if (street === 'flop') {
      community.push(drawCard());
      renderCommunityCard(3, community[3]);
      setStreetLabel('TURN');
      street = 'turn';
      setTimeout(() => { updatePlayerHandDisplay(); beginStreet('turn'); }, 420);
    } else if (street === 'turn') {
      community.push(drawCard());
      renderCommunityCard(4, community[4]);
      setStreetLabel('RIVER');
      street = 'river';
      setTimeout(() => { updatePlayerHandDisplay(); beginStreet('river'); }, 420);
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
          // Show hand name under the AI's action label
          setAIAction(i, res.label);
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
      setTimeout(() => finishHand(playerNet, playerNet > 0 ? 'win' : playerNet < 0 ? 'lose' : 'push'), 4000);
    }, delay + 200);
  }

  function finishHand(net, type) {
    updateAllTime(net);
    recordAIStats(type);
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

    // Per-AI head-to-head breakdown
    const aiSec = $('hd-ai-stats-section');
    if (aiSec) {
      aiSec.textContent = '';
      const aiStats = loadAIStats();
      const hasAny  = Object.keys(aiStats).length > 0;
      if (hasAny) {
        const title = document.createElement('p');
        title.textContent = 'Head-to-Head';
        title.style.cssText = 'font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;';
        aiSec.appendChild(title);

        const table = document.createElement('div');
        table.style.cssText = 'display:grid;grid-template-columns:1fr auto auto auto auto;gap:2px 8px;align-items:center;';

        // Header row
        ['', 'W', 'L', 'F', 'Win%'].forEach((h, ci) => {
          const hd = document.createElement('span');
          hd.textContent = h;
          hd.style.cssText = 'font-size:9px;font-weight:700;color:#6b7280;text-align:' + (ci === 0 ? 'left' : 'center') + ';padding-bottom:3px;';
          table.appendChild(hd);
        });

        AI_DEFS.forEach(def => {
          const rec = aiStats[String(def.id)] || { w:0, l:0, f:0 };
          const total = rec.w + rec.l + rec.f;
          if (total === 0) return; // never faced this AI, skip
          const pct = total > 0 ? Math.round((rec.w / total) * 100) : 0;
          const pctColor = pct >= 60 ? '#4ade80' : pct >= 40 ? '#facc15' : '#f87171';

          const nameEl = document.createElement('span');
          nameEl.textContent = def.name;
          nameEl.style.cssText = 'font-size:11px;font-weight:700;color:#e5e7eb;';
          table.appendChild(nameEl);

          [[rec.w, '#4ade80'], [rec.l, '#f87171'], [rec.f, '#9ca3af']].forEach(([val, col]) => {
            const cell = document.createElement('span');
            cell.textContent = val;
            cell.style.cssText = 'font-size:11px;font-weight:700;color:' + col + ';text-align:center;';
            table.appendChild(cell);
          });

          const pctEl = document.createElement('span');
          pctEl.textContent = pct + '%';
          pctEl.style.cssText = 'font-size:11px;font-weight:700;color:' + pctColor + ';text-align:center;';
          table.appendChild(pctEl);
        });

        aiSec.appendChild(table);
      }
    }

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

    // Restore AI chips from saved state (same day) or start fresh at 1000
    if (today && today.aiChips) {
      today.aiChips.forEach((c, i) => { if (todayAIs[i]) todayAIs[i].chips = c; });
    }

    // Render AI seat names early
    todayAIs.forEach((ai, i) => {
      const seat    = $('hd-ai-seat-' + i);
      if (!seat) return;
      const nameEl  = seat.querySelector('.hd-ai-name');
      const chipsEl = seat.querySelector('.hd-ai-chips');
      if (nameEl)  nameEl.textContent  = ai.def.name;
      if (chipsEl) chipsEl.textContent = ai.chips.toLocaleString() + ' chips';
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
      btn.addEventListener('click', () => selectBet(btn.dataset.amount));
    });
    const dealBtn = $('hd-bet-deal');
    if (dealBtn) dealBtn.addEventListener('click', startHand);

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
    const guideBtn = $('hd-guide-btn');
    if (helpBtn)  helpBtn.addEventListener('click', showModal);
    if (statsBtn) statsBtn.addEventListener('click', showStats);
    if (guideBtn) guideBtn.addEventListener('click', showGuide);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeStats();
        closeGuide();
        const dm = $('hd-daily-modal');
        if (dm) dm.classList.add('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { showModal, closeModal, showStats, closeStats, shareResults, shareBrokeResults, shareStats, showGuide, closeGuide };
})();
