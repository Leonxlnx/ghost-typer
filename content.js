/* ==============================================
   Ghost Typer — Content Script (Bridge)
   
   This runs in Chrome's ISOLATED world. It can
   talk to the extension (chrome.runtime) but
   cannot interact with Google Docs' event system.
   
   It injects injected.js into the PAGE's main
   world, then relays messages between the
   extension popup and the injected script.
   ============================================== */

(() => {
  'use strict';

  // ── Inject the main-world script ──
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // ── Relay: chrome.runtime → window.postMessage ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case 'START_TYPING':
        window.postMessage({
          from: 'ghost-typer-cs',
          action: 'START',
          text: msg.config.text,
          config: msg.config,
        }, '*');
        sendResponse({ success: true });
        break;

      case 'PAUSE_TYPING':
        window.postMessage({ from: 'ghost-typer-cs', action: 'PAUSE' }, '*');
        sendResponse({ success: true });
        break;

      case 'RESUME_TYPING':
        window.postMessage({ from: 'ghost-typer-cs', action: 'RESUME' }, '*');
        sendResponse({ success: true });
        break;

      case 'STOP_TYPING':
        window.postMessage({ from: 'ghost-typer-cs', action: 'STOP' }, '*');
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // ── Relay: window.postMessage → chrome.runtime ──
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.from !== 'ghost-typer') return;
    const msg = e.data;

    switch (msg.action) {
      case 'PROGRESS':
        chrome.runtime.sendMessage({ action: 'PROGRESS_UPDATE', current: msg.current, total: msg.total });
        break;
      case 'DONE':
        chrome.runtime.sendMessage({ action: 'TYPING_COMPLETE', total: msg.total });
        break;
      case 'ERROR':
        chrome.runtime.sendMessage({ action: 'TYPING_ERROR', error: msg.error });
        break;
    }
  });

  console.log('👻 Ghost Typer content script loaded (bridge mode)');
})();
