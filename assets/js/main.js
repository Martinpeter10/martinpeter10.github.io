// main.js — Themedle game logic (with CSS-timed playback bar)
//
// Expects these DOM IDs in index.html:
// playBtn, volumeSlider, clipLength, progressBar, maxClipIndicator, guessInput,
// suggestions, submitGuess, skipGuess, gameOverModal, gameOverTitle, gameOverMessage,
// correctAnswer, currentStreak, bestStreak, gamesPlayed, countdown, answerDisplay, displayedAnswer,
// closeModal, plus guessSlot-1 .. guessSlot-6

// -------------------- Game State --------------------
let currentGuess = 1;
let gameOver = false;
let currentClipLength = 1;
let isPlaying = false;
let currentSong;
let audioElement;

let gameStats = {
  currentStreak: 0,
  bestStreak: 0,
  gamesPlayed: 0,
  lastPlayedDate: null
};

let dailyGameState = {
  date: null,
  completed: false,
  won: false,
  guesses: [],
  currentGuess: 1,
  songIndex: 0
};

// -------------------- Data --------------------
const themeSongs = [
  { title: "Adventure Time", url: "/assets/audio/adventuretime.mp3" },
  { title: "All Grown Up", url: "/assets/audio/allgrownup.mp3" },
  { title: "As Told By Ginger", url: "/assets/audio/astoldbyginger.mp3" },
  { title: "Avatar The Last Airbender", url: "/assets/audio/avatarthelastairbender.mp3" },
  { title: "Back At The Barnyard", url: "/assets/audio/backatthebarnyard.mp3" },
  { title: "Barney", url: "/assets/audio/barney.mp3" },
  { title: "Bear In The Big Blue House", url: "/assets/audio/bearinthebigbluehouse.mp3" },
  { title: "Ben 10", url: "/assets/audio/ben10.mp3" },
  { title: "Between The Lions", url: "/assets/audio/betweenthelions.mp3" },
  { title: "Blues Clues", url: "/assets/audio/bluesclues.mp3" },
  { title: "Bob The Builder", url: "/assets/audio/bobthebuilder.mp3" },
  { title: "Caillou", url: "/assets/audio/caillou.mp3" },
  { title: "Camp Lazlo", url: "/assets/audio/camplazlo.mp3" },
  { title: "CatDog", url: "/assets/audio/catdog.mp3" },
  { title: "Catscratch", url: "/assets/audio/catscratch.mp3" },
  { title: "Charlie and Lola", url: "/assets/audio/charlieandlola.mp3" },
  { title: "Chowder", url: "/assets/audio/chowder.mp3" },
  { title: "Clifford The Big Red Dog", url: "/assets/audio/cliffordthebigreddog.mp3" },
  { title: "Code Lyoko", url: "/assets/audio/codelyoko.mp3" },
  { title: "Codename: Kids Next Door", url: "/assets/audio/codenamekidsnextdoor.mp3" },
  { title: "Cory In The House", url: "/assets/audio/coryinthehouse.mp3" },
  { title: "Courage The Cowardly Dog", url: "/assets/audio/couragethecowardlydog.mp3" },
  { title: "Cyber Chase", url: "/assets/audio/cyberchase.mp3" },
  { title: "Danny Phantom", url: "/assets/audio/dannyphantom.mp3" },
  { title: "Degrassi", url: "/assets/audio/degrassi.mp3" },
  { title: "Dexters Laboratory", url: "/assets/audio/dexterslaboratory.mp3" },
  { title: "Dora The Explorer", url: "/assets/audio/doratheexplorer.mp3" },
  { title: "Doug", url: "/assets/audio/doug.mp3" },
  { title: "Dragon Tales", url: "/assets/audio/dragontales.mp3" },
  { title: "Drake and Josh", url: "/assets/audio/drakeandjosh.mp3" },
  { title: "Ed Edd n Eddy", url: "/assets/audio/ededdneddy.mp3" },
  { title: "El Tigre", url: "/assets/audio/eltigre.mp3" },
  { title: "Even Stevens", url: "/assets/audio/evenstevens.mp3" },
  { title: "The Grim Adventures of Billy and Mandy", url: "/assets/audio/grimadventures.mp3" },
  { title: "The Amazing World of Gumball", url: "/assets/audio/gumball.mp3" },
  { title: "The Amanda Show", url: "/assets/audio/theamandashow.mp3" },
  { title: "The Angry Beavers", url: "/assets/audio/theangrybeavers.mp3" },
  { title: "The Backyardigans", url: "/assets/audio/thebackyardigans.mp3" },
  { title: "The Berenstain Bears", url: "/assets/audio/theberenstainbears.mp3" },
  { title: "The Fairly Odd Parents", url: "/assets/audio/thefairlyoddparents.mp3" },
  { title: "Arthur", url: "/assets/audio/arthur.mp3" },
  { title: "The Marvelous Misadventures of Flapjack", url: "/assets/audio/flapjack.mp3" },
  { title: "Fosters Home for Imaginary Friends", url: "/assets/audio/fostershomeforimaginaryfriends.mp3" },
  { title: "Franklin", url: "/assets/audio/franklin.mp3" },
  { title: "Full House", url: "/assets/audio/fullhouse.mp3" },
  { title: "Go Diego Go", url: "/assets/audio/godiegogo.mp3" },
  { title: "Hannah Montana", url: "/assets/audio/hannahmontana.mp3" },
  { title: "Hey Arnold", url: "/assets/audio/heyarnold.mp3" },
  { title: "ICarly", url: "/assets/audio/icarly.mp3" },
  { title: "Jay Jay the Jet Plane", url: "/assets/audio/jayjaythejetplane.mp3" },
  { title: "Jessie", url: "/assets/audio/jessie.mp3" },
  { title: "Johnny Bravo", url: "/assets/audio/johnnybravo.mp3" },
  { title: "Johnny Test", url: "/assets/audio/johnnytest.mp3" },
  { title: "Kim Possible", url: "/assets/audio/kimpossible.mp3" },
  { title: "Lilo and Stitch", url: "/assets/audio/liloandstitch.mp3" },
  { title: "Little Einsteins", url: "/assets/audio/littleeinsteins.mp3" },
  { title: "Madeline", url: "/assets/audio/madeline.mp3" },
  { title: "Malcolm in the Middle", url: "/assets/audio/malcolminthemiddle.mp3" },
  { title: "Max and Ruby", url: "/assets/audio/maxandruby.mp3" },
  { title: "Mister Rogers Neighborhood", url: "/assets/audio/misterrogersneighborhood.mp3" },
  { title: "My Life as a Teenage Robot", url: "/assets/audio/mylifeasateenagerobot.mp3" },
  { title: "Neds Declassified School Survival Guide", url: "/assets/audio/nedsdeclassifiedschoolsurvivalguide.mp3" },
  { title: "Phil of the Future", url: "/assets/audio/philofthefuture.mp3" },
  { title: "Phineas and Ferb", url: "/assets/audio/phineasandferb.mp3" },
  { title: "Pokemon", url: "/assets/audio/pokemon.mp3" },
  { title: "Mighty Morphin Power Rangers", url: "/assets/audio/powerrangers.mp3" },
  { title: "Recess", url: "/assets/audio/recess.mp3" },
  { title: "Rocket Power", url: "/assets/audio/rocketpower.mp3" },
  { title: "Rolie Polie Olie", url: "/assets/audio/roliepolieolie.mp3" },
  { title: "Rugrats", url: "/assets/audio/rugrats.mp3" },
  { title: "Samurai Jack", url: "/assets/audio/samuraijack.mp3" },
  { title: "Scooby-Doo", url: "/assets/audio/scoobydoo.mp3" },
  { title: "Sesame Street", url: "/assets/audio/sesamestreet.mp3" },
  { title: "SpongeBob SquarePants", url: "/assets/audio/spongebobsquarepants.mp3" },
  { title: "The Suite Life of Zack and Cody", url: "/assets/audio/suitelifeofzackandcody.mp3" },
  { title: "Teen Titans", url: "/assets/audio/teentitans.mp3" },
  { title: "Teletubbies", url: "/assets/audio/teletubbies.mp3" },
  { title: "Thats So Raven", url: "/assets/audio/thatssoraven.mp3" },
  { title: "The Big Comfy Couch", url: "/assets/audio/thebigcomfycouch.mp3" },
  { title: "The Fresh Prince of Bel-Air", url: "/assets/audio/thefreshprinceofbelair.mp3" },
  { title: "The Magic School Bus", url: "/assets/audio/themagicschoolbus.mp3" },
  { title: "The Mighty B!", url: "/assets/audio/themightyb.mp3" },
  { title: "The Penguins of Madagascar", url: "/assets/audio/thepenguinsofmadagascar.mp3" },
  { title: "The Power Puff Girls", url: "/assets/audio/thepowerpuffgirls.mp3" },
  { title: "The Proud Family", url: "/assets/audio/theproudfamily.mp3" },
  { title: "The Suite Life On Deck", url: "/assets/audio/thesuitelifeondeck.mp3" },
  { title: "The Wiggles", url: "/assets/audio/thewiggles.mp3" },
  { title: "The Wild Thornberrys", url: "/assets/audio/thewildthornberrys.mp3" },
  { title: "The X's", url: "/assets/audio/thexs.mp3" },
  { title: "Total Drama Island", url: "/assets/audio/totaldramaisland.mp3" },
  { title: "Totally Spies", url: "/assets/audio/totallyspies.mp3" },
  { title: "Unfabulous", url: "/assets/audio/unfabulous.mp3" },
  { title: "Veggietales", url: "/assets/audio/veggietales.mp3" },
  { title: "Victorious", url: "/assets/audio/victorious.mp3" },
  { title: "Wizards of Waverly Place", url: "/assets/audio/wizardsofwaverlyplace.mp3" },
  { title: "Xiaolin Showdown", url: "/assets/audio/xiaolinshowdown.mp3" },
  { title: "Yu Gi Oh", url: "/assets/audio/yugioh.mp3" },
  { title: "Zoboomafoo", url: "/assets/audio/zoboomafoo.mp3" },
  { title: "Zoe 101", url: "/assets/audio/zoe101.mp3" }
];

