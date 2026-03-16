/* =================================================
   Ghost Typer v1.6 — Background Service Worker
   
   Uses Chrome DevTools Protocol (CDP) to dispatch
   REAL trusted keyboard events into Google Docs.
   
   Features:
   - Full special character support
   - Word-level mistakes & corrections
   - Backtracking (delete & retype mid-sentence)
   - Long thinking pauses
   - Markdown → Google Docs formatting
   - Click-blocking overlay during typing
   ================================================= */

// ── QWERTY adjacency for typos ──
const ADJ = {
  q:'wa',w:'qeas',e:'wrsd',r:'etdf',t:'ryfg',y:'tugh',u:'yihj',i:'uojk',o:'ipkl',p:'ol',
  a:'qwsz',s:'weadzx',d:'ersfxc',f:'rtdgcv',g:'tyfhvb',h:'yugjbn',j:'uihknm',k:'iojlm',l:'opk',
  z:'asx',x:'sdzc',c:'dfxv',v:'fgcb',b:'ghvn',n:'hjbm',m:'jkn',
};

// ── Key code mapping for special characters ──
const SPECIAL_KEYS = {
  ' ':  { key: ' ', code: 'Space', keyCode: 32 },
  '!':  { key: '!', code: 'Digit1', keyCode: 49, shift: true },
  '@':  { key: '@', code: 'Digit2', keyCode: 50, shift: true },
  '#':  { key: '#', code: 'Digit3', keyCode: 51, shift: true },
  '$':  { key: '$', code: 'Digit4', keyCode: 52, shift: true },
  '%':  { key: '%', code: 'Digit5', keyCode: 53, shift: true },
  '^':  { key: '^', code: 'Digit6', keyCode: 54, shift: true },
  '&':  { key: '&', code: 'Digit7', keyCode: 55, shift: true },
  '*':  { key: '*', code: 'Digit8', keyCode: 56, shift: true },
  '(':  { key: '(', code: 'Digit9', keyCode: 57, shift: true },
  ')':  { key: ')', code: 'Digit0', keyCode: 48, shift: true },
  '-':  { key: '-', code: 'Minus', keyCode: 189 },
  '_':  { key: '_', code: 'Minus', keyCode: 189, shift: true },
  '=':  { key: '=', code: 'Equal', keyCode: 187 },
  '+':  { key: '+', code: 'Equal', keyCode: 187, shift: true },
  '[':  { key: '[', code: 'BracketLeft', keyCode: 219 },
  ']':  { key: ']', code: 'BracketRight', keyCode: 221 },
  '{':  { key: '{', code: 'BracketLeft', keyCode: 219, shift: true },
  '}':  { key: '}', code: 'BracketRight', keyCode: 221, shift: true },
  '\\': { key: '\\', code: 'Backslash', keyCode: 220 },
  '|':  { key: '|', code: 'Backslash', keyCode: 220, shift: true },
  ';':  { key: ';', code: 'Semicolon', keyCode: 186 },
  ':':  { key: ':', code: 'Semicolon', keyCode: 186, shift: true },
  "'":  { key: "'", code: 'Quote', keyCode: 222 },
  '"':  { key: '"', code: 'Quote', keyCode: 222, shift: true },
  ',':  { key: ',', code: 'Comma', keyCode: 188 },
  '<':  { key: '<', code: 'Comma', keyCode: 188, shift: true },
  '.':  { key: '.', code: 'Period', keyCode: 190 },
  '>':  { key: '>', code: 'Period', keyCode: 190, shift: true },
  '/':  { key: '/', code: 'Slash', keyCode: 191 },
  '?':  { key: '?', code: 'Slash', keyCode: 191, shift: true },
  '`':  { key: '`', code: 'Backquote', keyCode: 192 },
  '~':  { key: '~', code: 'Backquote', keyCode: 192, shift: true },
  '\t': { key: 'Tab', code: 'Tab', keyCode: 9 },
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

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function sleep(ms) {
  return new Promise(r => {
    if (state === 'stopped') return r();
    setTimeout(() => state === 'paused' ? (pauseResolve = r) : r(), Math.max(0, ms));
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

// ── Overlay ──
async function injectOverlay() {
  try {
    await cdp('Runtime.evaluate', {
      expression: `(function(){
        if(document.getElementById('gt-ov'))return;
        var o=document.createElement('div');
        o.id='gt-ov';
        o.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;cursor:not-allowed;background:transparent;';
        var b=document.createElement('div');
        b.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:7px 18px;border-radius:20px;font:13px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;opacity:0.9;z-index:1000000;pointer-events:none;display:flex;align-items:center;gap:6px;';
        b.innerHTML='<span style="font-size:15px;">&#9998;</span> Ghost Typer is typing...';
        document.body.appendChild(o);
        document.body.appendChild(b);
        b.id='gt-badge';
      })()`
    });
  } catch (e) { /* ignore */ }
}

async function removeOverlay() {
  try {
    await cdp('Runtime.evaluate', {
      expression: `document.getElementById('gt-ov')?.remove();document.getElementById('gt-badge')?.remove();`
    });
  } catch (e) { /* ignore */ }
}

// ── Key press via CDP ──
function getKeyInfo(char) {
  // Special chars
  if (SPECIAL_KEYS[char]) return SPECIAL_KEYS[char];
  
  // Letters
  if (/[a-zA-Z]/.test(char)) {
    const upper = char === char.toUpperCase() && char !== char.toLowerCase();
    return {
      key: char,
      code: `Key${char.toUpperCase()}`,
      keyCode: char.toUpperCase().charCodeAt(0),
      shift: upper,
    };
  }
  
  // Digits
  if (/[0-9]/.test(char)) {
    return {
      key: char,
      code: `Digit${char}`,
      keyCode: char.charCodeAt(0),
    };
  }
  
  // Fallback for any other character (unicode, etc.)
  return {
    key: char,
    code: '',
    keyCode: 0,
  };
}

async function pressKey(char) {
  if (char === '\n') {
    await cdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key: 'Enter', code: 'Enter',
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'char', key: 'Enter', code: 'Enter', text: '\r',
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Enter', code: 'Enter',
      windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    return;
  }

  const info = getKeyInfo(char);
  const modifiers = info.shift ? 8 : 0; // 8 = shift

  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: info.key,
    code: info.code,
    windowsVirtualKeyCode: info.keyCode || char.charCodeAt(0),
    nativeVirtualKeyCode: info.keyCode || char.charCodeAt(0),
    modifiers,
  });

  await cdp('Input.dispatchKeyEvent', {
    type: 'char',
    key: info.key,
    code: info.code,
    text: char,
    unmodifiedText: char,
    windowsVirtualKeyCode: char.charCodeAt(0),
    nativeVirtualKeyCode: char.charCodeAt(0),
    modifiers,
  });

  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: info.key,
    code: info.code,
    windowsVirtualKeyCode: info.keyCode || char.charCodeAt(0),
    nativeVirtualKeyCode: info.keyCode || char.charCodeAt(0),
    modifiers: 0,
  });
}

