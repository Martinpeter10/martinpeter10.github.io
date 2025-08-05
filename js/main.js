const playlist = [
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "All Grown Up", url: "audio/all-grown-up.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Teenage Mutant Ninja Turtles", url: "audio/tmnt.mp3" },
  { title: "Adventure Time", url: "audio/adventure-time.mp3" },
  { title: "Grim Adventures of Billy and Mandy", url: "audio/grim-adventures.mp3" },
  { title: "Code Name Kids Next Door", url: "audio/kids-next-door.mp3" },
  { title: "Regular Show", url: "audio/regular-show.mp3" },
  { title: "The Amazing Adventures of Gumball", url: "audio/gumball.mp3" }
];

function getTodayIndex() {
  const ds = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return ds.split("/").reduce((a, b) => a + parseInt(b), 0) % playlist.length;
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex();
  const today = playlist[idx];
  const todayKey = `played-${idx}`;

  const el = {
    audio: document.getElementById("audioPlayer"),
    playBtn: document.getElementById("playBtn"),
    progressBar: document.getElementById("progressBar"),
    volumeSlider: document.getElementById("volumeSlider"),
    guessInput: document.getElementById("guessInput"),
    autocomplete: document.getElementById("autocomplete-list"),
    skipBtn: document.getElementById("skipBtn"),
    submitBtn: document.getElementById("submitBtn"),
    guessGrid: document.getElementById("guessGrid"),
    resultModal: document.getElementById("resultModal"),
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultCloseBtn: document.getElementById("resultCloseBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak")
  };

  el.audio.src = today.url;
  el.audio.volume = parseFloat(el.volumeSlider.value);
  el.volumeSlider.addEventListener("input", () => {
    el.audio.volume = parseFloat(el.volumeSlider.value);
  });

  let guessCount = 0,
      max = 6,
      guessed = new Set(),
      finished = false;

  for (let i = 0; i < max; i++) {
    const div = document.createElement("div");
    div.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.guessGrid.appendChild(div);
  }

  function updateStats() {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.currentStreak.textContent = localStorage.getItem("currentStreak") || 0;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function finishGame(correct) {
    finished = true;
    localStorage.setItem(todayKey, "done");

    let gp = parseInt(localStorage.getItem("gamesPlayed") || 0) + 1;
    let cs = parseInt(localStorage.getItem("currentStreak") || 0);
    let bs = parseInt(localStorage.getItem("bestStreak") || 0);
    if (correct) { cs++; if (cs > bs) bs = cs; }
    else cs = 0;

    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);

    if (correct) {
      confetti({ particleCount: 150, spread: 70 });
      el.resultTitle.textContent = "";
      el.audio.currentTime = 0;
      el.audio.play();
    } else {
      el.resultTitle.textContent = "Game Over";
    }

    el.resultAnswer.textContent = today.title;
    el.resultModal.classList.remove("hidden");
    updateStats();

    el.skipBtn.disabled = el.submitBtn.disabled = true;
    el.guessInput.disabled = true;
  }

  function revealGuess(guess, isCorrect, skipped=false) {
    const box = el.guessGrid.children[guessCount];
    box.textContent = skipped ? "Skipped" : guess;
    box.className = `h-12 rounded flex items-center justify-center text-sm ${
      guess ? (isCorrect ? "bg-green-600 text-white" : "bg-red-600 text-white") : "bg-gray-600 text-white italic"
    }`;
    guessCount++;
  }

  function handleGuess() {
    if (finished || guessCount >= max) return;
    const g = el.guessInput.value.trim();
    if (!g || guessed.has(g.toLowerCase())) return;

    guessed.add(g.toLowerCase());
    const correct = g.toLowerCase() === today.title.toLowerCase();
    revealGuess(g, correct);
    if (correct) finishGame(true);
    else if (guessCount >= max) finishGame(false);

    el.guessInput.value = "";
  }

  function handleSkip() {
    if (finished || guessCount >= max) return;
    revealGuess("", false, true);
    if (guessCount >= max) finishGame(false);
  }

  el.playBtn.addEventListener("click", () => {
    if (finished) return;
    el.audio.currentTime = 0;
    el.audio.play();
    const durations = [1,2,3,5,10,15];
    const t = durations[Math.min(guessCount, durations.length - 1)];
    setTimeout(() => el.audio.pause(), t * 1000);
  });

  el.audio.addEventListener("timeupdate", () => {
    const pct = (el.audio.currentTime / el.audio.duration) * 100;
    el.progressBar.style.width = `${pct}%`;
  });

  el.submitBtn.addEventListener("click", handleGuess);
  el.skipBtn.addEventListener("click", handleSkip);

  el.guessInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleGuess();
  });

  el.resultCloseBtn.addEventListener("click", () => {
    el.resultModal.classList.add("hidden");
  });

  el.autocomplete.addEventListener("click", () => el.autocomplete.classList.add("hidden"));

  el.guessInput.addEventListener("input", () => {
    const val = el.guessInput.value.toLowerCase();
    el.autocomplete.innerHTML = "";
    if (!val) return el.autocomplete.classList.add("hidden");
    playlist.filter(t => t.title.toLowerCase().includes(val)).forEach(t => {
      const d = document.createElement("div");
      d.textContent = t.title;
      d.className = "px-3 py-1 hover:bg-gray-200 cursor-pointer";
      d.onclick = () => {
        el.guessInput.value = t.title;
        el.autocomplete.classList.add("hidden");
      };
      el.autocomplete.appendChild(d);
    });
    el.autocomplete.classList.remove("hidden");
  });

  updateStats();

  if (localStorage.getItem(todayKey) === "done") {
    finishGame(false);
  }
});
