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
- All game data stored locally — no account needed
- Library of **117 TV theme songs** spanning cartoons, kids shows, and live-action series from the 80s through 2010s

Play it: [dailyjamm.com/themedle](https://dailyjamm.com/themedle)

### Chain Link
A daily compound word chain puzzle — find the 5 missing words that link the chain.

- A starting word is given; each answer forms a compound word or phrase with the word above it
- The answer then becomes the start of the next link in the chain
- Each word starts worth **3 pts** — click **Clue** to reveal a hint (max 2 pts), or guess blind for full points
- Guess wrong and the clue is revealed automatically; correct on the next try scores 1 pt
- Guess wrong with the clue showing and the answer is filled in for 0 pts
- Skip a word to move on (scores 0)
- Perfect score is 15/15
- Streak tracking and games played saved across sessions
- All game data stored locally — no account needed
- **30 puzzles** in `assets/data/chainlink-puzzles.json`, cycling indefinitely (one per day)

Play it: [dailyjamm.com/chainlink](https://dailyjamm.com/chainlink)

---

## Other Daily Games

DailyJamm also curates a collection of other daily games we love:

- [Akari](https://dailyakari.com/) — Daily logic puzzle, light up each cell
- [Bandle](https://bandle.app/) — Guess the song by progressively adding instruments
- [Circuits](https://www.puzzmo.com/play/circuits/) — Connect compound words with guesses
- [Connections](https://www.nytimes.com/games/connections) — Group words that share a theme
- [Contexto](https://contexto.me/en/) — Find the secret word by semantic guessing
- [Costcodle](https://costcodle.com/) — Guess the price of a Costco item
- [Cross|word](https://www.puzzmo.com/play/crossword/) — Classic daily crossword
- [Daily Dozen](https://dailydozentrivia.com/) — 12 daily trivia questions
- [Framed](https://framed.wtf/) — Identify the movie from a single frame at a time
- [Guess the Game](https://guessthe.game/) — Name the video game from hints
- [Heardle](https://heardlewordle.io/) — Guess the song from short clips
- [Linxicon](https://linxicon.com/) — Link two keywords with guesses
- [Minecraftle](https://minecraftle.zachmanson.com/) — Guess the daily crafted item
- [Pips](https://www.nytimes.com/games/pips) — Place the dominos in the correct orientation
- [Raddle](https://raddle.quest/) — Solve a daily word ladder puzzle
- [Songless](https://lessgames.com/songless) — Guess the song in short clips
- [Spelling Bee](https://www.nytimes.com/puzzles/spelling-bee) — Make as many words as you can
- [Spotle](https://spotle.io/) — Guess the artist using Spotify-style clues
- [Taylor Swift Heardle](https://heardlewordle.io/taylor-swift-heardle) — Guess the Taylor Swift song
- [Wordle](https://www.nytimes.com/games/wordle/index.html) — The OG word-guessing game

---

## Running Locally

Requires Python 3 (comes pre-installed on macOS).

```bash
cd path/to/martinpeter10.github.io
python3 -m http.server 8080
```

Then open your browser to:
- `http://localhost:8080` — DailyJamm home
- `http://localhost:8080/themedle/` — Themedle game
- `http://localhost:8080/chainlink/` — Chain Link game

Press `Ctrl+C` in the terminal to stop the server.

---

## Releases

### v1.2.0 — 2026-03-27
- Launched **Chain Link** — daily compound word chain puzzle with 30 puzzles cycling indefinitely
- Chain Link scoring overhaul: clue-based system (3 pts blind / 2 pts with clue / 1 pt after wrong guess / 0 pts auto-fill)
- Puzzle data extracted to `assets/data/chainlink-puzzles.json` — add new puzzles without touching source code
- Added **How to Play** modal to Chain Link (animated demo, shown once on first visit)
- Added **How to Play** modal to Themedle (animated demo with wrong → correct guess flow, shown once on first visit)
- Chain Link submit button renamed from "Go" to "Enter"

### v1.1.0 — 2026-03-27
- Fixed volume slider track not updating visually when dragged (bar was stuck at 50%)
- Changed audio preload from `auto` to `none` — MP3 no longer downloads on page load, only on Play
- Optimized favicon images from ~2.3 MB total down to under 20 KB

### v1.0.0 — Initial Release
- Daily TV theme song guessing game (Wordle-style, 6 attempts)
- Streak tracking and best streak memory
- Autocomplete for known show names
- Countdown timer to next song
- All game data stored in localStorage
