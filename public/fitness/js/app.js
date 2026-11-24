/**
 * BodyCoach Main Application Controller
 * Coordinates guided multi-angle photo capture, hybrid CV + Vision AI analysis,
 * interactive photo landmark editing, personalized workout plan with animated
 * exercises, fullscreen workout player with timers, and progress history.
 */

import {
  analyzeAnglePhoto,
  attachLandmarkEditor,
  computeBodyMetrics,
  loadImageElement,
  renderAnalysisOverlay,
} from './cv-analyzer.js?v=20261124-8';
import { ExerciseAnimationPlayer, preloadExerciseSprites } from './exercise-animator.js?v=20261124-8';
import { EXERCISE_MAP, EXERCISES, MUSCLE_LABELS } from './exercises-db.js?v=20261124-8';
import {
  buildNutritionGuidance,
  EQUIPMENT_LABELS,
  generateWorkoutPlan,
  getAlternativeExercises,
  GOAL_LABELS,
} from './plan-generator.js?v=20261124-8';
import { DEMO_PRESETS, generateDemoPhotoSet } from './sample-photos.js?v=20261124-8';
import {
  addWorkoutLog,
  compressImageDataUrl,
  deleteCheckinById,
  exportAllDataJson,
  importAllDataJson,
  loadActivePlan,
  loadAiSettings,
  loadCheckinPhotos,
  loadCheckins,
  loadMeals,
  loadProfile,
  loadTheme,
  loadWaterByDate,
  loadWorkoutLogs,
  saveActivePlan,
  saveAiSettings,
  saveCheckinPhotos,
  saveCheckins,
  saveMeals,
  saveProfile,
  saveTheme,
  saveWaterByDate,
} from './storage.js?v=20261124-8';

const ANGLES = [
  {
    key: 'front',
    title: 'Спереди',
    badge: 'Рекомендуется',
    hint: 'Встаньте прямо, руки слегка отведены от корпуса (~15°)',
    svg: `<svg viewBox="0 0 120 200" width="84" height="140" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3">
      <circle cx="60" cy="24" r="14"/>
      <path d="M34 52c8-8 44-8 52 0l12 46m-76 0 12-46"/>
      <path d="M40 54 44 102 38 118l4 68m36-132-4 48 6 16-4 68M44 102h32M38 118h44"/>
      <line x1="16" y1="54" x2="104" y2="54" stroke="#29d4ff" stroke-opacity="0.6"/>
    </svg>`,
  },
  {
    key: 'side',
    title: 'Сбоку (профиль)',
    badge: 'Рекомендуется',
    hint: 'Встаньте боком в естественной расслабленной стойке',
    svg: `<svg viewBox="0 0 120 200" width="84" height="140" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3">
      <circle cx="64" cy="24" r="13"/>
      <path d="M56 38c-10 8-12 34-6 58 6 20 2 34 4 88M68 38c10 10 10 34 4 58-2 22 4 40 2 88"/>
      <line x1="60" y1="8" x2="60" y2="192" stroke="#29d4ff" stroke-opacity="0.7"/>
    </svg>`,
  },
  {
    key: 'back',
    title: 'Со спины',
    badge: 'Для спины',
    hint: 'Встаньте спиной к камере, плечи расслаблены',
    svg: `<svg viewBox="0 0 120 200" width="84" height="140" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3">
      <circle cx="60" cy="24" r="14"/>
      <path d="M34 52c8-8 44-8 52 0l10 46m-72 0 10-46"/>
      <path d="M40 54 45 102 39 118l3 68m36-132-5 48 6 16-3 68"/>
      <line x1="60" y1="42" x2="60" y2="118" stroke="#38bdf8" stroke-opacity="0.7"/>
    </svg>`,
  },
  {
    key: 'side2',
    title: 'Второй бок',
    badge: 'Опционально',
    hint: 'Другой профиль — помогает уточнить симметрию',
    svg: `<svg viewBox="0 0 120 200" width="84" height="140" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3">
      <circle cx="56" cy="24" r="13"/>
      <path d="M64 38c10 8 12 34 6 58-6 20-2 34-4 88M52 38c-10 10-10 34-4 58 2 22-4 40-2 88"/>
      <line x1="60" y1="8" x2="60" y2="192" stroke="#29d4ff" stroke-opacity="0.5"/>
    </svg>`,
  },
];

const CATEGORY_LABELS = {
  posture: 'Осанка',
  back: 'Спина',
  legs: 'Ноги и ягодицы',
  chest: 'Грудь',
  shoulders: 'Плечи',
  arms: 'Руки',
  core: 'Кор и пресс',
  cardio: 'Кардио',
};

const AI_PROVIDER_DEFAULTS = {
  openai: {
    label: 'OpenAI',
    model: 'gpt-6-luna',
    placeholderUrl: 'https://api.openai.com/v1',
    suggestions: ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-4o-mini'],
  },
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-4-hydrogen',
    placeholderUrl: '',
    suggestions: ['gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-4-argon', 'gemini-4-neon'],
  },
  openrouter: {
    label: 'OpenRouter',
    model: 'google/gemini-3.5-flash-lite',
    placeholderUrl: 'https://openrouter.ai/api/v1',
    suggestions: ['google/gemini-3.5-flash-lite', 'google/gemini-3.8-flash', 'openai/gpt-6-luna', 'anthropic/claude-sonnet-4'],
  },
  custom: {
    label: 'Custom / ProxyAPI',
    model: 'gpt-6-luna',
    placeholderUrl: 'https://api.proxyapi.ru/openai/v1',
    suggestions: ['gpt-6-luna', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'llava:13b', 'qwen2.5vl:7b'],
  },
};

const APP_CONFIG = window.__BODYCOACH_CONFIG__ || (
  ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
    ? { mode: 'local', apiBase: '' }
    : { mode: 'cloud', apiBase: 'https://ellhome-bot-api.onrender.com' }
);
const IS_CLOUD_MODE = APP_CONFIG.mode === 'cloud';
const CLOUD_API_BASE = String(APP_CONFIG.apiBase || 'https://ellhome-bot-api.onrender.com').replace(/\/+$/, '');

const state = {
  tab: 'capture',
  profile: loadProfile(),
  aiSettings: loadAiSettings(),
  envProviders: [],
  cloudAi: { checked: false, ready: false, provider: 'gemini', model: '' },
  photos: { front: null, side: null, back: null, side2: null },
  photoImages: {}, // angleKey -> HTMLImageElement
  analyses: {}, // angleKey -> cv analysis result
  metrics: null,
  aiAnalysis: null,
  plan: loadActivePlan(),
  selectedPlanDay: 0,
  selectedAnalysisAngle: 'front',
  overlay: {
    showPosture: true,
    showProportions: true,
    showSkeleton: true,
    editMode: false,
    activeHandle: null,
  },
  checkins: loadCheckins(),
  workouts: loadWorkoutLogs(),
  meals: loadMeals(),
  waterByDate: loadWaterByDate(),
  nutrition: {
    selectedDate: '',
    photo: null,
    draft: null,
  },
  checkinThumbCache: {},
  compareA: null,
  compareB: null,
  planCardPlayers: [],
  catalogPlayers: [],
  exModalPlayer: null,
  camera: {
    angleKey: null,
    stream: null,
    facingMode: 'user',
    mirrored: true,
    countdownTimer: null,
    capturedDataUrl: null,
  },
  swapContext: null,
  wp: {
    active: false,
    dayIndex: 0,
    exIdx: 0,
    startedAt: 0,
    elapsedInterval: null,
    soundEnabled: true,
    setsState: [], // per exercise -> [{ done, weight, reps }]
    player: null,
    restTimer: null,
    restLeft: 0,
    restTotal: 60,
    holdTimer: null,
    holdLeft: 0,
    holdRunning: false,
  },
};

const $ = (id) => document.getElementById(id);

/* --------------------------- Audio Feedback --------------------------- */
let audioCtx = null;
function beep(freq = 660, durationMs = 110, volume = 0.08) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
    osc.stop(audioCtx.currentTime + durationMs / 1000 + 0.02);
  } catch {
    // Audio unavailable or blocked
  }
}

/* --------------------------- Toast & Helpers --------------------------- */
let toastTimeout = null;
function showToast(message, isError = false) {
  const container = $('toastContainer');
  container.innerHTML = '';
  if (toastTimeout) clearTimeout(toastTimeout);
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  toastTimeout = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateRu(iso) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/* --------------------------- Theme & Tabs --------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('themeIcon').innerHTML =
    theme === 'dark'
      ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  saveTheme(theme);
}

function switchTab(tabName) {
  state.tab = tabName;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (tabName === 'analysis' && state.metrics) {
    requestAnimationFrame(() => drawCurrentAnalysisCanvas());
  }
  if (tabName === 'plan' && state.plan) {
    renderPlanTab();
  }
  if (tabName === 'history') {
    renderHistoryTab();
  }
  if (tabName === 'nutrition') {
    renderNutritionTab();
  }
}

function isAiReady(settings = state.aiSettings) {
  if (IS_CLOUD_MODE) {
    return true;
  }
  const prov = settings?.provider || 'openai';
  return Boolean(
    (settings?.apiKey && settings.apiKey.trim()) ||
      prov === 'custom' ||
      state.envProviders.includes(prov)
  );
}

function getProviderMeta(provider) {
  return AI_PROVIDER_DEFAULTS[provider] || AI_PROVIDER_DEFAULTS.openai;
}

function renderModelSuggestions(provider) {
  const list = $('aiModelSuggestions');
  if (!list) return;
  const meta = getProviderMeta(provider);
  list.innerHTML = (meta.suggestions || [])
    .map((m) => `<option value="${escapeHtml(m)}"></option>`)
    .join('');
}

function updateAiStatusIndicator() {
  const dot = $('aiStatusDot');
  const btn = $('openAiSettingsBtn');
  if (IS_CLOUD_MODE) {
    const enabled = Boolean(state.aiSettings.enabled);
    const online = enabled && (!state.cloudAi.checked || state.cloudAi.ready);
    dot.classList.toggle('online', online);
    if (btn) {
      btn.title = !enabled
        ? 'AI Ассистент отключён (работает только специальный алгоритм)'
        : state.cloudAi.ready
          ? `AI Ассистент готов (${state.cloudAi.model || 'Gemini'})`
          : 'AI Ассистент (ELLHOME) — нажмите, чтобы проверить статус';
    }
    return;
  }
  const ready = Boolean(state.aiSettings.enabled && isAiReady());
  dot.classList.toggle('online', ready);
  if (btn) {
    const meta = getProviderMeta(state.aiSettings.provider);
    btn.title = ready
      ? `AI Ассистент активен: ${meta.label} (${state.aiSettings.model || meta.model})`
      : 'Настройки AI Ассистента (OpenAI / Gemini / OpenRouter)';
  }
}

function applyCloudModeUi() {
  if (!IS_CLOUD_MODE) return;
  const heroBadge = document.querySelector('#tab-capture .hero-copy .pill-badge');
  if (heroBadge) heroBadge.textContent = 'AI Ассистент + алгоритм анализа осанки';
  const inlineTitle = document.querySelector('#inlineAiCard .ai-inline-title');
  if (inlineTitle) inlineTitle.textContent = '✦ AI Ассистент (сервер ELLHOME)';
  const aiPanelTitle = document.querySelector('#aiVisionPanel h3');
  if (aiPanelTitle) aiPanelTitle.textContent = 'Анализ от AI Ассистента (сервер ELLHOME)';
  const aiPanelSub = document.querySelector('#aiVisionPanel .panel-header p');
  if (aiPanelSub) aiPanelSub.textContent = 'Глубокий анализ фигуры по фото через защищённый серверный API (ключ хранится на сервере)';
  const nutriBadge = $('nutritionAiBadge');
  if (nutriBadge) nutriBadge.textContent = '✦ AI по фото';
  $('inlineAiFields')?.classList.add('hidden');
}

function syncInlineAiFromState() {
  const s = state.aiSettings;
  $('inlineAiToggle').checked = Boolean(s.enabled);

  if (IS_CLOUD_MODE) {
    $('inlineAiFields').classList.add('hidden');
    const sub = $('inlineAiSub');
    if (!s.enabled) {
      sub.textContent = 'Выключено — сработает только специальный алгоритм анализа осанки в браузере';
    } else if (!state.cloudAi.checked) {
      sub.textContent = 'Подключаемся к защищённому серверу AI Ассистента (ключ хранится на сервере)...';
    } else if (state.cloudAi.ready) {
      const mLabel = state.cloudAi.model ? ` (${state.cloudAi.model})` : '';
      sub.textContent = `AI Ассистент готов${mLabel} — ключ защищён на сервере, ничего вводить не нужно`;
    } else {
      sub.textContent = 'Сервер AI Ассистента просыпается (при первом запросе 20–50 сек) • алгоритм работает мгновенно';
    }
    return;
  }

  const prov = s.provider || 'openai';
  const meta = getProviderMeta(prov);
  const hasEnv = state.envProviders.includes(prov);

  $('inlineAiFields').classList.toggle('hidden', !s.enabled);
  $('inlineAiProvider').value = prov;
  $('inlineAiModel').value = s.model || meta.model;
  $('inlineAiModel').placeholder = meta.model;
  renderModelSuggestions(prov);
  $('inlineAiBaseUrl').value = s.baseUrl || '';
  if (meta.placeholderUrl) $('inlineAiBaseUrl').placeholder = meta.placeholderUrl;
  $('inlineAiKey').value = s.apiKey || '';
  $('inlineAiBaseUrlWrap').classList.toggle('hidden', prov !== 'custom');

  const sub = $('inlineAiSub');
  if (hasEnv && !s.apiKey) {
    sub.textContent = `Обнаружен серверный ключ ${meta.label} (из переменных окружения) — AI Ассистент готов к работе`;
  } else if (s.apiKey) {
    sub.textContent = `Подключён ${meta.label} (${s.model || meta.model}) — фото и замеры проанализирует AI Ассистент`;
  } else {
    sub.textContent = 'OpenAI / Gemini / OpenRouter — глубокий анализ фото и составление плана тренировок';
  }
}

function readInlineAiToState(persist = true) {
  if (IS_CLOUD_MODE) {
    const next = {
      ...state.aiSettings,
      enabled: $('inlineAiToggle').checked,
    };
    state.aiSettings = persist ? saveAiSettings(next) : next;
    updateAiStatusIndicator();
    if (state.metrics) renderAiVisionBlock();
    return state.aiSettings;
  }
  const prov = $('inlineAiProvider').value || 'openai';
  const meta = getProviderMeta(prov);
  const next = {
    ...state.aiSettings,
    enabled: $('inlineAiToggle').checked,
    provider: prov,
    model: $('inlineAiModel').value.trim() || meta.model,
    baseUrl: $('inlineAiBaseUrl').value.trim(),
    apiKey: $('inlineAiKey').value.trim(),
  };
  state.aiSettings = persist ? saveAiSettings(next) : next;
  updateAiStatusIndicator();
  if (state.metrics) renderAiVisionBlock();
  return state.aiSettings;
}

function setAiFeedback(elId, type, message) {
  const el = $(elId);
  if (!el) return;
  if (!message) {
    el.className = 'ai-test-feedback hidden';
    el.textContent = '';
    return;
  }
  el.className = `ai-test-feedback ${type}`;
  el.textContent = message;
}

async function testAiConnectionUi(source) {
  const isInline = source === 'inline';
  const btn = $(isInline ? 'inlineAiTestBtn' : 'modalAiTestBtn');
  const feedbackId = isInline ? 'inlineAiFeedback' : 'modalAiFeedback';

  const cfg = isInline
    ? readInlineAiToState(true)
    : {
        provider: $('aiProviderSelect').value || 'openai',
        model: $('aiModelInput').value.trim(),
        baseUrl: $('aiBaseUrlInput').value.trim(),
        apiKey: $('aiApiKeyInput').value.trim(),
      };

  const meta = getProviderMeta(cfg.provider);
  const effectiveModel = cfg.model || meta.model;

  if (!isAiReady(cfg)) {
    setAiFeedback(
      feedbackId,
      'err',
      `Введите API-ключ для ${meta.label} (или задайте переменную окружения на сервере).`
    );
    return;
  }

  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Проверяем...';
  setAiFeedback(feedbackId, '', '');

  try {
    const resp = await fetch('/api/ai-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: cfg.provider,
        apiKey: cfg.apiKey,
        model: effectiveModel,
        baseUrl: cfg.baseUrl,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }
    setAiFeedback(
      feedbackId,
      'ok',
      `✓ Подключение к ${meta.label} (${data.model || effectiveModel}) успешно! Готово к анализу фото.`
    );
    if (isInline) syncInlineAiFromState();
  } catch (err) {
    setAiFeedback(feedbackId, 'err', `✕ ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
}

/* --------------------------- Tab 1: Capture & Profile --------------------------- */
function renderDemoPresets() {
  const wrap = $('demoPresetButtons');
  wrap.innerHTML = DEMO_PRESETS.map(
    (p) =>
      `<button type="button" class="btn btn-outline btn-sm" data-demo-preset="${p.id}" title="${escapeHtml(p.subtitle)}">${escapeHtml(p.name)}</button>`
  ).join('');

  wrap.querySelectorAll('[data-demo-preset]').forEach((btn) => {
    btn.addEventListener('click', () => loadDemoPreset(btn.dataset.demoPreset));
  });
}

async function loadDemoPreset(presetId) {
  try {
    showToast('Загружаем студийные фото и запускаем анализ...');
    const { preset, photos } = await generateDemoPhotoSet(presetId);
    state.photos = { front: photos.front, side: photos.side, back: photos.back, side2: null };
    state.profile = { ...state.profile, ...preset.profile };
    saveProfile(state.profile);
    syncProfileFormFromState();
    renderAnglesGrid();
    await runFullAnalysis();
  } catch (err) {
    showToast(`Не удалось загрузить демо-фото: ${err.message}`, true);
  }
}

function renderAnglesGrid() {
  const grid = $('anglesGrid');
  grid.innerHTML = ANGLES.map((a) => {
    const imgUrl = state.photos[a.key];
    return `
      <div class="angle-card ${imgUrl ? 'filled' : ''}" data-angle-card="${a.key}">
        <div class="angle-card-head">
          <span class="angle-title">${a.title}</span>
          <span class="angle-tag">${imgUrl ? '✓ Готово' : a.badge}</span>
        </div>
        <div class="angle-preview">
          ${
            imgUrl
              ? `<img src="${imgUrl}" alt="${a.title}">`
              : `<div class="angle-silhouette">${a.svg}<span>${a.hint}</span></div>`
          }
        </div>
        <div class="angle-actions">
          <button type="button" class="btn btn-outline btn-sm" data-cam-angle="${a.key}">
            <svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.2"/></svg>
            <span>Камера</span>
          </button>
          <label class="btn btn-ghost btn-sm">
            <svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Фото</span>
            <input type="file" accept="image/*" data-file-angle="${a.key}" hidden>
          </label>
          ${
            imgUrl
              ? `<button type="button" class="btn btn-danger-ghost btn-sm" style="flex:0 0 34px" data-remove-angle="${a.key}" title="Удалить">✕</button>`
              : ''
          }
        </div>
      </div>
    `;
  }).join('');

  // Wire buttons & drag-and-drop
  grid.querySelectorAll('[data-cam-angle]').forEach((btn) => {
    btn.addEventListener('click', () => openCameraModal(btn.dataset.camAngle));
  });
  grid.querySelectorAll('[data-file-angle]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handlePhotoFile(input.dataset.fileAngle, file);
      input.value = '';
    });
  });
  grid.querySelectorAll('[data-remove-angle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.photos[btn.dataset.removeAngle] = null;
      renderAnglesGrid();
    });
  });
  grid.querySelectorAll('[data-angle-card]').forEach((card) => {
    const key = card.dataset.angleCard;
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('dragover');
    });
    card.addEventListener('dragleave', () => card.classList.remove('dragover'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handlePhotoFile(key, file);
      }
    });
  });
}

