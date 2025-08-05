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
  const start = new Date("2024-01-01T00:00:00-06:00");
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return diff % playlist.length;
}
function formatCountdown() {
  const now = new Date();
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  const diff = nextMidnight - now;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}
function getState(key) {
  return JSON.parse(localStorage.getItem(key) || '{"guesses":[],"count":0,"finished":false,"correct":false}');
}
function saveState(key, state) {
  localStorage.setItem(key, JSON.stringify(state));
}
function disableGame(el) {
  el.playBtn.disabled = el.skipBtn.disabled = el.submitBtn.disabled = true;
}

document.addEventListener("DOMContentLoaded", () => {
  const stateKey = `songless-state-${getTodayIndex()}`;
  const doneKey = `songless-done-${getTodayIndex()}`;
  const answer = playlist[getTodayIndex()].title.toLowerCase();
  let state = getState(stateKey);

  const el = {
    progressSegments: document.getElementById('progressSegments'),
    playBtn: document.getElementById('playBtn'),
    guessGrid: document.getElementById('guessGrid'),
    guessInput: document.getElementById('guessInput'),
    autocompleteList: document.getElementById('autocompleteList'),
    submitBtn: document.getElementById('submitBtn'),
    skipBtn: document.getElementById('skipBtn'),
    correctAnswer: document.getElementById('correctAnswer'),
    resultModal: document.getElementById('resultModal'),
    resultAnswer: document.getElementById('resultAnswer'),
    resultCloseBtn: document.getElementById('resultCloseBtn'),
    alreadyPlayedModal: document.getElementById('alreadyPlayedModal'),
    alreadyDesc: document.getElementById('alreadyDesc'),
    alreadyOk: document.getElementById('alreadyOk'),
    countdown: document.getElementById('countdown'),
    gamesPlayed: document.getElementById('gamesPlayed'),
    currentStreak: document.getElementById('currentStreak'),
    bestStreak: document.getElementById('bestStreak'),
    audio: document.getElementById('audioPlayer')
  };

  el.audio.src = playlist[getTodayIndex()].url;

  function renderSegments() {
    el.progressSegments.innerHTML = '';
    const total = durations[durations.length - 1];
    durations.forEach((sec, idx) => {
      const div = document.createElement('div');
      div.style.flex = sec / total;
      div.style.height = '100%';
      div.style.backgroundColor = idx < state.count ? '#34D399' : '#374151';
      div.style.position = 'relative';
      el.progressSegments.appendChild(div);
    });
  }

  function playStage() {
    if (state.finished) return;
    const stage = state.count < durations.length ? state.count : durations.length - 1;
    const sec = durations[stage];
    el.audio.currentTime = 0;
    el.audio.play();

    renderSegments();
    const start = performance.now();
    const total = durations[durations.length - 1];
    const segEls = el.progressSegments.children;

    const timer = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const pct = Math.min(elapsed / sec, 1);
      for (let i = 0; i < stage; i++) {
        segEls[i].style.backgroundColor = '#34D399';
        segEls[i].innerHTML = '';
      }
      const cur = segEls[stage];
      cur.style.backgroundColor = '#374151';
      cur.innerHTML = `<div style="width:${pct * 100}%;height:100%;background:#34D399;"></div>`;
      if (pct >= 1) {
        clearInterval(timer);
        el.audio.pause();
        cur.innerHTML = '';
        cur.style.backgroundColor = '#34D399';
      }
    }, 40);
  }

  function handleGuess(guess) {
    const box = el.guessGrid.children[state.count];
    box.textContent = guess;
    if (guess.toLowerCase() === answer) {
      box.style.backgroundColor = '#34D399';
      state.finished = true;
      state.correct = true;
      finishGame(true);
    } else {
      box.style.backgroundColor = '#EF4444';
      state.count++;
      if (state.count >= maxGuesses) {
        state.finished = true;
        finishGame(false);
      }
    }
    state.guesses.push(guess);
    saveState(stateKey, state);
    renderSegments();
    el.guessInput.value = '';
  }

  function finishGame(won) {
    disableGame(el);
    const correct = playlist[getTodayIndex()].title;
    el.correctAnswer.textContent = correct;
    if (!state.finished || !state.correct) {
      el.resultModal.classList.remove('hidden');
      el.resultAnswer.textContent = correct;
    }
    updateStats(won);
  }

  function updateStats(won) {
    const totalGames = JSON.parse(localStorage.getItem('games') || '0') + 1;
    localStorage.setItem('games', totalGames);
    el.gamesPlayed.textContent = totalGames;
    let streak = parseInt(localStorage.getItem('streak') || '0');
    if (won) {
      streak += 1;
      localStorage.setItem('streak', streak);
      const best = parseInt(localStorage.getItem('best') || '0');
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
    const q = el.guessInput.value.toLowerCase();
    if (!q) return;
    playlist.forEach(song => {
      if (song.title.toLowerCase().includes(q)) {
        const div = document.createElement('div');
        div.textContent = song.title;
        div.className = 'px-2 py-1 hover:bg-gray-700 cursor-pointer';
        div.onclick = () => {
          el.guessInput.value = song.title;
          el.autocompleteList.innerHTML = '';
        };
        el.autocompleteList.appendChild(div);
      }
    });
  }

  renderSegments();
  for (let i = 0; i < maxGuesses; i++) {
    const div = document.createElement('div');
    div.className = 'w-full max-w-full text-center rounded-md py-3 text-white bg-gray-700 mb-2';
    div.textContent = state.guesses[i] || '';
    el.guessGrid.appendChild(div);
  }

  if (state.finished) {
    disableGame(el);
    el.correctAnswer.textContent = playlist[getTodayIndex()].title;
  }

  el.playBtn.addEventListener('click', playStage);
  el.guessInput.addEventListener('input', showAutocomplete);
  el.submitBtn.addEventListener('click', () => {
    if (el.guessInput.value.trim()) handleGuess(el.guessInput.value.trim());
  });
  el.skipBtn.addEventListener('click', () => {
    if (!state.finished) {
      state.guesses.push('Skipped');
      state.count++;
      if (state.count >= maxGuesses) {
        state.finished = true;
        finishGame(false);
      }
      saveState(stateKey, state);
      renderSegments();
    }
  });
  el.resultCloseBtn.addEventListener('click', () => {
    el.resultModal.classList.add('hidden');
  });

  setInterval(() => {
    el.countdown.textContent = formatCountdown();
  }, 1000);
});
