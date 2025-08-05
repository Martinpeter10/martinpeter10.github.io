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
const maxGuesses = 6;

function getTodayIndex() {
  const base = new Date('2024-01-01T00:00:00-06:00');
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return Math.floor((now - base) / (1000 * 60 * 60 * 24)) % playlist.length;
}

function formatCountdown() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function disableGameActions(el) {
  el.playBtn.disabled = true;
  el.skipBtn.disabled = true;
  el.submitBtn.disabled = true;
}

function renderProgressBar(el, guessCount) {
  el.progressSegments.innerHTML = '';
  durations.forEach((sec, idx) => {
    const div = document.createElement('div');
    div.className = `flex-1 h-2 ${idx <= guessCount ? 'bg-green-400' : 'bg-gray-700'}`;
    el.progressSegments.appendChild(div);
  });
}

function restoreState(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : { count: 0, guessed: [], finished: false };
}

function saveState(key, state) {
  localStorage.setItem(key, JSON.stringify(state));
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex();
  const today = playlist[idx];
  const stateKey = `songless-state-${idx}`;
  const doneKey = `songless-done-${idx}`;
  const audio = document.getElementById('audioPlayer');

  const el = {
    countdown: document.getElementById('countdown'),
    gamesPlayed: document.getElementById('gamesPlayed'),
    currentStreak: document.getElementById('currentStreak'),
    bestStreak: document.getElementById('bestStreak'),
    guessGrid: document.getElementById('guessGrid'),
    playBtn: document.getElementById('playBtn'),
    progressSegments: document.getElementById('progressSegments'),
    guessInput: document.getElementById('guessInput'),
    autocompleteList: document.getElementById('autocompleteList'),
    submitBtn: document.getElementById('submitBtn'),
    skipBtn: document.getElementById('skipBtn'),
    resultModal: document.getElementById('resultModal'),
    resultTitle: document.getElementById('resultTitle'),
    resultAnswer: document.getElementById('resultAnswer'),
    resultCloseBtn: document.getElementById('resultCloseBtn'),
    alreadyPlayedModal: document.getElementById('alreadyPlayedModal'),
    alreadyDesc: document.getElementById('alreadyDesc'),
    alreadyOk: document.getElementById('alreadyOk'),
  };

  let state = restoreState(stateKey);
  audio.src = today.url;
  audio.volume = parseFloat(document.getElementById('volumeSlider').value);

  document.getElementById('volumeSlider').addEventListener('input', (e) => {
    audio.volume = parseFloat(e.target.value);
  });

  // Build guess boxes:
  for (let i = 0; i < maxGuesses; i++) {
    const box = document.createElement('div');
    box.className = 'h-12 bg-gray-800 rounded flex items-center justify-center text-sm';
    el.guessGrid.appendChild(box);
  }

  function updateStats() {
    if (!localStorage.getItem('gamesPlayed')) localStorage.setItem('gamesPlayed', 0);
    if (!localStorage.getItem('currentStreak')) localStorage.setItem('currentStreak', 0);
    if (!localStorage.getItem('bestStreak')) localStorage.setItem('bestStreak', 0);
    el.gamesPlayed.textContent = localStorage.getItem('gamesPlayed');
    el.currentStreak.textContent = localStorage.getItem('currentStreak');
    el.bestStreak.textContent = localStorage.getItem('bestStreak');
  }

  function reveal(guess, correct, skipped=false) {
    const box = el.guessGrid.children[state.count];
    box.textContent = skipped ? 'Skipped' : guess;
    box.classList.add(skipped ? 'text-gray-400' : correct ? 'bg-green-600' : 'bg-red-600');
    state.count++;
    saveState(stateKey, state);
    renderProgressBar(el, state.count);
  }

  function finish(correct) {
    state.finished = true;
    saveState(stateKey, state);
    localStorage.setItem(doneKey, 'yes');

    let games = parseInt(localStorage.getItem('gamesPlayed')) + 1;
    let streak = parseInt(localStorage.getItem('currentStreak'));
    let best = parseInt(localStorage.getItem('bestStreak'));
    if (correct) {
      streak += 1;
      if (streak > best) best = streak;
      confetti({ particleCount: 100, spread: 50 });
      el.resultTitle.textContent = '';
      audio.currentTime = 0;
      audio.play();
    } else {
      streak = 0;
      el.resultTitle.textContent = 'Game Over';
    }

    el.resultAnswer.textContent = today.title;
    el.alreadyDesc.textContent = `Correct: ${today.title}`;
    localStorage.setItem('gamesPlayed', games);
    localStorage.setItem('currentStreak', streak);
    localStorage.setItem('bestStreak', best);
    updateStats();

    el.resultModal.classList.remove('hidden');
    disableGameActions(el);
  }

  // Restore previous guesses if any:
  state.guessed.forEach((g, idx) => {
    const correct = g.toLowerCase() === today.title.toLowerCase();
    const box = el.guessGrid.children[idx];
    box.textContent = g;
    box.classList.add(correct ? 'bg-green-600' : 'bg-red-600');
  });
  renderProgressBar(el, state.count);
  updateStats();

  if (state.finished || localStorage.getItem(doneKey)) {
    el.alreadyPlayedModal.classList.remove('hidden');
    disableGameActions(el);
  }

  // Typeahead search:
  el.guessInput.addEventListener('input', () => {
    const val = el.guessInput.value.toLowerCase();
    el.autocompleteList.innerHTML = '';
    if (val.length === 0) {
      el.autocompleteList.classList.add('hidden');
      return;
    }
    const matches = playlist.filter(p => p.title.toLowerCase().includes(val));
    matches.forEach(p => {
      const div = document.createElement('div');
      div.textContent = p.title;
      div.className = 'px-3 py-1 hover:bg-gray-200 cursor-pointer';
      div.addEventListener('click', () => {
        el.guessInput.value = p.title;
        el.autocompleteList.classList.add('hidden');
      });
      el.autocompleteList.appendChild(div);
    });
    if (matches.length > 0) {
      el.autocompleteList.classList.remove('hidden');
    } else {
      el.autocompleteList.classList.add('hidden');
    }
  });

  el.skipBtn.addEventListener('click', () => {
    if (!state.finished && state.count < maxGuesses) {
      reveal('', false, true);
      if (state.count >= maxGuesses) finish(false);
    }
  });

  el.submitBtn.addEventListener('click', () => {
    if (state.finished || state.count >= maxGuesses) return;
    const val = el.guessInput.value.trim();
    if (!val || state.guessed.includes(val.toLowerCase())) return;
    state.guessed.push(val.toLowerCase());
    const correct = val.toLowerCase() === today.title.toLowerCase();
    reveal(val, correct);
    if (correct) finish(true);
    else if (state.count >= maxGuesses) finish(false);
    el.guessInput.value = '';
    el.autocompleteList.classList.add('hidden');
  });

  el.playBtn.addEventListener('click', () => {
    if (state.finished) return;
    const t = durations[Math.min(state.count, durations.length - 1)];
    audio.currentTime = 0;
    audio.play();
    setTimeout(() => audio.pause(), t * 1000);
  });

  el.guessInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      el.submitBtn.click();
      e.preventDefault();
    }
  });

  el.resultCloseBtn.addEventListener('click', () => {
    el.resultModal.classList.add('hidden');
  });

  el.alreadyOk.addEventListener('click', () => {
    el.alreadyPlayedModal.classList.add('hidden');
  });

  // Countdown timer
  setInterval(() => {
    el.countdown.textContent = `Next theme song in: ${formatCountdown()}`;
  }, 1000);
});
