const playlist = [
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "All Grown Up", url: "audio/all-grown-up.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Teenage Mutant Ninja Turtles", url: "audio/tmnt.mp3" },
  { title: "Adventure Time", url: "audio/adventure-time.mp3" },
  { title: "The Grim Adventures of Billy and Mandy", url: "audio/grim-adventures.mp3" },
  { title: "Code Name Kids Next Door", url: "audio/kids-next-door.mp3" },
  { title: "Regular Show", url: "audio/regular-show.mp3" },
  { title: "The Amazing Adventures of Gumball", url: "audio/gumball.mp3" }
];

const todayIndex = (() => {
  const d = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return d.split("/").reduce((a, b) => a + parseInt(b), 0) % playlist.length;
})();

const todayTrack = playlist[todayIndex];
const todayKey = `played-${todayIndex}`;

window.addEventListener("DOMContentLoaded", () => {
  const el = {
    audio: document.getElementById("audioPlayer"),
    playBtn: document.getElementById("playBtn"),
    progressBar: document.getElementById("progressBar"),
    guessGrid: document.getElementById("guessGrid"),
    guessInput: document.getElementById("guessInput"),
    skipBtn: document.getElementById("skipBtn"),
    submitBtn: document.getElementById("submitBtn"),
    volumeSlider: document.getElementById("volumeSlider"),
    resultModal: document.getElementById("resultModal"),
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultCloseBtn: document.getElementById("resultCloseBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak")
  };

  el.audio.src = todayTrack.url;
  el.audio.volume = el.volumeSlider.value;

  let guessCount = 0;
  const maxGuesses = 6;
  const guessedSet = new Set();

  for (let i = 0; i < maxGuesses; i++) {
    const box = document.createElement("div");
    box.className = "h-12 bg-gray-700 rounded flex items-center justify-center text-white font-semibold text-sm";
    el.guessGrid.appendChild(box);
  }

  const updateStats = () => {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.currentStreak.textContent = localStorage.getItem("currentStreak") || 0;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  };

  const disableInputs = () => {
    el.skipBtn.disabled = true;
    el.submitBtn.disabled = true;
    el.guessInput.disabled = true;
  };

  const showModal = (correct) => {
    el.resultTitle.textContent = correct ? "" : "Game Over";
    el.resultAnswer.textContent = todayTrack.title;
    el.resultModal.classList.remove("hidden");
  };

  const endGame = (correct) => {
    localStorage.setItem(todayKey, "done");
    disableInputs();
    showModal(correct);
    if (correct) {
      confetti({ particleCount: 100, spread: 60 });
      el.audio.play();
    }

    let played = parseInt(localStorage.getItem("gamesPlayed") || "0") + 1;
    let streak = parseInt(localStorage.getItem("currentStreak") || "0");
    let best = parseInt(localStorage.getItem("bestStreak") || "0");

    streak = correct ? streak + 1 : 0;
    if (streak > best) best = streak;

    localStorage.setItem("gamesPlayed", played);
    localStorage.setItem("currentStreak", streak);
    localStorage.setItem("bestStreak", best);

    updateStats();
  };

  const handleGuess = () => {
    const guess = el.guessInput.value.trim();
    if (!guess || guessedSet.has(guess.toLowerCase()) || guessCount >= maxGuesses) return;

    guessedSet.add(guess.toLowerCase());
    const box = el.guessGrid.children[guessCount];
    box.textContent = guess;

    if (guess.toLowerCase() === todayTrack.title.toLowerCase()) {
      endGame(true);
    } else if (++guessCount >= maxGuesses) {
      endGame(false);
    }

    el.guessInput.value = "";
  };

  const handleSkip = () => {
    if (guessCount >= maxGuesses) return;
    const box = el.guessGrid.children[guessCount];
    box.textContent = "Skipped";
    guessCount++;
    if (guessCount >= maxGuesses) endGame(false);
  };

  const playSnippet = () => {
    if (guessCount >= maxGuesses) return;
    el.audio.currentTime = 0;
    const duration = [1, 2, 3, 5, 10, 15][Math.min(guessCount, 5)];
    el.audio.play();
    const interval = setInterval(() => {
      el.progressBar.style.width = `${(el.audio.currentTime / duration) * 100}%`;
      if (el.audio.currentTime >= duration) {
        el.audio.pause();
        clearInterval(interval);
        el.progressBar.style.width = "0%";
      }
    }, 100);
  };

  // Event listeners
  el.submitBtn.onclick = handleGuess;
  el.skipBtn.onclick = handleSkip;
  el.playBtn.onclick = playSnippet;
  el.volumeSlider.oninput = () => el.audio.volume = parseFloat(el.volumeSlider.value);
  el.guessInput.onkeydown = (e) => { if (e.key === "Enter") handleGuess(); };
  el.resultCloseBtn.onclick = () => el.resultModal.classList.add("hidden");

  if (localStorage.getItem(todayKey) === "done") {
    disableInputs();
    showModal(false);
  }

  updateStats();
});
