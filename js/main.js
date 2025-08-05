const playlist = [ { title: "Chowder", url: "audio/chowder.mp3" },
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

function getTodayIndex() {
  const base=new Date('2024-01-01T00:00:00-06:00');
  const nowCST=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
  return Math.floor((nowCST-base)/(1000*60*60*24)) % playlist.length;
}

function formatCountdown() {
  const now=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
  const midnight=new Date(now); midnight.setHours(24,0,0,0);
  const diff=midnight-now;
  const h=String(Math.floor(diff/3600000)).padStart(2,'0'),
        m=String(Math.floor((diff%3600000)/60000)).padStart(2,'0'),
        s=String(Math.floor((diff%60000)/1000)).padStart(2,'0');
  return `${h}:${m}:${s}`;
}

function getState(key) {
  return JSON.parse(localStorage.getItem(key) || '{"count":0,"guessed":[],"finished":false}');
}
function saveState(key,state){localStorage.setItem(key,JSON.stringify(state));}
function disableGameActions(el){el.playBtn.disabled=true;el.skipBtn.disabled=true;el.submitBtn.disabled=true;}

document.addEventListener("DOMContentLoaded",()=>{
  const idx=getTodayIndex(), today=playlist[idx],
        stateKey=`songless-state-${idx}`, doneKey=`songless-done-${idx}`,
        state=getState(stateKey);

  const el={ countdown:document.getElementById('countdown'),
    gamesPlayed:document.getElementById('gamesPlayed'),
    currentStreak:document.getElementById('currentStreak'),
    bestStreak:document.getElementById('bestStreak'),
    guessGrid:document.getElementById('guessGrid'),
    playBtn:document.getElementById('playBtn'),
    progressSegments:document.getElementById('progressSegments'),
    guessInput:document.getElementById('guessInput'),
    autocompleteList:document.getElementById('autocompleteList'),
    submitBtn:document.getElementById('submitBtn'),
    skipBtn:document.getElementById('skipBtn'),
    correctAnswer:document.getElementById('correctAnswer'),
    resultModal:document.getElementById('resultModal'),
    resultTitle:document.getElementById('resultTitle'),
    resultAnswer:document.getElementById('resultAnswer'),
    resultCloseBtn:document.getElementById('resultCloseBtn'),
    alreadyPlayedModal:document.getElementById('alreadyPlayedModal'),
    alreadyDesc:document.getElementById('alreadyDesc'),
    alreadyOk:document.getElementById('alreadyOk')
  };

  const audio=document.getElementById('audioPlayer');
  audio.src=today.url;

  const volumeSlider=document.getElementById('volumeSlider');
  if(volumeSlider){audio.volume=parseFloat(volumeSlider.value);
    volumeSlider.addEventListener('input',e=>audio.volume=parseFloat(e.target.value));}

  // adjust guess grid width equal to input
  const inputWidth=el.guessInput.offsetWidth + 'px';
  for(let i=0;i<maxGuesses;i++){
    const box=document.createElement('div');
    box.className='h-12 bg-gray-800 rounded flex items-center justify-center text-sm truncate';
    box.style.width=inputWidth;
    el.guessGrid.appendChild(box);
  }

  function updateStats(){
    if(!localStorage.getItem('gamesPlayed')) localStorage.setItem('gamesPlayed',0);
    if(!localStorage.getItem('currentStreak')) localStorage.setItem('currentStreak',0);
    if(!localStorage.getItem('bestStreak')) localStorage.setItem('bestStreak',0);
    el.gamesPlayed.textContent=localStorage.getItem('gamesPlayed');
    el.currentStreak.textContent=localStorage.getItem('currentStreak');
    el.bestStreak.textContent=localStorage.getItem('bestStreak');
  }

  function renderProgress(count){
    el.progressSegments.innerHTML='';
    durations.forEach((sec,i)=>{
      const div=document.createElement('div');
      div.className=`flex-1 h-2 ${(i<=count)?'bg-green-400':'bg-gray-700'}`;
      el.progressSegments.appendChild(div);
    });
  }

  function reveal(guess,correct,skipped=false){
    const box=el.guessGrid.children[state.count];
    box.textContent=skipped?'Skipped':guess;
    box.classList.add(skipped?'text-gray-400':correct?'bg-green-600':'bg-red-600');
    state.count++; saveState(stateKey,state);
    renderProgress(state.count);
  }

  function finish(correct){
    state.finished=true; saveState(stateKey,state);
    localStorage.setItem(doneKey,'yes');
    let gp=parseInt(localStorage.getItem('gamesPlayed'))+1,
        cs=parseInt(localStorage.getItem('currentStreak')),
        bs=parseInt(localStorage.getItem('bestStreak'));
    if(correct){cs++; if(cs>bs)bs=cs; confetti({particleCount:100,spread:50}); audio.currentTime=0; audio.play();}
    else{cs=0;el.resultTitle.textContent='Game Over';}
    el.resultAnswer.textContent=today.title;
    el.correctAnswer.textContent=today.title;
    el.correctAnswer.classList.remove('hidden');
    localStorage.setItem('gamesPlayed',gp);
    localStorage.setItem('currentStreak',cs);
    localStorage.setItem('bestStreak',bs);
    updateStats();
    el.resultModal.classList.remove('hidden');
    disableGameActions(el);
  }

  state.guessed.forEach((g,i)=>{const corr=(g.toLowerCase()===today.title.toLowerCase());
    const box=el.guessGrid.children[i]; box.textContent=g; box.classList.add(corr?'bg-green-600':'bg-red-600');});

  renderProgress(state.count); updateStats();
  if(state.finished||localStorage.getItem(doneKey)){el.alreadyPlayedModal.classList.remove('hidden');disableGameActions(el);}

  el.guessInput.addEventListener('input',function(){
    const val=this.value.trim().toLowerCase(); el.autocompleteList.innerHTML='';
    if(!val){el.autocompleteList.classList.add('hidden');return;}
    const matches=playlist.filter(p=>p.title.toLowerCase().includes(val));
    if(!matches.length){el.autocompleteList.classList.add('hidden');return;}
    matches.forEach(m=>{const opt=document.createElement('div');
      opt.textContent=m.title; opt.className='px-3 py-2 hover:bg-gray-200 cursor-pointer';
      opt.onclick=()=>{el.guessInput.value=m.title; el.autocompleteList.classList.add('hidden');};
      el.autocompleteList.appendChild(opt);});
    el.autocompleteList.classList.remove('hidden');
  });

  el.submitBtn.addEventListener('click',function(){
    if(state.finished||state.count>=maxGuesses)return;
    const val=el.guessInput.value.trim(); if(!val||state.guessed.includes(val.toLowerCase()))return;
    state.guessed.push(val.toLowerCase()); const correct=(val.toLowerCase()===today.title.toLowerCase());
    reveal(val,correct); if(correct)finish(true);else if(state.count>=maxGuesses)finish(false);
    el.guessInput.value=''; el.autocompleteList.classList.add('hidden');
  });

  el.skipBtn.addEventListener('click',function(){
    if(state.finished||state.count>=maxGuesses)return;
    reveal('',false,true); if(state.count>=maxGuesses)finish(false);
  });

  el.playBtn.addEventListener('click',function(){
    if(state.finished)return;
    const t=durations[Math.min(state.count,durations.length-1)];
    audio.currentTime=0; audio.play();
  });

  el.guessInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();el.submitBtn.click();}});

  el.resultCloseBtn.onclick=()=>el.resultModal.classList.add('hidden');
  el.alreadyOk.onclick=()=>el.alreadyPlayedModal.classList.add('hidden');

  setInterval(()=>{el.countdown.textContent=`Next theme song in: ${formatCountdown()}`;},1000);
});
