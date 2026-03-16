/* ==============================================
   Ghost Typer — Injected Script (MAIN WORLD)
   
   This runs in the PAGE context so it can interact
   with Google Docs' internal editor via execCommand.
   ============================================== */

(function() {
  'use strict';

  // Avoid double-loading
  if (window.__ghostTyperInjected) return;
  window.__ghostTyperInjected = true;

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

  // ── Google Docs Interaction ──
  // Strategy: Get the iframe's document, focus the contenteditable,
  // then use execCommand('insertText') which MUST run in main world.

  function getIframeTarget() {
    const iframe = document.querySelector('.docs-texteventtarget-iframe');
    if (!iframe) {
      console.warn('👻 No .docs-texteventtarget-iframe found');
      return null;
    }
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) {
        console.warn('👻 Cannot access iframe contentDocument');
        return null;
      }
      const el = doc.querySelector('[contenteditable="true"]');
      if (!el) {
        console.warn('👻 No contenteditable element inside iframe');
        return null;
      }
      return { doc, el, win: iframe.contentWindow };
    } catch (e) {
      console.warn('👻 Iframe access error:', e.message);
      return null;
    }
  }

  function focusEditor() {
    // Click the editor area to make sure Google Docs has focus
    const pages = document.querySelectorAll('.kix-page-content-wrapper');
    if (pages.length > 0) {
      const page = pages[0];
      const rect = page.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + 100;
      
      page.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: x, clientY: y
      }));
      page.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: x, clientY: y
      }));
      page.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: x, clientY: y
      }));
    }
  }

  /**
   * Insert a single character using execCommand('insertText').
   * This works because we're running in the MAIN world,
   * not in Chrome's extension isolated world.
   */
  function typeChar(char) {
    const t = getIframeTarget();
    if (!t) return false;

    // Make sure the editable element has focus
    t.el.focus();

    if (char === '\n') {
      // For Enter, we need to simulate the key event
      // because execCommand doesn't handle newlines well in Google Docs
      const enterProps = {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      };
      t.el.dispatchEvent(new KeyboardEvent('keydown', enterProps));
      t.doc.execCommand('insertParagraph', false, null);
      t.el.dispatchEvent(new KeyboardEvent('keyup', enterProps));
      return true;
    }

    // The magic line: execCommand in MAIN world context
    const success = t.doc.execCommand('insertText', false, char);
    
    if (!success) {
      console.warn('👻 execCommand failed for char:', char);
      
      // Fallback: try compositionstart → textContent → compositionend
      t.el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      t.el.dispatchEvent(new CompositionEvent('compositionupdate', { data: char, bubbles: true }));
      t.el.dispatchEvent(new CompositionEvent('compositionend', { data: char, bubbles: true }));
    }

    return true;
  }

  function doBackspace() {
    const t = getIframeTarget();
    if (!t) return false;
    t.el.focus();

    const props = {
      key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8,
      bubbles: true, cancelable: true
    };
    t.el.dispatchEvent(new KeyboardEvent('keydown', props));
    t.doc.execCommand('delete', false, null);
    t.el.dispatchEvent(new KeyboardEvent('keyup', props));
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
    console.log('👻 Ghost Typer: Starting to type', _text.length, 'characters');

    // Step 1: Focus the editor
    focusEditor();
    await sleep(400);

    // Step 2: Verify iframe target
    const t = getIframeTarget();
    if (!t) {
      console.error('👻 Ghost Typer: Cannot find Google Docs iframe!');
      // Log debug info
      const iframes = document.querySelectorAll('iframe');
      console.log('👻 Found', iframes.length, 'iframes:');
      iframes.forEach((f, i) => console.log(`  [${i}]`, f.className || '(no class)', f.src?.substring(0, 50)));
      
      window.postMessage({ from: 'ghost-typer', action: 'ERROR', error: 'Cannot find Google Docs editor. Click inside your document and try again.' }, '*');
      _state = 'idle';
      return;
    }

    // Step 3: Focus the contenteditable
    t.el.focus();
    console.log('👻 Ghost Typer: Editor found, element:', t.el.tagName, 'contentEditable:', t.el.contentEditable);

    // Quick test: try inserting a test character and deleting it
    const testResult = t.doc.execCommand('insertText', false, '.');
    console.log('👻 Ghost Typer: execCommand test result:', testResult);
    if (testResult) {
      // Delete the test character
      t.doc.execCommand('delete', false, null);
      console.log('👻 Ghost Typer: Test passed! execCommand works from main world.');
    } else {
      console.warn('👻 Ghost Typer: execCommand returned false - may not work');
    }

    await sleep(gauss(300, 80));

    // Main typing loop
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

        const extra = Math.random() < 0.25 ? 1 : 0;
        for (let i = 0; i < extra && _pos + i + 1 < _text.length; i++) {
          typeChar(_text[_pos + i + 1]);
          await sleep(charDelay());
          if (_state === 'stopped') break;
        }

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

      // Progress every 3 chars
      if (_pos % 3 === 0) {
        window.postMessage({ from: 'ghost-typer', action: 'PROGRESS', current: _pos + 1, total: _text.length }, '*');
      }
    }

    if (_state !== 'stopped') {
      console.log('👻 Ghost Typer: Typing complete!');
      window.postMessage({ from: 'ghost-typer', action: 'DONE', total: _text.length }, '*');
      _state = 'idle';
    }
  }

  // ── Message listener ──
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.from !== 'ghost-typer-cs') return;

    switch (e.data.action) {
      case 'START':
        console.log('👻 Ghost Typer: Received START command');
        _text = e.data.text;
        _cfg = e.data.config;
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

  console.log('👻 Ghost Typer: injected into page context (MAIN world)');
})();
