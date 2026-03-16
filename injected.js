/* ==============================================
   Ghost Typer — Injected Script (runs in MAIN world)
   
   This script runs in the PAGE context (not the
   extension's isolated world) so it can actually
   interact with Google Docs' internal event system.
   ============================================== */

(function() {
  'use strict';

  // ── State ──
  let _state = 'idle';
  let _text = '';
  let _pos = 0;
  let _cfg = {};
  let _pauseResolve = null;

  // ── QWERTY neighbors ──
  const ADJ = {
    q:'wa',w:'qeas',e:'wrsd',r:'etdf',t:'ryfg',y:'tugh',u:'yihj',i:'uojk',o:'ipkl',p:'ol',
    a:'qwsz',s:'weadzx',d:'ersfxc',f:'rtdgcv',g:'tyfhvb',h:'yugjbn',j:'uihknm',k:'iojlm',l:'opk',
    z:'asx',x:'sdzc',c:'dfxv',v:'fgcb',b:'ghvn',n:'hjbm',m:'jkn',
  };

  // ── Utilities ──
  function gauss(m, s) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sleep(ms) {
    return new Promise(r => {
      if (_state === 'stopped') return r();
      setTimeout(() => _state === 'paused' ? (_pauseResolve = r) : r(), ms);
    });
  }

  function waitPause() {
    if (_state !== 'paused') return Promise.resolve();
    return new Promise(r => { _pauseResolve = r; });
  }

  // ── Google Docs text insertion ──
  // The KEY insight: we must set .textContent on the editable element
  // inside the texteventtarget iframe, then fire an 'input' event.
  // Google Docs reads from that element on input events.

  function getTarget() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (!iframe) return null;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return null;
      const el = doc.querySelector('[contenteditable="true"]');
      if (!el) return null;
      return { doc, el };
    } catch (e) {
      return null;
    }
  }

  function typeChar(char) {
    const t = getTarget();
    if (!t) return false;
    t.el.focus();

    if (char === '\n') {
      // Simulate Enter
      t.el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }));
      // Google Docs also needs the input event for Enter
      t.el.textContent = '\n';
      t.el.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertParagraph', composed: true
      }));
      // Clean up
      t.el.textContent = '';
      return true;
    }

    // For regular characters:
    // 1) Fire keydown
    t.el.dispatchEvent(new KeyboardEvent('keydown', {
      key: char, keyCode: char.charCodeAt(0), which: char.charCodeAt(0),
      bubbles: true, cancelable: true
    }));

    // 2) Set the character as textContent — THIS is what Google Docs reads
    t.el.textContent = char;

    // 3) Fire compositionend-like or input — Google Docs will pick up the textContent
    t.el.dispatchEvent(new InputEvent('input', {
      bubbles: true, data: char, inputType: 'insertText', composed: true
    }));

    // 4) Clear for next char
    t.el.textContent = '';

    // 5) Fire keyup
    t.el.dispatchEvent(new KeyboardEvent('keyup', {
      key: char, keyCode: char.charCodeAt(0), which: char.charCodeAt(0),
      bubbles: true, cancelable: true
    }));

    return true;
  }

  function doBackspace() {
    const t = getTarget();
    if (!t) return false;
    t.el.focus();

    t.el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8,
      bubbles: true, cancelable: true
    }));
    t.el.dispatchEvent(new InputEvent('input', {
      bubbles: true, inputType: 'deleteContentBackward', composed: true
    }));
    t.el.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8,
      bubbles: true, cancelable: true
    }));
    return true;
  }

  // ── Timing ──
  function charDelay() {
    const base = 60000 / (_cfg.speed * 5);
    const vary = _cfg.variation / 100;
    return Math.max(15, Math.min(gauss(base, base * vary), base * 4));
  }

  function punctDelay(c) {
    if (!_cfg.punctDelay) return 0;
    if ('.!?'.includes(c)) return gauss(_cfg.punctDelay, _cfg.punctDelay * 0.3);
    if (c === ',') return gauss(_cfg.punctDelay * 0.5, _cfg.punctDelay * 0.15);
    return 0;
  }

  // ── Typo engine ──
  function adjKey(c) {
    const row = ADJ[c.toLowerCase()];
    if (!row) return c;
    const r = row[Math.floor(Math.random() * row.length)];
    return c === c.toUpperCase() ? r.toUpperCase() : r;
  }

  // ── Main loop ──
  async function run() {
    _state = 'typing';

    // Click editor to restore focus
    const editor = document.querySelector('.kix-appview-editor');
    if (editor) editor.click();
    await sleep(200);

    const t = getTarget();
    if (!t) {
      window.postMessage({ from: 'ghost-typer', action: 'ERROR', error: 'Cannot find Google Docs editor. Click inside your document and try again.' }, '*');
      _state = 'idle';
      return;
    }
    t.el.focus();
    await sleep(gauss(300, 80));

    for (_pos = 0; _pos < _text.length; _pos++) {
      if (_state === 'stopped') break;
      if (_state === 'paused') await waitPause();
      if (_state === 'stopped') break;

      const c = _text[_pos];
      const next = _text[_pos + 1] || '';

      // Typo?
      const doTypo = _cfg.mistakes > 0 && /[a-zA-Z]/.test(c) && Math.random() < _cfg.mistakes / 100;

      if (doTypo) {
        typeChar(adjKey(c));
        await sleep(Math.max(40, gauss(180, 60)));
        if (_state === 'stopped') break;
        // Sometimes 1 extra char before noticing
        const extra = Math.random() < 0.25 ? 1 : 0;
        for (let i = 0; i < extra && _pos + i + 1 < _text.length; i++) {
          typeChar(_text[_pos + i + 1]);
          await sleep(charDelay());
          if (_state === 'stopped') break;
        }
        // Backspace to fix
        for (let i = 0; i < extra + 1; i++) {
          await sleep(gauss(70, 15));
          doBackspace();
        }
        await sleep(gauss(80, 20));
        if (_state === 'stopped') break;
      }

      // Type correct char
      typeChar(c);

      // Delays
      let d = charDelay() + punctDelay(c);
      if (c === '\n') d += gauss(_cfg.paraDelay * 0.6, _cfg.paraDelay * 0.15);
      if (_cfg.thinkingPauses && '.!?'.includes(c) && next === ' ' && Math.random() < 0.25) {
        d += Math.max(400, gauss(_cfg.paraDelay * 0.5, _cfg.paraDelay * 0.15));
      }
      await sleep(d);

      // Progress
      if (_pos % 3 === 0) {
        window.postMessage({ from: 'ghost-typer', action: 'PROGRESS', current: _pos + 1, total: _text.length }, '*');
      }
    }

    if (_state !== 'stopped') {
      window.postMessage({ from: 'ghost-typer', action: 'DONE', total: _text.length }, '*');
      _state = 'idle';
    }
  }

  // ── Incoming commands (from content script via postMessage) ──
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.from !== 'ghost-typer-cs') return;
    const msg = e.data;

    switch (msg.action) {
      case 'START':
        _text = msg.text;
        _cfg = msg.config;
        if (_state === 'typing') {
          _state = 'stopped';
          setTimeout(run, 150);
        } else {
          run();
        }
        break;
      case 'PAUSE':
        _state = 'paused';
        break;
      case 'RESUME':
        _state = 'typing';
        if (_pauseResolve) { _pauseResolve(); _pauseResolve = null; }
        break;
      case 'STOP':
        _state = 'stopped';
        if (_pauseResolve) { _pauseResolve(); _pauseResolve = null; }
        break;
    }
  });

  console.log('👻 Ghost Typer injected into page context');
})();