// Time increments: 1, 2, 3, 5, 10, 15 seconds
const timeIncrements = [1, 2, 3, 5, 10, 15];

// -------------------- DOM --------------------
const playBtn = document.getElementById('playBtn');
const volumeSlider = document.getElementById('volumeSlider');
const clipLengthSpan = document.getElementById('clipLength');
const progressBar = document.getElementById('progressBar');
const maxClipIndicator = document.getElementById('maxClipIndicator');
const guessInput = document.getElementById('guessInput');
const suggestionsDiv = document.getElementById('suggestions');
const submitBtn = document.getElementById('submitGuess');
const skipBtn = document.getElementById('skipGuess');

// -------------------- Date Helpers (DST-safe Chicago) --------------------
function getTodayCST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}
function getChicagoYear() {
  return parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric' }).format(new Date()), 10);
}
const SEASON_SEED = getChicagoYear();

// -------------------- Deterministic Rotation (no repeats) --------------------
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const a = arr.slice();
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getPermutation(length) {
  const key = `themedleOrder_v${SEASON_SEED}_${length}`;
  let order = null;
  try { order = JSON.parse(localStorage.getItem(key)); } catch (e) { order = null; }
  if (!Array.isArray(order) || order.length !== length) {
    order = seededShuffle([...Array(length).keys()], SEASON_SEED);
    try { localStorage.setItem(key, JSON.stringify(order)); } catch (e) {}
  }
  return order;
}
function getDayIndexFromISO(dateISO) {
  return Math.floor(new Date(dateISO).getTime() / 86400000);
}
function getDailySongIndex() {
  const todayISO = getTodayCST();
  const order = getPermutation(themeSongs.length);
  const dayIndex = getDayIndexFromISO(todayISO);
  const idx = order[dayIndex % themeSongs.length];
  try {
    const saved = JSON.parse(localStorage.getItem('themedleDailyState'));
    if (saved && saved.date === todayISO && typeof saved.songIndex === 'number') {
      return saved.songIndex;
    }
  } catch (e) {}
  return idx;
}

