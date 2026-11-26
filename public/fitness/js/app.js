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
} from './cv-analyzer.js?v=20261124-32';
import { ExerciseAnimationPlayer, preloadExerciseSprites } from './exercise-animator.js?v=20261124-32';
import { EXERCISE_MAP, EXERCISES, MUSCLE_LABELS } from './exercises-db.js?v=20261124-32';
import {
  buildCardioTarget,
  buildNutritionGuidance,
  CARDIO_SECTION,
  EQUIPMENT_LABELS,
  generateWorkoutPlan,
  getAlternativeExercises,
  getModeExercises,
  GOAL_LABELS,
  normalizePlan,
  PLAN_VERSION,
  selectPlanWeek,
} from './plan-generator.js?v=20261124-32';
import { WORKOUT_STATIONS, WorkoutMusicController } from './music-player.js?v=20261124-32';
import { mountHeroOrb } from './hero-orb.js?v=20261124-32';
import './glass.js?v=20261124-32';
import {
  HeartRateMonitor,
  HeartRateSession,
  HR_ZONES,
  hrMaxForAge,
  isHeartRateSupported,
  recoveryHr,
  zoneForHr,
} from './heart-rate.js?v=20261124-32';
import { DEMO_PRESETS, generateDemoPhotoSet } from './sample-photos.js?v=20261124-32';
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
} from './storage.js?v=20261124-32';

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
  tab: 'home',
  navTab: 'home',
  wizard: { step: 0, edit: false, returnTab: 'home' },
  profile: loadProfile(),
  aiSettings: loadAiSettings(),
  envProviders: [],
  cloudAi: { checked: false, ready: false, provider: 'gemini', model: '' },
  photos: { front: null, side: null, back: null, side2: null },
  photoImages: {}, // angleKey -> HTMLImageElement
  analyses: {}, // angleKey -> cv analysis result
  metrics: null,
  aiAnalysis: null,
  plan: normalizePlan(loadActivePlan()),
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
    guide: null,
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
    hrSession: null,
    restHrWasHigh: false,
    restHrNotified: false,
  },
};

const $ = (id) => document.getElementById(id);

/* --------------------------- Audio Feedback & Music Player --------------------------- */
let musicController = null;

function openMusicModal() {
  renderMusicStationsGrid();
  $('musicModal')?.classList.remove('hidden');
  if (musicController) renderMusicPlayerUi(musicController.getState());
}

function renderMusicStationsGrid() {
  if (!musicController) return;
  const st = musicController.getState();
  const fill = (grid, list) => {
    if (!grid) return;
    grid.innerHTML = list.map((s) => {
      const isActive = st.sourceMode === 'station' && st.stationId === s.id;
      return `
        <button type="button" class="music-station-card ${isActive ? 'active' : ''}" data-music-station="${s.id}">
          <div class="music-station-top">
            <span class="music-station-name">${escapeHtml(s.name)}</span>
            <span class="music-station-tag">${escapeHtml(s.tag)}</span>
          </div>
          <span class="music-station-desc">${escapeHtml(s.desc)}</span>
        </button>
      `;
    }).join('');
    grid.querySelectorAll('[data-music-station]').forEach((btn) => {
      btn.addEventListener('click', () => {
        musicController.selectStation(btn.dataset.musicStation);
      });
    });
  };
  fill($('musicBlocksGrid'), WORKOUT_STATIONS.filter((s) => s.group === 'blocks'));
  fill($('musicStationsGrid'), WORKOUT_STATIONS.filter((s) => s.group !== 'blocks'));
}

let beatLoopId = 0;
let lastBeatKey = '';
function beatLoopVisible() {
  return !$('musicModal')?.classList.contains('hidden') || !$('workoutOverlay')?.classList.contains('hidden');
}

function renderBeat(info) {
  const row = $('musicBeatRow');
  const chip = $('wpBeatChip');
  row?.classList.toggle('hidden', !info);
  chip?.classList.toggle('hidden', !info);
  if (!info) {
    lastBeatKey = '';
    return;
  }
  const key = `${info.beatIndex}`;
  if (key === lastBeatKey) return;
  lastBeatKey = key;
  const phraseStart = info.phraseBeat === 0;
  if ($('musicBeatCount')) $('musicBeatCount').textContent = String(info.count);
  if ($('musicBeatEight')) $('musicBeatEight').textContent = `Восьмёрка ${info.eight} из 4`;
  if ($('musicBeatBpm')) $('musicBeatBpm').textContent = `${info.bpm} BPM`;
  if ($('wpBeatNum')) $('wpBeatNum').textContent = String(info.count);
  if ($('wpBeatEight')) $('wpBeatEight').textContent = `${info.eight}/4`;
  $('musicBeatDots')?.querySelectorAll('i').forEach((dot, i) => {
    dot.classList.toggle('on', i < info.count);
    dot.classList.toggle('now', i === info.count - 1);
  });
  [row, chip].forEach((el) => {
    if (!el) return;
    el.classList.toggle('is-one', info.count === 1);
    el.classList.toggle('is-phrase', phraseStart);
  });
  const pulseEl = !$('musicModal')?.classList.contains('hidden') ? $('musicBeatCount') : chip;
  pulseEl?.animate?.([{ transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
}

function beatLoopTick() {
  beatLoopId = 0;
  if (!musicController || document.hidden) return;
  const st = musicController.getState();
  if (!st.playing || !st.hasBeat) {
    renderBeat(null);
    return;
  }
  const info = beatLoopVisible() ? musicController.getBeatInfo() : null;
  renderBeat(info);
  // Before the first beat, while buffering, or when nothing shows the count, poll slowly.
  beatLoopId = info ? requestAnimationFrame(beatLoopTick) : window.setTimeout(beatLoopTick, 300);
}

function ensureBeatLoop() {
  if (beatLoopId) return;
  beatLoopTick();
}

function tapMusicDownbeat() {
  if (!musicController?.tapDownbeat()) return;
  lastBeatKey = '';
  ensureBeatLoop();
  showToast('Счёт подстроен: «раз» здесь');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && musicController?.getBeatInfo()) ensureBeatLoop();
});

function renderMusicPlayerUi(st) {
  const isPlaying = Boolean(st.playing && !st.buffering);
  const isActive = Boolean(st.playing || st.buffering);

  $('openMusicBtn')?.classList.toggle('is-playing', isActive);
  $('wpMusicBtn')?.classList.toggle('is-playing', isActive);
  $('planMusicBtn')?.classList.toggle('active', isActive);
  $('musicHeroDeck')?.classList.toggle('is-playing', isPlaying);

  const shortTitle = st.shortTitle || st.title;
  if ($('planMusicLabel')) {
    $('planMusicLabel').textContent = isActive ? shortTitle : 'Музыка';
  }
  if ($('wpMusicLabel')) {
    $('wpMusicLabel').textContent = isActive ? shortTitle : 'Музыка';
  }
  if ($('musicNowTitle')) $('musicNowTitle').textContent = st.title;
  if ($('musicNowSub')) $('musicNowSub').textContent = st.subtitle;
  const credit = $('musicNowCredit');
  if (credit) {
    credit.classList.toggle('hidden', !st.credit);
    if (st.credit) {
      credit.href = st.credit.url || st.credit.licenseUrl || 'https://www.jamendo.com';
      credit.textContent = 'Jamendo • лицензия Creative Commons';
    }
  }

  if ($('musicStatusLabel')) {
    $('musicStatusLabel').textContent = st.errorText
      ? st.errorText
      : st.buffering
        ? (st.stationMode === 'jamendo' ? 'Загрузка трека...' : 'Подключение к потоку...')
        : st.playing
          ? 'Сейчас играет'
          : 'На паузе';
  }
  if (st.playing && st.hasBeat) ensureBeatLoop();
  else renderBeat(null);

  const iconWrap = $('musicPlayToggleIcon');
  if (iconWrap) {
    iconWrap.innerHTML = st.playing || st.buffering
      ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
      : '<polygon points="8,5 19,12 8,19"/>';
  }

  const volPct = Math.round((st.volume ?? 0.65) * 100);
  const volRange = $('musicVolumeRange');
  if (volRange && document.activeElement !== volRange) {
    volRange.value = String(volPct);
  }
  if ($('musicVolumePct')) $('musicVolumePct').textContent = `${volPct}%`;

  if ($('musicLocalBtnText')) {
    $('musicLocalBtnText').textContent =
      st.localCount > 0
        ? `Своя музыка (${st.localCount} тр.) — выбрать другие файлы`
        : 'Выбрать свои треки с телефона (MP3 / M4A)';
  }

  // Update active highlight on station cards
  document.querySelectorAll('[data-music-station]').forEach((card) => {
    const active = st.sourceMode === 'station' && card.dataset.musicStation === st.stationId;
    card.classList.toggle('active', active);
  });
}

let audioCtx = null;
function beep(freq = 660, durationMs = 110, volume = 0.08) {
  musicController?.duck(Math.max(550, durationMs + 340));
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

const NAV_TABS = ['home', 'plan', 'nutrition', 'history', 'profile'];

function switchTab(tabName) {
  state.tab = tabName;
  if (NAV_TABS.includes(tabName)) state.navTab = tabName;
  // Wizard and analysis screens keep the section they were opened from highlighted.
  const navActive = NAV_TABS.includes(tabName) ? tabName : state.navTab;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === navActive);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
  document.body.dataset.tab = tabName;
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (tabName === 'home') renderHomeTab();
  if (tabName === 'profile') renderProfileTab();
  if (tabName === 'analysis') {
    renderAnalysisTab();
    if (state.metrics) requestAnimationFrame(() => drawCurrentAnalysisCanvas());
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
          ? 'AI Ассистент готов'
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
      sub.textContent = `AI Ассистент готов — ключ защищён на сервере, ничего вводить не нужно`;
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
    if (state.tab === 'capture') {
      state.wizard.step = WIZARD_STEPS.indexOf('finish');
      renderWizard();
    }
    await runFullAnalysis();
  } catch (err) {
    showToast(`Не удалось загрузить демо-фото: ${err.message}`, true);
  }
}

const WIZARD_STEPS = ['about', 'goal', 'place', 'level', 'front', 'side', 'back', 'side2', 'finish'];
const PHOTO_STEPS = new Set(['front', 'side', 'back', 'side2']);

function angleCardHtml(a) {
  const imgUrl = state.photos[a.key];
  return `
    <div class="angle-card wizard-angle-card ${imgUrl ? 'filled' : ''}" data-angle-card="${a.key}">
      <div class="angle-preview">
        ${
          imgUrl
            ? `<img src="${imgUrl}" alt="${a.title}"><span class="angle-done-badge">✓ Фото добавлено</span>`
            : `<div class="angle-silhouette">${a.svg}<span>Сделайте снимок камерой или загрузите готовое фото</span></div>`
        }
      </div>
      <div class="angle-actions">
        <button type="button" class="btn ${imgUrl ? 'btn-outline' : 'btn-primary'}" data-cam-angle="${a.key}">
          <svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.2"/></svg>
          <span>${imgUrl ? 'Переснять' : 'Камера'}</span>
        </button>
        <label class="btn btn-outline">
          <svg class="btn-inline-svg" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Загрузить</span>
          <input type="file" accept="image/*" data-file-angle="${a.key}" hidden>
        </label>
        ${
          imgUrl
            ? `<button type="button" class="btn btn-danger-ghost angle-remove-btn" data-remove-angle="${a.key}" title="Удалить фото" aria-label="Удалить фото">✕</button>`
            : ''
        }
      </div>
    </div>
  `;
}

function wireAngleSlot(slot) {
  slot.querySelectorAll('[data-cam-angle]').forEach((btn) => {
    btn.addEventListener('click', () => openCameraModal(btn.dataset.camAngle));
  });
  slot.querySelectorAll('[data-file-angle]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handlePhotoFile(input.dataset.fileAngle, file);
      input.value = '';
    });
  });
  slot.querySelectorAll('[data-remove-angle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.photos[btn.dataset.removeAngle] = null;
      renderAnglesGrid();
    });
  });
  slot.querySelectorAll('[data-angle-card]').forEach((card) => {
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

function renderAnglesGrid() {
  document.querySelectorAll('[data-wizard-angle]').forEach((slot) => {
    const a = ANGLES.find((x) => x.key === slot.dataset.wizardAngle);
    if (!a) return;
    slot.innerHTML = angleCardHtml(a);
    wireAngleSlot(slot);
  });
  renderWizardFinish();
  updateWizardNav();
}

/* --------------------------- Step-by-step profile & photo wizard --------------------------- */
function openWizard(stepKey = 'about', { edit = false } = {}) {
  const from = state.tab === 'capture' ? state.wizard.returnTab : state.navTab;
  state.wizard = {
    step: Math.max(0, WIZARD_STEPS.indexOf(stepKey)),
    edit,
    returnTab: from || 'home',
  };
  syncProfileFormFromState();
  switchTab('capture');
  renderWizard();
}

function closeWizard() {
  syncProfileFormFromState();
  switchTab(state.wizard.returnTab || 'home');
}

function renderWizard() {
  const key = WIZARD_STEPS[state.wizard.step];
  document.querySelectorAll('#wizard .wizard-step').forEach((el) => {
    el.classList.toggle('active', el.dataset.step === key);
  });
  $('wizard').classList.toggle('is-edit', state.wizard.edit);
  const total = WIZARD_STEPS.length;
  $('wizardProgressFill').style.width = `${Math.round(((state.wizard.step + 1) / total) * 100)}%`;
  $('wizardCount').textContent = `${state.wizard.step + 1} / ${total}`;
  if (key === 'finish') renderWizardFinish();
  updateWizardNav();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateWizardNav() {
  const back = $('wizardBackBtn');
  const next = $('wizardNextBtn');
  if (!back || !next) return;
  const key = WIZARD_STEPS[state.wizard.step];
  if (state.wizard.edit) {
    back.textContent = 'Отмена';
    back.classList.remove('is-invisible');
    next.textContent = 'Сохранить';
    next.classList.remove('hidden');
    return;
  }
  back.textContent = 'Назад';
  back.classList.toggle('is-invisible', state.wizard.step === 0);
  next.classList.toggle('hidden', key === 'finish');
  next.textContent = PHOTO_STEPS.has(key) && !state.photos[key] ? 'Пропустить' : 'Далее';
}

function validateAboutStep() {
  const checks = [
    ['profileAge', 14, 85, 'Возраст должен быть от 14 до 85 лет'],
    ['profileHeight', 120, 230, 'Рост должен быть от 120 до 230 см'],
    ['profileWeight', 35, 220, 'Вес должен быть от 35 до 220 кг'],
  ];
  for (const [id, min, max, msg] of checks) {
    const v = Number($(id).value);
    if (!Number.isFinite(v) || v < min || v > max) {
      showToast(msg, true);
      $(id).focus();
      return false;
    }
  }
  return true;
}

function wizardNext() {
  const key = WIZARD_STEPS[state.wizard.step];
  if (key === 'about' && !validateAboutStep()) return;
  if (state.wizard.edit) {
    saveWizardEdits();
    return;
  }
  if (!PHOTO_STEPS.has(key) && key !== 'finish') readProfileFromForm();
  state.wizard.step = Math.min(state.wizard.step + 1, WIZARD_STEPS.length - 1);
  renderWizard();
}

function wizardBack() {
  if (state.wizard.edit) {
    closeWizard();
    return;
  }
  if (state.wizard.step === 0) return;
  state.wizard.step -= 1;
  renderWizard();
}

function saveWizardEdits() {
  const before = { ...state.profile };
  const profile = readProfileFromForm();
  const planChanged = ['goal', 'equipment', 'level', 'daysPerWeek'].some((k) => before[k] !== profile[k]);
  if (planChanged && state.plan) {
    const lostAi = rebuildPlanFromProfile();
    showToast(lostAi ? 'Сохранено. План перестроен без AI: чтобы AI составил его заново, нажмите «Пересобрать через AI» в плане' : 'Сохранено. План обновлён под новые настройки');
  } else {
    showToast('Профиль сохранён');
  }
  switchTab(state.wizard.returnTab || 'profile');
}

function renderWizardFinish() {
  const wrap = $('wizardThumbs');
  if (!wrap) return;
  const count = ANGLES.filter((a) => state.photos[a.key]).length;
  wrap.innerHTML = ANGLES.map((a) => {
    const img = state.photos[a.key];
    return `<button type="button" class="wizard-thumb ${img ? 'filled' : ''}" data-wizard-goto="${a.key}">
      <span class="wizard-thumb-img">${img ? `<img src="${img}" alt="">` : a.svg}</span>
      <span class="wizard-thumb-label">${escapeHtml(a.title.replace(' (профиль)', '').replace('Второй бок', '2-й бок').replace('Со спины', 'Спина'))}</span>
    </button>`;
  }).join('');
  wrap.querySelectorAll('[data-wizard-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.wizard.step = WIZARD_STEPS.indexOf(btn.dataset.wizardGoto);
      renderWizard();
    });
  });
  $('wizardFinishTitle').textContent = count ? 'Всё готово к анализу' : 'Фото пока нет';
  $('wizardFinishText').textContent = count
    ? `${count} ${pluralRu(count, 'фото', 'фото', 'фото')} из 4. Анализ займёт до минуты, потом сразу покажем план.`
    : 'Составим план только по анкете. Фото можно добавить позже: тогда упражнения подстроятся под осанку.';
  $('runAnalysisBtn').classList.toggle('hidden', !count);
  $('planWithoutPhotosBtn').classList.toggle('hidden', Boolean(count));
  $('inlineAiCard').classList.toggle('hidden', !count);
  $('clearPhotosBtn').classList.toggle('hidden', !count);
}

