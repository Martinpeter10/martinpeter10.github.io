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
const durations = [1,2,3,5,10,15];
const maxGuesses = 6;

function getTodayIndex(){
  const base = new Date('2024-01-01T00:00:00-06:00');
  const now = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
  return Math.floor((now-base)/(1000*60*60*24)) % playlist.length;
}

function formatCountdown(){
  const then = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
  const mid = new Date(then); mid.setHours(24,0,0,0);
  const diff=mid-then;
  return [Math.floor(diff/3600000),Math.floor((diff%3600000)/60000),Math.floor((diff%60000)/1000)]
    .map(n=>String(n).padStart(2,'0')).join(':');
}

function getState(k){
  return JSON.parse(localStorage.getItem(k) || '{"count":0,"guessed":[],"finished":false}');
}
function saveState(k,st){ localStorage.setItem(k, JSON.stringify(st)); }
function disableGame(el){
  el.playBtn.disabled = true;
  el.skipBtn.disabled = true;
  el.submitBtn.disabled = true;
}

function renderSegments(el){
  el.progressSegments.innerHTML = '';
  const total = durations[durations.length-1];
  durations.forEach((sec,idx)=>{
    const seg=document.createElement('div');
    seg.style.width = (sec/total*100)+'%';
    seg.style.height = '4px';
    seg.style.backgroundColor = idx < el.filledCount ? '#34D399' : '#374151';
    el.progressSegments.appendChild(seg);
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  const idx = getTodayIndex();
  const today = playlist[idx];
  const stateKey = `songless-state-${idx}`, doneKey = `songless-done-${idx}`;
  const state = getState(stateKey);

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
    correctAnswer: document.getElementById('correctAnswer'),
    resultModal: document.getElementById('resultModal'),
    resultAnswer: document.getElementById('resultAnswer'),
    resultCloseBtn: document.getElementById('resultCloseBtn'),
    alreadyPlayedModal: document.getElementById('alreadyPlayedModal'),
    alreadyDesc: document.getElementById('alreadyDesc'),
    alreadyOk: document.getElementById('alreadyOk'),
    audio: document.getElementById('audioPlayer'),
    filledCount: state.count  // number of full segments already filled
  };

  el.audio.src = today.url;

  // build guess boxes equal width to input
  const w = el.guessInput.offsetWidth+'px';
  for(let i=0; i<maxGuesses; i++){
    const d = document.createElement('div');
    d.className = 'h-12 bg-gray-800 rounded flex items-center justify-center text-sm truncate';
    d.style.width = w;
    el.guessGrid.appendChild(d);
  }

  function updateStats(){
    if(!localStorage.getItem('gamesPlayed')) localStorage.setItem('gamesPlayed',0);
    if(!localStorage.getItem('currentStreak')) localStorage.setItem('currentStreak',0);
    if(!localStorage.getItem('bestStreak')) localStorage.setItem('bestStreak',0);
    el.gamesPlayed.textContent = localStorage.getItem('gamesPlayed');
    el.currentStreak.textContent = localStorage.getItem('currentStreak');
    el.bestStreak.textContent = localStorage.getItem('bestStreak');
  }

  function reveal(guess,correct,skipped=false){
    const box = el.guessGrid.children[state.count];
    box.textContent = skipped ? 'Skipped': guess;
    box.classList.add(skipped ? 'text-gray-400' : correct ? 'bg-green-600': 'bg-red-600');
    state.count++;
    el.filledCount = state.count;
    saveState(stateKey,state);
    renderSegments(el);
  }

  function finish(correct){
    state.finished = true; saveState(stateKey,state);
    localStorage.setItem(doneKey,'yes');
    let gp = +localStorage.getItem('gamesPlayed')+1;
    let cs = +localStorage.getItem('currentStreak'), bs = +localStorage.getItem('bestStreak');
    if(correct){ cs++; if(cs>bs) bs=cs; confetti({particleCount:100,spread:50}); }
    else{ cs=0; el.resultAnswer.textContent='Game Over'; }
    el.correctAnswer.textContent = today.title;
    el.correctAnswer.classList.remove('hidden');
    localStorage.setItem('gamesPlayed',gp);
    localStorage.setItem('currentStreak',cs);
    localStorage.setItem('bestStreak',bs);
    updateStats();
    el.resultModal.classList.remove('hidden');
    disableGame(el);
  }

  state.guessed.forEach((g,i)=>{
    const corr = g.toLowerCase() === today.title.toLowerCase();
    const b = el.guessGrid.children[i];
    b.textContent = g; b.classList.add(corr?'bg-green-600':'bg-red-600');
  });

  renderSegments(el);
  updateStats();
  if(state.finished || localStorage.getItem(doneKey)){
    el.alreadyPlayedModal.classList.remove('hidden');
    disableGame(el);
  }

  function playStage(){
    if(state.finished) return;
    const stage = state.count < durations.length ? state.count : durations.length -1;
    const secs = durations[stage];
    el.audio.currentTime = 0;
    el.audio.play();
    const start = Date.now();
    const total = durations[durations.length-1];
    const endTime = start + secs*1000;

    const timer = setInterval(()=>{
      const now = Date.now();
      const elapsed = (now - start)/1000;
      const pct = elapsed/secs;
      if(pct>=1){
        clearInterval(timer);
        el.audio.pause();
      }
      // fill partial on current segment
      const children = el.progressSegments.children;
      const segWidth = (durations[stage]/total)*el.progressSegments.clientWidth;
      const x = Math.min(pct*segWidth, segWidth);
      children[stage].style.backgroundColor = '#34D399';
      children[stage].style.width = segWidth+'px';
      children[stage].style.position = 'relative';
      children[stage].style.overflow = 'hidden';
      children[stage].innerHTML = `<div style="width:${pct*100}%;height:100%;background:#34D399;"></div>`;
    }, 50);
  }

  el.playBtn.addEventListener('click', playStage);

  el.guessInput.addEventListener('input', function(){
    // typeahead logic unchanged from earlier
    el.autocompleteList.innerHTML = '';
    const val = this.value.trim().toLowerCase();
    if(!val) return el.autocompleteList.classList.add('hidden');
    const matches = playlist.filter(p=>p.title.toLowerCase().includes(val));
    if(!matches.length) return el.autocompleteList.classList.add('hidden');
    matches.forEach(m=>{
      const d=document.createElement('div');
      d.textContent = m.title;
      d.className='px-3 py-2 hover:bg-gray-200 cursor-pointer';
      d.onclick = ()=>{ el.guessInput.value = m.title; el.autocompleteList.classList.add('hidden'); };
      el.autocompleteList.appendChild(d);
    });
    el.autocompleteList.classList.remove('hidden');
  });

  el.submitBtn.addEventListener('click', function(){
    if(state.finished || state.count>=maxGuesses) return;
    const val = el.guessInput.value.trim();
    if(!val || state.guessed.includes(val.toLowerCase())) return;
    state.guessed.push(val.toLowerCase());
    const corr = val.toLowerCase() === today.title.toLowerCase();
    reveal(val, corr);
    if(corr) finish(true);
    else if(state.count>=maxGuesses) finish(false);
    el.guessInput.value=''; el.autocompleteList.classList.add('hidden');
  });

  el.skipBtn.addEventListener('click', function(){
    if(state.finished || state.count>=maxGuesses) return;
    reveal('', false, true);
    if(state.count>=maxGuesses) finish(false);
  });

  el.guessInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); el.submitBtn.click(); }});

  el.resultCloseBtn.onclick = ()=>el.resultModal.classList.add('hidden');
  el.alreadyOk.onclick = ()=>el.alreadyPlayedModal.classList.add('hidden');

  setInterval(()=>{ el.countdown.textContent=`Next theme song in: ${formatCountdown()}`; },1000);
});
