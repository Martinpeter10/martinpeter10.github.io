/* ── BlackJackdle - DailyJamm ────────────────────────────────────── */
const BJGame = (function () {
  'use strict';

  /* ── Constants ── */
  const HANDS_PER_DAY = 3;
  const STARTING_CHIPS = 1000;
  const DAILY_BONUS_MIN = 50;
  const DAILY_BONUS_MAX = 100;
  const DEAL_DELAY = 250;      // ms between each card dealt
  const FLIP_DELAY = 400;
  const RESULT_DELAY = 600;

  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
  const SUIT_COLORS = { hearts: '#ef4444', diamonds: '#ef4444', clubs: '#1a1a2e', spades: '#1a1a2e' };

  /* ── State ── */
  let chips = STARTING_CHIPS;
  let currentBet = 0;
  let handNum = 0;           // 0-indexed, 0..2
  let deck = [];
  let dealerHand = [];
  let playerHand = [];
  let splitHand = null;       // null unless splitting
  let activeSplitHand = 0;   // 0 = main hand, 1 = split hand
  let handOver = false;
  let sessionResults = [];    // [{result, net}]
  let dailyDone = false;

  /* ── DOM refs ── */
  const $ = (id) => document.getElementById(id);
  let els = {};

  /* ── Chicago date helper (DST-safe) ── */
  function chicagoDate() {
    const s = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    return s; // 'YYYY-MM-DD'
  }
  function chicagoMidnight() {
    const now = new Date();
    const chi = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const tomorrow = new Date(chi);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const diff = tomorrow - chi;
    return Date.now() + diff;
  }

  /* ── LocalStorage ── */
  function loadStats() {
    try { return JSON.parse(localStorage.getItem('bj_stats')) || { streak: 0, best: 0, played: 0 }; }
    catch { return { streak: 0, best: 0, played: 0 }; }
  }
  function saveStats(s) { localStorage.setItem('bj_stats', JSON.stringify(s)); }

  function loadToday() {
    try {
      const d = JSON.parse(localStorage.getItem('bj_today'));
      if (d && d.date === chicagoDate()) return d;
    } catch {}
    return null;
  }
  function saveToday() {
    localStorage.setItem('bj_today', JSON.stringify({
      date: chicagoDate(),
      chips,
      handNum,
      results: sessionResults,
      done: dailyDone
    }));
  }

  function loadChips() {
    try {
      const c = JSON.parse(localStorage.getItem('bj_chips'));
      if (c !== null && typeof c === 'number') return c;
    } catch {}
    return STARTING_CHIPS;
  }
  function saveChips() { localStorage.setItem('bj_chips', JSON.stringify(chips)); }

  /* ── Deck ── */
  function createDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
    return d;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function drawCard() { return deck.pop(); }

  /* ── Hand value ── */
  function handValue(hand) {
    let total = 0, aces = 0;
    for (const c of hand) {
      if (c.rank === 'A') { aces++; total += 11; }
      else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
      else total += parseInt(c.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }
  function isSoft(hand) {
    let total = 0, aces = 0;
    for (const c of hand) {
      if (c.rank === 'A') { aces++; total += 11; }
      else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
      else total += parseInt(c.rank);
    }
    // soft means at least one ace still counted as 11
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return aces > 0;
  }
  function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
  }
  function isBust(hand) { return handValue(hand) > 21; }
  function canSplit(hand) {
    if (hand.length !== 2 || splitHand !== null) return false;
    const v1 = hand[0].rank === 'A' ? 11 : (['K','Q','J'].includes(hand[0].rank) ? 10 : parseInt(hand[0].rank));
    const v2 = hand[1].rank === 'A' ? 11 : (['K','Q','J'].includes(hand[1].rank) ? 10 : parseInt(hand[1].rank));
    return v1 === v2 && chips >= currentBet;
  }

  /* ── Card rendering ── */
  function cardHTML(card, faceDown) {
    if (faceDown) {
      return '<div class="bj-card bj-card-back"><div class="bj-card-back-pattern"></div></div>';
    }
    const color = SUIT_COLORS[card.suit];
    const sym = SUIT_SYMBOLS[card.suit];
    return '<div class="bj-card bj-card-front" style="color:' + color + '">' +
      '<div class="bj-card-corner bj-card-tl"><span class="bj-card-rank">' + card.rank + '</span><span class="bj-card-suit">' + sym + '</span></div>' +
      '<div class="bj-card-center">' + sym + '</div>' +
      '<div class="bj-card-corner bj-card-br"><span class="bj-card-rank">' + card.rank + '</span><span class="bj-card-suit">' + sym + '</span></div>' +
      '</div>';
  }

  function renderHand(container, hand, hideFirst, hideAll) {
    container.innerHTML = '';
    hand.forEach((card, i) => {
      const faceDown = hideAll || (hideFirst && i === 1);
      const el = document.createElement('div');
      el.className = 'bj-card-slot bj-card-dealt';
      el.innerHTML = cardHTML(card, faceDown);
      el.style.animationDelay = (i * 0.08) + 's';
      container.appendChild(el);
    });
  }

  function renderDealer(hideHole) {
    renderHand(els.dealerCards, dealerHand, hideHole, false);
    if (hideHole) {
      els.dealerScore.textContent = handValue([dealerHand[0]]);
    } else {
      els.dealerScore.textContent = handValue(dealerHand);
    }
    els.dealerScore.classList.remove('hidden');
  }

  function renderPlayer() {
    renderHand(els.playerCards, playerHand, false, false);
    els.playerScore.textContent = handValue(playerHand);
    els.playerScore.classList.remove('hidden');
  }

  function renderSplit() {
    if (!splitHand) return;
    els.splitArea.classList.remove('hidden');
    renderHand(els.splitCards, splitHand, false, false);
    els.splitScore.textContent = handValue(splitHand);
    els.splitScore.classList.remove('hidden');

    // Highlight active hand
    els.playerCards.parentElement.classList.toggle('bj-hand-active', activeSplitHand === 0);
    els.splitArea.classList.toggle('bj-hand-active', activeSplitHand === 1);
  }

  /* ── Deal animation ── */
  function animateDeal(callback) {
    const deckEl = $('bj-deck');
    deckEl.classList.add('bj-dealing');

    // Deal 4 cards sequentially: player, dealer, player, dealer
    const order = ['player', 'dealer', 'player', 'dealer'];
    let i = 0;
    let pIdx = 0, dIdx = 0;

    function dealNext() {
      if (i >= order.length) {
        deckEl.classList.remove('bj-dealing');
        if (callback) callback();
        return;
      }
      const target = order[i];
      const container = target === 'player' ? els.playerCards : els.dealerCards;
      const hand = target === 'player' ? playerHand : dealerHand;
      const idx = target === 'player' ? pIdx++ : dIdx++;
      const faceDown = target === 'dealer' && idx === 1;

      // Create flying card
      const fly = document.createElement('div');
      fly.className = 'bj-card-fly';
      fly.innerHTML = cardHTML(hand[idx], faceDown);
      deckEl.appendChild(fly);

      // Get target position
      const deckRect = deckEl.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const slotWidth = 70;
      const existingCards = container.children.length;
      const targetX = contRect.left + (existingCards * (slotWidth * 0.45)) - deckRect.left;
      const targetY = contRect.top - deckRect.top;

      fly.style.setProperty('--fly-x', targetX + 'px');
      fly.style.setProperty('--fly-y', targetY + 'px');
      fly.classList.add('bj-fly-anim');

      setTimeout(() => {
        fly.remove();
        // Add card to the actual container
        const slot = document.createElement('div');
        slot.className = 'bj-card-slot bj-card-dealt';
        slot.innerHTML = cardHTML(hand[idx], faceDown);
        container.appendChild(slot);

        // Update scores
        if (target === 'player') {
          els.playerScore.textContent = handValue(playerHand.slice(0, pIdx));
          els.playerScore.classList.remove('hidden');
        } else {
          els.dealerScore.textContent = handValue([dealerHand[0]]);
          els.dealerScore.classList.remove('hidden');
        }

        i++;
        setTimeout(dealNext, DEAL_DELAY);
      }, 350);
    }

    // Clear card areas
    els.dealerCards.innerHTML = '';
    els.playerCards.innerHTML = '';
    els.dealerScore.classList.add('hidden');
    els.playerScore.classList.add('hidden');

    setTimeout(dealNext, 200);
  }

  /* ── Single card animation (hit / double / dealer draw) ── */
  function animateSingleCard(card, container, faceDown, callback) {
    const deckEl = $('bj-deck');
    const fly = document.createElement('div');
    fly.className = 'bj-card-fly';
    fly.innerHTML = cardHTML(card, faceDown);
    deckEl.appendChild(fly);

    const deckRect = deckEl.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const slotWidth = 70;
    const existingCards = container.children.length;
    const targetX = contRect.left + (existingCards * (slotWidth * 0.45)) - deckRect.left;
    const targetY = contRect.top - deckRect.top;

    fly.style.setProperty('--fly-x', targetX + 'px');
    fly.style.setProperty('--fly-y', targetY + 'px');
    fly.classList.add('bj-fly-anim');

    setTimeout(() => {
      fly.remove();

      // FLIP: freeze existing slots before measuring — clears any lingering
      // animation or transform state (e.g. from the hole-card flip) so they
      // won't interfere with the slide.
      const existingSlots = Array.from(container.children);
      existingSlots.forEach(s => {
        s.style.transition = 'none';
        s.style.transform   = 'none';
        s.style.animation   = 'none';
      });
      void container.offsetHeight; // flush before measuring

      const before = existingSlots.map(s => s.getBoundingClientRect().left);

      // Append new card — no entrance animation; card already arrived via fly
      const slot = document.createElement('div');
      slot.className = 'bj-card-slot';
      slot.innerHTML = cardHTML(card, faceDown);
      container.appendChild(slot);

      // Counteract the flex-recentering shift instantly
      existingSlots.forEach((s, i) => {
        const dx = before[i] - s.getBoundingClientRect().left;
        if (Math.abs(dx) > 0.5) {
          s.style.transform = `translateX(${dx}px)`;
        }
      });

      // Force reflow, then slide to final position
      void container.offsetHeight;
      existingSlots.forEach(s => {
        s.style.transition = 'transform 0.25s ease-out';
        s.style.transform   = 'none';
      });

      // Clean up after slide completes
      setTimeout(() => {
        existingSlots.forEach(s => {
          s.style.transition = '';
          s.style.transform   = '';
          s.style.animation   = '';
        });
        if (callback) callback();
      }, 260);
    }, 350);
  }

  /* ── Hole card flip (dealer reveal) ── */
  function flipHoleCard(callback) {
    const slots = els.dealerCards.querySelectorAll('.bj-card-slot');
    if (slots.length < 2) { if (callback) callback(); return; }
    const holeSlot = slots[1];
    holeSlot.classList.add('bj-flip-out');
    setTimeout(() => {
      holeSlot.innerHTML = cardHTML(dealerHand[1], false);
      holeSlot.classList.remove('bj-flip-out');
      holeSlot.classList.add('bj-flip-in');
      els.dealerScore.textContent = handValue(dealerHand);
      setTimeout(() => {
        holeSlot.classList.remove('bj-flip-in');
        if (callback) callback();
      }, 150);
    }, 150);
  }

  /* ── Chip display ── */
  function updateChipDisplay() {
    els.chips.textContent = chips.toLocaleString();
    els.currentBet.textContent = currentBet.toLocaleString();
  }

  /* ── Betting ── */
  function showBetting() {
    els.betArea.classList.remove('hidden');
    els.actions.classList.add('hidden');
    els.handResult.classList.add('hidden');
    els.betDisplay.classList.add('hidden');
    currentBet = 0;
    updateBetDisplay();
    updateBetButtons();
    els.handNum.textContent = 'Hand ' + (handNum + 1);

    // Clear previous hand cards
    els.dealerCards.innerHTML = '';
    els.playerCards.innerHTML = '';
    els.dealerScore.classList.add('hidden');
    els.playerScore.classList.add('hidden');
    els.splitArea.classList.add('hidden');
  }

  function updateBetDisplay() {
    $('bj-bet-amount').textContent = currentBet.toLocaleString();
    $('bj-bet-deal').disabled = currentBet === 0;
  }

  function updateBetButtons() {
    const btns = document.querySelectorAll('.bj-bet-chip');
    btns.forEach(b => {
      const amt = b.dataset.amount;
      if (amt === 'all') {
        b.disabled = chips === 0;
      } else {
        b.disabled = parseInt(amt) > chips - currentBet;
      }
    });
  }

  function addBet(amount) {
    if (amount === 'all') {
      currentBet = chips;
    } else {
      const a = parseInt(amount);
      if (currentBet + a > chips) return;
      currentBet += a;
    }
    updateBetDisplay();
    updateBetButtons();
  }

  function clearBet() {
    currentBet = 0;
    updateBetDisplay();
    updateBetButtons();
  }

  /* ── Game flow ── */
  function startHand() {
    els.betArea.classList.add('hidden');
    els.betDisplay.classList.remove('hidden');
    els.handResult.classList.add('hidden');
    splitHand = null;
    activeSplitHand = 0;
    els.splitArea.classList.add('hidden');
    handOver = false;

    // Deduct bet from chips upfront
    chips -= currentBet;
    updateChipDisplay();

    // Fresh deck each hand
    deck = shuffle(createDeck());
    playerHand = [drawCard(), drawCard()];
    dealerHand = [drawCard(), drawCard()];

    animateDeal(() => {
      // Check for blackjack
      if (isBlackjack(playerHand)) {
        if (isBlackjack(dealerHand)) {
          endHand('push');
        } else {
          endHand('blackjack');
        }
        return;
      }
      if (isBlackjack(dealerHand)) {
        endHand('dealer_blackjack');
        return;
      }
      showActions();
    });
  }

  function showActions() {
    els.actions.classList.remove('hidden');
    $('bj-btn-hit').disabled = false;
    $('bj-btn-stay').disabled = false;

    // Double: only on first two cards, must have enough chips
    const activeHand = activeSplitHand === 0 ? playerHand : splitHand;
    const canDouble = activeHand.length === 2 && chips >= currentBet;
    $('bj-btn-double').classList.toggle('hidden', !canDouble);

    // Split: only on initial hand, matching values, enough chips
    const showSplit = canSplit(playerHand) && activeSplitHand === 0;
    $('bj-btn-split').classList.toggle('hidden', !showSplit);
  }

  function playerHit() {
    const hand = activeSplitHand === 0 ? playerHand : splitHand;
    const newCard = drawCard();
    hand.push(newCard);
    const container = activeSplitHand === 0 ? els.playerCards : els.splitCards;

    els.actions.querySelectorAll('button').forEach(b => { b.disabled = true; });

    animateSingleCard(newCard, container, false, () => {
      if (activeSplitHand === 0) els.playerScore.textContent = handValue(playerHand);
      else els.splitScore.textContent = handValue(splitHand);

      if (isBust(hand)) {
        if (splitHand && activeSplitHand === 0) {
          activeSplitHand = 1;
          renderSplit();
          showActions();
        } else if (splitHand && activeSplitHand === 1) {
          resolveSplit();
        } else {
          endHand('bust');
        }
        return;
      }
      if (handValue(hand) === 21) {
        playerStay();
        return;
      }
      showActions();
    });
  }

  function playerStay() {
    if (splitHand && activeSplitHand === 0) {
      activeSplitHand = 1;
      renderSplit();
      showActions();
      return;
    }
    if (splitHand && activeSplitHand === 1) {
      resolveSplit();
      return;
    }
    els.actions.classList.add('hidden');
    dealerPlay(() => {
      const pv = handValue(playerHand);
      const dv = handValue(dealerHand);
      if (isBust(dealerHand)) endHand('win');
      else if (dv > pv) endHand('lose');
      else if (pv > dv) endHand('win');
      else endHand('push');
    });
  }

  function playerDouble() {
    chips -= currentBet;
    currentBet *= 2;
    updateChipDisplay();

    const hand = activeSplitHand === 0 ? playerHand : splitHand;
    const newCard = drawCard();
    hand.push(newCard);
    const container = activeSplitHand === 0 ? els.playerCards : els.splitCards;

    els.actions.querySelectorAll('button').forEach(b => { b.disabled = true; });

    animateSingleCard(newCard, container, false, () => {
      if (activeSplitHand === 0) els.playerScore.textContent = handValue(playerHand);
      else els.splitScore.textContent = handValue(splitHand);

      if (isBust(hand)) {
        if (splitHand && activeSplitHand === 0) {
          activeSplitHand = 1;
          renderSplit();
          showActions();
        } else if (splitHand && activeSplitHand === 1) {
          resolveSplit();
        } else {
          endHand('bust');
        }
        return;
      }
      playerStay();
    });
  }

  function playerSplit() {
    chips -= currentBet;
    updateChipDisplay();

    splitHand = [playerHand.pop()];
    playerHand.push(drawCard());
    splitHand.push(drawCard());

    activeSplitHand = 0;
    renderPlayer();
    renderSplit();
    showActions();
  }

  /* ── Dealer logic: hits soft 17 ── */
  function dealerPlay(callback) {
    // Flip hole card with animation, then start dealer draw loop
    flipHoleCard(() => {
      function dealerStep() {
        const dv = handValue(dealerHand);
        const soft = isSoft(dealerHand);
        if (dv < 17 || (dv === 17 && soft)) {
          setTimeout(() => {
            const newCard = drawCard();
            dealerHand.push(newCard);
            animateSingleCard(newCard, els.dealerCards, false, () => {
              els.dealerScore.textContent = handValue(dealerHand);
              dealerStep();
            });
          }, DEAL_DELAY + 200);
        } else {
          setTimeout(callback, RESULT_DELAY);
        }
      }
      setTimeout(dealerStep, FLIP_DELAY);
    });
  }

  function resolveSplit() {
    els.actions.classList.add('hidden');
    dealerPlay(() => {
      const dv = handValue(dealerHand);
      const db = isBust(dealerHand);
      let totalNet = 0;

      // Resolve main hand
      const pv = handValue(playerHand);
      const pb = isBust(playerHand);
      let r1, r2;
      if (pb) r1 = 'lose';
      else if (db) r1 = 'win';
      else if (dv > pv) r1 = 'lose';
      else if (pv > dv) r1 = 'win';
      else r1 = 'push';

      // Resolve split hand
      const sv = handValue(splitHand);
      const sb = isBust(splitHand);
      if (sb) r2 = 'lose';
      else if (db) r2 = 'win';
      else if (dv > sv) r2 = 'lose';
      else if (sv > dv) r2 = 'win';
      else r2 = 'push';

      // Calculate net (each hand has currentBet/2 effectively, but we bet full on each)
      const halfBet = currentBet / 2;
      if (r1 === 'win') totalNet += halfBet;
      else if (r1 === 'lose') totalNet -= halfBet;
      if (r2 === 'win') totalNet += halfBet;
      else if (r2 === 'lose') totalNet -= halfBet;

      chips += currentBet + totalNet;
      const result = totalNet > 0 ? 'win' : totalNet < 0 ? 'lose' : 'push';
      finishHand(result, totalNet);
    });
  }

  /* ── End hand ── */
  function endHand(result) {
    handOver = true;
    els.actions.classList.add('hidden');

    let net = 0;
    if (result === 'blackjack') {
      net = Math.floor(currentBet * 1.5);
      chips += currentBet + net;
    } else if (result === 'win') {
      net = currentBet;
      chips += currentBet * 2;
    } else if (result === 'push') {
      net = 0;
      chips += currentBet;
    } else if (result === 'bust' || result === 'lose' || result === 'dealer_blackjack') {
      net = -currentBet;
      // chips already reduced
    }

    // Reveal dealer hole card with flip animation
    flipHoleCard(() => finishHand(result, net));
  }

  function finishHand(result, net) {
    handOver = true;
    els.betDisplay.classList.add('hidden');
    updateChipDisplay();
    saveChips();

    sessionResults.push({ result, net });

    // Show result banner
    const msgs = {
      blackjack: 'BLACKJACK! +' + net.toLocaleString(),
      win: 'You Win! +' + net.toLocaleString(),
      push: 'Push - Bet Returned',
      lose: 'Dealer Wins. ' + net.toLocaleString(),
      bust: 'Bust! ' + net.toLocaleString(),
      dealer_blackjack: 'Dealer Blackjack! ' + net.toLocaleString()
    };
    const colors = {
      blackjack: 'bj-result-win',
      win: 'bj-result-win',
      push: 'bj-result-push',
      lose: 'bj-result-lose',
      bust: 'bj-result-lose',
      dealer_blackjack: 'bj-result-lose'
    };

    els.handResult.textContent = msgs[result] || result;
    els.handResult.className = 'bj-hand-result ' + (colors[result] || '');
    els.handResult.classList.remove('hidden');

    handNum++;
    saveToday();

    if (chips <= 0 && handNum < HANDS_PER_DAY) {
      setTimeout(showBrokeScreen, 1800);
    } else if (handNum >= HANDS_PER_DAY || chips <= 0) {
      setTimeout(showFinalResults, 1800);
    } else {
      setTimeout(() => {
        els.handResult.classList.add('hidden');
        showBetting();
      }, 2000);
    }
  }

  /* ── Final results ── */
  function showFinalResults() {
    dailyDone = true;
    saveToday();
    saveChips();

    const stats = loadStats();
    const totalNet = sessionResults.reduce((s, r) => s + r.net, 0);
    const won = totalNet >= 0;
    stats.played++;
    if (won) { stats.streak++; stats.best = Math.max(stats.best, stats.streak); }
    else { stats.streak = 0; }
    saveStats(stats);

    els.finalChips.textContent = chips.toLocaleString();

    const netEl = $('bj-session-net');
    if (totalNet > 0) {
      netEl.textContent = '+' + totalNet.toLocaleString() + ' today';
      netEl.className = 'text-sm font-bold mt-1 text-green-400';
    } else if (totalNet < 0) {
      netEl.textContent = totalNet.toLocaleString() + ' today';
      netEl.className = 'text-sm font-bold mt-1 text-red-400';
    } else {
      netEl.textContent = 'Even today';
      netEl.className = 'text-sm font-bold mt-1 text-yellow-300';
    }

    // Hand result dots
    const row = $('bj-hand-results-row');
    row.innerHTML = '';
    sessionResults.forEach((r, i) => {
      const dot = document.createElement('div');
      dot.className = 'bj-result-dot';
      const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : '' + r.net;
      dot.innerHTML = '<span class="text-lg">' + emoji + '</span><span>Hand ' + (i + 1) + '</span><span class="font-bold">' + label + '</span>';
      row.appendChild(dot);
    });

    $('bj-stat-streak').textContent = stats.streak;
    $('bj-stat-best').textContent = stats.best;
    $('bj-stat-played').textContent = stats.played;

    els.results.classList.remove('hidden');
    els.betArea.classList.add('hidden');
    els.actions.classList.add('hidden');
    els.handResult.classList.add('hidden');

    // Update hand indicator
    $('bj-hand-indicator').textContent = 'All hands played';

    startCountdown();
  }

  /* ── Share ── */
  function buildShareText() {
    const totalNet = sessionResults.reduce((s, r) => s + r.net, 0);
    const emojis = sessionResults.map(r => r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1').join('');
    const sign = totalNet >= 0 ? '+' : '';
    return 'BlackJackdle ' + chicagoDate() + '\n' +
      emojis + ' ' + sign + totalNet + ' chips\n' +
      'Stack: ' + chips.toLocaleString() + '\n' +
      'dailyjamm.com/blackjackdle/';
  }
  function shareResults() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(buildShareText()).then(() => {
        const btn = $('bj-share-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Share Results'; }, 2000);
      });
    }
  }
  function shareBrokeResults() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(buildShareText()).then(() => {
        const btn = $('bj-broke-share-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Share Results'; }, 2000);
      });
    }
  }

  /* ── Countdown ── */
  function startCountdown() {
    const el = $('bj-countdown');
    function tick() {
      const target = chicagoMidnight();
      const diff = target - Date.now();
      if (diff <= 0) { el.textContent = '00:00:00'; return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ── Broke screen (ran out mid-session) ── */
  function showBrokeScreen() {
    dailyDone = true;
    saveToday();
    saveChips();

    const stats = loadStats();
    stats.played++;
    stats.streak = 0;
    saveStats(stats);

    // Show hand results in broke panel
    const row = $('bj-broke-hands');
    row.innerHTML = '';
    sessionResults.forEach((r, i) => {
      const dot = document.createElement('div');
      dot.className = 'bj-result-dot';
      const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : '' + r.net;
      dot.innerHTML = '<span class="text-lg">' + emoji + '</span><span>Hand ' + (i + 1) + '</span><span class="font-bold">' + label + '</span>';
      row.appendChild(dot);
    });

    $('bj-broke').classList.remove('hidden');
    els.betArea.classList.add('hidden');
    els.actions.classList.add('hidden');
    els.handResult.classList.add('hidden');
    $('bj-hand-indicator').textContent = 'Out of chips';

    // Start countdown on broke screen
    const el = $('bj-broke-countdown');
    function tick() {
      const target = chicagoMidnight();
      const diff = target - Date.now();
      if (diff <= 0) { el.textContent = '00:00:00'; return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ── Modal ── */
  function showModal() { $('bj-modal').classList.remove('hidden'); }
  function closeModal() { $('bj-modal').classList.add('hidden'); localStorage.setItem('bj_seen_howto', '1'); }

  /* ── Daily welcome modal ── */
  function showDailyWelcome(callback) {
    const steps = (DAILY_BONUS_MAX - DAILY_BONUS_MIN) / 10 + 1;
    const bonus = DAILY_BONUS_MIN + Math.floor(Math.random() * steps) * 10;
    chips += bonus;
    saveChips();

    // Record that we gave the bonus today
    localStorage.setItem('bj_bonus_date', chicagoDate());

    $('bj-bonus-amount').textContent = '+' + bonus;
    $('bj-new-stack').textContent = chips.toLocaleString();
    $('bj-daily-modal').classList.remove('hidden');

    $('bj-daily-close').onclick = function () {
      $('bj-daily-modal').classList.add('hidden');
      updateChipDisplay();
      if (callback) callback();
    };
  }

  /* ── Init ── */
  function init() {
    els = {
      dealerCards: $('bj-dealer-cards'),
      dealerScore: $('bj-dealer-score'),
      playerCards: $('bj-player-cards'),
      playerScore: $('bj-player-score'),
      splitArea: $('bj-split-area'),
      splitCards: $('bj-split-cards'),
      splitScore: $('bj-split-score'),
      chips: $('bj-chips'),
      currentBet: $('bj-current-bet'),
      betArea: $('bj-bet-area'),
      betDisplay: $('bj-bet-display'),
      actions: $('bj-actions'),
      handResult: $('bj-hand-result'),
      results: $('bj-results'),
      finalChips: $('bj-final-chips'),
      handNum: $('bj-hand-num')
    };

    // Load persistent chips
    chips = loadChips();

    // Check if already played today
    const today = loadToday();
    const isFirstEverVisit = !localStorage.getItem('bj_seen_howto');
    const bonusDate = localStorage.getItem('bj_bonus_date');
    const needsBonus = !isFirstEverVisit && bonusDate !== chicagoDate();

    if (today && today.done) {
      // Already finished today - show results
      handNum = today.handNum;
      chips = today.chips;
      sessionResults = today.results || [];
      dailyDone = true;
      updateChipDisplay();
      if (chips <= 0 && handNum < HANDS_PER_DAY) {
        showBrokeScreen();
      } else {
        showFinalResults();
      }
    } else if (today && today.handNum > 0) {
      // Partial session restore
      handNum = today.handNum;
      chips = today.chips;
      sessionResults = today.results || [];
      updateChipDisplay();
      if (handNum >= HANDS_PER_DAY || chips <= 0) {
        if (chips <= 0 && handNum < HANDS_PER_DAY) {
          showBrokeScreen();
        } else {
          showFinalResults();
        }
      } else {
        showBetting();
      }
    } else {
      // New day - give daily bonus (if not first visit)
      if (isFirstEverVisit) {
        // First ever visit: give starting chips, show How to Play
        if (chips <= 0) chips = STARTING_CHIPS;
        localStorage.setItem('bj_bonus_date', chicagoDate());
        updateChipDisplay();
        showBetting();
        showModal();
      } else if (needsBonus) {
        // Returning player, new day: reset if broke, then give bonus
        if (chips <= 0) chips = STARTING_CHIPS;
        updateChipDisplay();
        showDailyWelcome(() => {
          showBetting();
        });
      } else {
        // Same day, no saved state (shouldn't happen often)
        if (chips <= 0) chips = STARTING_CHIPS;
        updateChipDisplay();
        showBetting();
      }
    }

    // Event listeners
    document.querySelectorAll('.bj-bet-chip').forEach(btn => {
      btn.addEventListener('click', () => addBet(btn.dataset.amount));
    });
    $('bj-bet-clear').addEventListener('click', clearBet);
    $('bj-bet-deal').addEventListener('click', startHand);
    $('bj-btn-hit').addEventListener('click', playerHit);
    $('bj-btn-stay').addEventListener('click', playerStay);
    $('bj-btn-double').addEventListener('click', playerDouble);
    $('bj-btn-split').addEventListener('click', playerSplit);
    $('bj-share-btn').addEventListener('click', shareResults);
    $('bj-help-btn').addEventListener('click', showModal);

    // ESC closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        $('bj-daily-modal').classList.add('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { closeModal, showModal, shareResults, shareBrokeResults };
})();