function buildPlanWithoutPhotos() {
  readProfileFromForm();
  rebuildPlanFromProfile();
  switchTab('plan');
  showToast('План составлен по анкете. Добавьте фото позже, чтобы учесть осанку');
}

/** Rebuilds the active plan for the current profile; returns true when an AI plan fell back to the built-in one. */
function rebuildPlanFromProfile() {
  // A legacy AI result has no planParams; it was built for the plan that is on screen now.
  if (state.aiAnalysis && !state.aiAnalysis.planParams && state.plan?.generatedByAi) {
    state.aiAnalysis.planParams = { equipment: state.plan.equipment, daysPerWeek: state.plan.daysPerWeek };
  }
  const wasAi = Boolean(state.plan?.generatedByAi);
  state.plan = generateWorkoutPlan(planMetricsSource(), state.profile, state.aiAnalysis);
  state.selectedPlanDay = 0;
  saveActivePlan(state.plan);
  renderPlanTab();
  return wasAi && !state.plan.generatedByAi;
}

/* --------------------------- Home dashboard --------------------------- */
const HEART_SVG = '<svg class="hr-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.1c2.1-.2 3.9.9 5.4 2.8 1.5-1.9 3.3-3 5.4-2.8 3.7.4 5.7 4.3 4.2 7.7C19.5 16.4 12 21 12 21z"/></svg>';