function handlePhotoFile(angleKey, file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const compressed = await compressImageDataUrl(reader.result, 1080, 0.88);
    state.photos[angleKey] = compressed;
    renderAnglesGrid();
    showToast(`Фото «${ANGLES.find((a) => a.key === angleKey)?.title || angleKey}» добавлено`);
  };
  reader.readAsDataURL(file);
}

function syncProfileFormFromState() {
  const p = state.profile;
  $('profileSex').value = p.sex || 'male';
  $('profileAge').value = p.age || 28;
  $('profileHeight').value = p.heightCm || 178;
  $('profileWeight').value = p.weightKg || 78;

  const setRadio = (name, val) => {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (el) el.checked = true;
  };
  setRadio('goal', p.goal || 'recomp');
  setRadio('equipment', p.equipment || 'home_bodyweight');
  setRadio('level', p.level || 'beginner');
  setRadio('daysPerWeek', String(p.daysPerWeek || 3));
}

function readProfileFromForm() {
  const fd = new FormData($('profileForm'));
  const profile = {
    sex: fd.get('sex') || 'male',
    age: Number(fd.get('age')) || 28,
    heightCm: Number(fd.get('heightCm')) || 178,
    weightKg: Number(fd.get('weightKg')) || 78,
    goal: fd.get('goal') || 'recomp',
    equipment: fd.get('equipment') || 'home_bodyweight',
    level: fd.get('level') || 'beginner',
    daysPerWeek: Number(fd.get('daysPerWeek')) || 3,
  };
  state.profile = profile;
  saveProfile(profile);
  return profile;
}

/* --------------------------- Camera Capture Modal --------------------------- */
async function openCameraModal(angleKey) {
  state.camera.angleKey = angleKey;
  state.camera.capturedDataUrl = null;

  if (angleKey === 'meal') {
    state.camera.facingMode = 'environment';
    state.camera.mirrored = false;
    $('cameraModalTitle').textContent = 'Съёмка блюда';
    $('cameraModalHint').textContent = 'Сфотографируйте тарелку сверху под углом ~45° при хорошем освещении';
    $('cameraGuideOverlay').innerHTML = '';
    const immediateRadio = document.querySelector('input[name="camTimer"][value="0"]');
    if (immediateRadio) immediateRadio.checked = true;
  } else {
    const meta = ANGLES.find((a) => a.key === angleKey) || ANGLES[0];
    $('cameraModalTitle').textContent = `Съёмка: ${meta.title}`;
    $('cameraModalHint').textContent = meta.hint;
    $('cameraGuideOverlay').innerHTML = meta.svg.replace('width="84" height="140"', 'width="230" height="380"');
  }

  $('cameraPreviewImg').classList.add('hidden');
  $('cameraVideo').classList.remove('hidden');
  $('cameraLiveControls').classList.remove('hidden');
  $('cameraReviewControls').classList.add('hidden');
  $('cameraCountdown').classList.add('hidden');
  $('cameraError').classList.add('hidden');
  $('cameraModal').classList.remove('hidden');

  await startCameraStream();
}

async function startCameraStream() {
  stopCameraStream();
  const video = $('cameraVideo');
  const errBox = $('cameraError');
  errBox.classList.add('hidden');

  if (!navigator.mediaDevices?.getUserMedia) {
    errBox.textContent = 'Браузер не поддерживает доступ к камере. Вы можете загрузить готовое фото с устройства.';
    errBox.classList.remove('hidden');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.camera.facingMode, width: { ideal: 1080 }, height: { ideal: 1440 } },
      audio: false,
    });
    state.camera.stream = stream;
    video.srcObject = stream;
    video.classList.toggle('mirrored', state.camera.mirrored);
    await video.play();
  } catch (err) {
    errBox.textContent = `Не удалось открыть камеру (${err.name || 'нет доступа'}). Разрешите доступ или загрузите фото файлом.`;
    errBox.classList.remove('hidden');
  }
}

function stopCameraStream() {
  if (state.camera.countdownTimer) {
    clearInterval(state.camera.countdownTimer);
    state.camera.countdownTimer = null;
  }
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach((t) => t.stop());
    state.camera.stream = null;
  }
}

function triggerCameraSnap() {
  if (!state.camera.stream) {
    showToast('Камера не подключена', true);
    return;
  }
  const delaySec = Number(document.querySelector('input[name="camTimer"]:checked')?.value || 0);
  if (delaySec <= 0) {
    captureCameraFrame();
    return;
  }

  let left = delaySec;
  const cd = $('cameraCountdown');
  cd.textContent = String(left);
  cd.classList.remove('hidden');
  beep(520, 90);

  if (state.camera.countdownTimer) clearInterval(state.camera.countdownTimer);
  state.camera.countdownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(state.camera.countdownTimer);
      state.camera.countdownTimer = null;
      cd.classList.add('hidden');
      beep(880, 160);
      captureCameraFrame();
    } else {
      cd.textContent = String(left);
      beep(520, 90);
    }
  }, 1000);
}

function captureCameraFrame() {
  const video = $('cameraVideo');
  const w = video.videoWidth || 720;
  const h = video.videoHeight || 960;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (state.camera.mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  state.camera.capturedDataUrl = dataUrl;

  $('cameraPreviewImg').src = dataUrl;
  $('cameraPreviewImg').classList.remove('hidden');
  $('cameraVideo').classList.add('hidden');
  $('cameraLiveControls').classList.add('hidden');
  $('cameraReviewControls').classList.remove('hidden');
}

/* --------------------------- Run CV + Optional Vision AI Analysis --------------------------- */
async function runFullAnalysis() {
  const uploadedKeys = ANGLES.map((a) => a.key).filter((k) => Boolean(state.photos[k]));
  if (!uploadedKeys.length) {
    showToast('Добавьте хотя бы одно фото или выберите демо-пример сверху', true);
    return;
  }

  const profile = readProfileFromForm();
  readInlineAiToState(true);
  const btn = $('runAnalysisBtn');
  const statusEl = $('analyzeStatus');
  const statusTxt = $('analyzeStatusText');
  btn.disabled = true;
  statusEl.classList.remove('hidden');

  try {
    state.analyses = {};
    state.photoImages = {};
    state.aiAnalysis = null;

    for (let i = 0; i < uploadedKeys.length; i++) {
      const k = uploadedKeys[i];
      const title = ANGLES.find((a) => a.key === k)?.title || k;
      statusTxt.textContent = `Анализ ракурса «${title}» (${i + 1}/${uploadedKeys.length})...`;
      state.photoImages[k] = await loadImageElement(state.photos[k]);
      state.analyses[k] = await analyzeAnglePhoto(k, state.photos[k]);
    }

    state.metrics = computeBodyMetrics(state.analyses, profile);
    state.selectedAnalysisAngle = uploadedKeys.includes('front') ? 'front' : uploadedKeys[0];

    // Automatic AI Assistant call when enabled & configured (cloud server or local key/env)
    if (state.aiSettings.enabled && isAiReady()) {
      if (IS_CLOUD_MODE) {
        statusTxt.textContent = state.cloudAi.ready
          ? 'Отправляем фото в AI Ассистента для глубокого анализа фигуры...'
          : 'Пробуждаем сервер AI Ассистента (первый запуск может занять 25–50 сек)...';
      } else {
        const meta = getProviderMeta(state.aiSettings.provider);
        statusTxt.textContent = `Отправляем фото в ${meta.label} (${state.aiSettings.model || meta.model}) для глубокого AI-анализа...`;
      }
      try {
        state.aiAnalysis = await callVisionAiProxy();
      } catch (err) {
        showToast(`Базовый анализ по алгоритму готов, но AI Ассистент ответил с ошибкой: ${err.message}`, true);
      }
    }

    statusTxt.textContent = 'Составляем персональный план тренировок...';
    state.plan = generateWorkoutPlan(state.metrics, profile, state.aiAnalysis);
    state.selectedPlanDay = 0;
    saveActivePlan(state.plan);

    renderAnalysisTab();
    renderPlanTab();
    switchTab('analysis');
    showToast(
      state.plan.generatedByAi
        ? `Анализ фигуры и персональный план от ${state.plan.aiProviderLabel} готовы!`
        : 'Анализ фигуры и план тренировок готовы!'
    );
  } catch (err) {
    showToast(`Ошибка анализа: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    statusEl.classList.add('hidden');
  }
}

async function callVisionAiProxy() {
  if (!isAiReady()) {
    throw new Error('Не указан API-ключ в настройках AI Ассистента');
  }
  const compactPhotos = {};
  for (const [k, v] of Object.entries(state.photos)) {
    if (v) compactPhotos[k] = await compressImageDataUrl(v, 768, 0.76);
  }
  const catalogPayload = EXERCISES.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    equipment: e.equipment,
  }));

  if (IS_CLOUD_MODE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 95000);
    let resp;
    try {
      resp = await fetch(`${CLOUD_API_BASE}/fitness/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          profile: state.profile,
          metrics: state.metrics,
          photos: compactPhotos,
          catalog: catalogPayload,
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Сервер AI Ассистента не успел ответить за 95 сек. Попробуйте нажать «Запустить AI-анализ» ещё раз.');
      }
      throw new Error('Не удалось связаться с сервером AI Ассистента.');
    } finally {
      clearTimeout(timer);
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false || !data.analysis) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }
    state.cloudAi = {
      checked: true,
      ready: true,
      provider: data.provider || 'gemini',
      model: data.model || state.cloudAi.model,
    };
    syncInlineAiFromState();
    updateAiStatusIndicator();
    return {
      provider: data.provider || 'gemini',
      model: data.model || '',
      ...data.analysis,
    };
  }

  const meta = getProviderMeta(state.aiSettings.provider);
  const resp = await fetch('/api/ai-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: state.aiSettings.provider,
      apiKey: state.aiSettings.apiKey,
      model: state.aiSettings.model || meta.model,
      baseUrl: state.aiSettings.baseUrl,
      profile: state.profile,
      metrics: state.metrics,
      photos: compactPhotos,
      catalog: catalogPayload,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return {
    provider: data.provider,
    model: data.model,
    ...data.analysis,
  };
}

/* --------------------------- Tab 2: Body Analysis View --------------------------- */
function renderAnalysisTab() {
  if (!state.metrics || !Object.keys(state.analyses).length) {
    $('analysisEmptyState').classList.remove('hidden');
    $('analysisContent').classList.add('hidden');
    return;
  }

  $('analysisEmptyState').classList.add('hidden');
  $('analysisContent').classList.remove('hidden');

  const availableKeys = ANGLES.map((a) => a.key).filter((k) => Boolean(state.analyses[k]));
  if (!availableKeys.includes(state.selectedAnalysisAngle)) {
    state.selectedAnalysisAngle = availableKeys[0];
  }

  // Angle tabs
  const tabsWrap = $('analysisAngleTabs');
  tabsWrap.innerHTML = availableKeys
    .map((k) => {
      const label = ANGLES.find((a) => a.key === k)?.title || k;
      return `<button type="button" class="angle-tab-btn ${k === state.selectedAnalysisAngle ? 'active' : ''}" data-analysis-angle="${k}">${label}</button>`;
    })
    .join('');
  tabsWrap.querySelectorAll('[data-analysis-angle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedAnalysisAngle = btn.dataset.analysisAngle;
      renderAnalysisTab();
    });
  });

  const cur = state.analyses[state.selectedAnalysisAngle];
  $('cvMethodBadge').textContent =
    cur.method === 'mediapipe_hybrid' ? 'MediaPipe Pose + Силуэт' : 'Алгоритм анализа силуэта';

  drawCurrentAnalysisCanvas();
  renderAnalysisMetricsPanel();
  renderAiVisionBlock();
}

