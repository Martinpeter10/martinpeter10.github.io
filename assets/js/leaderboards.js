// DailyJamm leaderboards page. Only loaded by /leaderboards/.
//
// Every board comes from one backend function, get_game_board(game, metric,
// limit). What differs per game is which metrics are worth bragging about, and
// that lives in BOARDS below.
//
// Metric names:
//   today            today's result, direction from the game's own scoring
//   best             personal best, direction from the game's own scoring
//   best_streak      longest run of consecutive days
//   played           days played
//   extras:<key>     a counter the game reports, always high to low
window.DJBoards = (function () {
  'use strict';

  // Order matches the home page. First board in each list is the default tab.
  var GAMES = [
    { id: 'themedle',     name: 'Themedle',     url: '/themedle/' },
    { id: 'chainlink',    name: 'Chain Link',   url: '/chainlink/' },
    { id: 'spelldle',     name: 'Spelldle',     url: '/spelldle/' },
    { id: 'blackjackdle', name: 'BlackJackdle', url: '/blackjackdle/' },
    { id: 'roulettedle',  name: 'Roulettedle',  url: '/roulettedle/' },
    { id: 'holdle',       name: 'Holdle',       url: '/holdle/' },
    { id: 'liarsdice',    name: "Liar's Dice",  url: '/liarsdice/' },
    { id: 'netzero',      name: 'Net Zero',     url: '/netzero/' },
    { id: 'shutthebox',   name: 'Shut the Box', url: '/shutthebox/' },
    { id: 'yachtdle',     name: 'Yachtdle',     url: '/yachtdle/' }
  ];

  var CHIPS = [
    ['today',                'Today'],
    ['extras:chips_now',     'Chip stack'],
    ['extras:biggest_win',   'Biggest day'],
    ['best_streak',          'Streak'],
    ['played',               'Days']
  ];

  var GUESSING = [
    ['today',       'Today'],
    ['best_streak', 'Streak'],
    ['played',      'Days']
  ];

  var BOARDS = {
    themedle:     GUESSING,
    spelldle:     GUESSING,
    chainlink: [
      ['today',                  'Today'],
      ['best',                   'Best score'],
      ['extras:perfect_total',   'Perfect games'],
      ['best_streak',            'Streak'],
      ['played',                 'Days']
    ],
    blackjackdle: CHIPS,
    roulettedle:  CHIPS,
    holdle:       CHIPS,
    liarsdice: [
      ['today',                    'Today'],
      ['extras:table_wins_total',  'Tables won'],
      ['best_streak',              'Streak'],
      ['played',                   'Days']
    ],
    netzero: [
      ['today',                'Today'],
      ['extras:pure_total',    'Perfect zeros'],
      ['best_streak',          'Streak'],
      ['played',               'Days']
    ],
    shutthebox: [
      ['today',              'Today'],
      ['best',               'Best round'],
      ['extras:shut_total',  'Boxes shut'],
      ['best_streak',        'Streak'],
      ['played',             'Days']
    ],
    yachtdle: [
      ['today',                 'Today'],
      ['best',                  'High score'],
      ['extras:yachts_total',   'Yachts'],
      ['best_streak',           'Streak'],
      ['played',                'Days']
    ]
  };

  // What an empty board should say. "No scores yet" reads like a fault on a
  // board that simply resets every night.
  var EMPTY = {
    today: 'Nobody has played today yet.',
    best:  'No results yet.'
  };

  function $(id) { return document.getElementById(id); }

  function make(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;   // always textContent for player data
    return n;
  }

  function fmt(v, metric) {
    var n = Number(v);
    if (!isFinite(n)) return String(v);
    // Session net reads better signed.
    if (metric === 'today' && /^(blackjackdle|roulettedle|holdle)$/.test(fmt.game || '')) {
      return (n > 0 ? '+' : '') + n.toLocaleString();
    }
    return n.toLocaleString();
  }

  // ── One game card ────────────────────────────────────────────────────────

  function buildCard(game) {
    var boards = BOARDS[game.id] || GUESSING;

    var card = make('section', 'lb-card');

    var head = make('div', 'lb-card-head');
    var h = make('h2');
    var link = make('a', null, game.name);
    link.href = game.url;
    h.appendChild(link);
    head.appendChild(h);
    card.appendChild(head);

    var tabs = make('div', 'lb-tabs');
    tabs.setAttribute('role', 'tablist');
    boards.forEach(function (b, i) {
      var t = make('button', 'lb-tab' + (i === 0 ? ' is-on' : ''), b[1]);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs.children, function (o) {
          o.classList.remove('is-on');
          o.setAttribute('aria-selected', 'false');
        });
        t.classList.add('is-on');
        t.setAttribute('aria-selected', 'true');
        load(game, b[0], body);
      });
      tabs.appendChild(t);
    });
    card.appendChild(tabs);

    var body = make('div', 'lb-body');
    body.appendChild(make('p', 'lb-msg', 'Loading...'));
    card.appendChild(body);

    load(game, boards[0][0], body);
    return card;
  }

  function load(game, metric, body) {
    body.textContent = '';
    body.appendChild(make('p', 'lb-msg', 'Loading...'));

    if (!window.DJAccount || !DJAccount.board) {
      body.textContent = '';
      body.appendChild(make('p', 'lb-msg', 'Leaderboards are unavailable right now.'));
      return;
    }

    DJAccount.board(game.id, metric, 10).then(function (rows) {
      body.textContent = '';
      if (!rows || !rows.length) {
        body.appendChild(make('p', 'lb-msg', EMPTY[metric] || 'Nobody has made this board yet.'));
        return;
      }
      fmt.game = game.id;
      var ol = make('ol', 'lb-list');
      rows.forEach(function (r) {
        var li = make('li', 'lb-row' + (r.is_me ? ' is-me' : ''));
        li.appendChild(make('span', 'lb-rank', r.rank));
        li.appendChild(make('span', 'lb-name', r.username));
        li.appendChild(make('span', 'lb-val', fmt(r.value, metric)));
        ol.appendChild(li);
      });
      body.appendChild(ol);
    }).catch(function () {
      body.textContent = '';
      body.appendChild(make('p', 'lb-msg', 'Could not load this board.'));
    });
  }

  // ── Page ─────────────────────────────────────────────────────────────────

  function siteStats() {
    if (!window.DJAccount || !DJAccount.siteStats) return;
    DJAccount.siteStats().then(function (d) {
      if (!d) return;
      $('lb-players').textContent = Number(d.players || 0).toLocaleString();
      $('lb-games').textContent   = Number(d.games_played || 0).toLocaleString();
      $('lb-today').textContent   = Number(d.played_today || 0).toLocaleString();
      $('lb-site').hidden = false;
    }).catch(function () { /* the boards are the point; totals are decoration */ });
  }

  function signInPrompt() {
    // account.js resolves its session asynchronously, so ask a moment later
    // rather than racing it and telling a signed-in player to sign in.
    setTimeout(function () {
      if (window.DJAccount && DJAccount.isReady && DJAccount.isReady()) return;
      var el = $('lb-signedout');
      if (!el) return;
      el.hidden = false;
      var btn = $('lb-signin');
      if (btn) btn.addEventListener('click', function () { DJAccount.open(); });
    }, 1200);
  }

  function boot() {
    var grid = $('lb-grid');
    if (!grid) return;
    GAMES.forEach(function (g) { grid.appendChild(buildCard(g)); });
    siteStats();
    signInPrompt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { games: GAMES, boards: BOARDS };
})();
