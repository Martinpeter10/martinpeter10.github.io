const playlist = [
  { title: "Chowder", url: "audio/chowder.mp3" },
  { title: "All Grown Up", url: "audio/all-grown-up.mp3" },
  { title: "Ben 10", url: "audio/ben10.mp3" },
  { title: "Teenage Mutant Ninja Turtles", url: "audio/tmnt.mp3" },
  { title: "Adventure Time", url: "audio/adventure-time.mp3" },
  { title: "Grim Adventures of Billy and Mandy", url: "audio/grim-adventures.mp3" },
  { title: "Kids Next Door", url: "audio/kids-next-door.mp3" },
  { title: "Regular Show", url: "audio/regular-show.mp3" },
  { title: "The Amazing Adventures of Gumball", url: "audio/gumball.mp3" }
];

function getTodayIndex() {
  const d = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  return d.split("/").reduce((a,b) => a + parseInt(b), 0) % playlist.length;
}

document.addEventListener("DOMContentLoaded", () => {
  const todayIdx = getTodayIndex(), today = playlist[todayIdx], key = `played-${todayIdx}`;
  const el = {
    grid: document.getElementById("guessGrid"),
    input: document.getElementById("guessInput"),
    ac: document.getElementById("autocompleteList"),
    btnPlay: document.getElementById("playBtn"),
    bar: document.getElementById("progressBar"),
    audio: document.getElementById("audioPlayer"),
    btnSkip: document.getElementById("skipBtn"),
    btnSubmit: document.getElementById("submitBtn"),
    vol: document.getElementById("volumeSlider"),
    modal: document.getElementById("resultModal"),
    title: document.getElementById("resultTitle"),
    ans: document.getElementById("resultAnswer"),
    closeModal: document.getElementById("resultCloseBtn"),
    alreadyModal: document.getElementById("alreadyPlayedModal"),
    alreadyDesc: document.getElementById("alreadyDesc"),
    alreadyOk: document.getElementById("alreadyOk"),
    statsPlayed: document.getElementById("gamesPlayed"),
    statsStreak: document.getElementById("currentStreak"),
    statsBest: document.getElementById("bestStreak")
  };

  let guessCount = 0, max = 6, guessed = new Set(), finished = false;
  el.audio.src = today.url;
  el.audio.volume = parseFloat(el.vol.value);
  el.vol.oninput = () => el.audio.volume = parseFloat(el.vol.value);

  for (let i=0;i<max;i++) {
    const d = document.createElement("div");
    d.className = "h-12 bg-gray-800 rounded flex items-center justify-center text-sm";
    el.grid.appendChild(d);
  }

  function updateStats() {
    el.statsPlayed.textContent = localStorage.getItem("gamesPlayed")||0;
    el.statsStreak.textContent = localStorage.getItem("currentStreak")||0;
    el.statsBest.textContent = localStorage.getItem("bestStreak")||0;
  }

  function end(correct) {
    finished = true;
    localStorage.setItem(key,"done");
    let gp = parseInt(localStorage.getItem("gamesPlayed")||0)+1;
    let cs = parseInt(localStorage.getItem("currentStreak")||0);
    let bs = parseInt(localStorage.getItem("bestStreak")||0);
    if (correct) { cs++; if(cs>bs) bs=cs; confetti({particleCount:150,spread:70}); el.title.textContent=""; el.audio.currentTime=0; el.audio.play(); }
    else { cs=0; el.title.textContent="Game Over"; }
    el.ans.textContent = today.title;
    localStorage.setItem("currentStreak",cs);
    localStorage.setItem("bestStreak",bs);
    localStorage.setItem("gamesPlayed",gp);
    updateStats();
    el.modal.classList.remove("hidden");
    el.btnSkip.disabled=el.btnSubmit.disabled=el.input.disabled = true;
  }

  function reveal(val, correct=false, skip=false) {
    const cell = el.grid.children[guessCount];
    cell.textContent = skip ? "Skipped" : val;
    const color = skip? "bg-gray-600 italic" : correct? "bg-green-600" : "bg-red-600";
    cell.className = `h-12 rounded flex items-center justify-center text-sm text-white ${color}`;
    guessCount++;
  }

  function guess() {
    if (finished || guessCount>=max) return;
    let g = el.input.value.trim();
    if (!g || guessed.has(g.toLowerCase())) return;
    guessed.add(g.toLowerCase());
    const correct = g.toLowerCase() === today.title.toLowerCase();
    reveal(g,correct);
    if (correct) end(true);
    else if (guessCount>=max) end(false);
    el.input.value="";
  }

  function skip() {
    if (finished || guessCount>=max) return;
    reveal("",false,true);
    if (guessCount>=max) end(false);
  }

  const durations=[1,2,3,5,10,15];
  el.btnPlay.onclick = () => {
    if (finished) return;
    el.audio.currentTime=0;
    el.audio.play();
    const t = durations[Math.min(guessCount,durations.length-1)];
    setTimeout(() => el.audio.pause(), t*1000);
  };

  el.audio.addEventListener("timeupdate", () => {
    const pct = (el.audio.currentTime / el.audio.duration)||0;
    el.bar.style.width = `${pct*100}%`;
  });

  el.btnSubmit.onclick = guess;
  el.btnSkip.onclick = skip;
  el.input.onkeydown = e=> e.key==="Enter" && guess();
  el.closeModal.onclick = () => el.modal.classList.add("hidden");

  el.input.addEventListener("input", () => {
    const v = el.input.value.toLowerCase(); el.ac.innerHTML="";
    if (!v) return el.ac.classList.add("hidden");
    playlist.filter(p=>p.title.toLowerCase().includes(v)).forEach(p=>{
      const d=document.createElement("div"); d.textContent=p.title;
      d.className="px-3 py-1 hover:bg-gray-200 cursor-pointer";
      d.onclick = ()=>(el.input.value=p.title, el.ac.classList.add("hidden"));
      el.ac.appendChild(d);
    });
    el.ac.classList.remove("hidden");
  });

  updateStats();

  if (localStorage.getItem(key)==="done") {
    el.alreadyModal.classList.remove("hidden");
    const now=new Date(),mid=new Date(now);
    mid.setHours(24,0,0,0);
    const diff=mid-now, h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
    el.alreadyDesc.textContent = `Come back in ${h}h ${m}m ${s}s`;
    el.alreadyOk.onclick = ()=>el.alreadyModal.classList.add("hidden");
  }
});
