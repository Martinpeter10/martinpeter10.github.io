const playlist = [
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "All Grown Up", url: "audio/all‑grown‑up.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Teenage Mutant Ninja Turtles", url: "audio/tmnt.mp3" },
  { title: "Adventure Time", url: "audio/adventure‑time.mp3" },
  { title: "Grim Adventures of Billy and Mandy", url: "audio/grim‑adventures.mp3" },
  { title: "Kids Next Door", url: "audio/kids‑next‑door.mp3" },
  { title: "Regular Show", url: "audio/regular‑show.mp3" },
  { title: "The Amazing Adventures of Gumball", url: "audio/gumball.mp3" }
];

function getTodayIndex() {
  const ds = new Date().toLocaleDateString("en‑US", { timeZone: "America/Chicago" });
  return ds.split("/").reduce((a, b) => a + parseInt(b), 0) % playlist.length;
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex(), today = playlist[idx], todayKey = `played‑${idx}`;
  const audio = document.getElementById("audioPlayer");

  const el = {
    grid: document.getElementById("guessGrid"),
    input: document.getElementById("guessInput"),
    ac: document.getElementById("autocompleteList"),
    playBtn: document.getElementById("playBtn"),
    bar: document.getElementById("progressBar"),
    skip: document.getElementById("skipBtn"),
    submit: document.getElementById("submitBtn"),
    vol: document.getElementById("volumeSlider"),
    modal: document.getElementById("resultModal"),
    title: document.getElementById("resultTitle"),
    ans: document.getElementById("resultAnswer"),
    closeModal: document.getElementById("resultCloseBtn"),
    alreadyModal: document.getElementById("alreadyPlayedModal"),
    alreadyDesc: document.getElementById("alreadyDesc"),
    alreadyOk: document.getElementById("alreadyOk"),
    games: document.getElementById("gamesPlayed"),
    streak: document.getElementById("currentStreak"),
    best: document.getElementById("bestStreak")
  };

  let guessCount = 0, max = 6, guessed = new Set(), finished = false;
  audio.src = today.url;
  audio.volume = parseFloat(el.vol.value);
  el.vol.oninput = () => audio.volume = parseFloat(el.vol.value);

  for (let i=0; i<max; i++) {
    const box = document.createElement("div");
    box.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.grid.appendChild(box);
  }

  function updateStats() {
    el.games.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.streak.textContent = localStorage.getItem("currentStreak") || 0;
    el.best.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function finish(correct) {
    finished = true;
    localStorage.setItem(todayKey, "done");
    let gp = parseInt(localStorage.getItem("gamesPlayed")||0)+1;
    let cs = parseInt(localStorage.getItem("currentStreak")||0);
    let bs = parseInt(localStorage.getItem("bestStreak")||0);
    if (correct) {
      cs++; if (cs>bs) bs=cs;
      confetti({ particleCount:150, spread:70 });
      el.title.textContent = "";
      audio.currentTime = 0;
      audio.play();
    } else {
      cs = 0;
      el.title.textContent = "Game Over";
    }
    el.ans.textContent = today.title;
    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();
    el.modal.classList.remove("hidden");
    el.skip.disabled = el.submit.disabled = el.input.disabled = true;
  }

  function reveal(text, correct=false, skip=false) {
    const cell = el.grid.children[guessCount];
    cell.textContent = skip ? "Skipped" : text;
    const cls = skip ? "bg-gray-600 italic" : correct ? "bg-green-600" : "bg-red-600";
    cell.className = `h-12 rounded flex items-center justify-center text-sm text-white ${cls}`;
    guessCount++;
  }

  function handleGuess() {
    if (finished || guessCount >= max) return;
    const val = el.input.value.trim();
    if (!val || guessed.has(val.toLowerCase())) return;
    guessed.add(val.toLowerCase());
    const correct = val.toLowerCase() === today.title.toLowerCase();
    reveal(val, correct);
    if (correct) finish(true);
    else if (guessCount >= max) finish(false);
    el.input.value = "";
  }

  function handleSkip() {
    if (finished || guessCount >= max) return;
    reveal("", false, true);
    if (guessCount >= max) finish(false);
  }

  const durations = [1, 2, 3, 5, 10, 15];
  el.playBtn.onclick = () => {
    if (finished) return;
    const t = durations[Math.min(guessCount, durations.length - 1)];
    audio.currentTime = 0;
    audio.play();
    setTimeout(() => audio.pause(), t * 1000);
  };

  audio.addEventListener("timeupdate", () => {
    const p = (audio.currentTime / audio.duration) || 0;
    el.bar.style.width = `${p * 100}%`;
  });

  el.submit.onclick = handleGuess;
  el.skip.onclick = handleSkip;
  el.input.onkeydown = e => e.key === "Enter" && handleGuess();
  el.closeModal.onclick = () => el.modal.classList.add("hidden");

  el.input.addEventListener("input", () => {
    const val = el.input.value.toLowerCase();
    el.ac.innerHTML = "";
    if (!val) return el.ac.classList.add("hidden");
    playlist.filter(p => p.title.toLowerCase().includes(val)).forEach(p => {
      const d = document.createElement("div");
      d.textContent = p.title;
      d.className = "px-3 py-1 hover:bg-gray-200 cursor-pointer";
      d.onclick = () => {
        el.input.value = p.title;
        el.ac.classList.add("hidden");
      };
      el.ac.appendChild(d);
    });
    el.ac.classList.remove("hidden");
  });

  updateStats();

  if (localStorage.getItem(todayKey) === "done") {
    el.alreadyModal.classList.remove("hidden");
    const now = new Date(), mid = new Date(now);
    mid.setHours(24,0,0,0);
    const diff = mid - now;
    const hrs = Math.floor(diff/36e5);
    const mins = Math.floor((diff % 36e5)/6e4);
    const secs = Math.floor((diff % 6e4)/1000);
    el.alreadyDesc.textContent = `Come back in ${hrs}h ${mins}m ${secs}s`;
    el.alreadyOk.onclick = () => el.alreadyModal.classList.add("hidden");
  }
});