function drawCurrentAnalysisCanvas() {
  const key = state.selectedAnalysisAngle;
  const analysis = state.analyses[key];
  const img = state.photoImages[key];
  if (!analysis || !img) return;
  renderAnalysisOverlay($('analysisCanvas'), img, analysis, state.overlay);
}

function renderAnalysisMetricsPanel() {
  const m = state.metrics;
  if (!m) return;

  // Radial gauge
  const circumference = 2 * Math.PI * 44;
  const arc = $('postureScoreArc');
  arc.style.strokeDasharray = `${circumference}`;
  arc.style.strokeDashoffset = `${circumference * (1 - m.postureScore / 100)}`;
  arc.style.stroke = m.postureScore >= 82 ? '#2ee2ff' : m.postureScore >= 68 ? '#38bdf8' : 'var(--coral)';
  $('postureScoreVal').textContent = String(m.postureScore);

  $('bodyFrameBadge').textContent = m.bodyFrame;
  $('analysisHeadline').textContent =
    m.postureScore >= 84
      ? 'Крепкая база и ровная осанка'
      : m.postureScore >= 70
        ? 'Хорошая основа — есть 2–3 зоны для быстрой коррекции'
        : 'Заметны зоны напряжения — план сфокусирован на выравнивании';
  $('analysisSubline').textContent = `Проанализировано ракурсов: ${m.anglesProvided.length}. При желании поправьте контрольные точки на фото.`;

  const pelvicMap = {
    neutral: 'Нейтральный',
    anterior: 'Передний наклон',
    posterior: 'Задний наклон',
  };

  const boxes = [
    {
      label: 'V-индекс (Плечи/Талия)',
      value: m.shoulderToWaist !== null ? `${m.shoulderToWaist}×` : 'Нужно фото спереди',
      hint: state.profile.sex === 'female' ? 'Ориентир 1.20–1.35' : 'Ориентир 1.38–1.55',
    },
    {
      label: 'Талия / Бёдра (WHR)',
      value: m.waistToHip !== null ? `${m.waistToHip}` : '—',
      hint: state.profile.sex === 'female' ? 'Норма ~0.70–0.82' : 'Норма ~0.82–0.94',
    },
    {
      label: 'Симметрия (Плечи/Таз)',
      value: `${m.symmetryScore}%`,
      hint: `Плечи ${m.shoulderTiltDeg}° • Таз ${m.hipTiltDeg}°`,
    },
    {
      label: 'Смещение головы вперёд',
      value: m.forwardHeadDeg !== null ? `${m.forwardHeadDeg > 0 ? '+' : ''}${m.forwardHeadDeg}°` : 'Нужно фото сбоку',
      hint: 'Оптимум до 6°',
    },
    {
      label: 'Скругление верха спины',
      value: m.thoracicRoundScore !== null ? `${m.thoracicRoundScore}/100` : 'Нужно фото сбоку',
      hint: m.thoracicRoundScore !== null && m.thoracicRoundScore >= 42 ? 'Акцент на тяги и спину' : 'В пределах нормы',
    },
    {
      label: 'Положение таза / ИМТ',
      value: m.bmi ? `ИМТ ${m.bmi}` : pelvicMap[m.pelvicTiltHint],
      hint: `Таз: ${pelvicMap[m.pelvicTiltHint]}`,
    },
  ];

  $('metricsGrid').innerHTML = boxes
    .map(
      (b) => `
      <div class="metric-box">
        <span class="metric-label">${b.label}</span>
        <span class="metric-value">${b.value}</span>
        <span class="metric-hint">${b.hint}</span>
      </div>
    `
    )
    .join('');

  const sevLabels = { focus: 'Приоритет', watch: 'Внимание', good: 'Отлично' };
  $('findingsList').innerHTML = m.findings
    .map(
      (f) => `
      <div class="finding-item">
        <div class="finding-top">
          <span class="finding-title">${escapeHtml(f.title)}</span>
          <span class="badge badge-${f.severity}">${sevLabels[f.severity] || ''} • ${escapeHtml(f.metricText)}</span>
        </div>
        <p class="muted small">${escapeHtml(f.explanation)}</p>
      </div>
    `
    )
    .join('');
}

