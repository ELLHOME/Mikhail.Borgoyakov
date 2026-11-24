/**
 * Photorealistic Studio Human Exercise Animation Player (60 FPS Canvas)
 * Plays 8-frame WebP studio filmstrips of a real athletic person with smooth
 * cross-fade interpolation, play/pause, 0.5x/1x/1.5x speed control, live phase
 * cues, progress bar, and an optional frosted-glass anatomical muscle map inset.
 */

const FRAME_SIZE = 448;
const FRAME_COUNT = 8;
const spriteCache = new Map();

function loadSprite(animId) {
  const key = animId || 'squat';
  if (spriteCache.has(key)) return spriteCache.get(key);

  const entry = {
    img: new Image(),
    ready: false,
    failed: false,
    frames: FRAME_COUNT,
    frameSize: FRAME_SIZE,
  };
  entry.img.decoding = 'async';
  entry.img.onload = () => {
    entry.ready = true;
    const h = entry.img.naturalHeight || FRAME_SIZE;
    entry.frameSize = h;
    entry.frames = Math.max(1, Math.round((entry.img.naturalWidth || h * 8) / h));
  };
  entry.img.onerror = () => {
    entry.failed = true;
  };
  entry.img.src = new URL(`../assets/exercises/${key}.webp`, import.meta.url).href;
  spriteCache.set(key, entry);
  return entry;
}

export function preloadExerciseSprites(animIds = []) {
  for (const id of animIds) loadSprite(id);
}

const PHASE_PRESETS = {
  timed: ['Контроль позы', 'Дыхание и кор', 'Стабилизация', 'Удержание'],
  push: ['Исходная', 'Опускание', 'Нижняя точка', 'Жим вверх'],
  pull: ['Исходная', 'Тяга', 'Пик сокращения', 'Плавный возврат'],
  curl: ['Исходная', 'Подъём на бицепс', 'Пик сокращения', 'Плавное опускание'],
  tricep: ['Исходная', 'Растяжение', 'Нижняя точка', 'Разгибание трицепса'],
  squat: ['Исходная', 'Присед', 'Нижняя точка', 'Подъём'],
  stretch: ['Исходная', 'Вход в растяжку', 'Глубокий стрейч', 'Возврат'],
};

function getPhaseLabel(exercise, phase) {
  let set = PHASE_PRESETS.squat;
  if (exercise?.isTimed) set = PHASE_PRESETS.timed;
  else if (exercise?.category === 'arms') {
    set = exercise?.muscles?.includes('biceps') ? PHASE_PRESETS.curl : PHASE_PRESETS.tricep;
  } else if (['back', 'posture'].includes(exercise?.category)) set = PHASE_PRESETS.pull;
  else if (['chest', 'shoulders'].includes(exercise?.category)) set = PHASE_PRESETS.push;
  if (exercise?.animId === 'hip_flexor_stretch') set = PHASE_PRESETS.stretch;

  const p = ((phase % 1) + 1) % 1;
  if (p < 0.14) return set[0];
  if (p < 0.44) return set[1];
  if (p < 0.62) return set[2];
  return set[3];
}

/**
 * Draw one square source frame cleanly filling destination canvas without distorting aspect ratio.
 * Uses subtle dark studio background + full-height contain/smart-crop so head and feet never clip.
 */
