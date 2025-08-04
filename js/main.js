// Config
const CLIENT_ID = 'SSz86sqjFz89WiIDMTCnBLjsrqIgDkS9'; 
const PLAYLIST_URL = 'https://soundcloud.com/peter-martin-657527787/sets/playlist';
const titles = [
  "Chowder","All Grown Up","Ben 10","Teenage Mutant Ninja Turtles",
  "Adventure Time","The Grim Adventures of Billy and Mandy",
  "Code Name Kids Next Door","Regular Show","The Amazing Adventures of Gumball"
];

// Fetch playlist tracks
async function fetchPlaylist() {
  const res = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(PLAYLIST_URL)}&client_id=${CLIENT_ID}`);
  if (!res.ok) throw new Error('Failed to resolve playlist');
  const data = await res.json();
  const tracks = data.tracks || [];
  if (tracks.length < titles.length) throw new Error('Playlist has fewer tracks than expected');
  return tracks.map((t,i) => ({ id: t.id, title: titles[i] || t.title }));
}

window.addEventListener('DOMContentLoaded', async () => {
  let playlist;
  try {
    playlist = await fetchPlaylist();
  } catch (err) {
    console.error(err);
    return alert('Playlist load error. Check CLIENT_ID and playlist visibility');
  }

  const todayIdx = (() => {
    const ds = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    return ds.split('/').reduce((a, b) => a + parseInt(b), 0) % playlist.length;
  })();
  const today = playlist[todayIdx];
  const todayKey = `played-${todayIdx}`;

  const el = {
    audio: document.getElementById('audioPlayer'),
    play: document.getElementById('playSnippet'),
    skip: document.getElementById('skipBtn'),
    guessInput: document.getElementById('guessInput'),
    autocomplete: document.getElementById('autocomplete-list'),
    submit: document.getElementById('submitBtn'),
    history: document.getElementById('guessHistory'),
    correctReveal: document.getElementById('correctAnswerReveal'),
    currentGuess: document.getElementById('currentGuess'),
    listenTime: document.getElementById('listenTime'),
    resultModal: document.getElementById('resultModal'),
    resultAnswer: document.getElementById('resultAnswer'),
    resultClose: document.getElementById('resultCloseBtn'),
    share: document.getElementById('shareBtn'),
    gamesPlayed: document.getElementById('gamesPlayed'),
    currentStreak: document.getElementById('currentStreak'),
    bestStreak: document.getElementById('bestStreak'),
    countdown: document.getElementById('countdownBottom'),
    alreadyModal: document.getElementById('alreadyPlayedModal'),
    alreadyOk: document.getElementById('alreadyPlayedOkBtn')
  };

  // Set audio source for direct playback
  el.audio.src = `https://api.soundcloud.com/tracks/${today.id}/stream?client_id=${CLIENT_ID}`;

  let count = 0, max = 6;
  const guessed = new Set();

  updateStats();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (localStorage.getItem(todayKey) === 'done') {
    el.correctReveal.textContent = `🎯 The correct answer was: ${today.title}`;
    el.correctReveal.classList.remove('hidden');
    el.alreadyModal.classList.remove('hidden');
    el.alreadyOk.onclick = () => el.alreadyModal.classList.add('hidden');
    disableAll();
  }

  el.play.onclick = () => {
    el.audio.currentTime = 0;
    el.audio.play();
    const tSec = [1,2,3,5,10,15][Math.min(count,5)];
    setTimeout(() => el.audio.pause(), tSec * 1000);
  };
  el.skip.onclick = handleSkip;
  el.submit.onclick = handleGuess;
  el.resultClose.onclick = () => el.resultModal.classList.add('hidden');
  el.share.onclick = share;
  el.guessInput.addEventListener('input', autoComp);
  el.guessInput.addEventListener('keyup', e => e.key === 'Enter' && handleGuess());

  function updateStats() {
    el.gamesPlayed.textContent = localStorage.getItem('gamesPlayed') || 0;
    const s = parseInt(localStorage.getItem('currentStreak') || '0');
    el.currentStreak.textContent = s + (s >= 5 ? ' 🔥' : '');
    el.bestStreak.textContent = localStorage.getItem('bestStreak') || 0;
  }

  function updateCountdown() {
    const now = new Date(), m = new Date(now);
    m.setHours(24,0,0,0);
    const diff = m - now, h = Math.floor(diff / 3600000);
    const mn = Math.floor((diff % 3600000)/60000), s = Math.floor((diff % 60000)/1000);
    el.countdown.textContent = `⏳ New theme song in ${h}h ${mn}m ${s}s`;
    document.getElementById('countdownModal').textContent = el.countdown.textContent;
  }

  function handleGuess() {
    const g = el.guessInput.value.trim();
    if (!g || guessed.has(g.toLowerCase()) || count >= max) return;
    guessed.add(g.toLowerCase());
    const t = [1,2,3,5,10,15][Math.min(count,5)];
    const ok = g.toLowerCase() === today.title.toLowerCase();
    const div = document.createElement('div');
    div.textContent = `${ok ? '✅' : '❌'} ${g} @ ${t}s`;
    div.className = ok ? 'text-green-300 font-bold' : 'text-red-300';
    el.history.appendChild(div);
    el.guessInput.value = '';
    count++;
    el.currentGuess.textContent = Math.min(count + 1, max);
    el.listenTime.textContent = `${t} second`;
    if (ok) { confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }}); finish(true); }
    else if (count >= max) finish(false);
  }

  function handleSkip() {
    if (count >= max) return;
    const t = [1,2,3,5,10,15][Math.min(count,5)];
    const div = document.createElement('div');
    div.textContent = `⏭️ Skipped @ ${t}s`;
    div.className = 'text-yellow-200';
    el.history.appendChild(div);
    count++;
    el.currentGuess.textContent = Math.min(count + 1, max);
    el.listenTime.textContent = `${t} second`;
    if (count >= max) finish(false);
  }

  function finish(correct) {
    localStorage.setItem(todayKey, 'done');
    el.correctReveal.textContent = `🎯 The correct answer was: ${today.title}`;
    el.correctReveal.classList.remove('hidden');
    el.resultAnswer.textContent = el.correctReveal.textContent;
    el.resultModal.classList.remove('hidden');
    disableAll();
    let gp = parseInt(localStorage.getItem('gamesPlayed') || '0') + 1;
    let cs = parseInt(localStorage.getItem('currentStreak') || '0');
    let bs = parseInt(localStorage.getItem('bestStreak') || '0');
    if (correct) { cs++; if (cs > bs) bs = cs; } else { cs = 0; }
    localStorage.setItem('gamesPlayed', gp);
    localStorage.setItem('currentStreak', cs);
    localStorage.setItem('bestStreak', bs);
    updateStats();
  }

  function disableAll() {
    el.play.disabled = el.skip.disabled = el.submit.disabled = el.guessInput.disabled = true;
    el.skip.classList.add('bg-orange-500', 'hover:bg-orange-600');
  }

  function share() {
    const msg = `🎵 Cartoondle Streak: ${el.currentStreak.textContent} | Best: ${el.bestStreak.textContent}`;
    navigator.share?.({ title: 'Cartoondle', text: msg, url: location.href }) || alert(msg);
  }

  function autoComp() {
    const v = el.guessInput.value.toLowerCase();
    el.autocomplete.innerHTML = '';
    if (!v) return el.autocomplete.classList.add('hidden');
    playlist.filter(t => t.title.toLowerCase().includes(v)).forEach(t => {
      const div = document.createElement('div');
      div.textContent = t.title;
      div.className = 'cursor-pointer px-3 py-1 hover:bg-gray-200';
      div.onclick = () => { el.guessInput.value = t.title; el.autocomplete.classList.add('hidden'); };
      el.autocomplete.appendChild(div);
    });
    el.autocomplete.classList.remove('hidden');
  }
});
