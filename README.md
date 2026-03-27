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

Press `Ctrl+C` in the terminal to stop the server.

---

## Releases

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