function renderAiVisionBlock() {
  const body = $('aiVisionBody');
  const btn = $('runAiVisionNowBtn');

  if (!state.aiAnalysis) {
    if (IS_CLOUD_MODE) {
      btn.textContent = 'Запустить AI-анализ';
      const modelNote = state.cloudAi.model ? ` (${escapeHtml(state.cloudAi.model)})` : '';
      body.innerHTML = `<p class="muted small">Сейчас выполнен анализ осанки и пропорций специальным алгоритмом. Нажмите <strong>«Запустить AI-анализ»</strong>, чтобы AI Ассистент${modelNote} проанализировал фото и дополнил программу тренировок (первый запуск может занять 25–50 сек).</p>`;
      return;
    }
    const ready = isAiReady();
    const meta = getProviderMeta(state.aiSettings.provider);
    const modelLabel = state.aiSettings.model || meta.model;
    btn.textContent = ready ? 'Запустить AI-анализ' : 'Подключить AI Ассистента';
    body.innerHTML = `<p class="muted small">${
      ready
        ? `Готов провайдер <strong>${escapeHtml(meta.label)}</strong> (${escapeHtml(modelLabel)}). Нажмите «Запустить AI-анализ», чтобы AI Ассистент проанализировал фото и собрал персональный план тренировок.`
        : 'Сейчас выполнен анализ осанки и пропорций специальным алгоритмом. Укажите API-ключ OpenAI, Google Gemini, OpenRouter или совместимого прокси, чтобы подключить глубокий анализ фото и генерацию программы от AI Ассистента.'
    }</p>`;
    return;
  }

  btn.textContent = 'Обновить AI-анализ';
  const ai = state.aiAnalysis;
  body.innerHTML = `
    <div class="ai-result-block">
      <div class="pill-badge" style="margin-bottom:0">✦ AI Ассистент • ${escapeHtml((ai.provider || '').toUpperCase())} ${escapeHtml(ai.model || '')}</div>
      <p>${escapeHtml(ai.summary || '')}</p>
      ${ai.somatotype ? `<p class="muted small"><strong>Телосложение:</strong> ${escapeHtml(ai.somatotype)}</p>` : ''}
      ${ai.visualComposition ? `<p class="muted small"><strong>Тонус и композиция:</strong> ${escapeHtml(ai.visualComposition)}</p>` : ''}
      <div class="ai-lists-grid">
        ${
          Array.isArray(ai.strengths) && ai.strengths.length
            ? `<div class="ai-mini-card"><h4>Сильные стороны</h4><ul>${ai.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`
            : ''
        }
        ${
          Array.isArray(ai.trainingAdvice) && ai.trainingAdvice.length
            ? `<div class="ai-mini-card"><h4>Рекомендации AI</h4><ul>${ai.trainingAdvice.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`
            : ''
        }
      </div>
      ${
        Array.isArray(ai.postureNotes) && ai.postureNotes.length
          ? `<div class="ai-mini-card"><h4>Наблюдения по осанке</h4><ul>${ai.postureNotes.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${
        Array.isArray(ai.focusAreas) && ai.focusAreas.length
          ? `<div class="ai-mini-card"><h4>Зоны фокуса по фото</h4><ul>${ai.focusAreas
              .map((fa) => `<li><strong>${escapeHtml(fa.area)}:</strong> ${escapeHtml(fa.observation)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
      ${ai.nutritionHint ? `<p class="muted small"><strong>Питание:</strong> ${escapeHtml(ai.nutritionHint)}</p>` : ''}
    </div>
  `;
}

async function handleManualAiRun() {
  if (!isAiReady()) {
    openAiSettingsModal();
    return;
  }
  const btn = $('runAiVisionNowBtn');
  btn.disabled = true;
  btn.textContent = 'Анализируем...';
  try {
    state.aiAnalysis = await callVisionAiProxy();
    state.plan = generateWorkoutPlan(state.metrics, state.profile, state.aiAnalysis);
    saveActivePlan(state.plan);
    renderAiVisionBlock();
    renderPlanTab();
    showToast(
      state.plan.generatedByAi
        ? `Анализ от AI Ассистента готов, план собран моделью ${state.plan.aiProviderLabel}!`
        : 'Анализ от AI Ассистента добавлен и учтён в плане тренировок!'
    );
  } catch (err) {
    showToast(`Ошибка AI Ассистента: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = state.aiAnalysis ? 'Обновить AI-анализ' : 'Запустить AI-анализ';
  }
}

/* --------------------------- Tab 3: Workout Plan & Animated Cards --------------------------- */
function destroyPlanCardPlayers() {
  state.planCardPlayers.forEach((p) => p.destroy());
  state.planCardPlayers = [];
}

function renderPlanTab() {
  destroyPlanCardPlayers();
  const plan = state.plan;
  if (!plan || !plan.days?.length) {
    $('planEmptyState').classList.remove('hidden');
    $('planContent').classList.add('hidden');
    return;
  }

  $('planEmptyState').classList.add('hidden');
  $('planContent').classList.remove('hidden');

  if (state.selectedPlanDay >= plan.days.length) state.selectedPlanDay = 0;

  $('planGoalBadge').textContent = plan.generatedByAi
    ? `✦ AI Ассистент (${plan.aiProviderLabel}) • ${plan.goalLabel} • ${plan.levelLabel}`
    : `${plan.goalLabel} • ${plan.levelLabel}`;
  $('planTitle').textContent = `Программа на ${plan.daysPerWeek} дня (${plan.equipmentLabel})`;
  $('planFocusChips').innerHTML = (plan.focusSummary || [])
    .map((f) => `<span class="focus-chip">✦ ${escapeHtml(f)}</span>`)
    .join('');

  $('quickEquipmentSelect').value = plan.equipment;
  $('quickDaysSelect').value = String(plan.daysPerWeek);

  // Nutrition strip
  const n = plan.nutrition;
  if (n) {
    $('nutritionStrip').innerHTML = `
      <div class="nutri-item"><span>Ориентир калорий</span><strong>~${n.targetKcal} ккал</strong><span>${escapeHtml(n.kcalNote)}</span></div>
      <div class="nutri-item"><span>Б / Ж / У в день</span><strong>${n.proteinGrams} / ${n.fatGrams ?? '—'} / ${n.carbsGrams ?? '—'} г</strong><span>Для мышц и энергии</span></div>
      <div class="nutri-item"><span>Вода</span><strong>${n.waterLiters} л/день</strong><span>Поддержка суставов и тонуса</span></div>
      <div class="nutri-item" style="display:flex;flex-direction:column;justify-content:space-between;gap:6px">
        <span>Учёт рациона по фото</span>
        <button type="button" class="btn btn-outline btn-xs" id="gotoNutritionFromPlanBtn"><svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.2"/></svg><span>Дневник КБЖУ →</span></button>
      </div>
    `;
    $('gotoNutritionFromPlanBtn')?.addEventListener('click', () => switchTab('nutrition'));
  }

  // Day tabs
  $('planDayTabs').innerHTML = plan.days
    .map(
      (d, idx) =>
        `<button type="button" class="day-tab ${idx === state.selectedPlanDay ? 'active' : ''}" data-plan-day="${idx}">День ${d.dayIndex}</button>`
    )
    .join('');
  $('planDayTabs').querySelectorAll('[data-plan-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedPlanDay = Number(btn.dataset.planDay);
      renderPlanTab();
    });
  });

  const day = plan.days[state.selectedPlanDay];
  // Preload active day's studio exercise sprites immediately
  preloadExerciseSprites(
    day.items.map((it) => EXERCISE_MAP[it.exerciseId]?.animId).filter(Boolean)
  );

  $('daySummaryBar').innerHTML = `
    <div>
      <h3>${escapeHtml(day.title)}</h3>
      <p class="muted small">${escapeHtml(day.focus)}</p>
    </div>
    <div class="day-stats">
      <span>Упражнений: <strong>${day.items.length}</strong></span>
      <span>Подходов: <strong>${day.totalSets}</strong></span>
      <span>Время: <strong>~${day.estMinutes} мин</strong></span>
      <span>Расход: <strong>~${day.estKcal} ккал</strong></span>
    </div>
  `;

  // Group items by section
  const container = $('planExercisesContainer');
  container.innerHTML = '';
  const sections = [...new Set(day.items.map((it) => it.section))];

  sections.forEach((sectionName) => {
    const heading = document.createElement('div');
    heading.className = 'plan-section-heading';
    heading.textContent = sectionName;
    container.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'exercise-cards-grid';

    day.items.forEach((item, itemIdx) => {
      if (item.section !== sectionName) return;
      const ex = EXERCISE_MAP[item.exerciseId];
      if (!ex) return;

      const card = document.createElement('article');
      card.className = 'exercise-card';
      card.innerHTML = `
        <div class="ex-card-anim" data-open-ex="${ex.id}">
          <canvas width="420" height="236"></canvas>
          <span class="ex-card-overlay-pill">▶ Техника и мышцы</span>
        </div>
        <div class="ex-card-body">
          <div class="ex-card-title">${escapeHtml(ex.name)}</div>
          <div class="ex-rx-row">
            <span class="rx-pill rx-pill-accent">${item.sets} × ${escapeHtml(item.reps)}</span>
            <span class="rx-pill">Отдых ${item.restSec} сек</span>
            <span class="rx-pill">Темп ${escapeHtml(ex.tempo)}</span>
          </div>
          <div class="ex-reason">${escapeHtml(item.reason)}</div>
          <div class="muscle-tags">
            ${ex.muscles.map((m) => `<span class="muscle-tag">${escapeHtml(MUSCLE_LABELS[m] || m)}</span>`).join('')}
          </div>
          <div class="ex-card-footer">
            <button type="button" class="btn btn-outline btn-sm" data-open-ex="${ex.id}">Анимация и техника</button>
            <button type="button" class="btn btn-ghost btn-sm" data-swap-idx="${itemIdx}">Заменить</button>
          </div>
        </div>
      `;

      const canvas = card.querySelector('canvas');
      const player = new ExerciseAnimationPlayer(canvas, ex, {
        showMuscles: true,
        showPhaseBadge: true,
        autoPauseOffscreen: true,
      });
      state.planCardPlayers.push(player);

      card.querySelectorAll('[data-open-ex]').forEach((el) => {
        el.addEventListener('click', () => openExerciseModal(ex.id));
      });
      card.querySelector('[data-swap-idx]').addEventListener('click', () => {
        openSwapModal(state.selectedPlanDay, itemIdx, ex.id);
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);
  });
}

/* --------------------------- Exercise Detail Modal --------------------------- */
function openExerciseModal(exerciseId) {
  const ex = EXERCISE_MAP[exerciseId];
  if (!ex) return;

  if (state.exModalPlayer) {
    state.exModalPlayer.destroy();
    state.exModalPlayer = null;
  }

  $('exModalCategory').textContent = `${CATEGORY_LABELS[ex.category] || ex.category} • Темп ${ex.tempo}`;
  $('exerciseModalTitle').textContent = ex.name;
  $('exModalBreathing').innerHTML = `<strong>Дыхание:</strong> ${escapeHtml(ex.breathing)}`;
  $('exModalSteps').innerHTML = ex.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  $('exModalMistakes').innerHTML = ex.mistakes.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  $('exModalMuscles').innerHTML = ex.muscles
    .map((m) => `<span class="muscle-tag">${escapeHtml(MUSCLE_LABELS[m] || m)}</span>`)
    .join('');

  $('exModalPlayPauseBtn').textContent = 'Пауза';
  $('exModalMusclesToggle').checked = true;
  document.querySelector('input[name="exSpeed"][value="1"]').checked = true;
  $('exerciseModal').classList.remove('hidden');

  const canvas = $('exModalCanvas');
  state.exModalPlayer = new ExerciseAnimationPlayer(canvas, ex, {
    showMuscles: true,
    showPhaseBadge: false,
    autoPauseOffscreen: false,
    onFrame: (frame) => {
      if (frame.label) $('exModalPhase').textContent = frame.label;
    },
  });
}

/* --------------------------- Swap Exercise Modal --------------------------- */
function openSwapModal(dayIdx, itemIdx, currentExId) {
  state.swapContext = { dayIdx, itemIdx };
  const current = EXERCISE_MAP[currentExId];
  const alts = getAlternativeExercises(currentExId, state.plan.equipment);

  $('swapModalSubtitle').textContent = `Замена для «${current?.name || ''}» (${EQUIPMENT_LABELS[state.plan.equipment]}):`;
  const list = $('swapOptionsList');

  if (!alts.length) {
    list.innerHTML = '<p class="muted small">Для этого инвентаря нет других альтернатив в этой категории.</p>';
  } else {
    list.innerHTML = alts
      .map(
        (ex) => `
        <div class="swap-option" data-choose-swap="${ex.id}">
          <div>
            <strong>${escapeHtml(ex.name)}</strong>
            <div class="muted tiny">${ex.muscles.map((m) => MUSCLE_LABELS[m] || m).join(' • ')}</div>
          </div>
          <span class="btn btn-xs btn-primary">Выбрать</span>
        </div>
      `
      )
      .join('');
    list.querySelectorAll('[data-choose-swap]').forEach((row) => {
      row.addEventListener('click', () => {
        const newEx = EXERCISE_MAP[row.dataset.chooseSwap];
        if (!newEx || !state.swapContext) return;
        const item = state.plan.days[state.swapContext.dayIdx].items[state.swapContext.itemIdx];
        item.exerciseId = newEx.id;
        item.reps = newEx.defaultReps;
        item.restSec = newEx.defaultRestSec;
        item.holdSeconds = newEx.holdSeconds || 40;
        item.reason = `Заменено вручную • ${newEx.whyTemplate}`;
        saveActivePlan(state.plan);
        closeModal('swapModal');
        renderPlanTab();
        showToast(`Упражнение заменено на «${newEx.name}»`);
      });
    });
  }
  $('swapModal').classList.remove('hidden');
}

/* --------------------------- All 30 Exercises Catalog Modal --------------------------- */
function destroyCatalogPlayers() {
  state.catalogPlayers.forEach((p) => p.destroy());
  state.catalogPlayers = [];
}

function renderCatalogGrid(category = 'all') {
  destroyCatalogPlayers();
  const grid = $('catalogGrid');
  grid.innerHTML = '';
  const list = category === 'all' ? EXERCISES : EXERCISES.filter((e) => e.category === category);

  list.forEach((ex) => {
    const card = document.createElement('div');
    card.className = 'catalog-card';
    card.innerHTML = `
      <canvas width="260" height="196"></canvas>
      <div class="catalog-card-meta">
        <strong>${escapeHtml(ex.name)}</strong>
        <span class="muted tiny">${escapeHtml(CATEGORY_LABELS[ex.category] || ex.category)} • ${ex.muscles
      .slice(0, 2)
      .map((m) => MUSCLE_LABELS[m] || m)
      .join(', ')}</span>
      </div>
    `;
    const player = new ExerciseAnimationPlayer(card.querySelector('canvas'), ex, {
      showMuscles: true,
      autoPauseOffscreen: true,
    });
    state.catalogPlayers.push(player);
    card.addEventListener('click', () => openExerciseModal(ex.id));
    grid.appendChild(card);
  });
}

/* --------------------------- Fullscreen Interactive Workout Player --------------------------- */
function startWorkoutSession(dayIdx) {
  if (!state.plan?.days?.[dayIdx]) return;
  const day = state.plan.days[dayIdx];
  state.wp.active = true;
  state.wp.dayIndex = dayIdx;
  state.wp.exIdx = 0;
  state.wp.startedAt = Date.now();
  state.wp.setsState = day.items.map((item) =>
    Array.from({ length: item.sets }, () => ({
      done: false,
      weight: '',
      reps: item.reps,
    }))
  );

  $('wpDayTitle').textContent = day.title;
  $('wpActiveBody').classList.remove('hidden');
  $('wpSummaryBody').classList.add('hidden');
  $('workoutOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (state.wp.elapsedInterval) clearInterval(state.wp.elapsedInterval);
  $('wpElapsedClock').textContent = '00:00';
  state.wp.elapsedInterval = setInterval(() => {
    const elapsed = (Date.now() - state.wp.startedAt) / 1000;
    $('wpElapsedClock').textContent = formatClock(elapsed);
  }, 1000);

  stopRestTimer();
  renderWorkoutExercise();
}

function renderWorkoutExercise() {
  const day = state.plan.days[state.wp.dayIndex];
  const item = day.items[state.wp.exIdx];
  const ex = EXERCISE_MAP[item.exerciseId];
  const sets = state.wp.setsState[state.wp.exIdx];

  stopHoldTimer();

  $('wpSectionBadge').textContent = item.section;
  $('wpExerciseTitle').textContent = ex.name;
  $('wpExerciseReason').textContent = item.reason;
  $('wpBreathingCue').textContent = `Дыхание: ${ex.breathing}`;
  $('wpStepsList').innerHTML = ex.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  $('wpExCounter').textContent = `${state.wp.exIdx + 1} / ${day.items.length}`;
  $('wpPrevExBtn').disabled = state.wp.exIdx === 0;
  $('wpNextExBtn').textContent = state.wp.exIdx === day.items.length - 1 ? 'Завершить ✓' : 'Следующее →';

  // Hold timer for timed exercises
  const holdCard = $('wpHoldTimerCard');
  if (ex.isTimed) {
    state.wp.holdLeft = item.holdSeconds || ex.holdSeconds || 40;
    $('wpHoldClock').textContent = formatClock(state.wp.holdLeft);
    $('wpHoldStartBtn').textContent = 'Старт';
    holdCard.classList.remove('hidden');
  } else {
    holdCard.classList.add('hidden');
  }

  // Render sets checklist
  const list = $('wpSetsList');
  list.innerHTML = sets
    .map(
      (st, idx) => `
      <div class="set-row ${st.done ? 'done' : ''}" data-set-row="${idx}">
        <span class="set-index">Подход ${idx + 1}</span>
        <div class="set-inputs">
          <input type="text" placeholder="Повт / время" value="${escapeHtml(st.reps)}" data-set-reps="${idx}">
          ${
            state.plan.equipment !== 'home_bodyweight' && !ex.isTimed
              ? `<input type="text" placeholder="Вес (кг)" value="${escapeHtml(st.weight)}" data-set-weight="${idx}">`
              : ''
          }
        </div>
        <button type="button" class="btn btn-sm ${st.done ? 'btn-primary' : 'btn-outline'}" data-toggle-set="${idx}">
          ${st.done ? '✓ Готово' : 'Отметить'}
        </button>
      </div>
    `
    )
    .join('');

  list.querySelectorAll('[data-set-reps]').forEach((inp) => {
    inp.addEventListener('input', () => {
      sets[Number(inp.dataset.setReps)].reps = inp.value;
    });
  });
  list.querySelectorAll('[data-set-weight]').forEach((inp) => {
    inp.addEventListener('input', () => {
      sets[Number(inp.dataset.setWeight)].weight = inp.value;
    });
  });
  list.querySelectorAll('[data-toggle-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.toggleSet);
      sets[idx].done = !sets[idx].done;
      if (sets[idx].done) {
        if (state.wp.soundEnabled) beep(740, 90);
        // Auto-start rest timer if more sets remain
        const anyRemaining = sets.some((s) => !s.done);
        if (anyRemaining) startRestTimer(item.restSec || 45);
      }
      renderWorkoutExercise();
    });
  });

  // Update overall progress bar
  const totalSets = state.wp.setsState.reduce((acc, arr) => acc + arr.length, 0);
  const doneSets = state.wp.setsState.reduce((acc, arr) => acc + arr.filter((s) => s.done).length, 0);
  $('wpProgressLabel').textContent = `${doneSets} / ${totalSets} подходов`;
  $('wpProgressBar').style.width = `${totalSets ? Math.round((doneSets / totalSets) * 100) : 0}%`;

  // Live animation player
  if (!state.wp.player) {
    state.wp.player = new ExerciseAnimationPlayer($('wpAnimCanvas'), ex, {
      showMuscles: $('wpMusclesToggle').checked,
      autoPauseOffscreen: false,
      onFrame: (f) => {
        if (f.label) $('wpPhasePill').textContent = f.label;
      },
    });
  } else {
    state.wp.player.setExercise(ex);
    state.wp.player.setPlaying(true);
    $('wpPlayPauseBtn').textContent = 'Пауза';
  }
}

function startRestTimer(seconds) {
  stopRestTimer();
  state.wp.restTotal = seconds;
  state.wp.restLeft = seconds;
  const card = $('wpRestTimerCard');
  card.classList.remove('hidden');
  updateRestTimerUi();

  state.wp.restTimer = setInterval(() => {
    state.wp.restLeft -= 1;
    if (state.wp.restLeft <= 3 && state.wp.restLeft > 0 && state.wp.soundEnabled) {
      beep(520, 70);
    }
    if (state.wp.restLeft <= 0) {
      stopRestTimer();
      if (state.wp.soundEnabled) {
        beep(880, 140);
        setTimeout(() => beep(1040, 180), 150);
      }
      showToast('Отдых завершён — пора делать следующий подход!');
    } else {
      updateRestTimerUi();
    }
  }, 1000);
}

function updateRestTimerUi() {
  $('wpRestClock').textContent = String(state.wp.restLeft);
  const circ = 2 * Math.PI * 27;
  const arc = $('wpRestArc');
  arc.style.strokeDasharray = `${circ}`;
  const frac = state.wp.restTotal > 0 ? state.wp.restLeft / state.wp.restTotal : 0;
  arc.style.strokeDashoffset = `${circ * (1 - frac)}`;
}

function stopRestTimer() {
  if (state.wp.restTimer) {
    clearInterval(state.wp.restTimer);
    state.wp.restTimer = null;
  }
  $('wpRestTimerCard').classList.add('hidden');
}

function toggleHoldTimer() {
  if (state.wp.holdRunning) {
    stopHoldTimer();
    $('wpHoldStartBtn').textContent = 'Продолжить';
    return;
  }
  state.wp.holdRunning = true;
  $('wpHoldStartBtn').textContent = 'Пауза';
  if (state.wp.soundEnabled) beep(640, 90);

  state.wp.holdTimer = setInterval(() => {
    state.wp.holdLeft -= 1;
    $('wpHoldClock').textContent = formatClock(state.wp.holdLeft);
    if (state.wp.holdLeft <= 3 && state.wp.holdLeft > 0 && state.wp.soundEnabled) {
      beep(560, 70);
    }
    if (state.wp.holdLeft <= 0) {
      stopHoldTimer();
      if (state.wp.soundEnabled) {
        beep(920, 180);
        setTimeout(() => beep(1120, 220), 180);
      }
      // Auto-mark next incomplete set done
      const sets = state.wp.setsState[state.wp.exIdx];
      const nextIdx = sets.findIndex((s) => !s.done);
      if (nextIdx !== -1) {
        sets[nextIdx].done = true;
        const item = state.plan.days[state.wp.dayIndex].items[state.wp.exIdx];
        if (sets.some((s) => !s.done)) startRestTimer(item.restSec || 35);
        renderWorkoutExercise();
      }
    }
  }, 1000);
}

function stopHoldTimer() {
  if (state.wp.holdTimer) {
    clearInterval(state.wp.holdTimer);
    state.wp.holdTimer = null;
  }
  state.wp.holdRunning = false;
}

function finishWorkoutSession() {
  stopRestTimer();
  stopHoldTimer();
  if (state.wp.elapsedInterval) {
    clearInterval(state.wp.elapsedInterval);
    state.wp.elapsedInterval = null;
  }
  if (state.wp.player) {
    state.wp.player.setPlaying(false);
  }

  const day = state.plan.days[state.wp.dayIndex];
  const durationSec = Math.max(15, Math.round((Date.now() - state.wp.startedAt) / 1000));
  const totalSets = state.wp.setsState.reduce((a, arr) => a + arr.length, 0);
  const doneSets = state.wp.setsState.reduce((a, arr) => a + arr.filter((s) => s.done).length, 0);
  const doneExercises = state.wp.setsState.filter((arr) => arr.some((s) => s.done)).length;

  state.workouts = addWorkoutLog({
    dayTitle: day.title,
    equipmentLabel: state.plan.equipmentLabel,
    durationSec,
    doneSets,
    totalSets,
    doneExercises,
    totalExercises: day.items.length,
  });

  $('wpActiveBody').classList.add('hidden');
  $('wpSummaryBody').classList.remove('hidden');
  $('wpSummarySubtitle').textContent = `${day.title} сохранена в журнал прогресса.`;
  $('wpSummaryStats').innerHTML = `
    <div class="metric-box"><span class="metric-label">Время</span><span class="metric-value">${formatClock(durationSec)}</span></div>
    <div class="metric-box"><span class="metric-label">Подходы</span><span class="metric-value">${doneSets}/${totalSets}</span></div>
    <div class="metric-box"><span class="metric-label">Упражнения</span><span class="metric-value">${doneExercises}/${day.items.length}</span></div>
  `;
}

function closeWorkoutOverlay() {
  stopRestTimer();
  stopHoldTimer();
  if (state.wp.elapsedInterval) {
    clearInterval(state.wp.elapsedInterval);
    state.wp.elapsedInterval = null;
  }
  if (state.wp.player) {
    state.wp.player.destroy();
    state.wp.player = null;
  }
  state.wp.active = false;
  $('workoutOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* --------------------------- Tab 4: History & Progress --------------------------- */
async function saveCurrentCheckin() {
  if (!state.metrics) {
    showToast('Сначала проанализируйте фигуру', true);
    return;
  }
  const id = `chk_${Date.now()}`;
  const compressed = await saveCheckinPhotos(id, state.photos);
  if (compressed) state.checkinThumbCache[id] = compressed;

  const entry = {
    id,
    createdAt: new Date().toISOString(),
    profile: { ...state.profile },
    metrics: { ...state.metrics },
    analyses: JSON.parse(JSON.stringify(state.analyses)),
    aiAnalysis: state.aiAnalysis,
  };

  state.checkins = [entry, ...state.checkins];
  saveCheckins(state.checkins);
  showToast('Замер фигуры и фото сохранены в историю!');
}

async function renderHistoryTab() {
  state.checkins = loadCheckins();
  state.workouts = loadWorkoutLogs();

  // KPI cards
  const latest = state.checkins[0];
  const oldest = state.checkins[state.checkins.length - 1];
  const postureDelta =
    latest && oldest && state.checkins.length > 1
      ? latest.metrics.postureScore - oldest.metrics.postureScore
      : null;
  const totalMinutes = Math.round(state.workouts.reduce((a, w) => a + (w.durationSec || 0), 0) / 60);

  $('historyKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Сохранённых замеров</div>
      <div class="kpi-val">${state.checkins.length}</div>
      <div class="kpi-delta">Фото хранятся локально</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Индекс осанки</div>
      <div class="kpi-val">${latest ? latest.metrics.postureScore : '—'}</div>
      <div class="kpi-delta">${
        postureDelta !== null
          ? `${postureDelta >= 0 ? '+' : ''}${postureDelta} с первого замера`
          : 'Сохраните замер для динамики'
      }</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Выполнено тренировок</div>
      <div class="kpi-val">${state.workouts.length}</div>
      <div class="kpi-delta">Завершённые сессии</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Время под нагрузкой</div>
      <div class="kpi-val">${totalMinutes} мин</div>
      <div class="kpi-delta">Суммарно в журнале</div>
    </div>
  `;

  renderProgressChart();
  await renderCompareSection();
  await renderCheckinsList();
  renderWorkoutLogsList();
}

function renderProgressChart() {
  const wrap = $('progressChartWrap');
  const items = [...state.checkins].reverse();
  if (items.length < 2) {
    wrap.innerHTML = `<p class="muted small" style="text-align:center;padding:30px">Сохраните минимум 2 замера на экране анализа фигуры, чтобы увидеть график динамики осанки и V-индекса.</p>`;
    return;
  }

  const w = 520;
  const h = 200;
  const padL = 38;
  const padR = 20;
  const padT = 22;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const scores = items.map((c) => c.metrics.postureScore ?? 70);
  const minY = Math.max(30, Math.min(...scores) - 8);
  const maxY = Math.min(100, Math.max(...scores) + 6);

  const pts = items.map((c, i) => {
    const x = padL + (i / (items.length - 1)) * plotW;
    const y = padT + (1 - (scores[i] - minY) / Math.max(1, maxY - minY)) * plotH;
    return { x, y, score: scores[i], date: formatDateRu(c.createdAt).split(',')[0] };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${padT + plotH} L${pts[0].x.toFixed(1)},${padT + plotH} Z`;

  wrap.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="График индекса осанки">
      <defs>
        <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#29d4ff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#29d4ff" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      ${[0, 0.5, 1]
        .map((f) => {
          const gy = padT + f * plotH;
          const val = Math.round(maxY - f * (maxY - minY));
          return `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="rgba(148,163,184,0.18)"/>
                  <text x="${padL - 8}" y="${gy + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${val}</text>`;
        })
        .join('')}
      <path d="${areaPath}" fill="url(#scoreAreaGrad)"/>
      <path d="${linePath}" fill="none" stroke="#0ea5d6" stroke-width="2.2" stroke-linecap="round"/>
      ${pts
        .map(
          (p) => `
          <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#2ee2ff" stroke="#111926" stroke-width="2"/>
          <text x="${p.x}" y="${p.y - 9}" text-anchor="middle" fill="currentColor" font-size="10" font-weight="500">${p.score}</text>
          <text x="${p.x}" y="${h - 10}" text-anchor="middle" fill="#7c8da5" font-size="10">${p.date}</text>
        `
        )
        .join('')}
    </svg>
  `;
}

async function getThumbsForCheckin(id) {
  if (!state.checkinThumbCache[id]) {
    state.checkinThumbCache[id] = (await loadCheckinPhotos(id)) || {};
  }
  return state.checkinThumbCache[id];
}

async function renderCompareSection() {
  const wrap = $('compareContainer');
  if (state.checkins.length < 2) {
    wrap.innerHTML = `<p class="muted small" style="padding:24px 0">Когда у вас будет 2 и более сохранённых замеров, здесь появится сравнение фотографий «До / После» и разница по углам осанки.</p>`;
    return;
  }

  if (!state.compareA || !state.checkins.some((c) => c.id === state.compareA)) {
    state.compareA = state.checkins[state.checkins.length - 1].id;
  }
  if (!state.compareB || !state.checkins.some((c) => c.id === state.compareB)) {
    state.compareB = state.checkins[0].id;
  }

  const chkA = state.checkins.find((c) => c.id === state.compareA);
  const chkB = state.checkins.find((c) => c.id === state.compareB);
  const photosA = await getThumbsForCheckin(chkA.id);
  const photosB = await getThumbsForCheckin(chkB.id);
  const imgA = photosA.front || photosA.side || photosA.back || '';
  const imgB = photosB.front || photosB.side || photosB.back || '';

  const dScore = (chkB.metrics.postureScore ?? 0) - (chkA.metrics.postureScore ?? 0);
  const dV =
    chkB.metrics.shoulderToWaist && chkA.metrics.shoulderToWaist
      ? (chkB.metrics.shoulderToWaist - chkA.metrics.shoulderToWaist).toFixed(2)
      : null;
  const dHead =
    chkB.metrics.forwardHeadDeg !== null && chkA.metrics.forwardHeadDeg !== null
      ? (chkB.metrics.forwardHeadDeg - chkA.metrics.forwardHeadDeg).toFixed(1)
      : null;

  const options = state.checkins
    .map((c) => `<option value="${c.id}">${formatDateRu(c.createdAt)} (${c.metrics.postureScore} б.)</option>`)
    .join('');

  wrap.innerHTML = `
    <div class="compare-controls">
      <select id="compareSelectA">${options}</select>
      <select id="compareSelectB">${options}</select>
    </div>
    <div class="compare-photos">
      <div class="compare-photo-box">
        ${imgA ? `<img src="${imgA}" alt="До">` : '<div style="height:160px;display:grid;place-items:center" class="muted small">Нет фото</div>'}
        <span>До • ${formatDateRu(chkA.createdAt)}</span>
      </div>
      <div class="compare-photo-box">
        ${imgB ? `<img src="${imgB}" alt="После">` : '<div style="height:160px;display:grid;place-items:center" class="muted small">Нет фото</div>'}
        <span>После • ${formatDateRu(chkB.createdAt)}</span>
      </div>
    </div>
    <div class="compare-deltas">
      <div class="metric-box"><span class="metric-label">Осанка</span><span class="metric-value">${dScore >= 0 ? '+' : ''}${dScore}</span></div>
      <div class="metric-box"><span class="metric-label">V-индекс</span><span class="metric-value">${dV !== null ? `${Number(dV) >= 0 ? '+' : ''}${dV}` : '—'}</span></div>
      <div class="metric-box"><span class="metric-label">Шея (°)</span><span class="metric-value">${dHead !== null ? `${Number(dHead) > 0 ? '+' : ''}${dHead}°` : '—'}</span></div>
    </div>
  `;

  $('compareSelectA').value = state.compareA;
  $('compareSelectB').value = state.compareB;
  $('compareSelectA').addEventListener('change', (e) => {
    state.compareA = e.target.value;
    renderCompareSection();
  });
  $('compareSelectB').addEventListener('change', (e) => {
    state.compareB = e.target.value;
    renderCompareSection();
  });
}

async function renderCheckinsList() {
  const list = $('checkinsList');
  if (!state.checkins.length) {
    list.innerHTML = '<p class="muted small">Сохранённых замеров пока нет. Нажмите «Сохранить замер в историю» на экране анализа.</p>';
    return;
  }

  const rowsHtml = [];
  for (const c of state.checkins) {
    const thumbs = await getThumbsForCheckin(c.id);
    const thumb = thumbs.front || thumbs.side || thumbs.back || '';
    rowsHtml.push(`
      <div class="history-row">
        <div class="history-row-main">
          ${thumb ? `<img class="history-thumb" src="${thumb}" alt="Замер">` : '<div class="history-thumb"></div>'}
          <div>
            <strong>${formatDateRu(c.createdAt)}</strong>
            <div class="muted tiny">Осанка: ${c.metrics.postureScore} • V-индекс: ${c.metrics.shoulderToWaist ?? '—'} • Вес: ${c.profile?.weightKg ?? '—'} кг</div>
          </div>
        </div>
        <div class="history-row-actions">
          <button type="button" class="btn btn-outline btn-xs" data-load-checkin="${c.id}">Открыть</button>
          <button type="button" class="btn btn-danger-ghost btn-xs" data-del-checkin="${c.id}">✕</button>
        </div>
      </div>
    `);
  }
  list.innerHTML = rowsHtml.join('');

  list.querySelectorAll('[data-load-checkin]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const c = state.checkins.find((x) => x.id === btn.dataset.loadCheckin);
      if (!c) return;
      const photos = await getThumbsForCheckin(c.id);
      state.photos = { front: photos.front || null, side: photos.side || null, back: photos.back || null, side2: photos.side2 || null };
      state.photoImages = {};
      for (const [k, v] of Object.entries(state.photos)) {
        if (v) state.photoImages[k] = await loadImageElement(v);
      }
      state.analyses = JSON.parse(JSON.stringify(c.analyses || {}));
      state.metrics = { ...c.metrics };
      state.aiAnalysis = c.aiAnalysis || null;
      state.profile = { ...state.profile, ...(c.profile || {}) };
      syncProfileFormFromState();
      renderAnglesGrid();
      renderAnalysisTab();
      switchTab('analysis');
      showToast('Замер загружен из истории');
    });
  });

  list.querySelectorAll('[data-del-checkin]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.checkins = await deleteCheckinById(btn.dataset.delCheckin);
      renderHistoryTab();
      showToast('Замер удалён');
    });
  });
}

function renderWorkoutLogsList() {
  const list = $('workoutLogsList');
  if (!state.workouts.length) {
    list.innerHTML = '<p class="muted small">Выполненных тренировок пока нет. Откройте план и нажмите «Начать тренировку».</p>';
    return;
  }
  list.innerHTML = state.workouts
    .map(
      (w) => `
      <div class="history-row">
        <div>
          <strong>${escapeHtml(w.dayTitle)}</strong>
          <div class="muted tiny">${formatDateRu(w.completedAt)} • ${escapeHtml(w.equipmentLabel || '')}</div>
        </div>
        <div class="badge badge-good">${formatClock(w.durationSec)} • ${w.doneSets}/${w.totalSets} подх.</div>
      </div>
    `
    )
    .join('');
}

/* --------------------------- Tab 5: Nutrition & Food Photo AI --------------------------- */
const MEAL_TYPE_LABELS = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

const CONFIDENCE_LABELS = {
  high: 'Высокая точность',
  medium: 'Средняя точность',
  low: 'Оценка по виду',
};

function round1(val) {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function getLocalDateKey(d = new Date()) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function shiftDateKey(dateKey, deltaDays) {
  const parts = String(dateKey || '').split('-').map(Number);
  const base = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0) : new Date();
  base.setDate(base.getDate() + deltaDays);
  return getLocalDateKey(base);
}

function formatDateKeyLabel(dateKey) {
  const today = getLocalDateKey();
  const yesterday = shiftDateKey(today, -1);
  const parts = String(dateKey || '').split('-').map(Number);
  const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0) : new Date();
  const shortRu = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(dt);
  if (dateKey === today) return `Сегодня, ${shortRu}`;
  if (dateKey === yesterday) return `Вчера, ${shortRu}`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(dt);
}

function pickDefaultMealTypeByHour() {
  const hr = new Date().getHours();
  if (hr < 11) return 'breakfast';
  if (hr < 16) return 'lunch';
  if (hr < 21) return 'dinner';
  return 'snack';
}

function getSelectedMealType() {
  return document.querySelector('input[name="mealType"]:checked')?.value || 'lunch';
}

function setSelectedMealType(mealType) {
  const radio = document.querySelector(`input[name="mealType"][value="${mealType}"]`);
  if (radio) radio.checked = true;
}

function getDailyNutritionTargets() {
  return buildNutritionGuidance(state.profile, state.metrics || {}, state.aiAnalysis);
}

function getMealsForDate(dateKey) {
  return state.meals.filter((m) => m.dateKey === dateKey);
}

function computeIngredientsTotals(ingredients) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  return {
    grams: Math.round(list.reduce((a, x) => a + (Number(x.grams) || 0), 0)),
    kcal: Math.round(list.reduce((a, x) => a + (Number(x.kcal) || 0), 0)),
    protein: round1(list.reduce((a, x) => a + (Number(x.protein) || 0), 0)),
    fat: round1(list.reduce((a, x) => a + (Number(x.fat) || 0), 0)),
    carbs: round1(list.reduce((a, x) => a + (Number(x.carbs) || 0), 0)),
    fiber: round1(list.reduce((a, x) => a + (Number(x.fiber) || 0), 0)),
  };
}

function createDraftIngredient(raw = {}) {
  const grams = Math.max(0, Math.round(Number(raw.grams ?? 100)));
  const baseGrams = grams > 0 ? grams : 100;
  let kcal = Math.max(0, Math.round(Number(raw.kcal ?? 0)));
  const protein = Math.max(0, round1(raw.protein ?? 0));
  const fat = Math.max(0, round1(raw.fat ?? 0));
  const carbs = Math.max(0, round1(raw.carbs ?? 0));
  const fiber = Math.max(0, round1(raw.fiber ?? 0));
  if (kcal === 0 && (protein > 0 || fat > 0 || carbs > 0)) {
    kcal = Math.round(protein * 4 + fat * 9 + carbs * 4);
  }
  const per100 = raw.per100
    ? { ...raw.per100 }
    : {
        kcal: (kcal / baseGrams) * 100,
        protein: (protein / baseGrams) * 100,
        fat: (fat / baseGrams) * 100,
        carbs: (carbs / baseGrams) * 100,
        fiber: (fiber / baseGrams) * 100,
      };
  return {
    id: raw.id || `ing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(raw.name || ''),
    grams,
    kcal,
    protein,
    fat,
    carbs,
    fiber,
    macrosOpen: Boolean(raw.macrosOpen),
    per100,
  };
}

async function setMealPhotoDataUrl(dataUrl) {
  const compressed = await compressImageDataUrl(dataUrl, 1024, 0.84);
  state.nutrition.photo = compressed;
  $('mealPhotoPreviewImg').src = compressed;
  $('mealPhotoEmpty').classList.add('hidden');
  $('mealPhotoPreviewWrap').classList.remove('hidden');
}

function clearMealPhoto() {
  state.nutrition.photo = null;
  $('mealPhotoPreviewImg').removeAttribute('src');
  $('mealPhotoPreviewWrap').classList.add('hidden');
  $('mealPhotoEmpty').classList.remove('hidden');
}

function generateSampleMealDataUrl() {
  const c = document.createElement('canvas');
  c.width = 760;
  c.height = 520;
  const ctx = c.getContext('2d');

  // Dark slate tabletop
  const bg = ctx.createRadialGradient(380, 260, 60, 380, 260, 460);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(1, '#0b1120');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);

  // Plate shadow & ceramic rim
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(380, 262, 208, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(380, 262, 174, 0, Math.PI * 2);
  ctx.stroke();

  // Buckwheat portion (top-left)
  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath();
  ctx.ellipse(308, 206, 74, 58, -0.3, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 110; i++) {
    const ang = (i * 2.39996) % (Math.PI * 2);
    const rad = Math.sqrt(i / 110) * 62;
    const gx = 308 + Math.cos(ang) * rad;
    const gy = 206 + Math.sin(ang) * rad * 0.78;
    ctx.fillStyle = i % 3 === 0 ? '#a47148' : i % 2 === 0 ? '#6f4518' : '#bc8a5f';
    ctx.beginPath();
    ctx.ellipse(gx, gy, 4.2, 2.8, ang, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grilled chicken breast slices (bottom-left/right)
  const slices = [
    { x: 345, y: 325, rx: 68, ry: 24, rot: 0.18 },
    { x: 365, y: 356, rx: 60, ry: 21, rot: 0.14 },
  ];
  slices.forEach((s) => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = '#f3d5b5';
    ctx.beginPath();
    ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9c5221';
    ctx.lineWidth = 4;
    for (let x = -42; x <= 42; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x - 6, -s.ry * 0.65);
      ctx.lineTo(x + 6, s.ry * 0.65);
      ctx.stroke();
    }
    ctx.restore();
  });

  // Fresh salad: cucumber, cherry tomatoes & avocado (right side)
  const cucumbers = [
    [455, 205],
    [486, 228],
    [448, 244],
    [482, 266],
  ];
  cucumbers.forEach(([cx, cy]) => {
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bbf7d0';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  });

  const tomatoes = [
    [432, 176],
    [470, 182],
    [446, 282],
  ];
  tomatoes.forEach(([tx, ty]) => {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(tx, ty, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(tx - 4, ty - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Avocado fan
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(495, 304 + i * 12);
    ctx.rotate(-0.25 + i * 0.12);
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return c.toDataURL('image/jpeg', 0.88);
}

async function callMealVisionApi() {
  const note = $('mealNoteInput').value.trim();
  const mealType = getSelectedMealType();
  const dailyTarget = getDailyNutritionTargets();
  const compactPhoto = state.nutrition.photo
    ? await compressImageDataUrl(state.nutrition.photo, 840, 0.8)
    : '';

  if (!compactPhoto && note.length < 3) {
    throw new Error('Загрузите фото блюда или опишите приём пищи словами.');
  }

  if (IS_CLOUD_MODE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 85000);
    let resp;
    try {
      resp = await fetch(`${CLOUD_API_BASE}/fitness/meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          photo: compactPhoto,
          note,
          mealType,
          profile: state.profile,
          dailyTarget,
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Сервер AI не успел ответить за 85 сек. Попробуйте нажать кнопку ещё раз.');
      }
      throw new Error('Не удалось связаться с сервером AI-нутрициолога.');
    } finally {
      clearTimeout(timer);
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false || !data.meal) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }
    state.cloudAi = {
      checked: true,
      ready: true,
      provider: data.provider || 'gemini',
      model: data.model || state.cloudAi.model,
    };
    syncInlineAiFromState();
    updateAiStatusIndicator();
    return {
      provider: data.provider || 'gemini',
      model: data.model || '',
      ...data.meal,
    };
  }

  if (!isAiReady()) {
    openAiSettingsModal();
    throw new Error('Укажите API-ключ AI Ассистента или нажмите «+ Вручную» для самостоятельного ввода.');
  }

  const meta = getProviderMeta(state.aiSettings.provider);
  const resp = await fetch('/api/meal-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: state.aiSettings.provider,
      apiKey: state.aiSettings.apiKey,
      model: state.aiSettings.model || meta.model,
      baseUrl: state.aiSettings.baseUrl,
      photo: compactPhoto,
      note,
      mealType,
      profile: state.profile,
      dailyTarget,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false || !data.meal) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return {
    provider: data.provider,
    model: data.model,
    ...data.meal,
  };
}

async function handleAnalyzeMealClick() {
  const note = $('mealNoteInput').value.trim();
  if (!state.nutrition.photo && note.length < 3) {
    showToast('Добавьте фото тарелки или напишите, что вы съели', true);
    return;
  }

  const btn = $('analyzeMealBtn');
  const statusEl = $('mealAnalyzeStatus');
  const statusTxt = $('mealAnalyzeStatusText');
  btn.disabled = true;
  statusEl.classList.remove('hidden');
  statusTxt.textContent = IS_CLOUD_MODE && !state.cloudAi.ready
    ? 'Подключаемся к серверу AI-нутрициолога (первый запрос 20–45 сек)...'
    : 'Распознаём блюдо, ингредиенты, вес порции и считаем КБЖУ...';

  try {
    const result = await callMealVisionApi();
    openMealDraft(result, null);
    showToast(`Блюдо «${result.dishName}» разобрано — проверьте граммы и сохраните!`);
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    statusEl.classList.add('hidden');
  }
}

function openMealDraft(mealData, editingId = null) {
  const rawIngs = Array.isArray(mealData.ingredients) && mealData.ingredients.length
    ? mealData.ingredients
    : [{ name: mealData.dishName || 'Блюдо', grams: 250, kcal: 320, protein: 22, fat: 10, carbs: 32, fiber: 4 }];

  state.nutrition.draft = {
    editingId,
    mealType: mealData.mealType || getSelectedMealType(),
    dishName: mealData.dishName || 'Приём пищи',
    confidence: mealData.confidence || 'medium',
    portionNote: mealData.portionNote || '',
    healthScore: mealData.healthScore ?? null,
    goalFeedback: mealData.goalFeedback || '',
    tips: Array.isArray(mealData.tips) ? mealData.tips : [],
    existingThumb: mealData.thumb || null,
    ingredients: rawIngs.map((ing) => createDraftIngredient(ing)),
  };

  renderMealDraftCard();
  $('mealDraftCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openManualMealDraft() {
  const noteTitle = $('mealNoteInput').value.trim().slice(0, 60);
  openMealDraft(
    {
      dishName: noteTitle || `${MEAL_TYPE_LABELS[getSelectedMealType()]}`,
      confidence: 'high',
      portionNote: '',
      healthScore: null,
      goalFeedback: '',
      tips: [],
      ingredients: [
        { name: noteTitle || 'Продукт 1', grams: 150, kcal: 210, protein: 18, fat: 7, carbs: 18, fiber: 2, macrosOpen: true },
      ],
    },
    null
  );
}

function renderMealDraftCard() {
  const draft = state.nutrition.draft;
  const card = $('mealDraftCard');
  if (!draft) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  $('draftModeLabel').textContent = draft.editingId
    ? 'Редактирование записи (кнопки − / + меняют вес и КБЖУ):'
    : 'Проверьте вес продуктов (кнопки − / + меняют КБЖУ на лету):';
  $('draftDishName').value = draft.dishName;
  $('saveDraftMealBtn').textContent = draft.editingId ? '✓ Обновить запись' : '✓ Сохранить в дневник';

  const badges = [];
  if (draft.confidence && !draft.editingId) {
    const cls = draft.confidence === 'high' ? 'badge-good' : draft.confidence === 'low' ? 'badge-watch' : 'badge-muted';
    badges.push(`<span class="badge ${cls}">${escapeHtml(CONFIDENCE_LABELS[draft.confidence] || 'AI-оценка')}</span>`);
  }
  if (draft.healthScore) {
    const cls = draft.healthScore >= 78 ? 'badge-good' : draft.healthScore >= 58 ? 'badge-watch' : 'badge-focus';
    badges.push(`<span class="badge ${cls}">Баланс: ${draft.healthScore}/100</span>`);
  }
  $('draftBadges').innerHTML = badges.join('');

  const pNote = $('draftPortionNote');
  if (draft.portionNote) {
    pNote.textContent = `Порция: ${draft.portionNote}`;
    pNote.classList.remove('hidden');
  } else {
    pNote.classList.add('hidden');
  }

  renderDraftIngredientsRows();
  renderDraftTotalsBar();

  const fb = $('draftAiFeedback');
  if (draft.goalFeedback || (draft.tips && draft.tips.length)) {
    fb.classList.remove('hidden');
    fb.innerHTML = `
      ${draft.goalFeedback ? `<div><strong>Совет по цели:</strong> ${escapeHtml(draft.goalFeedback)}</div>` : ''}
      ${draft.tips?.length ? `<ul>${draft.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
    `;
  } else {
    fb.classList.add('hidden');
    fb.innerHTML = '';
  }
}

function renderDraftIngredientsRows() {
  const draft = state.nutrition.draft;
  const wrap = $('draftIngredientsList');
  if (!draft) return;

  wrap.innerHTML = draft.ingredients
    .map(
      (ing) => `
      <div class="draft-ing-card" data-ing-id="${ing.id}">
        <div class="draft-ing-top">
          <input type="text" class="draft-ing-name-input" value="${escapeHtml(ing.name)}" placeholder="Название продукта" data-ing-field="name" aria-label="Название продукта">
          <button type="button" class="btn btn-danger-ghost draft-remove-btn" data-remove-ing="${ing.id}" title="Удалить продукт" aria-label="Удалить продукт">✕</button>
        </div>
        <div class="draft-ing-mid">
          <div class="gram-stepper">
            <button type="button" class="gram-step-btn" data-gram-delta="-20" aria-label="Уменьшить вес">−</button>
            <div class="gram-input-wrap">
              <input type="number" inputmode="numeric" min="0" max="3000" step="5" value="${ing.grams}" data-ing-field="grams" aria-label="Вес в граммах">
              <span class="gram-unit">г</span>
            </div>
            <button type="button" class="gram-step-btn" data-gram-delta="20" aria-label="Увеличить вес">+</button>
          </div>
          <span class="draft-ing-kcal" data-ing-kcal>${ing.kcal} ккал</span>
        </div>
        <div class="draft-ing-bottom">
          <span class="draft-macro-Readout" data-ing-macro-summary>Б <strong>${ing.protein}</strong> • Ж <strong>${ing.fat}</strong> • У <strong>${ing.carbs}</strong> г</span>
          <button type="button" class="draft-toggle-macros-btn" data-toggle-macros>${ing.macrosOpen ? 'Скрыть БЖУ' : 'Изм. БЖУ'}</button>
        </div>
        <div class="draft-ing-macros ${ing.macrosOpen ? '' : 'hidden'}" data-macros-panel>
          <label class="macro-mini-field"><span>Белки (г)</span><input type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${ing.protein}" data-ing-macro="protein" aria-label="Белки (г)"></label>
          <label class="macro-mini-field"><span>Жиры (г)</span><input type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${ing.fat}" data-ing-macro="fat" aria-label="Жиры (г)"></label>
          <label class="macro-mini-field"><span>Углеводы (г)</span><input type="number" inputmode="decimal" min="0" max="600" step="0.5" value="${ing.carbs}" data-ing-macro="carbs" aria-label="Углеводы (г)"></label>
        </div>
      </div>
    `
    )
    .join('');

  wrap.querySelectorAll('.draft-ing-card').forEach((row) => {
    const ingId = row.dataset.ingId;
    const getIng = () => state.nutrition.draft?.ingredients.find((x) => x.id === ingId);

    const syncRowReadout = (ing) => {
      row.querySelector('[data-ing-kcal]').textContent = `${ing.kcal} ккал`;
      row.querySelector('[data-ing-macro-summary]').innerHTML =
        `Б <strong>${ing.protein}</strong> • Ж <strong>${ing.fat}</strong> • У <strong>${ing.carbs}</strong> г`;
      row.querySelector('[data-ing-macro="protein"]').value = String(ing.protein);
      row.querySelector('[data-ing-macro="fat"]').value = String(ing.fat);
      row.querySelector('[data-ing-macro="carbs"]').value = String(ing.carbs);
    };

    const applyGrams = (nextGrams) => {
      const ing = getIng();
      if (!ing) return;
      const g = Math.max(0, Math.min(3000, Math.round(Number(nextGrams) || 0)));
      ing.grams = g;
      ing.kcal = Math.round((ing.per100.kcal * g) / 100);
      ing.protein = round1((ing.per100.protein * g) / 100);
      ing.fat = round1((ing.per100.fat * g) / 100);
      ing.carbs = round1((ing.per100.carbs * g) / 100);
      ing.fiber = round1((ing.per100.fiber * g) / 100);
      syncRowReadout(ing);
      renderDraftTotalsBar();
    };

    const nameInput = row.querySelector('[data-ing-field="name"]');
    nameInput.addEventListener('input', () => {
      const ing = getIng();
      if (ing) ing.name = nameInput.value;
    });

    const gramsInput = row.querySelector('[data-ing-field="grams"]');
    gramsInput.addEventListener('input', () => {
      applyGrams(gramsInput.value);
    });

    row.querySelectorAll('[data-gram-delta]').forEach((stepBtn) => {
      stepBtn.addEventListener('click', () => {
        const ing = getIng();
        if (!ing) return;
        const rawDelta = Number(stepBtn.dataset.gramDelta) || 0;
        const step = rawDelta < 0 && ing.grams <= 30 ? -5 : rawDelta > 0 && ing.grams < 20 ? 10 : rawDelta;
        const nextG = Math.max(0, ing.grams + step);
        gramsInput.value = String(nextG);
        applyGrams(nextG);
      });
    });

    const toggleBtn = row.querySelector('[data-toggle-macros]');
    const macrosPanel = row.querySelector('[data-macros-panel]');
    toggleBtn.addEventListener('click', () => {
      const ing = getIng();
      if (!ing) return;
      ing.macrosOpen = !ing.macrosOpen;
      macrosPanel.classList.toggle('hidden', !ing.macrosOpen);
      toggleBtn.textContent = ing.macrosOpen ? 'Скрыть БЖУ' : 'Изм. БЖУ';
    });

    row.querySelectorAll('[data-ing-macro]').forEach((macroInp) => {
      macroInp.addEventListener('input', () => {
        const ing = getIng();
        if (!ing) return;
        const field = macroInp.dataset.ingMacro;
        ing[field] = Math.max(0, round1(Number(macroInp.value) || 0));
        ing.kcal = Math.round(ing.protein * 4 + ing.fat * 9 + ing.carbs * 4);
        const baseG = ing.grams > 0 ? ing.grams : 100;
        ing.per100 = {
          kcal: (ing.kcal / baseG) * 100,
          protein: (ing.protein / baseG) * 100,
          fat: (ing.fat / baseG) * 100,
          carbs: (ing.carbs / baseG) * 100,
          fiber: (ing.fiber / baseG) * 100,
        };
        row.querySelector('[data-ing-kcal]').textContent = `${ing.kcal} ккал`;
        row.querySelector('[data-ing-macro-summary]').innerHTML =
          `Б <strong>${ing.protein}</strong> • Ж <strong>${ing.fat}</strong> • У <strong>${ing.carbs}</strong> г`;
        renderDraftTotalsBar();
      });
    });

    row.querySelector('[data-remove-ing]').addEventListener('click', () => {
      if (!state.nutrition.draft) return;
      state.nutrition.draft.ingredients = state.nutrition.draft.ingredients.filter((x) => x.id !== ingId);
      renderDraftIngredientsRows();
      renderDraftTotalsBar();
    });
  });
}

function renderDraftTotalsBar() {
  const draft = state.nutrition.draft;
  if (!draft) return;
  const t = computeIngredientsTotals(draft.ingredients);
  $('draftTotalsBar').innerHTML = `
    <div class="draft-totals-head">
      <strong>Итого: ${t.kcal} ккал</strong>
      <span>Вес: ${t.grams} г${t.fiber > 0 ? ` • Клетч. ${t.fiber} г` : ''}</span>
    </div>
    <div class="draft-totals-macros">
      <div class="draft-total-cell"><span>Белки</span><strong>${t.protein} г</strong></div>
      <div class="draft-total-cell"><span>Жиры</span><strong>${t.fat} г</strong></div>
      <div class="draft-total-cell"><span>Углеводы</span><strong>${t.carbs} г</strong></div>
    </div>
  `;
}

async function saveCurrentMealDraft() {
  const draft = state.nutrition.draft;
  if (!draft) return;
  const dishName = $('draftDishName').value.trim() || draft.dishName || 'Приём пищи';
  const cleanIngs = draft.ingredients
    .map((x) => ({
      name: x.name.trim() || dishName,
      grams: Math.max(0, Math.round(Number(x.grams) || 0)),
      kcal: Math.max(0, Math.round(Number(x.kcal) || 0)),
      protein: Math.max(0, round1(x.protein)),
      fat: Math.max(0, round1(x.fat)),
      carbs: Math.max(0, round1(x.carbs)),
      fiber: Math.max(0, round1(x.fiber)),
    }))
    .filter((x) => x.grams > 0 || x.kcal > 0);

  if (!cleanIngs.length) {
    showToast('Добавьте хотя бы один ингредиент с весом больше 0 г', true);
    return;
  }

  const totals = computeIngredientsTotals(cleanIngs);
  const mealType = getSelectedMealType();
  let thumb = draft.existingThumb || null;
  if (state.nutrition.photo) {
    thumb = await compressImageDataUrl(state.nutrition.photo, 220, 0.65);
  }

  if (draft.editingId) {
    state.meals = state.meals.map((m) =>
      m.id === draft.editingId
        ? {
            ...m,
            mealType,
            dishName,
            ingredients: cleanIngs,
            totals,
            thumb: thumb || m.thumb || null,
          }
        : m
    );
    showToast(`Запись «${dishName}» обновлена`);
  } else {
    const entry = {
      id: `meal_${Date.now()}`,
      dateKey: state.nutrition.selectedDate || getLocalDateKey(),
      createdAt: new Date().toISOString(),
      mealType,
      dishName,
      confidence: draft.confidence || 'medium',
      portionNote: draft.portionNote || '',
      healthScore: draft.healthScore ?? null,
      goalFeedback: draft.goalFeedback || '',
      tips: draft.tips || [],
      ingredients: cleanIngs,
      totals,
      thumb,
    };
    state.meals = [entry, ...state.meals];
    showToast(`«${dishName}» (${totals.kcal} ккал) добавлено в дневник!`);
  }

  saveMeals(state.meals);
  state.nutrition.draft = null;
  $('mealNoteInput').value = '';
  clearMealPhoto();
  renderMealDraftCard();
  renderNutritionTab();
}

function adjustDailyWater(deltaMl) {
  const dateKey = state.nutrition.selectedDate || getLocalDateKey();
  const cur = Number(state.waterByDate[dateKey]) || 0;
  const next = Math.max(0, Math.min(8000, cur + deltaMl));
  if (next === 0) {
    delete state.waterByDate[dateKey];
  } else {
    state.waterByDate[dateKey] = next;
  }
  saveWaterByDate(state.waterByDate);
  renderNutritionMacroCards();
}

function renderNutritionMacroCards() {
  const dateKey = state.nutrition.selectedDate || getLocalDateKey();
  const target = getDailyNutritionTargets();
  const dayMeals = getMealsForDate(dateKey);

  const eaten = {
    kcal: Math.round(dayMeals.reduce((a, m) => a + (Number(m.totals?.kcal) || 0), 0)),
    protein: round1(dayMeals.reduce((a, m) => a + (Number(m.totals?.protein) || 0), 0)),
    fat: round1(dayMeals.reduce((a, m) => a + (Number(m.totals?.fat) || 0), 0)),
    carbs: round1(dayMeals.reduce((a, m) => a + (Number(m.totals?.carbs) || 0), 0)),
    fiber: round1(dayMeals.reduce((a, m) => a + (Number(m.totals?.fiber) || 0), 0)),
  };
  const waterMl = Number(state.waterByDate[dateKey]) || 0;
  const targetWaterMl = target.waterMl || Math.round((target.waterLiters || 2.4) * 1000);

  const goalName = GOAL_LABELS[state.profile.goal] || 'Сбалансированная форма';
  $('nutritionTargetSub').textContent = `Цель: ${goalName} • ${state.profile.weightKg} кг`;

  const pct = (val, max) => (max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0);
  const kcalPctRaw = target.targetKcal > 0 ? Math.round((eaten.kcal / target.targetKcal) * 100) : 0;
  const kcalPctRing = Math.min(100, Math.max(0, kcalPctRaw));
  const ringCirc = 194.78; // 2 * pi * 31
  const ringOffset = +(ringCirc * (1 - kcalPctRing / 100)).toFixed(2);
  const isOverKcal = eaten.kcal > target.targetKcal * 1.06;

  const kcalDiff = target.targetKcal - eaten.kcal;
  const kcalSub = kcalDiff >= 0
    ? `Осталось ${kcalDiff} ккал`
    : `Превышение +${Math.abs(kcalDiff)} ккал`;

  $('nutritionMacroCards').innerHTML = `
    <div class="nutri-summary-layout">
      <div class="nutri-kcal-hero">
        <div class="nutri-ring-wrap">
          <svg viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r="39" fill="none" stroke="rgba(56, 220, 255, 0.34)" stroke-width="1.2" stroke-dasharray="1.4 4.8"></circle>
            <circle cx="42" cy="42" r="31" fill="none" stroke="rgba(255, 255, 255, 0.11)" stroke-width="5.2"></circle>
            <circle cx="42" cy="42" r="31" fill="none"
              class="nutri-glow-arc"
              stroke="${isOverKcal ? '#ff7b72' : '#2ee2ff'}"
              stroke-width="5.2" stroke-linecap="round"
              stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}"></circle>
          </svg>
          <span class="nutri-ring-pct">${kcalPctRaw}<small>%</small></span>
        </div>
        <div class="nutri-kcal-copy">
          <span class="nutri-kcal-eyebrow">Калории за день</span>
          <div class="nutri-kcal-main">${eaten.kcal} <small>/ ${target.targetKcal}</small></div>
          <div class="nutri-kcal-rem ${kcalDiff < 0 ? 'over' : ''}">${kcalSub}</div>
        </div>
      </div>

      <div class="nutri-macros-3col">
        <div class="macro-mini-card">
          <span class="macro-mini-name">Белки</span>
          <span class="macro-mini-val">${eaten.protein} <small>/ ${target.proteinGrams} г</small></span>
          <div class="macro-bar-track">
            <div class="macro-bar-fill protein" style="width:${pct(eaten.protein, target.proteinGrams)}%"></div>
          </div>
        </div>
        <div class="macro-mini-card">
          <span class="macro-mini-name">Жиры</span>
          <span class="macro-mini-val">${eaten.fat} <small>/ ${target.fatGrams} г</small></span>
          <div class="macro-bar-track">
            <div class="macro-bar-fill fat ${eaten.fat > target.fatGrams * 1.15 ? 'over' : ''}" style="width:${pct(eaten.fat, target.fatGrams)}%"></div>
          </div>
        </div>
        <div class="macro-mini-card">
          <span class="macro-mini-name">Углеводы</span>
          <span class="macro-mini-val">${eaten.carbs} <small>/ ${target.carbsGrams} г</small></span>
          <div class="macro-bar-track">
            <div class="macro-bar-fill carbs" style="width:${pct(eaten.carbs, target.carbsGrams)}%"></div>
          </div>
        </div>
      </div>

      <div class="nutri-water-card">
        <div class="nutri-water-top">
          <span class="nutri-water-label"><svg class="water-inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.7 6.4 9.5a7.5 7.5 0 1 0 11.2 0Z"/></svg>Вода</span>
          <span class="nutri-water-val">${waterMl} <small>/ ${targetWaterMl} мл</small></span>
        </div>
        <div class="macro-bar-track">
          <div class="macro-bar-fill water" style="width:${pct(waterMl, targetWaterMl)}%"></div>
        </div>
        <div class="water-btns">
          <button type="button" class="btn btn-outline btn-xs" data-water-delta="250">+250 мл</button>
          <button type="button" class="btn btn-outline btn-xs" data-water-delta="500">+500 мл</button>
          <button type="button" class="btn btn-ghost btn-xs water-minus-btn" data-water-delta="-250" title="Убрать 250 мл" aria-label="Убрать 250 мл">−</button>
        </div>
      </div>
    </div>
  `;

  $('nutritionMacroCards').querySelectorAll('[data-water-delta]').forEach((btn) => {
    btn.addEventListener('click', () => adjustDailyWater(Number(btn.dataset.waterDelta)));
  });
}

function renderDailyMealsList() {
  const dateKey = state.nutrition.selectedDate || getLocalDateKey();
  const dayMeals = getMealsForDate(dateKey);
  const totalKcal = Math.round(dayMeals.reduce((a, m) => a + (Number(m.totals?.kcal) || 0), 0));

  $('dailyMealsTitle').textContent = 'Съедено за день';
  $('dailyMealsSummaryBadge').textContent = dayMeals.length
    ? `${dayMeals.length} ${dayMeals.length === 1 ? 'приём' : dayMeals.length >= 2 && dayMeals.length <= 4 ? 'приёма' : 'приёмов'} • ${totalKcal} ккал`
    : '0 ккал';

  const list = $('dailyMealsList');
  if (!dayMeals.length) {
    list.innerHTML = `<p class="muted small" style="padding:10px 0">Пока нет записей за этот день. Снимите блюдо на камеру или напишите текстом выше — ИИ посчитает КБЖУ.</p>`;
    return;
  }

  list.innerHTML = dayMeals
    .map((m) => {
      const t = m.totals || {};
      const timeStr = m.createdAt
        ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(m.createdAt))
        : '';
      const ingsSummary = (m.ingredients || [])
        .map((i) => `${escapeHtml(i.name)} (${i.grams} г)`)
        .join(' • ');
      return `
        <div class="meal-log-card">
          <div class="meal-log-top">
            <div class="meal-log-main">
              ${m.thumb ? `<img class="meal-log-thumb" src="${m.thumb}" alt="${escapeHtml(m.dishName)}">` : ''}
              <div>
                <div class="muted tiny">${escapeHtml(MEAL_TYPE_LABELS[m.mealType] || 'Приём пищи')}${timeStr ? ` • ${timeStr}` : ''}</div>
                <div class="meal-log-title">${escapeHtml(m.dishName)}</div>
              </div>
            </div>
            <div class="meal-log-actions">
              <button type="button" class="btn btn-outline btn-xs" data-edit-meal="${m.id}">Изменить</button>
              <button type="button" class="btn btn-danger-ghost btn-xs" data-del-meal="${m.id}" title="Удалить">✕</button>
            </div>
          </div>
          ${ingsSummary ? `<div class="meal-log-ings">${ingsSummary}</div>` : ''}
          <div class="meal-log-macros">
            <span class="rx-pill rx-pill-accent">${t.kcal ?? 0} ккал</span>
            <span class="rx-pill">Б ${t.protein ?? 0} г</span>
            <span class="rx-pill">Ж ${t.fat ?? 0} г</span>
            <span class="rx-pill">У ${t.carbs ?? 0} г</span>
            ${t.grams ? `<span class="muted tiny" style="margin-left:auto">${t.grams} г</span>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('[data-edit-meal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const meal = state.meals.find((x) => x.id === btn.dataset.editMeal);
      if (!meal) return;
      setSelectedMealType(meal.mealType || 'lunch');
      openMealDraft(JSON.parse(JSON.stringify(meal)), meal.id);
    });
  });

  list.querySelectorAll('[data-del-meal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.meals = state.meals.filter((x) => x.id !== btn.dataset.delMeal);
      saveMeals(state.meals);
      if (state.nutrition.draft?.editingId === btn.dataset.delMeal) {
        state.nutrition.draft = null;
        renderMealDraftCard();
      }
      renderNutritionTab();
      showToast('Запись удалена из дневника');
    });
  });
}

function renderWeeklyNutritionMini() {
  const wrap = $('weeklyNutritionMini');
  const today = getLocalDateKey();
  const targetKcal = getDailyNutritionTargets().targetKcal || 2000;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dk = shiftDateKey(today, -i);
    const kcal = Math.round(
      getMealsForDate(dk).reduce((a, m) => a + (Number(m.totals?.kcal) || 0), 0)
    );
    const parts = dk.split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    const label = i === 0 ? 'Сег' : new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dt);
    days.push({ dk, kcal, label });
  }
  const maxBar = Math.max(targetKcal * 1.15, ...days.map((d) => d.kcal), 1);

  wrap.innerHTML = `
    <div class="weekly-bars">
      ${days
        .map((d) => {
          const hPct = d.kcal > 0 ? Math.max(8, Math.round((d.kcal / maxBar) * 100)) : 0;
          const over = d.kcal > targetKcal * 1.08;
          const isSelected = d.dk === state.nutrition.selectedDate;
          return `
            <div class="weekly-bar-col ${isSelected ? 'active' : ''}" data-pick-date="${d.dk}" title="${d.dk}: ${d.kcal} ккал">
              <span class="weekly-bar-val">${d.kcal > 0 ? d.kcal : '—'}</span>
              <div class="weekly-bar-wrap">
                <div class="weekly-bar-fill ${over ? 'over' : ''}" style="height:${hPct}%"></div>
              </div>
              <span class="weekly-bar-day">${escapeHtml(d.label)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-pick-date]').forEach((col) => {
    col.addEventListener('click', () => {
      state.nutrition.selectedDate = col.dataset.pickDate;
      renderNutritionTab();
    });
  });
}

function renderNutritionTab() {
  const today = getLocalDateKey();
  if (!state.nutrition.selectedDate) {
    state.nutrition.selectedDate = today;
  }
  const dk = state.nutrition.selectedDate;
  $('mealDateInput').value = dk;
  if ($('mealDateLabel')) {
    $('mealDateLabel').textContent = formatDateKeyLabel(dk);
  }
  if ($('mealTodayBtn')) {
    $('mealTodayBtn').classList.toggle('hidden', dk === today);
  }
  renderNutritionMacroCards();
  renderDailyMealsList();
  renderWeeklyNutritionMini();
}

/* --------------------------- AI Settings & Generic Modal Helpers --------------------------- */
function openAiSettingsModal() {
  if (IS_CLOUD_MODE) {
    detectServerEnvProviders(true);
    return;
  }
  const s = state.aiSettings;
  const prov = s.provider || 'openai';
  const meta = getProviderMeta(prov);
  $('aiEnabledCheck').checked = Boolean(s.enabled);
  $('aiProviderSelect').value = prov;
  $('aiModelInput').value = s.model || meta.model;
  $('aiModelInput').placeholder = meta.model;
  renderModelSuggestions(prov);
  $('aiBaseUrlInput').value = s.baseUrl || '';
  if (meta.placeholderUrl) $('aiBaseUrlInput').placeholder = meta.placeholderUrl;
  $('aiApiKeyInput').value = s.apiKey || '';
  $('aiRememberKeyCheck').checked = Boolean(s.rememberKey);
  $('aiBaseUrlField').classList.toggle('hidden', prov === 'gemini');
  setAiFeedback('modalAiFeedback', '', '');
  $('aiSettingsModal').classList.remove('hidden');
}

function closeModal(id) {
  $(id).classList.add('hidden');
  if (id === 'cameraModal') stopCameraStream();
  if (id === 'exerciseModal' && state.exModalPlayer) {
    state.exModalPlayer.destroy();
    state.exModalPlayer = null;
  }
  if (id === 'catalogModal') destroyCatalogPlayers();
}

/* --------------------------- Event Wiring & Init --------------------------- */
function initEvents() {
  // Header nav & theme
  $('brandHome').addEventListener('click', () => switchTab('capture'));
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-goto-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.gotoTab));
  });
  $('themeToggleBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // Tab 1 actions
  $('clearPhotosBtn').addEventListener('click', () => {
    state.photos = { front: null, side: null, back: null, side2: null };
    renderAnglesGrid();
    showToast('Фото очищены');
  });
  $('profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runFullAnalysis();
  });

  // Tab 2 overlay controls + interactive landmark dragging
  const syncLayers = () => {
    state.overlay.showPosture = $('layerPosture').checked;
    state.overlay.showProportions = $('layerProportions').checked;
    state.overlay.showSkeleton = $('layerSkeleton').checked;
    drawCurrentAnalysisCanvas();
  };
  ['layerPosture', 'layerProportions', 'layerSkeleton'].forEach((id) => {
    $(id).addEventListener('change', syncLayers);
  });

  $('toggleEditPointsBtn').addEventListener('click', () => {
    state.overlay.editMode = !state.overlay.editMode;
    $('toggleEditPointsBtn').classList.toggle('active', state.overlay.editMode);
    $('toggleEditPointsBtn').textContent = state.overlay.editMode ? 'Готово (правка вкл)' : 'Поправить точки';
    $('editPointsHint').classList.toggle('hidden', !state.overlay.editMode);
    drawCurrentAnalysisCanvas();
  });

  attachLandmarkEditor(
    $('analysisCanvas'),
    () => ({
      editMode: state.overlay.editMode,
      analysis: state.analyses[state.selectedAnalysisAngle],
    }),
    (activeKey, _pt, finished) => {
      state.overlay.activeHandle = activeKey;
      state.metrics = computeBodyMetrics(state.analyses, state.profile);
      drawCurrentAnalysisCanvas();
      renderAnalysisMetricsPanel();
      if (finished) showToast('Метрики пересчитаны по обновлённым точкам');
    }
  );

  $('rebuildPlanFromEditsBtn').addEventListener('click', () => {
    state.plan = generateWorkoutPlan(state.metrics, state.profile, state.aiAnalysis);
    saveActivePlan(state.plan);
    renderPlanTab();
    showToast('План тренировок обновлён по скорректированным точкам!');
  });

  $('downloadAnnotatedBtn').addEventListener('click', () => {
    const canvas = $('analysisCanvas');
    const link = document.createElement('a');
    link.download = `bodycoach-${state.selectedAnalysisAngle}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  $('runAiVisionNowBtn').addEventListener('click', handleManualAiRun);
  $('saveCheckinBtn').addEventListener('click', saveCurrentCheckin);
  $('gotoPlanBtn').addEventListener('click', () => switchTab('plan'));

  // Tab 3 quick controls
  const regenerateQuick = () => {
    state.profile.equipment = $('quickEquipmentSelect').value;
    state.profile.daysPerWeek = Number($('quickDaysSelect').value);
    saveProfile(state.profile);
    syncProfileFormFromState();
    state.plan = generateWorkoutPlan(state.metrics || {}, state.profile, state.aiAnalysis);
    state.selectedPlanDay = 0;
    saveActivePlan(state.plan);
    renderPlanTab();
    showToast('План перестроен под выбранный формат');
  };
  $('quickEquipmentSelect').addEventListener('change', regenerateQuick);
  $('quickDaysSelect').addEventListener('change', regenerateQuick);
  $('startWorkoutBtn').addEventListener('click', () => startWorkoutSession(state.selectedPlanDay));

  $('openCatalogBtn').addEventListener('click', () => {
    $('catalogModal').classList.remove('hidden');
    document.querySelectorAll('#catalogFilters .filter-chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.cat === 'all');
    });
    renderCatalogGrid('all');
  });
  $('catalogFilters').querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('catalogFilters').querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderCatalogGrid(btn.dataset.cat);
    });
  });

  // Camera modal buttons
  $('cameraMirrorBtn').addEventListener('click', () => {
    state.camera.mirrored = !state.camera.mirrored;
    $('cameraVideo').classList.toggle('mirrored', state.camera.mirrored);
  });
  $('cameraFlipBtn').addEventListener('click', () => {
    state.camera.facingMode = state.camera.facingMode === 'user' ? 'environment' : 'user';
    state.camera.mirrored = state.camera.facingMode === 'user';
    startCameraStream();
  });
  $('cameraSnapBtn').addEventListener('click', triggerCameraSnap);
  $('cameraRetakeBtn').addEventListener('click', () => {
    state.camera.capturedDataUrl = null;
    $('cameraPreviewImg').classList.add('hidden');
    $('cameraVideo').classList.remove('hidden');
    $('cameraReviewControls').classList.add('hidden');
    $('cameraLiveControls').classList.remove('hidden');
  });
  $('cameraAcceptBtn').addEventListener('click', async () => {
    if (state.camera.angleKey === 'meal' && state.camera.capturedDataUrl) {
      await setMealPhotoDataUrl(state.camera.capturedDataUrl);
      closeModal('cameraModal');
      showToast('Фото добавлено — нажмите «Посчитать калории и БЖУ»');
      return;
    }
    if (state.camera.angleKey && state.camera.capturedDataUrl) {
      state.photos[state.camera.angleKey] = state.camera.capturedDataUrl;
      renderAnglesGrid();
      showToast('Фото сохранено');
    }
    closeModal('cameraModal');
  });

  // Exercise Detail Modal controls
  $('exModalPlayPauseBtn').addEventListener('click', () => {
    if (!state.exModalPlayer) return;
    const playing = state.exModalPlayer.toggle();
    $('exModalPlayPauseBtn').textContent = playing ? 'Пауза' : 'Воспроизвести';
  });
  $('exModalSpeed').querySelectorAll('input[name="exSpeed"]').forEach((inp) => {
    inp.addEventListener('change', () => {
      if (state.exModalPlayer) state.exModalPlayer.setSpeed(Number(inp.value));
    });
  });
  $('exModalMusclesToggle').addEventListener('change', (e) => {
    if (state.exModalPlayer) state.exModalPlayer.setShowMuscles(e.target.checked);
  });

  // Inline AI Vision panel on Step 1 (two-way sync with settings modal)
  $('inlineAiToggle').addEventListener('change', () => {
    if (!IS_CLOUD_MODE) {
      $('inlineAiFields').classList.toggle('hidden', !$('inlineAiToggle').checked);
    }
    readInlineAiToState(true);
    syncInlineAiFromState();
  });
  $('inlineAiProvider').addEventListener('change', () => {
    const prov = $('inlineAiProvider').value || 'openai';
    const meta = getProviderMeta(prov);
    $('inlineAiModel').value = meta.model;
    $('inlineAiModel').placeholder = meta.model;
    if (meta.placeholderUrl) $('inlineAiBaseUrl').placeholder = meta.placeholderUrl;
    $('inlineAiBaseUrlWrap').classList.toggle('hidden', prov !== 'custom');
    setAiFeedback('inlineAiFeedback', '', '');
    readInlineAiToState(true);
    syncInlineAiFromState();
  });
  ['inlineAiModel', 'inlineAiBaseUrl', 'inlineAiKey'].forEach((id) => {
    $(id).addEventListener('change', () => {
      setAiFeedback('inlineAiFeedback', '', '');
      readInlineAiToState(true);
      syncInlineAiFromState();
    });
  });
  $('inlineAiTestBtn').addEventListener('click', () => testAiConnectionUi('inline'));

  // AI settings modal
  $('openAiSettingsBtn').addEventListener('click', openAiSettingsModal);
  $('aiProviderSelect').addEventListener('change', (e) => {
    const prov = e.target.value || 'openai';
    const meta = getProviderMeta(prov);
    $('aiBaseUrlField').classList.toggle('hidden', prov === 'gemini');
    $('aiModelInput').value = meta.model;
    $('aiModelInput').placeholder = meta.model;
    renderModelSuggestions(prov);
    if (meta.placeholderUrl) $('aiBaseUrlInput').placeholder = meta.placeholderUrl;
    setAiFeedback('modalAiFeedback', '', '');
  });
  $('modalAiTestBtn').addEventListener('click', () => testAiConnectionUi('modal'));
  $('aiSettingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const prov = $('aiProviderSelect').value || 'openai';
    const meta = getProviderMeta(prov);
    state.aiSettings = saveAiSettings({
      enabled: $('aiEnabledCheck').checked,
      provider: prov,
      model: $('aiModelInput').value.trim() || meta.model,
      baseUrl: $('aiBaseUrlInput').value.trim(),
      apiKey: $('aiApiKeyInput').value.trim(),
      rememberKey: $('aiRememberKeyCheck').checked,
    });
    syncInlineAiFromState();
    updateAiStatusIndicator();
    if (state.metrics) renderAiVisionBlock();
    closeModal('aiSettingsModal');
    showToast('Настройки AI Ассистента сохранены');
  });

  // Workout player overlay controls
  $('exitWorkoutBtn').addEventListener('click', closeWorkoutOverlay);
  $('wpFinishBtn').addEventListener('click', finishWorkoutSession);
  $('wpDoneCloseBtn').addEventListener('click', closeWorkoutOverlay);
  $('wpViewHistoryBtn').addEventListener('click', () => {
    closeWorkoutOverlay();
    switchTab('history');
  });
  $('wpSoundToggleBtn').addEventListener('click', () => {
    state.wp.soundEnabled = !state.wp.soundEnabled;
    $('wpSoundToggleBtn').innerHTML = state.wp.soundEnabled
      ? '<svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Звук вкл</span>'
      : '<svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><span>Без звука</span>';
  });
  $('wpPlayPauseBtn').addEventListener('click', () => {
    if (!state.wp.player) return;
    const playing = state.wp.player.toggle();
    $('wpPlayPauseBtn').textContent = playing ? 'Пауза' : 'Пуск';
  });
  $('wpSpeedChoices').querySelectorAll('input[name="wpSpeed"]').forEach((inp) => {
    inp.addEventListener('change', () => {
      if (state.wp.player) state.wp.player.setSpeed(Number(inp.value));
    });
  });
  $('wpMusclesToggle').addEventListener('change', (e) => {
    if (state.wp.player) state.wp.player.setShowMuscles(e.target.checked);
  });
  $('wpHoldStartBtn').addEventListener('click', toggleHoldTimer);
  $('wpHoldResetBtn').addEventListener('click', () => {
    stopHoldTimer();
    const item = state.plan.days[state.wp.dayIndex].items[state.wp.exIdx];
    state.wp.holdLeft = item.holdSeconds || 40;
    $('wpHoldClock').textContent = formatClock(state.wp.holdLeft);
    $('wpHoldStartBtn').textContent = 'Старт';
  });
  $('wpRestPlusBtn').addEventListener('click', () => {
    state.wp.restLeft += 15;
    state.wp.restTotal += 15;
    updateRestTimerUi();
  });
  $('wpRestSkipBtn').addEventListener('click', stopRestTimer);
  $('wpPrevExBtn').addEventListener('click', () => {
    if (state.wp.exIdx > 0) {
      state.wp.exIdx -= 1;
      renderWorkoutExercise();
    }
  });
  $('wpNextExBtn').addEventListener('click', () => {
    const day = state.plan.days[state.wp.dayIndex];
    if (state.wp.exIdx < day.items.length - 1) {
      state.wp.exIdx += 1;
      renderWorkoutExercise();
    } else {
      finishWorkoutSession();
    }
  });

  // Backup Export / Import
  $('exportBackupBtn').addEventListener('click', () => {
    const blob = new Blob([exportAllDataJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bodycoach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Резервная копия экспортирована');
  });
  $('importBackupInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importAllDataJson(reader.result);
        state.profile = loadProfile();
        state.plan = loadActivePlan();
        state.checkins = loadCheckins();
        state.workouts = loadWorkoutLogs();
        state.meals = loadMeals();
        state.waterByDate = loadWaterByDate();
        syncProfileFormFromState();
        renderPlanTab();
        renderHistoryTab();
        renderNutritionTab();
        showToast('Данные успешно восстановлены!');
      } catch (err) {
        showToast(`Не удалось импортировать файл: ${err.message}`, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Close modals on button or backdrop click or Escape
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-backdrop').forEach((bg) => {
    bg.addEventListener('click', (e) => {
      if (e.target === bg) closeModal(bg.id);
    });
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['cameraModal', 'exerciseModal', 'swapModal', 'catalogModal', 'aiSettingsModal'].forEach((id) => {
        if (!$(id).classList.contains('hidden')) closeModal(id);
      });
    }
  });
  // Tab 5: Nutrition & Food Photo Analyzer events
  $('mealPrevDayBtn').addEventListener('click', () => {
    state.nutrition.selectedDate = shiftDateKey(state.nutrition.selectedDate, -1);
    renderNutritionTab();
  });
  $('mealNextDayBtn').addEventListener('click', () => {
    state.nutrition.selectedDate = shiftDateKey(state.nutrition.selectedDate, 1);
    renderNutritionTab();
  });
  $('mealTodayBtn').addEventListener('click', () => {
    state.nutrition.selectedDate = getLocalDateKey();
    renderNutritionTab();
  });
  $('mealDateInput').addEventListener('change', (e) => {
    if (e.target.value) {
      state.nutrition.selectedDate = e.target.value;
      renderNutritionTab();
    }
  });

  const handleMealFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async () => {
        await setMealPhotoDataUrl(reader.result);
        showToast('Фото добавлено — нажмите «Посчитать калории и БЖУ»');
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  $('mealCameraBtn').addEventListener('click', () => {
    const isTouchMobile =
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    if (isTouchMobile && $('mealCameraNativeInput')) {
      $('mealCameraNativeInput').click();
      return;
    }
    openCameraModal('meal');
  });
  $('mealCameraNativeInput')?.addEventListener('change', handleMealFileSelect);
  $('mealPhotoInput').addEventListener('change', handleMealFileSelect);
  $('clearMealPhotoBtn').addEventListener('click', clearMealPhoto);
  $('mealSampleBtn').addEventListener('click', async () => {
    const sampleUrl = generateSampleMealDataUrl();
    await setMealPhotoDataUrl(sampleUrl);
    if (!$('mealNoteInput').value.trim()) {
      $('mealNoteInput').value = 'Куриная грудка на гриле, отварная гречка и свежий салат с авокадо';
    }
    showToast('Демо-фото добавлено — нажмите «Посчитать калории и БЖУ»');
  });

  const mealDrop = $('mealPhotoDropzone');
  mealDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    mealDrop.classList.add('dragover');
  });
  mealDrop.addEventListener('dragleave', () => mealDrop.classList.remove('dragover'));
  mealDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    mealDrop.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setMealPhotoDataUrl(reader.result);
      reader.readAsDataURL(file);
    }
  });

  window.addEventListener('paste', (e) => {
    if (state.tab !== 'nutrition') return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            setMealPhotoDataUrl(reader.result);
            showToast('Фото вставлено из буфера обмена');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  });

  $('analyzeMealBtn').addEventListener('click', handleAnalyzeMealClick);
  $('manualMealBtn').addEventListener('click', openManualMealDraft);
  $('addDraftIngredientBtn').addEventListener('click', () => {
    if (!state.nutrition.draft) return;
    state.nutrition.draft.ingredients.push(
      createDraftIngredient({ name: '', grams: 100, kcal: 120, protein: 6, fat: 4, carbs: 15, fiber: 1, macrosOpen: true })
    );
    renderDraftIngredientsRows();
    renderDraftTotalsBar();
  });
  $('saveDraftMealBtn').addEventListener('click', saveCurrentMealDraft);
  $('discardDraftMealBtn').addEventListener('click', () => {
    state.nutrition.draft = null;
    renderMealDraftCard();
  });

  window.addEventListener('resize', () => {
    if (state.tab === 'analysis' && state.metrics) drawCurrentAnalysisCanvas();
  });
}

async function detectServerEnvProviders(notifyUser = false) {
  if (IS_CLOUD_MODE) {
    try {
      const resp = await fetch(`${CLOUD_API_BASE}/fitness/health`);
      const data = await resp.json().catch(() => ({}));
      state.cloudAi = {
        checked: true,
        ready: Boolean(resp.ok && data.ready),
        provider: data.provider || 'gemini',
        model: data.model || '',
      };
      syncInlineAiFromState();
      updateAiStatusIndicator();
      if (state.metrics) renderAiVisionBlock();
      if (notifyUser) {
        showToast(
          state.cloudAi.ready
            ? `AI Ассистент готов (${state.cloudAi.model || 'Gemini'})`
            : 'Сервер ответил, но ключ ещё не активирован — специальный алгоритм анализа работает',
          !state.cloudAi.ready
        );
      }
    } catch {
      state.cloudAi = { checked: true, ready: false, provider: 'gemini', model: '' };
      syncInlineAiFromState();
      updateAiStatusIndicator();
      if (notifyUser) {
        showToast('Сервер AI на Render просыпается или недоступен. Попробуйте через 20–30 сек.', true);
      }
    }
    return;
  }

  try {
    const resp = await fetch('/api/health');
    if (!resp.ok) return;
    const data = await resp.json();
    state.envProviders = Array.isArray(data.envProviders) ? data.envProviders : [];
    // If user hasn't entered a personal key and server has an env provider, auto-select it
    if (
      state.envProviders.length &&
      !state.aiSettings.apiKey &&
      !state.envProviders.includes(state.aiSettings.provider)
    ) {
      const envProv = state.envProviders[0];
      const meta = getProviderMeta(envProv);
      state.aiSettings = saveAiSettings({
        ...state.aiSettings,
        provider: envProv,
        model: meta.model,
      });
    }
    syncInlineAiFromState();
    updateAiStatusIndicator();
    if (state.metrics) renderAiVisionBlock();
  } catch {
    // Health endpoint unavailable (e.g. static preview)
  }
}

function bootstrap() {
  state.nutrition.selectedDate = getLocalDateKey();
  setSelectedMealType(pickDefaultMealTypeByHour());
  applyTheme(loadTheme());
  applyCloudModeUi();
  syncInlineAiFromState();
  updateAiStatusIndicator();
  renderDemoPresets();
  renderAnglesGrid();
  syncProfileFormFromState();
  initEvents();
  if (state.plan) renderPlanTab();
  renderNutritionTab();
  detectServerEnvProviders();
  preloadExerciseSprites(EXERCISES.slice(0, 6).map((e) => e.animId));
}

bootstrap();
