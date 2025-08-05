const playlist = [
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "All Grown Up", url: "audio/all_grown_up.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Teenage Mutant Ninja Turtles", url: "audio/tmnt.mp3" },
  { title: "Adventure Time", url: "audio/adventure_time.mp3" },
  { title: "Billy and Mandy", url: "audio/billy_mandy.mp3" },
  { title: "Kids Next Door", url: "audio/knd.mp3" },
  { title: "Regular Show", url: "audio/regular_show.mp3" },
  { title: "Gumball", url: "audio/gumball.mp3" }
];

const getTodayIndex = () => {
  const now = new Date();
  const dateKey = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  return dateKey.split('/').reduce((a, b) => a + parseInt(b), 0) % playlist.length;
};

document.addEventListener("DOMContentLoaded", () => {
  const index = getTodayIndex();
  const todayTrack = playlist[index];
  const todayKey = `played-${index}`;

  const el = {
    audio: document.getElementById("audioPlayer"),
    playBtn: document.getElementById("playBtn"),
    progressBar: document.getElementById("progressBar"),
    volume: document.getElementById("volumeSlider"),
    guessInput: document.getElementById("guessInput"),
    skipBtn: document.getElementById("skipBtn"),
    submitBtn: document.getElementById("submitBtn"),
    resultModal: document.getElementById("resultModal"),
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultCloseBtn: document.getElementById("resultCloseBtn"),
    guessGrid: document.getElementById("guessGrid"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak")
  };

  let guessCount = 0;
  const maxGuesses = 6;
  const guessedSet = new Set();
  let isFinished = false;

  // Set audio source and volume
  el.audio.src = todayTrack.url;
  el.audio.volume = parseFloat(el.volume.value);
  el.volume.addEventListener('input', () => {
    el.audio.volume = parseFloat(el.volume.value);
  });

  // Play snippet
  el.playBtn.addEventListener('click', () => {
    if (isFinished) return;
    const durations = [1, 2, 3, 5, 10, 15];
    const playTime = durations[Math.min(guessCount, durations.length - 1)];
    el.audio.currentTime = 0;
    el.audio.play();
    setTimeout(() => el.audio.pause(), playTime * 1000);
  });

  // Track progress bar
  el.audio.addEventListener("timeupdate", () => {
    const percentage = (el.audio.currentTime / el.audio.duration) * 100;
    el.progressBar.style.width = `${percentage}%`;
  });

  function updateStatsDisplay() {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.currentStreak.textContent = localStorage.getItem("currentStreak") || 0;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function saveStats(correct) {
    let played = parseInt(localStorage.getItem("gamesPlayed") || "0") + 1;
    let streak = parseInt(localStorage.getItem("currentStreak") || "0");
    let best = parseInt(localStorage.getItem("bestStreak") || "0");
    if (correct) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
    localStorage.setItem("gamesPlayed", played);
    localStorage.setItem("currentStreak", streak);
    localStorage.setItem("bestStreak", best);
    updateStatsDisplay();
  }

  function fillGuessBox(content, color) {
    const div = document.createElement("div");
    div.textContent = content;
    div.className = `bg-${color}-600 text-white text-center py-2 rounded`;
    el.guessGrid.appendChild(div);
  }

  function endGame(correct) {
    isFinished = true;
    localStorage.setItem(todayKey, "done");
    saveStats(correct);

    if (correct) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      el.resultTitle.textContent = "";
      el.resultAnswer.textContent = todayTrack.title;
      el.audio.currentTime = 0;
      el.audio.play();
    } else {
      el.resultTitle.textContent = "Game Over";
      el.resultAnswer.textContent = todayTrack.title;
    }

    el.resultModal.classList.remove("hidden");
  }

  function handleGuess() {
    if (isFinished) return;
    const guess = el.guessInput.value.trim();
    if (!guess || guessedSet.has(guess.toLowerCase()) || guessCount >= maxGuesses) return;

    const isCorrect = guess.toLowerCase() === todayTrack.title.toLowerCase();
    guessedSet.add(guess.toLowerCase());
    guessCount++;

    fillGuessBox(guess, isCorrect ? "green" : "red");

    if (isCorrect) {
      endGame(true);
    } else if (guessCount >= maxGuesses) {
      endGame(false);
    }

    el.guessInput.value = "";
  }

  function handleSkip() {
    if (isFinished || guessCount >= maxGuesses) return;
    fillGuessBox("Skipped", "gray");
    guessCount++;
    if (guessCount >= maxGuesses) {
      endGame(false);
    }
  }

  el.submitBtn.addEventListener("click", handleGuess);
  el.skipBtn.addEventListener("click", handleSkip);
  el.resultCloseBtn.addEventListener("click", () => el.resultModal.classList.add("hidden"));
  el.guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleGuess();
  });

  function restoreGuessBoxes() {
    for (let i = 0; i < maxGuesses; i++) {
      const empty = document.createElement("div");
      empty.className = "h-12 bg-gray-800 rounded";
      el.guessGrid.appendChild(empty);
    }
  }

  // Start-up
  updateStatsDisplay();
  restoreGuessBoxes();

  if (localStorage.getItem(todayKey) === "done") {
    isFinished = true;
    el.resultTitle.textContent = "";
    el.resultAnswer.textContent = todayTrack.title;
    el.resultModal.classList.remove("hidden");
  }
});
