// DailyJamm leaderboards page.
//
// THE PAGE'S JOB: show the player their own stats per game and where those put
// them against everyone else. It is not a "who won today" board - that is one
// of three periods, and not the default.
//
// A global period filter (Daily / Weekly / Lifetime, defaulting to Lifetime)
// applies to the whole page. One call paints it: get_period_summary(period)
// returns a row per game with the player's own numbers AND their rank for each.
// The top-N list for a single stat is fetched only when a card is expanded.
//
// Signed out there are no "my stats", so the cards show the leading players
// instead and the page says plainly what signing in adds.
window.DJBoards = (function () {
  'use strict';

  var PERIODS = [
    ['lifetime', 'Lifetime'],
    ['weekly',   'This week'],
    ['daily',    'Today']
  ];
  var DEFAULT_PERIOD = 'lifetime';
  var STORE_KEY = 'dj_board_period';

  var GAME_URL = {
    themedle: '/themedle/', chainlink: '/chainlink/', spelldle: '/spelldle/',
    blackjackdle: '/blackjackdle/', roulettedle: '/roulettedle/', holdle: '/holdle/',
    liarsdice: '/liarsdice/', netzero: '/netzero/', shutthebox: '/shutthebox/',
    yachtdle: '/yachtdle/'
  };

  // How to name a player's BEST result, per game. Built mechanically from
  // game_defs.score_label this produced "Best guesses", "Best tiles left" and
  // "Best distance from zero" - nonsense for every lower-is-better game, which
  // is half of them. These are display phrasing, so they live here rather than
  // in the database: adding a column to get_period_summary's result would
  // change its return type, and Postgres only allows that after a DROP.
  //
  // score_label stays the name of the measurement and is what the Daily row
  // uses, because a single day's result is not a "best" of anything.
  // What the player's AVERAGE is called. This is the ranked comparison for any
  // game whose best saturates - six of ten have a hard floor or ceiling that a
  // good player reaches and never loses, which freezes a "best" board with
  // everyone tied at first.
  var AVG_LABEL = {
    themedle:     'Average guesses',
    chainlink:    'Average score',
    spelldle:     'Average guesses',
    blackjackdle: 'Average day',
    roulettedle:  'Average day',
    holdle:       'Average day',
    liarsdice:    'Average outlasted',
    netzero:      'Average distance',
    shutthebox:   'Average tiles left',
    yachtdle:     'Average score'
  };

  var BEST_LABEL = {
    themedle:     'Fewest guesses',
    chainlink:    'Best score',
    spelldle:     'Fewest guesses',
    blackjackdle: 'Best day',
    roulettedle:  'Best day',
    holdle:       'Best day',
    liarsdice:    'Most outlasted',
    netzero:      'Closest to zero',
    shutthebox:   'Fewest tiles left',
    yachtdle:     'High score'
  };

  // Point-in-time extras, shown on lifetime only - a chip stack has no
  // "this week" value.
  var LIFETIME_EXTRA = {
    blackjackdle: ['chips_now', 'Chip stack'],
    roulettedle:  ['chips_now', 'Chip stack'],
    holdle:       ['chips_now', 'Chip stack'],
    yachtdle:     ['yachts_total', 'Yachts rolled']
  };

  var period = DEFAULT_PERIOD;
  var signedIn = false;

  function $(id) { return document.getElementById(id); }

  function make(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;   // player data is never innerHTML
    return n;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n.toLocaleString() : '-';
  }

  function avg(v) {
    var n = Number(v);
    if (!isFinite(n)) return '-';
    // One decimal is enough to separate players without implying false
    // precision from a handful of games.
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function signed(v) {
    var n = Number(v);
    if (!isFinite(n)) return '-';
    return (n > 0 ? '+' : '') + n.toLocaleString();
  }

  function isChipGame(id) {
    return id === 'blackjackdle' || id === 'roulettedle' || id === 'holdle';
  }

  function periodWord() {
    if (period === 'daily') return 'today';
    if (period === 'weekly') return 'this week';
    return 'all time';
  }

  // "Days played" is wrong under the Daily filter, where the figure is one
  // day. Shared so the stat row and the board heading cannot drift apart -
  // they were set independently and the board said "Days played" on a card
  // whose own row said "Played today".
  function playedLabelFor(p) {
    return p === 'daily' ? 'Played today' : 'Days played';
  }

  // ── Period filter ────────────────────────────────────────────────────────

  function readPeriod() {
    try {
      var v = localStorage.getItem(STORE_KEY);
      return PERIODS.some(function (p) { return p[0] === v; }) ? v : DEFAULT_PERIOD;
    } catch (e) { return DEFAULT_PERIOD; }
  }

  function writePeriod(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) {}
  }

  function buildFilter() {
    var host = $('lb-filter');
    if (!host) return;
    host.textContent = '';
    host.setAttribute('role', 'tablist');
    PERIODS.forEach(function (p) {
      var b = make('button', 'lb-period' + (p[0] === period ? ' is-on' : ''), p[1]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', p[0] === period ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (period === p[0]) return;
        period = p[0];
        writePeriod(period);
        buildFilter();
        load();
      });
      host.appendChild(b);
    });
  }

  // ── A stat row: my value, and where that puts me ─────────────────────────

  // Static markup, never interpolated.
  var CHEVRON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 9l6 6 6-6"/></svg>';

  /**
   * One stat row: label, the player's own number, their rank, and a chevron.
   *
   * Pass metric = null for anything not ranked globally. A chevron that opens
   * an empty or meaningless board is worse than no chevron - the current
   * streak and a saturating best both fall into that category.
   */
  function statRow(label, value, rank, players, metric, game) {
    var row = make('div', 'lb-stat');
    row.appendChild(make('span', 'lb-stat-label', label));
    row.appendChild(make('span', 'lb-stat-val', value));

    var r = make('span', 'lb-stat-rank');
    if (rank != null && players) {
      r.textContent = '#' + rank;
      r.title = 'Rank ' + rank + ' of ' + players + ' players';
      // Podium colours, then a neutral pill. A player ranked 40th still wants
      // to see the number - what the colour says is "top three", not "ranked".
      var n = Number(rank);
      if (n === 1)      r.classList.add('is-first');
      else if (n === 2) r.classList.add('is-second');
      else if (n === 3) r.classList.add('is-third');
    } else {
      r.textContent = '';
    }
    row.appendChild(r);

    if (metric) {
      var b = make('button', 'lb-stat-see');
      b.type = 'button';
      b.innerHTML = CHEVRON;                       // static string
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', 'Show the top players for ' + label + ' in ' + game.label);
      b.addEventListener('click', function () { toggleBoard(game, metric, label, row, b); });
      row.appendChild(b);
    } else {
      row.appendChild(make('span', 'lb-stat-see-spacer'));
    }
    return row;
  }

  function toggleBoard(game, metric, label, afterEl, btn) {
    function setOpen(open) {
      if (!btn) return;
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    }

    var existing = afterEl.nextSibling;
    if (existing && existing.classList && existing.classList.contains('lb-inline-board')) {
      existing.remove();
      setOpen(false);
      return;
    }
    setOpen(true);
    var box = make('div', 'lb-inline-board');
    box.appendChild(make('p', 'lb-msg', 'Loading ' + label.toLowerCase() + '...'));
    afterEl.parentNode.insertBefore(box, afterEl.nextSibling);

    if (!window.DJAccount || !DJAccount.board) {
      box.textContent = '';
      box.appendChild(make('p', 'lb-msg', 'Boards are unavailable right now.'));
      return;
    }

    DJAccount.board(game.game, metric, 10, period).then(function (rows) {
      box.textContent = '';
      if (!rows || !rows.length) {
        box.appendChild(make('p', 'lb-msg', 'Nobody has made this board ' + periodWord() + ' yet.'));
        return;
      }
      var ol = make('ol', 'lb-list');
      rows.forEach(function (r) {
        var li = make('li', 'lb-row' + (r.is_me ? ' is-me' : ''));
        li.appendChild(make('span', 'lb-rank', r.rank));
        li.appendChild(make('span', 'lb-name', r.username));
        var v = (metric === 'best' && isChipGame(game.game)) ? signed(r.value) : num(r.value);
        li.appendChild(make('span', 'lb-val', v));
        ol.appendChild(li);
      });
      box.appendChild(ol);
    }).catch(function () {
      box.textContent = '';
      box.appendChild(make('p', 'lb-msg', 'Could not load this board.'));
    });
  }

  // ── A game card ──────────────────────────────────────────────────────────

  function gameCard(g) {
    var card = make('section', 'lb-card');

    var head = make('div', 'lb-card-head');
    var h = make('h2');
    var link = make('a', null, g.label);
    link.href = GAME_URL[g.game] || '/';
    h.appendChild(link);
    head.appendChild(h);
    var pc = make('span', 'lb-players');
    pc.textContent = g.players ? g.players + (g.players === 1 ? ' player' : ' players') : 'no players yet';
    head.appendChild(pc);
    card.appendChild(head);

    var body = make('div', 'lb-stats');

    function addHeader() {
      var h = make('div', 'lb-stat lb-stat-head');
      h.appendChild(make('span', 'lb-stat-label', ''));
      h.appendChild(make('span', 'lb-stat-val', 'You'));
      h.appendChild(make('span', 'lb-stat-rank', 'Rank'));
      h.appendChild(make('span', 'lb-stat-see-spacer'));
      body.appendChild(h);
    }

    // No signed-out branch here on purpose: load() returns before any card is
    // built when there is no session, so cards only ever exist for a signed-in
    // player. A "sign in to compare" variant used to live here and is gone
    // rather than left unreachable, which would imply standings are rendered
    // for visitors when they are not.

    // A game you have not played yet still has every one of its boards, so the
    // card renders its FULL set of rows either way. Yours read "-" with an
    // empty rank and each one still opens its board - the row set is a
    // property of the game, not of your history.
    //
    // It used to return early on a single sentence instead, which made a
    // signed-in player's card strictly less useful than a stranger's. Showing
    // one "See the top players" button in its place was no better: it answered
    // for one stat and hid the rest.
    var mine = !!g.my_played;

    if (!mine && !g.players) {
      // Genuinely nothing to show on either side.
      body.appendChild(make('p', 'lb-msg', 'Nobody has played ' + periodWord() + ' yet.'));
      card.appendChild(body);
      return card;
    }

    if (!mine) {
      body.appendChild(make('p', 'lb-msg',
        (period === 'lifetime' ? 'You have not played this one yet.'
                               : 'You have not played this one ' + periodWord() + '.')
        + ' Open any row to see who is ahead.'));
    }

    addHeader();

    // num/avg/signed already render a missing value as "-", and statRow omits
    // the rank pill unless a rank is given, so an unplayed row needs no
    // special casing beyond withholding the rank.
    function srow(label, value, rank, players, metric) {
      return statRow(label, value, mine ? rank : null, mine ? players : null, metric, g);
    }

    // With history, a row appears only if the figure exists. Without it, every
    // row the GAME supports appears, because the board behind it exists
    // regardless of whether this player has a number in it.
    function has(v) { return mine ? v != null : true; }

    body.appendChild(srow(playedLabelFor(period), num(g.my_played),
      g.rank_played, g.players, 'played'));

    if (period === 'daily') {
      // A single day is one result. No average, no "best" of anything.
      if (has(g.my_best)) {
        var dv = isChipGame(g.game) ? signed(g.my_best) : num(g.my_best);
        body.appendChild(srow(g.score_label || 'Score', dv, g.rank_best, g.players, 'best'));
      }
    } else {
      // The AVERAGE is the comparison that keeps working. It is ranked only
      // once a player has min_games results - one lucky first day would
      // otherwise outrank a long honest record forever.
      if (has(g.my_avg)) {
        var avgVal = isChipGame(g.game) ? signed(Math.round(g.my_avg)) : avg(g.my_avg);
        body.appendChild(srow(AVG_LABEL[g.game] || 'Average',
          avgVal, g.rank_avg, g.avg_players, 'avg'));
      }

      // The best stays as a personal milestone. It is only RANKED for games
      // where it does not saturate - an unbounded chip day, or a Yachtdle
      // score. Elsewhere the rank column is deliberately blank.
      if (has(g.my_best)) {
        var bestVal = isChipGame(g.game) ? signed(g.my_best) : num(g.my_best);
        body.appendChild(srow(BEST_LABEL[g.game] || 'Best',
          bestVal, g.best_ranked ? g.rank_best : null,
          g.best_ranked ? g.players : null,
          g.best_ranked ? 'best' : null));
      }
    }

    if (g.notable_label) {
      body.appendChild(srow(g.notable_label, num(g.my_notable),
        g.rank_notable, g.players, 'notable'));
    }

    // Streaks and point-in-time extras are lifetime properties - there is no
    // "streak this week" or "chip stack this week". Their values and ranks come
    // from get_my_lifetime(), which is why they are absent on the other periods.
    if (period === 'lifetime') {
      if (has(g.my_best_streak)) {
        // Personal status, not a global stat. No rank, so no chevron either -
        // offering a board for something the row does not rank is a dead end.
        body.appendChild(srow('Current streak', num(g.my_cur_streak), null, null, null));
        body.appendChild(srow('Best streak', num(g.my_best_streak),
          g.rank_streak, g.players, 'best_streak'));
      }
      if (g.extra_label && has(g.my_extra)) {
        var ex = LIFETIME_EXTRA[g.game];
        body.appendChild(srow(g.extra_label, num(g.my_extra),
          g.rank_extra, g.players, ex ? 'extras:' + ex[0] : null));
      }
    }

    card.appendChild(body);
    return card;
  }

  // ── Page ─────────────────────────────────────────────────────────────────

  function paintTotals(rows) {
    var el = $('lb-mine');
    if (!el) return;
    if (!signedIn) { el.hidden = true; return; }
    // Just the name. Every number it used to summarise is on the cards below.
    $('lb-mine-title').textContent =
      (window.DJAccount && DJAccount.username && DJAccount.username()) || 'You';
    el.hidden = false;
  }

  function load() {
    var grid = $('lb-grid');
    if (!grid) return;

    // Signed out the page is the sign-in bar and nothing else. No cards, no
    // boards, and NO RPC - the request is not made at all rather than made
    // and discarded, so there is no window in which other players' standings
    // reach a browser that should not have them.
    //
    // The server half matters as much: the board functions had anon EXECUTE
    // precisely so this page could work signed out, so leaving that in place
    // would make this a cosmetic gate, one curl away. Migration 0015 revokes
    // it. Same reasoning as get_game_global and the Everyone tab.
    if (!signedIn) {
      grid.textContent = '';
      setFurnitureHidden(true);
      return;
    }
    setFurnitureHidden(false);

    grid.textContent = '';
    grid.appendChild(make('p', 'lb-msg', 'Loading...'));

    if (!window.DJAccount || !DJAccount.rpc) {
      grid.textContent = '';
      grid.appendChild(make('p', 'lb-msg', 'Leaderboards are unavailable right now.'));
      return;
    }

    // One call now carries everything, including the lifetime-only figures.
    DJAccount.rpc('get_summary_v2', { p_period: period }).then(function (res) {
      if (res && res.error) throw res.error;
      var rows = res.data || [];
      grid.textContent = '';
      if (!rows.length) {
        grid.appendChild(make('p', 'lb-msg', 'No games are set up yet.'));
        return;
      }
      rows.forEach(function (g) { grid.appendChild(gameCard(g)); });
      paintTotals(rows);
    }).catch(function (err) {
      if (window.console && console.warn) console.warn('[DJBoards] summary failed:', err);
      grid.textContent = '';
      grid.appendChild(make('p', 'lb-msg', 'Could not load your stats. Try again shortly.'));
    });
  }

  /**
   * The period filter and the ranking footnote only describe figures the page
   * is showing. Signed out there are none, so a filter that changes nothing
   * and a paragraph explaining how averages are ranked are both noise around
   * the one thing that card is for.
   */
  function setFurnitureHidden(hide) {
    var filter = $('lb-filter');
    if (filter) filter.hidden = hide;
    var foot = document.querySelector('.lb-foot');
    if (foot) foot.hidden = hide;
    // paintTotals owns this when signed in, but it never runs signed out, so
    // hide it here rather than relying on the markup's initial state - the
    // page is also repainted on a period change without a reload.
    if (hide) { var mine = $('lb-mine'); if (mine) mine.hidden = true; }
  }

  function signInPrompt() {
    var el = $('lb-signedout');
    if (!el) return;
    el.hidden = signedIn;
    var btn = $('lb-signin');
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = '1';
      btn.addEventListener('click', function () { if (window.DJAccount) DJAccount.open(); });
    }
  }

  function boot() {
    period = readPeriod();
    buildFilter();

    // The session takes up to 1200ms to settle and the page is deliberately
    // bare until it does - filter, footnote and sign-in bar all start hidden,
    // because showing any of them first is how the old "block of text that
    // appears then disappears" happened. One neutral line holds the space so
    // the wait does not read as a broken page.
    var grid = $('lb-grid');
    if (grid) {
      grid.textContent = '';
      grid.appendChild(make('p', 'lb-msg', 'Loading...'));
    }

    // account.js settles the session asynchronously; wait for it rather than
    // painting a signed-out page to someone who is signed in.
    function go() {
      signedIn = !!(window.DJAccount && DJAccount.isReady && DJAccount.isReady());
      signInPrompt();
      load();
    }
    if (window.DJAccount && DJAccount.whenResolved) DJAccount.whenResolved(go);
    else setTimeout(go, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    period: function () { return period; },
    reload: load
  };
})();
