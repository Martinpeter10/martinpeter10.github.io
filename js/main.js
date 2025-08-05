// === Themedle Game ===

// 🎵 Theme Songs
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
let currentSong;

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
let dailyGameState = { date: null, completed: false, won: false, guesses: [], currentGuess: 1, songIndex: 0 };

function getTodayCST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cst = new Date(utc + -6 * 3600000);
  return cst.toDateString();
}

function getDailySongIndex() {
  const today = getTodayCST().replace(/\s/g, '');
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = ((hash << 5) - hash) + today.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash) % themeSongs.length;
}

function loadStats() {
  const saved = localStorage.getItem("themedleStats");
  if (saved) gameStats = JSON.parse(saved);
  updateStatsDisplay();
}

function saveStats() {
  localStorage.setItem("themedleStats", JSON.stringify(gameStats));
}

function updateStatsDisplay() {
  document.getElementById("currentStreak").textContent = gameStats.currentStreak;
  document.getElementById("bestStreak").textContent = gameStats.bestStreak;
  document.getElementById("gamesPlayed").textContent = gameStats.gamesPlayed;
}

function loadDailyGameState() {
  const saved = localStorage.getItem("themedleDailyState");
  const today = getTodayCST();
  if (saved) {
    const state = JSON.parse(saved);
    if (state.date === today) {
      dailyGameState = state;
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
  localStorage.setItem("themedleDailyState", JSON.stringify(dailyGameState));
}

function updateCountdown() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cst = new Date(utc + (-6 * 3600000));
  const tomorrow = new Date(cst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const diff = tomorrow - cst;
  const hrs = Math.floor(diff / 3600000).toString().padStart(2, '0');
  const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
  const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  countdownEl.textContent = `${hrs}:${mins}:${secs}`;
}

function updateClipDisplay() {
  clipLengthSpan.textContent = `${currentClipLength}s`;
  maxClipIndicator.style.width = `${(currentClipLength / 15) * 100}%`;
  const nextLength = timeIncrements[currentGuess] || 15;
  skipBtn.textContent = `Skip (+${nextLength - currentClipLength}s)`;
}

function playClip() {
  if (isPlaying) {
    audio.pause();
    clearInterval(playbackInterval);
    isPlaying = false;
    playBtn.textContent = "▶ Play";
    progressBar.style.width = "0%";
    return;
  }

  isPlaying = true;
  playBtn.textContent = "■ Pause";
  audio.currentTime = 0;
  audio.play();

  const playLength = gameOver ? 15 : currentClipLength;
  simulatedTime = 0;
  playbackInterval = setInterval(() => {
    simulatedTime += 0.05;
    let percent = Math.min(simulatedTime / playLength, 1);
    progressBar.style.width = `${percent * 100}%`;
    if (simulatedTime >= playLength) {
      clearInterval(playbackInterval);
      audio.pause();
      isPlaying = false;
      playBtn.textContent = "▶ Play";
      progressBar.style.width = "0%";
    }
  }, 50);
}

function handleSkip() {
  if (gameOver || currentGuess >= 6) return;

  dailyGameState.guesses.push(null);
  currentGuess++;
  dailyGameState.currentGuess = currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;

  if (currentGuess > 6) {
    gameOver = true;
    dailyGameState.completed = true;
    dailyGameState.won = false;
    gameStats.currentStreak = 0;
    gameStats.gamesPlayed++;
    saveStats();
    showGameOverModal(false);
  }

  updateClipDisplay();
  saveDailyGameState();
}

function showGameOverModal(won) {
  gameOverModal.classList.remove("hidden");
  gameOverModal.classList.add("flex");
  gameOverTitle.textContent = won ? "🎉 Correct!" : "❌ Game Over";
  gameOverMessage.textContent = won
    ? `You got it in ${currentGuess} ${currentGuess === 1 ? "guess" : "guesses"}!`
    : "Come back tomorrow!";
  correctAnswerEl.textContent = currentSong.title;
  displayedAnswer.textContent = currentSong.title;
  answerDisplay.classList.remove("hidden");
}

function handleAutocomplete() {
  const input = guessInput.value.toLowerCase();
  const matches = themeSongs
    .filter(song => song.title.toLowerCase().includes(input))
    .slice(0, 6);

  suggestionsDiv.innerHTML = "";
  if (matches.length > 0 && input) {
    suggestionsDiv.classList.remove("hidden");
    matches.forEach(song => {
      const item = document.createElement("div");
      item.textContent = song.title;
      item.className = "p-2 cursor-pointer hover:bg-gray-700";
      item.onclick = () => {
        guessInput.value = song.title;
        suggestionsDiv.classList.add("hidden");
      };
      suggestionsDiv.appendChild(item);
    });
  } else {
    suggestionsDiv.classList.add("hidden");
  }
}

// 🎮 Initialize Game
function init() {
  loadStats();
  const alreadyPlayed = loadDailyGameState();
  currentSong = themeSongs[dailyGameState.songIndex];
  audio = new Audio(currentSong.url);
  audio.volume = volumeSlider.value / 100;
  currentGuess = dailyGameState.currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;
  gameOver = dailyGameState.completed;

  updateStatsDisplay();
  updateClipDisplay();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (gameOver) {
    showGameOverModal(dailyGameState.won);
  }
}

// 🎯 Event Listeners
playBtn.addEventListener("click", playClip);
volumeSlider.addEventListener("input", () => {
  audio.volume = volumeSlider.value / 100;
  volumePercent.textContent = `${volumeSlider.value}%`;
});
skipBtn.addEventListener("click", handleSkip);
guessInput.addEventListener("input", handleAutocomplete);
document.addEventListener("click", e => {
  if (!suggestionsDiv.contains(e.target) && e.target !== guessInput) {
    suggestionsDiv.classList.add("hidden");
  }
});
document.getElementById("closeModal").addEventListener("click", () => {
  gameOverModal.classList.add("hidden");
  gameOverModal.classList.remove("flex");
});

// 🚀 Start
init();
