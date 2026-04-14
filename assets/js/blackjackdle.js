/* ── BlackJackdle - DailyJamm ────────────────────────────────────── */
const BJGame = (function () {
  'use strict';

  /* ── Constants ── */
  const MS_PER_HOUR = 3600000;
  const MS_PER_MIN  = 60000;
  const MS_PER_SEC  = 1000;

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
  let splitBets = null;       // [mainBet, splitBet] when splitting, null otherwise
  let sessionResults = [];    // [{result, net}]
  let dailyDone = false;

  /* ── DOM refs ── */
  const $ = (id) => document.getElementById(id);
  let els = {};

  /* ── Chicago date helpers (via shared DJUtils) ── */
  const chicagoDate     = () => DJUtils.getChicagoDate();
  const chicagoMidnight = () => DJUtils.getChicagoMidnight();

  /* ── LocalStorage ── */
  function loadStats() {
    return DJUtils.loadJSON('bj_stats', { streak: 0, best: 0, played: 0 });
  }
  function saveStats(s) { DJUtils.saveJSON('bj_stats', s); }

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

  function loadAllTime() {
    try { return JSON.parse(localStorage.getItem('bj_alltime')) || { biggestWin: 0, biggestLoss: 0, totalNet: 0 }; }
    catch { return { biggestWin: 0, biggestLoss: 0, totalNet: 0 }; }
  }
  function updateAllTime(net) {
    const a = loadAllTime();
    if (net > 0 && net > a.biggestWin)  a.biggestWin  = net;
    if (net < 0 && net < a.biggestLoss) a.biggestLoss = net;
    a.totalNet += net;
    localStorage.setItem('bj_alltime', JSON.stringify(a));
  }

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
  function isPair(hand) {
    if (hand.length !== 2 || splitHand !== null) return false;
    const v1 = hand[0].rank === 'A' ? 11 : (['K','Q','J'].includes(hand[0].rank) ? 10 : parseInt(hand[0].rank));
    const v2 = hand[1].rank === 'A' ? 11 : (['K','Q','J'].includes(hand[1].rank) ? 10 : parseInt(hand[1].rank));
    return v1 === v2;
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

    els.dealerCards.innerHTML = '';
    els.playerCards.innerHTML = '';
    els.dealerScore.classList.add('hidden');
    els.playerScore.classList.add('hidden');

    const order = ['player', 'dealer', 'player', 'dealer'];
    let i = 0, pIdx = 0, dIdx = 0;

    function dealNext() {
      if (i >= order.length) {
        deckEl.classList.remove('bj-dealing');
        if (callback) callback();
        return;
      }
      const target    = order[i];
      const container = target === 'player' ? els.playerCards : els.dealerCards;
      const hand      = target === 'player' ? playerHand : dealerHand;
      const idx       = target === 'player' ? pIdx++ : dIdx++;
      const faceDown  = target === 'dealer' && idx === 1;

      const deckRect = deckEl.getBoundingClientRect();

      // Append real slot immediately — freeze it at deck position via transform.
      const slot = document.createElement('div');
      slot.className    = 'bj-card-slot';
      slot.innerHTML    = cardHTML(hand[idx], faceDown);
      slot.style.animation  = 'none';
      slot.style.transition = 'none';
      container.appendChild(slot);

      const slotRect = slot.getBoundingClientRect();
      const startDx  = deckRect.left - slotRect.left;
      const startDy  = deckRect.top  - slotRect.top;
      slot.style.transform = 'translate(' + startDx + 'px,' + startDy + 'px)';

      void slot.offsetHeight;

      slot.style.transition = 'transform 0.32s ease-out';
      slot.style.transform  = '';

      setTimeout(() => {
        slot.style.transition = '';
        slot.style.animation  = '';

        if (target === 'player') {
          els.playerScore.textContent = handValue(playerHand.slice(0, pIdx));
          els.playerScore.classList.remove('hidden');
        } else {
          els.dealerScore.textContent = handValue([dealerHand[0]]);
          els.dealerScore.classList.remove('hidden');
        }

        i++;
        setTimeout(dealNext, DEAL_DELAY);
      }, 340);
    }

    setTimeout(dealNext, 200);
  }

  /* ── Single card animation (hit / double / dealer draw) ── */
  function animateSingleCard(card, container, faceDown, callback) {
    const deckEl  = $('bj-deck');
    const deckRect = deckEl.getBoundingClientRect();

    // Snapshot existing card positions before the new slot shifts the flex layout.
    const existingSlots = Array.from(container.children);
    const beforeLeft = existingSlots.map(s => s.getBoundingClientRect().left);

    // Strip animation classes from existing cards so cleanup can't re-trigger them.
    existingSlots.forEach(s => {
      s.classList.remove('bj-card-dealt', 'bj-flip-out', 'bj-flip-in');
      s.style.animation  = 'none';
      s.style.transition = 'none';
    });

    // Append the real card slot — always visible, no invisible placeholder.
    // Using the card itself as the animated element eliminates any swap gap.
    const slot = document.createElement('div');
    slot.className    = 'bj-card-slot';
    slot.innerHTML    = cardHTML(card, faceDown);
    slot.style.animation  = 'none';
    slot.style.transition = 'none';
    container.appendChild(slot);

    // Measure all final positions now that flex has settled.
    const slotRect   = slot.getBoundingClientRect();
    const afterLeft  = existingSlots.map(s => s.getBoundingClientRect().left);

    // INVERT: push existing cards back to their pre-append positions via transform.
    existingSlots.forEach((s, i) => {
      const dx = beforeLeft[i] - afterLeft[i];
      s.style.transform = dx ? 'translateX(' + dx + 'px)' : '';
    });

    // Start the new card at the deck's position so it appears to fly from there.
    const startDx = deckRect.left - slotRect.left;
    const startDy = deckRect.top  - slotRect.top;
    slot.style.transform = 'translate(' + startDx + 'px,' + startDy + 'px)';

    // Force a reflow so the browser registers the starting transforms.
    void container.offsetHeight;

    // PLAY: animate all cards to their natural flex positions.
    const easing = 'transform 0.32s ease-out';
    existingSlots.forEach(s => {
      s.style.transition = easing;
      s.style.transform  = '';
    });
    slot.style.transition = easing;
    slot.style.transform  = '';

    // Clean up after the animation — clear transform/transition on all slots.
    // Only clear the animation override if the slot has no active flip class,
    // to avoid disturbing the revealed hole card.
    setTimeout(() => {
      existingSlots.forEach(s => {
        s.style.transition = '';
        s.style.transform  = '';
        if (!s.classList.contains('bj-flip-out') && !s.classList.contains('bj-flip-in')) {
          s.style.animation = '';
        }
      });
      slot.style.transition = '';
      slot.style.transform  = '';
      slot.style.animation  = '';
      if (callback) callback();
    }, 340);
  }

  /* ── Hole card flip (dealer reveal) ── */
  function flipHoleCard(callback) {
    const slots = els.dealerCards.querySelectorAll('.bj-card-slot');
    if (slots.length < 2) { if (callback) callback(); return; }
    const holeSlot = slots[1];
    // If hole card is already face-up (e.g. dealerPlay already revealed it),
    // skip the flip and fire callback immediately.
    if (holeSlot.querySelector('.bj-card-front')) { if (callback) callback(); return; }
    holeSlot.classList.add('bj-flip-out');
    setTimeout(() => {
      holeSlot.innerHTML = cardHTML(dealerHand[1], false);
      holeSlot.classList.remove('bj-flip-out');
      holeSlot.classList.add('bj-flip-in');
      els.dealerScore.textContent = handValue(dealerHand);
      setTimeout(() => {
        holeSlot.classList.remove('bj-flip-in');
        if (callback) callback();
      }, 210);
    }, 210);
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
    els.playerRow.classList.remove('bj-split-active');
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
    splitBets = null;
    els.splitArea.classList.add('hidden');
    els.playerRow.classList.remove('bj-split-active');

    // Deduct bet from chips upfront
    chips -= currentBet;
    $('bj-current-bet').textContent = currentBet.toLocaleString();
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

    // Double: only on first two cards; in split mode each hand has its own bet
    const activeHand = activeSplitHand === 0 ? playerHand : splitHand;
    const activeBet = splitBets ? splitBets[activeSplitHand] : currentBet;
    const isTwoCards = activeHand.length === 2;
    $('bj-btn-double').classList.toggle('hidden', !isTwoCards);
    $('bj-btn-double').disabled = isTwoCards && chips < activeBet;

    // Split: show for any pair on initial hand; disable (grey out) if can't afford
    const showSplit = isPair(playerHand) && activeSplitHand === 0;
    $('bj-btn-split').classList.toggle('hidden', !showSplit);
    $('bj-btn-split').disabled = showSplit && chips < currentBet;
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
          switchToSplitHand();
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
      switchToSplitHand();
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
    if (splitBets) {
      chips -= splitBets[activeSplitHand];
      splitBets[activeSplitHand] *= 2;
      $('bj-current-bet').textContent = (splitBets[0] + splitBets[1]).toLocaleString();
    } else {
      chips -= currentBet;
      currentBet *= 2;
      $('bj-current-bet').textContent = currentBet.toLocaleString();
    }
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
          switchToSplitHand();
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
    if (chips < currentBet) return;
    chips -= currentBet;
    updateChipDisplay();

    // Each hand starts with just 1 card — new cards are dealt via animation
    splitHand = [playerHand.pop()];
    splitBets = [currentBet, currentBet];
    activeSplitHand = 0;
    $('bj-current-bet').textContent = (currentBet * 2).toLocaleString();

    // Activate side-by-side layout
    els.playerRow.classList.add('bj-split-active');
    renderPlayer();
    renderSplit();

    // Animate the starting card for the main hand, then let player act
    const card = drawCard();
    playerHand.push(card);
    animateSingleCard(card, els.playerCards, false, () => {
      els.playerScore.textContent = handValue(playerHand);
      showActions();
    });
  }

  // Called when main hand finishes — deals starting card to split hand then lets player act
  function switchToSplitHand() {
    activeSplitHand = 1;
    renderSplit(); // updates active-hand highlight
    const card = drawCard();
    splitHand.push(card);
    animateSingleCard(card, els.splitCards, false, () => {
      els.splitScore.textContent = handValue(splitHand);
      showActions();
    });
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

      // Resolve main hand
      const pv = handValue(playerHand);
      const pb = isBust(playerHand);
      let r1;
      if (pb) r1 = 'lose';
      else if (db) r1 = 'win';
      else if (dv > pv) r1 = 'lose';
      else if (pv > dv) r1 = 'win';
      else r1 = 'push';

      // Resolve split hand
      const sv = handValue(splitHand);
      const sb = isBust(splitHand);
      let r2;
      if (sb) r2 = 'lose';
      else if (db) r2 = 'win';
      else if (dv > sv) r2 = 'lose';
      else if (sv > dv) r2 = 'win';
      else r2 = 'push';

      // Use per-hand bets (may differ if one hand was doubled)
      const bet1 = splitBets ? splitBets[0] : currentBet;
      const bet2 = splitBets ? splitBets[1] : currentBet;
      const net1 = r1 === 'win' ? bet1 : r1 === 'lose' ? -bet1 : 0;
      const net2 = r2 === 'win' ? bet2 : r2 === 'lose' ? -bet2 : 0;
      const totalNet = net1 + net2;

      // Return both bets (already deducted) plus net winnings
      chips += bet1 + bet2 + totalNet;

      const result = totalNet > 0 ? 'win' : totalNet < 0 ? 'lose' : 'push';

      // Build two-panel split result banner
      const colorClass = { win: 'bj-result-win', lose: 'bj-result-lose', push: 'bj-result-push' };
      const fmtNet = n => (n >= 0 ? '+' : '') + n.toLocaleString();
      const bannerHTML =
        '<div class="bj-split-result-wrap">' +
          '<div class="bj-split-result-half ' + colorClass[r1] + '">' +
            '<span class="bj-split-result-label">' + r1.toUpperCase() + '</span>' +
            '<span class="bj-split-result-chips">' + fmtNet(net1) + '</span>' +
          '</div>' +
          '<div class="bj-split-result-sep">/</div>' +
          '<div class="bj-split-result-half ' + colorClass[r2] + '">' +
            '<span class="bj-split-result-label">' + r2.toUpperCase() + '</span>' +
            '<span class="bj-split-result-chips">' + fmtNet(net2) + '</span>' +
          '</div>' +
        '</div>';

      finishHand(result, totalNet, bannerHTML);
    });
  }

  /* ── End hand ── */
  function endHand(result) {
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

  function finishHand(result, net, bannerHTML) {
    els.betDisplay.classList.add('hidden');
    updateChipDisplay();
    saveChips();

    sessionResults.push({ result, net });
    updateAllTime(net);

    // Show result banner
    if (bannerHTML) {
      els.handResult.innerHTML = bannerHTML;
      els.handResult.className = 'bj-hand-result';
    } else {
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
    }
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
    row.textContent = '';
    sessionResults.forEach((r, i) => {
      const dot = document.createElement('div');
      dot.className = 'bj-result-dot';
      const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : '' + r.net;
      const s1 = document.createElement('span'); s1.className = 'text-lg'; s1.textContent = emoji;
      const s2 = document.createElement('span'); s2.textContent = 'Hand ' + (i + 1);
      const s3 = document.createElement('span'); s3.className = 'font-bold'; s3.textContent = label;
      dot.appendChild(s1); dot.appendChild(s2); dot.appendChild(s3);
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
    DJUtils.clipboardShare(buildShareText(), $('bj-share-btn'), 'Share Results');
  }
  function shareBrokeResults() {
    DJUtils.clipboardShare(buildShareText(), $('bj-broke-share-btn'), 'Share Results');
  }

  /* ── Countdown ── */
  function startCountdown() {
    const el = $('bj-countdown');
    function tick() {
      const target = chicagoMidnight();
      const diff = target - Date.now();
      if (diff <= 0) { el.textContent = '00:00:00'; return; }
      const h = Math.floor(diff / MS_PER_HOUR);
      const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
      const s = Math.floor((diff % MS_PER_MIN) / MS_PER_SEC);
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, MS_PER_SEC);
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
    row.textContent = '';
    sessionResults.forEach((r, i) => {
      const dot = document.createElement('div');
      dot.className = 'bj-result-dot';
      const emoji = r.net > 0 ? '\uD83D\uDFE2' : r.net < 0 ? '\uD83D\uDD34' : '\uD83D\uDFE1';
      const label = r.net > 0 ? '+' + r.net : r.net === 0 ? 'Even' : '' + r.net;
      const s1 = document.createElement('span'); s1.className = 'text-lg'; s1.textContent = emoji;
      const s2 = document.createElement('span'); s2.textContent = 'Hand ' + (i + 1);
      const s3 = document.createElement('span'); s3.className = 'font-bold'; s3.textContent = label;
      dot.appendChild(s1); dot.appendChild(s2); dot.appendChild(s3);
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
      const h = Math.floor(diff / MS_PER_HOUR);
      const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
      const s = Math.floor((diff % MS_PER_MIN) / MS_PER_SEC);
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, MS_PER_SEC);
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
      playerRow: $('bj-player-row'),
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
        localStorage.setItem('bj_bonus_date', chicagoDate());
        updateChipDisplay();
        showBetting();
        showModal();
      } else if (needsBonus) {
        // Returning player, new day: give daily bonus on top of current stack
        updateChipDisplay();
        showDailyWelcome(() => {
          showBetting();
        });
      } else {
        // Same day, no saved state (shouldn't happen often)
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
    const bjStatsBtn = $('bj-stats-btn');
    if (bjStatsBtn) bjStatsBtn.addEventListener('click', showStats);

    // ESC closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeStats();
        $('bj-daily-modal').classList.add('hidden');
      }
    });
  }

  function showStats() {
    const s  = loadStats();
    const at = loadAllTime();
    const atSign  = at.totalNet >= 0 ? '+' : '';
    const atColor = at.totalNet >= 0 ? '#4ade80' : '#f87171';

    DJUtils.setStatRows('bj-stats-content', [
      { label: 'Current Stack', value: chips.toLocaleString() + ' chips', color: '#4ade80' },
      { label: 'Games Played', value: s.played || 0 },
      { label: 'Current Streak', value: s.streak, color: '#facc15' },
      { label: 'Best Streak', value: s.best, color: '#a78bfa' },
      { label: 'Best Single Hand', value: '+' + at.biggestWin.toLocaleString(), color: '#4ade80' },
      { label: 'Worst Single Hand', value: at.biggestLoss.toLocaleString(), color: '#f87171' },
      { label: 'All-Time Net', value: atSign + at.totalNet.toLocaleString(), color: atColor },
    ]);
    const modal = $('bj-stats-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeStats() {
    const modal = $('bj-stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { closeModal, showModal, shareResults, shareBrokeResults, showStats, closeStats };
})();