function greetingText(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function strengthLogsThisWeek() {
  const from = startOfWeek().getTime();
  return state.workouts.filter((w) => w.type !== 'cardio' && new Date(w.completedAt).getTime() >= from);
}

/** Next plan day not yet done this week (logs store "Неделя N • title" or the bare title). */
function nextPlanDayInfo() {
  const days = state.plan?.days || [];
  if (!days.length) return null;
  const logs = strengthLogsThisWeek();
  let idx = days.findIndex((d) => !planDayDoneThisWeek(d));
  const done = Math.min(days.length, logs.length);
  if (done >= days.length) idx = -1;
  return { idx, done, total: days.length };
}

function homeWorkoutCard() {
  const info = nextPlanDayInfo();
  if (!info) {
    return `
      <article class="home-card home-workout" data-home-action="wizard" role="button" tabindex="0">
        <span class="home-eyebrow">Начнём</span>
        <h2 class="home-workout-title">Персональный план за пару минут</h2>
        <p class="home-workout-focus">Ответьте на 4 вопроса и сделайте фото. Подберём упражнения, калории и пульсовые зоны.</p>
        <button type="button" class="btn home-start-btn" data-home-action="wizard">Начать</button>
      </article>`;
  }
  if (info.idx < 0) {
    return `
      <article class="home-card home-workout" data-home-go="plan" role="button" tabindex="0">
        <span class="home-eyebrow">Неделя выполнена</span>
        <h2 class="home-workout-title">Все ${info.total} ${pluralRu(info.total, 'тренировка', 'тренировки', 'тренировок')} сделаны</h2>
        <p class="home-workout-focus">Отдохните или добавьте кардио. Новая неделя начнётся в понедельник.</p>
        <button type="button" class="btn home-start-btn" data-home-go="plan">Открыть план</button>
      </article>`;
  }
  const day = state.plan.days[info.idx];
  return `
    <article class="home-card home-workout" data-home-go="plan" role="button" tabindex="0">
      <span class="home-eyebrow">Следующая тренировка • ${info.idx + 1} из ${info.total}</span>
      <h2 class="home-workout-title">${escapeHtml(day.title)}</h2>
      <p class="home-workout-focus">${escapeHtml(day.focus || '')}</p>
      <div class="home-workout-stats">
        <span><b>${day.items.length}</b>${pluralRu(day.items.length, 'упражнение', 'упражнения', 'упражнений')}</span>
        <span><b>~${day.estMinutes}</b>минут</span>
        <span><b>~${day.estKcal}</b>ккал</span>
      </div>
      <button type="button" class="btn home-start-btn" data-home-action="start" data-day="${info.idx}"><svg class="btn-inline-svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="7,5 19,12 7,19"/></svg><span>Начать тренировку</span></button>
    </article>`;
}

const MET_STRENGTH = 5;
const MET_CARDIO = 6.5;
const ACTIVE_MINUTES_GOAL = 30;

/** Heart-rate calories when the watch recorded them, otherwise a MET estimate from body weight and duration. */
function workoutKcal(w) {
  if (w.hr?.kcal) return Math.round(w.hr.kcal);
  const kg = Number(state.profile?.weightKg) || 75;
  const met = w.type === 'cardio' ? MET_CARDIO : MET_STRENGTH;
  return Math.round((met * kg * (Number(w.durationSec) || 0)) / 3600);
}

function activityForDate(dateKey = getLocalDateKey()) {
  const logs = (state.workouts || []).filter((w) => w.completedAt && getLocalDateKey(new Date(w.completedAt)) === dateKey);
  return {
    logs,
    kcal: logs.reduce((a, w) => a + workoutKcal(w), 0),
    minutes: Math.round(logs.reduce((a, w) => a + (Number(w.durationSec) || 0), 0) / 60),
  };
}

function dailyBurnGoal() {
  const days = state.plan?.days || [];
  const avg = days.length ? days.reduce((a, d) => a + (Number(d.estKcal) || 0), 0) / days.length : 0;
  return Math.max(150, Math.round((avg || 300) / 10) * 10);
}

function todayActivityRings() {
  const today = getLocalDateKey();
  const act = activityForDate(today);
  const target = getDailyNutritionTargets();
  const waterMl = Number(state.waterByDate[today]) || 0;
  const waterGoal = target.waterMl || Math.round((target.waterLiters || 2.4) * 1000);
  return [
    { cls: 'is-kcal', label: 'Сожжено', value: act.kcal, goal: dailyBurnGoal(), unit: 'ккал' },
    { cls: 'is-min', label: 'Активность', value: act.minutes, goal: ACTIVE_MINUTES_GOAL, unit: 'мин' },
    { cls: 'is-water', label: 'Вода', value: waterMl, goal: waterGoal, unit: 'мл' },
  ];
}

/** Share of today's three goals reached, each goal capped at 100%. */
function dayProgress(rings) {
  const parts = rings.map((r) => (r.goal > 0 ? Math.min(1, r.value / r.goal) : 0));
  return parts.reduce((a, v) => a + v, 0) / parts.length;
}

function homeHeroCard() {
  const rings = todayActivityRings();
  const progress = dayProgress(rings);
  const pct = Math.round(progress * 100);
  const hint = pct >= 100
    ? 'Все цели дня закрыты'
    : pct === 0
      ? 'Тренировка, активные минуты и вода наполняют сферу'
      : `До цели осталось ${100 - pct}%`;
  return `
    <section class="home-hero" data-progress="${progress.toFixed(4)}" aria-label="Прогресс дня ${pct}%">
      <div class="hero-stage" aria-hidden="true">
        <canvas class="hero-fx"></canvas>
      </div>
      <div class="hero-orb" aria-hidden="true"></div>
      <div class="hero-copy">
        <span class="hero-label">Прогресс дня</span>
        <div class="hero-pct"><b class="hero-pct-num">${pct}</b><small>%</small></div>
        <p class="hero-hint">${hint}</p>
      </div>
      <ul class="activity-legend hero-legend" data-home-go="history">
        ${rings.map((r) => `
          <li class="${r.cls} ${r.value >= r.goal ? 'is-done' : ''}">
            <span class="act-label"><i></i>${r.label}</span>
            <span class="act-val"><b>${r.value}</b>/${r.goal} ${r.unit}</span>
            ${r.cls === 'is-water' ? '<button type="button" class="btn btn-xs act-water-btn" data-home-action="water">+250 мл</button>' : ''}
          </li>`).join('')}
      </ul>
      <div class="hero-tile">${homeWorkoutCard()}</div>
    </section>`;
}
function homeNutritionCard() {
  const target = getDailyNutritionTargets();
  const dateKey = getLocalDateKey();
  const meals = getMealsForDate(dateKey);
  const sum = (k) => meals.reduce((a, m) => a + (Number(m.totals?.[k]) || 0), 0);
  const kcal = Math.round(sum('kcal'));
  const pct = target.targetKcal > 0 ? Math.round((kcal / target.targetKcal) * 100) : 0;
  const circ = 2 * Math.PI * 34;
  const offset = +(circ * (1 - Math.min(100, pct) / 100)).toFixed(2);
  const over = kcal > target.targetKcal * 1.06;
  const left = target.targetKcal - kcal;
  const macro = (name, val, max) =>
    `<span class="home-macro"><i style="--p:${max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0}%"></i>${name} <b>${Math.round(val)}</b>/${max} г</span>`;
  return `
    <article class="home-card home-nutri" data-home-go="nutrition" role="button" tabindex="0">
      <div class="home-nutri-top">
        <div class="home-ring ${over ? 'over' : ''}">
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" class="home-ring-track"/>
            <circle cx="40" cy="40" r="34" class="home-ring-fill" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset}"/>
          </svg>
          <span>${pct}<small>%</small></span>
        </div>
        <div class="home-nutri-copy">
          <span class="home-eyebrow">Питание сегодня</span>
          <div class="home-big">${kcal}<small>/ ${target.targetKcal} ккал</small></div>
          <span class="home-sub ${left < 0 ? 'is-over' : ''}">${left >= 0 ? `Осталось ${left} ккал` : `Больше нормы на ${-left} ккал`}</span>
        </div>
      </div>
      <div class="home-macros">
        ${macro('Б', sum('protein'), target.proteinGrams)}
        ${macro('Ж', sum('fat'), target.fatGrams)}
        ${macro('У', sum('carbs'), target.carbsGrams)}
      </div>
    </article>`;
}

function homeWeekCard() {
  if (!state.plan) {
    return `
      <article class="home-card home-small" data-home-action="wizard" role="button" tabindex="0">
        <span class="home-eyebrow">Неделя</span>
        <div class="home-big">—</div>
        <span class="home-sub">План ещё не составлен</span>
      </article>`;
  }
  const info = nextPlanDayInfo();
  const cardio = state.plan.cardio || buildCardioTarget({ ...state.profile, equipment: state.plan.equipment, goal: state.plan.goal, level: state.plan.level });
  const cDone = cardioSessionsThisWeek();
  const bar = (label, done, total) => `
    <div class="home-week-row">
      <span>${label}<b>${done}/${total}</b></span>
      <div class="home-bar ${done >= total ? 'done' : ''}"><i style="width:${total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0}%"></i></div>
    </div>`;
  return `
    <article class="home-card home-small" data-home-go="plan" role="button" tabindex="0">
      <span class="home-eyebrow">Эта неделя</span>
      ${bar('Силовые', info.done, info.total)}
      ${bar('Кардио', cDone, cardio.sessions)}
    </article>`;
}

function homeHrCard() {
  return `
    <article class="home-card home-small home-hr" id="homeHrCard" data-home-action="hr" role="button" tabindex="0">
      <span class="home-eyebrow">Пульс</span>
      <div class="home-hr-main">${HEART_SVG}<span class="home-big" id="homeHrValue">—</span></div>
      <span class="home-sub" id="homeHrSub">Подключить часы</span>
    </article>`;
}

function latestBodyMetrics() {
  return state.metrics || state.checkins?.[0]?.metrics || null;
}

function homeBodyCard() {
  const m = latestBodyMetrics();
  const score = m?.postureScore;
  return `
    <article class="home-card home-small" data-home-action="${state.metrics ? 'analysis' : 'photos'}" role="button" tabindex="0">
      <span class="home-eyebrow">Фигура</span>
      <div class="home-big">${score != null ? `${score}<small>/100</small>` : '—'}</div>
      <span class="home-sub">${score != null ? `Осанка • ${state.profile.weightKg} кг` : 'Сделайте анализ по фото'}</span>
      <button type="button" class="btn btn-outline btn-xs home-card-btn" data-home-action="photos">${score != null ? 'Новый анализ' : 'Сделать фото'}</button>
    </article>`;
}

function homeLastWorkoutCard() {
  const w = state.workouts?.[0];
  if (!w) {
    return `
      <article class="home-card home-small" data-home-go="history" role="button" tabindex="0">
        <span class="home-eyebrow">Последняя</span>
        <div class="home-big">—</div>
        <span class="home-sub">Тренировок пока нет</span>
      </article>`;
  }
  const mins = Math.max(1, Math.round((w.durationSec || 0) / 60));
  return `
    <article class="home-card home-small" data-home-go="history" role="button" tabindex="0">
      <span class="home-eyebrow">Последняя</span>
      <div class="home-big">${mins}<small>мин</small></div>
      <span class="home-sub home-clip">${escapeHtml(w.dayTitle || 'Тренировка')}</span>
      <span class="home-sub">${formatDateRu(w.completedAt)}${w.hr?.avg ? ` • ♥ ${w.hr.avg}` : ''}</span>
    </article>`;
}

function renderHomeTab() {
  const grid = $('homeGrid');
  if (!grid) return;
  const now = new Date();
  const date = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  $('homeDate').textContent = date.charAt(0).toUpperCase() + date.slice(1);
  $('homeTitle').textContent = greetingText(now);
  grid.innerHTML = [
    homeHeroCard(),
    homeNutritionCard(),
    homeWeekCard(),
    homeHrCard(),
    homeBodyCard(),
    homeLastWorkoutCard(),
  ].join('');
  const hero = grid.querySelector('.home-hero');
  mountHeroOrb(hero, Number(hero?.dataset.progress) || 0);
  renderHomeHr();
}

function runHomeAction(el) {
  const action = el.dataset.homeAction;
  if (!action) {
    if (el.dataset.homeGo) switchTab(el.dataset.homeGo);
    return;
  }
  if (action === 'start') {
    const idx = Number(el.dataset.day) || 0;
    state.selectedPlanDay = idx;
    startWorkoutSession(idx);
  } else if (action === 'wizard') {
    openWizard('about');
  } else if (action === 'photos') {
    openWizard('front');
  } else if (action === 'analysis') {
    switchTab('analysis');
  } else if (action === 'hr') {
    openHrModal();
  } else if (action === 'water') {
    adjustDailyWater(250, getLocalDateKey());
    renderHomeTab();
  }
}

function renderHomeHr(st = hrMonitor?.getState()) {
  const card = $('homeHrCard');
  if (!card || !st) return;
  const zone = zoneForHr(st.bpm, currentHrMax());
  const z = zone ? HR_ZONES[zone - 1] : null;
  const linked = ['connected', 'connecting', 'reconnecting'].includes(st.status);
  card.dataset.zone = String(zone);
  card.classList.toggle('is-live', st.bpm > 0);
  card.classList.toggle('is-linking', linked && !st.bpm);
  card.style.setProperty('--hr-period', st.bpm ? `${(60 / st.bpm).toFixed(3)}s` : '1s');
  $('homeHrValue').textContent = st.bpm ? String(st.bpm) : '—';
  $('homeHrSub').textContent = st.bpm
    ? z ? `Зона ${zone} • ${z.name}` : 'Ниже зон'
    : linked ? 'Ждём пульс…' : 'Подключить часы';
}

/* --------------------------- Profile & settings --------------------------- */
const SEX_LABELS = { male: 'Мужчина', female: 'Женщина', unspecified: '' };
const LEVEL_LABELS = { beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый' };

function renderProfileTab() {
  if (!$('tab-profile')) return;
  const p = state.profile || {};
  const age = Number(p.age) || 28;
  $('profileSummaryLine').textContent = [
    SEX_LABELS[p.sex],
    `${age} ${pluralRu(age, 'год', 'года', 'лет')}`,
    `${p.heightCm || 178} см`,
    `${p.weightKg || 78} кг`,
  ].filter(Boolean).join(' • ');
  const days = Number(p.daysPerWeek) || 3;
  $('profileGoalVal').textContent = GOAL_LABELS[p.goal] || '';
  $('profilePlaceVal').textContent = EQUIPMENT_LABELS[p.equipment] || '';
  $('profileLevelVal').textContent = `${LEVEL_LABELS[p.level] || ''} • ${days} ${pluralRu(days, 'день', 'дня', 'дней')}`;
  const photos = ANGLES.filter((a) => state.photos[a.key]).length;
  $('profilePhotoVal').textContent = photos ? `${photos} из 4 фото` : '';
  const m = latestBodyMetrics();
  $('profileAnalysisVal').textContent = m?.postureScore != null ? `Осанка ${m.postureScore}/100` : 'Ещё не было';
  $('profileLastAnalysisBtn').disabled = !m;
  const hr = hrMonitor?.getState();
  $('profileHrVal').textContent = !hr?.supported
    ? 'Нужен Chrome'
    : hr.status === 'connected' ? hr.deviceName || 'Подключены' : 'Не подключены';
  const music = musicController?.getState?.();
  $('profileMusicVal').textContent = music?.playing ? music.shortTitle || music.title || 'Играет' : '';
  $('profileAiVal').textContent = state.aiSettings.enabled && isAiReady() ? 'Включён' : 'Выключен';
  $('profileThemeVal').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Тёмное' : 'Светлое';
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
  $('profileAge').value = p.age || 28;
  $('profileHeight').value = p.heightCm || 178;
  $('profileWeight').value = p.weightKg || 78;

  const setRadio = (name, val) => {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (el) el.checked = true;
  };
  setRadio('sex', p.sex || 'male');
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
const CAM_GUIDE_KEY = 'bodycoach_cam_guide_v1';
const CAM_GUIDE_MIN_SPAN = 0.3;
// Silhouette guides are drawn from y=10 (head top) to y=186 (feet) inside a 120x200 viewBox.
const CAM_GUIDE_VIEWBOX = '0 10 120 176';

function loadCameraGuide() {
  try {
    const g = JSON.parse(localStorage.getItem(CAM_GUIDE_KEY) || 'null');
    if (g && g.head >= 0 && g.feet <= 1 && g.feet - g.head >= CAM_GUIDE_MIN_SPAN) return { head: g.head, feet: g.feet };
  } catch {
    // Fall back to defaults on malformed storage
  }
  return { head: 0.06, feet: 0.94 };
}

function renderCameraGuide(meta) {
  const overlay = $('cameraGuideOverlay');
  if (!meta) {
    overlay.innerHTML = '';
    return;
  }
  const svg = meta.svg
    .replace('viewBox="0 0 120 200"', `viewBox="${CAM_GUIDE_VIEWBOX}" preserveAspectRatio="xMidYMid meet"`)
    .replace(' width="84" height="140"', '');
  overlay.innerHTML = `
    <div class="cam-guide-figure" id="camGuideFigure">${svg}</div>
    <div class="cam-guide-line" data-guide-line="head"><span>Макушка</span></div>
    <div class="cam-guide-line" data-guide-line="feet"><span>Стопы</span></div>`;
  applyCameraGuide();
}

function applyCameraGuide() {
  const g = state.camera.guide;
  const overlay = $('cameraGuideOverlay');
  const fig = $('camGuideFigure');
  if (!fig) return;
  fig.style.top = `${g.head * 100}%`;
  fig.style.height = `${(g.feet - g.head) * 100}%`;
  overlay.querySelector('[data-guide-line="head"]').style.top = `${g.head * 100}%`;
  overlay.querySelector('[data-guide-line="feet"]').style.top = `${g.feet * 100}%`;
}

function initCameraGuideDrag() {
  const overlay = $('cameraGuideOverlay');
  let drag = null;
  overlay.addEventListener('pointerdown', (e) => {
    const line = e.target.closest('[data-guide-line]');
    if (!line) return;
    e.preventDefault();
    hideCameraTip();
    drag = { line, which: line.dataset.guideLine, id: e.pointerId };
    line.classList.add('dragging');
    try {
      line.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic or already-released pointers; dragging still works via overlay events
    }
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const rect = overlay.getBoundingClientRect();
    const y = clampNum((e.clientY - rect.top) / rect.height, 0.01, 0.99);
    const g = state.camera.guide;
    if (drag.which === 'head') g.head = Math.min(y, g.feet - CAM_GUIDE_MIN_SPAN);
    else g.feet = Math.max(y, g.head + CAM_GUIDE_MIN_SPAN);
    applyCameraGuide();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.line.classList.remove('dragging');
    drag = null;
    try {
      localStorage.setItem(CAM_GUIDE_KEY, JSON.stringify(state.camera.guide));
    } catch {
      // Ignore storage quota errors
    }
  };
  overlay.addEventListener('pointerup', end);
  overlay.addEventListener('pointercancel', end);
}

function clampNum(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Body photos are always portrait; phone browsers often deliver a landscape 4:3 stream even in portrait.
const BODY_FRAME_RATIO = 3 / 4;

// Tall phone screens get a taller crop (down to 1:2) so the person appears as large as possible.
function bodyFrameRatio() {
  const vp = $('cameraViewport');
  const r = vp.clientWidth && vp.clientHeight ? vp.clientWidth / vp.clientHeight : BODY_FRAME_RATIO;
  return Math.min(BODY_FRAME_RATIO, Math.max(1 / 2, r));
}

function cameraCropRect() {
  const video = $('cameraVideo');
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const target = bodyFrameRatio();
  if (state.camera.angleKey !== 'meal' && vw / vh > target) {
    const sw = Math.round(vh * target);
    return { sx: Math.round((vw - sw) / 2), sy: 0, sw, sh: vh };
  }
  return { sx: 0, sy: 0, sw: vw, sh: vh };
}

function fitCameraStage() {
  const modal = $('cameraModal');
  if (modal.classList.contains('hidden')) return;
  const vp = $('cameraViewport');
  const stage = $('cameraStage');
  const showingImg = !$('cameraPreviewImg').classList.contains('hidden');
  const crop = cameraCropRect();
  let ratio = state.camera.angleKey === 'meal' ? 4 / 3 : bodyFrameRatio();
  if (showingImg && state.camera.frameRatio) ratio = state.camera.frameRatio;
  else if (crop) ratio = crop.sw / crop.sh;
  const availW = vp.clientWidth;
  const availH = vp.clientHeight;
  if (!availW || !availH) return;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }
  stage.style.width = `${Math.floor(w)}px`;
  stage.style.height = `${Math.floor(h)}px`;
}
const CAMERA_FS_MQ = window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-height: 520px)');
const CAM_TIMER_STEPS = [0, 3, 5, 10];

// Browser bars can only be hidden through the Fullscreen API, and only from a user tap (iPhone Safari has no support).
function enterCameraFullscreen() {
  if (!CAMERA_FS_MQ.matches || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    state.camera.ownFullscreen = true;
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        state.camera.ownFullscreen = false;
      });
    }
  } catch {
    state.camera.ownFullscreen = false;
  }
}

