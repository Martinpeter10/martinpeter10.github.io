const playlist = [
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "All Grown Up", url: "audio/allgrownup.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Teenage Mutant Ninja Turtles", url: "audio/tmnt.mp3" },
  { title: "Adventure Time", url: "audio/adventuretime.mp3" },
  { title: "Grim Adventures of Billy and Mandy", url: "audio/grimadventures.mp3" },
  { title: "Kids Next Door", url: "audio/kidsnextdoor.mp3" },
  { title: "Regular Show", url: "audio/regularshow.mp3" },
  { title: "The Amazing Adventures of Gumball", url: "audio/gumball.mp3" }
];

const durations = [1, 2, 3, 5, 10, 15];

function getTodayIndex() {
  const base = new Date('2024-01-01T00:00:00-06:00');
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return Math.floor((now - base) / (1000 * 60 * 60 * 24)) % playlist.length;
}

function getTimeUntilMidnightCST() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function disableAllGameInput(el) {
  el.input.disabled = true;
  el.submit.disabled = true;
  el.skip.disabled = true;
  el.playBtn.disabled = true;
}

function renderSegments(el, guessCount) {
  el.segments.innerHTML = "";
  durations.forEach((s, i) => {
    const seg = document.createElement("div");
    seg.className = `flex-1 text-xs text-center relative`;
    seg.innerHTML = `
      <div class="h-1 w-full rounded ${i <= guessCount ? 'bg-green-400' : 'bg-gray-600'}"></div>
      <div class="absolute top-full left-1/2 -translate-x-1/2 mt-1">${s}s</div>`;
    el.segments.appendChild(seg);
  });
}

function restoreState(todayKey) {
  const raw = localStorage.getItem(todayKey + "-state");
  return raw ? JSON.parse(raw) : { guessCount: 0, guessed: [], finished: false };
}

function saveState(todayKey, state) {
  localStorage.setItem(todayKey + "-state", JSON.stringify(state));
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex(), today = playlist[idx], todayKey = `played-${idx}`;
  const audio = document.getElementById("audioPlayer");
  const el = {
    grid: document.getElementById("guessGrid"),
    input: document.getElementById("guessInput"),
    ac: document.getElementById("autocompleteList"),
    playBtn: document.getElementById("playBtn"),
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
    best: document.getElementById("bestStreak"),
    segments: document.getElementById("progressSegments"),
    countdown: document.getElementById("countdown")
  };

  let state = restoreState(todayKey);
  audio.src = today.url;
  audio.volume = parseFloat(el.vol.value);
  el.vol.oninput = () => audio.volume = parseFloat(el.vol.value);

  for (let i = 0; i < 6; i++) {
    const box = document.createElement("div");
    box.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.grid.appendChild(box);
  }

  function updateStats() {
    if (!localStorage.getItem("gamesPlayed")) localStorage.setItem("gamesPlayed", 0);
    if (!localStorage.getItem("currentStreak")) localStorage.setItem("currentStreak", 0);
    if (!localStorage.getItem("bestStreak")) localStorage.setItem("bestStreak", 0);
    el.games.textContent = localStorage.getItem("gamesPlayed");
    el.streak.textContent = localStorage.getItem("currentStreak");
    el.best.textContent = localStorage.getItem("bestStreak");
  }

  function reveal(text, correct = false, skip = false) {
    const cell = el.grid.children[state.guessCount];
    cell.textContent = skip ? "Skipped" : text;
    const cls = skip ? "bg-gray-600 italic" : correct ? "bg-green-600" : "bg-red-600";
    cell.className = `h-12 rounded flex items-center justify-center text-sm text-white ${cls}`;
    state.guessCount++;
    renderSegments(el, state.guessCount);
    saveState(todayKey, state);
  }

  function finish(correct) {
    state.finished = true;
    saveState(todayKey, state);
    localStorage.setItem(todayKey, "done");
    let gp = parseInt(localStorage.getItem("gamesPlayed") || 0) + 1;
    let cs = parseInt(localStorage.getItem("currentStreak") || 0);
    let bs = parseInt(localStorage.getItem("bestStreak") || 0);
    if (correct) {
      cs++; if (cs > bs) bs = cs;
      confetti({ particleCount: 150, spread: 70 });
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
    disableAllGameInput(el);
  }

  function handleGuess() {
    if (state.finished || state.guessCount >= 6) return;
    const val = el.input.value.trim();
    if (!val || state.guessed.includes(val.toLowerCase())) return;
    state.guessed.push(val.toLowerCase());
    const correct = val.toLowerCase() === today.title.toLowerCase();
    reveal(val, correct);
    if (correct) finish(true);
    else if (state.guessCount >= 6) finish(false);
    el.input.value = "";
    el.ac.classList.add("hidden");
  }

  el.playBtn.onclick = () => {
    if (state.finished) return;
    const t = durations[Math.min(state.guessCount, durations.length - 1)];
    audio.currentTime = 0;
    audio.play();
    setTimeout(() => audio.pause(), t * 1000);
  };

  el.submit.onclick = handleGuess;
  el.skip.onclick = () => {
    if (state.finished || state.guessCount >= 6) return;
    reveal("", false, true);
    if (state.guessCount >= 6) finish(false);
  };
  el.input.onkeydown = e => e.key === "Enter" && handleGuess();
  el.closeModal.onclick = () => el.modal.classList.add("hidden");

  el.input.addEventListener("input", () => {
    const val = el.input.value.toLowerCase();
    el.ac.innerHTML = "";
    if (!val) {
      el.ac.classList.add("hidden");
      return;
    }
    const matches = playlist.filter(p => p.title.toLowerCase().includes(val));
    if (matches.length === 0) {
      el.ac.classList.add("hidden");
      return;
    }
    matches.forEach(p => {
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

  // Countdown
  setInterval(() => {
    el.countdown.textContent = `Next theme song in: ${getTimeUntilMidnightCST()}`;
  }, 1000);

  updateStats();
  renderSegments(el, state.guessCount);

  // Restore guesses if any
  state.guessed.forEach((g, i) => {
    const correct = g === today.title.toLowerCase();
    const cell = el.grid.children[i];
    cell.textContent = g;
    const cls = correct ? "bg-green-600" : "bg-red-600";
    cell.className = `h-12 rounded flex items-center justify-center text-sm text-white ${cls}`;
  });

  if (state.finished || localStorage.getItem(todayKey) === "done") {
    el.alreadyModal.classList.remove("hidden");
    disableAllGameInput(el);
    const now = new Date(), mid = new Date(now);
    mid.setHours(24, 0, 0, 0);
    const diff = mid - now;
    const hrs = Math.floor(diff / 36e5);
    const mins = Math.floor((diff % 36e5) / 6e4);
    const secs = Math.floor((diff % 6e4) / 1000);
    el.alreadyDesc.textContent = `Come back in ${hrs}h ${mins}m ${secs}s`;
  }

  el.alreadyOk.onclick = () => el.alreadyModal.classList.add("hidden");
});
