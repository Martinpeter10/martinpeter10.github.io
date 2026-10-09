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

    var playedLabel = period === 'daily' ? 'Played today' : 'Days played';
    body.appendChild(statRow(playedLabel, num(g.my_played), g.rank_played, g.players, 'played', g));

    if (g.my_best != null) {
      var bestLabel = period === 'lifetime' ? 'Best ' + (g.score_label || 'score').toLowerCase()
                                            : (g.score_label || 'Score');
      var bestVal = isChipGame(g.game) ? signed(g.my_best) : num(g.my_best);
      body.appendChild(statRow(bestLabel, bestVal, g.rank_best, g.players, 'best', g));
    }

    if (g.notable_label) {
      body.appendChild(statRow(g.notable_label, num(g.my_notable), g.rank_notable, g.players, 'notable', g));
    }

    // Streaks are a lifetime property - there is no "streak this week".
    if (period === 'lifetime' && g.my_best_streak != null) {
      body.appendChild(statRow('Current streak', num(g.my_cur_streak), null, null, 'cur_streak', g));
      body.appendChild(statRow('Best streak', num(g.my_best_streak), null, null, 'best_streak', g));
    }

    // Point-in-time extras, lifetime only.
    if (period === 'lifetime' && LIFETIME_EXTRA[g.game]) {
      var ex = LIFETIME_EXTRA[g.game];
      body.appendChild(statRow(ex[1], '-', null, null, 'extras:' + ex[0], g));
    }

    card.appendChild(body);
    return card;
  }

  // ── Page ─────────────────────────────────────────────────────────────────

  function paintTotals(rows) {
    var played = 0, games = 0;
    rows.forEach(function (r) {
      played += Number(r.my_played || 0);
      if (r.my_played) games++;
    });
    var el = $('lb-mine');
    if (!el) return;
    if (!signedIn || !played) { el.hidden = true; return; }

    var who = (window.DJAccount && DJAccount.username && DJAccount.username()) || 'You';
    $('lb-mine-title').textContent = who;
    $('lb-mine-sub').textContent =
      played.toLocaleString() + (played === 1 ? ' result ' : ' results ') +
      periodWord() + ' across ' + games + (games === 1 ? ' game' : ' games');
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

    DJAccount.rpc('get_period_summary', { p_period: period }).then(function (res) {
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
