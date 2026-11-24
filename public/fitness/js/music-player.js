/**
 * BodyCoach Workout Music Engine
 * Supports:
 * 1) Live HTTPS fitness radio streams (with automatic backup URL failover)
 * 2) Zero-network Web Audio API procedural workout beat synthesizer (124 / 92 BPM)
 * 3) Local device audio playlist (MP3 / M4A / WAV / OGG — 100% on-device)
 * 4) Automatic volume ducking during workout timer beeps + MediaSession lock-screen controls
 */

const STORAGE_KEY = 'bodycoach_music_v1';

export const WORKOUT_STATIONS = [
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

function loadSavedPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stationId: 'workout', volume: 0.65 };
    const parsed = JSON.parse(raw);
    return {
      stationId: WORKOUT_STATIONS.some((s) => s.id === parsed.stationId) ? parsed.stationId : 'workout',
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0.05, parsed.volume)) : 0.65,
    };
  } catch {
    return { stationId: 'workout', volume: 0.65 };
  }
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

    // HTML5 Audio element for streams & local files
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.playsInline = true;
    this._bindAudioEvents();

    // Web Audio procedural beat state
    this.synthCtx = null;
    this.synthMaster = null;
    this.synthStepTimer = null;
    this.synthStep = 0;

    this._setupMediaSession();
  }

  _bindAudioEvents() {
    this.audio.addEventListener('playing', () => {
      this._clearStallTimer();
      this.buffering = false;
      this.playing = true;
      this.errorText = '';
      this._updateMediaSessionState();
      this._emit();
    });

    this.audio.addEventListener('waiting', () => {
      if (this.playing) {
        this.buffering = true;
        this._emit();
      }
    });

    this.audio.addEventListener('pause', () => {
      // Ignore transient pause during source switching
      if (this._switchingSource) return;
      if (this._getActiveEngine() === 'audio') {
        this.playing = false;
        this.buffering = false;
        this._updateMediaSessionState();
        this._emit();
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.sourceMode === 'local' && this.localTracks.length > 0) {
        this.next();
      }
    });

    this.audio.addEventListener('error', () => {
      if (this._switchingSource || !this.playing) return;
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

    return {
      playing: this.playing,
      buffering: this.buffering,
      volume: this.volume,
      sourceMode: isLocal ? 'local' : 'station',
      stationId: this.stationId,
      title: isLocal ? currentLocal.name : st.name,
      subtitle: isLocal
        ? `Своя музыка • Трек ${this.localIndex + 1} из ${this.localTracks.length}`
        : st.desc,
      localCount: this.localTracks.length,
      errorText: this.errorText,
    };
  }

  _emit() {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.getState());
    }
  }

  _applyEffectiveVolume() {
    const eff = Math.max(0, Math.min(1, this.volume * this.duckMultiplier));
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
      await this._playAudioUrl(track.url, false);
      return;
    }

    const st = this.getCurrentStation();
    if (st.mode === 'synth') {
      this._stopAudioElement();
      this._startSynth(st.bpm || 124, st.style || 'power');
      this.playing = true;
      this.buffering = false;
      this._updateMediaSessionMetadata();
      this._updateMediaSessionState();
      this._emit();
      return;
    }

    this._stopSynth();
    const url = st.urls[this.urlAttemptIdx] || st.urls[0];
    await this._playAudioUrl(url, true);
  }

  async _playAudioUrl(url, isLiveStream) {
    this._switchingSource = true;
    this._clearStallTimer();
    try {
      this.audio.pause();
      this.audio.src = url;
      this.audio.load();
    } finally {
      this._switchingSource = false;
    }

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
    } catch (err) {
      if (err?.name === 'AbortError') return;
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
    this.errorText = 'Поток недоступен — включён офлайн-бит';
    this.stationId = 'offline_power';
    this._stopAudioElement();
    this._startSynth(124, 'power');
    this.playing = true;
    this.buffering = false;
    this._updateMediaSessionMetadata();
    this._emit();
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
    const idx = WORKOUT_STATIONS.findIndex((s) => s.id === this.stationId);
    const nextSt = WORKOUT_STATIONS[(idx + 1) % WORKOUT_STATIONS.length];
    await this.selectStation(nextSt.id);
  }

  async prev() {
    if (this.sourceMode === 'local' && this.localTracks.length > 0) {
      this.localIndex = (this.localIndex - 1 + this.localTracks.length) % this.localTracks.length;
      await this.play();
      return;
    }
    const idx = WORKOUT_STATIONS.findIndex((s) => s.id === this.stationId);
    const prevSt = WORKOUT_STATIONS[(idx - 1 + WORKOUT_STATIONS.length) % WORKOUT_STATIONS.length];
    await this.selectStation(prevSt.id);
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
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: st.title,
        artist: 'BodyCoach • Музыка для тренировки',
        album: st.subtitle,
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
