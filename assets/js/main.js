// main.js - Themedle game logic (with CSS-timed playback bar)
(function () {
'use strict';

const SECONDS_PER_DAY  = 86400;
const SECONDS_PER_HOUR = 3600;
//
// Expects these DOM IDs in index.html:
// playBtn, volumeSlider, clipLength, progressBar, maxClipIndicator, guessInput,
// suggestions, submitGuess, skipGuess, gameOverModal, gameOverTitle, gameOverMessage,
// correctAnswer, currentStreak, bestStreak, gamesPlayed, countdown, answerDisplay, displayedAnswer,
// closeModal, plus guessSlot-1 .. guessSlot-6

// -------------------- Security helpers --------------------
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  wins: 0,
  lastPlayedDate: null,
  guessDistribution: [0, 0, 0, 0, 0, 0, 0]  // [g1,g2,g3,g4,g5,g6,losses]
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
  { title: "Zoe 101", url: "/assets/audio/zoe101.mp3" },
  { title: "Baywatch", url: "/assets/audio/baywatch.mp3" },
  { title: "Boy Meets World", url: "/assets/audio/boymeetsworld.mp3" },
  { title: "Buffy The Vampire Slayer", url: "/assets/audio/buffythevampireslayer.mp3" },
  { title: "Cheers", url: "/assets/audio/cheers.mp3" },
  { title: "Chip 'n Dale Rescue Rangers", url: "/assets/audio/chipndalerescuerangers.mp3" },
  { title: "DuckTales", url: "/assets/audio/ducktales.mp3" },
  { title: "Everybody Hates Chris", url: "/assets/audio/everybodyhateschris.mp3" },
  { title: "Family Guy", url: "/assets/audio/familyguy.mp3" },
  { title: "Family Matters", url: "/assets/audio/familymatters.mp3" },
  { title: "Friends", url: "/assets/audio/friends.mp3" },
  { title: "Futurama", url: "/assets/audio/futurama.mp3" },
  { title: "Game of Thrones", url: "/assets/audio/gameofthrones.mp3" },
  { title: "George Lopez", url: "/assets/audio/georgelopez.mp3" },
  { title: "Gilligan's Island", url: "/assets/audio/gilligansisland.mp3" },
  { title: "Gilmore Girls", url: "/assets/audio/gilmoregirls.mp3" },
  { title: "Gravity Falls", url: "/assets/audio/gravityfalls.mp3" },
  { title: "Happy Days", url: "/assets/audio/happydays.mp3" },
  { title: "Hawaii Five-0", url: "/assets/audio/hawaiifive0.mp3" },
  { title: "Home Improvement", url: "/assets/audio/homeimprovement.mp3" },
  { title: "Inspector Gadget", url: "/assets/audio/inspectorgadget.mp3" },
  { title: "King of the Hill", url: "/assets/audio/kingofthehill.mp3" },
  { title: "Law and Order SVU", url: "/assets/audio/lawandordersvu.mp3" },
  { title: "Naruto", url: "/assets/audio/naruto.mp3" },
  { title: "Saved By The Bell", url: "/assets/audio/savedbythebell.mp3" },
  { title: "Seinfeld", url: "/assets/audio/seinfeld.mp3" },
  { title: "South Park", url: "/assets/audio/southpark.mp3" },
  { title: "Steven Universe", url: "/assets/audio/stevenuniverse.mp3" },
  { title: "Stranger Things", url: "/assets/audio/strangerthings.mp3" },
  { title: "That 70s Show", url: "/assets/audio/that70sshow.mp3" },
  { title: "The Big Bang Theory", url: "/assets/audio/thebigbangtheory.mp3" },
  { title: "The Brady Bunch", url: "/assets/audio/thebradybunch.mp3" },
  { title: "The Flintstones", url: "/assets/audio/theflintstones.mp3" },
  { title: "The Jeffersons", url: "/assets/audio/thejeffersons.mp3" },
  { title: "The Jetsons", url: "/assets/audio/thejetsons.mp3" },
  { title: "The Simpsons", url: "/assets/audio/thesimpsons.mp3" },
  { title: "The X-Files", url: "/assets/audio/thexfiles.mp3" },
  { title: "Twilight Zone", url: "/assets/audio/twilightzone.mp3" },
  { title: "Walker Texas Ranger", url: "/assets/audio/walkertexasranger.mp3" },
  { title: "X-Men", url: "/assets/audio/xmen.mp3" }
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
  const todayISO = DJUtils.getChicagoDate();
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
  suggestionsDiv.textContent = '';
  matches.forEach(function (song, index) {
    const div = document.createElement('div');
    div.className = 'suggestion-item px-4 py-2 hover:bg-gray-700 cursor-pointer text-white';
    div.dataset.title = song.title;
    div.dataset.index = String(index);
    div.textContent = song.title;
    suggestionsDiv.appendChild(div);
  });
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
  try {
    const saved = localStorage.getItem('td_stats_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge saved stats into gameStats; ensure guessDistribution exists
      gameStats = Object.assign({ guessDistribution: [0,0,0,0,0,0,0] }, parsed);
      if (!Array.isArray(gameStats.guessDistribution) || gameStats.guessDistribution.length !== 7) {
        gameStats.guessDistribution = [0,0,0,0,0,0,0];
      }
    }
  } catch (e) { /* start with defaults on parse error */ }
}
function saveStats() {
  DJUtils.saveJSON('td_stats_v2', gameStats);
}

/** Returns a 1-based puzzle number (days since 2024-01-01 Chicago) */
function getPuzzleNumber() {
  const epoch = Math.floor(new Date('2024-01-01').getTime() / 86400000);
  return getDayIndexFromISO(DJUtils.getChicagoDate()) - epoch + 1;
}

// -------------------- Daily State --------------------
function loadDailyGameState() {
  try {
    const saved = localStorage.getItem('themedleDailyState');
    const today = DJUtils.getChicagoDate();
    if (saved) {
      const savedState = JSON.parse(saved);
      if (savedState.date === today) {
        dailyGameState = savedState;
        return true;
      }
    }
  } catch (e) { /* fall through to fresh state */ }
  const today = DJUtils.getChicagoDate();
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
  DJUtils.saveJSON('themedleDailyState', dailyGameState);
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
      guessSlot.innerHTML = `<span class="text-green-300 font-semibold">${escHtml(guess.text)}</span><span class="text-sm text-green-400">${escHtml(String(guess.clipLength))}s</span>`;
    } else if (guess.type === 'wrong') {
      guessSlot.classList.add('border-red-500', 'bg-red-900/30');
      guessSlot.innerHTML = `<span class="text-red-300">${escHtml(guess.text)}</span><span class="text-sm text-red-400">${escHtml(String(guess.clipLength))}s</span>`;
    } else if (guess.type === 'skipped') {
      guessSlot.classList.add('border-yellow-500', 'bg-yellow-900/30');
      guessSlot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${guess.clipLength}s</span>`;
    }
  });
}
function disableGameControls() {
  const section = document.getElementById('guessInputSection');
  if (section) section.classList.add('hidden');

  const won = dailyGameState.won;
  const guessNum = dailyGameState.currentGuess;

  const heading = document.getElementById('td-result-heading');
  const sub     = document.getElementById('td-result-sub');
  if (heading) heading.textContent = won ? 'Got it!' : 'Better luck tomorrow!';
  if (sub)     sub.textContent     = won
    ? 'You got it in ' + guessNum + '/6 guesses.'
    : 'All 6 guesses used — see you tomorrow!';

  const displayedAnswer = document.getElementById('displayedAnswer');
  if (displayedAnswer) displayedAnswer.textContent = currentSong.title;

  const answerDisplay = document.getElementById('answerDisplay');
  if (answerDisplay) answerDisplay.classList.remove('hidden');
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
  const secsToday = h * SECONDS_PER_HOUR + m * 60 + s;
  let remaining = SECONDS_PER_DAY - secsToday;
  if (remaining < 0) remaining = 0;
  const hours = Math.floor(remaining / SECONDS_PER_HOUR);
  const minutes = Math.floor((remaining % SECONDS_PER_HOUR) / 60);
  const seconds = remaining % 60;
  const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  // Sync countdown in the game-over modal and answer panel
  const goEl = document.getElementById('go-countdown');
  if (goEl) goEl.textContent = formatted;
  const rcEl = document.getElementById('td-result-countdown');
  if (rcEl) rcEl.textContent = formatted;
}

// -------------------- Volume --------------------
function updateSliderTrack(slider) {
  slider.style.background = `linear-gradient(to right, var(--brand) ${slider.value}%, #4b5563 ${slider.value}%)`;
}

if (volumeSlider) {
  updateSliderTrack(volumeSlider); // set correct track on init (default is 50, so this is a no-op visually but future-proofs it)
  volumeSlider.addEventListener('input', function () {
    const volume = this.value / 100;
    if (audioElement) audioElement.volume = volume;
    const vp = document.getElementById('volumePercent');
    if (vp) vp.textContent = this.value + '%';
    updateSliderTrack(this);
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
        guessSlot.innerHTML = `<span class="text-green-300 font-semibold">${escHtml(guessInput.value)}</span><span class="text-sm text-green-400">${currentClipLength}s</span>`;
      }
      dailyGameState.guesses.push({ type: 'correct', text: guessInput.value, clipLength: currentClipLength });
      dailyGameState.completed = true;
      dailyGameState.won = true;
      dailyGameState.currentGuess = currentGuess;
      saveDailyGameState();
      gameOver = true;

      const today = DJUtils.getChicagoDate();
      if (gameStats.lastPlayedDate !== today) {
        gameStats.currentStreak++;
        gameStats.gamesPlayed++;
        gameStats.wins = (gameStats.wins || 0) + 1;
        gameStats.lastPlayedDate = today;
        if (gameStats.currentStreak > gameStats.bestStreak) gameStats.bestStreak = gameStats.currentStreak;
        gameStats.guessDistribution[currentGuess - 1]++;
        saveStats();
      }
      disableGameControls();

      // Full song visuals
      if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
      if (maxClipIndicator) maxClipIndicator.style.width = '100%';
      showGameOverModal(true);
      setTimeout(function () {
        const panel = document.getElementById('answerDisplay');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } else {
      if (guessSlot) {
        guessSlot.classList.remove('border-gray-600');
        guessSlot.classList.add('border-red-500', 'bg-red-900/30');
        guessSlot.innerHTML = `<span class="text-red-300">${escHtml(guessInput.value)}</span><span class="text-sm text-red-400">${currentClipLength}s</span>`;
      }
      dailyGameState.guesses.push({ type: 'wrong', text: guessInput.value, clipLength: currentClipLength });
      currentGuess++;
      dailyGameState.currentGuess = currentGuess;

      if (currentGuess > 6) {
        dailyGameState.completed = true;
        dailyGameState.won = false;
        saveDailyGameState();
        gameOver = true;
        const today = DJUtils.getChicagoDate();
        if (gameStats.lastPlayedDate !== today) {
          gameStats.currentStreak = 0;
          gameStats.gamesPlayed++;
          gameStats.lastPlayedDate = today;
          gameStats.guessDistribution[6]++;
          saveStats();
        }
        disableGameControls();
        if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
        if (maxClipIndicator) maxClipIndicator.style.width = '100%';
        showGameOverModal(false);
        setTimeout(function () {
          const panel = document.getElementById('answerDisplay');
          if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
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
        const today = DJUtils.getChicagoDate();
        if (gameStats.lastPlayedDate !== today) {
          gameStats.currentStreak = 0;
          gameStats.gamesPlayed++;
          gameStats.lastPlayedDate = today;
          gameStats.guessDistribution[6]++;
          saveStats();
        }
        disableGameControls();
        if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
        if (maxClipIndicator) maxClipIndicator.style.width = '100%';
        showGameOverModal(false);
        setTimeout(function () {
          const panel = document.getElementById('answerDisplay');
          if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
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

// -------------------- Stats Modal --------------------
function shareStats() {
  const s    = gameStats;
  const played = s.gamesPlayed || 0;
  const wins   = s.wins || 0;
  const winPct = played > 0 ? Math.round(wins / played * 100) : 0;
  const dist   = s.guessDistribution || [0,0,0,0,0,0,0];
  const NUMS   = ['1\uFE0F\u20E3','2\uFE0F\u20E3','3\uFE0F\u20E3','4\uFE0F\u20E3','5\uFE0F\u20E3','6\uFE0F\u20E3','\u274C'];

  const lines = [
    'Themedle All-Time Stats \uD83C\uDFB5',
    'Played: ' + played + ' \u2502 Wins: ' + wins + ' \u2502 Win Rate: ' + winPct + '%',
    'Streak: ' + (s.currentStreak || 0) + ' \uD83D\uDD25 \u2502 Best: ' + (s.bestStreak || 0),
    '',
    'Guess Distribution:',
  ].concat(dist.map(function (c, i) { return NUMS[i] + ': ' + c; })).concat(['', 'dailyjamm.com/themedle']);

  const btn = document.getElementById('td-stats-share-btn');
  if (btn) DJUtils.clipboardShare(lines.join('\n'), btn, 'Share Stats');
}

function showStatsModal() {
  const s      = gameStats;
  const played = s.gamesPlayed || 0;
  const wins   = s.wins || 0;
  const winPct = played > 0 ? Math.round(wins / played * 100) : 0;

  DJUtils.setStatRows('td-stats-content', [
    { label: 'Games Played', value: played },
    { label: 'Wins', value: wins, color: '#4ade80' },
    { label: 'Win Rate', value: winPct + '%', color: winPct >= 50 ? '#4ade80' : '#f87171' },
    { label: 'Current Streak', value: s.currentStreak, color: '#facc15' },
    { label: 'Best Streak', value: s.bestStreak, color: '#a78bfa' },
  ]);

  DJUtils.renderGuessDist('td-stats-dist', s.guessDistribution || [0,0,0,0,0,0,0]);

  const shareBtn = document.getElementById('td-stats-share-btn');
  if (shareBtn) {
    shareBtn.textContent = 'Share Stats';
    shareBtn.onclick = shareStats;
  }

  const modal = document.getElementById('td-stats-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeStatsModal() {
  const modal = document.getElementById('td-stats-modal');
  if (modal) modal.classList.add('hidden');
}

// -------------------- Game Over Modal --------------------
function shareResults(btnEl) {
  const guesses    = dailyGameState.guesses;
  const won        = dailyGameState.won;
  const puzzleNum  = getPuzzleNumber();
  const guessLabel = won ? String(dailyGameState.currentGuess) + '/6' : 'X/6';
  const EMOJI      = { correct: '\uD83D\uDFE2', wrong: '\uD83D\uDD34', skipped: '\u23E9' };

  const rows = guesses.map(function (g) {
    return EMOJI[g.type] + ' ' + g.clipLength + 's';
  });

  const lines = ['Themedle #' + puzzleNum + ' ' + guessLabel + ' \uD83C\uDFB5']
    .concat(rows)
    .concat(['dailyjamm.com/themedle']);

  const btn = (btnEl instanceof Element) ? btnEl
            : document.getElementById('td-share-btn')
           || document.getElementById('td-answer-share-btn');
  if (btn) DJUtils.clipboardShare(lines.join('\n'), btn, 'Share');
}

function showGameOverModal(won) {
  const modal = document.getElementById('gameOverModal');
  if (!modal) return;
  const inner = modal.querySelector('.go-inner');
  if (!inner) return;

  inner.textContent = '';

  // Title
  const title = document.createElement('h2');
  title.style.cssText = 'font-size:1.25rem;font-weight:900;text-align:center;margin-bottom:3px';
  title.textContent = won ? '\uD83C\uDF89 Got it!' : '\uD83D\uDE14 Better luck tomorrow!';
  inner.appendChild(title);

  // Subtitle
  const sub = document.createElement('p');
  sub.style.cssText = 'font-size:0.75rem;color:#9ca3af;text-align:center;margin-bottom:14px';
  sub.textContent = won
    ? 'Guess ' + dailyGameState.currentGuess + ' of 6'
    : 'All 6 guesses used — see you tomorrow!';
  inner.appendChild(sub);

  // Guess rows
  const guessWrap = document.createElement('div');
  guessWrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-bottom:14px';
  dailyGameState.guesses.forEach(function (g) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:8px;font-size:0.82rem;font-weight:600';
    const left  = document.createElement('span');
    const right = document.createElement('span');
    right.style.fontSize = '0.72rem';
    right.textContent = g.clipLength + 's';
    if (g.type === 'correct') {
      row.style.cssText += ';background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.35)';
      left.style.color  = '#4ade80';
      right.style.color = '#86efac';
      left.textContent  = '\uD83D\uDFE2 ' + g.text;
    } else if (g.type === 'wrong') {
      row.style.cssText += ';background:rgba(239,68,68,0.09);border:1px solid rgba(239,68,68,0.28)';
      left.style.color  = '#f87171';
      right.style.color = '#fca5a5';
      left.textContent  = '\uD83D\uDD34 ' + g.text;
    } else {
      row.style.cssText += ';background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.25)';
      left.style.color  = '#fbbf24';
      right.style.color = '#fcd34d';
      left.textContent  = '\u23E9 Skipped';
    }
    row.appendChild(left);
    row.appendChild(right);
    guessWrap.appendChild(row);
  });
  inner.appendChild(guessWrap);

  // Answer box
  const ansBox = document.createElement('div');
  ansBox.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:10px;padding:10px;text-align:center;margin-bottom:12px';
  const ansLbl = document.createElement('p');
  ansLbl.style.cssText = 'font-size:0.7rem;color:#6b7280;margin-bottom:3px';
  ansLbl.textContent = 'The answer was:';
  const ansName = document.createElement('p');
  ansName.style.cssText = 'font-size:1.05rem;font-weight:800;color:#fbbf24';
  ansName.textContent = currentSong.title;
  ansBox.appendChild(ansLbl);
  ansBox.appendChild(ansName);
  inner.appendChild(ansBox);

  // Action buttons
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;margin-bottom:10px';

  const shareBtn = document.createElement('button');
  shareBtn.id = 'td-share-btn';
  shareBtn.style.cssText = 'flex:1;padding:10px 4px;background:#2ecc71;color:#0b1220;border:none;border-radius:8px;font-size:0.82rem;font-weight:800;cursor:pointer';
  shareBtn.textContent = 'Share';
  shareBtn.addEventListener('click', shareResults);

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'flex:1;padding:10px 4px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', function () {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  });

  btns.appendChild(shareBtn);
  btns.appendChild(closeBtn);
  inner.appendChild(btns);

  // Countdown
  const cdRow = document.createElement('p');
  cdRow.style.cssText = 'font-size:0.7rem;color:#6b7280;text-align:center';
  cdRow.textContent = 'Next theme song in ';
  const cdSpan = document.createElement('span');
  cdSpan.id = 'go-countdown';
  cdSpan.style.cssText = 'color:#fbbf24;font-family:monospace;font-weight:700';
  cdSpan.textContent = (document.getElementById('countdown') || {}).textContent || '--:--:--';
  cdRow.appendChild(cdSpan);
  inner.appendChild(cdRow);

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Close on backdrop click
  modal.onclick = function (e) {
    if (e.target === modal) {
      modal.classList.remove('flex');
      modal.classList.add('hidden');
    }
  };

  setTimeout(function () {
    if (!isPlaying && playBtn) playBtn.click();
  }, 500);
}

const tdStatsBtn = document.getElementById('td-stats-btn');
if (tdStatsBtn) tdStatsBtn.addEventListener('click', showStatsModal);

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
  audioElement.preload = 'none';
  audioElement.volume = 0.5;

  // Hard cap: never play more than 15 seconds regardless of game state
  audioElement.addEventListener('timeupdate', function () {
    if (audioElement.currentTime >= 15) {
      stopPlayback(true);
    }
  });

  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (hasPlayedToday && dailyGameState.completed) {
    gameOver = true;
    restoreGameState();
    disableGameControls();
    if (clipLengthSpan) clipLengthSpan.textContent = '15 seconds';
    if (maxClipIndicator) maxClipIndicator.style.width = '100%';
    setTimeout(function () {
      const panel = document.getElementById('answerDisplay');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
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

// Expose functions called from HTML onclick handlers
window.closeStatsModal = closeStatsModal;
window.showStatsModal  = showStatsModal;
window.shareStats      = shareStats;
window.shareResults    = shareResults;
})();
