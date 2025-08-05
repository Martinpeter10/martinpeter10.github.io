// === Themedle: main.js ===

// 🎵 Theme Songs (your full list)
const themeSongs = [
  { title: "Adventure Time", url: "audio/adventuretime.mp3" },
  { title: "All Grown Up", url: "audio/allgrownup.mp3" },
  { title: "As Told By Ginger", url: "audio/astoldbyginger.mp3" },
  { title: "Avatar The Last Airbender", url: "audio/avatarthelastairbender.mp3" },
  { title: "Back At The Barnyard", url: "audio/backatthebarnyard.mp3" },
  { title: "Barney", url: "audio/barney.mp3" },
  { title: "Bear In The Big Blue House", url: "audio/bearinthebigbluehouse.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Between The Lions", url: "audio/betweenthelions.mp3" },
  { title: "Blues Clues", url: "audio/bluesclues.mp3" },
  { title: "Bob The Builder", url: "audio/bobthebuilder.mp3" },
  { title: "Caillou", url: "audio/caillou.mp3" },
  { title: "Camp Lazlo", url: "audio/camplazlo.mp3" },
  { title: "CatDog", url: "audio/catdog.mp3" },
  { title: "Catscratch", url: "audio/catscratch.mp3" },
  { title: "Charlie and Lola", url: "audio/charlieandlola.mp3" },
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "Clifford The Big Red Dog", url: "audio/cliffordthebigreddog.mp3" },
  { title: "Code Lyoko", url: "audio/codelyoko.mp3" },
  { title: "Codename: Kids Next Door", url: "audio/codenamekidsnextdoor.mp3" },
  { title: "Cory In The House", url: "audio/coryinthehouse.mp3" },
  { title: "Courage The Cowardly Dog", url: "audio/couragethecowardlydog.mp3" },
  { title: "Cyber Chase", url: "audio/cyberchase.mp3" },
  { title: "Danny Phantom", url: "audio/dannyphantom.mp3" },
  { title: "Degrassi", url: "audio/degrassi.mp3" },
  { title: "Dexters Laboratory", url: "audio/dexterslaboratory.mp3" },
  { title: "Dora The Explorer", url: "audio/doratheexplorer.mp3" },
  { title: "Doug", url: "audio/doug.mp3" },
  { title: "Dragon Tales", url: "audio/dragontales.mp3" },
  { title: "Drake and Josh", url: "audio/drakeandjosh.mp3" },
  { title: "Ed Edd n Eddy", url: "audio/ededdneddy.mp3" },
  { title: "El Tigre", url: "audio/eltigre.mp3" },
  { title: "Even Stevens", url: "audio/evenstevens.mp3" },
  { title: "The Grim Adventures of Billy and Mandy", url: "audio/grimadventures.mp3" },
  { title: "The Amazing World of Gumball", url: "audio/gumball.mp3" },
  { title: "The Amanda Show", url: "audio/theamandashow.mp3" },
  { title: "The Angry Beavers", url: "audio/theangrybeavers.mp3" },
  { title: "The Backyardigans", url: "audio/thebackyardigans.mp3" },
  { title: "The Berenstain Bears", url: "audio/theberenstainbears.mp3" },
  { title: "The Fairly Odd Parents", url: "audio/thefairlyoddparents.mp3" }
];

const timeIncrements = [1, 2, 3, 5, 10, 15];
let currentGuess = 1;
let currentClipLength = timeIncrements[0];
let audio = null;
let isPlaying = false;
let playbackInterval = null;
let simulatedTime = 0;
let gameOver = false;
let currentSong = null;

// DOM references
const guessInput = document.getElementById("guessInput");
const playBtn = document.getElementById("playBtn");
const volumeSlider = document.getElementById("volumeSlider");
const volumePercent = document.getElementById("volumePercent");
const progressBar = document.getElementById("progressBar");
const maxClipIndicator = document.getElementById("maxClipIndicator");
const clipLengthSpan = document.getElementById("clipLength");
const countdownEl = document.getElementById("countdown");
const submitBtn = document.getElementById("submitGuess");
const skipBtn = document.getElementById("skipGuess");
const gameOverModal = document.getElementById("gameOverModal");
const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverMessage = document.getElementById("gameOverMessage");
const correctAnswerEl = document.getElementById("correctAnswer");
const answerDisplay = document.getElementById("answerDisplay");
const displayedAnswer = document.getElementById("displayedAnswer");
const suggestionsDiv = document.getElementById("suggestions");

