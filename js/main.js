// Project: Themedle – main.js

const timeIncrements = [1,2,3,5,10,15];
let currentGuess = 1;
let currentClipLength = timeIncrements[0];
let isPlaying = false;
let gameOver = false;

const playBtn = document.getElementById('playBtn');
const volumeSlider = document.getElementById('volumeSlider');
const clipLengthSpan = document.getElementById('clipLength');
const progressBar = document.getElementById('progressBar');
const maxClipIndicator = document.getElementById('maxClipIndicator');
const guessInput = document.getElementById('guessInput');
const suggestionsDiv = document.getElementById('suggestions');
const submitBtn = document.getElementById('submitGuess');
const skipBtn = document.getElementById('skipGuess');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverMessage = document.getElementById('gameOverMessage');
const correctAnswerEl = document.getElementById('correctAnswer');
const currentStreakEl = document.getElementById('currentStreak');
const bestStreakEl = document.getElementById('bestStreak');
const gamesPlayedEl = document.getElementById('gamesPlayed');
const countdownEl = document.getElementById('countdown');
const displayedAnswerEl = document.getElementById('displayedAnswer');
const answerDisplay = document.getElementById('answerDisplay');

const gameStats = {
  currentStreak: 0, bestStreak: 0, gamesPlayed: 0, lastPlayedDate: null
};
let dailyGameState = {
  date: null, completed: false, won: false,
  guesses: [], currentGuess: 1, songIndex: 0
};

const themeSongs = [
  { title:"Adventure Time", url:"../audio/adventuretime.mp3" },
  { title:"All Grown Up", url:"../audio/allgrownup.mp3" },
  { title:"Avatar The Last Airbender", url:"../audio/avatarthelastairbender.mp3" }
  // ... expand with your other theme songs
];

function getTodayCST(){
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset()*60000;
  const cst = new Date(utc + (-6*3600000));
  return cst.toDateString();
}