// -------------------- Suggestions --------------------
let selectedSuggestionIndex = -1;

function showSuggestions(query) {
  if (!query.trim()) {
    suggestionsDiv.classList.add('hidden');
    return;
  }
  const matches = themeSongs.filter(song => song.title.toLowerCase().includes(query.toLowerCase()));
  if (matches.length === 0) {
    suggestionsDiv.classList.add('hidden');
    return;
  }
  suggestionsDiv.innerHTML = matches.map((song, index) => 
    `<div class="suggestion-item px-4 py-2 hover:bg-gray-700 cursor-pointer text-white" data-title="${song.title}" data-index="${index}">${song.title}</div>`
  ).join('');
  suggestionsDiv.classList.remove('hidden');
  selectedSuggestionIndex = -1;
}
function selectSuggestion(title) {
  guessInput.value = title;
  suggestionsDiv.classList.add('hidden');
  selectedSuggestionIndex = -1;
}
function highlightSuggestion(index) {
  const items = suggestionsDiv.querySelectorAll('.suggestion-item');
  items.forEach((item, i) => {
    if (i === index) item.classList.add('bg-gray-700');
    else item.classList.remove('bg-gray-700');
  });
}

// -------------------- Stats --------------------
function loadStats() {
  const saved = localStorage.getItem('themedleStats');
  if (saved) {
    gameStats = JSON.parse(saved);
    updateStatsDisplay();
  }
}
function saveStats() {
  localStorage.setItem('themedleStats', JSON.stringify(gameStats));
}
function updateStatsDisplay() {
  const cur = document.getElementById('currentStreak');
  const best = document.getElementById('bestStreak');
  const played = document.getElementById('gamesPlayed');
  if (cur) cur.textContent = gameStats.currentStreak;
  if (best) cur && (best.textContent = gameStats.bestStreak);
  if (played) played.textContent = gameStats.gamesPlayed;
}

