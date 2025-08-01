<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cartoondle</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://www.youtube.com/iframe_api"></script>
  <style>
    .yt-embed-hidden iframe {
      width: 0;
      height: 0;
      border: none;
      visibility: hidden;
      position: absolute;
    }

    .slider::-webkit-slider-thumb {
      appearance: none;
      height: 16px;
      width: 16px;
      border-radius: 50%;
      background: #fbbf24;
      cursor: pointer;
      border: 2px solid #ffffff;
    }

    .slider::-moz-range-thumb {
      height: 16px;
      width: 16px;
      border-radius: 50%;
      background: #fbbf24;
      cursor: pointer;
      border: 2px solid #ffffff;
    }
  </style>
</head>
<body class="bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-800 min-h-screen text-white">
  <div class="container mx-auto px-4 py-8 max-w-4xl">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold mb-2">🎵 Cartoondle 🎵</h1>
      <p class="text-lg opacity-90">Guess the cartoon theme song in 6 tries or less!</p>
      <div class="mt-4 bg-white/10 rounded-lg p-4">
        <div class="flex justify-center space-x-8 text-sm">
          <div>
            <span class="font-semibold">Current Streak:</span>
            <span id="currentStreak" class="ml-1 text-yellow-300">0</span>
          </div>
          <div>
            <span class="font-semibold">Best Streak:</span>
            <span id="bestStreak" class="ml-1 text-green-300">0</span>
          </div>
          <div>
            <span class="font-semibold">Games Played:</span>
            <span id="gamesPlayed" class="ml-1 text-blue-300">0</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Game Area -->
    <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
      <!-- Audio Controls -->
      <div class="text-center mb-6">
        <h2 class="text-xl font-semibold mb-2">Listen to the theme song:</h2>

        <!-- Hidden YouTube Player -->
        <div class="yt-embed-hidden" id="player-container"></div>

        <div class="text-center mb-4">
          <button id="playSnippet" class="bg-green-500 hover:bg-green-600 px-6 py-2 rounded-lg font-semibold">
            ▶️ Play Snippet
          </button>
          <button id="skipBtn" class="bg-orange-500 hover:bg-orange-600 px-6 py-2 rounded-lg font-semibold transition-colors">
            ⏭️ Skip
          </button>
        </div>

        <div class="text-sm opacity-75">
          Guess <span id="currentGuess">1</span> of 6 • Listen time: <span id="listenTime">1 second</span>
        </div>
      </div>

      <!-- Guess Input -->
      <div class="mb-6">
        <input
          type="text"
          id="guessInput"
          placeholder="Enter your guess for the cartoon name..."
          class="w-full p-4 rounded-lg text-black text-lg border-2 border-transparent focus:border-yellow-400 focus:outline-none"
        >
        <button id="submitBtn" class="w-full mt-3 bg-blue-500 hover:bg-blue-600 py-3 rounded-lg font-semibold text-lg transition-colors">
          Submit Guess
        </button>
      </div>

      <!-- Guess History -->
      <div id="guessHistory" class="space-y-2"></div>
    </div>

    <!-- Instructions -->
    <div class="bg-white/5 rounded-lg p-4 text-sm">
      <h3 class="font-semibold mb-2">How to Play:</h3>
      <ul class="space-y-1 opacity-90">
        <li>• Listen to the theme song clip and guess the cartoon</li>
        <li>• Each wrong guess gives you more of the song (1s → 2s → 3s → 5s → 10s → 15s)</li>
        <li>• <span class="text-red-400">Red</span> = Wrong, <span class="text-yellow-400">Yellow</span> = Same network, <span class="text-green-400">Green</span> = Correct!</li>
        <li>• Use Skip to hear more of the song without using a guess</li>
      </ul>
    </div>
  </div>

  <!-- Result Modal -->
  <div id="resultModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
    <div class="bg-white text-black rounded-xl p-8 max-w-md mx-4 text-center">
      <div id="modalIcon" class="text-6xl mb-4">🎉</div>
      <h2 id="modalTitle" class="text-2xl font-bold mb-4">Congratulations!</h2>
      <p id="modalMessage" class="text-lg mb-6">You guessed it correctly!</p>
      <div id="modalStats" class="bg-gray-100 rounded-lg p-4 mb-6">
        <div class="text-sm space-y-1">
          <div>Guesses used: <span id="guessesUsed" class="font-semibold">1</span>/6</div>
          <div>Time listened: <span id="timeListened" class="font-semibold">1 second</span></div>
        </div>
      </div>
      <button id="playAgainBtn" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold">
        Close
      </button>
    </div>
  </div>

  <script>
    const playlist = [
      "YQEsQ9Ga-s8", // Replace these with your actual playlist video IDs
      "Vzue74y7A84",
      "gP9BbGTkE8I"
    ];

    const maxListenTime = [1, 2, 3, 5, 10, 15];
    let player;
    let currentGuess = 0;

    function getTodayVideoId() {
      const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
      return playlist[day % playlist.length];
    }

    function onYouTubeIframeAPIReady() {
      player = new YT.Player("player-container", {
        videoId: getTodayVideoId(),
        events: {
          onReady: () => console.log("Player ready")
        },
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0
        }
      });
    }

    document.getElementById("playSnippet").addEventListener("click", () => {
      if (!player) return;
      player.seekTo(0);
      player.playVideo();
      setTimeout(() => {
        player.pauseVideo();
      }, maxListenTime[Math.min(currentGuess, maxListenTime.length - 1)] * 1000);
    });

    // Hook up the rest of your game logic here (guess checking, stats, streaks, etc.)
  </script>
</body>
</html>