async function pressBackspace() {
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'Backspace', code: 'Backspace',
    windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
  });
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Backspace', code: 'Backspace',
    windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
  });
}

// Ctrl+B, Ctrl+I, Ctrl+U for formatting
async function pressCtrl(key) {
  const code = `Key${key.toUpperCase()}`;
  const kc = key.toUpperCase().charCodeAt(0);
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key, code,
    windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc,
    modifiers: 2, // ctrl
  });
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code,
    windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc,
    modifiers: 0,
  });
}

// ── Timing ──
function charDelay(cfg) {
  const base = 60000 / (cfg.speed * 5);
  const vary = cfg.variation / 100;
  return Math.max(20, Math.min(gauss(base, base * vary), base * 4));
}

function punctDelay(c, cfg) {
  if (!cfg.punctDelay) return 0;
  if ('.!?'.includes(c)) return gauss(cfg.punctDelay, cfg.punctDelay * 0.3);
  if (',;:'.includes(c)) return gauss(cfg.punctDelay * 0.5, cfg.punctDelay * 0.15);
  return 0;
}

function adjKey(c) {
  const row = ADJ[c.toLowerCase()];
  if (!row) return c;
  const r = row[Math.floor(Math.random() * row.length)];
  return c === c.toUpperCase() ? r.toUpperCase() : r;
}

