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
  const date = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return date.split("/").reduce((a, b) => a + parseInt(b), 0) % playlist.length;
}

document.addEventListener("DOMContentLoaded", () => {
  const todayIndex = getTodayIndex();
  const todayTrack = playlist[todayIndex];
  const todayKey = `played-${todayIndex}`;
  const audio = new Audio(todayTrack.url);

  // Elements
  const el = {
    guessGrid: document.getElementById("guessGrid"),
    guessInput: document.getElementById("guessInput"),
    autocompleteList: document.getElementById("autocomplete-list"),
    playBtn: document.getElementById("playBtn"),
    progressBar: document.getElementById("progressBar"),
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

  // Init state
  let guessCount = 0;
  const maxGuesses = 6;
  const guessedSet = new Set();
  let finished = false;

  // Setup UI
  for (let i = 0; i < maxGuesses; i++) {
    const div = document.createElement("div");
    div.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.guessGrid.appendChild(div);
  }

  audio.volume = parseFloat(el.volumeSlider.value);
  el.volumeSlider.oninput = () => (audio.volume = parseFloat(el.volumeSlider.value));

  // Stats
  const updateStats = () => {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    el.currentStreak.textContent = localStorage.getItem("currentStreak") || 0;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  };

  const endGame = (correct) => {
    finished = true;
    localStorage.setItem(todayKey, "done");
    let gp = parseInt(localStorage.getItem("gamesPlayed") || 0) + 1;
    let cs = parseInt(localStorage.getItem("currentStreak") || 0);
    let bs = parseInt(localStorage.getItem("bestStreak") || 0);

    if (correct) {
      cs++;
      if (cs > bs) bs = cs;
      confetti({ particleCount: 150, spread: 70 });
      el.resultTitle.textContent = "";
      audio.currentTime = 0;
      audio.play();
    } else {
      cs = 0;
      el.resultTitle.textContent = "Game Over";
    }

    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();

    el.resultAnswer.textContent = todayTrack.title;
    el.resultModal.classList.remove("hidden");
  };

  const handleGuess = () => {
    if (finished || guessCount >= maxGuesses) return;
    const guess = el.guessInput.value.trim();
    if (!guess || guessedSet.has(guess.toLowerCase())) return;

    const box = el.guessGrid.children[guessCount];
    box.textContent = guess;
    guessedSet.add(guess.toLowerCase());

    if (guess.toLowerCase() === todayTrack.title.toLowerCase()) {
      endGame(true);
    } else {
      guessCount++;
      if (guessCount >= maxGuesses) endGame(false);
    }
    el.guessInput.value = "";
  };

  const handleSkip = () => {
    if (finished || guessCount >= maxGuesses) return;
    const box = el.guessGrid.children[guessCount];
    box.textContent = "Skipped";
    box.classList.add("italic", "text-gray-300");
    guessCount++;
    if (guessCount >= maxGuesses) endGame(false);
  };

  el.playBtn.onclick = () => {
    if (finished) return;
    const duration = [1,2,3,5,10,15][Math.min(guessCount, 5)];
    audio.currentTime = 0;
    audio.play();
    setTimeout(() => audio.pause(), duration * 1000);
  };

  audio.addEventListener("timeupdate", () => {
    const pct = (audio.currentTime / audio.duration) * 100;
    el.progressBar.style.width = `${pct}%`;
  });

  // Autocomplete
  el.guessInput.addEventListener("input", () => {
    const val = el.guessInput.value.toLowerCase();
    el.autocompleteList.innerHTML = "";
    if (!val) return el.autocompleteList.classList.add("hidden");

    playlist.filter(t => t.title.toLowerCase().includes(val)).forEach(t => {
      const div = document.createElement("div");
      div.textContent = t.title;
      div.className = "cursor-pointer px-3 py-1 hover:bg-gray-200";
      div.onclick = () => {
        el.guessInput.value = t.title;
        el.autocompleteList.classList.add("hidden");
      };
      el.autocompleteList.appendChild(div);
    });

    el.autocompleteList.classList.remove("hidden");
  });

  // Bindings
  el.submitBtn.onclick = handleGuess;
  el.skipBtn.onclick = handleSkip;
  el.guessInput.onkeydown = e => (e.key === "Enter" && handleGuess());
  el.resultCloseBtn.onclick = () => el.resultModal.classList.add("hidden");

  updateStats();

  if (localStorage.getItem(todayKey) === "done") {
    el.resultAnswer.textContent = todayTrack.title;
    el.resultModal.classList.remove("hidden");
    finished = true;
  }
});
