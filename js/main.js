// Use the globally defined `currentSong` from the HTML
let currentClipLength = 1;
let maxClipLength = 1;
let isPlaying = false;
let currentGuess = 0;

const playBtn = document.getElementById("playBtn");
const progressBar = document.getElementById("progressBar");
const maxClipIndicator = document.getElementById("maxClipIndicator");
const volumeSlider = document.getElementById("volumeSlider");
const volumePercent = document.getElementById("volumePercent");
const guessInput = document.getElementById("guessInput");
const clipLengthDisplay = document.getElementById("clipLength");
const displayedAnswer = document.getElementById("displayedAnswer");

// Handle Play / Pause button
playBtn.addEventListener("click", () => {
  if (!audioElement.paused) {
    audioElement.pause();
    isPlaying = false;
    playBtn.textContent = "▶ Play";
  } else {
    audioElement.currentTime = 0;
    audioElement.play();
    isPlaying = true;
    playBtn.textContent = "⏸ Pause";

    const clipDuration = Math.min(currentClipLength, 15);
    const interval = setInterval(() => {
      const progress = (audioElement.currentTime / clipDuration) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;

      if (audioElement.currentTime >= clipDuration) {
        audioElement.pause();
        isPlaying = false;
        playBtn.textContent = "▶ Play";
        clearInterval(interval);
      }
    }, 100);
  }
});

// Volume control
volumeSlider.addEventListener("input", () => {
  const volume = volumeSlider.value / 100;
  audioElement.volume = volume;
  volumePercent.textContent = `${volumeSlider.value}%`;
});

// Clip skipping logic
document.getElementById("skipGuess").addEventListener("click", () => {
  if (currentGuess < 6) {
    currentGuess++;
    currentClipLength = [1, 2, 3, 5, 10, 15][currentGuess] || 15;
    maxClipLength = currentClipLength;

    maxClipIndicator.style.width = `${(maxClipLength / 15) * 100}%`;
    clipLengthDisplay.textContent = `${currentClipLength}s`;
  }
});

// Placeholder: Guess submission
document.getElementById("submitGuess").addEventListener("click", () => {
  const userGuess = guessInput.value.trim().toLowerCase();
  const correct = userGuess === currentSong.title.toLowerCase();

  const guessBox = document.getElementById(`guessSlot-${currentGuess + 1}`);
  if (guessBox) {
    guessBox.classList.remove("opacity-50");
    guessBox.classList.add(correct ? "border-green-500" : "border-red-500");
    guessBox.children[0].textContent = guessInput.value;
  }

  if (correct) {
    document.getElementById("answerDisplay").classList.remove("hidden");
    displayedAnswer.textContent = currentSong.title;
  } else {
    if (currentGuess < 5) {
      currentGuess++;
      currentClipLength = [1, 2, 3, 5, 10, 15][currentGuess] || 15;
      maxClipLength = currentClipLength;
      maxClipIndicator.style.width = `${(maxClipLength / 15) * 100}%`;
      clipLengthDisplay.textContent = `${currentClipLength}s`;
    }
  }

  guessInput.value = "";
});
