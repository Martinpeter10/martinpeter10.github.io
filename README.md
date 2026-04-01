# DailyJamm

**DailyJamm** is a daily games hub where players can enjoy original games built by us and discover other daily games they might enjoy.

Live site: [dailyjamm.com](https://dailyjamm.com)

---

## Our Games

### Themedle
A daily TV show theme song guessing game inspired by Wordle-style gameplay.

- Listen to a short clip of a TV theme song and guess the show title in up to 6 attempts
- Each wrong guess or skip reveals a longer clip (1 → 2 → 3 → 5 → 10 → 15 seconds)
- Autocomplete suggestions to help narrow down your guess
- Color-coded feedback on each guess (correct, wrong, skipped)
- Streak tracking and best streak saved across sessions
- Countdown timer to the next daily challenge
- All game data stored locally - no account needed
- Library of **117 TV theme songs** spanning cartoons, kids shows, and live-action series from the 80s through 2010s

Play it: [dailyjamm.com/themedle](https://dailyjamm.com/themedle)

### Chain Link
A daily compound word chain puzzle - find the 5 missing words that link the chain.

- A starting word is given; each answer forms a compound word or phrase with the word above it
- The answer then becomes the start of the next link in the chain
- Two-stage hint system per word:
  - Guess with no hints for **3 pts**
  - Press **Hint** (or guess wrong) to reveal the first letter — correct now scores **2 pts**
  - Press **Show Clue** (or guess wrong again) to reveal the phrase clue — correct now scores **1 pt**
  - Guess wrong with the phrase clue showing, or skip at any time, for **0 pts**
- Solve all 5 words with no hints or wrong guesses for a **+5 perfect bonus** (20/20)
- Streak tracking and games played saved across sessions
- All game data stored locally - no account needed
- **30 puzzles** in `assets/data/chainlink-puzzles.json`, cycling indefinitely (one per day)

Play it: [dailyjamm.com/chainlink](https://dailyjamm.com/chainlink)

### BlackJackdle
A daily blackjack game - 3 hands per day, beat the dealer and build your chip stack.

- Start with 1,000 chips and receive a daily bonus (50-100 chips) each session
- Play up to 3 hands per day - bet any amount, then Hit, Stand, Double Down, or Split
- Dealer follows standard blackjack rules (hit on soft 16, stand on 17+)
- Results saved locally - return tomorrow for 3 new hands
- All game data stored locally - no account needed

Play it: [dailyjamm.com/blackjackdle](https://dailyjamm.com/blackjackdle)

### Spelldle
A daily D&D 5E spell guessing game - identify the spell from its attributes in up to 8 tries.

- Guess any spell from a library of **339 D&D 5E spells** (SRD 5.2)
- After each guess, 9 attribute tiles reveal how close you are:
  - **Level** - exact match is green; within ±2 is yellow with arrow showing direction
  - **School** - exact match only (Abjuration, Conjuration, Divination, etc.)
  - **Casting Time** - Action, Bonus Action, or Reaction
  - **Range** - proximity-based tiers (Self → Touch → 30 ft → 60-120 ft → 150+ ft → Special)
  - **Components** - V, S, M or combinations; yellow if at least one component matches
  - **Concentration** - Yes or No
  - **Ritual** - Yes or No
  - **Duration** - proximity-based tiers (Instant through Permanent)
  - **Class** - which D&D classes can cast it; yellow if at least one class matches
- Hover tooltips on each column header explain the D&D rules for that attribute
- Spell data in `assets/data/spelldle-spells.json` - 339 unique spells cycle day-of-year before any repeat
- Streak tracking, share-to-clipboard emoji grid, countdown to next spell

Play it: [dailyjamm.com/spelldle](https://dailyjamm.com/spelldle)

---

## Other Daily Games

DailyJamm also curates a collection of other daily games we love:

- [Akari](https://dailyakari.com/) - Daily logic puzzle, light up each cell
- [Bandle](https://bandle.app/) - Guess the song by progressively adding instruments
- [Circuits](https://www.puzzmo.com/play/circuits/) - Connect compound words with guesses
- [Connections](https://www.nytimes.com/games/connections) - Group words that share a theme
- [Contexto](https://contexto.me/en/) - Find the secret word by semantic guessing
- [Costcodle](https://costcodle.com/) - Guess the price of a Costco item
- [Cross|word](https://www.puzzmo.com/play/crossword/) - Classic daily crossword
- [Daily Dozen](https://dailydozentrivia.com/) - 12 daily trivia questions
- [Framed](https://framed.wtf/) - Identify the movie from a single frame at a time
- [Guess the Game](https://guessthe.game/) - Name the video game from hints
- [Heardle](https://heardlewordle.io/) - Guess the song from short clips
- [Linxicon](https://linxicon.com/) - Link two keywords with guesses
- [Minecraftle](https://minecraftle.zachmanson.com/) - Guess the daily crafted item
- [Pips](https://www.nytimes.com/games/pips) - Place the dominos in the correct orientation
- [Raddle](https://raddle.quest/) - Solve a daily word ladder puzzle
- [Songless](https://lessgames.com/songless) - Guess the song in short clips
- [Spelling Bee](https://www.nytimes.com/puzzles/spelling-bee) - Make as many words as you can
- [Spotle](https://spotle.io/) - Guess the artist using Spotify-style clues
- [Taylor Swift Heardle](https://heardlewordle.io/taylor-swift-heardle) - Guess the Taylor Swift song
- [Wordle](https://www.nytimes.com/games/wordle/index.html) - The OG word-guessing game

---

## Running Locally

Requires Python 3 (comes pre-installed on macOS).

```bash
cd path/to/martinpeter10.github.io
python3 -m http.server 8080
```

Then open your browser to:
- `http://localhost:8080` - DailyJamm home
- `http://localhost:8080/themedle/` - Themedle game
- `http://localhost:8080/chainlink/` - Chain Link game
- `http://localhost:8080/blackjackdle/` - BlackJackdle game
- `http://localhost:8080/spelldle/` - Spelldle game
- `http://localhost:8080/about/` - About page
- `http://localhost:8080/privacy/` - Privacy Policy

Press `Ctrl+C` in the terminal to stop the server.

---

## Releases

### v1.6.0 - 2026-03-30
- Launched **Spelldle** - daily D&D 5E spell guessing game with 9 attribute columns
- Spell library sourced from SRD 5.2: 339 unique spells cycling day-of-year before any repeat
- Attributes: Level (proximity ±2), School, Casting Time, Range (tier), Components (partial match), Concentration, Ritual, Duration (tier), Class (partial match)
- Hover tooltips on all column headers with D&D rules descriptions
- Added Spelldle to homepage card grid, nav menus, and sitemap

### v1.5.0 - 2026-03-29
- Chain Link scoring overhaul: two-stage hint system (first letter → phrase clue) replaces single-clue system
- Guessing correctly without any hints: 3 pts; after first-letter hint: 2 pts; after phrase clue: 1 pt; wrong/skip with phrase showing: 0 pts
- Wrong guess with no hints now reveals the first letter (same as pressing Hint once) instead of jumping straight to the phrase clue
- Added **+5 perfect bonus** for solving all 5 words with no hints or wrong guesses (max score 20)
- BlackJackdle: "Out of chips" game-over screen now includes a Share Results button

### v1.4.0 - 2026-03-28
- Added **About** page (`/about/`) and **Privacy Policy** page (`/privacy/`) - required for Google AdSense approval
- Footer on homepage now links to About and Privacy Policy
- Info section added to hamburger menu on all pages
- BlackJackdle card draw animations: hit, double down, and dealer draws now use flying card animation
- Dealer hole card reveals with a flip animation
- Existing cards slide smoothly (FLIP technique) when a new card is added to a hand
- Chain Link How to Play modal redesigned as a bottom-sheet on mobile (fully scrollable, safe-area aware)

### v1.3.0 - 2026-03-28
- Launched **BlackJackdle** - daily blackjack with 3 hands per day, chip stack, and daily bonus
- Added BlackJackdle to homepage card grid, nav menus (all games), and sitemap

### v1.2.0 - 2026-03-27
- Launched **Chain Link** - daily compound word chain puzzle with 30 puzzles cycling indefinitely
- Chain Link scoring overhaul: clue-based system (3 pts blind / 2 pts with clue / 1 pt after wrong guess / 0 pts auto-fill)
- Puzzle data extracted to `assets/data/chainlink-puzzles.json` - add new puzzles without touching source code
- Added **How to Play** modal to Chain Link (animated demo, shown once on first visit)
- Added **How to Play** modal to Themedle (animated demo with wrong → correct guess flow, shown once on first visit)
- Chain Link submit button renamed from "Go" to "Enter"

### v1.1.0 - 2026-03-27
- Fixed volume slider track not updating visually when dragged (bar was stuck at 50%)
- Changed audio preload from `auto` to `none` - MP3 no longer downloads on page load, only on Play
- Optimized favicon images from ~2.3 MB total down to under 20 KB

### v1.0.0 - Initial Release
- Daily TV theme song guessing game (Wordle-style, 6 attempts)
- Streak tracking and best streak memory
- Autocomplete for known show names
- Countdown timer to next song
- All game data stored in localStorage
