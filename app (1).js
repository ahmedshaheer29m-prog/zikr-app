'use strict';

const STORAGE_KEYS = {
  COUNT: 'zikr_count', ROUNDS: 'zikr_rounds', TARGET: 'zikr_target',
  PHRASE_IDX: 'zikr_phrase_idx', HISTORY: 'zikr_history',
  VIBRATION: 'zikr_vibration', SOUND: 'zikr_sound',
  AUTOSAVE: 'zikr_autosave', WELCOMED: 'zikr_welcomed',
};

const PHRASES = [
  { arabic: 'سُبْحَانَ اللهِ', latin: 'Subhanallah', meaning: 'Glory be to Allah' },
  { arabic: 'الْحَمْدُ لِلهِ', latin: 'Alhamdulillah', meaning: 'All praise be to Allah' },
  { arabic: 'اللهُ أَكْبَرُ', latin: 'Allahu Akbar', meaning: 'Allah is the Greatest' },
  { arabic: 'لَا إِلَٰهَ إِلَّا اللهُ', latin: 'La ilaha illallah', meaning: 'There is no god but Allah' },
  { arabic: 'أَسْتَغْفِرُ اللهَ', latin: 'Astaghfirullah', meaning: 'I seek forgiveness from Allah' },
  { arabic: 'صَلَّى اللهُ عَلَيْهِ', latin: 'Salawat', meaning: 'Blessings upon the Prophet' },
];

const state = {
  count: 0, rounds: 0, target: 33, phraseIndex: 0,
  vibration: true, sound: false, autosave: true, activeTab: 'counter',
};

const $ = (id) => document.getElementById(id);

const dom = {
  welcomeScreen: $('welcome-screen'), counterBtn: $('counter-btn'),
  counterValue: $('counter-value'), counterRipple: $('counter-ripple'),
  progressBar: $('progress-bar'), progressBarAria: $('progress-bar-aria'),
  roundsDisplay: $('rounds-display'), targetDisplay: $('target-display'),
  phraseArabic: $('current-phrase-arabic'), phraseLatin: $('current-phrase-latin'),
  undoBtn: $('undo-btn'), resetBtn: $('reset-btn'), nextPhraseBtn: $('next-phrase-btn'),
  historyList: $('history-list'), clearHistoryBtn: $('clear-history-btn'),
  vibrationToggle: $('vibration-toggle'), soundToggle: $('sound-toggle'),
  autosaveToggle: $('autosave-toggle'), customTarget: $('custom-target'),
  setCustomTargetBtn: $('set-custom-target-btn'), targetBadge: $('target-badge'),
  phraseList: $('phrase-list'), milestoneToast: $('milestone-toast'),
  settingsShortcut: $('settings-shortcut-btn'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  presetBtns: document.querySelectorAll('.preset-btn'),
};

/* ─── Audio ──────────────────────────────────────── */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playClick() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
  } catch (_) {}
}

/* ─── Vibration (with unlock fix for Android) ────── */
let vibrationUnlocked = false;

function unlockVibration() {
  if (!vibrationUnlocked && navigator.vibrate) {
    navigator.vibrate(1);
    vibrationUnlocked = true;
  }
}

function vibrate(pattern) {
  if (state.vibration && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

/* ─── Storage ────────────────────────────────────── */
function loadState() {
  const stored = (key, fallback) => {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  };
  state.count = stored(STORAGE_KEYS.COUNT, 0);
  state.rounds = stored(STORAGE_KEYS.ROUNDS, 0);
  state.target = stored(STORAGE_KEYS.TARGET, 33);
  state.phraseIndex = stored(STORAGE_KEYS.PHRASE_IDX, 0);
  state.vibration = stored(STORAGE_KEYS.VIBRATION, true);
  state.sound = stored(STORAGE_KEYS.SOUND, false);
  state.autosave = stored(STORAGE_KEYS.AUTOSAVE, true);
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.COUNT, JSON.stringify(state.count));
  localStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(state.rounds));
  localStorage.setItem(STORAGE_KEYS.TARGET, JSON.stringify(state.target));
  localStorage.setItem(STORAGE_KEYS.PHRASE_IDX, JSON.stringify(state.phraseIndex));
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.VIBRATION, JSON.stringify(state.vibration));
  localStorage.setItem(STORAGE_KEYS.SOUND, JSON.stringify(state.sound));
  localStorage.setItem(STORAGE_KEYS.AUTOSAVE, JSON.stringify(state.autosave));
  localStorage.setItem(STORAGE_KEYS.TARGET, JSON.stringify(state.target));
}

