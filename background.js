/* =================================================
   Ghost Typer — Background Service Worker
   
   Uses Chrome DevTools Protocol (CDP) to dispatch
   REAL trusted keyboard events. This is the only
   reliable method for Google Docs' canvas editor.
   ================================================= */

// ── QWERTY adjacency for typos ──
const ADJ = {
  q:'wa',w:'qeas',e:'wrsd',r:'etdf',t:'ryfg',y:'tugh',u:'yihj',i:'uojk',o:'ipkl',p:'ol',
  a:'qwsz',s:'weadzx',d:'ersfxc',f:'rtdgcv',g:'tyfhvb',h:'yugjbn',j:'uihknm',k:'iojlm',l:'opk',
  z:'asx',x:'sdzc',c:'dfxv',v:'fgcb',b:'ghvn',n:'hjbm',m:'jkn',
};

// ── State ──
let state = 'idle';
let tabId = null;
let debuggerAttached = false;
let pauseResolve = null;

// ── Utilities ──
function gauss(m, s) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sleep(ms) {
  return new Promise(r => {
    if (state === 'stopped') return r();
    setTimeout(() => state === 'paused' ? (pauseResolve = r) : r(), ms);
  });
}

function waitPause() {
  if (state !== 'paused') return Promise.resolve();
  return new Promise(r => { pauseResolve = r; });
}

// ── CDP helpers ──
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

async function attachDebugger(tid) {
  tabId = tid;
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        debuggerAttached = true;
        resolve();
      }
    });
  });
}

async function detachDebugger() {
  if (!debuggerAttached) return;
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      debuggerAttached = false;
      resolve();
    });
  });
}

// ── Overlay to block accidental clicks ──
async function injectOverlay() {
  try {
    await cdp('Runtime.evaluate', {
      expression: `
        (function() {
          if (document.getElementById('ghost-typer-overlay')) return;
          const ov = document.createElement('div');
          ov.id = 'ghost-typer-overlay';
          ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;cursor:not-allowed;background:rgba(0,0,0,0.02);display:flex;align-items:flex-start;justify-content:center;padding-top:8px;';
          ov.innerHTML = '<div style="background:#1d1d1f;color:#fff;padding:6px 16px;border-radius:20px;font:13px/1 -apple-system,sans-serif;opacity:0.85;pointer-events:none;">👻 Ghost Typer is typing…</div>';
          document.body.appendChild(ov);
        })()
      `
    });
  } catch (e) { /* ignore */ }
}

async function removeOverlay() {
  try {
    await cdp('Runtime.evaluate', {
      expression: `document.getElementById('ghost-typer-overlay')?.remove()`
    });
  } catch (e) { /* ignore */ }
}

// ── Key press via CDP ──
// This generates REAL trusted keyboard events
async function pressKey(char) {
  if (char === '\n') {
    await cdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    return;
  }

  const keyCode = char.toUpperCase().charCodeAt(0);
  const code = /[a-zA-Z]/.test(char) ? `Key${char.toUpperCase()}` :
               /[0-9]/.test(char) ? `Digit${char}` : '';

  // rawKeyDown (does NOT insert text — just the key event)
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: char,
    code: code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });

  // char event
  await cdp('Input.dispatchKeyEvent', {
    type: 'char',
    key: char,
    code: code,
    text: char,
    unmodifiedText: char,
    windowsVirtualKeyCode: char.charCodeAt(0),
    nativeVirtualKeyCode: char.charCodeAt(0),
  });

  // keyUp
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: char,
    code: code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

async function pressBackspace() {
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
}

// ── Timing ──
function charDelay(cfg) {
  const base = 60000 / (cfg.speed * 5);
  const vary = cfg.variation / 100;
  return Math.max(15, Math.min(gauss(base, base * vary), base * 4));
}

function punctDelay(c, cfg) {
  if (!cfg.punctDelay) return 0;
  if ('.!?'.includes(c)) return gauss(cfg.punctDelay, cfg.punctDelay * 0.3);
  if (c === ',') return gauss(cfg.punctDelay * 0.5, cfg.punctDelay * 0.15);
  return 0;
}

