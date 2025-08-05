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
const durations = [1,2,3,5,10,15];
const maxGuesses = 6;

function getTodayIndex() {
  const base = new Date("2024-01-01T00:00:00-06:00");
  const now = new Date();
  return Math.floor((now - base) / (1000*60*60*24)) % playlist.length;
}

function formatCountdown() {
  const now = new Date(), mid = new Date();
  mid.setHours(24,0,0,0);
  const diff = mid - now;
  const h = Math.floor(diff/3600000),
        m = Math.floor((diff%3600000)/60000),
        s = Math.floor((diff%60000)/1000);
  return `Come back in ${h}h ${m}m ${s}s`;
}

function getState(key) {
  return JSON.parse(localStorage.getItem(key) || '{"guesses":[],"count":0,"finished":false,"won":false,"statsRecorded":false}');
}
function saveState(key, st) {
  localStorage.setItem(key, JSON.stringify(st));
}

function disableGame(el) {
  el.skipBtn.disabled = true;
  el.submitBtn.disabled = true;
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex(), answer = playlist[idx].title;
  const stateKey = `state-${idx}`;
  const state = getState(stateKey);

  const el = {
    audio: document.getElementById("audioPlayer"),
    playBtn: document.getElementById("playBtn"),
    progressSegments: document.getElementById("progressSegments"),
    guessGrid: document.getElementById("guessGrid"),
    guessInput: document.getElementById("guessInput"),
    acList: document.getElementById("autocompleteList"),
    submitBtn: document.getElementById("submitBtn"),
    skipBtn: document.getElementById("skipBtn"),
    correctAnswer: document.getElementById("correctAnswer"),
    countdown: document.getElementById("countdown"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak"),
    alreadyModal: document.getElementById("alreadyPlayedModal"),
    alreadyDesc: document.getElementById("alreadyDesc"),
    alreadyOk: document.getElementById("alreadyOk"),
    winModal: document.getElementById("winModal"),
    winAnswer: document.getElementById("winAnswer"),
    winOk: document.getElementById("winOk"),
    gameOverModal: document.getElementById("gameOverModal"),
    gameOverAnswer: document.getElementById("gameOverAnswer"),
    gameOverOk: document.getElementById("gameOverOk")
  };

  el.audio.src = playlist[idx].url;

  function renderSegments() {
    el.progressSegments.innerHTML = "";
    const total = durations[durations.length - 1];
    durations.forEach((sec, i) => {
      const div = document.createElement("div");
      div.style.flex = sec / total;
      div.style.height = "100%";
      div.style.backgroundColor = i < state.count ? "#34D399" : "#374151";
      el.progressSegments.appendChild(div);
    });
  }

  function animatePlay(full = false) {
    if(state.finished && !full) return;

    const stage = full ? durations.length - 1 : Math.min(state.count, durations.length - 1);
    const sec = full ? durations[durations.length - 1] : durations[stage];
    const total = durations[durations.length - 1];

    el.audio.currentTime = 0;
    el.audio.play();
    renderSegments();

    const playDiv = document.createElement("div");
    playDiv.style.position = "absolute";
    playDiv.style.top = playDiv.style.left = "0";
    playDiv.style.height = "100%";
    playDiv.style.backgroundColor = "#34D399";
    playDiv.style.width = "0%";
    playDiv.style.transition = `width ${sec}s linear`;
    el.progressSegments.appendChild(playDiv);

    requestAnimationFrame(() => {
      playDiv.style.width = `${(sec / total) * 100}%`;
    });

    setTimeout(() => {
      el.audio.pause();
      el.audio.currentTime = 0;
      renderSegments();
    }, sec * 1000);
  }

  function placeGuesses() {
    const w = el.guessInput.offsetWidth + "px";
    el.guessGrid.innerHTML = "";
    state.guesses.slice(0, maxGuesses).forEach(txt => {
      const div = document.createElement("div");
      div.className = "h-12 rounded flex items-center justify-center text-sm text-white mb-2";
      div.style.width = w;
      div.style.backgroundColor = txt === "Skipped" ? "#4B5563" :
        (txt.toLowerCase() === answer.toLowerCase() ? "#34D399" : "#EF4444");
      div.textContent = txt;
      el.guessGrid.appendChild(div);
    });
    for(let i = state.guesses.length; i < maxGuesses; i++){
      const div = document.createElement("div");
      div.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm text-white mb-2";
      div.style.width = w;
      el.guessGrid.appendChild(div);
    }
  }

  function finishGame() {
    disableGame(el);
    if(!state.statsRecorded) {
      updateStats(state.won);
      state.statsRecorded = true;
      saveState(stateKey, state);
    }
    if(state.won) {
      confetti({ particleCount: 150, spread: 70 });
      el.winAnswer.textContent = answer;
      el.winModal.classList.remove("hidden");
    } else {
      el.correctAnswer.textContent = answer;
      el.correctAnswer.classList.remove("hidden");
      el.gameOverAnswer.textContent = answer;
      el.gameOverModal.classList.remove("hidden");
    }
    animatePlay(true);
  }

  function handleGuess(txt) {
    state.guesses.push(txt);
    if(txt.toLowerCase() === answer.toLowerCase()) {
      state.finished = state.won = true;
    } else {
      state.count++;
      if(state.count >= maxGuesses) state.finished = true;
    }
    saveState(stateKey, state);
    placeGuesses();
    renderSegments();
    el.guessInput.value = "";
    if(state.finished) setTimeout(finishGame, 300);
  }

  function updateStats(won) {
    const g = (Number(localStorage.getItem("games")) || 0) + 1;
    localStorage.setItem("games", g);
    el.gamesPlayed.textContent = g;

    let s = Number(localStorage.getItem("streak") || 0);
    if(won) {
      s++; localStorage.setItem("streak", s);
      const b = Number(localStorage.getItem("best") || 0);
      if(s > b) localStorage.setItem("best", s);
    } else {
      s = 0; localStorage.setItem("streak", "0");
    }
    el.currentStreak.textContent = s;
    el.bestStreak.textContent = localStorage.getItem("best") || "0";
  }

  function showAutocomplete() {
    el.acList.innerHTML = "";
    const q = el.guessInput.value.trim().toLowerCase();
    if(!q) return;
    playlist.forEach(song => {
      if(song.title.toLowerCase().includes(q)) {
        const d = document.createElement("div");
        d.textContent = song.title;
        d.className = "px-2 py-1 hover:bg-gray-700 cursor-pointer";
        d.onclick = () => {
          el.guessInput.value = song.title;
          el.acList.innerHTML = "";
          el.acList.classList.add("hidden");
        };
        el.acList.appendChild(d);
      }
    });
    el.acList.children.length ? el.acList.classList.remove("hidden") : el.acList.classList.add("hidden");
  }

  function showAlreadyModal(){
    el.alreadyDesc.textContent = formatCountdown();
    el.alreadyModal.classList.remove("hidden");
  }

  el.alreadyOk.addEventListener("click", () => el.alreadyModal.classList.add("hidden"));
  el.winOk.addEventListener("click", () => el.winModal.classList.add("hidden"));
  el.gameOverOk.addEventListener("click", () => el.gameOverModal.classList.add("hidden"));

  placeGuesses();
  renderSegments();

  if(state.finished) {
    disableGame(el);
    showAlreadyModal();
  }

  el.playBtn.addEventListener("click", () => animatePlay(false));
  el.submitBtn.addEventListener("click", () => {
    const v = el.guessInput.value.trim();
    if(v) handleGuess(v);
  });
  el.guessInput.addEventListener("keydown", e => {
    if(e.key === "Enter") {
      e.preventDefault();
      const v = el.guessInput.value.trim();
      if(v) handleGuess(v);
    }
  });
  el.skipBtn.addEventListener("click", () => {
    if(!state.finished) handleGuess("Skipped");
  });
  el.guessInput.addEventListener("input", showAutocomplete);

  setInterval(() => el.countdown.textContent = formatCountdown(), 1000);
});
