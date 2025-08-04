// === Config ===
const CLIENT_ID = 'SSz86sqjFz89WiIDMTCnBLjsrqIgDkS9';  // Replace with your real SoundCloud Client ID
const PLAYLIST_URL = 'https://soundcloud.com/peter-martin-657527787/sets/playlist';
const titles = [
  "Chowder",
  "All Grown Up",
  "Ben 10",
  "Teenage Mutant Ninja Turtles",
  "Adventure Time",
  "The Grim Adventures of Billy and Mandy",
  "Code Name Kids Next Door",
  "Regular Show",
  "The Amazing Adventures of Gumball"
];

// === Utility to fetch playlist data ===
async function fetchPlaylistTracks() {
  try {
    const res = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(PLAYLIST_URL)}&client_id=${CLIENT_ID}`);
    if (!res.ok) throw new Error('Failed to resolve playlist');
    const data = await res.json();
    if (!data.tracks || data.tracks.length < titles.length) throw new Error('Playlist has fewer tracks than titles');
    return data.tracks.map((track, idx) => ({
      id: track.id,
      title: titles[idx] || track.title
    }));
  } catch (err) {
    console.error(err);
    return [];
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Fetch your playlist and set up
  const playlist = await fetchPlaylistTracks();
  if (!playlist.length) {
    alert('Error loading playlist. Check CLIENT_ID and playlist visibility.');
    return;
  }

  const todayIndex = (() => {
    const dateKey = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    return dateKey.split('/').reduce((a, b) => a + parseInt(b), 0) % playlist.length;
  })();
  const todayTrack = playlist[todayIndex];
  const todayKey = `played-${todayIndex}`;

  // DOM Elements
  const el = {
    guessInput: document.getElementById("guessInput"),
    autocompleteList: document.getElementById("autocomplete-list"),
    submitBtn: document.getElementById("submitBtn"),
    playBtn: document.getElementById("playSnippet"),
    skipBtn: document.getElementById("skipBtn"),
    guessHistory: document.getElementById("guessHistory"),
    correctAnswerReveal: document.getElementById("correctAnswerReveal"),
    currentGuessSpan: document.getElementById("currentGuess"),
    listenTimeSpan: document.getElementById("listenTime"),
    resultModal: document.getElementById("resultModal"),
    resultAnswer: document.getElementById("resultAnswer"),
    resultCloseBtn: document.getElementById("resultCloseBtn"),
    shareBtn: document.getElementById("shareBtn"),
    gamesPlayed: document.getElementById("gamesPlayed"),
    currentStreak: document.getElementById("currentStreak"),
    bestStreak: document.getElementById("bestStreak"),
    countdownBottom: document.getElementById("countdownBottom"),
    alreadyPlayedModal: document.getElementById("alreadyPlayedModal"),
    alreadyPlayedOkBtn: document.getElementById("alreadyPlayedOkBtn"),
    iframe: document.getElementById("sc-player")
  };

  let widget, currentGuessCount = 0;
  const maxGuesses = 6;
  const guessedSet = new Set();

  // Initialize SoundCloud player iframe
  el.iframe.src = `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${todayTrack.id}&client_id=${CLIENT_ID}&auto_play=false&hide_related=true`;
  widget = SC.Widget(el.iframe);

  // Stats and countdown
  function updateStatsDisplay() {
    el.gamesPlayed.textContent = localStorage.getItem("gamesPlayed") || 0;
    const streak = parseInt(localStorage.getItem("currentStreak") || "0");
    el.currentStreak.textContent = streak + (streak >= 5 ? " 🔥" : "");
    el.bestStreak.textContent = localStorage.getItem("bestStreak") || 0;
  }

  function updateCountdown() {
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24,0,0,0);
    const diff = midnight - now;
    const hrs = Math.floor(diff / 3600000),
          mins = Math.floor((diff % 3600000) / 60000),
          secs = Math.floor((diff % 60000)/1000);
    const msg = `⏳ New theme song in ${hrs}h ${mins}m ${secs}s`;
    el.countdownBottom.textContent = msg;
    document.getElementById("countdownModal").textContent = msg;
  }

  function disableInputs() {
    el.playBtn.disabled = true;
    el.skipBtn.disabled = true;
    el.submitBtn.disabled = true;
    el.guessInput.disabled = true;
    el.skipBtn.classList.add("bg-orange-500", "hover:bg-orange-600");
  }

  function endGame(correct) {
    localStorage.setItem(todayKey, 'done');
    el.correctAnswerReveal.textContent = `🎯 The correct answer was: ${todayTrack.title}`;
    el.correctAnswerReveal.classList.remove("hidden");
    el.resultAnswer.textContent = el.correctAnswerReveal.textContent;
    el.resultModal.classList.remove("hidden");
    disableInputs();

    let played = parseInt(localStorage.getItem("gamesPlayed")||"0")+1;
    let streak = parseInt(localStorage.getItem("currentStreak")||"0");
    let best = parseInt(localStorage.getItem("bestStreak")||"0");
    if (correct) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
    localStorage.setItem("gamesPlayed", played);
    localStorage.setItem("currentStreak", streak);
    localStorage.setItem("bestStreak", best);
    updateStatsDisplay();
  }

  function shareResults() {
    const msg = `🎵 Cartoondle Streak: ${el.currentStreak.textContent} | Best: ${el.bestStreak.textContent}`;
    navigator.share?.({ title: 'Cartoondle', text: msg, url: location.href }) || alert(msg);
  }

  function handleGuess() {
    const guess = el.guessInput.value.trim();
    if (!guess || guessedSet.has(guess.toLowerCase()) || currentGuessCount >= maxGuesses) return;
    guessedSet.add(guess.toLowerCase());
    const time = [1,2,3,5,10,15][Math.min(currentGuessCount,5)];
    const isCorrect = guess.toLowerCase() === todayTrack.title.toLowerCase();
    const div = document.createElement('div');
    div.textContent = `${isCorrect ? '✅' : '❌'} ${guess} @ ${time}s`;
    div.className = isCorrect ? 'text-green-300 font-bold' : 'text-red-300';
    el.guessHistory.appendChild(div);

    el.guessInput.value = '';
    currentGuessCount++;
    el.currentGuessSpan.textContent = Math.min(currentGuessCount+1, maxGuesses);
    el.listenTimeSpan.textContent = `${time} second`;

    if (isCorrect) {
      confetti({ particleCount:150, spread:70, origin:{ y:0.6 } });
      endGame(true);
    } else if (currentGuessCount >= maxGuesses) {
      endGame(false);
    }
  }

  function handleSkip() {
    if (currentGuessCount >= maxGuesses) return;
    const time = [1,2,3,5,10,15][Math.min(currentGuessCount,5)];
    const div = document.createElement('div');
    div.textContent = `⏭️ Skipped @ ${time}s`;
    div.className = 'text-yellow-200';
    el.guessHistory.appendChild(div);

    currentGuessCount++;
    el.currentGuessSpan.textContent = Math.min(currentGuessCount+1, maxGuesses);
    el.listenTimeSpan.textContent = `${time} second`;
    if (currentGuessCount >= maxGuesses) endGame(false);
  }

  function handleAutocomplete() {
    const val = el.guessInput.value.toLowerCase();
    el.autocompleteList.innerHTML = '';
    if (!val) return el.autocompleteList.classList.add("hidden");
    playlist.filter(t => t.title.toLowerCase().includes(val)).forEach(t => {
      const div = document.createElement('div');
      div.textContent = t.title;
      div.className = 'cursor-pointer px-3 py-1 hover:bg-gray-200';
      div.onclick = () => { el.guessInput.value = t.title; el.autocompleteList.classList.add("hidden"); };
      el.autocompleteList.appendChild(div);
    });
    el.autocompleteList.classList.remove("hidden");
  }

  // Init UI hooks
  updateStatsDisplay();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (localStorage.getItem(todayKey) === 'done') {
    el.correctAnswerReveal.textContent = `🎯 The correct answer was: ${todayTrack.title}`;
    el.correctAnswerReveal.classList.remove("hidden");
    el.alreadyPlayedModal.classList.remove("hidden");
    el.alreadyPlayedOkBtn.onclick = () => el.alreadyPlayedModal.classList.add("hidden");
    disableInputs();
  }

  el.submitBtn.onclick = handleGuess;
  el.playBtn.onclick = () => widget.seekTo(0) * widget.play() && setTimeout(() => widget.pause(), 1000);
  el.skipBtn.onclick = handleSkip;
  el.shareBtn.onclick = shareResults;
  el.resultCloseBtn.onclick = () => el.resultModal.classList.add("hidden");
  el.guessInput.addEventListener('input', handleAutocomplete);
  el.guessInput.addEventListener('keyup', e => { if (e.key === 'Enter') handleGuess(); });
});
