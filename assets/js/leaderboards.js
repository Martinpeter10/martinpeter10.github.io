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

  function statRow(label, value, rank, players, metric, game) {
    var row = make('div', 'lb-stat');
    row.appendChild(make('span', 'lb-stat-label', label));
    row.appendChild(make('span', 'lb-stat-val', value));

    var r = make('span', 'lb-stat-rank');
    if (rank != null && players) {
      r.textContent = '#' + rank;
      r.title = 'Rank ' + rank + ' of ' + players + ' players';
      if (Number(rank) === 1) r.classList.add('is-first');
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

    if (!signedIn) {
      // No "my stats" to show. Lead with who is ahead instead.
      body.appendChild(make('p', 'lb-msg',
        g.players ? 'Sign in to see how you compare.' : 'Nobody has played ' + periodWord() + ' yet.'));
      if (g.players) {
        var btn = make('button', 'lb-see-top', 'See the top players');
        btn.type = 'button';
        btn.addEventListener('click', function () { toggleBoard(g, 'played', 'Days played', body, btn); });
        body.appendChild(btn);
      }
      card.appendChild(body);
      return card;
    }

    if (!g.my_played) {
      body.appendChild(make('p', 'lb-msg',
        period === 'lifetime' ? 'You have not played this one yet.'
                              : 'You have not played this one ' + periodWord() + '.'));
      card.appendChild(body);
      return card;
    }

    addHeader();

    var playedLabel = period === 'daily' ? 'Played today' : 'Days played';
    body.appendChild(statRow(playedLabel, num(g.my_played), g.rank_played, g.players, 'played', g));

    if (period === 'daily') {
      // A single day is one result. No average, no "best" of anything.
      if (g.my_best != null) {
        var dv = isChipGame(g.game) ? signed(g.my_best) : num(g.my_best);
        body.appendChild(statRow(g.score_label || 'Score', dv, g.rank_best, g.players, 'best', g));
      }
    } else {
      // The AVERAGE is the comparison that keeps working. It is ranked only
      // once a player has min_games results - one lucky first day would
      // otherwise outrank a long honest record forever.
      if (g.my_avg != null) {
        var avgVal = isChipGame(g.game) ? signed(Math.round(g.my_avg)) : avg(g.my_avg);
        body.appendChild(statRow(AVG_LABEL[g.game] || 'Average',
          avgVal, g.rank_avg, g.avg_players, 'avg', g));
      }

      // The best stays as a personal milestone. It is only RANKED for games
      // where it does not saturate - an unbounded chip day, or a Yachtdle
      // score. Elsewhere the rank column is deliberately blank.
      if (g.my_best != null) {
        var bestVal = isChipGame(g.game) ? signed(g.my_best) : num(g.my_best);
        body.appendChild(statRow(BEST_LABEL[g.game] || 'Best',
          bestVal, g.best_ranked ? g.rank_best : null,
          g.best_ranked ? g.players : null,
          g.best_ranked ? 'best' : null, g));
      }
    }

    if (g.notable_label) {
      body.appendChild(statRow(g.notable_label, num(g.my_notable), g.rank_notable, g.players, 'notable', g));
    }

    // Streaks and point-in-time extras are lifetime properties - there is no
    // "streak this week" or "chip stack this week". Their values and ranks come
    // from get_my_lifetime(), which is why they are absent on the other periods.
    if (period === 'lifetime') {
      if (g.my_best_streak != null) {
        body.appendChild(statRow('Current streak', num(g.my_cur_streak), null, null, 'cur_streak', g));
        body.appendChild(statRow('Best streak', num(g.my_best_streak),
          g.rank_streak, g.players, 'best_streak', g));
      }
      if (g.extra_label && g.my_extra != null) {
        var ex = LIFETIME_EXTRA[g.game];
        body.appendChild(statRow(g.extra_label, num(g.my_extra),
          g.rank_extra, g.players, ex ? 'extras:' + ex[0] : null, g));
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
