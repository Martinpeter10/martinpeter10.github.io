# DailyJamm - Project Instructions

## What This Is
DailyJamm (dailyjamm.com) is a daily games hub hosted on GitHub Pages. It features original custom-built games, curates links to external daily games, and lets players build their own "Your Favorite Games" list (star built-in games or add custom links; see Favorites System below). Dark-mode-only, mobile-first, no backend - all game state lives in localStorage.

## Domain & Hosting
- Domain: `dailyjamm.com` (CNAME file)
- Hosting: GitHub Pages (static HTML, no build step), deployed from `main`
- Test environment: Cloudflare Worker `dailyjammtest` deployed from the `tst` branch; dev environment: worker `dailyjammdev` from the `dev` branch (both `*.workers.dev` URLs)
- No framework - vanilla HTML/CSS/JS + Tailwind CDN on game pages

## Release Workflow (dev -> tst -> prod, with approval gates)

| Env | Branch | Hosting | Purpose |
|---|---|---|---|
| Dev | `dev` | Cloudflare Worker `dailyjammdev` | Integration playground: ALL in-progress work merged together. Never merged forward. |
| Test | `tst` | Cloudflare Worker `dailyjammtest` | Exactly ONE approved release candidate at a time - friends play-test exactly what is about to ship |
| Prod | `main` | GitHub Pages (dailyjamm.com) | Live site |

**Golden rules (Claude MUST follow these):**
1. **Everything starts in dev.** ALL work - new games, features, and fixes - is built on a branch off `tst` and merged into `dev` first. Never build or verify anything directly on `tst` or `main`.
2. **Confirm the target environment.** If a request does not clearly state which environment it applies to, ASK ("Is this for dev, or are we promoting to test/prod?") before pushing anywhere. Never assume a change or a test request implies promotion.
3. **Approval gate 1 (dev -> tst):** merging anything into `tst` requires the user's explicit approval of that specific item, given after it has been verified on the dev site. When asking for this approval, name exactly what would ship to test. `tst` holds only the one release candidate currently being play-tested - never stack unapproved work on it.
4. **Approval gate 2 (tst -> main):** merging `tst` into `main` (prod release) requires a second explicit approval after the playtest. Never push release work directly to `main`.

**New games / large features:**
1. Branch from `tst`: `git checkout tst && git checkout -b game/<slug>`
2. Build the game on its branch; merge the branch into `dev` (`git checkout dev && git merge game/<slug> && git push`) whenever you want it visible on the dev site
3. Games ship independently: when the user approves ONE game for testing (gate 1), merge its `game/<slug>` branch (not `dev`) into `tst`; after the playtest is approved (gate 2), merge `tst` into `main`
4. `dev` is disposable - if it gets tangled, rebuild it from `tst` plus the active game branches (`git branch -f dev tst` then re-merge each `game/*`)

**Small fixes/features:** branch from `tst` (`fix/<slug>`), merge the branch into `dev`, and verify on the dev site - same as large work, same two approval gates to reach `tst` and then `main`. Hotfix exception: a trivial, urgent production fix may go straight to `main` only with the user's explicit approval, and still verify it locally first.

Cloudflare setup: both Worker projects are connected to this repo via Workers Builds and configured by `wrangler.jsonc` (+ `.assetsignore` to keep `.git` and non-site files out of the upload). The test project deploys the `tst` branch as worker `dailyjammtest` (name from wrangler.jsonc); the dev project deploys the `dev` branch with deploy command `npx wrangler deploy --name dailyjammdev` (the `--name` override keeps it from clobbering the test worker). **Non-production branch builds are disabled on BOTH projects** - each project builds and deploys only its own branch. If a worker ever serves the other branch's content, re-check that dashboard setting, then push an empty commit to the affected branch to redeploy the correct content.

Notes:
- Google Analytics is **hostname-gated**: `gtag('config', ...)` only fires when `location.hostname === 'dailyjamm.com'`, so test/dev/local traffic never pollutes analytics. Preserve this gate when adding GA snippets to new pages.
- The test site is a full copy of the `tst` branch with its own localStorage (separate from prod), and Cloudflare serves it with `X-Robots-Tag: noindex` so it is not indexed.
- Do not push half-finished work to `tst` while a playtest is in progress (half-finished work belongs on `dev` / game branches).

## Branding & Theme
- **Colors**: `--bg:#1a1a2e`, `--panel:#16213e`, `--brand:#2ecc71` (green), `--brand2:#45b7d1` (cyan), `--ink:#fff`, `--muted:#b8b8d1`
- **Logo**: "DailyJamm" text with cyan→green gradient, extra-bold
- **Font**: Segoe UI / Tahoma / Geneva / Verdana / sans-serif
- **Style**: Dark mode only, rounded corners (8-16px), gradient accents, subtle box shadows
- **Theme color meta**: `#1a1a2e` (matches background, prevents iOS toolbar color mismatch)

## Writing Style
- **No em dashes**: Never use em dashes (—) in any public-facing text (game pages, release notes, about, privacy, terms, etc.). Use a regular hyphen with spaces around it (` - `) instead.
- **No en dashes as separators**: En dashes (–) are acceptable only for numeric ranges (e.g. "50–100 chips", "60–120 ft"). Do not use them as sentence separators.
- This applies to all HTML content, release notes, card descriptions, modal copy, and any other player-visible text.

---

## Checklist: Adding a New Custom Game

When building or adding a new game to DailyJamm, complete ALL of the following steps:

### 1. Create the Game Directory & Page
- Create `/<game-slug>/index.html`
- Follow the existing game page structure (see Chain Link or Themedle as templates)
- Title format: `Game Name | DailyJamm`

