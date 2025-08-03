# 🎵 Cartoondle – Daily Cartoon Theme Song Game
Cartoondle is a daily guessing game inspired by Heardle, but focused on classic cartoon theme songs. Players are given a short snippet from a SoundCloud track and have 6 chances to guess the correct cartoon.

https://dailyjamm.com

🧩 Gameplay Overview
- A new song is featured each day at midnight CST.

Players can listen to increasingly longer snippets on each guess (1s → 15s max).

Players get up to 6 guesses to identify the theme song.

If they guess correctly, their streak continues!

If they fail or skip 6 times, the game ends, revealing the correct answer.

One play per day — refreshing will not reset your play.

🧠 Features
🎧 Embedded SoundCloud player (invisible to prevent cheating)

📅 Daily song rotation based on CST midnight

🔒 Single play per day tracked with localStorage

🧮 Stats tracking:

Current streak

Best streak

Total games played

⏱️ Countdown timer after game ends

📱 Responsive UI built with Tailwind CSS

🖼️ Custom favicon & clean UI modals

🛠️ Tech Stack
HTML / JavaScript

Tailwind CSS (via CDN for quick dev)

SoundCloud Player Widget API

LocalStorage for session state & statistics

📂 Project Structure
bash
Copy code
📁 project-root
├── index.html        # Main game logic + UI
├── favicon.png       # Tab icon/logo for the site
🧪 Development Notes
✅ To Do (or Future Ideas):
Add a Share button with result emojis like Wordle

Store historical guesses per day

Create a leaderboard (requires backend or Firebase)

Allow players to submit their own cartoon themes

Add a mobile app shortcut (PWA support)

⚠️ Known Limitations:
Songs must be manually managed in the playlist array.

CDN Tailwind usage is not recommended for production — consider switching to Tailwind CLI for build optimization.

localStorage is device-specific — users switching devices won’t carry over their stats.

🧰 How to Customize
🔊 Add More Songs
In the <script> block of index.html, update this array:

js
Copy code
const playlist = [
  { id: "123456789", title: "DuckTales", url: "https://api.soundcloud.com/tracks/123456789" },
  ...
];
Each entry must include:

A unique ID

The correct title (for answer validation)

A SoundCloud track URL

You can get the URL using SoundCloud's API or direct upload links.

🚀 Deployment
Upload to any static host (e.g., GitHub Pages, Vercel, Netlify).

Make sure favicon.png is available at the root directory.

Visit your site and test!

🙏 Credits
Inspired by Heardle and Wordle

Uses SoundCloud's Player Widget API

UI powered by Tailwind CSS

📬 Contact
Built by Peter Martin
Got feature ideas or theme requests? Drop me a message or open an issue.