function adjKey(c) {
  const row = ADJ[c.toLowerCase()];
  if (!row) return c;
  const r = row[Math.floor(Math.random() * row.length)];
  return c === c.toUpperCase() ? r.toUpperCase() : r;
}

// ── Main typing loop ──
async function startTyping(tid, cfg) {
  state = 'typing';

  try {
    await attachDebugger(tid);
  } catch (e) {
    broadcast({ action: 'TYPING_ERROR', error: 'Could not attach debugger: ' + e.message });
    state = 'idle';
    return;
  }

  const text = cfg.text;

  // Block accidental clicks
  await injectOverlay();

  // Small initial delay
  await sleep(gauss(400, 100));

  try {
    for (let pos = 0; pos < text.length; pos++) {
      if (state === 'stopped') break;
      if (state === 'paused') await waitPause();
      if (state === 'stopped') break;

      const c = text[pos];
      const next = text[pos + 1] || '';

      // Typo?
      const doTypo = cfg.mistakes > 0 && /[a-zA-Z]/.test(c) && Math.random() < cfg.mistakes / 100;

      if (doTypo) {
        await pressKey(adjKey(c));
        await sleep(Math.max(40, gauss(180, 60)));
        if (state === 'stopped') break;

        const extra = Math.random() < 0.25 ? 1 : 0;
        for (let i = 0; i < extra && pos + i + 1 < text.length; i++) {
          await pressKey(text[pos + i + 1]);
          await sleep(charDelay(cfg));
          if (state === 'stopped') break;
        }

        for (let i = 0; i < extra + 1; i++) {
          await sleep(gauss(70, 15));
          await pressBackspace();
        }
        await sleep(gauss(80, 20));
        if (state === 'stopped') break;
      }

      // Correct char
      await pressKey(c);

      // Delays
      let d = charDelay(cfg) + punctDelay(c, cfg);
      if (c === '\n') d += gauss(cfg.paraDelay * 0.6, cfg.paraDelay * 0.15);
      if (cfg.thinkingPauses && '.!?'.includes(c) && next === ' ' && Math.random() < 0.25) {
        d += Math.max(400, gauss(cfg.paraDelay * 0.5, cfg.paraDelay * 0.15));
      }
      await sleep(d);

      // Progress
      if (pos % 3 === 0) {
        broadcast({ action: 'PROGRESS_UPDATE', current: pos + 1, total: text.length });
      }
    }

    if (state !== 'stopped') {
      broadcast({ action: 'TYPING_COMPLETE', total: text.length });
    }
  } catch (e) {
    broadcast({ action: 'TYPING_ERROR', error: e.message });
  } finally {
    state = 'idle';
    await removeOverlay();
    await detachDebugger();
  }
}

// ── Broadcast to popup ──
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'START_TYPING': {
      const cfg = msg.config;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          sendResponse({ success: false, error: 'No active tab' });
          return;
        }
        if (!tabs[0].url?.includes('docs.google.com/document')) {
          sendResponse({ success: false, error: 'Not a Google Docs page' });
          return;
        }
        if (state === 'typing') {
          state = 'stopped';
          setTimeout(() => startTyping(tabs[0].id, cfg), 200);
        } else {
          startTyping(tabs[0].id, cfg);
        }
        sendResponse({ success: true });
      });
      return true; // async response
    }

    case 'PAUSE_TYPING':
      state = 'paused';
      sendResponse({ success: true });
      break;

    case 'RESUME_TYPING':
      state = 'typing';
      if (pauseResolve) { pauseResolve(); pauseResolve = null; }
      sendResponse({ success: true });
      break;

    case 'STOP_TYPING':
      state = 'stopped';
      if (pauseResolve) { pauseResolve(); pauseResolve = null; }
      removeOverlay();
      detachDebugger();
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({ state });
      break;
  }
  return true;
});

// Clean up debugger on tab close/navigate
chrome.debugger.onDetach.addListener(() => {
  debuggerAttached = false;
  if (state === 'typing' || state === 'paused') {
    state = 'stopped';
    broadcast({ action: 'TYPING_ERROR', error: 'Debugger detached — typing stopped.' });
  }
});