/* ─── History ────────────────────────────────────── */
function getHistory() {
  const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
  return raw ? JSON.parse(raw) : [];
}
function saveHistory(history) { localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history)); }

function addHistoryEntry(phrase, count, rounds) {
  const history = getHistory();
  history.unshift({ phrase: phrase.arabic, latin: phrase.latin, count, rounds, target: state.target, timestamp: Date.now() });
  if (history.length > 100) history.length = 100;
  saveHistory(history);
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ─── Render ─────────────────────────────────────── */
function renderCounter() {
  dom.counterValue.textContent = state.count;
  const pct = state.target > 0 ? Math.min((state.count / state.target) * 100, 100) : 0;
  dom.progressBar.style.width = pct + '%';
  dom.progressBarAria.setAttribute('aria-valuenow', Math.round(pct));
  const r = state.rounds;
  dom.roundsDisplay.textContent = r === 1 ? '1 round' : `${r} rounds`;
  dom.targetDisplay.textContent = `Target: ${state.target}`;
}

function renderPhrase(animate = false) {
  const phrase = PHRASES[state.phraseIndex];
  if (animate) {
    dom.phraseArabic.classList.add('changing');
    dom.phraseLatin.classList.add('changing');
    setTimeout(() => {
      dom.phraseArabic.textContent = phrase.arabic;
      dom.phraseLatin.textContent = phrase.latin;
      dom.phraseArabic.classList.remove('changing');
      dom.phraseLatin.classList.remove('changing');
    }, 200);
  } else {
    dom.phraseArabic.textContent = phrase.arabic;
    dom.phraseLatin.textContent = phrase.latin;
  }
}

function renderHistory() {
  const history = getHistory();
  dom.historyList.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">📿</div><p>No sessions yet.<br/>Start counting to track your progress.</p>';
    dom.historyList.appendChild(empty);
    return;
  }
  history.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.style.animationDelay = `${i * 30}ms`;
    el.innerHTML = `
      <div class="history-item-top">
        <span class="history-item-phrase">${item.phrase}</span>
        <span class="history-item-count">${item.count}</span>
      </div>
      <div class="history-item-meta">
        <span class="history-item-rounds">${item.latin} · ${item.rounds} round${item.rounds !== 1 ? 's' : ''}</span>
        <span>${formatTimestamp(item.timestamp)}</span>
      </div>`;
    dom.historyList.appendChild(el);
  });
}

function renderSettings() {
  dom.vibrationToggle.checked = state.vibration;
  dom.soundToggle.checked = state.sound;
  dom.autosaveToggle.checked = state.autosave;
  dom.targetBadge.textContent = state.target;
  dom.presetBtns.forEach(btn => btn.classList.toggle('active', Number(btn.dataset.value) === state.target));
  renderPhraseList();
}

function renderPhraseList() {
  dom.phraseList.innerHTML = '';
  PHRASES.forEach((phrase, i) => {
    const el = document.createElement('div');
    el.className = 'phrase-item' + (i === state.phraseIndex ? ' selected' : '');
    el.setAttribute('role', 'radio');
    el.setAttribute('aria-checked', i === state.phraseIndex ? 'true' : 'false');
    el.setAttribute('tabindex', '0');
    el.innerHTML = `
      <div class="phrase-item-text">
        <div class="phrase-item-arabic">${phrase.arabic}</div>
        <div class="phrase-item-latin">${phrase.latin}</div>
      </div>
      <div class="phrase-check"></div>`;
    el.addEventListener('click', () => selectPhrase(i));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPhrase(i); } });
    dom.phraseList.appendChild(el);
  });
}

