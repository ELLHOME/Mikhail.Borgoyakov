/**
 * Live heart rate from smart watches and chest straps over Web Bluetooth.
 * Uses the standard GATT Heart Rate Service (0x180D), which watches expose in
 * their "heart rate broadcast" mode (Xiaomi, Amazfit, Huawei, Garmin, Polar...).
 */

export const HR_ZONES = [
  { id: 1, name: 'Восстановление', from: 0.5, color: '#8a9bb3' },
  { id: 2, name: 'Жиросжигание', from: 0.6, color: '#38bdf8' },
  { id: 3, name: 'Аэробная', from: 0.7, color: '#34d399' },
  { id: 4, name: 'Анаэробная', from: 0.8, color: '#fbbf24' },
  { id: 5, name: 'Максимум', from: 0.9, color: '#f87171' },
];

const MAX_RECONNECT_TRIES = 6;
const STALE_MS = 6000;
// Gaps longer than this (watch dropped out) are not credited to any zone.
const MAX_SAMPLE_GAP_SEC = 5;

export function isHeartRateSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth) && window.isSecureContext !== false;
}

/** Tanaka formula, the same one the cardio target uses. */
export function hrMaxForAge(age) {
  const a = Math.min(85, Math.max(14, Number(age) || 28));
  return Math.round(208 - 0.7 * a);
}

/** 0 below zone 1, otherwise 1..5. */
export function zoneForHr(bpm, hrMax) {
  if (!bpm || !hrMax) return 0;
  const frac = bpm / hrMax;
  let zone = 0;
  HR_ZONES.forEach((z, i) => {
    if (frac >= z.from) zone = i + 1;
  });
  return zone;
}

/** Recovery target for rest between sets. */
export function recoveryHr(hrMax) {
  return Math.round(hrMax * 0.65);
}

/** Keytel et al. (2005) energy expenditure from heart rate, kcal per minute. */
export function kcalPerMinute(bpm, profile = {}) {
  const w = Number(profile.weightKg) || 75;
  const a = Number(profile.age) || 28;
  const kj = profile.sex === 'female'
    ? -20.4022 + 0.4472 * bpm - 0.1263 * w + 0.074 * a
    : -55.0969 + 0.6309 * bpm + 0.1988 * w + 0.2017 * a;
  return Math.max(0, kj / 4.184);
}

/** Heart Rate Measurement characteristic (0x2A37). */
export function parseHeartRateMeasurement(view) {
  const flags = view.getUint8(0);
  const wide = flags & 0x01;
  let offset = 1;
  const bpm = wide ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += wide ? 2 : 1;
  const contactSupported = Boolean(flags & 0x04);
  const contact = contactSupported ? Boolean(flags & 0x02) : null;
  if (flags & 0x08) offset += 2;
  const rr = [];
  if (flags & 0x10) {
    for (; offset + 1 < view.byteLength; offset += 2) rr.push(view.getUint16(offset, true) / 1024);
  }
  return { bpm, contact, rr };
}

export class HeartRateMonitor {
  constructor({ onChange } = {}) {
    this.onChange = onChange || (() => {});
    this.device = null;
    this.characteristic = null;
    this.status = 'idle'; // idle | connecting | connected | reconnecting | error
    this.error = '';
    this.bpm = 0;
    this.contact = null;
    this.lastAt = 0;
    this.battery = null;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.reconnectTries = 0;
    this.listeners = new Set();
    this.handleValue = this.handleValue.bind(this);
    this.handleDisconnected = this.handleDisconnected.bind(this);
  }

  getState() {
    const fresh = this.status === 'connected' && this.bpm > 0 && Date.now() - this.lastAt < STALE_MS;
    return {
      supported: isHeartRateSupported(),
      status: this.status,
      error: this.error,
      deviceName: this.device?.name || '',
      bpm: fresh ? this.bpm : 0,
      contact: this.contact,
      battery: this.battery,
      waiting: this.status === 'connected' && !fresh,
    };
  }

  /** Registers a per-sample listener; returns an unsubscribe function. */
  onSample(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.onChange(this.getState());
  }