// -------------------- Daily State --------------------
function loadDailyGameState() {
  const saved = localStorage.getItem('themedleDailyState');
  const today = getTodayCST();
  if (saved) {
    const savedState = JSON.parse(saved);
    if (savedState.date === today) {
      dailyGameState = savedState;
      return true;
    }
  }
  dailyGameState = {
    date: today,
    completed: false,
    won: false,
    guesses: [],
    currentGuess: 1,
    songIndex: getDailySongIndex()
  };
  saveDailyGameState();
  return false;
}
function saveDailyGameState() {
  localStorage.setItem('themedleDailyState', JSON.stringify(dailyGameState));
}

// -------------------- UI Helpers --------------------
function restoreGameState() {
  currentGuess = dailyGameState.currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1];
  dailyGameState.guesses.forEach((guess, index) => {
    const guessSlot = document.getElementById(`guessSlot-${index + 1}`);
    if (!guessSlot) return;
    guessSlot.style.opacity = '1';
    guessSlot.classList.remove('border-gray-600');
    if (guess.type === 'correct') {
      guessSlot.classList.add('border-green-500', 'bg-green-900/30');
      guessSlot.innerHTML = `<span class="text-green-300 font-semibold">${guess.text}</span><span class="text-sm text-green-400">${guess.clipLength}s</span>`;
    } else if (guess.type === 'wrong') {
      guessSlot.classList.add('border-red-500', 'bg-red-900/30');
      guessSlot.innerHTML = `<span class="text-red-300">${guess.text}</span><span class="text-sm text-red-400">${guess.clipLength}s</span>`;
    } else if (guess.type === 'skipped') {
      guessSlot.classList.add('border-yellow-500', 'bg-yellow-900/30');
      guessSlot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${guess.clipLength}s</span>`;
    }
  });
}
function disableGameControls() {
  const gi = document.getElementById('guessInput');
  const sg = document.getElementById('submitGuess');
  const sk = document.getElementById('skipGuess');
  if (gi) gi.disabled = true;
  if (sg) sg.disabled = true;
  if (sk) sk.disabled = true;
  if (gi) gi.placeholder = "Game completed for today";

  const answerDisplay = document.getElementById('answerDisplay');
  const displayedAnswer = document.getElementById('displayedAnswer');
  if (answerDisplay) answerDisplay.classList.remove('hidden');
  if (displayedAnswer) displayedAnswer.textContent = currentSong.title;
}
function updateMaxClipIndicator() {
  const maxWidth = (currentClipLength / 15) * 100;
  if (maxClipIndicator) maxClipIndicator.style.width = maxWidth + '%';
}
function updateSkipButton() {
  if (currentGuess < 6) {
    const nextClipLength = timeIncrements[currentGuess];
    const increment = nextClipLength - currentClipLength;
    if (skipBtn) skipBtn.textContent = `Skip (+${increment}s)`;
  }
}

// -------------------- Countdown (DST-safe) --------------------
function updateCountdown() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const h = parseInt(map.hour, 10);
  const m = parseInt(map.minute, 10);
  const s = parseInt(map.second, 10);
  const secsToday = h * 3600 + m * 60 + s;
  const secsInDay = 24 * 3600;
  let remaining = secsInDay - secsToday;
  if (remaining < 0) remaining = 0;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const el = document.getElementById('countdown');
  if (el) el.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// -------------------- Volume --------------------
if (volumeSlider) {
  volumeSlider.addEventListener('input', function () {
    const volume = this.value / 100;
    if (audioElement) audioElement.volume = volume;
    const vp = document.getElementById('volumePercent');
    if (vp) vp.textContent = this.value + '%';
  });
}

// -------------------- Playback (CSS-timed, no drift) --------------------
let playbackTimeout;

function startPlayback(playLength) {
  stopPlayback(false); // clear any old run

  isPlaying = true;
  if (playBtn) {
    playBtn.textContent = '■ Pause';
    playBtn.classList.add('pulse-animation');
  }

  // Ensure grey "max clip" reflects current state
  updateMaxClipIndicator();

  // Animate green bar to target width over exactly playLength seconds
  const targetWidth = (playLength / 15) * 100;
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    // Force reflow so 0% is applied before animating
    void progressBar.offsetWidth;
    progressBar.style.transition = `width ${playLength}s linear`;
    progressBar.style.width = `${targetWidth}%`;
  }

  // Audio start
  if (audioElement && audioElement.play) {
    audioElement.currentTime = 0;
    audioElement.play().catch(() => {
      console.log('Audio playback failed, using visual-only mode');
    });
  }

  // Stop exactly at playLength
  playbackTimeout = setTimeout(() => {
    stopPlayback(true);
  }, playLength * 1000);
}

function stopPlayback(completed) {
  if (playbackTimeout) {
    clearTimeout(playbackTimeout);
    playbackTimeout = null;
  }
  if (audioElement && audioElement.pause) {
    audioElement.pause();
  }

  isPlaying = false;
  if (playBtn) {
    playBtn.textContent = '▶ Play';
    playBtn.classList.remove('pulse-animation');
  }

  if (progressBar) {
    if (completed) {
      // brief hold so users see the end, then reset
      setTimeout(() => {
        progressBar.style.transition = 'width 0.3s linear';
        progressBar.style.width = '0%';
      }, 150);
    } else {
      // user paused
      progressBar.style.transition = 'width 0.3s linear';
      progressBar.style.width = '0%';
    }
  }
}

if (playBtn) {
  playBtn.addEventListener('click', function () {
    if (!isPlaying) {
      const playLength = gameOver ? 15 : currentClipLength;
      startPlayback(playLength);
    } else {
      stopPlayback(false); // user pause
    }
  });
}

// -------------------- Guess Submit --------------------
if (submitBtn) {
  submitBtn.addEventListener('click', function () {
    const guess = guessInput.value.trim().toLowerCase();
    if (!guess || gameOver) return;
    const guessSlot = document.getElementById(`guessSlot-${currentGuess}`);
    if (guessSlot) guessSlot.style.opacity = '1';

    if (guess === currentSong.title.toLowerCase()) {
      if (guessSlot) {
        guessSlot.classList.remove('border-gray-600');
        guessSlot.classList.add('border-green-500', 'bg-green-900/30');
        guessSlot.innerHTML = `<span class="text-green-300 font-semibold">${guessInput.value}</span><span class="text-sm text-green-400">${currentClipLength}s</span>`;
      }
      dailyGameState.guesses.push({ type: 'correct', text: guessInput.value, clipLength: currentClipLength });
      dailyGameState.completed = true;
      dailyGameState.won = true;
      dailyGameState.currentGuess = currentGuess;
      saveDailyGameState();
      gameOver = true;

      const today = getTodayCST();
      if (gameStats.lastPlayedDate !== today) {
        gameStats.currentStreak++;
        gameStats.gamesPlayed++;
        gameStats.lastPlayedDate = today;
        if (gameStats.currentStreak > gameStats.bestStreak) gameStats.bestStreak = gameStats.currentStreak;
        saveStats();
      }
      updateStatsDisplay();
      disableGameControls();

      // Full song visuals
      if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
      if (maxClipIndicator) maxClipIndicator.style.width = '100%';
      showGameOverModal(true);
    } else {
      if (guessSlot) {
        guessSlot.classList.remove('border-gray-600');
        guessSlot.classList.add('border-red-500', 'bg-red-900/30');
        guessSlot.innerHTML = `<span class="text-red-300">${guessInput.value}</span><span class="text-sm text-red-400">${currentClipLength}s</span>`;
      }
      dailyGameState.guesses.push({ type: 'wrong', text: guessInput.value, clipLength: currentClipLength });
      currentGuess++;
      dailyGameState.currentGuess = currentGuess;

      if (currentGuess > 6) {
        dailyGameState.completed = true;
        dailyGameState.won = false;
        saveDailyGameState();
        gameOver = true;
        const today = getTodayCST();
        if (gameStats.lastPlayedDate !== today) {
          gameStats.currentStreak = 0;
          gameStats.gamesPlayed++;
          gameStats.lastPlayedDate = today;
          saveStats();
        }
        updateStatsDisplay();
        disableGameControls();
        if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
        if (maxClipIndicator) maxClipIndicator.style.width = '100%';
        showGameOverModal(false);
      } else {
        saveDailyGameState();
        currentClipLength = timeIncrements[currentGuess - 1];
        if (clipLengthSpan) clipLengthSpan.textContent = currentClipLength + (currentClipLength === 1 ? ' second' : ' seconds');
        updateMaxClipIndicator();
        updateSkipButton();
      }
    }
    guessInput.value = '';
    if (!gameOver) guessInput.focus();
  });
}

// -------------------- Skip --------------------
if (skipBtn) {
  skipBtn.addEventListener('click', function () {
    if (currentGuess <= 6 && !gameOver) {
      const guessSlot = document.getElementById(`guessSlot-${currentGuess}`);
      if (guessSlot) {
        guessSlot.style.opacity = '1';
        guessSlot.classList.remove('border-gray-600');
        guessSlot.classList.add('border-yellow-500', 'bg-yellow-900/30');
        guessSlot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${currentClipLength}s</span>`;
      }
      dailyGameState.guesses.push({ type: 'skipped', text: 'Skipped', clipLength: currentClipLength });
      currentGuess++;
      dailyGameState.currentGuess = currentGuess;

      if (currentGuess > 6) {
        dailyGameState.completed = true;
        dailyGameState.won = false;
        saveDailyGameState();
        gameOver = true;
        const today = getTodayCST();
        if (gameStats.lastPlayedDate !== today) {
          gameStats.currentStreak = 0;
          gameStats.gamesPlayed++;
          gameStats.lastPlayedDate = today;
          saveStats();
        }
        updateStatsDisplay();
        disableGameControls();
        if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
        if (maxClipIndicator) maxClipIndicator.style.width = '100%';
        showGameOverModal(false);
      } else {
        saveDailyGameState();
        currentClipLength = timeIncrements[currentGuess - 1];
        if (clipLengthSpan) clipLengthSpan.textContent = currentClipLength + (currentClipLength === 1 ? ' second' : ' seconds');
        updateMaxClipIndicator();
        updateSkipButton();
      }
    }
  });
}