function exitCameraFullscreen() {
  if (!state.camera.ownFullscreen) return;
  state.camera.ownFullscreen = false;
  if (!(document.fullscreenElement || document.webkitFullscreenElement)) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    const p = exit?.call(document);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // Already left fullscreen
  }
}

function syncCameraTimerLabel() {
  const val = Number(document.querySelector('input[name="camTimer"]:checked')?.value || 0);
  $('cameraTimerCycleBtn').textContent = val > 0 ? `Таймер ${val} с` : 'Без таймера';
}

function cycleCameraTimer() {
  const cur = Number(document.querySelector('input[name="camTimer"]:checked')?.value || 0);
  const next = CAM_TIMER_STEPS[(CAM_TIMER_STEPS.indexOf(cur) + 1) % CAM_TIMER_STEPS.length];
  const radio = document.querySelector(`input[name="camTimer"][value="${next}"]`);
  if (radio) radio.checked = true;
  syncCameraTimerLabel();
}

function hideCameraTip() {
  clearTimeout(state.camera.tipTimer);
  $('cameraTipChip').classList.add('hidden');
}

async function openCameraModal(angleKey) {
  enterCameraFullscreen();
  state.camera.angleKey = angleKey;
  state.camera.capturedDataUrl = null;
  if (!state.camera.guide) state.camera.guide = loadCameraGuide();

  if (angleKey === 'meal') {
    state.camera.facingMode = 'environment';
    state.camera.mirrored = false;
    $('cameraModalTitle').textContent = 'Съёмка блюда';
    $('cameraModalHint').textContent = 'Сфотографируйте тарелку сверху под углом ~45° при хорошем освещении';
    $('cameraGuideTip').classList.add('hidden');
    renderCameraGuide(null);
    const immediateRadio = document.querySelector('input[name="camTimer"][value="0"]');
    if (immediateRadio) immediateRadio.checked = true;
    hideCameraTip();
  } else {
    const meta = ANGLES.find((a) => a.key === angleKey) || ANGLES[0];
    $('cameraModalTitle').textContent = `Съёмка: ${meta.title}`;
    $('cameraModalHint').textContent = meta.hint;
    $('cameraGuideTip').classList.remove('hidden');
    renderCameraGuide(meta);
    $('cameraTipChip').classList.remove('hidden');
    clearTimeout(state.camera.tipTimer);
    state.camera.tipTimer = setTimeout(hideCameraTip, 6000);
  }
  syncCameraTimerLabel();

  $('cameraPreviewImg').classList.add('hidden');
  $('cameraVideo').classList.remove('hidden');
  $('cameraLiveControls').classList.remove('hidden');
  $('cameraReviewControls').classList.add('hidden');
  $('cameraCountdown').classList.add('hidden');
  $('cameraError').classList.add('hidden');
  $('cameraModal').classList.remove('hidden');
  document.body.classList.add('no-scroll');
  fitCameraStage();

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
    const portrait = state.camera.angleKey !== 'meal' && window.innerHeight >= window.innerWidth;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.camera.facingMode,
        width: { ideal: portrait ? 1080 : 1440 },
        height: { ideal: portrait ? 1440 : 1080 },
        aspectRatio: { ideal: portrait ? BODY_FRAME_RATIO : 4 / 3 },
      },
      audio: false,
    });
    state.camera.stream = stream;
    video.srcObject = stream;
    video.classList.toggle('mirrored', state.camera.mirrored);
    await video.play();
    fitCameraStage();
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
  const crop = cameraCropRect() || { sx: 0, sy: 0, sw: 720, sh: 960 };
  const w = crop.sw;
  const h = crop.sh;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (state.camera.mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, crop.sx, crop.sy, w, h, 0, 0, w, h);
  state.camera.frameRatio = w / h;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  state.camera.capturedDataUrl = dataUrl;

  $('cameraPreviewImg').src = dataUrl;
  $('cameraPreviewImg').classList.remove('hidden');
  $('cameraVideo').classList.add('hidden');
  $('cameraLiveControls').classList.add('hidden');
  $('cameraReviewControls').classList.remove('hidden');
  fitCameraStage();
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
        ? 'Анализ фигуры и персональный план от AI Ассистента готовы!'
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
  // Equipment-specific moves go first so the model leans on them rather than on shared dumbbell or bodyweight moves.
  const catalogPayload = getModeExercises(state.profile?.equipment || 'home_bodyweight')
    .sort((a, b) => a.equipment.length - b.equipment.length)
    .map((e) => ({
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
      planParams: currentPlanParams(),
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
    planParams: currentPlanParams(),
  };
}

function currentPlanParams(profile = state.profile) {
  return {
    equipment: profile?.equipment || 'home_bodyweight',
    daysPerWeek: Number(profile?.daysPerWeek) || 3,
  };
}

function hasAnyPhoto() {
  return Object.values(state.photos || {}).some(Boolean);
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
  const canvas = $('analysisCanvas');
  const stage = $('analysisCanvasStage');
  const fullscreen = stage.classList.contains('is-fullscreen');
  if (fullscreen) {
    // Fit the whole photo inside the screen so every point is reachable without scrolling.
    const availW = stage.clientWidth - 16;
    const availH = stage.clientHeight - $('fsEditBar').offsetHeight - 16;
    const ratio = img.naturalHeight / img.naturalWidth;
    canvas.style.width = `${Math.max(260, Math.floor(Math.min(availW, availH / ratio)))}px`;
  } else {
    canvas.style.width = '';
  }
  renderAnalysisOverlay(canvas, img, analysis, { ...state.overlay, largeHandles: fullscreen || FULLSCREEN_EDIT_MQ.matches });
}

const FULLSCREEN_EDIT_MQ = window.matchMedia('(max-width: 820px), (pointer: coarse)');

function setPointEditMode(on) {
  state.overlay.editMode = on;
  $('toggleEditPointsBtn').classList.toggle('active', on);
  $('toggleEditPointsBtn').textContent = on ? 'Готово (правка вкл)' : 'Поправить точки';
  $('editPointsHint').classList.toggle('hidden', !on);
  const fullscreen = on && FULLSCREEN_EDIT_MQ.matches;
  $('analysisCanvasStage').classList.toggle('is-fullscreen', fullscreen);
  document.body.classList.toggle('no-scroll', fullscreen);
  drawCurrentAnalysisCanvas();
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
      body.innerHTML = `<p class="muted small">Сейчас выполнен анализ осанки и пропорций специальным алгоритмом. Нажмите <strong>«Запустить AI-анализ»</strong>, чтобы AI Ассистент проанализировал фото и дополнил программу тренировок (первый запуск может занять 25–50 сек).</p>`;
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
  const planBtn = $('aiRebuildPlanBtn');
  btn.disabled = true;
  planBtn.disabled = true;
  btn.textContent = 'Анализируем...';
  planBtn.textContent = 'AI составляет план...';
  try {
    state.aiAnalysis = await callVisionAiProxy();
    state.plan = generateWorkoutPlan(state.metrics, state.profile, state.aiAnalysis);
    saveActivePlan(state.plan);
    renderAiVisionBlock();
    renderPlanTab();
    showToast(
      state.plan.generatedByAi
        ? 'Анализ от AI Ассистента готов, план тренировок обновлён!'
        : 'Анализ от AI Ассистента добавлен и учтён в плане тренировок!'
    );
  } catch (err) {
    showToast(`Ошибка AI Ассистента: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    planBtn.disabled = false;
    btn.textContent = state.aiAnalysis ? 'Обновить AI-анализ' : 'Запустить AI-анализ';
    planBtn.textContent = '✦ Пересобрать через AI';
  }
}

/* --------------------------- Tab 3: Workout Plan & Animated Cards --------------------------- */
function destroyPlanCardPlayers() {
  state.planCardPlayers.forEach((p) => p.destroy());
  state.planCardPlayers = [];
}

function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function renderPlanWeekBar(plan) {
  const weeks = plan.weeks || [];
  const bar = $('planWeekBar');
  if (!plan.coverage || !weeks.length) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const total = plan.coverage.total;
  const modeLabel = EQUIPMENT_LABELS[plan.equipment] || plan.equipmentLabel;
  const exWord = pluralRu(total, 'упражнение', 'упражнения', 'упражнений');
  const cycleText =
    weeks.length > 1
      ? `Цикл ${weeks.length} ${pluralRu(weeks.length, 'неделя', 'недели', 'недель')} • ${total} ${exWord}, потом по кругу`
      : `Все ${total} ${exWord} за неделю, повторяйте её`;
  const priorityText = !plan.priorityExerciseIds?.length
    ? ''
    : weeks.length > 1
      ? ' • ★ слабые места по фото чаще и на подход больше'
      : ' • ★ слабые места по фото: на подход больше';
  $('planCycleNote').textContent = cycleText + priorityText;

  const tabs = $('planWeekTabs');
  tabs.classList.toggle('hidden', weeks.length < 2);
  tabs.innerHTML = weeks
    .map(
      (w, idx) =>
        `<button type="button" class="week-tab ${idx === plan.currentWeek ? 'active' : ''}" role="tab" aria-selected="${idx === plan.currentWeek}" data-plan-week="${idx}">Неделя ${w.weekIndex}${w.source === 'ai' ? ' • AI' : ''}</button>`
    )
    .join('');
  tabs.querySelectorAll('[data-plan-week]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectPlanWeek(plan, Number(btn.dataset.planWeek));
      state.selectedPlanDay = 0;
      saveActivePlan(plan);
      renderPlanTab();
    });
  });
}

function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function cardioSessionsThisWeek() {
  const from = startOfWeek().getTime();
  return state.workouts.filter((w) => w.type === 'cardio' && new Date(w.completedAt).getTime() >= from).length;
}

function renderCardioCard(plan) {
  const card = $('planCardioCard');
  const target = plan.cardio || buildCardioTarget({ ...state.profile, equipment: plan.equipment, goal: plan.goal, level: plan.level });
  const done = cardioSessionsThisWeek();
  const pct = Math.min(100, Math.round((done / target.sessions) * 100));
  const steps = plan.nutrition?.stepsTarget ? ` Плюс ${plan.nutrition.stepsTarget}.` : '';
  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="cardio-card-head">
      <div>
        <div class="cardio-card-title">Кардио на неделю</div>
        <div class="muted small">${target.sessions} × ${target.minutes} мин • пульс ${target.hrLow}–${target.hrHigh}</div>
      </div>
      <div class="cardio-card-count ${done >= target.sessions ? 'done' : ''}"><strong>${done}</strong> из ${target.sessions}</div>
    </div>
    <div class="cardio-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${target.sessions}" aria-valuenow="${done}"><span style="width:${pct}%"></span></div>
    <details class="cardio-more">
      <summary>Как делать кардио</summary>
      <p class="muted tiny cardio-card-note">${escapeHtml(target.note)} Темп такой, чтобы можно было говорить, но не петь. Делайте отдельно от силовой: в дни отдыха или после тренировки.${escapeHtml(steps)}</p>
    </details>
    <div class="cardio-log-row">
      <select id="cardioTypeSelect" aria-label="Вид кардио">
        ${target.options.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
      </select>
      <label class="cardio-minutes"><input type="number" id="cardioMinutesInput" min="5" max="240" step="5" inputmode="numeric" value="${target.minutes}" aria-label="Минуты"><span>мин</span></label>
      <button type="button" class="btn btn-primary btn-sm" id="logCardioBtn">✓ Отметить кардио</button>
    </div>
  `;
  $('logCardioBtn').addEventListener('click', () => {
    const minutes = Math.round(Number($('cardioMinutesInput').value));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) {
      showToast('Укажите длительность от 5 до 240 минут', true);
      return;
    }
    const kind = $('cardioTypeSelect').value;
    state.workouts = addWorkoutLog({
      type: 'cardio',
      dayTitle: `Кардио • ${kind}`,
      equipmentLabel: '',
      durationSec: minutes * 60,
      cardioMinutes: minutes,
    });
    renderCardioCard(plan);
    const left = target.sessions - cardioSessionsThisWeek();
    showToast(left > 0 ? `Кардио ${minutes} мин записано. До цели недели: ${left}` : `Кардио ${minutes} мин записано. Цель недели выполнена!`);
  });
}
/** Logs store "Неделя N • title" or the bare title. */
function planDayDoneThisWeek(day) {
  return strengthLogsThisWeek().some((w) => {
    const t = String(w.dayTitle || '');
    return t === day.title || t.endsWith(`• ${day.title}`);
  });
}

function splitDayTitle(title) {
  const parts = String(title || '').split('•').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? { num: parts[0], name: parts.slice(1).join(' • ') } : { num: '', name: parts[0] || '' };
}

const SPRITE_QUERY = new URL(import.meta.url).search;
function exerciseThumbStyle(ex) {
  const key = ex.animId || 'squat';
  return `background-image:url('./assets/exercises/${key}.webp${SPRITE_QUERY}')`;
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
    ? `✦ AI • ${plan.goalLabel} • ${plan.levelLabel}`
    : `${plan.goalLabel} • ${plan.levelLabel}`;
  $('planTitle').textContent = `${plan.daysPerWeek} ${pluralRu(plan.daysPerWeek, 'день', 'дня', 'дней')} в неделю • ${EQUIPMENT_LABELS[plan.equipment] || plan.equipmentLabel}`;
  $('planFocusChips').innerHTML = (plan.focusSummary || [])
    .slice(0, 3)
    .map((f) => `<span class="focus-chip">${escapeHtml(f)}</span>`)
    .join('');

  $('quickEquipmentSelect').value = plan.equipment;
  $('quickDaysSelect').value = String(state.profile?.daysPerWeek || plan.daysPerWeek);
  $('aiRebuildPlanBtn').classList.toggle(
    'hidden',
    plan.generatedByAi || !state.aiSettings.enabled || !isAiReady() || !hasAnyPhoto() || !state.metrics
  );

  renderPlanWeekBar(plan);
  renderCardioCard(plan);

  $('planDayTabs').innerHTML = plan.days
    .map((d, idx) => {
      const t = splitDayTitle(d.title);
      const done = planDayDoneThisWeek(d);
      return `<button type="button" role="tab" aria-selected="${idx === state.selectedPlanDay}" class="plan-day-pill ${idx === state.selectedPlanDay ? 'active' : ''} ${done ? 'is-done' : ''}" data-plan-day="${idx}">
        <span class="plan-day-num">${escapeHtml(t.num || `День ${d.dayIndex}`)}${done ? '<i aria-label="выполнено">✓</i>' : ''}</span>
        <span class="plan-day-name">${escapeHtml(t.name)}</span>
      </button>`;
    })
    .join('');
  $('planDayTabs').querySelectorAll('[data-plan-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedPlanDay = Number(btn.dataset.planDay);
      renderPlanTab();
    });
  });
  $('planDayTabs').querySelector('.plan-day-pill.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  const day = plan.days[state.selectedPlanDay];
  const dt = splitDayTitle(day.title);
  $('daySummaryBar').innerHTML = `
    <span class="home-eyebrow">${escapeHtml(dt.num || `День ${day.dayIndex}`)}${planDayDoneThisWeek(day) ? ' • сделано на этой неделе' : ''}</span>
    <h3 class="plan-day-title">${escapeHtml(dt.name)}</h3>
    ${day.focus ? `<p class="home-workout-focus">${escapeHtml(day.focus)}</p>` : ''}
    <div class="home-workout-stats">
      <span><b>${day.items.length}</b>${pluralRu(day.items.length, 'упражнение', 'упражнения', 'упражнений')}</span>
      <span><b>${day.totalSets}</b>${pluralRu(day.totalSets, 'подход', 'подхода', 'подходов')}</span>
      <span><b>~${day.estMinutes}</b>минут</span>
      <span><b>~${day.estKcal}</b>ккал</span>
    </div>
  `;

  const container = $('planExercisesContainer');
  const sections = [...new Set(day.items.map((it) => it.section))];
  container.innerHTML = sections
    .map((sectionName) => {
      const rows = day.items
        .map((item, itemIdx) => ({ item, itemIdx, ex: EXERCISE_MAP[item.exerciseId] }))
        .filter(({ item, ex }) => item.section === sectionName && ex)
        .map(({ item, itemIdx, ex }) => `
          <div class="ex-row" data-open-ex="${ex.id}" data-item-idx="${itemIdx}" role="button" tabindex="0">
            <span class="ex-thumb" style="${exerciseThumbStyle(ex)}" aria-hidden="true"></span>
            <span class="ex-row-main">
              <strong class="ex-row-name">${escapeHtml(ex.name)}</strong>
              <span class="ex-row-rx"><b>${item.sets} × ${escapeHtml(item.reps)}</b> • ${ex.activeRest ? 'спокойно' : 'отдых'} ${item.restSec} с</span>
              ${item.priority ? '<span class="ex-row-flag" title="Упражнение на слабое место, найденное по фото">★ Слабое место</span>' : ''}
            </span>
            <button type="button" class="ex-row-swap" data-swap-idx="${itemIdx}" title="Заменить упражнение" aria-label="Заменить «${escapeHtml(ex.name)}»">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>
            </button>
          </div>`)
        .join('');
      return `
        <section class="ex-group">
          <h4 class="ex-group-title">${escapeHtml(sectionName)}</h4>
          ${sectionName === CARDIO_SECTION ? '<p class="muted small ex-group-hint">Работайте в высоком темпе всё рабочее время, затем отдыхайте.</p>' : ''}
          <div class="ex-list">${rows}</div>
        </section>`;
    })
    .join('');

  container.querySelectorAll('.ex-row').forEach((row) => {
    const item = day.items[Number(row.dataset.itemIdx)];
    const open = () => openExerciseModal(row.dataset.openEx, item?.reason);
    row.addEventListener('click', (e) => {
      if (!e.target.closest('[data-swap-idx]')) open();
    });
    row.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === row) {
        e.preventDefault();
        open();
      }
    });
  });
  container.querySelectorAll('[data-swap-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.swapIdx);
      openSwapModal(state.selectedPlanDay, idx, day.items[idx].exerciseId);
    });
  });
}
/* --------------------------- Exercise Detail Modal --------------------------- */
function openExerciseModal(exerciseId, reason = '') {
  const ex = EXERCISE_MAP[exerciseId];
  if (!ex) return;

  if (state.exModalPlayer) {
    state.exModalPlayer.destroy();
    state.exModalPlayer = null;
  }

  $('exModalCategory').textContent = `${CATEGORY_LABELS[ex.category] || ex.category} • Темп ${ex.tempo}`;
  $('exerciseModalTitle').textContent = ex.name;
  $('exModalBreathing').innerHTML = `<strong>Дыхание:</strong> ${escapeHtml(ex.breathing)}`;
  $('exModalReason').textContent = reason || '';
  $('exModalReason').classList.toggle('hidden', !reason);
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
  const list =
    category === 'all'
      ? EXERCISES
      : category === 'trx'
        ? EXERCISES.filter((e) => e.equipment.length === 1 && e.equipment[0] === 'home_trx')
        : EXERCISES.filter((e) => e.category === category);

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

/* --------------------------- Heart Rate from Smart Watch --------------------------- */
let hrMonitor = null;
let hrRefreshTimer = 0;
let hrLegendKey = '';

function currentHrMax() {
  return hrMaxForAge(state.profile?.age);
}

// Browsers without Web Bluetooth still show the button, so the dialog can explain where it works.
function hrBrowserHint() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    return {
      text: 'На iPhone и iPad браузеры не умеют подключаться к Bluetooth-часам, это ограничение Apple. Пульс с часов работает на Android и на компьютере в Google Chrome.',
      chrome: false,
    };
  }
  let name = '';
  if (/YaBrowser|YaApp|YaSearchBrowser/i.test(ua)) name = 'Яндекс Браузер';
  else if (/SamsungBrowser/i.test(ua)) name = 'Samsung Internet';
  else if (/Firefox/i.test(ua)) name = 'Firefox';
  else if (/Telegram/i.test(ua) || 'TelegramWebviewProxy' in window) name = 'Браузер Telegram';
  else if (/OPR\/|Opera/i.test(ua)) name = 'Opera';
  else if (/; wv\)/.test(ua)) name = 'Встроенный браузер приложения';
  return {
    text: `${name || 'Этот браузер'} не умеет подключаться к Bluetooth-часам. Откройте сайт в Google Chrome, там пульс заработает.`,
    chrome: /Android/i.test(ua),
  };
}