let gameStats = { currentStreak: 0, bestStreak: 0, gamesPlayed: 0 };
let dailyState = {
  date: null,
  completed: false,
  won: false,
  guesses: [],
  currentGuess: 1,
  songIndex: 0
};

// Utility: CST date hash for deterministic song
function getTodayCST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc - 6 * 3600000).toDateString();
}

function getDailySongIndex() {
  const key = getTodayCST().replace(/\s/g, '');
  let h = 0;
  for (let c of key) {
    h = ((h << 5) - h) + c.charCodeAt(0);
    h |= 0;
  }
  return Math.abs(h) % themeSongs.length;
}

// Load/Save daily game state
function loadState() {
  const saved = localStorage.getItem("themedleDailyState");
  const today = getTodayCST();
  if (saved) {
    const st = JSON.parse(saved);
    if (st.date === today) {
      dailyState = st;
    }
  } else {
    dailyState = {
      date: today,
      completed: false,
      won: false,
      guesses: [],
      currentGuess: 1,
      songIndex: getDailySongIndex()
    };
    localStorage.setItem("themedleDailyState", JSON.stringify(dailyState));
  }
}

function saveState() {
  localStorage.setItem("themedleDailyState", JSON.stringify(dailyState));
}

// Load/save overall stats
function loadStats() {
  const s = localStorage.getItem("themedleStats");
  if (s) gameStats = JSON.parse(s);
}
function saveStats() {
  localStorage.setItem("themedleStats", JSON.stringify(gameStats));
}

// Update stats UI
function updateStatsUI() {
  document.getElementById("currentStreak").textContent = gameStats.currentStreak;
  document.getElementById("bestStreak").textContent = gameStats.bestStreak;
  document.getElementById("gamesPlayed").textContent = gameStats.gamesPlayed;
}

