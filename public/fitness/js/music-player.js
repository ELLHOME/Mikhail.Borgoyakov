/**
 * BodyCoach Workout Music Engine
 * Supports:
 * 0) Jamendo block stations (warm-up, cardio, peak, strength, cool-down, stretch) from a
 *    pre-analysed catalog with a beat grid, so the player can show the 1–8 count
 * 1) Live HTTPS fitness radio streams (with automatic backup URL failover)
 * 2) Zero-network Web Audio API procedural workout beat synthesizer (124 / 92 BPM)
 * 3) Local device audio playlist (MP3 / M4A / WAV / OGG — 100% on-device)
 * 4) Automatic volume ducking during workout timer beeps + MediaSession lock-screen controls
 */

const STORAGE_KEY = 'bodycoach_music_v1';
const SYNC_KEY = 'bodycoach_jm_sync_v1';
const MODULE_VERSION = new URL(import.meta.url).searchParams.get('v') || '';
const CATALOG_URL = new URL(`../assets/music/jamendo-beats.json${MODULE_VERSION ? `?v=${MODULE_VERSION}` : ''}`, import.meta.url).href;
const JAMENDO_AUDIO = (id) => `https://prod-1.storage.jamendo.com/?trackid=${encodeURIComponent(id)}&format=mp32`;
const FADE_OUT_SEC = 4;
const FADE_IN_MS = 1500;

export const WORKOUT_STATIONS = [
  { id: 'jm_warmup', group: 'blocks', mode: 'jamendo', name: 'Разминка', desc: 'House • 118–128 BPM', tag: 'Счёт' },
  { id: 'jm_cardio', group: 'blocks', mode: 'jamendo', name: 'Кардио', desc: 'House / EDM • 126–136 BPM', tag: 'Счёт' },
  { id: 'jm_peak', group: 'blocks', mode: 'jamendo', name: 'Пик', desc: 'Trance / techno • 136–150 BPM', tag: 'Счёт' },
  { id: 'jm_strength', group: 'blocks', mode: 'jamendo', name: 'Силовая', desc: 'Hip-hop / funk • 100–118 BPM', tag: 'Счёт' },
  { id: 'jm_cooldown', group: 'blocks', mode: 'jamendo', name: 'Заминка', desc: 'Lounge / chillout • 90–110 BPM', tag: 'Счёт' },
  { id: 'jm_stretch', group: 'blocks', mode: 'jamendo', name: 'Растяжка', desc: 'Ambient • 60–95 BPM', tag: 'Спокойно' },
  {
    id: 'workout',
    name: 'Workout EDM',
    desc: 'Кардио и темп • 128+ BPM',
    tag: 'Онлайн',
    mode: 'stream',
    urls: [
      'https://radiorecord.hostingradio.ru/workout96.aacp',
      'https://listen.reyfm.de/gaming_192kbps.mp3',
    ],
  },
  {
    id: 'phonk',
    name: 'Gym Phonk',
    desc: 'Тяжёлый бас для силовых',
    tag: 'Онлайн',
    mode: 'stream',
    urls: [
      'https://radiorecord.hostingradio.ru/phonk96.aacp',
      'https://listen.reyfm.de/raproyal_192kbps.mp3',
    ],
  },
  {
    id: 'trap',
    name: 'Hip-Hop & Trap',
    desc: 'Ритм для зала и гантелей',
    tag: 'Онлайн',
    mode: 'stream',
    urls: [
      'https://radiorecord.hostingradio.ru/trap96.aacp',
      'https://listen.reyfm.de/raproyal_192kbps.mp3',
    ],
  },
  {
    id: 'synth',
    name: 'Synthwave Drive',
    desc: 'Неоновая электроника',
    tag: 'Онлайн',
    mode: 'stream',
    urls: [
      'https://radiorecord.hostingradio.ru/synth96.aacp',
      'https://listen.reyfm.de/gaming_192kbps.mp3',
    ],
  },
  {
    id: 'rock',
    name: 'Rock Workout',
    desc: 'Гитарный драйв на подходы',
    tag: 'Онлайн',
    mode: 'stream',
    urls: [
      'https://radiorecord.hostingradio.ru/rock96.aacp',
      'https://radiorecord.hostingradio.ru/workout96.aacp',
    ],
  },
  {
    id: 'lofi',
    name: 'Lo-Fi & Chill',
    desc: 'Осанка, разминка и МФР',
    tag: 'Онлайн',
    mode: 'stream',
    urls: [
      'https://radiorecord.hostingradio.ru/lofi96.aacp',
      'https://listen.reyfm.de/lofi_192kbps.mp3',
    ],
  },
  {
    id: 'offline_power',
    name: 'Офлайн-бит 124 BPM',
    desc: 'Синтез ритма без интернета',
    tag: 'Офлайн',
    mode: 'synth',
    bpm: 124,
    style: 'power',
  },
  {
    id: 'offline_calm',
    name: 'Офлайн-чилл 92 BPM',
    desc: 'Мягкий пульс без сети',
    tag: 'Офлайн',
    mode: 'synth',
    bpm: 92,
    style: 'calm',
  },
];