function initHeartRate() {
  const hint = hrBrowserHint();
  if ($('hrUnsupportedText')) $('hrUnsupportedText').textContent = hint.text;
  const chromeLink = $('hrOpenChromeLink');
  if (chromeLink && hint.chrome) {
    chromeLink.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
    chromeLink.classList.remove('hidden');
  }
  hrMonitor = new HeartRateMonitor({ onChange: renderHrUi });
  hrMonitor.onSample((bpm, t) => {
    if (state.wp.active && state.wp.hrSession) state.wp.hrSession.add(bpm, t, currentHrMax(), state.profile);
  });
  renderHrUi(hrMonitor.getState());
}

function hrStatusText(st) {
  if (!st.supported) return '';
  if (st.status === 'connecting') return 'Подключаемся…';
  if (st.status === 'reconnecting') return 'Связь потеряна, переподключаемся…';
  if (st.status === 'connected') {
    const parts = [st.deviceName || 'Часы подключены'];
    if (st.battery != null) parts.push(`заряд ${st.battery}%`);
    if (st.waiting) parts.push(st.contact === false ? 'часы не на руке' : 'ждём пульс');
    return parts.join(' • ');
  }
  if (st.status === 'error') {
    if (st.error === 'no-hr-service') return 'Это устройство не передаёт пульс. Включите на часах трансляцию пульса и подключите снова.';
    return 'Не удалось подключиться. Проверьте, что трансляция пульса включена, а часы рядом с телефоном.';
  }
  return 'Включите на часах трансляцию пульса и нажмите «Подключить часы».';
}