function drawStudioFrame(ctx, img, frameIdx, frameSize, destW, destH, alpha = 1) {
  const sx = frameIdx * frameSize;
  const aspect = destW / destH;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (aspect >= 1.12) {
    // Wide card/stage: soft dark studio ambient flanks + crisp centered athlete (head-to-toe intact)
    const coverScale = destW / frameSize;
    const coverH = frameSize * coverScale;
    const coverY = (destH - coverH) * 0.42;
    ctx.save();
    ctx.globalAlpha = alpha * 0.32;
    ctx.filter = 'blur(20px) brightness(0.52)';
    ctx.drawImage(img, sx, 0, frameSize, frameSize, 0, coverY, destW, coverH);
    ctx.restore();

    // Main crisp athlete centered (full head-to-feet visible)
    const fitH = destH;
    const fitW = fitH;
    const fitX = (destW - fitW) * 0.5;
    ctx.drawImage(img, sx, 0, frameSize, frameSize, fitX, 0, fitW, fitH);

    // Cinema side spotlight vignette that softly melts square frame into obsidian flanks
    const gradL = ctx.createLinearGradient(0, 0, fitX + 34, 0);
    gradL.addColorStop(0, 'rgba(10,15,24,0.88)');
    gradL.addColorStop(Math.max(0.05, Math.min(0.85, fitX / Math.max(1, fitX + 34))), 'rgba(10,15,24,0.48)');
    gradL.addColorStop(1, 'rgba(10,15,24,0)');
    ctx.fillStyle = gradL;
    ctx.fillRect(0, 0, fitX + 36, destH);

    const rightStart = Math.max(0, fitX + fitW - 34);
    const rightSpan = Math.max(1, destW - rightStart);
    const seamStop = Math.max(0.15, Math.min(0.95, 34 / rightSpan));
    const gradR = ctx.createLinearGradient(rightStart, 0, destW, 0);
    gradR.addColorStop(0, 'rgba(10,15,24,0)');
    gradR.addColorStop(seamStop, 'rgba(10,15,24,0.48)');
    gradR.addColorStop(1, 'rgba(10,15,24,0.88)');
    ctx.fillStyle = gradR;
    ctx.fillRect(rightStart, 0, rightSpan, destH);
  } else {
    // Square or 4:3 modal/player: smart cover showing full studio frame
    const scale = Math.min(destW / frameSize, destH / frameSize);
    const drawW = frameSize * scale;
    const drawH = frameSize * scale;
    const dx = (destW - drawW) * 0.5;
    const dy = (destH - drawH) * 0.5;
    ctx.drawImage(img, sx, 0, frameSize, frameSize, dx, dy, drawW, drawH);
  }
  ctx.restore();
}

/**
 * Draw a clean, compact frosted-glass anatomical muscle map inset in top-right corner
 * highlighting active muscle groups without cluttering the real human photo.
 */
function drawMuscleMapInset(ctx, destW, muscles, pulse) {
  if (!muscles || !muscles.length || destW < 220) return;

  const boxW = 50;
  const boxH = 82;
  const x = destW - boxW - 10;
  const y = 10;

  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 18, 0.72)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  const cx = x + boxW * 0.5;
  const baseFill = 'rgba(148, 163, 184, 0.34)';
  const hotAlpha = 0.65 + pulse * 0.35;
  const hotFill = `rgba(34, 211, 167, ${hotAlpha.toFixed(2)})`;
  const has = (...keys) => keys.some((k) => muscles.includes(k));

  // Head
  ctx.fillStyle = baseFill;
  ctx.beginPath();
  ctx.arc(cx, y + 14, 5.2, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = has('neck') ? hotFill : baseFill;
  ctx.fillRect(cx - 2.2, y + 19, 4.4, 4);

  // Shoulders
  ctx.fillStyle = has('shoulders', 'rear_delts') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 14, y + 22, 28, 7, 3.5);
  ctx.fill();

  // Chest / Upper back
  ctx.fillStyle = has('chest', 'upper_back', 'lats') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 10, y + 24, 20, 12, 3);
  ctx.fill();

  // Core / Lower back / Obliques
  ctx.fillStyle = has('core', 'obliques', 'lower_back') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 8, y + 36, 16, 11, 2.5);
  ctx.fill();

  // Arms
  ctx.fillStyle = has('biceps', 'triceps') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 15.5, y + 28, 4.2, 19, 2);
  ctx.roundRect(cx + 11.3, y + 28, 4.2, 19, 2);
  ctx.fill();

  // Glutes / Hips
  ctx.fillStyle = has('glutes', 'hip_flexors') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 9.5, y + 47, 19, 7, 3);
  ctx.fill();

  // Thighs
  ctx.fillStyle = has('quads', 'hamstrings') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 9, y + 54, 7.2, 13, 3);
  ctx.roundRect(cx + 1.8, y + 54, 7.2, 13, 3);
  ctx.fill();

  // Calves
  ctx.fillStyle = has('calves') ? hotFill : baseFill;
  ctx.beginPath();
  ctx.roundRect(cx - 8, y + 67.5, 5.6, 10, 2.5);
  ctx.roundRect(cx + 2.4, y + 67.5, 5.6, 10, 2.5);
  ctx.fill();

  ctx.restore();
}

