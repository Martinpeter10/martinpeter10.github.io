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
let dailyState = { date: null, completed: false, won: false, guesses: [], currentGuess: 1, songIndex: 0 };

function getTodayCST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc - 6 * 3600000).toDateString();
}

function getDailySongIndex() {
  const key = getTodayCST().replace(/\s/g, '');
  let hash = 0;
  for (let c of key) {
    hash = ((hash << 5) - hash) + c.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash) % themeSongs.length;
}

function loadState() {
  const s = localStorage.getItem("themedleDailyState");
  const today = getTodayCST();
  if (s) {
    const st = JSON.parse(s);
    if (st.date === today) dailyState = st;
  } else {
    dailyState = { date: today, completed: false, won: false, guesses: [], currentGuess: 1, songIndex: getDailySongIndex() };
    localStorage.setItem("themedleDailyState", JSON.stringify(dailyState));
  }
}

function saveState() {
  localStorage.setItem("themedleDailyState", JSON.stringify(dailyState));
}

function loadStats() {
  const s = localStorage.getItem("themedleStats");
  if (s) gameStats = JSON.parse(s);
}

function saveStats() {
  localStorage.setItem("themedleStats", JSON.stringify(gameStats));
}

function updateStatsUI() {
  document.getElementById("currentStreak").textContent = gameStats.currentStreak;
  document.getElementById("bestStreak").textContent = gameStats.bestStreak;
  document.getElementById("gamesPlayed").textContent = gameStats.gamesPlayed;
}

function updateGuessSlots() {
  dailyState.guesses.forEach((g, i) => {
    const slot = document.getElementById(`guessSlot-${i + 1}`);
    slot.style.opacity = '1';
    if (g.type === 'correct') {
      slot.classList.add('border-green-500', 'bg-green-900/30');
      slot.innerHTML = `<span class="text-green-300 font-semibold">${g.text}</span><span class="text-sm text-green-400">${g.clipLength}s</span>`;
    } else if (g.type === 'wrong') {
      slot.classList.add('border-red-500', 'bg-red-900/30');
      slot.innerHTML = `<span class="text-red-300">${g.text}</span><span class="text-sm text-red-400">${g.clipLength}s</span>`;
    } else if (g.type === 'skipped') {
      slot.classList.add('border-yellow-500', 'bg-yellow-900/30');
      slot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${g.clipLength}s</span>`;
    }
  });
}

function updateClipUI() {
  clipLengthSpan.textContent = `${currentClipLength}s`;
  maxClipIndicator.style.width = `${(currentClipLength / 15) * 100}%`;
  if (currentGuess <= 6) {
    const next = timeIncrements[currentGuess] || 15;
    skipBtn.textContent = `Skip (+${next - currentClipLength}s)`;
  }
}

function updateCountdown() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cst = new Date(utc - 6 * 3600000);
  const t = new Date(cst); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0);
  const diff = t - cst;
  const hh = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  countdownEl.textContent = `${hh}:${mm}:${ss}`;
}

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

  const clipSeconds = gameOver ? 15 : currentClipLength;
  const maxWidth = (clipSeconds / 15) * 100;

  playbackInterval = setInterval(() => {
    simulatedTime += 0.05;
    const pct = Math.min(simulatedTime / clipSeconds, 1);
    progressBar.style.width = `${pct * maxWidth}%`;

    if (simulatedTime >= clipSeconds) {
      clearInterval(playbackInterval);
      audio.pause();
      isPlaying = false;
      playBtn.textContent = '▶ Play';
      progressBar.style.width = '0%';
    }
  }, 50);
}

volumeSlider.addEventListener('input', () => {
  const vol = volumeSlider.value;
  volumePercent.textContent = `${vol}%`;
  if (audio) audio.volume = vol / 100;
});

function handleSkip() {
  if (gameOver || currentGuess > 6) return;
  dailyState.guesses.push({ type: 'skipped', text: 'Skipped', clipLength: currentClipLength });
  currentGuess++;
  dailyState.currentGuess = currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;
  if (currentGuess > 6) completeGame(false);
  updateGuessSlots();
  updateClipUI();
  saveState();
}

function handleSubmit() {
  if (gameOver) return;
  const val = guessInput.value.trim();
  if (!val) return;
  const isCorrect = val.toLowerCase() === currentSong.title.toLowerCase();
  const guessType = isCorrect ? 'correct' : 'wrong';

  dailyState.guesses.push({
    type: guessType,
    text: val,
    clipLength: currentClipLength
  });

  currentGuess++;
  dailyState.currentGuess = currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;

  updateGuessSlots();
  updateClipUI();
  saveState();

  if (isCorrect) completeGame(true);
  else if (currentGuess > 6) completeGame(false);

  guessInput.value = '';
  suggestionsDiv.classList.add('hidden');
}

function completeGame(won) {
  gameOver = true;
  dailyState.completed = true;
  dailyState.won = won;
  saveState();

  gameStats.gamesPlayed++;
  if (won) {
    gameStats.currentStreak++;
    if (gameStats.currentStreak > gameStats.bestStreak)
      gameStats.bestStreak = gameStats.currentStreak;
  } else {
    gameStats.currentStreak = 0;
  }
  saveStats();
  updateStatsUI();
  openModal(won);
}

function openModal(won) {
  displayedAnswer.textContent = currentSong.title;
  correctAnswerEl.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(currentSong.title + " theme song")}`;
  gameOverTitle.textContent = won ? "🎉 You got it!" : "Game Over";
  gameOverMessage.textContent = won ? "You guessed it right!" : "Better luck next time.";
  gameOverModal.classList.remove('hidden');
  gameOverModal.classList.add('flex');
  audio.currentTime = 0;
  audio.play();
}

function handleAutocomplete() {
  const input = guessInput.value.trim().toLowerCase();
  if (!input) {
    suggestionsDiv.classList.add('hidden');
    return;
  }

  const matches = themeSongs
    .map(song => song.title)
    .filter(title => title.toLowerCase().includes(input));

  if (matches.length === 0) {
    suggestionsDiv.classList.add('hidden');
    return;
  }

  suggestionsDiv.innerHTML = matches.map(m => `<div class="p-2 hover:bg-gray-800 cursor-pointer">${m}</div>`).join('');
  suggestionsDiv.classList.remove('hidden');

  Array.from(suggestionsDiv.children).forEach(child => {
    child.addEventListener('click', () => {
      guessInput.value = child.textContent;
      suggestionsDiv.classList.add('hidden');
      guessInput.focus();
    });
  });
}

function init() {
  loadStats();
  loadState();
  currentGuess = dailyState.currentGuess;
  currentClipLength = timeIncrements[currentGuess - 1] || 15;
  gameOver = dailyState.completed;
  currentSong = themeSongs[dailyState.songIndex];
  audio = new Audio(currentSong.url);
  audio.volume = volumeSlider.value / 100;
  volumePercent.textContent = `${volumeSlider.value}%`;

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