function renderHrLegend(hrMax) {
  const key = String(hrMax);
  if (key === hrLegendKey || !$('hrZoneLegend')) return;
  hrLegendKey = key;
  $('hrZoneLegend').innerHTML = HR_ZONES.map((z, i) => {
    // Ceil matches zoneForHr(), which puts a pulse in a zone once bpm / hrMax reaches its lower bound.
    const lo = Math.ceil(hrMax * z.from);
    const hi = i < HR_ZONES.length - 1 ? Math.ceil(hrMax * HR_ZONES[i + 1].from) - 1 : hrMax;
    return `<span><i style="background:${z.color}"></i>${z.id} • ${escapeHtml(z.name)} <b>${lo}–${hi}</b></span>`;
  }).join('');
}

function renderHrUi(st = hrMonitor?.getState()) {
  if (!st) return;
  const hrMax = currentHrMax();
  const zone = zoneForHr(st.bpm, hrMax);
  const z = zone ? HR_ZONES[zone - 1] : null;
  const linked = ['connected', 'connecting', 'reconnecting'].includes(st.status);
  const period = st.bpm ? `${(60 / st.bpm).toFixed(3)}s` : '1s';

  const chip = $('wpHrBtn');
  if (chip) {
    chip.classList.toggle('is-live', st.bpm > 0);
    chip.classList.toggle('is-linking', linked && !st.bpm);
    chip.dataset.zone = String(zone);
    chip.style.setProperty('--hr-period', period);
    $('wpHrValue').textContent = st.bpm ? String(st.bpm) : linked ? '…' : 'Пульс';
    chip.title = st.bpm && z ? `Пульс ${st.bpm} • зона ${zone} (${z.name})` : 'Пульс с часов';
  }
  const topBtn = $('topHrBtn');
  if (topBtn) {
    topBtn.classList.toggle('is-live', st.bpm > 0);
    topBtn.classList.toggle('is-linking', linked && !st.bpm);
    topBtn.dataset.zone = String(zone);
    topBtn.style.setProperty('--hr-period', period);
    $('topHrValue').textContent = st.bpm ? String(st.bpm) : '';
    topBtn.title = st.bpm
      ? z ? `Пульс ${st.bpm} • зона ${zone} (${z.name})` : `Пульс ${st.bpm} • ниже зон`
      : linked ? 'Часы подключены, ждём пульс' : 'Подключить часы для пульса';
    topBtn.setAttribute('aria-label', topBtn.title);
  }
  const planBtn = $('planHrBtn');
  if (planBtn) {
    planBtn.classList.toggle('is-live', st.bpm > 0);
    planBtn.dataset.zone = String(zone);
    planBtn.style.setProperty('--hr-period', period);
    $('planHrLabel').textContent = st.bpm ? `${st.bpm} уд/мин` : 'Пульс';
  }

  if ($('hrModal')) {
    $('hrUnsupported').classList.toggle('hidden', st.supported);
    $('hrConnectBtn').classList.toggle('hidden', !st.supported || linked);
    $('hrConnectBtn').textContent = canRetryHr(st) ? 'Переподключить' : 'Подключить часы';
    $('hrDisconnectBtn').classList.toggle('hidden', !linked);
    $('hrShowAllBtn').classList.toggle('hidden', !st.supported || linked);
    $('hrStatus').textContent = hrStatusText(st);
    const live = $('hrLive');
    live.classList.toggle('is-live', st.bpm > 0);
    live.dataset.zone = String(zone);
    live.style.setProperty('--hr-period', period);
    $('hrLiveBpm').textContent = st.bpm ? String(st.bpm) : '--';
    $('hrLiveZone').textContent = st.bpm
      ? z ? `Зона ${zone} • ${z.name}` : 'Ниже зон • лёгкая нагрузка'
      : st.status === 'connected' ? 'Ждём пульс…' : 'Часы не подключены';
    $('hrLiveSub').textContent = st.bpm
      ? `${Math.round((st.bpm / hrMax) * 100)}% от максимума ${hrMax} уд/мин`
      : `Макс. пульс ≈ ${hrMax} уд/мин (возраст ${Number(state.profile?.age) || 28} из профиля)`;
    const marker = $('hrZoneMarker');
    marker.classList.toggle('hidden', !st.bpm);
    if (st.bpm) {
      const frac = Math.min(1, Math.max(0, (st.bpm / hrMax - 0.5) / 0.5));
      marker.style.left = `${(frac * 100).toFixed(1)}%`;
    }
    renderHrLegend(hrMax);
  }

  updateRestHr(st);
  renderHomeHr(st);
  if (state.tab === 'profile') renderProfileTab();

  if (linked && !hrRefreshTimer) hrRefreshTimer = window.setInterval(() => renderHrUi(), 2000);
  if (!linked && hrRefreshTimer) {
    clearInterval(hrRefreshTimer);
    hrRefreshTimer = 0;
  }
}

function openHrModal() {
  renderHrUi();
  const st = hrMonitor?.getState();
  if ($('hrHelp')) $('hrHelp').open = Boolean(st?.supported && st.status !== 'connected');
  $('hrModal')?.classList.remove('hidden');
  if (st?.supported && st.status === 'idle' && navigator.bluetooth.getAvailability) {
    navigator.bluetooth.getAvailability().then((available) => {
      if (!available && hrMonitor.getState().status === 'idle') {
        $('hrStatus').textContent = 'Bluetooth выключен или недоступен. Включите Bluetooth на телефоне и откройте это окно снова.';
      }
    }).catch(() => {});
  }
}

function copyAppLink() {
  const url = location.href.split('#')[0];
  const done = () => showToast('Ссылка скопирована. Вставьте её в адресную строку Chrome');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => showToast(url));
  } else {
    showToast(url);
  }
}

// After a lost connection the same watch can be reopened without the chooser; a device without pulse cannot.
function canRetryHr(st) {
  return st.status === 'error' && st.error !== 'no-hr-service' && Boolean(hrMonitor?.device);
}

function connectHeartRate(showAll = false) {
  if (!hrMonitor) return;
  if (!showAll && canRetryHr(hrMonitor.getState())) hrMonitor.retry();
  else hrMonitor.connect({ showAll });
}

/** During rest, shows the live pulse against the recovery target and signals once when it is reached. */
function updateRestHr(st = hrMonitor?.getState()) {
  const el = $('wpRestHr');
  if (!el) return;
  if (!st?.bpm || !state.wp.restTimer) {
    el.classList.add('hidden');
    return;
  }
  const target = recoveryHr(currentHrMax());
  const ok = st.bpm <= target;
  if (!ok) state.wp.restHrWasHigh = true;
  el.classList.remove('hidden');
  el.classList.toggle('is-ok', ok);
  el.textContent = ok ? `Пульс ${st.bpm}: восстановился, можно начинать` : `Пульс ${st.bpm} → ждём ${target}`;
  if (ok && state.wp.restHrWasHigh && !state.wp.restHrNotified) {
    state.wp.restHrNotified = true;
    if (state.wp.soundEnabled) beep(990, 120);
  }
}

