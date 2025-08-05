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
  const key = new Date().toLocaleDateString("en-US",{ timeZone:"America/Chicago" });
  return key.split("/").reduce((a,b) => a + parseInt(b), 0) % playlist.length;
}

window.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex();
  const today = playlist[idx];
  const todayKey = `played-${idx}`;

  const el = {
    audio: document.getElementById("audioPlayer"),
    skip: document.getElementById("skipBtn"),
    submit: document.getElementById("submitBtn"),
    guessInput: document.getElementById("guessInput"),
    volume: document.getElementById("volumeSlider"),
    progressBar: document.getElementById("progressBar"),
    resultModal: document.getElementById("resultModal"),
    resultTitle: document.getElementById("resultTitle"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultClose: document.getElementById("resultCloseBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak"),
    guessGrid: document.getElementById("guessGrid")
  };

  el.audio.src = today.url;
  el.audio.volume = parseFloat(el.volume.value);

  el.volume.addEventListener("input", () => {
    el.audio.volume = parseFloat(el.volume.value);
  });

  let guessCount = 0;
  const max = 6;
  const guessed = new Set();

  function updateStats() {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    const s = parseInt(localStorage.getItem("currentStreak") || "0", 10);
    el.currentStreak.textContent = s;
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function disableAll() {
    el.skip.disabled = el.submit.disabled = el.guessInput.disabled = true;
  }

  function finishGame(correct) {
    localStorage.setItem(todayKey, "done");
    if (correct) {
      el.resultTitle.textContent = "";
      el.resultAnswer.textContent = today.title;
      el.audio.play();
    } else {
      el.resultTitle.textContent = "Game Over";
      el.resultAnswer.textContent = `The correct answer: ${today.title}`;
    }
    el.resultAnswer.classList.add("text-green-600");
    el.resultModal.classList.remove("hidden");
    disableAll();
    
    let gp = parseInt(localStorage.getItem("gamesPlayed")||"0",10)+1;
    let cs = parseInt(localStorage.getItem("currentStreak")||"0",10);
    let bs = parseInt(localStorage.getItem("bestStreak")||"0",10);
    if (correct) cs++; else cs = 0;
    if (cs > bs) bs = cs;
    localStorage.setItem("gamesPlayed", gp);
    localStorage.setItem("currentStreak", cs);
    localStorage.setItem("bestStreak", bs);
    updateStats();
  }

  function handleGuess() {
    const g = el.guessInput.value.trim();
    if (!g || guessed.has(g.toLowerCase()) || guessCount >= max) return;
    guessed.add(g.toLowerCase());
    let slot = el.guessGrid.children[guessCount];
    slot.textContent = g;
    slot.classList.add("bg-white/80", "text-black", "font-semibold");
    guessCount++;

    if (g.toLowerCase() === today.title.toLowerCase()) {
      confetti({ particleCount:150, spread:70, origin:{y:0.6} });
      finishGame(true);
    } else if (guessCount >= max) {
      finishGame(false);
    }

    el.guessInput.value = "";
  }

  function handleSkip() {
    if (guessCount >= max) return;
    let slot = el.guessGrid.children[guessCount];
    slot.textContent = "Skipped";
    slot.classList.add("bg-white/60", "text-black", "italic");
    guessCount++;
    if (guessCount >= max) finishGame(false);
  }

  function updateProgress(duration) {
    el.progressBar.style.width = `${(el.audio.currentTime / duration) * 100}%`;
  }

  function playSnippet() {
    if (guessCount >= max) return;
    el.audio.currentTime = 0;
    const duration = [1,2,3,5,10,15][Math.min(guessCount,5)];
    el.audio.play();
    el.progressBar.style.width = "0%";
    const step = () => {
      updateProgress(duration);
      if (el.audio.currentTime < duration) requestAnimationFrame(step);
      else { el.audio.pause(); el.progressBar.style.width = "0%"; }
    };
    requestAnimationFrame(step);
  }

  el.skip.onclick = handleSkip;
  el.submit.onclick = handleGuess;
  el.audio.onclick = () => {}; // no play button needed
  el.guessInput.addEventListener("keyup", e => { if (e.key === 'Enter') handleGuess(); });
  el.resultClose.onclick = () => el.resultModal.classList.add("hidden");

  updateStats();
});