// -------------------- Typeahead Events --------------------
if (guessInput) {
  guessInput.addEventListener('input', function (e) {
    showSuggestions(e.target.value);
  });
  guessInput.addEventListener('keydown', function (e) {
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
        highlightSuggestion(selectedSuggestionIndex);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        if (selectedSuggestionIndex === -1) items.forEach(item => item.classList.remove('bg-gray-700'));
        else highlightSuggestion(selectedSuggestionIndex);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
        const title = items[selectedSuggestionIndex].dataset.title;
        selectSuggestion(title);
      }
      if (submitBtn) submitBtn.click();
    } else if (e.key === 'Escape') {
      suggestionsDiv.classList.add('hidden');
      selectedSuggestionIndex = -1;
    }
  });
  suggestionsDiv.addEventListener('click', function (e) {
    if (e.target.classList.contains('suggestion-item')) {
      const title = e.target.dataset.title;
      selectSuggestion(title);
    }
  });
  document.addEventListener('click', function (e) {
    if (!guessInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.classList.add('hidden');
      selectedSuggestionIndex = -1;
    }
  });
}

// -------------------- Modal --------------------
function showGameOverModal(won) {
  const modal = document.getElementById('gameOverModal');
  const title = document.getElementById('gameOverTitle');
  const message = document.getElementById('gameOverMessage');
  const answer = document.getElementById('correctAnswer');
  if (!modal || !title || !message || !answer) return;

  if (won) {
    title.textContent = '🎉 Congratulations!';
    message.textContent = `You guessed it in ${currentGuess} ${currentGuess === 1 ? 'try' : 'tries'}!`;
  } else {
    title.textContent = '😔 Game Over';
    message.textContent = 'Better luck next time!';
  }
  answer.textContent = currentSong.title;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  setTimeout(() => {
    if (!isPlaying && playBtn) {
      playBtn.click();
    }
  }, 500);
}

