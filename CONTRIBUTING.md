# Contributing to Ghost Typer

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ghost-typer.git
   ```
3. Load the extension in Chrome via `chrome://extensions` → Developer mode → Load unpacked

## Development

Ghost Typer is a vanilla JavaScript Chrome extension (Manifest V3) with no build step or dependencies. Edit the files directly and reload the extension in Chrome to test.

### Architecture

The extension uses the **Chrome DevTools Protocol** to send trusted keyboard events:

- `popup.html/css/js` — The extension popup UI and user controls
- `background.js` — The core typing engine (service worker). Attaches to Chrome's debugger, sends CDP `Input.dispatchKeyEvent` commands
- `manifest.json` — Extension configuration

### Testing Changes

1. Make your edits
2. Go to `chrome://extensions`
3. Click the reload button on the Ghost Typer card
4. Open a Google Docs document and test

## Pull Requests

- Keep PRs focused on a single change
- Write clear commit messages
- Test your changes on an actual Google Docs document before submitting
- Update the README if you're adding user-facing features

## Reporting Bugs

Open an [issue](https://github.com/Leonxlnx/ghost-typer/issues) with:

- What you expected to happen
- What actually happened
- Chrome version
- Steps to reproduce

## Code Style

- Vanilla JavaScript, no frameworks or build tools
- Use `const`/`let`, never `var`
- Keep functions small and focused
- Comment non-obvious logic

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
