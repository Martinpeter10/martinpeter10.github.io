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
  return ds.split("/").reduce((a,b) => a + parseInt(b), 0) % playlist.length;
}

document.addEventListener("DOMContentLoaded", () => {
  const todayIdx = getTodayIndex(), today = playlist[todayIdx], todayKey = `played-${todayIdx}`;
  const el = {
    guessGrid: document.getElementById("guessGrid"),
    guessInput: document.getElementById("guessInput"),
    autocompleteList: document.getElementById("autocompleteList"),
    playBtn: document.getElementById("playBtn"),
    progressBar: document.getElementById("progressBar"),
    skipBtn: document.getElementById("skipBtn"),
    submitBtn: document.getElementById("submitBtn"),
    volumeSlider: document.getElementById("volumeSlider"),
    resultModal: document.getElementById("resultModal"),
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultCloseBtn: document.getElementById("resultCloseBtn"),
    audio: document.getElementById("audioPlayer"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak")
  };

  el.audio.src = today.url;
  el.audio.volume = parseFloat(el.volumeSlider.value);
  el.volumeSlider.addEventListener("input", () => el.audio.volume = parseFloat(el.volumeSlider.value));

  let guessCount = 0, max = 6, guessed = new Set(), finished = false;

  for (let i=0; i<max; i++) {
    const box = document.createElement("div");
    box.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.guessGrid.appendChild(box);
  }

  const updateStats = () => {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.currentStreak.textContent = localStorage.getItem("currentStreak") || 0;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  };

  function endGame(correct) {
    finished = true;
    localStorage.setItem(todayKey, "done");
    let gp = parseInt(localStorage.getItem("gamesPlayed")||0)+1;
    let cs = parseInt(localStorage.getItem("currentStreak")||0);
    let bs = parseInt(localStorage.getItem("bestStreak")||0);

    if (correct) { cs++; if (cs>bs) bs=cs; confetti({ particleCount:150, spread:70 }); el.resultTitle.textContent=""; el.audio.currentTime=0; el.audio.play(); }
    else { el.resultTitle.textContent = "Game Over"; cs = 0; }

    el.resultAnswer.textContent = today.title;
    el.resultModal.classList.remove("hidden");

    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();

    el.skipBtn.disabled = el.submitBtn.disabled = el.guessInput.disabled = true;
  }

  function revealGuess(text, correct, skipped=false) {
    const box = el.guessGrid.children[guessCount];
    box.textContent = skipped ? "Skipped" : text;
    box.className = `h-12 rounded flex items-center justify-center text-sm ${
      skipped ? "bg-gray-600 italic text-white" :
      correct ? "bg-green-600 text-white" : "bg-red-600 text-white"
    }`;
    guessCount++;
  }

  function handleGuess() {
    if (finished || guessCount >= max) return;
    const text = el.guessInput.value.trim();
    if (!text || guessed.has(text.toLowerCase())) return;
    guessed.add(text.toLowerCase());
    const correct = text.toLowerCase() === today.title.toLowerCase();
    revealGuess(text, correct);
    if (correct) endGame(true);
    else if (guessCount >= max) endGame(false);
    el.guessInput.value = "";
  }

  function handleSkip() {
    if (finished || guessCount >= max) return;
    revealGuess("", false, true);
    if (guessCount >= max) endGame(false);
  }

  el.playBtn.onclick = () => {
    if (finished) return;
    const durations = [1,2,3,5,10,15];
    const t = durations[Math.min(guessCount, durations.length-1)];
    el.audio.currentTime = 0;
    el.audio.play();
    setTimeout(() => el.audio.pause(), t * 1000);
  };

  el.audio.addEventListener("timeupdate", () => {
    const pct = (el.audio.currentTime / el.audio.duration) * 100;
    el.progressBar.style.width = `${pct}%`;
  });

  el.submitBtn.onclick = handleGuess;
  el.skipBtn.onclick = handleSkip;
  el.guessInput.addEventListener("keydown", e => { if (e.key === "Enter") handleGuess(); });
  el.resultCloseBtn.onclick = () => el.resultModal.classList.add("hidden");

  el.guessInput.addEventListener("input", () => {
    const val = el.guessInput.value.toLowerCase();
    el.autocompleteList.innerHTML = "";
    if (!val) return el.autocompleteList.classList.add("hidden");
    playlist.filter(p => p.title.toLowerCase().includes(val)).forEach(p => {
      const div = document.createElement("div");
      div.textContent = p.title;
      div.className = "cursor-pointer px-2 py-1 hover:bg-gray-200 text-black";
      div.onclick = () => { el.guessInput.value = p.title; el.autocompleteList.classList.add("hidden"); };
      el.autocompleteList.appendChild(div);
    });
    el.autocompleteList.classList.remove("hidden");
  });

  updateStats();

  if (localStorage.getItem(todayKey) === "done") {
    endGame(false);
  }
});
