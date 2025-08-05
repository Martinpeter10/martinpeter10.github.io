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
  const key = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return key.split("/").reduce((a,b) => a + parseInt(b), 0) % playlist.length;
}

document.addEventListener("DOMContentLoaded", () => {
  const todayIdx = getTodayIndex();
  const today = playlist[todayIdx];
  const todayKey = `played-${todayIdx}`;

  const el = {
    audio: document.createElement("audio"),
    playBtn: document.getElementById("playBtn"),
    progressBar: document.getElementById("progressBar"),
    volumeSlider: document.getElementById("volumeSlider"),
    skipBtn: document.getElementById("skipBtn"),
    submitBtn: document.getElementById("submitBtn"),
    guessInput: document.getElementById("guessInput"),
    guessGrid: document.getElementById("guessGrid"),
    resultModal: document.getElementById("resultModal"),
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultCloseBtn: document.getElementById("resultCloseBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak")
  };

  document.body.appendChild(el.audio);
  el.audio.src = today.url;
  el.audio.volume = parseFloat(el.volumeSlider.value);

  el.volumeSlider.addEventListener("input", () => {
    el.audio.volume = parseFloat(el.volumeSlider.value);
  });

  let guessCount = 0, max = 6, finished = false;
  const guessedSet = new Set();

  // fill guess boxes
  for (let i = 0; i < max; i++) {
    const div = document.createElement("div");
    div.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.guessGrid.appendChild(div);
  }

  const updateStats = () => {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.currentStreak.textContent = localStorage.getItem("currentStreak") || 0;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  };

  const disableAll = () => {
    finished = true;
    el.skipBtn.disabled = el.submitBtn.disabled = el.guessInput.disabled = true;
  };

  const endGame = (correct) => {
    finished = true;
    localStorage.setItem(todayKey, "done");
    let gp = parseInt(localStorage.getItem("gamesPlayed")||0) + 1;
    let cs = parseInt(localStorage.getItem("currentStreak")||0);
    let bs = parseInt(localStorage.getItem("bestStreak")||0);
    if (correct) {
      cs++; if (cs > bs) bs = cs;
      confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } });
      el.resultTitle.textContent = "";
      el.audio.currentTime = 0;
      el.audio.play();
    } else {
      el.resultTitle.textContent = "Game Over";
    }
    el.resultAnswer.textContent = today.title;
    el.resultModal.classList.remove("hidden");
    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();
    disableAll();
  };

  const handleGuess = () => {
    if (finished) return;
    const g = el.guessInput.value.trim();
    if (!g || guessedSet.has(g.toLowerCase()) || guessCount >= max) return;
    guessedSet.add(g.toLowerCase());
    const box = el.guessGrid.children[guessCount];
    box.textContent = g;
    box.classList.add("bg-gray-700", "text-white");
    guessCount++;
    if (g.toLowerCase() === today.title.toLowerCase()) {
      endGame(true);
    } else if (guessCount >= max) {
      endGame(false);
    }
    el.guessInput.value = "";
  };

  const handleSkip = () => {
    if (finished || guessCount >= max) return;
    const box = el.guessGrid.children[guessCount];
    box.textContent = "Skipped";
    box.classList.add("bg-gray-600", "italic", "text-white");
    guessCount++;
    if (guessCount >= max) endGame(false);
  };

  el.playBtn.onclick = () => {
    if (finished) return;
    const duration = [1,2,3,5,10,15][Math.min(guessCount,5)];
    el.audio.currentTime = 0;
    el.audio.play();
    setTimeout(() => el.audio.pause(), duration * 1000);
  };

  el.audio.addEventListener("timeupdate", () => {
    const pct = (el.audio.currentTime / el.audio.duration) * 100;
    el.progressBar.style.width = `${pct}%`;
  });

  el.submitBtn.onclick = handleGuess;
  el.skipBtn.onclick = handleSkip;
  el.resultCloseBtn.onclick = () => el.resultModal.classList.add("hidden");
  el.guessInput.onkeydown = e => { if (e.key === "Enter") handleGuess(); };

  updateStats();

  if (localStorage.getItem(todayKey) === "done") {
    el.resultAnswer.textContent = today.title;
    el.resultModal.classList.remove("hidden");
    disableAll();
  }
});