// ── Markdown → formatting commands ──
// Strips markdown and applies Google Docs formatting via Ctrl shortcuts
function parseMarkdown(text) {
  const segments = [];
  let i = 0;

  while (i < text.length) {
    // Bold: **text** or __text__
    let m = text.slice(i).match(/^(\*\*|__)(.+?)\1/);
    if (m) {
      segments.push({ text: m[2], bold: true });
      i += m[0].length;
      continue;
    }
    // Italic: *text* or _text_ (single)
    m = text.slice(i).match(/^(\*|_)(.+?)\1/);
    if (m) {
      segments.push({ text: m[2], italic: true });
      i += m[0].length;
      continue;
    }
    // Headers: # text → bold + newline
    m = text.slice(i).match(/^(#{1,6})\s+(.+?)(\n|$)/);
    if (m && (i === 0 || text[i - 1] === '\n')) {
      segments.push({ text: m[2], bold: true });
      segments.push({ text: '\n' });
      i += m[0].length;
      continue;
    }
    // Bullet: - text or * text (at line start)
    m = text.slice(i).match(/^[-*]\s+/);
    if (m && (i === 0 || text[i - 1] === '\n')) {
      segments.push({ text: '• ' });
      i += m[0].length;
      continue;
    }
    // Plain char
    segments.push({ text: text[i] });
    i++;
  }

  return segments;
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

  // Block clicks
  await injectOverlay();

  // Parse markdown
  const segments = parseMarkdown(cfg.text);

  // Flatten to get total char count for progress
  const totalChars = segments.reduce((a, s) => a + s.text.length, 0);
  let typed = 0;

  // Initial delay
  await sleep(gauss(500, 120));

  try {
    for (let si = 0; si < segments.length; si++) {
      if (state === 'stopped') break;

      const seg = segments[si];

      // Toggle formatting
      if (seg.bold) await pressCtrl('b');
      if (seg.italic) await pressCtrl('i');
      if (seg.bold || seg.italic) await sleep(gauss(50, 15));

      const chars = seg.text;

      for (let ci = 0; ci < chars.length; ci++) {
        if (state === 'stopped') break;
        if (state === 'paused') await waitPause();
        if (state === 'stopped') break;

        const c = chars[ci];
        const next = chars[ci + 1] || '';

        // =============================================
        // HUMAN BEHAVIOR: Word-level mistake
        // Sometimes type a word wrong, delete it, retype
        // =============================================
        if (cfg.mistakes > 0 && c === ' ' && Math.random() < cfg.mistakes / 600) {
          // Look ahead for the next word
          const rest = chars.slice(ci + 1);
          const nextWord = rest.match(/^(\S+)/);
          if (nextWord && nextWord[1].length >= 3) {
            // Type space first
            await pressKey(' ');
            typed++;
            await sleep(charDelay(cfg));

            // Type the word wrong (scramble some letters)
            const word = nextWord[1];
            const wrong = scrambleWord(word);
            for (const ch of wrong) {
              if (state === 'stopped') break;
              await pressKey(ch);
              await sleep(charDelay(cfg));
            }

            // Pause — "notice" the mistake
            await sleep(gauss(600, 200));

            // Delete the wrong word
            for (let d = 0; d < wrong.length; d++) {
              await pressBackspace();
              await sleep(gauss(45, 12));
            }

            await sleep(gauss(200, 60));

            // Now type the word correctly
            for (const ch of word) {
              if (state === 'stopped') break;
              await pressKey(ch);
              typed++;
              await sleep(charDelay(cfg));
            }
            ci += word.length; // skip the word we just typed
            continue;
          }
        }

        // =============================================
        // HUMAN BEHAVIOR: Character-level typo
        // =============================================
        const doTypo = cfg.mistakes > 0 && /[a-zA-Z]/.test(c) && Math.random() < cfg.mistakes / 100;

        if (doTypo) {
          await pressKey(adjKey(c));
          await sleep(Math.max(40, gauss(150, 50)));
          if (state === 'stopped') break;

          // Sometimes type 1-2 extra chars before noticing
          const extra = Math.random() < 0.3 ? (Math.random() < 0.5 ? 2 : 1) : 0;
          for (let x = 0; x < extra && ci + x + 1 < chars.length; x++) {
            await pressKey(chars[ci + x + 1]);
            await sleep(charDelay(cfg));
            if (state === 'stopped') break;
          }

          // Pause — "notice" the error
          await sleep(gauss(250, 80));

          // Delete everything back
          for (let x = 0; x < extra + 1; x++) {
            await sleep(gauss(55, 15));
            await pressBackspace();
          }
          await sleep(gauss(120, 30));
          if (state === 'stopped') break;
        }

        // =============================================
        // HUMAN BEHAVIOR: Backtrack & rethink
        // Delete a few chars, pause, then retype them
        // =============================================
        if (cfg.mistakes > 0 && ci > 3 && Math.random() < cfg.mistakes / 2000) {
          const deleteCount = rand(2, 4);
          // Delete
          for (let d = 0; d < deleteCount; d++) {
            await pressBackspace();
            typed--;
            await sleep(gauss(55, 15));
          }
          // Long think
          await sleep(gauss(1200, 400));
          // Retype (go back and re-type the deleted chars)
          const start = Math.max(0, ci - deleteCount);
          for (let r = start; r < ci; r++) {
            if (state === 'stopped') break;
            await pressKey(chars[r]);
            typed++;
            await sleep(charDelay(cfg));
          }
          await sleep(gauss(100, 30));
        }

        // =============================================
        // Type the correct character
        // =============================================
        await pressKey(c);
        typed++;

        // =============================================
        // DELAYS
        // =============================================
        let d = charDelay(cfg) + punctDelay(c, cfg);

        // After newline
        if (c === '\n') {
          d += gauss(cfg.paraDelay * 0.6, cfg.paraDelay * 0.15);
        }

        // Long thinking pause after sentence-ending punctuation
        if (cfg.thinkingPauses && '.!?'.includes(c) && next === ' ') {
          if (Math.random() < 0.3) {
            d += gauss(cfg.paraDelay * 0.8, cfg.paraDelay * 0.25);
          }
        }

        // Random long pause mid-sentence (like thinking about words)
        if (cfg.thinkingPauses && c === ' ' && Math.random() < 0.04) {
          d += gauss(1500, 500);
        }

        // Very long pause once in a while (checking something)
        if (cfg.thinkingPauses && Math.random() < 0.005) {
          d += gauss(3000, 800);
        }

        await sleep(d);

        // Progress
        if (typed % 5 === 0) {
          broadcast({ action: 'PROGRESS_UPDATE', current: typed, total: totalChars });
        }
      }

      // Turn off formatting
      if (seg.bold) { await pressCtrl('b'); await sleep(gauss(30, 10)); }
      if (seg.italic) { await pressCtrl('i'); await sleep(gauss(30, 10)); }
    }

    if (state !== 'stopped') {
      broadcast({ action: 'TYPING_COMPLETE', total: totalChars });
    }
  } catch (e) {
    broadcast({ action: 'TYPING_ERROR', error: e.message });
  } finally {
    state = 'idle';
    await removeOverlay();
    await detachDebugger();
  }
}

// Scramble a word for word-level mistakes
function scrambleWord(word) {
  const arr = word.split('');
  const strategies = ['swap', 'drop', 'wrong'];
  const strategy = strategies[Math.floor(Math.random() * strategies.length)];

  if (strategy === 'swap' && arr.length > 2) {
    // Swap two adjacent letters
    const i = rand(0, arr.length - 2);
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  } else if (strategy === 'drop' && arr.length > 3) {
    // Drop a letter
    arr.splice(rand(1, arr.length - 2), 1);
  } else {
    // Replace a letter with adjacent key
    const i = rand(0, arr.length - 1);
    arr[i] = adjKey(arr[i]);
  }
  return arr.join('');
}

// ── Broadcast ──
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
      return true;
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

// Clean up on debugger detach
chrome.debugger.onDetach.addListener(() => {
  debuggerAttached = false;
  if (state === 'typing' || state === 'paused') {
    state = 'stopped';
    broadcast({ action: 'TYPING_ERROR', error: 'Debugger detached — typing stopped.' });
  }
});
