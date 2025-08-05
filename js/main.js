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

function getTodayIndex() {
  const key = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return key.split("/").reduce((a,b)=>a+parseInt(b),0) % playlist.length;
}

window.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex();
  const today = playlist[idx];
  const todayKey = `played-${idx}`;

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
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultClose: document.getElementById("resultCloseBtn"),
    share: document.getElementById("shareBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak"),
    countdown: document.getElementById("countdownBottom"),
    alreadyModal: document.getElementById("alreadyPlayedModal"),
    alreadyOk: document.getElementById("alreadyPlayedOkBtn"),
    volume: document.getElementById("volumeSlider"),
    progressBar: document.getElementById("progressBar")
  };

  el.audio.src = today.url;
  el.audio.volume = el.volume.value;

  el.volume.addEventListener("input", () => {
    el.audio.volume = parseFloat(el.volume.value);
  });

  let guessCount = 0;
  const max = 6;
  const guessed = new Set();

  function updateStats() {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    const s = parseInt(localStorage.getItem("currentStreak") || "0", 10);
    el.currentStreak.textContent = s + (s >= 5 ? " 🔥" : "");
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function updateCountdown() {
    const now = new Date(), m = new Date(now);
    m.setHours(24,0,0,0);
    const diff = m - now;
    const h = Math.floor(diff/3600000), mm = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
    const msg = `⏳ New theme song in ${h}h ${mm}m ${s}s`;
    el.countdown.textContent = msg;
    document.getElementById("countdownModal").textContent = msg;
  }

  function disableAll() {
    el.play.disabled = el.skip.disabled = el.submit.disabled = el.guessInput.disabled = true;
    el.skip.classList.add("bg-orange-500", "hover:bg-orange-600");
  }

  function finishGame(correct) {
    localStorage.setItem(todayKey, "done");
    if (correct) {
      el.resultTitle.textContent = "🎉 You got it!";
      el.correctReveal.textContent = "🎉 You got it!";
    } else {
      el.resultTitle.textContent = "Game Over";
      el.correctReveal.textContent = `🎯 The correct answer was: ${today.title}`;
    }
    el.correctReveal.classList.remove("hidden");
    el.resultAnswer.textContent = el.correctReveal.textContent;
    el.resultModal.classList.remove("hidden");
    disableAll();

    let gp = parseInt(localStorage.getItem("gamesPlayed") || "0", 10) + 1;
    let cs = parseInt(localStorage.getItem("currentStreak") || "0", 10);
    let bs = parseInt(localStorage.getItem("bestStreak") || "0", 10);
    if (correct) { cs++; if (cs > bs) bs = cs; } else { cs = 0; }

    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();
  }

  function handleGuess() {
    const g = el.guessInput.value.trim();
    if (!g || guessed.has(g.toLowerCase()) || guessCount >= max) return;
    guessed.add(g.toLowerCase());
    const t = [1,2,3,5,10,15][Math.min(guessCount,5)];
    const correct = g.toLowerCase() === today.title.toLowerCase();
    const d = document.createElement("div");
    d.textContent = `${correct ? "✅" : "❌"} ${g} @ ${t}s`;
    d.className = correct ? "text-green-300 font-bold" : "text-red-300";
    el.history.appendChild(d);

    el.guessInput.value = "";
    guessCount++;
    el.currentGuess.textContent = Math.min(guessCount+1, max);
    el.listenTime.textContent = `${t} second`;

    if (correct) {
      confetti({ particleCount:150, spread:70, origin:{y:0.6}});
      finishGame(true);
    } else if (guessCount >= max) {
      finishGame(false);
    }
  }

  function handleSkip() {
    if (guessCount >= max) return;
    const t = [1,2,3,5,10,15][Math.min(guessCount,5)];
    const d = document.createElement("div");
    d.textContent = `⏭️ Skipped @ ${t}s`;
    d.className = "text-yellow-200";
    el.history.appendChild(d);

    guessCount++;
    el.currentGuess.textContent = Math.min(guessCount+1, max);
    el.listenTime.textContent = `${t} second`;

    if (guessCount >= max) finishGame(false);
  }

  function playSnippetWithProgress() {
    if (guessCount >= max) return;
    el.audio.currentTime = 0;
    el.audio.play();
    const duration = [1,2,3,5,10,15][Math.min(guessCount,5)];
    el.progressBar.style.width = "0%";
    const interval = setInterval(() => {
      const pct = Math.min((el.audio.currentTime/duration)*100, 100);
      el.progressBar.style.width = `${pct}%`;
      if (el.audio.currentTime >= duration) {
        clearInterval(interval);
        el.audio.pause();
        el.progressBar.style.width = "0%";
      }
    }, 100);
  }

  el.play.onclick = playSnippetWithProgress;
  el.skip.onclick = handleSkip;
  el.submit.onclick = handleGuess;
  el.resultClose.onclick = () => el.resultModal.classList.add("hidden");
  el.share.onclick = () => {
    const msg = `🎵 Cartoondle—Streak: ${el.currentStreak.textContent} | Best: ${el.bestStreak.textContent}`;
    navigator.share?.({ title: "Cartoondle", text: msg, url: location.href }) || alert(msg);
  };

  el.guessInput.addEventListener("input", autoComplete);
  el.guessInput.addEventListener("keyup", (e) => { if (e.key === "Enter") handleGuess(); });

  function autoComplete() {
    const v = el.guessInput.value.toLowerCase();
    el.autocomplete.innerHTML = "";
    if (!v) return el.autocomplete.classList.add("hidden");
    playlist.filter(t => t.title.toLowerCase().includes(v)).forEach(t => {
      const div = document.createElement("div");
      div.textContent = t.title;
      div.className = "cursor-pointer px-3 py-1 hover:bg-gray-200";
      div.onclick = () => { el.guessInput.value = t.title; el.autocomplete.classList.add("hidden"); };
      el.autocomplete.appendChild(div);
    });
    el.autocomplete.classList.remove("hidden");
  }

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
});