export function renderExerciseFrame(canvas, exercise, phase, options = {}) {
  const { showMuscles = true, showPhaseBadge = false } = options;
  const rect = canvas.getBoundingClientRect();
  const displayW = Math.max(180, Math.round(rect.width || canvas.width || 360));
  const displayH = Math.max(140, Math.round(rect.height || canvas.height || 240));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const targetW = Math.round(displayW * dpr);
  const targetH = Math.round(displayH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Deep studio canvas backdrop
  ctx.fillStyle = '#0a0f18';
  ctx.fillRect(0, 0, displayW, displayH);

  const sprite = loadSprite(exercise?.animId);
  const label = getPhaseLabel(exercise, phase);
  const p = ((phase % 1) + 1) % 1;

  if (sprite.ready) {
    const floatIdx = p * sprite.frames;
    const idxA = Math.floor(floatIdx) % sprite.frames;
    const idxB = (idxA + 1) % sprite.frames;
    const blend = floatIdx - Math.floor(floatIdx);

    // Hold each crisp studio frame cleanly (no double-exposure ghosting), micro-blend only at frame seam
    drawStudioFrame(ctx, sprite.img, idxA, sprite.frameSize, displayW, displayH, 1);
    if (blend > 0.82) {
      const t = (blend - 0.82) / 0.18;
      const smooth = t * t * (3 - 2 * t);
      drawStudioFrame(ctx, sprite.img, idxB, sprite.frameSize, displayW, displayH, smooth * 0.48);
    }

    // Subtle bottom cinema gradient for crisp overlay legibility
    const bottomGrad = ctx.createLinearGradient(0, displayH - 46, 0, displayH);
    bottomGrad.addColorStop(0, 'rgba(7, 11, 18, 0)');
    bottomGrad.addColorStop(1, 'rgba(7, 11, 18, 0.72)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, displayH - 46, displayW, 46);
  } else {
    // Sleek shimmer placeholder while sprite decodes (~20ms)
    const grad = ctx.createLinearGradient(0, 0, displayW, displayH);
    grad.addColorStop(0, '#0f1726');
    grad.addColorStop(0.5, '#172338');
    grad.addColorStop(1, '#0f1726');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, displayW, displayH);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sprite.failed ? 'Анимация недоступна' : 'Загрузка студийного видео...', displayW * 0.5, displayH * 0.5);
  }

  // Optional anatomical muscle radar inset
  if (showMuscles) {
    const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
    drawMuscleMapInset(ctx, displayW, exercise?.muscles, pulse);
  }

  // Optional phase pill
  if (showPhaseBadge && label) {
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(7, 11, 18, 0.78)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(10, 10, tw + 16, 23, 999);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 18, 22);
    ctx.restore();
  }

  // Subtle bottom loop progress hairline
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(0, displayH - 3, displayW, 3);
  ctx.fillStyle = '#22d3a7';
  ctx.fillRect(0, displayH - 3, displayW * p, 3);

  return { label, p };
}

/**
 * Controller managing 60-FPS playback of photorealistic studio exercise sprites.
 */
export class ExerciseAnimationPlayer {
  constructor(canvas, exercise, options = {}) {
    this.canvas = canvas;
    this.exercise = exercise;
    this.speed = options.speed ?? 1;
    this.showMuscles = options.showMuscles ?? true;
    this.showPhaseBadge = options.showPhaseBadge ?? false;
    this.onFrame = options.onFrame || null;
    this.playing = true;
    this.visible = true;
    this.phase = 0;
    this._lastTime = null;
    this._raf = null;
    this._observer = null;

    loadSprite(exercise?.animId);

    if (typeof IntersectionObserver !== 'undefined' && options.autoPauseOffscreen !== false) {
      this._observer = new IntersectionObserver(
        (entries) => {
          this.visible = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0.05 }
      );
      this._observer.observe(canvas);
    }

    this._tick = this._tick.bind(this);
    this.start();
  }

  setExercise(exercise) {
    this.exercise = exercise;
    this.phase = 0;
    loadSprite(exercise?.animId);
    this.renderNow();
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setShowMuscles(flag) {
    this.showMuscles = flag;
    this.renderNow();
  }

  setPlaying(flag) {
    this.playing = flag;
    this._lastTime = null;
    if (flag && !this._raf) this.start();
    else this.renderNow();
  }

  toggle() {
    this.setPlaying(!this.playing);
    return this.playing;
  }

  renderNow() {
    const frame = renderExerciseFrame(this.canvas, this.exercise, this.phase, {
      showMuscles: this.showMuscles,
      showPhaseBadge: this.showPhaseBadge,
    });
    if (this.onFrame) this.onFrame(frame, this.phase);
  }

  start() {
    if (this._raf) return;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    this._raf = requestAnimationFrame(this._tick);
    if (!this.visible) {
      this._lastTime = now;
      return;
    }
    const dt = Math.min(0.1, (now - (this._lastTime || now)) / 1000);
    this._lastTime = now;

    if (this.playing) {
      const cycleDurationSec = this.exercise?.isTimed ? 1.8 : 1.75;
      this.phase = (this.phase + (dt * this.speed) / cycleDurationSec) % 1;
    }
    this.renderNow();
  }

  destroy() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }
}