const closeModalBtn = document.getElementById('closeModal');
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', function () {
    const modal = document.getElementById('gameOverModal');
    if (!modal) return;
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  });
}

// -------------------- Boot --------------------
function boot() {
  loadStats();
  const hasPlayedToday = loadDailyGameState();
  currentSong = themeSongs[dailyGameState.songIndex];
  audioElement = new Audio();
  audioElement.addEventListener('error', function () {
    console.log('Audio failed to load, using fallback');
    audioElement = {
      play: function () { return Promise.resolve(); },
      pause: function () { },
      currentTime: 0,
      volume: 0.5,
      addEventListener: function () { }
    };
  });
  audioElement.src = currentSong.url;
  audioElement.preload = 'auto';
  audioElement.volume = 0.5;

  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (hasPlayedToday && dailyGameState.completed) {
    gameOver = true;
    restoreGameState();
    disableGameControls();
    if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
    if (maxClipIndicator) maxClipIndicator.style.width = '100%';
    setTimeout(() => { showGameOverModal(dailyGameState.won); }, 500);
  } else if (hasPlayedToday && !dailyGameState.completed) {
    restoreGameState();
    updateMaxClipIndicator();
    updateSkipButton();
    if (guessInput) guessInput.focus();
  } else {
    updateMaxClipIndicator();
    updateSkipButton();
    if (guessInput) guessInput.focus();
  }
}

document.addEventListener('DOMContentLoaded', boot);
