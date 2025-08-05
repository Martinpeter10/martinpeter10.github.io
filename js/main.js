// === Themedle: main.js ===

// 🎵 All theme songs, matching your audio folder
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

// \-- DOM Refs --
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
let dailyGameState = {
  date: null,
  completed: false,
  won: false,
  guesses: [],
  currentGuess: 1,
  songIndex: 0
};

function getTodayCST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + -6 * 3600000).toDateString();
}

function getDailySongIndex() {
  const key = getTodayCST().replace(/\s/g, '');
  let hash = 0;
  for (const c of key) {
    hash = ((hash << 5) - hash) + c.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash) % themeSongs.length;
}

function loadStats() {
  const s = localStorage.getItem("themedleStats");
  if (s) gameStats = JSON.parse(s);
  updateStats();
}

function saveStats() {
  localStorage.setItem("themedleStats", JSON.stringify(gameStats));
}

function updateStats() {
  document.getElementById("currentStreak").textContent = gameStats.currentStreak;
  document.getElementById("bestStreak").textContent = gameStats.bestStreak;
  document.getElementById("gamesPlayed").textContent = gameStats.gamesPlayed;
}

function loadDailyState() {
  const s = localStorage.getItem("themedleDailyState");
  const today = getTodayCST();
  if (s) {
    const st = JSON.parse(s);
    if (st.date === today) {
      dailyGameState = st;
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
  saveDailyState();
  return false;
}

function saveDailyState() {
  localStorage.setItem("themedleDailyState", JSON.stringify(dailyGameState));
}

function updateCountdown() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cst = new Date(utc + (-6 * 3600000));
  const tomorrow = new Date(cst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0,0,0,0);
  const diff = tomorrow - cst;
  const hh = String(Math.floor(diff / 3600000)).padStart(2,'0');
  const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0');
  const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2,'0');
  countdownEl.textContent = `${hh}:${mm}:${ss}`;
}

function updateClip() {
  clipLengthSpan.textContent = `${currentClipLength}s`;
  maxClipIndicator.style.width = `${(currentClipLength/15)*100}%`;
  if (currentGuess < 6) {
    const next = timeIncrements[currentGuess] || 15;
    skipBtn.textContent = `Skip (+${next-currentClipLength}s)`;
  }
}

function playClip() {
  if (isPlaying) {
    audio.pause(); clearInterval(playbackInterval); isPlaying=false;
    playBtn.textContent = '▶ Play'; progressBar.style.width='0%';
    return;
  }
  isPlaying = true;
  playBtn.textContent = '■ Pause';
  simulatedTime = 0;
  audio.currentTime = 0;
  audio.play();
  const total = gameOver ? 15 : currentClipLength;
  playbackInterval = setInterval(() => {
    simulatedTime += 0.05;
    const pct = Math.min(simulatedTime/total, 1);
    progressBar.style.width = `${pct*100}%`;
    if (simulatedTime >= total) {
      clearInterval(playbackInterval); audio.pause();
      isPlaying=false; playBtn.textContent='▶ Play'; progressBar.style.width='0%';
    }
  }, 50);
}

function handleSkip() {
  if (gameOver || currentGuess > 5) return;
  dailyGameState.guesses.push({ type: 'skipped', text:'Skipped', clipLength: currentClipLength });
  currentGuess++;
  dailyGameState.currentGuess = currentGuess;
  currentClipLength = timeIncrements[currentGuess-1] || 15;
  if (currentGuess > 6) {
    gameOver = true; dailyGameState.completed = true; dailyGameState.won = false;
    gameStats.currentStreak = 0; gameStats.gamesPlayed++;
    saveStats(); showModal(false);
  }
  updateClip(); saveDailyState();
}

function handleSubmit() {
  if (gameOver) return;
  const guess = guessInput.value.trim();
  if (!guess) return;
  const type = guess.toLowerCase() === currentSong.title.toLowerCase() ? 'correct' : 'wrong';
  dailyGameState.guesses.push({ type, text: guess, clipLength: currentClipLength });
  const slot = document.getElementById(`guessSlot-${currentGuess}`);
  slot.style.opacity = '1';
  if (type === 'correct') {
    slot.classList.add('border-green-500','bg-green-900/30');
    gameOver = true; dailyGameState.completed = true; dailyGameState.won = true;
    gameStats.currentStreak++; gameStats.gamesPlayed++;
    if (gameStats.currentStreak > gameStats.bestStreak) gameStats.bestStreak = gameStats.currentStreak;
    saveStats(); updateStats();
    showModal(true);
  } else {
    slot.classList.add('border-red-500','bg-red-900/30');
    currentGuess++;
    dailyGameState.currentGuess = currentGuess;
    if (currentGuess > 6) {
      gameOver = true; dailyGameState.completed=true; dailyGameState.won=false;
      gameStats.currentStreak = 0; gameStats.gamesPlayed++;
      saveStats(); updateStats(); showModal(false);
    }
  }
  saveDailyState(); updateClip();
  guessInput.value = ''; guessInput.focus();
}

function showModal(won) {
  gameOverModal.classList.remove('hidden'); gameOverModal.classList.add('flex');
  gameOverTitle.textContent = won ? '🎉 Congratulations!' : '😔 Game Over';
  gameOverMessage.textContent = won
    ? `You guessed in ${currentGuess} ${currentGuess===1?'try':'tries'}!`
    : 'Better luck next time';
  correctAnswerEl.textContent = currentSong.title;
  displayedAnswer.textContent = currentSong.title;
  answerDisplay.classList.remove('hidden');
}

function handleAutocomplete() {
  const q = guessInput.value.trim().toLowerCase();
  if (!q) return suggestionsDiv.classList.add('hidden');
  const matches = themeSongs.filter(s => s.title.toLowerCase().includes(q));
  suggestionsDiv.innerHTML = '';
  if (!matches.length) return suggestionsDiv.classList.add('hidden');
  suggestionsDiv.classList.remove('hidden');
  matches.forEach(song => {
    const div = document.createElement('div');
    div.textContent = song.title;
    div.className = 'p-2 cursor-pointer hover:bg-gray-700';
    div.onclick = () => { guessInput.value = song.title; suggestionsDiv.classList.add('hidden'); };
    suggestionsDiv.appendChild(div);
  });
}

function init() {
  loadStats();
  const played = loadDailyState();
  currentSong = themeSongs[dailyGameState.songIndex];
  audio = new Audio(currentSong.url);
  audio.volume = volumeSlider.value/100;
  currentGuess = dailyGameState.currentGuess;
  currentClipLength = timeIncrements[currentGuess -1] || 15;
  gameOver = dailyGameState.completed;
  updateStats(); updateClip(); updateCountdown();
  setInterval(updateCountdown,1000);
  if (gameOver) showModal(dailyGameState.won);
}

playBtn.addEventListener('click', playClip);
volumeSlider.addEventListener('input', () => {
  audio.volume = volumeSlider.value/100;
  volumePercent.textContent = `${volumeSlider.value}%`;
});
skipBtn.addEventListener('click', handleSkip);
submitBtn.addEventListener('click', handleSubmit);
guessInput.addEventListener('input', handleAutocomplete);
guessInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
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
