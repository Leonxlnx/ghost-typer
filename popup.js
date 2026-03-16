/* Ghost Typer — Popup Controller */
document.addEventListener('DOMContentLoaded', () => {
  // DOM
  const $ = id => document.getElementById(id);
  const text     = $('textInput');
  const chars    = $('charCount');
  const words    = $('wordCount');
  const speed    = $('speed');
  const variation= $('variation');
  const mistakes = $('mistakes');
  const punct    = $('punct');
  const para     = $('para');
  const thinking = $('thinking');
  const startBtn = $('startBtn');
  const pauseBtn = $('pauseBtn');
  const stopBtn  = $('stopBtn');
  const badge    = $('statusBadge');
  const badgeT   = $('statusText');
  const progCard = $('progressCard');
  const barFill  = $('barFill');
  const pctText  = $('pctText');
  const pctChars = $('pctChars');
  const pctEta   = $('pctEta');
  const errBanner= $('errorBanner');
  const errText  = $('errorText');
  const errClose = $('errorClose');

  let state = 'idle';

  // ── Error handling ──
  function showError(msg) {
    errText.textContent = msg;
    errBanner.style.display = 'flex';
  }
  errClose.onclick = () => { errBanner.style.display = 'none'; };

  // ── Load settings ──
  chrome.storage.local.get(['text','speed','variation','mistakes','punctDelay','paraDelay','thinkingPauses'], d => {
    if (d.text) text.value = d.text;
    if (d.speed !== undefined) speed.value = d.speed;
    if (d.variation !== undefined) variation.value = d.variation;
    if (d.mistakes !== undefined) mistakes.value = d.mistakes;
    if (d.punctDelay !== undefined) punct.value = d.punctDelay;
    if (d.paraDelay !== undefined) para.value = d.paraDelay;
    if (d.thinkingPauses !== undefined) thinking.checked = d.thinkingPauses;
    refreshUI();
  });

  // ── UI refresh ──
  function refreshUI() {
    chars.textContent = text.value.length;
    words.textContent = text.value.trim() ? text.value.trim().split(/\s+/).length : 0;
    $('speedVal').textContent   = speed.value + ' WPM';
    $('varVal').textContent     = variation.value + '%';
    $('mistakeVal').textContent = mistakes.value + '%';
    $('punctVal').textContent   = punct.value + ' ms';
    $('paraVal').textContent    = (para.value / 1000).toFixed(1) + ' s';
  }

  text.oninput = () => { refreshUI(); chrome.storage.local.set({ text: text.value }); };

  function save() {
    chrome.storage.local.set({
      speed: +speed.value, variation: +variation.value, mistakes: +mistakes.value,
      punctDelay: +punct.value, paraDelay: +para.value, thinkingPauses: thinking.checked,
    });
  }

  [speed, variation, mistakes, punct, para].forEach(s => {
    s.oninput = () => { refreshUI(); save(); };
  });
  thinking.onchange = save;

  function cfg() {
    return {
      text: text.value, speed: +speed.value, variation: +variation.value,
      mistakes: +mistakes.value, punctDelay: +punct.value,
      paraDelay: +para.value, thinkingPauses: thinking.checked,
    };
  }

  // ── State ──
  function setState(s, label) {
    state = s;
    badge.dataset.status = s;
    badgeT.textContent = label || s[0].toUpperCase() + s.slice(1);

    startBtn.disabled = s === 'typing';
    pauseBtn.disabled = s !== 'typing' && s !== 'paused';
    stopBtn.disabled  = s === 'idle' || s === 'done';

    progCard.style.display = (s === 'typing' || s === 'paused' || s === 'done') ? 'block' : 'none';
    if (s === 'idle') { barFill.style.width = '0%'; pctText.textContent = '0%'; }

    pauseBtn.textContent = s === 'paused' ? 'Resume' : 'Pause';
    startBtn.textContent = s === 'done' ? 'Restart' : 'Start';
    if (s === 'done') startBtn.disabled = false;
  }

  function setProgress(cur, total) {
    const pct = Math.round(cur / total * 100);
    barFill.style.width = pct + '%';
    pctText.textContent = pct + '%';
    pctChars.textContent = cur + ' / ' + total;
    const ms = 60000 / (cfg().speed * 5);
    const sec = Math.round((total - cur) * ms / 1000);
    pctEta.textContent = sec > 60 ? '~' + Math.round(sec / 60) + 'm left' : '~' + sec + 's left';
  }

  // ── Send message to background ──
  async function send(msg) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) {
          showError('Extension error: ' + chrome.runtime.lastError.message);
          setState('idle', 'Idle');
          resolve(false);
        } else if (resp && resp.success === false) {
          showError(resp.error || 'Unknown error');
          setState('idle', 'Idle');
          resolve(false);
        } else {
          errBanner.style.display = 'none';
          resolve(true);
        }
      });
    });
  }

  // ── Buttons ──
  startBtn.onclick = async () => {
    const c = cfg();
    if (!c.text.trim()) { text.focus(); text.style.borderColor = '#ff3b30'; setTimeout(() => text.style.borderColor = '', 1200); return; }
    setState('typing', 'Typing…');
    setProgress(0, c.text.length);
    await send({ action: 'START_TYPING', config: c });
  };

  pauseBtn.onclick = async () => {
    if (state === 'typing')  { setState('paused', 'Paused'); await send({ action: 'PAUSE_TYPING' }); }
    else if (state === 'paused') { setState('typing', 'Typing…'); await send({ action: 'RESUME_TYPING' }); }
  };

  stopBtn.onclick = async () => {
    setState('idle', 'Idle');
    await send({ action: 'STOP_TYPING' });
  };

  // ── Incoming messages ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PROGRESS_UPDATE') setProgress(msg.current, msg.total);
    if (msg.action === 'TYPING_COMPLETE') { setState('done', 'Done ✓'); setProgress(msg.total, msg.total); }
    if (msg.action === 'TYPING_ERROR')    { setState('error', 'Error'); showError(msg.error); }
  });

  // ── Restore state ──
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, r => {
    if (chrome.runtime.lastError || !r) return;
    if (r.state === 'typing') { setState('typing', 'Typing…'); setProgress(r.current, r.total); }
    if (r.state === 'paused') { setState('paused', 'Paused');   setProgress(r.current, r.total); }
  });
});