const DEFAULT_STATION = 'jm_warmup';

function loadSavedPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stationId: DEFAULT_STATION, volume: 0.65 };
    const parsed = JSON.parse(raw);
    return {
      stationId: WORKOUT_STATIONS.some((s) => s.id === parsed.stationId) ? parsed.stationId : DEFAULT_STATION,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0.05, parsed.volume)) : 0.65,
    };
  } catch {
    return { stationId: DEFAULT_STATION, volume: 0.65 };
  }
}

function loadSyncFixes() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveSyncFix(id, fix) {
  try {
    const all = loadSyncFixes();
    all[id] = fix;
    const ids = Object.keys(all);
    if (ids.length > 300) delete all[ids[0]];
    localStorage.setItem(SYNC_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota errors
  }
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Count position for playback time t (seconds) on a constant beat grid. */
export function beatPosition(beat, t) {
  if (!beat || !(beat.period > 0)) return null;
  if (beat.validUntil && t > beat.validUntil) return null;
  // Show the number a hair early so it lands with the sound, not after it.
  const x = (t - beat.offset) / beat.period + 0.03;
  if (x < -0.5) return null;
  const k = Math.floor(x);
  const rel = (((k - beat.phrasePhase) % 32) + 32) % 32;
  return {
    beatIndex: k,
    count: (rel % 8) + 1,
    eight: Math.floor(rel / 8) + 1,
    phraseBeat: rel,
    frac: x - k,
  };
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export class WorkoutMusicController {
  constructor(onStateChange) {
    this.onStateChange = onStateChange;
    const prefs = loadSavedPrefs();

    this.stationId = prefs.stationId;
    this.volume = prefs.volume;
    this.duckMultiplier = 1;
    this.duckTimer = null;

    this.playing = false;
    this.buffering = false;
    this.errorText = '';
    this.sourceMode = 'station'; // 'station' | 'local'
    this.urlAttemptIdx = 0;
    this.stallTimer = null;

    // Local playlist state
    this.localTracks = []; // [{ name, url }]
    this.localIndex = 0;

    // Jamendo block stations
    this.audioOwner = null; // 'jamendo' | 'stream' | 'local'
    this.fadeMultiplier = 1;
    this.fadeTimer = null;
    this.jm = { catalog: null, loading: null, order: {}, pos: {}, current: null, history: [], errors: 0 };

    // HTML5 Audio element for streams & local files; a second one preloads the next Jamendo track
    this.audio = this._makeAudio();
    this.preAudio = null;
    this.preItem = null;

    // Web Audio procedural beat state
    this.synthCtx = null;
    this.synthMaster = null;
    this.synthStepTimer = null;
    this.synthStep = 0;

    this._setupMediaSession();
  }

  _makeAudio() {
    const el = new Audio();
    el.preload = 'none';
    el.playsInline = true;
    this._bindAudioEvents(el);
    return el;
  }

  _bindAudioEvents(el) {
    const on = (type, fn) => el.addEventListener(type, () => {
      if (el === this.audio) fn();
    });
    on('playing', () => {
      this._clearStallTimer();
      this.buffering = false;
      this.playing = true;
      this.errorText = '';
      this._updateMediaSessionState();
      this._emit();
    });

    on('waiting', () => {
      if (this.playing) {
        this.buffering = true;
        this._emit();
      }
    });

    on('pause', () => {
      // Ignore transient pause during source switching
      if (this._switchingSource) return;
      // A finished Jamendo track rolls straight into the next one.
      if (this.audio.ended && this.audioOwner === 'jamendo') return;
      if (this._getActiveEngine() === 'audio') {
        this.playing = false;
        this.buffering = false;
        this._updateMediaSessionState();
        this._emit();
      }
    });

    on('ended', () => {
      if (this.audioOwner === 'jamendo') {
        this._jmAdvance();
        return;
      }
      if (this.sourceMode === 'local' && this.localTracks.length > 0) {
        this.next();
      }
    });

    on('timeupdate', () => {
      if (this.audioOwner !== 'jamendo') return;
      const left = this.audio.duration - this.audio.currentTime;
      if (Number.isFinite(left) && left < 45 && !this.preItem) this._jmPreload();
      if (this.fadeTimer) return;
      const target = Number.isFinite(left) && left < FADE_OUT_SEC ? Math.max(0, left / FADE_OUT_SEC) : 1;
      if (Math.abs(target - this.fadeMultiplier) > 0.01) {
        this.fadeMultiplier = target;
        this._applyEffectiveVolume();
      }
    });

    on('error', () => {
      if (this._switchingSource || !this.playing) return;
      if (this.audioOwner === 'jamendo') {
        this._jmOnError();
        return;
      }
      this._handleStreamError();
    });
  }

  _getActiveEngine() {
    if (this.sourceMode === 'local') return 'audio';
    const st = this.getCurrentStation();
    return st.mode === 'synth' ? 'synth' : 'audio';
  }

  getCurrentStation() {
    return WORKOUT_STATIONS.find((s) => s.id === this.stationId) || WORKOUT_STATIONS[0];
  }

  getState() {
    const st = this.getCurrentStation();
    const isLocal = this.sourceMode === 'local' && this.localTracks.length > 0;
    const currentLocal = isLocal ? this.localTracks[this.localIndex] : null;
    const jmTrack = !isLocal && st.mode === 'jamendo' && this.jm.current?.stationId === st.id ? this.jm.current : null;

    let title = st.name;
    let subtitle = st.desc;
    if (isLocal) {
      title = currentLocal.name;
      subtitle = `Своя музыка • Трек ${this.localIndex + 1} из ${this.localTracks.length}`;
    } else if (jmTrack) {
      title = jmTrack.n;
      subtitle = `${jmTrack.a} • ${st.name}${jmTrack.beat ? ` • ${Math.round(jmTrack.beat.bpm)} BPM` : ''}`;
    }

    return {
      playing: this.playing,
      buffering: this.buffering,
      volume: this.volume,
      sourceMode: isLocal ? 'local' : 'station',
      stationId: this.stationId,
      stationMode: st.mode,
      title,
      shortTitle: jmTrack ? st.name : title,
      subtitle,
      credit: jmTrack ? { url: jmTrack.s || '', licenseUrl: jmTrack.l || '', artist: jmTrack.a } : null,
      hasBeat: Boolean(jmTrack?.beat),
      bpm: jmTrack?.beat ? Math.round(jmTrack.beat.bpm) : 0,
      localCount: this.localTracks.length,
      errorText: this.errorText,
    };
  }

  /** Current 1–8 count, or null when no beat grid is playing. */
  getBeatInfo() {
    if (this.audioOwner !== 'jamendo' || !this.playing || this.buffering || this.audio.paused) return null;
    const beat = this.jm.current?.beat;
    if (!beat) return null;
    const pos = beatPosition(beat, this.audio.currentTime);
    return pos ? { ...pos, bpm: Math.round(beat.bpm) } : null;
  }

  /**
   * The user tapped on what they hear as count «1»: re-anchor the phrase there, and move the
   * grid by half a beat when the tap clearly sits between two detected beats.
   */
  tapDownbeat() {
    const cur = this.jm.current;
    if (this.audioOwner !== 'jamendo' || !cur?.beat) return false;
    const beat = cur.beat;
    const t = this.audio.currentTime;
    let x = (t - beat.offset) / beat.period;
    const frac = x - Math.floor(x);
    if (frac > 0.25 && frac < 0.75) {
      beat.offset += beat.period / 2;
      x = (t - beat.offset) / beat.period;
    }
    const k = Math.round(x);
    beat.phrasePhase = ((k % 32) + 32) % 32;
    saveSyncFix(cur.id, { o: Math.round(beat.offset * 1e4) / 1e4, ph: beat.phrasePhase });
    this._emit();
    return true;
  }

  _emit() {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.getState());
    }
  }

  _applyEffectiveVolume() {
    const eff = Math.max(0, Math.min(1, this.volume * this.duckMultiplier * this.fadeMultiplier));
    this.audio.volume = eff;
    if (this.synthMaster && this.synthCtx) {
      this.synthMaster.gain.setTargetAtTime(eff * 0.42, this.synthCtx.currentTime, 0.04);
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val)));
    this._applyEffectiveVolume();
    savePrefs({ stationId: this.stationId, volume: this.volume });
    this._emit();
  }

  /**
   * Smoothly ducks music volume so workout hold/rest timer beeps cut through clearly.
   */
  duck(durationMs = 650) {
    if (!this.playing) return;
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckMultiplier = 0.26;
    this._applyEffectiveVolume();
    this.duckTimer = setTimeout(() => {
      this.duckMultiplier = 1;
      this._applyEffectiveVolume();
      this.duckTimer = null;
    }, durationMs);
  }

  async togglePlay() {
    if (this.playing || this.buffering) {
      this.pause();
    } else {
      await this.play();
    }
  }

  async selectStation(stationId) {
    if (stationId === this.stationId && this.sourceMode === 'station' && this.playing) return;
    this._dropPreload();
    this.stationId = stationId;
    this.sourceMode = 'station';
    this.urlAttemptIdx = 0;
    this.errorText = '';
    savePrefs({ stationId: this.stationId, volume: this.volume });
    await this.play();
  }

  async loadLocalFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name));
    if (!files.length) return false;

    // Revoke previous object URLs to prevent memory leaks
    this.localTracks.forEach((t) => URL.revokeObjectURL(t.url));
    this.localTracks = files.map((f) => ({
      name: f.name.replace(/\.[^/.]+$/, ''),
      url: URL.createObjectURL(f),
    }));
    this.localIndex = 0;
    this._dropPreload();
    this.sourceMode = 'local';
    this.errorText = '';
    await this.play();
    return true;
  }

  async play() {
    this.errorText = '';
    this._applyEffectiveVolume();

    if (this.sourceMode === 'local' && this.localTracks.length > 0) {
      this._stopSynth();
      const track = this.localTracks[this.localIndex];
      this.audioOwner = 'local';
      this._setFade(1);
      await this._playAudioUrl(track.url, false);
      return;
    }

    const st = this.getCurrentStation();
    if (st.mode === 'jamendo') {
      this._stopSynth();
      const cur = this.jm.current;
      if (this.audioOwner === 'jamendo' && cur?.stationId === st.id && this.audio.src) {
        this.playing = true;
        this._fadeIn();
        try {
          await this.audio.play();
        } catch (err) {
          if (err?.name !== 'AbortError') this._jmOnError();
        }
        return;
      }
      await this._jmAdvance();
      return;
    }
    if (st.mode === 'synth') {
      this.audioOwner = null;
      this._stopAudioElement();
      this._setFade(1);
      this._startSynth(st.bpm || 124, st.style || 'power');
      this.playing = true;
      this.buffering = false;
      this._updateMediaSessionMetadata();
      this._updateMediaSessionState();
      this._emit();
      return;
    }

    this._stopSynth();
    this.audioOwner = 'stream';
    this._setFade(1);
    const url = st.urls[this.urlAttemptIdx] || st.urls[0];
    await this._playAudioUrl(url, true);
  }

  /* ------------------- Jamendo block stations ------------------- */
  async _jmLoadCatalog() {
    if (this.jm.catalog) return this.jm.catalog;
    if (!this.jm.loading) {
      this.jm.loading = fetch(CATALOG_URL)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`catalog ${r.status}`))))
        .then((j) => {
          this.jm.catalog = j.stations || {};
          return this.jm.catalog;
        })
        .finally(() => {
          this.jm.loading = null;
        });
    }
    return this.jm.loading;
  }

  _jmPick(stationId) {
    const list = this.jm.catalog?.[stationId] || [];
    if (!list.length) return null;
    if (!this.jm.order[stationId] || this.jm.order[stationId].length !== list.length) {
      this.jm.order[stationId] = shuffled(list.length);
      this.jm.pos[stationId] = 0;
    }
    const order = this.jm.order[stationId];
    let pos = this.jm.pos[stationId] || 0;
    if (pos >= order.length) {
      this.jm.order[stationId] = shuffled(list.length);
      pos = 0;
    }
    this.jm.pos[stationId] = pos + 1;
    return list[this.jm.order[stationId][pos]];
  }

  async _jmAdvance() {
    const st = this.getCurrentStation();
    if (st.mode !== 'jamendo') return;
    const token = (this._jmToken = (this._jmToken || 0) + 1);
    this.playing = true;
    this.buffering = true;
    this._emit();
    let catalog;
    try {
      catalog = await this._jmLoadCatalog();
    } catch {
      catalog = null;
    }
    if (token !== this._jmToken || this.sourceMode !== 'station' || this.getCurrentStation().id !== st.id || !this.playing) return;
    const pre = this.preItem?.stationId === st.id ? this.preItem : null;
    const preEl = pre ? this.preAudio : null;
    this.preItem = null;
    this.preAudio = null;
    const item = pre ? pre.item : catalog && this._jmPick(st.id);
    if (!item) {
      this._fallbackToOffline('Каталог Jamendo недоступен — включён офлайн-бит');
      return;
    }
    if (this.jm.current) this.jm.history.push(this.jm.current);
    if (this.jm.history.length > 30) this.jm.history.shift();
    await this._jmPlayItem(item, st.id, preEl);
  }

  _jmPreload() {
    const st = this.getCurrentStation();
    if (st.mode !== 'jamendo' || !this.jm.catalog) return;
    const item = this._jmPick(st.id);
    if (!item) return;
    const el = this._makeAudio();
    el.preload = 'auto';
    el.src = JAMENDO_AUDIO(item.id);
    el.load();
    this.preItem = { item, stationId: st.id };
    this.preAudio = el;
  }

  _dropPreload() {
    if (this.preAudio) {
      try {
        this.preAudio.removeAttribute('src');
        this.preAudio.load();
      } catch {
        // Ignore
      }
    }
    this.preAudio = null;
    this.preItem = null;
  }

  async _jmPlayItem(item, stationId, preEl = null) {
    const fix = loadSyncFixes()[item.id];
    const beat = item.p
      ? {
          bpm: item.bpm,
          period: item.p,
          offset: fix ? fix.o : item.o,
          phrasePhase: fix ? fix.ph : item.ph || 0,
          validUntil: item.vu || 0,
        }
      : null;
    this.jm.current = { ...item, stationId, beat };
    this.audioOwner = 'jamendo';
    this._setFade(0);
    if (preEl) {
      const old = this.audio;
      this._switchingSource = true;
      try {
        old.pause();
        old.removeAttribute('src');
        old.load();
      } finally {
        this._switchingSource = false;
      }
      this.audio = preEl;
      this.audio.preload = 'none';
    }
    await this._playAudioUrl(JAMENDO_AUDIO(item.id), false, true, Boolean(preEl));
  }

  _jmOnError() {
    // A failed track reports through both the error event and the play() rejection.
    this.jm.errors += 1;
    if (this.jm.errors >= 5) {
      this.jm.errors = 0;
      this._fallbackToOffline('Jamendo недоступен — включён офлайн-бит');
      return;
    }
    this._jmAdvance();
  }

  async _jmPrev() {
    if (this.audio.currentTime > 6 || !this.jm.history.length) {
      this.audio.currentTime = 0;
      if (this.audio.paused) await this.play();
      return;
    }
    const prev = this.jm.history.pop();
    this.jm.current = null;
    await this._jmPlayItem(prev, prev.stationId);
  }

  _setFade(value) {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.fadeMultiplier = value;
    this._applyEffectiveVolume();
  }

  _fadeIn() {
    this._setFade(0);
    const t0 = performance.now();
    this.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / FADE_IN_MS);
      this.fadeMultiplier = k * k;
      this._applyEffectiveVolume();
      if (k >= 1) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, 50);
  }

  _fallbackToOffline(message) {
    this.errorText = message;
    this.stationId = 'offline_power';
    this.audioOwner = null;
    this._stopAudioElement();
    this._setFade(1);
    this._startSynth(124, 'power');
    this.playing = true;
    this.buffering = false;
    this._updateMediaSessionMetadata();
    this._emit();
  }

  async _playAudioUrl(url, isLiveStream, fadeIn = false, preloaded = false) {
    this._switchingSource = true;
    this._clearStallTimer();
    try {
      if (!preloaded) {
        this.audio.pause();
        this.audio.src = url;
        this.audio.load();
      }
    } finally {
      this._switchingSource = false;
    }
    this._applyEffectiveVolume();

    this.playing = true;
    this.buffering = true;
    this._updateMediaSessionMetadata();
    this._emit();

    if (isLiveStream) {
      this.stallTimer = setTimeout(() => {
        if (this.buffering && this.playing) {
          this._handleStreamError();
        }
      }, 6500);
    }

    try {
      await this.audio.play();
      if (fadeIn) this._fadeIn();
      if (this.audioOwner === 'jamendo') this.jm.errors = 0;
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (this.audioOwner === 'jamendo') {
        if (err?.name === 'NotAllowedError') {
          this.playing = false;
          this.buffering = false;
          this._emit();
          return;
        }
        this._jmOnError();
        return;
      }
      if (isLiveStream) {
        this._handleStreamError();
      } else {
        this.playing = false;
        this.buffering = false;
        this.errorText = 'Не удалось воспроизвести аудиофайл';
        this._emit();
      }
    }
  }

  _handleStreamError() {
    this._clearStallTimer();
    const st = this.getCurrentStation();
    if (st.mode === 'stream' && this.urlAttemptIdx + 1 < st.urls.length) {
      this.urlAttemptIdx += 1;
      this._playAudioUrl(st.urls[this.urlAttemptIdx], true);
      return;
    }
    // Fallback cleanly to built-in offline workout beat if user has no internet / stream blocked
    this._fallbackToOffline('Поток недоступен — включён офлайн-бит');
  }

  _clearStallTimer() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  _stopAudioElement() {
    this._clearStallTimer();
    this._switchingSource = true;
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch {
      // Ignore
    } finally {
      this._switchingSource = false;
    }
  }

  pause() {
    this._clearStallTimer();
    this._stopSynth();
    this._jmToken = (this._jmToken || 0) + 1;
    this._switchingSource = true;
    try {
      this.audio.pause();
    } finally {
      this._switchingSource = false;
    }
    this.playing = false;
    this.buffering = false;
    this._updateMediaSessionState();
    this._emit();
  }

  async next() {
    if (this.sourceMode === 'local' && this.localTracks.length > 0) {
      this.localIndex = (this.localIndex + 1) % this.localTracks.length;
      await this.play();
      return;
    }
    if (this.getCurrentStation().mode === 'jamendo') {
      this.playing = true;
      await this._jmAdvance();
      return;
    }
    await this._stepRadio(1);
  }

  async prev() {
    if (this.sourceMode === 'local' && this.localTracks.length > 0) {
      this.localIndex = (this.localIndex - 1 + this.localTracks.length) % this.localTracks.length;
      await this.play();
      return;
    }
    if (this.getCurrentStation().mode === 'jamendo') {
      this.playing = true;
      await this._jmPrev();
      return;
    }
    await this._stepRadio(-1);
  }

  async _stepRadio(dir) {
    const radio = WORKOUT_STATIONS.filter((s) => s.group !== 'blocks');
    const idx = Math.max(0, radio.findIndex((s) => s.id === this.stationId));
    const target = radio[(idx + dir + radio.length) % radio.length];
    await this.selectStation(target.id);
  }

  /* ------------------- Web Audio Procedural Workout Groove ------------------- */
  _startSynth(bpm, style) {
    this._stopSynth();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.synthCtx) {
      this.synthCtx = new Ctx();
      this.synthMaster = this.synthCtx.createGain();
      this.synthMaster.connect(this.synthCtx.destination);
    }
    if (this.synthCtx.state === 'suspended') {
      this.synthCtx.resume();
    }
    this._applyEffectiveVolume();

    this.synthStep = 0;
    const stepMs = (60 / bpm / 4) * 1000; // 16th-note grid

    const tick = () => {
      if (!this.synthCtx) return;
      const now = this.synthCtx.currentTime;
      const s = this.synthStep % 16;

      if (style === 'power') {
        // 4-on-the-floor punchy workout kick + offbeat hi-hat + driving bass
        if (s % 4 === 0) this._triggerKick(now, 138, 44, 0.95);
        if (s === 4 || s === 12) this._triggerSnare(now, 0.34);
        if (s % 2 === 1) this._triggerHat(now, s % 4 === 2 ? 0.22 : 0.14);
        const bassNotes = [55, 55, 65.41, 55, 73.42, 65.41, 49, 49];
        if (s % 2 === 0) this._triggerBass(now, bassNotes[(s / 2) % bassNotes.length], 0.22, 0.18);
      } else {
        // Calm warm pulse for posture / mobility
        if (s === 0 || s === 6 || s === 10) this._triggerKick(now, 98, 38, 0.65);
        if (s === 4 || s === 12) this._triggerHat(now, 0.12);
        const calmNotes = [110, 130.81, 146.83, 164.81];
        if (s % 4 === 0) this._triggerBass(now, calmNotes[(this.synthStep >> 4) % calmNotes.length], 0.55, 0.14);
      }

      this.synthStep += 1;
    };

    tick();
    this.synthStepTimer = setInterval(tick, stepMs);
  }

  _stopSynth() {
    if (this.synthStepTimer) {
      clearInterval(this.synthStepTimer);
      this.synthStepTimer = null;
    }
  }

  _triggerKick(time, startFreq, endFreq, level) {
    const ctx = this.synthCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.11);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain);
    gain.connect(this.synthMaster);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  _triggerSnare(time, level) {
    const ctx = this.synthCtx;
    const bufSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthMaster);
    noise.start(time);
  }

  _triggerHat(time, level) {
    const ctx = this.synthCtx;
    const bufSize = Math.floor(ctx.sampleRate * 0.045);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.22));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthMaster);
    noise.start(time);
  }

  _triggerBass(time, freq, dur, level) {
    const ctx = this.synthCtx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, time);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synthMaster);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  /* ------------------- MediaSession Lock Screen ------------------- */
  _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    } catch {
      // Ignore unsupported handlers
    }
  }

  _updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const st = this.getState();
    const jmTrack = st.credit ? this.jm.current : null;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: st.title,
        artist: jmTrack ? jmTrack.a : 'ТелоСкоп • Музыка для тренировки',
        album: jmTrack ? `ТелоСкоп • ${this.getCurrentStation().name}` : st.subtitle,
        ...(jmTrack?.i ? { artwork: [{ src: jmTrack.i, sizes: '300x300', type: 'image/jpeg' }] } : {}),
      });
    } catch {
      // Ignore
    }
  }

  _updateMediaSessionState() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = this.playing ? 'playing' : 'paused';
    } catch {
      // Ignore
    }
  }
}