function renderHrSummary(hr) {
  const total = hr.zonesSec.reduce((a, s) => a + s, 0) || 1;
  const segs = HR_ZONES.map((z, i) => {
    const sec = hr.zonesSec[i + 1] || 0;
    return sec ? `<i style="width:${((sec / total) * 100).toFixed(1)}%;background:${z.color}" title="Зона ${z.id}: ${formatClock(sec)}"></i>` : '';
  }).join('');
  const legend = HR_ZONES.map((z, i) => {
    const sec = hr.zonesSec[i + 1] || 0;
    return sec >= 30 ? `<span><i style="background:${z.color}"></i>${z.id}: ${Math.round(sec / 60)} мин</span>` : '';
  }).join('');
  const hard = (hr.zonesSec[3] || 0) + (hr.zonesSec[4] || 0) + (hr.zonesSec[5] || 0);
  return `
    <div class="metric-box"><span class="metric-label">Пульс</span><span class="metric-value">${hr.avg}</span><span class="metric-hint">средний, макс. ${hr.max}</span></div>
    <div class="metric-box"><span class="metric-label">Калории</span><span class="metric-value">~${hr.kcal}</span><span class="metric-hint">по пульсу</span></div>
    <div class="metric-box"><span class="metric-label">Зоны 3–5</span><span class="metric-value">${formatClock(hard)}</span><span class="metric-hint">активная работа</span></div>
    <div class="hr-summary-zones">
      <div class="hr-summary-bar">${segs}</div>
      <div class="hr-summary-legend">${legend}</div>
    </div>
  `;
}

/* --------------------------- Fullscreen Interactive Workout Player --------------------------- */
function startWorkoutSession(dayIdx) {
  if (!state.plan?.days?.[dayIdx]) return;
  const day = state.plan.days[dayIdx];
  state.wp.active = true;
  state.wp.dayIndex = dayIdx;
  state.wp.exIdx = 0;
  state.wp.startedAt = Date.now();
  state.wp.hrSession = new HeartRateSession();
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
            !['home_bodyweight', 'home_trx'].includes(state.plan.equipment) && !ex.isTimed
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
  state.wp.restHrWasHigh = false;
  state.wp.restHrNotified = false;
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
  updateRestHr();
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
  updateRestHr();
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
  const hr = state.wp.hrSession?.summary(durationSec) || null;
  state.wp.hrSession = null;

  const weekCount = state.plan.weeks?.length || 1;
  state.workouts = addWorkoutLog({
    dayTitle: weekCount > 1 ? `Неделя ${(state.plan.currentWeek || 0) + 1} • ${day.title}` : day.title,
    equipmentLabel: EQUIPMENT_LABELS[state.plan.equipment] || state.plan.equipmentLabel,
    durationSec,
    doneSets,
    totalSets,
    doneExercises,
    totalExercises: day.items.length,
    ...(hr ? { hr } : {}),
  });

  $('wpActiveBody').classList.add('hidden');
  $('wpSummaryBody').classList.remove('hidden');
  $('wpSummarySubtitle').textContent = `${day.title} сохранена в журнал прогресса.`;
  $('wpSummaryStats').innerHTML = `
    <div class="metric-box"><span class="metric-label">Время</span><span class="metric-value">${formatClock(durationSec)}</span></div>
    <div class="metric-box"><span class="metric-label">Подходы</span><span class="metric-value">${doneSets}/${totalSets}</span></div>
    <div class="metric-box"><span class="metric-label">Упражнения</span><span class="metric-value">${doneExercises}/${day.items.length}</span></div>
    ${hr ? renderHrSummary(hr) : ''}
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
  state.wp.hrSession = null;
  $('workoutOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  if (state.tab === 'home') renderHomeTab();
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

  const weekFrom = startOfWeek().getTime();
  const week = state.workouts.filter((w) => new Date(w.completedAt).getTime() >= weekFrom);
  const weekMinutes = Math.round(week.reduce((a, w) => a + (Number(w.durationSec) || 0), 0) / 60);
  const weekKcal = week.reduce((a, w) => a + workoutKcal(w), 0);
  const streak = workoutWeekStreak();
  const tile = (label, value, unit, sub) => `
    <div class="home-card kpi-tile">
      <span class="home-eyebrow">${label}</span>
      <div class="home-big">${value}${unit ? `<small>${unit}</small>` : ''}</div>
      <span class="home-sub">${sub}</span>
    </div>`;
  $('historyKpis').innerHTML = [
    tile('Тренировки', week.length, '', `за неделю • всего ${state.workouts.length}`),
    tile('Время', weekMinutes, 'мин', 'за неделю'),
    tile('Сожжено', weekKcal, 'ккал', 'за неделю'),
    tile('Серия', streak, pluralRu(streak, 'неделя', 'недели', 'недель'), streak ? 'подряд с тренировками' : 'начните на этой неделе'),
  ].join('');

  renderActivityWeek();
  renderWorkoutLogsList();
  renderProgressChart();
  await renderCompareSection();
  await renderCheckinsList();
}

/** Consecutive weeks with at least one workout; the current week does not break the streak until it ends. */
function workoutWeekStreak() {
  const weekStarts = new Set(state.workouts.map((w) => startOfWeek(new Date(w.completedAt)).getTime()));
  const cursor = startOfWeek();
  if (!weekStarts.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let n = 0;
  while (weekStarts.has(cursor.getTime())) {
    n += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return n;
}

function renderActivityWeek() {
  const wrap = $('activityWeekChart');
  if (!wrap) return;
  const today = getLocalDateKey();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dk = shiftDateKey(today, -i);
    const act = activityForDate(dk);
    const parts = dk.split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    days.push({
      dk,
      minutes: act.minutes,
      kcal: act.kcal,
      cardio: act.logs.some((w) => w.type === 'cardio'),
      strength: act.logs.some((w) => w.type !== 'cardio'),
      label: i === 0 ? 'Сег' : new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dt),
    });
  }
  const total = days.reduce((a, d) => a + d.minutes, 0);
  $('activityWeekTotal').textContent = total ? `${total} мин` : '';
  const maxBar = Math.max(ACTIVE_MINUTES_GOAL * 1.5, ...days.map((d) => d.minutes), 1);
  wrap.innerHTML = `
    <div class="weekly-bars activity-bars">
      ${days.map((d) => {
        const hPct = d.minutes > 0 ? Math.max(8, Math.round((d.minutes / maxBar) * 100)) : 0;
        const kind = d.strength && d.cardio ? 'is-both' : d.cardio ? 'is-cardio' : 'is-strength';
        return `
          <div class="weekly-bar-col ${d.dk === today ? 'active' : ''}" title="${d.dk}: ${d.minutes} мин, ~${d.kcal} ккал">
            <span class="weekly-bar-val">${d.minutes > 0 ? d.minutes : '—'}</span>
            <div class="weekly-bar-wrap"><div class="weekly-bar-fill ${kind}" style="height:${hPct}%"></div></div>
            <span class="weekly-bar-day">${escapeHtml(d.label)}</span>
          </div>`;
      }).join('')}
    </div>
    <div class="activity-legend-row"><span><i class="is-strength"></i>Силовая</span><span><i class="is-cardio"></i>Кардио</span><span class="muted">минуты в день</span></div>
  `;
}
function renderProgressChart() {
  const wrap = $('progressChartWrap');
  const items = [...state.checkins].reverse();
  if (items.length < 2) {
    wrap.innerHTML = items.length
      ? '<p class="muted small progress-empty">После второго замера здесь появится график осанки.</p>'
      : '';
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
    wrap.innerHTML = '';
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
    list.innerHTML = '<p class="muted small progress-empty">Замеров пока нет. Сделайте фото, а на экране анализа нажмите «Сохранить замер в историю».</p>';
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
      if (state.aiAnalysis && !state.aiAnalysis.planParams) {
        state.aiAnalysis.planParams = currentPlanParams(c.profile || state.profile);
      }
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

const STRENGTH_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>';
const CARDIO_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>';
const LOGS_PAGE = 8;

function renderWorkoutLogsList() {
  const list = $('workoutLogsList');
  const count = state.workouts.length;
  $('workoutLogsCount').textContent = count ? `${count} всего` : '';
  if (!count) {
    list.innerHTML = '<p class="muted small progress-empty">Пока пусто. Завершите тренировку или отметьте кардио в плане.</p>';
    return;
  }
  const shown = state.workouts.slice(0, state.logsShown || LOGS_PAGE);
  list.innerHTML = shown
    .map((w) => {
      const cardio = w.type === 'cardio';
      const mins = Math.max(1, Math.round((w.durationSec || 0) / 60));
      const meta = [formatDateRu(w.completedAt)];
      if (!cardio && w.totalSets) meta.push(`${w.doneSets}/${w.totalSets} подх.`);
      if (w.hr?.avg) meta.push(`♥ ${w.hr.avg}`);
      return `
        <div class="log-row">
          <span class="log-icon ${cardio ? 'is-cardio' : ''}">${cardio ? CARDIO_ICON : STRENGTH_ICON}</span>
          <span class="log-main">
            <strong>${escapeHtml(w.dayTitle || (cardio ? 'Кардио' : 'Тренировка'))}</strong>
            <span class="muted tiny">${escapeHtml(meta.join(' • '))}</span>
          </span>
          <span class="log-stats"><span><b>${mins}</b> мин</span><span class="log-kcal">~${workoutKcal(w)} ккал</span></span>
        </div>`;
    })
    .join('') + (count > shown.length ? `<button type="button" class="btn btn-ghost btn-sm log-more-btn" id="logsMoreBtn">Показать ещё</button>` : '');
  $('logsMoreBtn')?.addEventListener('click', () => {
    state.logsShown = (state.logsShown || LOGS_PAGE) + LOGS_PAGE;
    renderWorkoutLogsList();
  });
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

function adjustDailyWater(deltaMl, dateKey = state.nutrition.selectedDate || getLocalDateKey()) {
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
  const isOverKcal = eaten.kcal > target.targetKcal * 1.06;

  const kcalDiff = target.targetKcal - eaten.kcal;
  const kcalSub = kcalDiff >= 0
    ? `Осталось ${kcalDiff} ккал`
    : `Превышение +${Math.abs(kcalDiff)} ккал`;
  const circ = 2 * Math.PI * 34;
  const offset = +(circ * (1 - kcalPctRing / 100)).toFixed(2);
  const macro = (name, val, max, over = false) =>
    `<span class="home-macro ${over ? 'is-over' : ''}"><i style="--p:${pct(val, max)}%"></i>${name} <b>${val}</b>/${max} г</span>`;

  $('nutritionMacroCards').innerHTML = `
    <div class="nutri-sum">
      <div class="home-nutri-top">
        <div class="home-ring ${isOverKcal ? 'over' : ''}">
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" class="home-ring-track"/>
            <circle cx="40" cy="40" r="34" class="home-ring-fill" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset}"/>
          </svg>
          <span>${kcalPctRaw}<small>%</small></span>
        </div>
        <div class="home-nutri-copy">
          <span class="home-eyebrow">Калории</span>
          <div class="home-big">${eaten.kcal}<small>/ ${target.targetKcal} ккал</small></div>
          <span class="home-sub ${kcalDiff < 0 ? 'is-over' : ''}">${kcalSub}</span>
        </div>
      </div>
      <div class="home-macros">
        ${macro('Б', eaten.protein, target.proteinGrams)}
        ${macro('Ж', eaten.fat, target.fatGrams, eaten.fat > target.fatGrams * 1.15)}
        ${macro('У', eaten.carbs, target.carbsGrams)}
      </div>
      <div class="nutri-water-row">
        <span class="home-water-label"><svg class="water-inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.7 6.4 9.5a7.5 7.5 0 1 0 11.2 0Z"/></svg>Вода <b>${waterMl}</b> / ${targetWaterMl} мл</span>
        <div class="home-bar nutri-water-bar"><i style="width:${pct(waterMl, targetWaterMl)}%"></i></div>
        <div class="water-btns">
          <button type="button" class="btn btn-ghost btn-xs water-minus-btn" data-water-delta="-250" title="Убрать 250 мл" aria-label="Убрать 250 мл">−</button>
          <button type="button" class="btn btn-outline btn-xs" data-water-delta="250">+250</button>
          <button type="button" class="btn btn-outline btn-xs" data-water-delta="500">+500</button>
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
  $('dailyMealsSummaryBadge').textContent = `${totalKcal} ккал`;

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
      const ings = m.ingredients || [];
      const ingsSummary = ings.length > 1 || (ings[0] && ings[0].name !== m.dishName)
        ? ings.map((i) => `${escapeHtml(i.name)} (${i.grams} г)`).join(' • ')
        : '';
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
  if (id === 'cameraModal') {
    stopCameraStream();
    hideCameraTip();
    exitCameraFullscreen();
    if (!$('analysisCanvasStage').classList.contains('is-fullscreen')) document.body.classList.remove('no-scroll');
  }
  if (id === 'exerciseModal' && state.exModalPlayer) {
    state.exModalPlayer.destroy();
    state.exModalPlayer = null;
  }
  if (id === 'catalogModal') destroyCatalogPlayers();
}