### 2. Required `<head>` Tags (copy from existing game page and update)
Every game page MUST include all of these in the `<head>`:

```html
<!-- Viewport & charset -->
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<!-- SEO -->
<title>Game Name | DailyJamm</title>
<meta name="description" content="Play Game Name on DailyJamm - [game description].">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://dailyjamm.com/<game-slug>/">
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<link rel="stylesheet" href="/assets/css/styles.css">

<!-- Open Graph -->
<meta property="og:site_name" content="DailyJamm" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://dailyjamm.com/<game-slug>/" />
<meta property="og:title" content="Game Name | DailyJamm" />
<meta property="og:description" content="[Short game description for social sharing]" />
<meta property="og:image" content="/assets/img/favicon.png" />

<!-- iOS / Theme -->
<meta name="theme-color" content="#1a1a2e" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1a2e" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

<!-- Security headers -->
<meta name="referrer" content="strict-origin-when-cross-origin" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com; font-src 'self' https://cdn.tailwindcss.com;" />

<!-- Google Analytics (gtag.js) - REQUIRED on every page -->
<!-- gtag('config') is gated on cookie consent (dj_cookie_ok in localStorage) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XLRXG28EZV"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  if (localStorage.getItem('dj_cookie_ok')) { gtag('config', 'G-XLRXG28EZV'); }
</script>

<!-- Tailwind CDN -->
<script src="https://cdn.tailwindcss.com"></script>

```

> **Note on Themedle** (`media-src`): Themedle loads audio files from `/assets/audio/` so its CSP also needs `media-src 'self';` appended.

### 3. Header + Hamburger Nav (must be identical on every page)

**CRITICAL:** All header and hamburger/drawer CSS lives exclusively in `/assets/css/styles.css`. Never define `.site-header`, `.site-brand`, `.hamburger`, `.hamburger-box`, `.hamburger-line`, `.backdrop`, `.drawer`, `.menu-sec`, `.menu-title`, or `.menu-link` inline in any page's `<style>` block. Doing so creates inconsistency and was the source of past visual bugs.

Every page must use this exact header structure — no Tailwind classes on the `<header>` or brand link:

```html
<header class="site-header">
  <button class="hamburger" aria-label="Open menu" onclick="toggleMenu()">
    <span class="hamburger-box">
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
    </span>
  </button>
  <a href="/" class="site-brand">DailyJamm</a>
  <div class="flex-1"></div>
  <!-- stats + help buttons go here (game pages only) -->
</header>

<div class="backdrop" id="backdrop" onclick="closeMenu()"></div>
<nav id="drawer" class="drawer" aria-label="Site">
  ...
</nav>
```

The `<header>` has **no inner wrapper div** — all children are direct flex children of `<header class="site-header">`. Do not add `<div class="px-5 py-3 flex items-center gap-3">` or any similar wrapper inside it.

**Add the new game** to the "Our Games" section of the drawer on ALL pages:
- `index.html` (home)
- `/themedle/index.html`
- `/chainlink/index.html`
- `/blackjackdle/index.html`
- The new game's own page
- Any other existing game pages

The nav structure:
```html
<div class="menu-sec">
  <div class="menu-title">Our Games</div>
  <a class="menu-link" href="/themedle/">Themedle</a>
  <a class="menu-link" href="/chainlink/">Chain Link</a>
  <a class="menu-link" href="/<new-game>/">New Game Name</a>  <!-- ADD THIS -->
</div>
```