function selectPhrase(index) {
  if (index === state.phraseIndex) return;
  if (state.autosave && state.count > 0) addHistoryEntry(PHRASES[state.phraseIndex], state.count, state.rounds);
  state.phraseIndex = index; state.count = 0; state.rounds = 0;
  saveState(); renderPhrase(true); renderCounter(); renderPhraseList();
}

/* ─── Toast ──────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, duration = 2500) {
  clearTimeout(toastTimer);
  dom.milestoneToast.textContent = msg;
  dom.milestoneToast.classList.add('show');
  toastTimer = setTimeout(() => dom.milestoneToast.classList.remove('show'), duration);
}

/* ─── Ripple ─────────────────────────────────────── */
function triggerRipple(x, y) {
  const btn = dom.counterBtn;
  const rect = btn.getBoundingClientRect();
  const cx = (x ?? (rect.left + rect.width / 2)) - rect.left;
  const cy = (y ?? (rect.top + rect.height / 2)) - rect.top;
  const size = Math.max(rect.width, rect.height) * 2;
  const wave = document.createElement('div');
  wave.className = 'ripple-wave';
  wave.style.cssText = `width:${size}px;height:${size}px;left:${cx - size/2}px;top:${cy - size/2}px;`;
  dom.counterRipple.appendChild(wave);
  wave.addEventListener('animationend', () => wave.remove());
}

/* ─── Count Logic ────────────────────────────────── */
let lastCountTime = 0;
const COUNT_DEBOUNCE_MS = 30;

function increment(touchX, touchY) {
  const now = Date.now();
  if (now - lastCountTime < COUNT_DEBOUNCE_MS) return;
  lastCountTime = now;
  state.count++;
  dom.counterValue.classList.remove('bump');
  void dom.counterValue.offsetWidth;
  dom.counterValue.classList.add('bump');
  triggerRipple(touchX, touchY);
  if (state.sound) playClick();
  vibrate([40]);
  if (state.count === state.target) onRoundComplete();
  else { saveState(); renderCounter(); }
}

function onRoundComplete() {
  state.rounds++;
  const phrase = PHRASES[state.phraseIndex];
  if (state.autosave) addHistoryEntry(phrase, state.count, state.rounds);
  vibrate([60, 40, 60, 40, 100]);
  dom.counterBtn.classList.add('milestone');
  dom.counterBtn.addEventListener('animationend', () => dom.counterBtn.classList.remove('milestone'), { once: true });
  showToast(`✨ Round ${state.rounds} complete! +${state.target}`);
  state.count = 0; saveState(); renderCounter();
}

function undo() {
  if (state.count === 0) return;
  state.count = Math.max(0, state.count - 1);
  vibrate([20]); saveState(); renderCounter();
}

function reset() {
  if (state.count === 0 && state.rounds === 0) return;
  if (state.autosave && state.count > 0) addHistoryEntry(PHRASES[state.phraseIndex], state.count, state.rounds);
  state.count = 0; state.rounds = 0; saveState(); renderCounter(); showToast('Counter reset');
}

function nextPhrase() {
  const next = (state.phraseIndex + 1) % PHRASES.length;
  selectPhrase(next); switchTab('counter');
}

/* ─── Tab Switching ──────────────────────────────── */
const TAB_ORDER = ['counter', 'history', 'settings'];

function switchTab(tabId, skipTransition = false) {
  if (tabId === state.activeTab && !skipTransition) return;
  const oldIndex = TAB_ORDER.indexOf(state.activeTab);
  const newIndex = TAB_ORDER.indexOf(tabId);
  dom.tabBtns.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  dom.tabPanels.forEach(panel => {
    const panelTab = panel.id.replace('tab-', '');
    const isActive = panelTab === tabId;
    const wasActive = panelTab === state.activeTab;
    if (wasActive && !isActive && !skipTransition) {
      panel.classList.remove('active');
      panel.classList.add(newIndex > oldIndex ? 'exit-left' : 'exit-right');
      panel.addEventListener('transitionend', () => panel.classList.remove('exit-left', 'exit-right'), { once: true });
    } else if (isActive) {
      panel.classList.remove('exit-left', 'exit-right');
      void panel.offsetWidth;
      panel.classList.add('active');
    } else {
      panel.classList.remove('active', 'exit-left', 'exit-right');
    }
  });
  state.activeTab = tabId;
  if (tabId === 'history') renderHistory();
  if (tabId === 'settings') renderSettings();
}

