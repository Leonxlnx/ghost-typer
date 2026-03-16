<p align="center">
  <img src="icons/icon128.png" alt="Ghost Typer" width="100">
</p>

<h1 align="center">Ghost Typer</h1>

<p align="center">
  <strong>Simulate realistic human typing in Google Docs.</strong>
</p>

<p align="center">
  <a href="https://github.com/Leonxlnx/ghost-typer/releases"><img src="https://img.shields.io/github/v/release/Leonxlnx/ghost-typer?style=flat-square&color=0071e3" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Leonxlnx/ghost-typer?style=flat-square" alt="License"></a>
  <a href="https://github.com/Leonxlnx/ghost-typer/stargazers"><img src="https://img.shields.io/github/stars/Leonxlnx/ghost-typer?style=flat-square" alt="Stars"></a>
</p>

<br>

Ghost Typer is a Chrome extension that takes pasted text and types it character-by-character into Google Docs — with natural speed variations, realistic typos and corrections, punctuation pauses, and thinking breaks. The result looks like genuinely hand-typed text in the revision history.

<br>

## Features

- **Human-like speed** — Gaussian-distributed typing speed that varies naturally, not a robotic constant rate
- **Typo simulation** — Makes realistic mistakes using adjacent QWERTY keys, then corrects them
- **Go-back-and-revise** — Occasionally deletes a recent section and retypes it, mimicking real editing behavior
- **Thinking pauses** — Random pauses between sentences, as if considering the next thought
- **Extended breaks** — Rare 20–60 second pauses that simulate checking your phone or getting up
- **Punctuation delays** — Natural hesitation after periods, commas, and other punctuation
- **Markdown support** — Bold, italic, headings, and bullet points are formatted automatically
- **Full playback controls** — Start, pause, resume, and stop at any time
- **Live progress tracking** — Real-time progress bar with ETA
- **Persistent settings** — Your configuration saves automatically across sessions

## How It Works

Ghost Typer uses the **Chrome DevTools Protocol** (CDP) to send trusted keyboard events directly to the browser — the same type of events that are generated when you physically press keys. This means Google Docs treats every character as a real keystroke.

```
Popup UI  →  Background Service Worker  →  Chrome Debugger API  →  CDP Key Events  →  Google Docs
```

The typing engine uses **Gaussian (normal) distribution** for all timing instead of uniform randomness. This creates the natural "burst and hesitate" pattern that real humans exhibit while typing.

### Typo Engine

When a typo triggers, it follows a realistic sequence:

1. Types a wrong key (QWERTY-adjacent to the intended key)
2. Optionally continues 1–2 more characters before "noticing"
3. Pauses briefly, simulating the moment of recognition
4. Backspaces to delete the mistake
5. Types the correct character

### Revision Behavior

Very rarely (~0.3% chance per character), the engine will:

1. Delete the last 3–8 characters
2. Pause as if rethinking the sentence
3. Retype the same text

This mimics the common behavior of re-reading and reconsidering what you just wrote.

## Installation

1. **Download** or clone this repository:
   ```bash
   git clone https://github.com/Leonxlnx/ghost-typer.git
   ```

2. Open **Chrome** and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `ghost-typer` folder

5. The Ghost Typer icon will appear in your extensions toolbar

> **Note:** When you first start typing, Chrome will show a "debugging is being started" notification bar. This is normal — the extension uses the Debugger API to send trusted key events.

## Usage

1. Open a **Google Docs** document
2. Place your **cursor** where you want the text to appear
3. Click the **Ghost Typer** extension icon
4. **Paste your text** into the text area
5. Adjust the settings to your preference
6. Click **Start** and let it run

### Configuration

| Setting | Range | Default | Description |
|---|---|---|---|
| Speed | 30–200 WPM | 80 WPM | Base typing speed in words per minute |
| Variation | 0–50% | 25% | How much the speed fluctuates naturally |
| Mistakes | 0–15% | 3% | Probability of a typo per character |
| Punctuation delay | 0–2000 ms | 400 ms | Extra pause after `.` `,` `!` `?` |
| Paragraph pause | 0.5–10 s | 3.0 s | Delay when hitting Enter |
| Thinking pauses | On / Off | On | Random mid-sentence and between-sentence pauses |

### Tips

- **60–100 WPM** is typical for students writing essays
- **2–5% mistakes** feels natural; above 8% looks sloppy
- **20–35% variation** gives the most human-like inconsistency
- Keep **thinking pauses on** for longer documents — it's the single most important setting for realism

## Privacy

Ghost Typer runs **100% locally** in your browser.

- Does not send your text anywhere
- Does not collect analytics or telemetry
- Does not require any login, account, or internet connection
- Does not inject any tracking scripts
- All source code is open and auditable

## Project Structure

```
ghost-typer/
├── manifest.json      # Chrome extension manifest (MV3)
├── background.js      # Service worker — CDP typing engine
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup controller & state management
├── content.js         # Content script bridge (legacy, not active)
├── injected.js        # Page-context typing (legacy, not active)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── LICENSE
└── README.md
```

> `content.js` and `injected.js` are from the earlier `execCommand`-based architecture (v1.2–v1.3). The current version uses CDP exclusively through `background.js`. They are kept for reference.

## Permissions

Ghost Typer requests only three permissions:

| Permission | Why |
|---|---|
| `activeTab` | Access the current Google Docs tab to type into it |
| `storage` | Save your settings between sessions |
| `debugger` | Use Chrome DevTools Protocol to send trusted keyboard events |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "Add your feature"`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is provided for educational and productivity purposes. Users are responsible for complying with their institution's policies regarding document creation. The authors are not responsible for any misuse of this software.
