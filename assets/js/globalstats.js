// "Everyone" tab inside each game's stats modal.
//
// The per-game stats modal only ever showed the player their own trend, which
// says nothing about whether 4 guesses is good. This adds the other half.
//
// ONE module for all ten games. Everything that differs per game is already
// described in game_defs and comes back from get_game_global - what the score
// is called, which direction is good, and what counts as a good result - so
// there is no per-game branching here and a new game needs no changes to this
// file.
//
// Each game calls DJGlobal.attach() from its own showStats(). The tab bar and
// the global panel are inserted as SIBLINGS of the game's existing stats
// container, never inside it: every game rewrites that container's contents
// on each open, and anything of ours inside it would be wiped.
//
// TWO DELIBERATE LIMITS
//
// It is TODAY ONLY. Lifetime and weekly comparisons live on the leaderboards
// page; repeating them here would be two places to maintain and two places to
// disagree. What belongs in a game's own modal is the thing that is only true
// right now - how everyone did on today's puzzle.
//
// It is SIGNED IN ONLY, and that is the point rather than a side effect. The
// player's own stats work signed out exactly as they always have; seeing how
// everyone else did is what an account buys. So the tab is shown to everyone
// and the pitch is what sits behind it when signed out - a feature nobody can
// see is not an incentive.
window.DJGlobal = (function () {
  'use strict';

  var mounted = {};          // contentId -> { bar, panel, opts, loaded }
  var cache   = {};          // game|period -> payload

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function pct(n, of) {
    if (!of) return '-';
    return Math.round((n / of) * 100) + '%';
  }

  function fmt(n) {
    if (n === null || typeof n === 'undefined') return '-';
    var num = Number(n);
    if (!isFinite(num)) return String(n);
    return Math.abs(num % 1) > 0 ? num.toFixed(2) : num.toLocaleString();
  }

  /** Everything the panel shows, built from the payload with no per-game code. */
  function renderPanel(panel, d, opts) {
    panel.textContent = '';

    if (d && d.error) {
      panel.appendChild(el('p', 'dj-g-empty', 'Not available right now.'));
      return;
    }
    if (!d || !d.plays) {
      panel.appendChild(el('p', 'dj-g-empty',
        'Nobody has finished today\u2019s puzzle yet. Be the first.'));
      return;
    }

    var rows = el('div', 'dj-g-rows');
    function row(label, value) {
      var r = el('div', 'dj-g-row');
      r.appendChild(el('span', 'dj-g-label', label));
      r.appendChild(el('span', 'dj-g-value', value));
      rows.appendChild(r);
    }

    row('Players today', fmt(d.players));
    if (d.notable_label) {
      row(d.notable_label, fmt(d.notable) + '  (' + pct(d.notable, d.plays) + ')');
    }
    // `plays` and `players` are the same number for a single day - one result
    // per player per game per day - so showing both would just look like a
    // mistake.

    row('Average ' + (d.score_label || 'score').toLowerCase(), fmt(d.avg));
    // "Best result", not "Best guesses". Composing "Best" with the score
    // label produced exactly the nonsense phrase the leaderboards page was
    // pulled up on - "best guesses" tells you nothing about whether more is
    // better. The unit is already stated by the Average row above.
    row('Best result', fmt(d.best));
    panel.appendChild(rows);

    var dist = d.dist || [];
    if (!dist.length) return;

    panel.appendChild(el('h4', 'dj-g-h', 'Distribution'));
    var max = dist.reduce(function (m, b) { return Math.max(m, b.n); }, 0) || 1;
    var chart = el('div', 'dj-g-chart');

    dist.forEach(function (b) {
      var isDiscrete = typeof b.v !== 'undefined';
      var key = isDiscrete ? String(b.v)
                           : (b.lo === b.hi ? String(b.lo) : b.lo + '-' + b.hi);

      var line = el('div', 'dj-g-bar-row');
      line.appendChild(el('span', 'dj-g-key', key));

      var track = el('div', 'dj-g-track');
      var fill  = el('div', 'dj-g-fill');
      // Always wide enough to read the count sitting in it.
      fill.style.width = Math.max(8, Math.round((b.n / max) * 100)) + '%';
      // The player's own result, so the chart says something about THEM.
      if (isDiscrete && opts.mine !== null && typeof opts.mine !== 'undefined'
          && Number(opts.mine) === Number(b.v)) {
        fill.classList.add('is-mine');
        line.classList.add('is-mine');
      }
      fill.appendChild(el('span', 'dj-g-n', String(b.n)));
      track.appendChild(fill);
      line.appendChild(track);
      chart.appendChild(line);
    });
    panel.appendChild(chart);
  }

  /** What sits behind the tab when nobody is signed in. */
  function renderPitch(panel) {
    panel.textContent = '';
    var w = el('div', 'dj-g-pitch');
    w.appendChild(el('p', 'dj-g-pitch-lede',
      'See how everyone did on today\u2019s puzzle - how many played, how many got it, and where your result sits.'));
    var btn = el('button', 'dj-g-pitch-btn', 'Sign in to see');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      // The account modal sits above this one, so it opens on top rather than
      // needing the stats modal closed first.
      if (window.DJAccount && DJAccount.open) DJAccount.open();
    });
    w.appendChild(btn);
    w.appendChild(el('p', 'dj-g-pitch-fine',
      'Your own stats stay here whether you sign in or not.'));
    panel.appendChild(w);
  }

  function signedIn() {
    return !!(window.DJAccount && DJAccount.signedIn && DJAccount.signedIn());
  }

  function load(state, period) {
    var opts = state.opts;
    var key  = opts.game + '|' + period;

    // Checked at open time, not at attach time: a player can sign in from the
    // pitch and come straight back to this panel.
    if (!signedIn()) { renderPitch(state.panel); return; }

    state.panel.textContent = '';
    state.panel.appendChild(el('p', 'dj-g-empty', 'Loading...'));

    if (cache[key]) { renderPanel(state.panel, cache[key], opts); return; }

    if (!window.DJAccount || !DJAccount.rpc) {
      state.panel.textContent = '';
      state.panel.appendChild(el('p', 'dj-g-empty', 'Not available right now.'));
      return;
    }

    DJAccount.rpc('get_game_global', { p_game: opts.game, p_period: period })
      .then(function (res) {
        if (res && res.error) throw res.error;
        var d = res && res.data;
        cache[key] = d;
        renderPanel(state.panel, d, opts);
      })
      .catch(function (err) {
        if (window.console && console.warn) {
          console.warn('[DJGlobal] get_game_global failed:', err);
        }
        state.panel.textContent = '';
        state.panel.appendChild(el('p', 'dj-g-empty',
          'Could not load global results. Check your connection.'));
      });
  }

  function showTab(state, which) {
    var own = which === 'you';
    // The modal is headed "My Stats"; it must not still say that over
    // everyone else's numbers.
    if (state.heading) {
      state.heading.textContent = own ? state.headingOwn : 'Everyone';
    }
    state.ownEls.forEach(function (e) { if (e) e.hidden = !own; });
    // Share Stats shares the PLAYER's stats, so it has no meaning sitting
    // under everyone else's. Found by id rather than listed per game - they
    // are all *-share-btn - so a new game needs nothing here.
    state.shareBtns.forEach(function (e) { e.hidden = !own; });
    state.panel.hidden = own;
    state.tabYou.classList.toggle('is-on', own);
    state.tabAll.classList.toggle('is-on', !own);
    state.tabYou.setAttribute('aria-selected', String(own));
    state.tabAll.setAttribute('aria-selected', String(!own));
    // Loaded on every switch, not once: the numbers are today's and move as
    // people finish, and a player who signs in from the pitch must come back
    // to figures rather than to the pitch they just answered.
    if (!own) load(state, 'daily');
  }

  /**
   * opts: { game, contentId, extraIds?: [], mine?: number }
   *
   * Safe to call on every open - it builds once and only refreshes `mine`.
   */
  function attach(opts) {
    try {
      var content = document.getElementById(opts.contentId);
      if (!content || !content.parentNode) return;

      var state = mounted[opts.contentId];
      if (state) {
        // Already built. Refresh the inputs and start back on the player's own
        // view, so reopening never shows a stale panel from a previous visit.
        state.opts.mine = opts.mine;
        invalidate(opts.game);
        showTab(state, 'you');
        return;
      }

      var extras = (opts.extraIds || [])
        .map(function (id) { return document.getElementById(id); })
        .filter(Boolean);

      var bar = el('div', 'dj-g-tabs');
      bar.setAttribute('role', 'tablist');
      var tabYou = el('button', 'dj-g-tab is-on', 'You');
      var tabAll = el('button', 'dj-g-tab', 'Everyone');
      [tabYou, tabAll].forEach(function (t) {
        t.type = 'button';
        t.setAttribute('role', 'tab');
      });
      bar.appendChild(tabYou);
      bar.appendChild(tabAll);

      var panel = el('div', 'dj-g-panel');
      panel.hidden = true;

      content.parentNode.insertBefore(bar, content);
      var last = extras.length ? extras[extras.length - 1] : content;
      if (last.nextSibling) last.parentNode.insertBefore(panel, last.nextSibling);
      else last.parentNode.appendChild(panel);

      // The modal's own title, so it can be swapped and put back.
      var heading = bar.parentNode ? bar.parentNode.querySelector('h2') : null;

      state = mounted[opts.contentId] = {
        opts: opts, panel: panel,
        tabYou: tabYou, tabAll: tabAll,
        heading: heading,
        headingOwn: heading ? heading.textContent : '',
        ownEls: [content].concat(extras),
        shareBtns: bar.parentNode
          ? [].slice.call(bar.parentNode.querySelectorAll('button[id*="share"]'))
          : []
      };

      tabYou.addEventListener('click', function () { showTab(state, 'you'); });
      tabAll.addEventListener('click', function () { showTab(state, 'all'); });
    } catch (e) {
      // A stats modal that opens is worth more than a tab that works.
      if (window.console && console.warn) console.warn('[DJGlobal] attach failed:', e);
    }
  }

  /** Drop cached aggregates - call after submitting a result. */
  function invalidate(game) {
    Object.keys(cache).forEach(function (k) {
      if (!game || k.indexOf(game + '|') === 0) delete cache[k];
    });
  }

  return { attach: attach, invalidate: invalidate };
})();