/* ─── Counter Button (with vibration unlock) ─────── */
function setupCounterBtn() {
  let touchHandled = false;

  dom.counterBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    unlockVibration(); // unlocks vibration on first touch
    touchHandled = true;
    dom.counterBtn.classList.add('pressed');
    const touch = e.touches[0];
    increment(touch.clientX, touch.clientY);
  }, { passive: false });

  dom.counterBtn.addEventListener('touchend', () => {
    dom.counterBtn.classList.remove('pressed');
    setTimeout(() => { touchHandled = false; }, 300);
  }, { passive: true });

  dom.counterBtn.addEventListener('touchcancel', () => {
    dom.counterBtn.classList.remove('pressed'); touchHandled = false;
  }, { passive: true });

  dom.counterBtn.addEventListener('click', (e) => {
    if (touchHandled) return;
    unlockVibration();
    increment(e.clientX, e.clientY);
  });

  dom.counterBtn.addEventListener('mousedown', () => dom.counterBtn.classList.add('pressed'));
  dom.counterBtn.addEventListener('mouseup', () => dom.counterBtn.classList.remove('pressed'));
  dom.counterBtn.addEventListener('mouseleave', () => dom.counterBtn.classList.remove('pressed'));
}

/* ─── Welcome Screen ─────────────────────────────── */
function initWelcomeScreen() {
  const welcomed = localStorage.getItem(STORAGE_KEYS.WELCOMED);
  if (welcomed) { dom.welcomeScreen.classList.add('hidden'); return; }
  dom.welcomeScreen.removeAttribute('aria-hidden');
  setTimeout(() => {
    dom.welcomeScreen.classList.add('fade-out');
    dom.welcomeScreen.addEventListener('transitionend', () => dom.welcomeScreen.classList.add('hidden'), { once: true });
    localStorage.setItem(STORAGE_KEYS.WELCOMED, '1');
  }, 2000);
}

/* ─── Service Worker ─────────────────────────────── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }
}

/* ─── Settings ───────────────────────────────────── */
function setupSettings() {
  dom.vibrationToggle.addEventListener('change', () => { state.vibration = dom.vibrationToggle.checked; saveSettings(); });
  dom.soundToggle.addEventListener('change', () => { state.sound = dom.soundToggle.checked; if (state.sound) getAudioCtx(); saveSettings(); });
  dom.autosaveToggle.addEventListener('change', () => { state.autosave = dom.autosaveToggle.checked; saveSettings(); });
  dom.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => { state.target = Number(btn.dataset.value); saveSettings(); renderSettings(); renderCounter(); });
  });
  dom.setCustomTargetBtn.addEventListener('click', () => {
    const val = parseInt(dom.customTarget.value, 10);
    if (val > 0 && val <= 9999) {
      state.target = val; dom.customTarget.value = '';
      saveSettings(); renderSettings(); renderCounter(); showToast(`Target set to ${val}`);
    }
  });
  dom.customTarget.addEventListener('keydown', (e) => { if (e.key === 'Enter') dom.setCustomTargetBtn.click(); });
}

/* ─── Global Listeners ───────────────────────────── */
function setupGlobalListeners() {
  dom.tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  dom.undoBtn.addEventListener('click', undo);
  dom.resetBtn.addEventListener('click', reset);
  dom.nextPhraseBtn.addEventListener('click', nextPhrase);
  dom.clearHistoryBtn.addEventListener('click', () => { saveHistory([]); renderHistory(); showToast('History cleared'); });
  dom.settingsShortcut.addEventListener('click', () => switchTab('settings'));
}

/* ─── Init ───────────────────────────────────────── */
function init() {
  loadState(); renderPhrase(); renderCounter();
  setupCounterBtn(); setupGlobalListeners(); setupSettings();
  initWelcomeScreen(); registerServiceWorker();
  switchTab('counter', true);
}

document.addEventListener('DOMContentLoaded', init);