function getDailySongIndex(){
  const today = getTodayCST().replace(/\s/g,'');
  let hash = 0;
  for(let i=0;i<today.length;i++){
    hash = ((hash<<5) - hash) + today.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % themeSongs.length;
}

function loadStats(){
  const saved = localStorage.getItem('themedleStats');
  if(saved) Object.assign(gameStats, JSON.parse(saved));
  updateStatsDisplay();
}

function saveStats(){
  localStorage.setItem('themedleStats', JSON.stringify(gameStats));
}

function loadDailyGameState(){
  const saved = localStorage.getItem('themedleDailyState');
  const today = getTodayCST();
  if(saved){
    const st = JSON.parse(saved);
    if(st.date === today){
      dailyGameState = st;
      return true;
    }
  }
  dailyGameState = {
    date: today, completed:false, won:false,
    guesses:[], currentGuess:1, songIndex: getDailySongIndex()
  };
  saveDailyGameState();
  return false;
}

function saveDailyGameState(){
  localStorage.setItem('themedleDailyState', JSON.stringify(dailyGameState));
}

function updateStatsDisplay(){
  currentStreakEl.textContent = gameStats.currentStreak;
  bestStreakEl.textContent = gameStats.bestStreak;
  gamesPlayedEl.textContent = gameStats.gamesPlayed;
}

function updateCountdown(){
  const nowUTC = Date.now() + new Date().getTimezoneOffset()*60000;
  const cst = new Date(nowUTC + (-6*3600000));
  const tomorrow = new Date(cst);
  tomorrow.setDate(tomorrow.getDate()+1);
  tomorrow.setHours(0,0,0,0);
  const diff = tomorrow - cst;
  const hrs = String(Math.floor(diff/3600000)).padStart(2,'0');
  const mins = String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
  const secs = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
  countdownEl.textContent = `${hrs}:${mins}:${secs}`;
}

function updateMaxClipIndicator(){
  const pct = (currentClipLength / 15)*100;
  maxClipIndicator.style.width = pct + '%';
}

function updateSkipButton(){
  if(currentGuess < 6){
    const inc = timeIncrements[currentGuess] - currentClipLength;
    skipBtn.textContent = `Skip (+${inc}s)`;
  }
}

function restoreGameState(){
  currentGuess = dailyGameState.currentGuess;
  currentClipLength = timeIncrements[currentGuess-1];
  clipLengthSpan.textContent = `${currentClipLength} ${currentClipLength===1?'second':'seconds'}`;
  updateMaxClipIndicator();
  updateSkipButton();
  dailyGameState.guesses.forEach((g,i)=>{
    const slot = document.getElementById(`guessSlot-${i+1}`);
    slot.style.opacity='1';
    slot.classList.remove('border-gray-600');
    if(g.type==='correct'){
      slot.classList.add('border-green-500','bg-green-900/30');
      slot.innerHTML = `<span class="text-green-300 font-semibold">${g.text}</span><span class="text-sm text-green-400">${g.clipLength}s</span>`;
    } else if(g.type==='wrong'){
      slot.classList.add('border-red-500','bg-red-900/30');
      slot.innerHTML = `<span class="text-red-300">${g.text}</span><span class="text-sm text-red-400">${g.clipLength}s</span>`;
    } else if(g.type==='skipped'){
      slot.classList.add('border-yellow-500','bg-yellow-900/30');
      slot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${g.clipLength}s</span>`;
    }
  });
}

function disableGameControls(){
  guessInput.disabled = true;
  submitBtn.disabled = true;
  skipBtn.disabled = true;
  guessInput.placeholder = 'Game completed for today';
  answerDisplay.classList.remove('hidden');
  displayedAnswerEl.textContent = currentSong.title;
}

function showGameOverModal(won){
  gameOverModal.classList.remove('hidden');
  gameOverModal.classList.add('flex');
  correctAnswerEl.textContent = currentSong.title;
  if(won){
    gameOverTitle.textContent = '🎉 Congratulations!';
    gameOverMessage.textContent = `You guessed it in ${currentGuess} ${currentGuess===1?'try':'tries'}!`;
  } else {
    gameOverTitle.textContent = '😔 Game Over';
    gameOverMessage.textContent = 'Better luck next time!';
  }
  setTimeout(()=> { playBtn.click(); }, 500);
}

function showSuggestions(q){
  if(!q.trim()) { suggestionsDiv.classList.add('hidden'); return; }
  const matches = themeSongs.filter(s => s.title.toLowerCase().includes(q.toLowerCase()));
  if(matches.length===0){ suggestionsDiv.classList.add('hidden'); return; }
  suggestionsDiv.innerHTML = matches.map((s,i)=>`<div class="suggestion-item px-4 py-2 hover:bg-gray-700 cursor-pointer text-white" data-title="${s.title}" data-index="${i}">${s.title}</div>`).join('');
  suggestionsDiv.classList.remove('hidden');
}

function selectSuggestion(title){
  guessInput.value = title;
  suggestionsDiv.classList.add('hidden');
}

let audio = new Audio();
let playbackInterval, simulatedTime=0;

playBtn.addEventListener('click',()=> {
  if(!isPlaying){
    isPlaying = true;
    playBtn.textContent = '■ Pause';
    playBtn.classList.add('pulse-animation');
    simulatedTime=0;
    if(audio.play){ audio.currentTime=0; audio.play().catch(()=>{}); }
    const playLen = gameOver ? 15 : currentClipLength;
    playbackInterval = setInterval(()=>{
      simulatedTime += 0.05;
      const prog = simulatedTime/playLen;
      const maxPct = (playLen/15)*100;
      progressBar.style.width = Math.min(prog,1)*maxPct + '%';
      if(simulatedTime>=playLen){
        clearInterval(playbackInterval);
        isPlaying=false;
        playBtn.textContent='▶ Play';
        playBtn.classList.remove('pulse-animation');
        progressBar.style.width='0%'; simulatedTime=0;
      }
    },50);
  } else {
    isPlaying=false;
    playBtn.textContent='▶ Play';
    playBtn.classList.remove('pulse-animation');
    audio.pause();
    clearInterval(playbackInterval);
    simulatedTime=0; progressBar.style.width='0%';
  }
});

volumeSlider.addEventListener('input',()=>{
  const vol = volumeSlider.value/100;
  audio.volume=vol;
  document.getElementById('volumePercent').textContent = `${volumeSlider.value}%`;
});

submitBtn.addEventListener('click',()=>{
  if(gameOver) return;
  const guess = guessInput.value.trim();
  if(!guess) return;
  const lowercase = guess.toLowerCase();
  const slot = document.getElementById(`guessSlot-${currentGuess}`);
  slot.style.opacity = '1';
  if(lowercase === currentSong.title.toLowerCase()){
    slot.classList.add('border-green-500','bg-green-900/30');
    slot.innerHTML = `<span class="text-green-300 font-semibold">${guess}</span><span class="text-sm text-green-400">${currentClipLength}s</span>`;
    dailyGameState.guesses.push({ type:'correct', text:guess, clipLength:currentClipLength });
    dailyGameState.completed = true; dailyGameState.won = true; dailyGameState.currentGuess = currentGuess;
    saveDailyGameState();
    gameOver = true;
    const today = getTodayCST();
    if(gameStats.lastPlayedDate !== today){
      gameStats.currentStreak++;
      gameStats.gamesPlayed++;
      gameStats.lastPlayedDate = today;
      if(gameStats.currentStreak > gameStats.bestStreak) gameStats.bestStreak = gameStats.currentStreak;
      saveStats();
    }
    updateStatsDisplay();
    disableGameControls();
    clipLengthSpan.textContent = '15 seconds (full song)';
    maxClipIndicator.style.width = '100%';
    showGameOverModal(true);
  } else {
    slot.classList.add('border-red-500','bg-red-900/30');
    slot.innerHTML = `<span class="text-red-300">${guess}</span><span class="text-sm text-red-400">${currentClipLength}s</span>`;
    dailyGameState.guesses.push({ type:'wrong', text:guess, clipLength:currentClipLength });
    currentGuess++;
    dailyGameState.currentGuess = currentGuess;
    if(currentGuess > 6){
      dailyGameState.completed = true; dailyGameState.won = false;
      saveDailyGameState();
      gameOver = true;
      const today = getTodayCST();
      if(gameStats.lastPlayedDate !== today){
        gameStats.currentStreak = 0;
        gameStats.gamesPlayed++;
        gameStats.lastPlayedDate = today;
        saveStats();
      }
      updateStatsDisplay();
      disableGameControls();
      clipLengthSpan.textContent = '15 seconds (full song)';
      maxClipIndicator.style.width = '100%';
      showGameOverModal(false);
    } else {
      saveDailyGameState();
      currentClipLength = timeIncrements[currentGuess-1];
      clipLengthSpan.textContent = `${currentClipLength} seconds`;
      updateMaxClipIndicator();
      updateSkipButton();
    }
  }
  guessInput.value = ''; guessInput.focus();
});

skipBtn.addEventListener('click',()=>{
  if(gameOver) return;
  const slot = document.getElementById(`guessSlot-${currentGuess}`);
  slot.style.opacity = '1';
  slot.classList.add('border-yellow-500','bg-yellow-900/30');
  slot.innerHTML = `<span class="text-yellow-300">Skipped</span><span class="text-sm text-yellow-400">${currentClipLength}s</span>`;
  dailyGameState.guesses.push({ type:'skipped', text:'Skipped', clipLength:currentClipLength });
  currentGuess++; dailyGameState.currentGuess = currentGuess;
  if(currentGuess > 6){
    dailyGameState.completed = true; dailyGameState.won = false;
    saveDailyGameState();
    gameOver = true;
    const today = getTodayCST();
    if(gameStats.lastPlayedDate !== today){
      gameStats.currentStreak = 0;
      gameStats.gamesPlayed++;
      gameStats.lastPlayedDate = today;
      saveStats();
    }
    updateStatsDisplay();
    disableGameControls();
    clipLengthSpan.textContent = '15 seconds (full song)';
    maxClipIndicator.style.width = '100%';
    showGameOverModal(false);
  } else {
    saveDailyGameState();
    currentClipLength = timeIncrements[currentGuess-1];
    clipLengthSpan.textContent = `${currentClipLength} seconds`;
    updateMaxClipIndicator();
    updateSkipButton();
  }
});

guessInput.addEventListener('input', e => showSuggestions(e.target.value));
suggestionsDiv.addEventListener('click', e => {
  if(e.target.matches('.suggestion-item')){
    selectSuggestion(e.target.dataset.title);
    submitBtn.click();
  }
});
guessInput.addEventListener('keydown', e => {
  const items = suggestionsDiv.querySelectorAll('.suggestion-item');
  if(e.key==='ArrowDown'){ e.preventDefault(); navSuggestions(1, items); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); navSuggestions(-1, items); }
  else if(e.key==='Enter'){ e.preventDefault(); if(items[selectedIdx]) selectSuggestion(items[selectedIdx].dataset.title); submitBtn.click(); }
  else if(e.key==='Escape'){ suggestionsDiv.classList.add('hidden'); selectedIdx = -1; }
});
let selectedIdx = -1;
function navSuggestions(delta, items){
  selectedIdx = Math.max(0, Math.min(selectedIdx+delta, items.length-1));
  items.forEach((it,i)=>it.classList.toggle('bg-gray-700', i===selectedIdx));
}

let currentSong = null;

function init(){
  loadStats();
  const played = loadDailyGameState();
  currentSong = themeSongs[dailyGameState.songIndex];
  audio = new Audio(currentSong.url);
  audio.volume = volumeSlider.value / 100;
  audio.addEventListener('error', ()=>{ console.warn('Audio load failed'); });
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if(played && dailyGameState.completed){
    gameOver = true;
    restoreGameState();
    disableGameControls();
    setTimeout(()=>showGameOverModal(dailyGameState.won), 500);
  } else if(played && !dailyGameState.completed){
    restoreGameState();
    updateMaxClipIndicator();
    updateSkipButton();
    guessInput.focus();
  } else {
    updateMaxClipIndicator();
    updateSkipButton();
    guessInput.focus();
  }
}

init();
