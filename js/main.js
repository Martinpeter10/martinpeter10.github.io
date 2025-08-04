// === Configuration ===
const CLIENT_ID = 'SSz86sqjFz89WiIDMTCnBLjsrqIgDkS9'; // 🔁 Replace this with your real client ID

const playlist = [
  { url: "https://soundcloud.com/your-user/the-simpsons", title: "The Simpsons" },
  { url: "https://soundcloud.com/your-user/spongebob", title: "SpongeBob SquarePants" },
  { url: "https://soundcloud.com/your-user/animaniacs", title: "Animaniacs" },
  { url: "https://soundcloud.com/your-user/avatar", title: "Avatar: The Last Airbender" },
  { url: "https://soundcloud.com/your-user/teen-titans", title: "Teen Titans" },
  { url: "https://soundcloud.com/your-user/fairly-oddparents", title: "The Fairly OddParents" },
  { url: "https://soundcloud.com/your-user/futurama", title: "Futurama" }
];

// === Utility ===
async function resolveTrackId(trackUrl) {
  try {
    const res = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(trackUrl)}&client_id=${CLIENT_ID}`);
    if (!res.ok) throw new Error("Failed to resolve track ID");
    const data = await res.json();
    return data.id;
  } catch (error) {
    console.error("Error resolving SoundCloud track:", error);
    return null;
  }
}

// === Game Setup ===
const maxGuesses = 6;
const todayIndex = (() => {
  const dateKey = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  return dateKey.split('/').reduce((a, b) => a + parseInt(b), 0) % playlist.length;
})();
const todayTrack = playlist[todayIndex];
const todayKey = `played-${todayIndex}`;
let currentGuessCount = 0;
const guessedSet = new Set();
let widget;

// === DOM References ===
const elements = {
  guessInput: document.getElementById("guessInput"),
  autocompleteList: document.getElementById("autocomplete-list"),
  submitBtn: document.getElementById("submitBtn"),
  playBtn: document.getElementById("playSnippet"),
  skipBtn: document.getElementById("skipBtn"),
  guessHistory: document.getElementById("guessHistory"),
  correctAnswerReveal: document.getElementById("correctAnswerReveal"),
  currentGuessSpan: document.getElementById("currentGuess"),
  listenTimeSpan: document.getElementById("listenTime"),
  resultModal: document.getElementById("resultModal"),
  resultAnswer: document.getElementById("resultAnswer"),
  resultCloseBtn: document.getElementById("resultCloseBtn"),
  shareBtn: document.getElementById("shareBtn"),
  gamesPlayed: document.getElementById("gamesPlayed"),
  currentStreak: document.getElementById("currentStreak"),
  bestStreak: document.getElementById("bestStreak"),
  countdownBottom: document.getElementById("countdownBottom"),
  alreadyPlayedModal: document.getElementById("alreadyPlayedModal"),
  alreadyPlayedOkBtn: document.getElementById("alreadyPlayedOkBtn"),
  iframe: document.getElementById("sc-player")
};

// === Game Logic ===
function disableInputs() {
  elements.playBtn.disabled = true;
  elements.skipBtn.disabled = true;
  elements.submitBtn.disabled = true;
  elements.guessInput.disabled = true;
}

function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const msg = `⏳ New theme song in ${hrs}h ${mins}m ${secs}s`;
  elements.countdownBottom.textContent = msg;
  document.getElementById("countdownModal").textContent = msg;
}

function updateStatsDisplay() {
  elements.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
  const streak = parseInt(localStorage.getItem("currentStreak") || "0");
  elements.currentStreak.textContent = streak + (streak >= 5 ? " 🔥" : "");
  elements.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
}

function endGame(correct) {
  localStorage.setItem(todayKey, 'done');
  elements.correctAnswerReveal.textContent = `🎯 The correct answer was: ${todayTrack.title}`;
  elements.correctAnswerReveal.classList.remove("hidden");
  elements.resultAnswer.textContent = `🎯 The correct answer was: ${todayTrack.title}`;
  elements.resultModal.classList.remove("hidden");
  disableInputs();

  let games = parseInt(localStorage.getItem("gamesPlayed") || "0") + 1;
  let streak = parseInt(localStorage.getItem("currentStreak") || "0");
  let best = parseInt(localStorage.getItem("bestStreak") || "0");

  if (correct) {
    streak++;
    if (streak > best) best = streak;
  } else {
    streak = 0;
  }

  localStorage.setItem("gamesPlayed", games);
  localStorage.setItem("currentStreak", streak);
  localStorage.setItem("bestStreak", best);
  updateStatsDisplay();
}

function shareResults() {
  const msg = `🎵 I played Cartoondle! Streak: ${elements.currentStreak.textContent} | Best: ${elements.bestStreak.textContent}`;
  if (navigator.share) {
    navigator.share({ title: "Cartoondle", text: msg, url: location.href });
  } else {
    alert(msg);
  }
}

function handleGuess() {
  const guess = elements.guessInput.value.trim();
  if (!guess || guessedSet.has(guess.toLowerCase()) || currentGuessCount >= maxGuesses) return;
  guessedSet.add(guess.toLowerCase());

  const time = [1, 2, 3, 5, 10, 15][Math.min(currentGuessCount, 5)];
  const div = document.createElement("div");
  const isCorrect = guess.toLowerCase() === todayTrack.title.toLowerCase();
  div.textContent = `${isCorrect ? "✅" : "❌"} ${guess} @ ${time}s`;
  div.className = isCorrect ? "text-green-300 font-bold" : "text-red-300";
  elements.guessHistory.appendChild(div);

  elements.guessInput.value = "";
  currentGuessCount++;
  elements.currentGuessSpan.textContent = Math.min(currentGuessCount + 1, maxGuesses);
  elements.listenTimeSpan.textContent = `${time} second`;

  if (isCorrect) {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    endGame(true);
  } else if (currentGuessCount >= maxGuesses) {
    endGame(false);
  }
}

function handleSkip() {
  if (currentGuessCount >= maxGuesses) return;
  const time = [1, 2, 3, 5, 10, 15][Math.min(currentGuessCount, 5)];
  const div = document.createElement("div");
  div.textContent = `⏭️ Skipped @ ${time}s`;
  div.className = "text-yellow-200";
  elements.guessHistory.appendChild(div);

  currentGuessCount++;
  elements.currentGuessSpan.textContent = Math.min(currentGuessCount + 1, maxGuesses);
  elements.listenTimeSpan.textContent = `${time} second`;
  if (currentGuessCount >= maxGuesses) endGame(false);
}

function playSnippet() {
  const time = [1, 2, 3, 5, 10, 15][Math.min(currentGuessCount, 5)];
  widget.seekTo(0);
  widget.play();
  setTimeout(() => widget.pause(), time * 1000);
}

function handleAutocomplete() {
  const val = elements.guessInput.value.toLowerCase();
  elements.autocompleteList.innerHTML = '';
  if (!val) return elements.autocompleteList.classList.add("hidden");
  playlist.filter(track => track.title.toLowerCase().includes(val)).forEach(track => {
    const div = document.createElement("div");
    div.textContent = track.title;
    div.className = "cursor-pointer px-3 py-1 hover:bg-gray-200";
    div.onclick = () => {
      elements.guessInput.value = track.title;
      elements.autocompleteList.classList.add("hidden");
    };
    elements.autocompleteList.appendChild(div);
  });
  elements.autocompleteList.classList.remove("hidden");
}

// === Init Game on Load ===
window.addEventListener("DOMContentLoaded", async () => {
  updateCountdown();
  setInterval(updateCountdown, 1000);
  updateStatsDisplay();

  const resolvedId = await resolveTrackId(todayTrack.url);
  if (resolvedId) {
    elements.iframe.src = `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${resolvedId}&auto_play=false&hide_related=true`;
    widget = SC.Widget(elements.iframe);
  }

  if (localStorage.getItem(todayKey) === 'done') {
    elements.correctAnswerReveal.textContent = `🎯 The correct answer was: ${todayTrack.title}`;
    elements.correctAnswerReveal.classList.remove("hidden");
    elements.alreadyPlayedModal.classList.remove("hidden");
    elements.alreadyPlayedOkBtn.onclick = () => elements.alreadyPlayedModal.classList.add("hidden");
    disableInputs();
  }

  elements.submitBtn.onclick = handleGuess;
  elements.playBtn.onclick = playSnippet;
  elements.skipBtn.onclick = handleSkip;
  elements.shareBtn.onclick = shareResults;
  elements.resultCloseBtn.onclick = () => elements.resultModal.classList.add("hidden");
  elements.guessInput.addEventListener("input", handleAutocomplete);
  elements.guessInput.addEventListener("keyup", e => {
    if (e.key === "Enter") handleGuess();
  });
});
