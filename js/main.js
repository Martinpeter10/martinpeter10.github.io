// === Themedle: main.js ===

// Theme Songs List
const themeSongs = [
  { title: "Adventure Time", url: "audio/adventuretime.mp3" },
  { title: "All Grown Up", url: "audio/allgrownup.mp3" },
  
  // Add more as needed in the same format!
];

// Game Constants
const timeIncrements = [1, 2, 3, 5, 10, 15];
let currentGuess = 1;
let currentClipLength = timeIncrements[0];
let isPlaying = false;
let gameOver = false;
let audio = null;
let playbackInterval = null;
let simulatedTime = 0;

// DOM Elements
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

// Game State
let currentSong;
let gameStats = { currentStreak: 0, bestStreak: 0, gamesPlayed: 0, lastPlayedDate: null };
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
    hash = hash & hash;
  }
  return Math.abs(hash) % themeSongs.length;
}

function loadStats() {
  const saved = localStorage.getItem('themedleStats');
  if (saved) gameStats = JSON.parse(saved);
  updateStatsDisplay();
}

function saveStats() {
  localStorage.setItem('themedleStats', JSON.stringify(gameStats));
}

function updateStatsDisplay() {
  document.getElementById('currentStreak').textContent = gameStats.currentStreak;
  document.getElementById('bestStreak').textContent = gameStats.bestStreak;
  document.getElementById('gamesPlayed').textContent = gameStats.gamesPlayed;
}

function loadDailyGameState() {
  const saved = localStorage.getItem('themedleDailyState');
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
  localStorage.setItem('themedleDailyState', JSON.stringify(dailyGameState));
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
  clipLengthSpan.textContent = `${currentClipLength} second${currentClipLength > 1 ? 's' : ''}`;
  maxClipIndicator.style.width = `${(currentClipLength / 15) * 100}%`;
  if (currentGuess < 6) {
    const inc = timeIncrements[currentGuess] - currentClipLength;
    skipBtn.textContent = `Skip (+${inc}s)`;
  }
}

function showGameOverModal(won) {
  gameOverModal.classList.remove('hidden');
  gameOverModal.classList.add('flex');
  gameOverTitle.textContent = won ? '🎉 Congratulations!' : '😔 Game Over';
  gameOverMessage.textContent = won ? `You guessed it in ${currentGuess} ${currentGuess === 1 ? 'try' : 'tries'}!` : 'Better luck next time!';
  correctAnswerEl.textContent = currentSong.title;
  displayedAnswer.textContent = currentSong.title;
  answerDisplay.classList.remove('hidden');
}

function playClip() {
  if (isPlaying) {
    audio.pause();
    clearInterval(playbackInterval);
    progressBar.style.width = '0%';
    isPlaying = false;
    playBtn.textContent = '▶ Play';
    playBtn.classList.remove('pulse-animation');
    return;
  }

  isPlaying = true;
  playBtn.textContent = '■ Pause';
  playBtn.classList.add('pulse-animation');
  simulatedTime = 0;
  audio.currentTime = 0;
  audio.play();

  const playLength = gameOver ? 15 : currentClipLength;

  playbackInterval = setInterval(() => {
    simulatedTime += 0.05;
    const percent = Math.min(simulatedTime / playLength, 1);
    progressBar.style.width = `${percent * (playLength / 15) * 100}%`;
    if (simulatedTime >= playLength) {
      clearInterval(playbackInterval);
      audio.pause();
      isPlaying = false;
      playBtn.textContent = '▶ Play';
      playBtn.classList.remove('pulse-animation');
      progressBar.style.width = '0%';
    }
  }, 50);
}

// Event Listeners
playBtn.addEventListener('click', playClip);
volumeSlider.addEventListener('input', () => {
  const volume = volumeSlider.value;
  audio.volume = volume / 100;
  volumePercent.textContent = `${volume}%`;
});

document.getElementById("closeModal").addEventListener("click", () => {
  gameOverModal.classList.add('hidden');
  gameOverModal.classList.remove('flex');
});

// Game Initialization
function init() {
  loadStats();
  const hasPlayed = loadDailyGameState();
  currentSong = themeSongs[dailyGameState.songIndex];
  audio = new Audio(currentSong.url);
  audio.volume = volumeSlider.value / 100;
  currentClipLength = timeIncrements[dailyGameState.currentGuess - 1];
  currentGuess = dailyGameState.currentGuess;
  gameOver = dailyGameState.completed;

  updateStatsDisplay();
  updateClipDisplay();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (gameOver) {
    showGameOverModal(dailyGameState.won);
  }
}

init();
