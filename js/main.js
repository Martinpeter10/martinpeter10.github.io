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
  const diff = Math.floor((Date.now() - base) / (1000 * 60 * 60 * 24));
  return diff % playlist.length;
}

function formatCountdown() {
  const now = new Date();
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  const diff = next - now;
  const h = Math.floor(diff / 3600000),
        m = Math.floor((diff % 3600000) / 60000),
        s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function getState(k) {
  return JSON.parse(localStorage.getItem(k) || '{"guesses":[],"count":0,"finished":false,"correct":false}');
}
function saveState(k, st) {
  localStorage.setItem(k, JSON.stringify(st));
}

function disableGame(el) {
  el.playBtn.disabled = true;
  el.skipBtn.disabled = true;
  el.submitBtn.disabled = true;
}

document.addEventListener("DOMContentLoaded", () => {
  const idx = getTodayIndex();
  const answer = playlist[idx].title.toLowerCase();
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
      div.style.overflow = 'hidden';
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

  function handleGuess(text) {
    const box = el.guessGrid.children[state.count];
    box.textContent = text;
    if (text.toLowerCase() === answer) {
      box.style.backgroundColor = '#34D399';
      state.finished = true;
      finishGame(true);
    } else {
      box.style.backgroundColor = '#EF4444';
      state.count++;
      if (state.count >= maxGuesses) finishGame(false);
    }
    state.guesses.push(text);
    saveState(stateKey, state);
    renderSegments();
    el.guessInput.value = '';
  }

  function finishGame(won) {
    disableGame(el);
    const correct = playlist[idx].title;
    el.correctAnswer.textContent = correct;
    if (!state.correct) {
      el.resultAnswer.textContent = correct;
      el.resultModal.classList.remove('hidden');
    }
    updateStats(won);
  }

  function updateStats(won) {
    const g = Number(localStorage.getItem('games') || 0) + 1;
    localStorage.setItem('games', g);
    el.gamesPlayed.textContent = g;

    let streak = Number(localStorage.getItem('streak') || 0);
    if (won) {
      streak++;
      localStorage.setItem('streak', streak);
      const best = Number(localStorage.getItem('best') || 0);
      if (streak > best) localStorage.setItem('best', streak);
    } else {
      streak = 0;
      localStorage.setItem('streak', '0');
    }
    el.currentStreak.textContent = streak;
    el.bestStreak.textContent = localStorage.getItem('best') || '0';
  }

  function showAutocomplete() {
    el.autocompleteList.innerHTML = '';
    const q = el.guessInput.value.trim().toLowerCase();
    if (!q) return;
    playlist.forEach(song => {
      if (song.title.toLowerCase().includes(q)) {
        const d = document.createElement('div');
        d.textContent = song.title;
        d.className = 'px-2 py-1 hover:bg-gray-700 cursor-pointer';
        d.onclick = () => {
          el.guessInput.value = song.title;
          el.autocompleteList.innerHTML = '';
        };
        el.autocompleteList.appendChild(d);
      }
    });
  }

  renderSegments();
  for (let i = 0; i < maxGuesses; i++) {
    const d = document.createElement('div');
    d.className = 'w-full text-center py-3 bg-gray-700 rounded text-white mb-2';
    d.textContent = state.guesses[i] || '';
    el.guessGrid.appendChild(d);
  }

  if (state.finished) {
    disableGame(el);
    el.correctAnswer.textContent = playlist[idx].title;
  }

  el.playBtn.addEventListener('click', playStage);
  el.guessInput.addEventListener('input', showAutocomplete);
  el.submitBtn.addEventListener('click', () => {
    if (el.guessInput.value.trim()) handleGuess(el.guessInput.value.trim());
  });
  el.skipBtn.addEventListener('click', () => {
    if (!state.finished) {
      handleGuess('Skipped');
    }
  });
  el.resultCloseBtn.addEventListener('click', () => el.resultModal.classList.add('hidden'));

  setInterval(() => {
    el.countdown.textContent = formatCountdown();
  }, 1000);
});