**Drawer section order (must be the same on every page):**
1. Home link
2. **Our Games** (hardcoded in each page's HTML)
3. **Your Favorite Games** — do NOT hardcode this section; `favorites.js` injects it after "Our Games" at runtime, only when the player has favorites
4. **Our Favorite Games** (hardcoded; the curated external games list)
5. **Info** (About / Releases / Terms / Privacy) — always last

Every page also loads the shared scripts (in this order, both `defer`):
```html
<script src="/assets/js/menu.js" defer></script>
<script src="/assets/js/favorites.js" defer></script>
```

**Also add the new game to the `SITES` catalog in `/assets/js/favorites.js`** (id, title, url — internal games have no `ext` flag) so players can favorite it. See the Favorites section below.

### 4. Header Buttons — Stats & Instructions (REQUIRED on every game page)

Every game page **must** have two icon buttons in the **top-right of the fixed header**, to the left of the hamburger menu area. The standard order is: **Stats button** (bar-chart icon) → **? button** (How to Play), both sitting after the `<div class="flex-1"></div>` spacer.

```html
<!-- Place these immediately after <div class="flex-1"></div> inside the header -->
<button id="XX-stats-btn" aria-label="Stats"
  class="w-8 h-8 rounded-full border border-gray-600 bg-transparent text-gray-400 hover:border-gray-400 hover:text-white transition-colors flex items-center justify-center mr-1">
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
</button>
<button id="XX-help-btn" aria-label="How to play"
  class="w-8 h-8 rounded-full border border-gray-600 bg-transparent text-gray-400 text-sm font-bold hover:border-gray-400 hover:text-white transition-colors">
  ?
</button>
```

**Stats modal** — slides up from bottom (same pattern as How to Play). Shows game-specific lifetime stats:
- All games: Games Played, Win Rate (or equivalent), Current Streak, Best Streak
- Chip-based games (Roulettedle, BlackJackdle): also show Current Stack, Best/Worst single round, All-Time Net
- Score-based games (Chain Link): also show Average Score, Perfect Games count

**Stats tracking** — store all-time stats in a dedicated localStorage key (`XX_alltime_v2` or as extra fields on the existing stats key). Update on every game completion. Do **not** rely solely on today's session data.

**Stats key versioning** — stats keys use a `_v2` suffix (e.g. `td_stats_v2`, `cl_stats_v2`). If the stats schema changes in a way that makes old data incompatible (e.g. adding a required new field), bump the suffix to `_v3` so all users start fresh rather than carrying over malformed data.

**Rule:** Never put these buttons inside the game container or content area. They always live in the fixed header, top-right, on every game page.

### 5. Game-Over Result Panel (REQUIRED on every game page)

Every game page must show a result panel when the game is complete. The panel uses a consistent two-button row: **Share Results** (green) and **See Stats** (purple), side by side. Do **not** show inline streak/best/played stats inside this panel — those live in the full Stats modal.

```html
<div class="bg-gray-800/60 border border-gray-700 rounded-xl p-4 text-center flex flex-col items-center gap-2">
  <!-- game-specific result content (heading, score, answer, etc.) -->
  <div class="flex gap-2 mt-1 w-full justify-center">
    <button id="XX-share-btn"
      class="flex-1 px-5 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors">
      Share Results
    </button>
    <button onclick="XXGame.showStats()"
      class="flex-1 px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors">
      See Stats
    </button>
  </div>
  <p class="text-xs text-gray-500">Next [game] in: <span id="XX-countdown" class="font-mono text-yellow-300 tabular-nums">--:--:--</span></p>
</div>
```

To wire the **See Stats** button, expose `showStats()` (or equivalent) on a global object from within the JS IIFE:
```javascript
window.XXGame = { showStats: showStats };
```

### 6. Add to Home Page (`index.html`)
Add a card in the "Our Games" section grid. Follow the existing card pattern. The `data-fav-id` attribute is **required** — it must match the game's id in the `SITES` catalog in `favorites.js`; `favorites.js` uses it to inject the favorite star button and to clone the card's icon/description into Your Favorite Games.

```html
<article class="card our" data-fav-id="<game-slug>" onclick="goto('/<game-slug>/')" role="button" tabindex="0" aria-label="Play Game Name">
  <span class="badge">New</span>
  <div class="icon our">
    <!-- SVG icon for the game -->
    <svg viewBox="0 0 24 24" aria-hidden="true">...</svg>
  </div>
  <h3>Game Name</h3>
  <p>Short one-line description of the game.</p>
</article>
```

**Badge rules:**
- New games get `<span class="badge">New</span>`
- The flagship/oldest game gets `<span class="badge">Featured</span>`
- After a newer game is added, change the previous "New" badge to nothing or "Featured" as appropriate

### 7. Update the Sitemap (`sitemap.xml`)
Add a new `<url>` entry:
```xml
<url>
  <loc>https://dailyjamm.com/<game-slug>/</loc>
  <changefreq>daily</changefreq>
  <priority>0.9</priority>
</url>
```

**Sitemap rule (applies to ALL page work, not just new games):** Any time a page is added, renamed, or has significant content changes, verify `sitemap.xml` is up to date — correct URL, `lastmod` date, and appropriate `changefreq`/`priority`. This applies to info pages (about, releases, privacy, terms) and game pages alike. Never finish a page task without checking the sitemap.

### 8. Update the About Page (`/about/index.html`)
Add a description paragraph in the "Our Games" section, following the same pattern:
```html
<p><strong style="color:#fff">Game Name</strong> - One sentence describing the game and what makes it fun to play.</p>
```

### 9. Update Home Page Meta Description
If the new game is notable, update the `<meta name="description">` and `og:description` on `index.html` to mention it.

### 10. Verify on Dev, Then Pass Both Approval Gates (REQUIRED)
Every game is built on its `game/<slug>` branch and verified on the dev site first. It only reaches the `tst` branch after the user explicitly approves it for testing (gate 1), and only reaches `main` after the playtest is explicitly approved (gate 2). See "Release Workflow" at the top of this file.

### 11. Update Release Notes (REQUIRED for every release)

Every release — whether a new game, feature update, or notable fix — must be documented in **two places**:

1. **`README.md`** — add a new `### vX.Y.Z - YYYY-MM-DD` section at the top of the `## Releases` block
2. **`/releases/index.html`** — add a matching `<div class="release-block">` at the top of the page content (before the previous release's block)

The two should stay in sync with identical content. Release notes should be player-facing (describe the "what" and "why" users care about, not internal implementation details).

**Releases page conventions:**
- Only the **newest** release is shown expanded (a `<div class="release-block">`). When adding a new release, convert the previously-newest block to the collapsible `<details>` pattern used by all older releases: `<summary><span class="chevron">▶</span><h2>...</h2></summary><div class="release-body">...</div>`
- Any release that launches a new game gets a green **NEW GAME** badge in its `<h2>`: `<span style="background:#10b981;color:#000;font-size:.7em;font-weight:800;padding:2px 8px;border-radius:6px;vertical-align:middle">NEW GAME</span>` (visible even when collapsed)
- The v3.0.0 block has a **View Instructions** button (`onclick="DJFav.showIntro()"`) that re-shows the favorites intro modal

### 12. Game-Specific CSS
- Add game-specific styles to `/assets/css/styles.css` under a clearly commented section (e.g., `/* ── New Game ── */`)
- Use existing CSS variable names for colors
- Follow existing animation patterns (shake for errors, fade-up for entrances, pulse-glow for active states)

### 13. Game-Specific JavaScript
- Place game JS in `/assets/js/<game-slug>.js`
- Use `America/Chicago` timezone for daily puzzle rotation (DST-safe)
- Store game state in localStorage with a unique prefix (e.g., `ng_stats`, `ng_today`)
- Include streak tracking, share-to-clipboard, and countdown-to-next-puzzle
- Disable game replay if already completed today

---

## Checklist: Adding an External Game Link

When adding a new third-party game to the curated list:

### 1. Add to Home Page Card Grid
Add in the "Our Favorite Games" section of `index.html` (formerly "Other Daily Games"), keeping **alphabetical order**. Include a `data-fav-id` matching the id you add to the `SITES` catalog:
```html
<article class="card" data-fav-id="<game-id>" onclick="openExternal('https://example.com/')" role="button" tabindex="0" aria-label="Game Name">
  <div class="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><!-- icon --></svg></div>
  <h3>Game Name</h3>
  <p>Short description</p>
</article>
```

### 2. Add to Hamburger Nav on ALL Pages
Add to the "Our Favorite Games" section of the drawer nav in **alphabetical order** on every page:
```html
<a class="menu-link" href="https://example.com/" target="_blank" rel="noopener">Game Name</a>
```

Pages to update:
- `index.html`
- All 6 game pages (`/themedle/`, `/chainlink/`, `/blackjackdle/`, `/spelldle/`, `/roulettedle/`, `/holdle/`)
- All info pages (`/about/`, `/releases/`, `/terms/`, `/privacy/`)

### 3. Add to the Favorites Catalog
Add an entry to the `SITES` catalog in `/assets/js/favorites.js` (with `ext: true` for external games) so players can favorite it:
```javascript
gameid: { title: 'Game Name', url: 'https://example.com/', ext: true },
```

---

## File Structure Reference
```
/
├── index.html                    # Home page hub (Our Games / Your Favorite Games / Our Favorite Games)
├── 404.html                      # Not-found page
├── CNAME                         # Domain (dailyjamm.com)
├── sitemap.xml                   # SEO sitemap (update when adding pages)
├── robots.txt                    # Allows all crawling
├── server.py                     # Local dev server (port 8080, no-cache headers)
├── assets/
│   ├── css/styles.css            # Shared styles (header, drawer, favorites modal, all game styles)
│   ├── js/
│   │   ├── menu.js               # Hamburger drawer open/close (all pages)
│   │   ├── favorites.js          # Favorites system + intro modal (all pages)
│   │   ├── utils.js              # DJUtils shared helpers
│   │   ├── main.js               # Themedle game logic
│   │   ├── chainlink.js          # Chain Link game logic
│   │   ├── blackjackdle.js       # BlackJackdle game logic
│   │   ├── spelldle.js           # Spelldle game logic
│   │   ├── roulettedle.js        # Roulettedle game logic
│   │   ├── holdle.js             # Holdle game logic
│   │   ├── liarsdice.js          # Liar's Dice game logic
│   │   └── netzero.js            # Net Zero game logic
│   ├── data/
│   │   ├── chainlink-puzzles.json  # Chain Link puzzle data
│   │   └── spelldle-spells.json    # Spelldle spell data
│   ├── audio/                    # Themedle theme song MP3s
│   └── img/
│       └── favicon.png           # Site favicon
├── themedle/index.html           # Game pages (also chainlink, blackjackdle,
├── ...                           #   spelldle, roulettedle, holdle, liarsdice, netzero)
├── about/index.html              # About page
├── releases/index.html           # Release notes page
├── terms/index.html              # Terms of Service page
└── privacy/index.html            # Privacy Policy page
```

## Tracking IDs (do not change)
- **Google Analytics**: `G-XLRXG28EZV`

## Game Design Conventions
- **Daily reset**: Games use Chicago timezone (`America/Chicago` via `Intl.DateTimeFormat`) for consistent daily rotation
- **No backend**: All state in localStorage; no server, no database
- **Puzzle cycling**: Chain Link uses day-of-year (puzzle #1 = Jan 1, auto-resets each Jan 1). Other games cycle modularly off a fixed epoch. Prefer day-of-year for clean annual resets.
- **Scoring**: Use emoji dots in share text (🟢 = best, 🟡 = partial, 🔴 = missed)
- **Share format**: Copy-to-clipboard with game name, puzzle number, score, and emoji grid
- **Share buttons**: game-over result panels have two side-by-side buttons — **Share Results** (green, `bg-green-700`) and **See Stats** (purple, `bg-purple-600`). Stats modals have a separate **Share Stats** button (green).
- **Streaks**: Track current streak, best streak, total games played
- **localStorage key convention**: stats keys use a `_v2` suffix (`td_stats_v2`, `cl_stats_v2`, `spd_stats_v2`, `bj_stats_v2`, `bj_alltime_v2`, `rl_stats_v2`, `rl_alltime_v2`). Daily state keys have no suffix (`themedleDailyState`, `cl_today`, `spd_today`, `bj_today`, `rl_today`, `hd_today`, `bf_today`). Bump the suffix when resetting stats site-wide.
- **Site-wide localStorage keys** (not game-specific): `dj_cookie_ok` (cookie consent), `dj_favorites` (favorites list), `dj_seen_favs_intro` (favorites intro modal dismissed)
- **How to Play**: Show modal on first visit (check localStorage flag), include animated demo
- **Mobile**: 16px minimum font on inputs (prevents iOS zoom), use `viewport-fit=cover` for notch support
- **Accessibility**: ARIA labels on interactive elements, keyboard navigation (Enter activates role="button", ESC closes modals), screen-reader-only helper text via `.sr-only` class

---

## Home Page Structure (`index.html`)

Three sections, in this order (added in v3.0.0 "Your Games, Your Way"):
1. **Our Games** — cards for the 6 original games
2. **Your Favorite Games** — player-curated section, rendered entirely by `favorites.js` into `#yf-grid`; shows an empty-state hint (`#yf-empty`) plus a dashed "Add Your Own" card
3. **Our Favorite Games** — curated external games (renamed from "Other Daily Games" in v3.0.0)

**Section help popovers**: each section heading sits in a `.sec-head` with a `.sec-help` "?" button and a hidden `.sec-desc` popover (absolutely positioned, no layout shift). Behavior is device-aware via `matchMedia('(hover: hover) and (pointer: fine)')`: hover opens/closes on mouse devices; tap toggles on touch, and tapping elsewhere dismisses. Only one popover open at a time. Logic is inline in `index.html`.

**First-visit intro**: on the home page, `favorites.js` auto-shows the favorites intro modal 600ms after load if `dj_seen_favs_intro` is unset. Any dismissal sets the flag.

---

## Favorites System (`/assets/js/favorites.js`)

Loaded on **every page** (after `menu.js`, both `defer`). Exposes `window.DJFav = { openModal, closeModal, showIntro }`.

**localStorage**: single key `dj_favorites` — an ordered array of items:
- `{ type: 'site', id: '<catalog-id>' }` — a favorited built-in/curated game
- `{ type: 'custom', id: 'c<timestamp><rand>', title, url, icon }` — a player-added link

`load()` validates every item on read (unknown site ids, bad shapes, and non-http(s) URLs are silently dropped), so corrupt data can never break boot.

**`SITES` catalog**: id → `{ title, url, ext }` for all 6 our-games + all curated external games. Add every new game here (see checklists above). External entries set `ext: true` (open in new tab with `noopener,noreferrer`).

**What it renders:**
- **All pages**: injects a "Your Favorite Games" `.menu-sec` (id `fav-menu-sec`) into the drawer right after "Our Games", only when the list is non-empty. Re-rendered after every mutation.
- **Home only** (detected by `#yf-grid` existing):
  - Injects a `.fav-star` toggle button into every card with a `data-fav-id` attribute (star = top-LEFT of card; badges stay top-right)
  - Renders the Your Favorite Games grid: each card has ‹ › reorder buttons (`.yf-ctrl`, disabled at the ends), an × remove button (`.yf-remove`), the game's cloned icon + description (site favorites) or preset icon + hostname (custom links), plus the dashed "Add Your Own" card last
  - Wires the add-link modal (`#yf-modal-backdrop` markup lives in `index.html`): name (max 40 chars), URL, and a 6-icon picker (star, controller, globe, link, dice, trophy from the `ICONS` map)

**URL safety**: `safeUrl()` accepts only `http:`/`https:` (parsed via `new URL`); schemeless input gets `https://` prepended; `javascript:` and other schemes are rejected with an inline error. All user text is rendered via `textContent` — never `innerHTML`. The only `innerHTML` uses are static strings (`ICONS`, `INTRO_HTML`).

**Intro modal**: built lazily from the static `INTRO_HTML` string and appended to `<body>` on demand. Contains a pure-CSS animated demo (`.yf-demo` / `.yfd-*` classes, 8s keyframe loop showing a card being starred then two cards swapping; honors `prefers-reduced-motion`). `DJFav.showIntro()` opens it anywhere — used by the auto-show on home and the "View Instructions" button on the releases page. Closing sets `dj_seen_favs_intro`.

**CSS locations**: shared modal + demo styles live in `styles.css` under `/* ── Favorites ── */` (they use literal brand colors `#2ecc71`/`#45b7d1`, not vars, because game pages define different `--brand` values). Home-only styles (`.fav-star`, `.yf-ctrl`, `.yf-card`, add-modal fields, `.sec-help`/`.sec-desc`) are inline in `index.html`.

---

## Game-Specific Notes

### Chain Link (`/assets/js/chainlink.js`)

**Puzzle selection**: Day-of-year based — puzzle #1 plays on Jan 1 of each year, puzzle #88 on March 29, etc. Resets automatically on Jan 1 every year. Logic is in `getPuzzle()` using `Intl.DateTimeFormat` to get the Chicago date, then computing day-of-year.

**Puzzle data format** (`/assets/data/chainlink-puzzles.json`):
```json
{ "id": 1, "words": ["WORD1","WORD2","WORD3","WORD4","WORD5","WORD6"], "clues": ["clue1","clue2","clue3","clue4","clue5"] }
```
- **No `date` field** — dates were removed; ordering is by `id` only
- `words`: exactly **6 uppercase strings** (start word + 5 answers)
- `clues`: exactly **5 strings** (one phrase clue per link, matching each answer)
- Currently **365 puzzles** (ids 1–365). To add more, append with the next sequential id.

**Two-stage hint system** (per word):
| State | How reached | Points if correct |
|---|---|---|
| `hidden` | Start of word | 3 pts |
| `letter` | Press Hint OR guess wrong | 2 pts |
| `phrase` | Press Show Clue OR guess wrong again | 1 pt |
| auto-fill | Guess wrong with phrase showing, or Skip | 0 pts |

**Perfect bonus**: All 5 words solved from `hidden` state (total 15 pts) earns +5 bonus = **20/20**. Shown as "🌟 +5 perfect bonus!" on the results screen and in share text.

**clueState values**: `'hidden'` | `'letter'` | `'phrase'` — saved to localStorage via `saveTodayState()`.

**Hint button states**:
- Default: "Hint", enabled
- After `clueState === 'letter'`: button text changes to "Show Clue" (still enabled)
- After `clueState === 'phrase'` (no hints left): button text "No hints left", `disabled`, `opacity: 0.4`, `cursor: not-allowed` — **greyed out, not hidden**. Skip button position is unaffected.
- `resetClueUI()` restores button to default state on each new word.

**Active tile first-letter display**: When `clueState !== 'hidden'` (any hint has been used), the active chain tile shows the first letter of the target word instead of `?`. This is handled in `renderChain()`. The clue area still shows the full "Hint 1/2: First letter X" text — both update together.

---

### BlackJackdle (`/assets/js/blackjackdle.js`)

**Two distinct game-over screens**:
- `showFinalResults()` — all 3 hands played (normal end). Shows final chip count, session net, hand breakdown, share button, stats.
- `showBrokeScreen()` — player runs out of chips before completing all 3 hands. Shows "Out of Chips!" panel with hand results, share button, and countdown to next day.
- **Both screens have a Share Results button.** `shareResults()` targets `#bj-share-btn`; `shareBrokeResults()` targets `#bj-broke-share-btn`.

**Public API** (exposed on `window.BJGame`): `closeModal`, `showModal`, `shareResults`, `shareBrokeResults`, `shareStats`, `showStats`, `closeStats`.

**localStorage keys**: `bj_stats_v2`, `bj_alltime_v2`, `bj_today`

---

### Spelldle (`/assets/js/spelldle.js`)

**Spell data** (`/assets/data/spelldle-spells.json`):
```json
{ "id": 1, "name": "Acid Splash", "level": 0, "school": "Evocation", "castingTime": "action", "range": "medium", "components": "VS", "concentration": false, "ritual": false, "duration": "instant", "classes": ["sorcerer", "wizard"] }
```
- **339 spells** (SRD 5.2), ids 1–339. Append new spells with the next sequential id.
- `school`: Title Case (e.g. `"Evocation"`)
- `castingTime`: `"action"` | `"bonus"` | `"reaction"`
- `range`: tier string — `"self"` | `"touch"` | `"short"` | `"medium"` | `"long"` | `"special"`
- `components`: uppercase concatenated string — `"V"` | `"S"` | `"VS"` | `"VSM"` etc.
- `duration`: tier string — `"instant"` | `"round"` | `"minute"` | `"10min"` | `"hour"` | `"8hours"` | `"day"` | `"permanent"`
- `classes`: array of lowercase class names — `["bard","cleric","druid","paladin","ranger","sorcerer","warlock","wizard"]`

**Puzzle cycling**: Day-of-year based (same as Chain Link). `(dayIndex - 1) % 339` — 339 unique spells per cycle, no repeats for the first 339 days of the year.

**9 attributes** compared per guess:
| Attribute | Green | Yellow | Red |
|---|---|---|---|
| Level | Exact | Within ±2 (arrow) | >2 off (arrow) |
| School | Exact | — | Wrong |
| Casting Time | Exact | — | Wrong |
| Range | Exact tier | Adjacent tier (arrow) | >1 tier off (arrow) |
| Components | Exact | ≥1 letter in common | No overlap |
| Concentration | Exact | — | Wrong |
| Ritual | Exact | — | Wrong |
| Duration | Exact tier | Adjacent tier (arrow) | >1 tier off (arrow) |
| Class | Exact same set | ≥1 class in common | No overlap |

**Column tooltips**: Each column header uses a `data-tip` attribute. CSS `::after` pseudo-element shows a styled tooltip on desktop hover. Tooltip container requires `overflow: visible` on `.spd-container` (do not revert to `overflow: hidden`).

**Class abbreviations** (defined in `CLASS_ABBREVS` constant): Brd/Clr/Drd/Pal/Rgr/Sor/Wlk/Wiz

**localStorage keys**: `spd_stats_v2`, `spd_today`, `spd_seen_howto`

---

### Holdle (`/assets/js/holdle.js`)

Texas Hold'em poker game. Player faces 3 randomly selected AI opponents each day (seeded from date). 3 hands are played per session; chip total carries over. Starting chips: 1,000.

**localStorage keys**: `hd_stats_v2`, `hd_alltime_v2`, `hd_ai_stats_v2`, `hd_today`, `hd_chips`, `hd_seen_howto`, `hd_bonus_date`

**Daily AI selection**: `getDailyAIIndexes(dateStr)` shuffles indices 0-5 using a seeded RNG and returns 3 for the day. Same 3 opponents for all players on a given date.

**AI Personalities:**

| ID | Name | Style | Aggression | Decide fn | Notes |
|---|---|---|---|---|---|
| 0 | David | Bluffer | Very High | `davidDecide` | Raises frequently with weak hands; 55% bluff-raise post-flop; last hand can all-in |
| 1 | Peter | Rock | Very Low | `peterDecide` | Only plays premium hands; never goes all-in (too conservative) |
| 2 | Jon | Math | Medium | `jonDecide` | Calculates pot odds; on last hand with equity > 0.80 will all-in |
| 3 | Caleb | Draw Chaser | Medium | `calebDecide` | Loves suited hands; last hand will all-in on strong draws (oc >= 8) |
| 4 | Mandy | Balanced | Medium | `mandyDecide` | Reads pot odds + mixes in aggression; last hand will all-in with equity > 0.70 |
| 5 | Madelyn | Random | Unpredictable | `madelynDecide` | Completely random; all-in only available on last hand |
| 6 | Josh | Semi-bluffer | Low-Medium | `joshDecide` | Plays decent hands sensibly; ~15% preflop bluff, ~18% post-flop bluff; all-in on last hand with strong hands |

**Hand-awareness rules** (all AIs):
- Hand 1 (`handNum=0`): raises capped at 45% of stack via `safeRaise()`; no all-in actions
- Hand 2 (`handNum=1`): raises capped at 70% of stack; no all-in actions
- Hand 3 (`handNum=2`): no raise cap; all-in allowed for appropriate personalities (David, Jon, Caleb, Mandy, Madelyn, Josh); Peter never goes all-in regardless

**AI chip persistence**: AI stacks start at 1,000 each day and carry over between hands within the day (same as the player). Saved in `hd_today.aiChips[]` and restored on page reload. Each new day `buildAIStates` resets them to 1,000.

**Daily bonus**: Player receives 100-500 chips (in increments of 10, matching BlackJackdle style) each day on their first visit.

**Madelyn peek feature**: On each new hand, there is a 1% chance Madelyn's hole cards briefly appear face-up with a chat bubble ("Is this good??") for ~2.4 seconds before flipping back over and play begins. Implemented in `maybeShowMadelynPeek()`.

**Per-AI head-to-head stats**: `hd_ai_stats_v2` stores `{ [aiId]: { w, l, f } }` - wins, losses, and folds per AI across all sessions. Updated in `recordAIStats(type)` called from `finishHand`. Displayed in the stats modal under "Head-to-Head" with W/L/F columns and win percentage per AI.

**Betting flow:**
- Pre-flop: AIs act first (SB/BB posted), then player acts (button). If player raises, AIs respond again. If an AI re-raises, player gets one more action.
- Post-flop (Flop/Turn/River): Player acts first, then AIs. If an AI raises, player gets another action before street advances.
- `proceedAfterPlayerAction()` handles the re-action loop for both streets.

**Side-pot payouts** (v3.0.0): `doShowdown()` distributes the pot in contribution layers - each contender (player `playerTotalBet`, AIs `ai.totalBet`) can only win pot layers their own contribution reaches. Folded players' chips are dead money won by layer winners; a top layer nobody live matched (an uncalled bet) is refunded to its contributor. Split layers give the floor share to each winner and the remainder to the first, so chips are always conserved exactly. `playerTotalBet` tracks the player's full hand contribution (ante + every street) and is the basis for `playerNet`; do not use `playerStreetBet` for hand results (it resets each street).

**Display conventions**: AI raise bubbles read `RAISE TO <n>` where n is the street total (including ante on preflop). At showdown the pot is zeroed and all stack labels refreshed in the same tick as the payout.

**Card highlighting**: `getRelevantCards(combo)` strips kicker cards from the best 5-card combo, returning only the cards that form the named hand (e.g. for "Pair of Aces" - returns only the 2 aces, not the 3 kickers).

**Sequential dealing**: `dealHoleCardsSequentially()` deals in poker order (P, AI0, AI1, AI2, P, AI0, AI1, AI2) with 190ms gaps. `dealFlop()` deals 3 community cards with 220ms gaps.

---

### Liar's Dice (`/assets/js/liarsdice.js`)

Page lives at `/liarsdice/`; favorites catalog id is `liarsdice`. Internal identifiers keep the original `bf` prefix (localStorage `bf_*`, DOM ids `bf-*`, CSS `.bf-*`, `window.BFGame`) - renaming those would reset playtester stats for no user-visible gain.

Daily Liar's Dice. Player + 3 daily AI opponents (same 7-character cast as Holdle, date-seeded via `getDailyAIIndexes`), 5 dice each, **no wilds**, **sudden death** - one lost challenge eliminates you entirely.

**localStorage keys**: `bf_stats_v2`, `bf_today`, `bf_seen_howto`

**Rules implemented**: bids are (quantity, face) claims about ALL dice on the table. A raise must be `q > curQ` (any face) or `q == curQ && f > curF`. Quantity is capped at total dice on the table; if the current bid is at max (q == totalDice, f == 6) the next player is forced to challenge. Challenge reveals all dice: bid true → challenger out; bid false → bidder out. Player elimination ends the day immediately (AIs do not finish the table). After each elimination, survivors reshake and a new round starts with the seat after the eliminated one; round 1 opens with the player.

**Determinism / anti-refresh**: dice for round r come from `mulberry32(dateSeed + r * 7919)`; AI decisions use `mulberry32(dateSeed + round * 7919 + 131 + turnCount * 97)`. Full game state is saved to `bf_today` after every action and restored mid-round on reload (including mid-reveal).

**AI personalities** (params on `AI_DEFS`: `challenge` = call-liar probability threshold on P(bid true), `bluff` = chance of bidding a face they barely hold, `jump` = chance of a +2 quantity jump): David bluffs heavily and rarely calls; Peter calls early and never bluffs; Jon plays the exact binomial probabilities; Caleb pushes his best face; Mandy is balanced with noise; Madelyn is chaotic with random Liar calls; Josh is a light semi-bluffer. Probability engine is `probAtLeast(need, n)` = P(Binomial(n, 1/6) >= need) over the dice the AI cannot see. All AIs get more suspicious when a bid exceeds half the table's dice.

**Stats** (`bf_stats_v2`): played, wins, streaks, `place[0..3]` (finishes indexed by AIs outlasted; 3 = won the table), and `hh` head-to-head records - only challenges the player was part of count (player eliminated an AI, or an AI eliminated the player).

**Dice rendering**: `makeDie(face, cls)` builds a 3x3 CSS grid with pip cells (`.bf-die`, size variants `bf-die-sm/-bid/-pick`, hidden AI dice use `.bf-die-hidden` with a "?"). Public API on `window.BFGame`: `showStats`, `closeStats`, `shareStats`, `showModal`, `closeModal`.

---

### Net Zero (`/assets/js/netzero.js`)

Page lives at `/netzero/`; favorites catalog id is `netzero`. Internal identifiers keep the original
`sb` prefix (localStorage `sb_*`, DOM ids `sb-*`, CSS `.sb-*`, `window.SBGame`) - the game was built
as "Sabaac" and renamed before it ever shipped, so renaming internals would only churn code.

Daily closest-to-zero card game. Player + 3 daily AI opponents (same 7-character cast as Holdle,
date-seeded via `getDailyAIIndexes`), 3 rounds, then a showdown.

**localStorage keys**: `sb_stats_v2`, `sb_today`, `sb_seen_howto`

**Cards**: A through 10 in all four suits, no face cards. Black (♠ ♣) adds its value, red (♥ ♦)
subtracts. Hand total is the sum; closest to zero wins. Ties go to a positive total, then to more
cards. Exactly zero is a "Pure Net Zero".

**The face-up card**: exactly one card sits face up on the table (`upCard`), dealt from the deck
during `freshGame` and persisted in `sb_today`. **Swap exchanges a hand card with `upCard`** - the
player takes the face-up card and the card they gave up becomes the new face-up card for everyone.
Swap never touches the deck; only Draw does. `aiDecide` evaluates swaps against the actual `upCard`
value rather than guessing, and a Shift discards the face-up card and deals a fresh one. On restore,
a save with no `upCard` (from before the mechanic existed) deals one so swapping cannot be dead for
the rest of the day.

**Rounds**: everyone starts with 2 cards; each turn is Stand, Draw (up to `HAND_MAX`), or Swap.
After rounds 1 and 2 two dice are rolled - **doubles trigger a Shift**, throwing out and redrawing
every hand. Do not call these "spike dice" in player-facing copy; they are just "the dice".


## Security Practices

### No Advertising (AdSense removed)
DailyJamm does **not** use Google AdSense or any other ad network. The only third-party script is Google Analytics (`G-XLRXG28EZV`). Do not add ad scripts.

### Cookie Consent & Analytics Gating
- The cookie consent bar (`dj-cookie-bar`) is shown on first visit via `index.html`.
- GA's `gtag('config', ...)` call is **gated** on `localStorage.getItem('dj_cookie_ok')` on every page.
- When the user clicks "Got it", the bar stores `dj_cookie_ok=1` and immediately fires `gtag('config', 'G-XLRXG28EZV')` for the current session.
- The cookie bar text says "analytics" only — do not add "advertising" back since AdSense is removed.

### DOM Safety — No `innerHTML` with User/External Data
- **Never** assign `innerHTML` with values derived from user input, localStorage strings, or external data fetches.
- For stat rows, use `DJUtils.setStatRows(containerId, rows)` — defined in `/assets/js/utils.js`.
- For suggestion dropdowns and result dots, use `document.createElement` + `textContent`.
- `innerHTML` is acceptable only for clearing a container (`el.innerHTML = ''` → prefer `el.textContent = ''`) or static strings with no variable interpolation.
- The existing `escHtml()` utility in `main.js` is available for Themedle-specific escaping needs.

### Content Security Policy
All pages include a `<meta http-equiv="Content-Security-Policy">` tag. The CSP allows:
- Scripts only from `'self'`, `googletagmanager.com`, and `cdn.tailwindcss.com`
- Inline scripts (required for GA init) via `'unsafe-inline'`
- Images from `'self'`, `data:`, and any `https:` source
- Fetch/XHR only to `'self'`, `google-analytics.com`, and `googletagmanager.com`

**Themedle** additionally needs `media-src 'self'` for audio files.

If you add a new external script or font source, update the CSP on the relevant page(s).

### Referrer Policy
All pages include `<meta name="referrer" content="strict-origin-when-cross-origin" />` to prevent leaking full URLs to third-party sites via the `Referer` header.

---

## Common Pitfalls
- **Curly quotes**: Always use straight quotes in JS (`'` and `"`, never `'` `'` `"` `"`). Curly quotes in onclick handlers cause silent JS failures.
- **Nav sync**: The hamburger nav is duplicated in every page's HTML. When adding a game, you must update ALL pages' nav or they'll be out of sync. (The "Your Favorite Games" drawer section is the exception — it is injected by `favorites.js` and must NOT be hardcoded anywhere.)
- **Inline header CSS**: Never define `.site-header`, `.site-brand`, `.hamburger`, `.backdrop`, `.drawer`, or `.menu-*` CSS inside a page's `<style>` block. All of that lives in `/assets/css/styles.css`. Duplicating it inline causes visual inconsistency across pages (different font sizes, colors, blur values) and was the root cause of the "DailyJamm moves and changes style" bug. Every page must link styles.css and use `class="site-header"` / `class="site-brand"` with no extra Tailwind classes on those elements.
- **Header inner wrapper**: Do not add a wrapper `<div>` inside `<header class="site-header">`. The header is a flex container itself — all children (hamburger, brand link, spacer, buttons) are direct flex children.
- **iOS safe areas**: Always include `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style` metas.
- **GitHub Pages cache mismatch**: After pushing JS + data file changes together, Pages may serve a stale JS with the new data (or vice versa), causing JS errors caught as "Failed to load puzzle." If this happens, a hard refresh or waiting a few minutes resolves it. Ensure JS and data changes are compatible in both old and new states when possible.
- **`styles.css` cache busting**: All pages link to `styles.css` with a version query string (currently `?v=20260731`). Whenever `styles.css` gains new rules (e.g. adding a new game), bump this version on ALL pages — otherwise mobile and desktop browsers serve the old cached CSS and new game elements render unstyled. Update the version in all 12 pages: `index.html`, `404.html`, all game pages, and all info pages.
- **New external resources**: If you add a new CDN, font, or API endpoint, update the CSP meta on every affected page. Forgetting this will silently block the resource in supporting browsers.
- **Bare `JSON.parse` aborts boot**: Never call `JSON.parse(localStorage.getItem(...))` without a try/catch at the top level of a boot function. A malformed stored value will throw, silently aborting `boot()` mid-execution — game state never restores, result panels stay empty, and there is no visible error. Always wrap in try/catch or use `DJUtils.loadJSON()` which handles this safely.
- **Stats key versioning**: When adding fields to a stats object that old saves won't have, bump the key suffix (e.g. `_v2` → `_v3`) rather than trying to migrate. Stale data under the old key is simply ignored and users start fresh. Do not remove the old key proactively — it ages out naturally as players accumulate new data.
