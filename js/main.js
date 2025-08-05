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
  const base = new Date("2024-01-01T00:00:00-06:00");
  const days = Math.floor((Date.now() - base) / (1000 * 60 * 60 * 24));
  return days % playlist.length;
}
function formatCountdown() {
  const now = new Date(), next = new Date();
  next.setHours(24, 0, 0, 0);
  const diff = next - now;
  const h = Math.floor(diff / 3600000),
        m = Math.floor((diff % 3600000) / 60000),
        s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}
function getState(key) {
  return JSON.parse(localStorage.getItem(key) || '{"guesses":[],"count":0,"finished":false}');
}
function saveState(key, st) {
  localStorage.setItem(key, JSON.stringify(st));
}
function disableGame(el) {
  el.playBtn.disabled = el.skipBtn.disabled = el.submitBtn.disabled = true;
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex();
  const stateKey = `songless-state-${idx}`;
  let state = getState(stateKey);

  const el = {
    audio: document.getElementById('audioPlayer'),
    playBtn: document.getElementById('playBtn'),
    progressSegments: document.getElementById('progressSegments'),
    guessGrid: document.getElementById('guessGrid'),
    guessInput: document.getElementById('guessInput'),
    autocompleteList: document.getElementById('autocompleteList'),
    submitBtn: document.getElementById('submitBtn'),
    skipBtn: document.getElementById('skipBtn'),
    correctAnswer: document.getElementById('correctAnswer'),
    resultModal: document.getElementById('resultModal'),
    resultAnswer: document.getElementById('resultAnswer'),
    resultCloseBtn: document.getElementById('resultCloseBtn'),
    countdown: document.getElementById('countdown'),
    gamesPlayed: document.getElementById('gamesPlayed'),
    currentStreak: document.getElementById('currentStreak'),
    bestStreak: document.getElementById('bestStreak')
  };

  el.audio.src = playlist[idx].url;

  function renderSegments() {
    el.progressSegments.innerHTML = '';
    const total = durations[durations.length - 1];
    durations.forEach((sec, i) => {
      const div = document.createElement('div');
      div.style.flex = sec / total;
      div.style.height = '100%';
      div.style.backgroundColor = i < state.count ? '#34D399' : '#374151';
      div.style.position = 'relative';
      el.progressSegments.appendChild(div);
    });
  }

  function playStage() {
    if (state.finished) return;
    const stage = Math.min(state.count, durations.length - 1);
    const sec = durations[stage];
    const total = durations[durations.length - 1];

    el.audio.currentTime = 0;
    el.audio.play();
    renderSegments();

    const playDiv = document.createElement('div');
    playDiv.style.position = 'absolute';
    playDiv.style.height = '100%';
    playDiv.style.left = '0';
    playDiv.style.top = '0';
    playDiv.style.backgroundColor = '#34D399';
    playDiv.style.width = '0%';
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

  function handleGuess(txt) {
    const box = el.guessGrid.children[state.count];
    box.textContent = txt;
    box.classList.remove('bg-gray-800');
    box.classList.add(txt.toLowerCase() === playlist[idx].title.toLowerCase() ? 'bg-green-600' : 'bg-red-600');
    if (txt.toLowerCase() === playlist[idx].title.toLowerCase()) {
      state.finished = true;
      finishGame(true);
    } else {
      state.count++;
      if (state.count >= maxGuesses) finishGame(false);
    }
    state.guesses.push(txt);
    saveState(stateKey, state);
    renderSegments();
    el.guessInput.value = '';
  }

  function finishGame(won) {
    disableGame(el);
    el.correctAnswer.textContent = playlist[idx].title;
    el.correctAnswer.classList.remove('hidden');
    if (!won) {
      el.resultAnswer.textContent = playlist[idx].title;
      el.resultModal.classList.remove('hidden');
    }
    updateStats(won);
  }

  function updateStats(won) {
    const total = (Number(localStorage.getItem('games')) || 0) + 1;
    localStorage.setItem('games', total);
    el.gamesPlayed.textContent = total;
    let streak = Number(localStorage.getItem('streak') || 0);
    if (won) {
      streak++;
      localStorage.setItem('streak', streak);
      const best = Number(localStorage.getItem('best') || 0);
      if (streak > best) localStorage.setItem('best', streak);
    } else {
      streak = 0;
      localStorage.setItem('streak', 0);
    }
    el.currentStreak.textContent = streak;
    el.bestStreak.textContent = localStorage.getItem('best') || '0';
  }

  function showAutocomplete() {
    el.autocompleteList.innerHTML = '';
    const q = el.guessInput.value.trim().toLowerCase();
    if (!q) return;
    playlist.forEach(item => {
      if (item.title.toLowerCase().includes(q)) {
        const d = document.createElement('div');
        d.textContent = item.title;
        d.className = 'px-2 py-1 hover:bg-gray-700 cursor-pointer';
        d.onclick = () => {
          el.guessInput.value = item.title;
          el.autocompleteList.innerHTML = '';
        };
        el.autocompleteList.appendChild(d);
      }
    });
  }

  const width = el.guessInput.offsetWidth + 'px';
  for (let i = 0; i < maxGuesses; i++) {
    const d = document.createElement('div');
    d.className = 'h-12 bg-gray-800 rounded flex items-center justify-center text-sm text-white';
    d.style.width = width;
    el.guessGrid.appendChild(d);
  }

  if (state.guesses) {
    state.guesses.forEach((g, i) => {
      if (i < maxGuesses && el.guessGrid.children[i]) {
        const b = el.guessGrid.children[i];
        b.textContent = g;
        if (g.toLowerCase() === playlist[idx].title.toLowerCase()) {
          b.classList.replace('bg-gray-800','bg-green-600');
        } else {
          b.classList.replace('bg-gray-800','bg-red-600');
        }
      }
    });
  }

  if (state.finished) {
    disableGame(el);
    el.correctAnswer.textContent = playlist[idx].title;
    el.correctAnswer.classList.remove('hidden');
  }

  el.playBtn.addEventListener('click', playStage);
  el.guessInput.addEventListener('input', showAutocomplete);
  el.submitBtn.addEventListener('click', () => {
    if (el.guessInput.value.trim()) handleGuess(el.guessInput.value.trim());
  });
  el.skipBtn.addEventListener('click', () => {
    if (!state.finished) handleGuess('Skipped');
  });
  el.resultCloseBtn.addEventListener('click', () =>
    el.resultModal.classList.add('hidden')
  );

  setInterval(() => {
    el.countdown.textContent = formatCountdown();
  }, 1000);

  renderSegments();
  updateStats(state.guesses[state.count - 1] === playlist[idx].title.toLowerCase());
});