/* --------------------------- Event Wiring & Init --------------------------- */
function initEvents() {
  // Header nav & theme
  $('brandHome').addEventListener('click', () => switchTab('home'));
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('[data-goto-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.gotoTab === 'capture') openWizard('about');
      else switchTab(btn.dataset.gotoTab);
    });
  });
  $('themeToggleBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (state.tab === 'profile') renderProfileTab();
  });

  // Home dashboard cards
  const homeGrid = $('homeGrid');
  homeGrid.addEventListener('click', (e) => {
    const el = e.target.closest('[data-home-action], [data-home-go]');
    if (el && homeGrid.contains(el)) runHomeAction(el);
  });
  homeGrid.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.home-card')) {
      e.preventDefault();
      runHomeAction(e.target);
    }
  });

  // Wizard
  $('wizardNextBtn').addEventListener('click', wizardNext);
  $('wizardBackBtn').addEventListener('click', wizardBack);
  $('wizardCloseBtn').addEventListener('click', closeWizard);
  $('planWithoutPhotosBtn').addEventListener('click', buildPlanWithoutPhotos);
  $('analysisBackBtn').addEventListener('click', () => switchTab(state.navTab || 'home'));

  // Profile & settings
  document.querySelectorAll('[data-profile-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openWizard(btn.dataset.profileEdit, { edit: true }));
  });
  $('profileNewAnalysisBtn').addEventListener('click', () => openWizard('front'));
  $('profileLastAnalysisBtn').addEventListener('click', () => {
    if (state.metrics) switchTab('analysis');
    else {
      switchTab('history');
      showToast('Откройте сохранённый замер в списке, чтобы посмотреть анализ');
    }
  });
  $('profileHrBtn').addEventListener('click', openHrModal);
  $('profileMusicBtn').addEventListener('click', openMusicModal);
  $('profileAiBtn').addEventListener('click', openAiSettingsModal);
  $('profileThemeBtn').addEventListener('click', () => $('themeToggleBtn').click());
  $('profileExportBtn').addEventListener('click', () => $('exportBackupBtn').click());
  $('profileImportBtn').addEventListener('click', () => $('importBackupInput').click());

  // Tab 1 actions
  $('clearPhotosBtn').addEventListener('click', () => {
    state.photos = { front: null, side: null, back: null, side2: null };
    renderAnglesGrid();
    showToast('Фото очищены');
  });
  $('profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    // Enter in a field submits the form; only the last step starts the analysis.
    if (WIZARD_STEPS[state.wizard.step] !== 'finish' || state.wizard.edit) {
      wizardNext();
      return;
    }
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

  $('toggleEditPointsBtn').addEventListener('click', () => setPointEditMode(!state.overlay.editMode));
  $('fsDoneEditBtn').addEventListener('click', () => setPointEditMode(false));
  $('fsRebuildPlanBtn').addEventListener('click', () => $('rebuildPlanFromEditsBtn').click());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('analysisCanvasStage').classList.contains('is-fullscreen')) setPointEditMode(false);
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
    link.download = `siluetika-${state.selectedAnalysisAngle}.png`;
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
    const lostAi = rebuildPlanFromProfile();
    showToast(
      lostAi
        ? 'План перестроен под новый формат. Чтобы AI составил его заново, нажмите «Пересобрать через AI»'
        : 'План перестроен под выбранный формат'
    );
  };
  $('aiRebuildPlanBtn').addEventListener('click', handleManualAiRun);
  $('quickEquipmentSelect').addEventListener('change', regenerateQuick);
  $('quickDaysSelect').addEventListener('change', regenerateQuick);
  $('startWorkoutBtn').addEventListener('click', () => startWorkoutSession(state.selectedPlanDay));
  $('historyNewAnalysisBtn').addEventListener('click', () => openWizard('front'));
  $('planSettingsBtn').addEventListener('click', () => {
    const panel = $('planSettingsPanel');
    const open = panel.classList.toggle('hidden') === false;
    $('planSettingsBtn').setAttribute('aria-expanded', String(open));
    $('planSettingsBtn').classList.toggle('active', open);
  });

  $('openCatalogBtn').textContent = `Все упражнения (${EXERCISES.length})`;
  const allChip = $('catalogFilters').querySelector('[data-cat="all"]');
  if (allChip) allChip.textContent = `Все (${EXERCISES.length})`;
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
  $('cameraVideo').addEventListener('loadedmetadata', fitCameraStage);
  $('cameraVideo').addEventListener('resize', fitCameraStage);
  window.addEventListener('resize', fitCameraStage);
  document.addEventListener('fullscreenchange', fitCameraStage);
  $('cameraTimerCycleBtn').addEventListener('click', cycleCameraTimer);
  document.querySelectorAll('input[name="camTimer"]').forEach((r) => r.addEventListener('change', syncCameraTimerLabel));
  initCameraGuideDrag();
  $('cameraRetakeBtn').addEventListener('click', () => {
    state.camera.capturedDataUrl = null;
    $('cameraPreviewImg').classList.add('hidden');
    $('cameraVideo').classList.remove('hidden');
    $('cameraReviewControls').classList.add('hidden');
    $('cameraLiveControls').classList.remove('hidden');
    fitCameraStage();
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
    a.download = `siluetika-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        state.plan = normalizePlan(loadActivePlan());
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
      ['hrModal', 'musicModal', 'cameraModal', 'exerciseModal', 'swapModal', 'catalogModal', 'aiSettingsModal'].forEach((id) => {
        if (!$(id)?.classList.contains('hidden')) closeModal(id);
      });
    }
  });

  // Workout Music Player events
  $('openMusicBtn')?.addEventListener('click', openMusicModal);
  $('planMusicBtn')?.addEventListener('click', openMusicModal);
  $('wpMusicBtn')?.addEventListener('click', openMusicModal);
  $('wpHrBtn')?.addEventListener('click', openHrModal);
  $('planHrBtn')?.addEventListener('click', openHrModal);
  $('topHrBtn')?.addEventListener('click', openHrModal);
  $('hrCopyLinkBtn')?.addEventListener('click', copyAppLink);
  $('hrConnectBtn')?.addEventListener('click', () => connectHeartRate(false));
  $('hrShowAllBtn')?.addEventListener('click', () => connectHeartRate(true));
  $('hrDisconnectBtn')?.addEventListener('click', () => hrMonitor?.disconnect());
  $('musicPlayToggleBtn')?.addEventListener('click', () => musicController?.togglePlay());
  $('musicBeatTapBtn')?.addEventListener('click', tapMusicDownbeat);
  $('wpBeatChip')?.addEventListener('click', tapMusicDownbeat);
  $('musicPrevBtn')?.addEventListener('click', () => musicController?.prev());
  $('musicNextBtn')?.addEventListener('click', () => musicController?.next());
  $('musicVolumeRange')?.addEventListener('input', (e) => {
    musicController?.setVolume(Number(e.target.value) / 100);
  });
  $('musicLocalInput')?.addEventListener('change', async (e) => {
    const ok = await musicController?.loadLocalFiles(e.target.files);
    if (ok) {
      showToast('Треки с устройства загружены в плеер!');
    }
    e.target.value = '';
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
            ? 'AI Ассистент готов'
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

// Without a fresh analysis in memory, reuse the weak spots the current plan was built from.
function planMetricsSource() {
  if (state.metrics) return state.metrics;
  const focusTags = state.plan?.focusTags || state.checkins?.[0]?.metrics?.focusTags || [];
  return { focusTags };
}

// Plans saved by an older generator are rebuilt once with the current rules.
function upgradeLegacyPlan() {
  const plan = state.plan;
  if (!plan || plan.version >= PLAN_VERSION) return;
  const profile = {
    ...state.profile,
    equipment: plan.equipment || state.profile.equipment,
    daysPerWeek: plan.days?.length || state.profile.daysPerWeek,
  };
  // An old AI week stays as week 1 (filtered to the equipment); rotation weeks are added after it.
  const aiDays = plan.weeks?.find((w) => w.source === 'ai')?.days || plan.days;
  const aiWeek = plan.generatedByAi
    ? {
        provider: plan.aiProviderLabel || 'AI',
        model: '',
        planParams: { equipment: profile.equipment, daysPerWeek: profile.daysPerWeek },
        customPlanDays: aiDays.map((d) => ({
          dayIndex: d.dayIndex,
          title: d.title,
          focus: d.focus,
          items: d.items.map((it) => ({
            exerciseId: it.exerciseId,
            sets: it.sets,
            reps: it.reps,
            restSec: it.restSec,
            reason: String(it.reason || '').replace(/^AI Ассистент •\s*/, ''),
          })),
        })),
      }
    : null;
  state.plan = generateWorkoutPlan(planMetricsSource(), profile, aiWeek);
  if (state.plan.generatedByAi) state.plan.aiProviderLabel = plan.aiProviderLabel || state.plan.aiProviderLabel;
  saveActivePlan(state.plan);
}

function bootstrap() {
  state.nutrition.selectedDate = getLocalDateKey();
  setSelectedMealType(pickDefaultMealTypeByHour());
  musicController = new WorkoutMusicController(renderMusicPlayerUi);
  renderMusicStationsGrid();
  renderMusicPlayerUi(musicController.getState());
  initHeartRate();
  applyTheme(loadTheme());
  applyCloudModeUi();
  syncInlineAiFromState();
  updateAiStatusIndicator();
  renderDemoPresets();
  renderAnglesGrid();
  syncProfileFormFromState();
  initEvents();
  upgradeLegacyPlan();
  if (state.plan) renderPlanTab();
  renderNutritionTab();
  switchTab('home');
  detectServerEnvProviders();
  preloadExerciseSprites(EXERCISES.slice(0, 6).map((e) => e.animId));
}

bootstrap();