// Update guess slots rendering
function updateGuessSlots() {
  dailyState.guesses.forEach((g, i) => {
    const slot = document.getElementById(`guessSlot-${i+1}`);
    slot.style.opacity = '1';
    if (g.type === 'correct') {
      slot.classList.add('border-green-500','bg-green-900/30');
      slot.innerHTML = `<span class="text-green-300 font-semibold">${g.text}</span><span class="text-sm text-green-400">${g.clipLength}s</span>`;
    } else if (g.type === 'wrong') {
      slot.classList.add('border-red-500','bg-red-900/30');
      slot.innerHTML = `<span class="text-red-300">${g.text}</span><span class="text-sm text-red-400">${g.clipLength}s</span>`;
    } else if (g.type === 'skipped') {
      slot.classList.add('border-yellow-500','bg-yellow-900/30');
      slot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${g.clipLength}s</span>`;
    }
  });
}

// Update clip UI (length text & indicators)
function updateClipUI() {
  clipLengthSpan.textContent = `${currentClipLength}s`;
  maxClipIndicator.style.width = `${(currentClipLength / 15) * 100}%`;
  if (currentGuess <= 6) {
    const next = timeIncrements[currentGuess] || 15;
    skipBtn.textContent = `Skip (+${next - currentClipLength}s)`;
  }
}

// Update countdown clock UI
function updateCountdown() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cst = new Date(utc - 6 * 3600000);
  const tomorrow = new Date(cst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0,0,0,0);
  const diff = tomorrow - cst;
  const hh = String(Math.floor(diff / 3600000)).padStart(2,'0');
  const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0');
  const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2,'0');
  countdownEl.textContent = `${hh}:${mm}:${ss}`;
}

// Play or pause logic
function playClip() {
  if (isPlaying) {
    clearInterval(playbackInterval);
    audio.pause();
    isPlaying = false;
    playBtn.textContent = '▶ Play';
    progressBar.style.width = '0%';
    return;
  }
  isPlaying = true;
  simulatedTime = 0;
  audio.currentTime = 0;
  audio.play();
  playBtn.textContent = '■ Pause';

  const total = gameOver ? 15 : currentClipLength;
  playbackInterval = setInterval(() => {
    simulatedTime += 0.05;
    const pct = Math.min(simulatedTime / total, 1);
    const maxFrac = currentClipLength / 15;
    progressBar.style.width = `${pct * maxFrac * 100}%`;
    if (simulatedTime >= total) {
      clearInterval(playbackInterval);
      audio.pause();
      isPlaying = false;
      playBtn.textContent = '▶ Play';
      progressBar.style.width = '0%';
    }
  }, 50);
}

// Skip handler
function handleSkip() {
  if (gameOver || currentGuess > 6) return;
  dailyState.guesses.push({ type:'skipped', text:'Skipped', clipLength: currentClipLength });
  currentGuess++;
  dailyState.currentGuess = currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;
  if (currentGuess > 6) {
    completeGame(false);
  }
  updateGuessSlots();
  updateClipUI();
  saveState();
}

// Submit handler (button or Enter)
function handleSubmit() {
  if (gameOver) return;
  const val = guessInput.value.trim();
  if (!val) return;
  const isCorrect = val.toLowerCase() === currentSong.title.toLowerCase();
  dailyState.guesses.push({ type: isCorrect ? 'correct':'wrong', text:val, clipLength: currentClipLength });
  updateGuessSlots();
  if (isCorrect) {
    completeGame(true);
  } else {
    currentGuess++;
    dailyState.currentGuess = currentGuess;
    if (currentGuess > 6) completeGame(false);
  }
  updateClipUI();
  saveState();
  guessInput.value = '';
  guessInput.blur();
}

// Complete game logic
function completeGame(won) {
  gameOver = true;
  dailyState.completed = true;
  dailyState.won = won;
  guessInput.disabled = true;
  submitBtn.disabled = true;
  skipBtn.disabled = true;
  if (won) {
    gameStats.currentStreak++;
    gameStats.gamesPlayed++;
    if (gameStats.currentStreak > gameStats.bestStreak) gameStats.bestStreak = gameStats.currentStreak;
  } else {
    gameStats.currentStreak = 0;
    gameStats.gamesPlayed++;
  }
  saveStats();
  updateStatsUI();
  openModal(won);
}

// Show modal and play full song
function openModal(won) {
  gameOverTitle.textContent = won ? '🎉 Correct!' : '😔 Game Over';
  gameOverMessage.textContent = won
    ? `You got it in ${currentGuess} ${currentGuess === 1 ? 'guess' : 'guesses'}!`
    : 'Come back tomorrow!';
  correctAnswerEl.textContent = currentSong.title;
  displayedAnswer.textContent = currentSong.title;
  answerDisplay.classList.remove('hidden');
  gameOverModal.classList.remove('hidden'); gameOverModal.classList.add('flex');

  clearInterval(playbackInterval);
  audio.pause();
  audio.currentTime = 0;
  isPlaying = false;
  audio.play();
}

// Autocomplete suggestions
function handleAutocomplete() {
  if (gameOver) return;
  const q = guessInput.value.trim().toLowerCase();
  if (!q) {
    suggestionsDiv.classList.add('hidden');
    return;
  }
  const matches = themeSongs.filter(s => s.title.toLowerCase().includes(q));
  suggestionsDiv.innerHTML = '';
  if (!matches.length) {
    suggestionsDiv.classList.add('hidden');
    return;
  }
  suggestionsDiv.classList.remove('hidden');
  matches.forEach(s => {
    const div = document.createElement('div');
    div.textContent = s.title;
    div.className = 'p-2 cursor-pointer hover:bg-gray-700';
    div.onclick = () => {
      guessInput.value = s.title;
      suggestionsDiv.classList.add('hidden');
    };
    suggestionsDiv.appendChild(div);
  });
}

// Initialization
function init() {
  loadStats();
  loadState();
  currentGuess = dailyState.currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;
  gameOver = dailyState.completed;
  currentSong = themeSongs[dailyState.songIndex];
  audio = new Audio(currentSong.url);
  audio.volume = volumeSlider.value / 100;

  updateStatsUI();
  updateGuessSlots();
  updateClipUI();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (gameOver) {
    guessInput.disabled = true;
    submitBtn.disabled = true;
    skipBtn.disabled = true;
    openModal(dailyState.won);
  }
}

// Event listeners
playBtn.addEventListener('click', playClip);
submitBtn.addEventListener('click', handleSubmit);
skipBtn.addEventListener('click', handleSkip);
guessInput.addEventListener('input', handleAutocomplete);
guessInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSubmit();
  }
});
document.getElementById("closeModal").addEventListener("click", () => {
  gameOverModal.classList.add('hidden');
  gameOverModal.classList.remove('flex');
});
document.addEventListener('click', e => {
  if (!suggestionsDiv.contains(e.target) && e.target !== guessInput) {
    suggestionsDiv.classList.add('hidden');
  }
});

init();
