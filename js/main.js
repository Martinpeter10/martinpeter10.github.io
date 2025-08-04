// Playlist using self-hosted MP3 URLs
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

// Calculate today's index
function getTodayIndex() {
  const key = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return key.split("/").reduce((a, b) => a + parseInt(b), 0) % playlist.length;
}

window.addEventListener("DOMContentLoaded", () => {
  const todayIdx = getTodayIndex();
  const today = playlist[todayIdx];
  const todayKey = `played-${todayIdx}`;

  const el = {
    audio: document.getElementById("audioPlayer"),
    play: document.getElementById("playSnippet"),
    skip: document.getElementById("skipBtn"),
    guessInput: document.getElementById("guessInput"),
    autocomplete: document.getElementById("autocomplete-list"),
    submit: document.getElementById("submitBtn"),
    history: document.getElementById("guessHistory"),
    correctReveal: document.getElementById("correctAnswerReveal"),
    currentGuess: document.getElementById("currentGuess"),
    listenTime: document.getElementById("listenTime"),
    resultModal: document.getElementById("resultModal"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultClose: document.getElementById("resultCloseBtn"),
    share: document.getElementById("shareBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak"),
    countdown: document.getElementById("countdownBottom"),
    alreadyModal: document.getElementById("alreadyPlayedModal"),
    alreadyOk: document.getElementById("alreadyPlayedOkBtn")
  };

  el.audio.src = today.url;

  let currentGuess = 0;
  const maxGuesses = 6;
  const guessedSet = new Set();

  updateStats();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (localStorage.getItem(todayKey) === "done") {
    el.correctReveal.textContent = `🎯 The correct answer was: ${today.title}`;
    el.correctReveal.classList.remove("hidden");
    el.alreadyModal.classList.remove("hidden");
    el.alreadyOk.onclick = () => el.alreadyModal.classList.add("hidden");
    disableAll();
  }

  el.play.onclick = () => {
    if (currentGuess >= maxGuesses) return;
    el.audio.currentTime = 0;
    el.audio.play();
    const t = [1, 2, 3, 5, 10, 15][Math.min(currentGuess, 5)];
    setTimeout(() => el.audio.pause(), t * 1000);
  };

  el.skip.onclick = handleSkip;
  el.submit.onclick = handleGuess;
  el.resultClose.onclick = () => el.resultModal.classList.add("hidden");
  el.share.onclick = shareResults;

  el.guessInput.addEventListener("input", autoComplete);
  el.guessInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") handleGuess();
  });

  function updateStats() {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    const streak = parseInt(localStorage.getItem("currentStreak") || "0", 10);
    el.currentStreak.textContent = streak + (streak >= 5 ? " 🔥" : "");
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function updateCountdown() {
    const now = new Date(),
      midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const h = Math.floor(diff / 3600000),
      m = Math.floor((diff % 3600000) / 60000),
      s = Math.floor((diff % 60000) / 1000);
    el.countdown.textContent = `⏳ New theme song in ${h}h ${m}m ${s}s`;
    document.getElementById("countdownModal").textContent = el.countdown.textContent;
  }

  function handleGuess() {
    const guess = el.guessInput.value.trim();
    if (!guess || guessedSet.has(guess.toLowerCase()) || currentGuess >= maxGuesses) return;
    guessedSet.add(guess.toLowerCase());
    const t = [1, 2, 3, 5, 10, 15][Math.min(currentGuess, 5)];
    const correct = guess.toLowerCase() === today.title.toLowerCase();
    const div = document.createElement("div");
    div.textContent = `${correct ? "✅" : "❌"} ${guess} @ ${t}s`;
    div.className = correct ? "text-green-300 font-bold" : "text-red-300";
    el.history.appendChild(div);
    el.guessInput.value = "";
    currentGuess++;
    el.currentGuess.textContent = Math.min(currentGuess + 1, maxGuesses);
    el.listenTime.textContent = `${t} second`;

    if (correct) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      finishGame(true);
    } else if (currentGuess >= maxGuesses) {
      finishGame(false);
    }
  }

  function handleSkip() {
    if (currentGuess >= maxGuesses) return;
    const t = [1, 2, 3, 5, 10, 15][Math.min(currentGuess, 5)];
    const div = document.createElement("div");
    div.textContent = `⏭️ Skipped @ ${t}s`;
    div.className = "text-yellow-200";
    el.history.appendChild(div);
    currentGuess++;
    el.currentGuess.textContent = Math.min(currentGuess + 1, maxGuesses);
    el.listenTime.textContent = `${t} second`;

    if (currentGuess >= maxGuesses) {
      finishGame(false);
    }
  }

  function finishGame(correct) {
    localStorage.setItem(todayKey, "done");
    el.correctReveal.textContent = `🎯 The correct answer was: ${today.title}`;
    el.correctReveal.classList.remove("hidden");
    el.resultAnswer.textContent = el.correctReveal.textContent;
    el.resultModal.classList.remove("hidden");
    disableAll();

    let gp = parseInt(localStorage.getItem("gamesPlayed") || "0", 10) + 1;
    let cs = parseInt(localStorage.getItem("currentStreak") || "0", 10);
    let bs = parseInt(localStorage.getItem("bestStreak") || "0", 10);
    if (correct) {
      cs++;
      if (cs > bs) bs = cs;
    } else {
      cs = 0;
    }
    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();
  }

  function disableAll() {
    el.play.disabled = el.skip.disabled = el.submit.disabled = el.guessInput.disabled = true;
    el.skip.classList.add("bg-orange-500", "hover:bg-orange-600");
  }

  function shareResults() {
    const msg = `🎵 Cartoondle—Streak: ${el.currentStreak.textContent} | Best: ${el.bestStreak.textContent}`;
    navigator.share?.({ title: "Cartoondle", text: msg, url: location.href }) || alert(msg);
  }

  function autoComplete() {
    const val = el.guessInput.value.toLowerCase();
    el.autocomplete.innerHTML = "";
    if (!val) return el.autocomplete.classList.add("hidden");
    playlist
      .filter((t) => t.title.toLowerCase().includes(val))
      .forEach((t) => {
        const div = document.createElement("div");
        div.textContent = t.title;
        div.className = "cursor-pointer px-3 py-1 hover:bg-gray-200";
        div.onclick = () => {
          el.guessInput.value = t.title;
          el.autocomplete.classList.add("hidden");
        };
        el.autocomplete.appendChild(div);
      });
    el.autocomplete.classList.remove("hidden");
  }
});