  /** Must be called from a user gesture: it opens the browser's device chooser. */
  async connect({ showAll = false } = {}) {
    if (!isHeartRateSupported()) {
      this.status = 'error';
      this.error = 'unsupported';
      this.emit();
      return false;
    }
    let device;
    try {
      device = await navigator.bluetooth.requestDevice(
        showAll
          ? { acceptAllDevices: true, optionalServices: ['heart_rate', 'battery_service'] }
          : { filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] }
      );
    } catch (err) {
      // The user closed the chooser: keep the previous state.
      if (err?.name === 'NotFoundError' || err?.name === 'AbortError') {
        this.emit();
        return false;
      }
      this.status = 'error';
      this.error = err?.message || String(err);
      this.emit();
      return false;
    }
    if (this.device && this.device !== device) this.disconnect();
    this.device = device;
    this.manualDisconnect = false;
    this.reconnectTries = 0;
    device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    this.status = 'connecting';
    this.error = '';
    this.emit();
    return this.openGatt();
  }

  async openGatt() {
    const device = this.device;
    if (!device) return false;
    try {
      const server = await device.gatt.connect();
      let service;
      try {
        service = await server.getPrimaryService('heart_rate');
      } catch {
        throw Object.assign(new Error('no-hr-service'), { fatal: true });
      }
      const ch = await service.getCharacteristic('heart_rate_measurement');
      if (this.characteristic && this.characteristic !== ch) {
        this.characteristic.removeEventListener('characteristicvaluechanged', this.handleValue);
      }
      this.characteristic = ch;
      ch.addEventListener('characteristicvaluechanged', this.handleValue);
      await ch.startNotifications();
      if (this.device !== device) return false;
      this.status = 'connected';
      this.error = '';
      this.reconnectTries = 0;
      this.emit();
      this.readBattery(server);
      return true;
    } catch (err) {
      if (this.device !== device || this.manualDisconnect) return false;
      if (err?.fatal) {
        this.status = 'error';
        this.error = 'no-hr-service';
        try { device.gatt.disconnect(); } catch { /* already closed */ }
        this.emit();
        return false;
      }
      this.scheduleReconnect(err);
      return false;
    }
  }

  async readBattery(server) {
    try {
      const svc = await server.getPrimaryService('battery_service');
      const ch = await svc.getCharacteristic('battery_level');
      const v = await ch.readValue();
      this.battery = v.getUint8(0);
      this.emit();
    } catch {
      // Battery level is optional; many watches do not expose it.
    }
  }

  handleValue(event) {
    const view = event.target?.value;
    if (!view || view.byteLength < 2) return;
    const m = parseHeartRateMeasurement(view);
    this.contact = m.contact;
    // Watches send 0 while they search for a pulse or are off the wrist.
    if (!m.bpm || m.bpm < 25 || m.bpm > 240 || m.contact === false) {
      this.emit();
      return;
    }
    this.bpm = m.bpm;
    this.lastAt = Date.now();
    this.listeners.forEach((fn) => fn(m.bpm, this.lastAt));
    this.emit();
  }

  handleDisconnected() {
    // A drop during openGatt() is retried by its own catch block.
    if (this.manualDisconnect || !this.device || this.status !== 'connected') return;
    this.scheduleReconnect();
  }

  scheduleReconnect(err) {
    clearTimeout(this.reconnectTimer);
    if (this.reconnectTries >= MAX_RECONNECT_TRIES) {
      this.status = 'error';
      this.error = err?.message || 'lost';
      this.emit();
      return;
    }
    this.reconnectTries += 1;
    this.status = 'reconnecting';
    this.emit();
    const delay = Math.min(15000, 1000 * 2 ** (this.reconnectTries - 1));
    this.reconnectTimer = setTimeout(() => this.openGatt(), delay);
  }

  /** Retry after the automatic attempts gave up, without the chooser. */
  retry() {
    if (!this.device) return false;
    this.manualDisconnect = false;
    this.reconnectTries = 0;
    this.status = 'connecting';
    this.error = '';
    this.emit();
    this.openGatt();
    return true;
  }

  disconnect() {
    this.manualDisconnect = true;
    clearTimeout(this.reconnectTimer);
    if (this.characteristic) {
      this.characteristic.removeEventListener('characteristicvaluechanged', this.handleValue);
      this.characteristic.stopNotifications?.().catch(() => {});
      this.characteristic = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      try {
        if (this.device.gatt.connected) this.device.gatt.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.device = null;
    this.status = 'idle';
    this.error = '';
    this.bpm = 0;
    this.battery = null;
    this.emit();
  }
}

/** Accumulates heart rate over one workout. */
export class HeartRateSession {
  constructor() {
    this.startedAt = Date.now();
    this.count = 0;
    this.sum = 0;
    this.max = 0;
    this.min = 0;
    this.prev = null; // { bpm, t }
    this.zoneSec = [0, 0, 0, 0, 0, 0];
    this.kcal = 0;
    this.coveredSec = 0;
  }

  add(bpm, t, hrMax, profile) {
    if (this.prev) {
      const dt = (t - this.prev.t) / 1000;
      if (dt > 0 && dt <= MAX_SAMPLE_GAP_SEC) {
        this.zoneSec[zoneForHr(this.prev.bpm, hrMax)] += dt;
        this.kcal += (kcalPerMinute(this.prev.bpm, profile) * dt) / 60;
        this.coveredSec += dt;
      }
    }
    this.prev = { bpm, t };
    this.count += 1;
    this.sum += bpm;
    this.max = Math.max(this.max, bpm);
    this.min = this.min ? Math.min(this.min, bpm) : bpm;
  }

  summary(durationSec) {
    if (this.count < 5 || this.coveredSec < 30) return null;
    const coverage = durationSec > 0 ? Math.min(1, this.coveredSec / durationSec) : 0;
    return {
      avg: Math.round(this.sum / this.count),
      max: this.max,
      min: this.min,
      zonesSec: this.zoneSec.map((s) => Math.round(s)),
      kcal: Math.round(this.kcal),
      coverage: Math.round(coverage * 100) / 100,
    };
  }
}
