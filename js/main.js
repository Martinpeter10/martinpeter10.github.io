// === Config ===
const CLIENT_ID = 'SSz86sqjFz89WiIDMTCnBLjsrqIgDkS9';
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

// === Fetch playlist and map titles ===
async function fetchPlaylist() {
  const res = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(PLAYLIST_URL)}&client_id=${CLIENT_ID}`);
  if (!res.ok) throw new Error('Playlist resolve failed');
  const data = await res.json();
  if (!data.tracks?.length || data.tracks.length < titles.length) throw new Error('Playlist too short');
  return data.tracks.map((track, i) => ({ id: track.id, title: titles[i] || track.title }));
}

window.addEventListener('DOMContentLoaded', async () => {
  let playlist;
  try {
    playlist = await fetchPlaylist();
  } catch (err) {
    console.error(err);
    alert('Could not load playlist—make sure it’s public and CLIENT_ID is valid.');
    return;
  }

  // UI element refs
  const el = {
    ...
    autocompleteList: document.getElementById("autocomplete-list"),
    // and all others unchanged...
  };

  const todayIndex = (() => {
    const dk = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    return dk.split('/').reduce((a,b) => a + parseInt(b), 0) % playlist.length;
  })();
  const todayTrack = playlist[todayIndex];

  // Setup SoundCloud player
  el.iframe.src = `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${todayTrack.id}&client_id=${CLIENT_ID}&auto_play=false`;
  const widget = SC.Widget(el.iframe);

  // ... rest of your initialization, guess logic, UI handlers ...

  // Fix play button:
  el.playBtn.onclick = () => {
    widget.seekTo(0);
    widget.play();
    const timeSec = [1,2,3,5,10,15][Math.min(currentGuessCount,5)];
    setTimeout(() => widget.pause(), timeSec * 1000);
  };

  // Fix autocomplete to use scoped playlist:
  function handleAutocomplete() {
    const val = el.guessInput.value.toLowerCase();
    el.autocompleteList.innerHTML = '';
    if (!val) return el.autocompleteList.classList.add("hidden");
    playlist.filter(t => t.title.toLowerCase().includes(val)).forEach(t => {
      const div = document.createElement('div');
      div.textContent = t.title;
      div.onclick = () => {
        el.guessInput.value = t.title;
        el.autocompleteList.classList.add("hidden");
      };
      el.autocompleteList.appendChild(div);
    });
    el.autocompleteList.classList.remove("hidden");
  }
  
  el.guessInput.addEventListener('input', handleAutocomplete);
  
  // Continue connecting submitBtn.onclick, skipBtn.onclick, etc...
});
