/**
 * Local Browser Storage Manager (localStorage + IndexedDB for photo snapshots)
 * Keeps all photos and user history strictly local on the user's device.
 */

const KEYS = {
  PROFILE: 'bodycoach_profile_v1',
  PLAN: 'bodycoach_active_plan_v1',
  CHECKINS: 'bodycoach_checkins_v1',
  WORKOUTS: 'bodycoach_workouts_v1',
  MEALS: 'bodycoach_meals_v1',
  WATER: 'bodycoach_water_v1',
  AI_SETTINGS: 'bodycoach_ai_settings_v1',
  THEME: 'bodycoach_theme_v1',
};

const IDB_NAME = 'bodycoach_media_db';
const IDB_STORE = 'checkin_photos';
const IDB_VERSION = 1;

export const DEFAULT_PROFILE = {
  sex: 'male',
  age: 28,
  heightCm: 178,
  weightKg: 78,
  goal: 'recomp',
  equipment: 'home_bodyweight',
  level: 'beginner',
  daysPerWeek: 3,
};

export const DEFAULT_AI_SETTINGS = {
  enabled: true,
  provider: 'openai', // openai | gemini | openrouter | custom
  model: 'gpt-6-luna',
  baseUrl: '',
  apiKey: '',
  rememberKey: false,
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProfile() {
  return { ...DEFAULT_PROFILE, ...readJson(KEYS.PROFILE, {}) };
}

export function saveProfile(profile) {
  return writeJson(KEYS.PROFILE, profile);
}

export function loadActivePlan() {
  return readJson(KEYS.PLAN, null);
}

export function saveActivePlan(plan) {
  return writeJson(KEYS.PLAN, plan);
}

export function loadCheckins() {
  return readJson(KEYS.CHECKINS, []);
}

export function saveCheckins(list) {
  return writeJson(KEYS.CHECKINS, list.slice(0, 30));
}

export function loadWorkoutLogs() {
  return readJson(KEYS.WORKOUTS, []);
}

export function addWorkoutLog(entry) {
  const logs = loadWorkoutLogs();
  logs.unshift({
    id: `wk_${Date.now()}`,
    completedAt: new Date().toISOString(),
    ...entry,
  });
  writeJson(KEYS.WORKOUTS, logs.slice(0, 120));
  return logs;
}

export function loadAiSettings() {
  const stored = { ...DEFAULT_AI_SETTINGS, ...readJson(KEYS.AI_SETTINGS, {}) };
  // Auto-migrate retired Gemini 2.5 models saved in earlier sessions
  if (stored.provider === 'gemini' && (stored.model === 'gemini-2.5-flash' || stored.model === 'gemini-2.5-pro' || stored.model === 'gemini-2.0-flash')) {
    stored.model = 'gemini-4-hydrogen';
  }
  if (!stored.rememberKey) {
    stored.apiKey = sessionStorage.getItem('bodycoach_session_apikey') || '';
  }
  return stored;
}

export function saveAiSettings(settings) {
  const clean = { ...DEFAULT_AI_SETTINGS, ...settings };
  if (clean.rememberKey) {
    sessionStorage.removeItem('bodycoach_session_apikey');
    writeJson(KEYS.AI_SETTINGS, clean);
  } else {
    sessionStorage.setItem('bodycoach_session_apikey', clean.apiKey || '');
    writeJson(KEYS.AI_SETTINGS, { ...clean, apiKey: '' });
  }
  return clean;
}

export function loadTheme() {
  return localStorage.getItem(KEYS.THEME) || 'dark';
}

export function saveTheme(theme) {
  localStorage.setItem(KEYS.THEME, theme);
}

/**
 * Compress a photo dataURL to a crisp lightweight thumbnail for IndexedDB / Vision API.
 */
export function compressImageDataUrl(dataUrl, maxWidth = 640, quality = 0.78) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCheckinPhotos(checkinId, photos) {
  try {
    const compressed = {};
    for (const [k, v] of Object.entries(photos || {})) {
      if (v) compressed[k] = await compressImageDataUrl(v, 540, 0.76);
    }
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ id: checkinId, photos: compressed });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return compressed;
  } catch {
    return null;
  }
}

export async function loadCheckinPhotos(checkinId) {
  try {
    const db = await openPhotoDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(checkinId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record?.photos || null;
  } catch {
    return null;
  }
}

export async function deleteCheckinById(checkinId) {
  const list = loadCheckins().filter((c) => c.id !== checkinId);
  saveCheckins(list);
  try {
    const db = await openPhotoDb();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(checkinId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore IDB errors
  }
  return list;
}

export function loadMeals() {
  const list = readJson(KEYS.MEALS, []);
  return Array.isArray(list) ? list : [];
}

export function saveMeals(list) {
  const safe = (Array.isArray(list) ? list : []).slice(0, 240).map((m, idx) => ({
    ...m,
    // Keep lightweight thumbnails on recent 40 entries so localStorage stays compact
    thumb: idx < 40 ? m.thumb || null : null,
  }));
  return writeJson(KEYS.MEALS, safe);
}

export function loadWaterByDate() {
  const map = readJson(KEYS.WATER, {});
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

export function saveWaterByDate(map) {
  const entries = Object.entries(map || {})
    .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(Number(v)) && Number(v) > 0)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 120);
  return writeJson(KEYS.WATER, Object.fromEntries(entries));
}

export function exportAllDataJson() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 2,
      profile: loadProfile(),
      activePlan: loadActivePlan(),
      checkins: loadCheckins(),
      workouts: loadWorkoutLogs(),
      meals: loadMeals(),
      waterByDate: loadWaterByDate(),
    },
    null,
    2
  );
}

export function importAllDataJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object') throw new Error('Некорректный файл резервной копии');
  if (parsed.profile) saveProfile(parsed.profile);
  if (parsed.activePlan) saveActivePlan(parsed.activePlan);
  if (Array.isArray(parsed.checkins)) saveCheckins(parsed.checkins);
  if (Array.isArray(parsed.workouts)) writeJson(KEYS.WORKOUTS, parsed.workouts);
  if (Array.isArray(parsed.meals)) saveMeals(parsed.meals);
  if (parsed.waterByDate && typeof parsed.waterByDate === 'object') saveWaterByDate(parsed.waterByDate);
  return true;
}
