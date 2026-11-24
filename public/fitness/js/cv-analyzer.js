/**
 * Hybrid On-Device Computer Vision Engine for BodyCoach:
 * - Tier 1: MediaPipe Pose Landmarker (dynamically loaded when online) + pixel contour waist/hip scan
 * - Tier 2: Built-in zero-dependency Canvas foreground silhouette & edge contour analyzer (works 100% offline)
 * - Metric math for proportions, symmetry, forward head, thoracic rounding, pelvic alignment
 * - High-DPI visual overlay renderer & interactive drag-to-calibrate landmark editor
 */

let mediaPipeState = {
  attempted: false,
  landmarker: null,
  status: 'idle', // idle | loading | ready | unavailable
};

const MEDIAPIPE_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MEDIAPIPE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export function getCvEngineStatus() {
  return mediaPipeState.status;
}

/**
 * Attempt to initialize MediaPipe Pose Landmarker with a strict timeout.
 * Falls back cleanly to built-in offline silhouette CV if offline or blocked.
 */
export async function tryInitMediaPipe(timeoutMs = 5500) {
  if (mediaPipeState.landmarker) return mediaPipeState.landmarker;
  if (mediaPipeState.attempted && mediaPipeState.status === 'unavailable') return null;

  mediaPipeState.attempted = true;
  mediaPipeState.status = 'loading';

  const loadPromise = (async () => {
    const vision = await import(/* @vite-ignore */ MEDIAPIPE_MODULE_URL);
    const { FilesetResolver, PoseLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
    const landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_URL,
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
    });
    return landmarker;
  })();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MediaPipe timeout')), timeoutMs)
  );

  try {
    mediaPipeState.landmarker = await Promise.race([loadPromise, timeoutPromise]);
    mediaPipeState.status = 'ready';
    return mediaPipeState.landmarker;
  } catch {
    mediaPipeState.status = 'unavailable';
    return null;
  }
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = src;
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Extract foreground body silhouette mask & per-row horizontal spans using pure Canvas pixels.
 */
function extractSilhouetteProfile(img) {
  const targetW = 192;
  const scale = targetW / img.naturalWidth;
  const w = targetW;
  const h = Math.max(120, Math.min(360, Math.round(img.naturalHeight * scale)));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Sample border strips (left 10%, right 10%, top 6%) to estimate background color
  const bgR = [];
  const bgG = [];
  const bgB = [];
  const borderX = Math.max(6, Math.round(w * 0.08));
  const borderY = Math.max(4, Math.round(h * 0.05));
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < borderX; x += 2) {
      const i1 = (y * w + x) * 4;
      const i2 = (y * w + (w - 1 - x)) * 4;
      bgR.push(data[i1], data[i2]);
      bgG.push(data[i1 + 1], data[i2 + 1]);
      bgB.push(data[i1 + 2], data[i2 + 2]);
    }
  }
  for (let y = 0; y < borderY; y += 2) {
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      bgR.push(data[i]);
      bgG.push(data[i + 1]);
      bgB.push(data[i + 2]);
    }
  }

  const mR = median(bgR);
  const mG = median(bgG);
  const mB = median(bgB);

  // Background color distance spread
  const bgDists = [];
  for (let i = 0; i < bgR.length; i++) {
    const dr = bgR[i] - mR;
    const dg = bgG[i] - mG;
    const db = bgB[i] - mB;
    bgDists.push(Math.sqrt(dr * dr + dg * dg + db * db));
  }
  const bgSpread = median(bgDists);
  const distThresh = clamp(bgSpread * 2.4 + 22, 26, 78);

  // Build raw foreground mask (combining color distance from border + luminance gradient)
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    // Also estimate row-local left/right border color to handle vertical wall gradients!
    const li = (y * w + 3) * 4;
    const ri = (y * w + (w - 4)) * 4;
    const rowR = (data[li] + data[ri]) * 0.5;
    const rowG = (data[li + 1] + data[ri + 1]) * 0.5;
    const rowB = (data[li + 2] + data[ri + 2]) * 4 / 8;

    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const dGlobal = Math.hypot(r - mR, g - mG, b - mB);
      const dRow = Math.hypot(r - rowR, g - rowG, b - rowB);
      const d = Math.min(dGlobal, dRow * 1.08);
      if (d > distThresh) {
        mask[y * w + x] = 1;
      }
    }
  }

  // Simple 3x3 majority smoothing (removes isolated noise pixels)
  const smooth = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += mask[(y + dy) * w + (x + dx)];
        }
      }
      smooth[y * w + x] = sum >= 5 ? 1 : 0;
    }
  }

  // Keep largest connected component near horizontal center
  const visited = new Uint8Array(w * h);
  let bestComp = null;
  let bestScore = 0;
  const queue = new Int32Array(w * h);

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const p = y * w + x;
      if (!smooth[p] || visited[p]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = p;
      visited[p] = 1;
      const pixels = [];
      let sumX = 0;
      let minY = y;
      let maxY = y;

      while (head < tail) {
        const curr = queue[head++];
        pixels.push(curr);
        const cy = (curr / w) | 0;
        const cx = curr - cy * w;
        sumX += cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [curr - 1, curr + 1, curr - w, curr + w];
        for (let k = 0; k < 4; k++) {
          const np = neighbors[k];
          if (np >= 0 && np < w * h && smooth[np] && !visited[np]) {
            visited[np] = 1;
            queue[tail++] = np;
          }
        }
      }

      const avgX = sumX / pixels.length;
      const centerBonus = 1.25 - Math.abs(avgX / w - 0.5);
      const heightSpan = (maxY - minY) / h;
      const score = pixels.length * centerBonus * (0.4 + heightSpan);
      if (score > bestScore && pixels.length > w * h * 0.02) {
        bestScore = score;
        bestComp = pixels;
      }
    }
  }

  const bodyMask = new Uint8Array(w * h);
  if (bestComp) {
    for (let i = 0; i < bestComp.length; i++) bodyMask[bestComp[i]] = 1;
  } else {
    // Fallback to raw smoothed mask
    bodyMask.set(smooth);
  }

  // Compute row-by-row outer & inner torso runs
  const rows = [];
  let yTop = h;
  let yBottom = 0;

  for (let y = 0; y < h; y++) {
    const runs = [];
    let inRun = false;
    let start = 0;
    for (let x = 0; x < w; x++) {
      const v = bodyMask[y * w + x];
      if (v && !inRun) {
        inRun = true;
        start = x;
      } else if (!v && inRun) {
        inRun = false;
        if (x - start >= 3) runs.push([start, x - 1]);
      }
    }
    if (inRun && w - start >= 3) runs.push([start, w - 1]);

    if (runs.length) {
      if (y < yTop) yTop = y;
      if (y > yBottom) yBottom = y;
      const outerL = runs[0][0];
      const outerR = runs[runs.length - 1][1];
      // Identify central run (torso) when arms are separated from body
      const midX = (outerL + outerR) * 0.5;
      let centerRun = runs[0];
      let bestDist = Infinity;
      for (const r of runs) {
        const rMid = (r[0] + r[1]) * 0.5;
        const d = Math.abs(rMid - midX) - (r[1] - r[0]) * 0.25;
        if (d < bestDist) {
          bestDist = d;
          centerRun = r;
        }
      }
      rows[y] = {
        outerL: outerL / w,
        outerR: outerR / w,
        outerW: (outerR - outerL) / w,
        centerL: centerRun[0] / w,
        centerR: centerRun[1] / w,
        centerW: (centerRun[1] - centerRun[0]) / w,
        centerX: ((centerRun[0] + centerRun[1]) * 0.5) / w,
        runsCount: runs.length,
      };
    } else {
      rows[y] = null;
    }
  }

  const valid = yBottom - yTop > h * 0.3;
  if (!valid) {
    yTop = Math.round(h * 0.06);
    yBottom = Math.round(h * 0.93);
  }

  return { w, h, rows, yTop, yBottom, valid, bodyMask };
}

function sampleRowAtFrac(profile, frac, windowRows = 3) {
  const { rows, yTop, yBottom, h } = profile;
  const span = Math.max(10, yBottom - yTop);
  const cy = clamp(Math.round(yTop + span * frac), 0, h - 1);
  const collected = [];
  for (let y = Math.max(0, cy - windowRows); y <= Math.min(h - 1, cy + windowRows); y++) {
    if (rows[y]) collected.push(rows[y]);
  }
  if (!collected.length) return null;
  return {
    yNorm: cy / h,
    outerL: median(collected.map((r) => r.outerL)),
    outerR: median(collected.map((r) => r.outerR)),
    outerW: median(collected.map((r) => r.outerW)),
    centerL: median(collected.map((r) => r.centerL)),
    centerR: median(collected.map((r) => r.centerR)),
    centerW: median(collected.map((r) => r.centerW)),
    centerX: median(collected.map((r) => r.centerX)),
  };
}

/**
 * Find highest pixel Y where foreground reaches a given horizontal offset on left/right shoulder ridge.
 */
function findShoulderRidgeY(profile, xNorm, yStartFrac, yEndFrac) {
  const { w, h, yTop, yBottom, bodyMask } = profile;
  const span = Math.max(10, yBottom - yTop);
  const xPx = clamp(Math.round(xNorm * w), 1, w - 2);
  const yStart = clamp(Math.round(yTop + span * yStartFrac), 0, h - 1);
  const yEnd = clamp(Math.round(yTop + span * yEndFrac), 0, h - 1);
  for (let y = yStart; y <= yEnd; y++) {
    if (bodyMask[y * w + xPx] || bodyMask[y * w + xPx - 1] || bodyMask[y * w + xPx + 1]) {
      return y / h;
    }
  }
  return (yTop + span * 0.19) / h;
}

/**
 * Scan waist narrowest band in silhouette (using center run so hanging arms don't inflate waist).
 */
function scanTorsoBand(profile, startFrac, endFrac, mode = 'min', useCenter = true) {
  const { rows, yTop, yBottom, h } = profile;
  const span = Math.max(10, yBottom - yTop);
  const y1 = clamp(Math.round(yTop + span * startFrac), 0, h - 1);
  const y2 = clamp(Math.round(yTop + span * endFrac), 0, h - 1);

  let best = null;
  for (let y = y1; y <= y2; y++) {
    const r = rows[y];
    if (!r) continue;
    const width = useCenter ? r.centerW : r.outerW;
    const left = useCenter ? r.centerL : r.outerL;
    const right = useCenter ? r.centerR : r.outerR;
    if (width < 0.04) continue;
    if (!best || (mode === 'min' ? width < best.width : width > best.width)) {
      best = { yNorm: y / h, left, right, width, centerX: (left + right) * 0.5 };
    }
  }
  return best;
}

/**
 * Build landmarks for Front / Back view from silhouette (+ optional MediaPipe skeleton).
 */
function buildFrontOrBackLandmarks(profile, mpLandmarks, isBack = false) {
  const { yTop, yBottom, h } = profile;
  const span = Math.max(20, yBottom - yTop);
  const yAt = (f) => clamp((yTop + span * f) / h, 0.04, 0.96);

  const headRow = sampleRowAtFrac(profile, 0.07) || { centerX: 0.5 };
  const shBand = scanTorsoBand(profile, 0.16, 0.23, 'max', true) || {
    yNorm: yAt(0.19),
    left: 0.34,
    right: 0.66,
    centerX: 0.5,
  };
  const waistBand = scanTorsoBand(profile, 0.35, 0.45, 'min', true) || {
    yNorm: yAt(0.41),
    left: 0.39,
    right: 0.61,
    centerX: 0.5,
  };
  const hipBand = scanTorsoBand(profile, 0.47, 0.56, 'max', true) || {
    yNorm: yAt(0.52),
    left: 0.37,
    right: 0.63,
    centerX: 0.5,
  };
  const kneeRow = sampleRowAtFrac(profile, 0.74) || { centerX: 0.5, outerL: 0.41, outerR: 0.59 };
  const ankleRow = sampleRowAtFrac(profile, 0.92) || { centerX: 0.5, outerL: 0.42, outerR: 0.58 };

  const shWidth = shBand.right - shBand.left;
  const leftRidgeY = findShoulderRidgeY(profile, shBand.left + shWidth * 0.18, 0.12, 0.27);
  const rightRidgeY = findShoulderRidgeY(profile, shBand.right - shWidth * 0.18, 0.12, 0.27);
  const hipCenterY = hipBand.yNorm;

  let landmarks = {
    headTop: { x: clamp(headRow.centerX, 0.1, 0.9), y: clamp(yTop / h, 0.03, 0.25) },
    leftShoulder: { x: clamp(shBand.left, 0.08, 0.48), y: clamp(leftRidgeY + 0.014, 0.1, 0.4) },
    rightShoulder: { x: clamp(shBand.right, 0.52, 0.92), y: clamp(rightRidgeY + 0.014, 0.1, 0.4) },
    leftWaist: { x: clamp(waistBand.left, 0.12, 0.49), y: clamp(waistBand.yNorm, 0.25, 0.6) },
    rightWaist: { x: clamp(waistBand.right, 0.51, 0.88), y: clamp(waistBand.yNorm, 0.25, 0.6) },
    leftHip: { x: clamp(hipBand.left, 0.1, 0.49), y: clamp(hipCenterY, 0.35, 0.7) },
    rightHip: { x: clamp(hipBand.right, 0.51, 0.9), y: clamp(hipCenterY, 0.35, 0.7) },
    leftKnee: { x: clamp(kneeRow.outerL + 0.03, 0.15, 0.49), y: clamp(yAt(0.74), 0.55, 0.86) },
    rightKnee: { x: clamp(kneeRow.outerR - 0.03, 0.51, 0.85), y: clamp(yAt(0.74), 0.55, 0.86) },
    leftAnkle: { x: clamp(ankleRow.outerL + 0.03, 0.15, 0.49), y: clamp(yAt(0.92), 0.75, 0.96) },
    rightAnkle: { x: clamp(ankleRow.outerR - 0.03, 0.51, 0.85), y: clamp(yAt(0.92), 0.75, 0.96) },
  };

  if (isBack) {
    landmarks.spineUpper = {
      x: (landmarks.leftShoulder.x + landmarks.rightShoulder.x) * 0.5,
      y: (landmarks.leftShoulder.y + landmarks.rightShoulder.y) * 0.5 + 0.03,
    };
    landmarks.spineLower = {
      x: (landmarks.leftWaist.x + landmarks.rightWaist.x) * 0.5,
      y: (landmarks.leftHip.y + landmarks.rightHip.y) * 0.5 - 0.02,
    };
  }

  // If MediaPipe Pose returned confident joints, refine joint Y & X while keeping outer silhouette widths for waist/hips!
  if (mpLandmarks && mpLandmarks.length >= 29) {
    const lSh = mpLandmarks[11];
    const rSh = mpLandmarks[12];
    const lHip = mpLandmarks[23];
    const rHip = mpLandmarks[24];
    const lKnee = mpLandmarks[25];
    const rKnee = mpLandmarks[26];
    const lAnk = mpLandmarks[27];
    const rAnk = mpLandmarks[28];
    const nose = mpLandmarks[0];

    const avgVis = ((lSh.visibility ?? 1) + (rSh.visibility ?? 1) + (lHip.visibility ?? 1) + (rHip.visibility ?? 1)) / 4;
    if (avgVis > 0.45) {
      // Order viewer-left vs viewer-right cleanly regardless of front/back
      const [shLeft, shRight] = lSh.x < rSh.x ? [lSh, rSh] : [rSh, lSh];
      const [hpLeft, hpRight] = lHip.x < rHip.x ? [lHip, rHip] : [rHip, lHip];
      const [knLeft, knRight] = lKnee.x < rKnee.x ? [lKnee, rKnee] : [rKnee, lKnee];
      const [anLeft, anRight] = lAnk.x < rAnk.x ? [lAnk, rAnk] : [rAnk, lAnk];

      // Expand joint shoulder center to outer deltoid silhouette edge (consistent with waist & hip scans)
      const shSpan = Math.abs(shRight.x - shLeft.x);
      const shYAvg = (shLeft.y + shRight.y) * 0.5;
      const shFrac = clamp((shYAvg * h - yTop) / span, 0.12, 0.30);
      const refinedSh = scanTorsoBand(profile, Math.max(0.10, shFrac - 0.03), Math.min(0.32, shFrac + 0.04), 'max', true);
      if (refinedSh && refinedSh.width >= shSpan * 1.02 && refinedSh.width <= shSpan * 1.65) {
        landmarks.leftShoulder = { x: clamp(refinedSh.left, 0.06, 0.48), y: clamp(shLeft.y, 0.08, 0.42) };
        landmarks.rightShoulder = { x: clamp(refinedSh.right, 0.52, 0.94), y: clamp(shRight.y, 0.08, 0.42) };
      } else {
        const deltoidPad = shSpan * 0.16;
        landmarks.leftShoulder = { x: clamp(shLeft.x - deltoidPad, 0.06, 0.48), y: clamp(shLeft.y, 0.08, 0.42) };
        landmarks.rightShoulder = { x: clamp(shRight.x + deltoidPad, 0.52, 0.94), y: clamp(shRight.y, 0.08, 0.42) };
      }
      landmarks.headTop = { x: clamp(nose.x, 0.1, 0.9), y: clamp(nose.y - shSpan * 0.32, 0.03, 0.25) };

      // Scan outer hip contour at MediaPipe hip Y-level so hip & waist share the same outer-contour basis
      const hipSpan = Math.abs(hpRight.x - hpLeft.x);
      const hipY = (hpLeft.y + hpRight.y) * 0.5;
      const hipFrac = clamp((hipY * h - yTop) / span, 0.40, 0.62);
      const refinedHip = scanTorsoBand(profile, Math.max(0.38, hipFrac - 0.04), Math.min(0.64, hipFrac + 0.05), 'max', true);
      if (refinedHip && refinedHip.width >= hipSpan * 1.15 && refinedHip.width <= shSpan * 1.55) {
        landmarks.leftHip = { x: clamp(refinedHip.left, 0.08, 0.49), y: clamp(hpLeft.y, 0.32, 0.72) };
        landmarks.rightHip = { x: clamp(refinedHip.right, 0.51, 0.92), y: clamp(hpRight.y, 0.32, 0.72) };
      } else {
        const hipPad = hipSpan * 0.46;
        landmarks.leftHip = { x: clamp(hpLeft.x - hipPad, 0.08, 0.49), y: clamp(hpLeft.y, 0.32, 0.72) };
        landmarks.rightHip = { x: clamp(hpRight.x + hipPad, 0.51, 0.92), y: clamp(hpRight.y, 0.32, 0.72) };
      }

      // Re-scan waist exactly between MediaPipe shoulders and hips
      const wStartFrac = clamp(((shYAvg + (hipY - shYAvg) * 0.48) * h - yTop) / span, 0.25, 0.46);
      const wEndFrac = clamp(((shYAvg + (hipY - shYAvg) * 0.80) * h - yTop) / span, 0.34, 0.54);
      const refinedWaist = scanTorsoBand(profile, wStartFrac, wEndFrac, 'min', true);
      const outerHipW = landmarks.rightHip.x - landmarks.leftHip.x;
      const outerShW = landmarks.rightShoulder.x - landmarks.leftShoulder.x;
      if (refinedWaist && refinedWaist.width > outerHipW * 0.55 && refinedWaist.width < outerShW * 1.05) {
        landmarks.leftWaist = { x: clamp(refinedWaist.left, 0.1, 0.49), y: clamp(refinedWaist.yNorm, 0.25, 0.65) };
        landmarks.rightWaist = { x: clamp(refinedWaist.right, 0.51, 0.9), y: clamp(refinedWaist.yNorm, 0.25, 0.65) };
      } else {
        const wY = shYAvg + (hipY - shYAvg) * 0.68;
        const wHalf = Math.max(outerHipW * 0.43, outerShW * 0.36);
        const cx = (landmarks.leftHip.x + landmarks.rightHip.x) * 0.5;
        landmarks.leftWaist = { x: clamp(cx - wHalf, 0.12, 0.49), y: clamp(wY, 0.25, 0.65) };
        landmarks.rightWaist = { x: clamp(cx + wHalf, 0.51, 0.88), y: clamp(wY, 0.25, 0.65) };
      }

      if ((knLeft.visibility ?? 0) > 0.35 && (knRight.visibility ?? 0) > 0.35) {
        landmarks.leftKnee = { x: clamp(knLeft.x, 0.1, 0.49), y: clamp(knLeft.y, 0.5, 0.88) };
        landmarks.rightKnee = { x: clamp(knRight.x, 0.51, 0.9), y: clamp(knRight.y, 0.5, 0.88) };
      }
      if ((anLeft.visibility ?? 0) > 0.3 && (anRight.visibility ?? 0) > 0.3) {
        landmarks.leftAnkle = { x: clamp(anLeft.x, 0.1, 0.49), y: clamp(anLeft.y, 0.7, 0.97) };
        landmarks.rightAnkle = { x: clamp(anRight.x, 0.51, 0.9), y: clamp(anRight.y, 0.7, 0.97) };
      }
      if (isBack) {
        landmarks.spineUpper = {
          x: (landmarks.leftShoulder.x + landmarks.rightShoulder.x) * 0.5,
          y: shYAvg + 0.03,
        };
        landmarks.spineLower = {
          x: (landmarks.leftHip.x + landmarks.rightHip.x) * 0.5,
          y: hipY - 0.02,
        };
      }
    }
  }

  return landmarks;
}

/**
 * Build landmarks for Side profile view from silhouette (+ optional MediaPipe skeleton).
 */
function buildSideLandmarks(profile, mpLandmarks) {
  const { yTop, yBottom, h } = profile;
  const span = Math.max(20, yBottom - yTop);
  const yAt = (f) => clamp((yTop + span * f) / h, 0.04, 0.96);

  const headRow = sampleRowAtFrac(profile, 0.075) || { centerX: 0.52, outerL: 0.45, outerR: 0.59 };
  const shRow = sampleRowAtFrac(profile, 0.19) || { centerX: 0.49, outerL: 0.41, outerR: 0.57 };
  const upperBackRow = sampleRowAtFrac(profile, 0.27) || { centerX: 0.49, outerL: 0.39, outerR: 0.58 };
  const waistRow = sampleRowAtFrac(profile, 0.41) || { centerX: 0.50, outerL: 0.42, outerR: 0.58 };
  const hipRow = sampleRowAtFrac(profile, 0.51) || { centerX: 0.50, outerL: 0.41, outerR: 0.58 };
  const kneeRow = sampleRowAtFrac(profile, 0.74) || { centerX: 0.50, outerL: 0.45, outerR: 0.55 };
  const ankleRow = sampleRowAtFrac(profile, 0.92) || { centerX: 0.49, outerL: 0.45, outerR: 0.56 };
  const footRow = sampleRowAtFrac(profile, 0.97) || ankleRow;

  // Detect facing direction (+1 facing right, -1 facing left)
  let facing = 1;
  const footRightExt = footRow.outerR - ankleRow.centerX;
  const footLeftExt = ankleRow.centerX - footRow.outerL;
  if (Math.abs(footRightExt - footLeftExt) > 0.012) {
    facing = footRightExt >= footLeftExt ? 1 : -1;
  } else {
    facing = headRow.centerX >= shRow.centerX ? 1 : -1;
  }

  let landmarks = {
    facing,
    ear: { x: clamp(headRow.centerX - facing * 0.008, 0.1, 0.9), y: yAt(0.085) },
    shoulder: { x: clamp(shRow.centerX, 0.1, 0.9), y: yAt(0.19) },
    upperBack: {
      x: clamp(facing === 1 ? upperBackRow.outerL : upperBackRow.outerR, 0.08, 0.92),
      y: yAt(0.27),
    },
    waistFront: {
      x: clamp(facing === 1 ? waistRow.outerR : waistRow.outerL, 0.1, 0.9),
      y: yAt(0.41),
    },
    waistBack: {
      x: clamp(facing === 1 ? waistRow.outerL : waistRow.outerR, 0.1, 0.9),
      y: yAt(0.41),
    },
    hip: { x: clamp(hipRow.centerX, 0.1, 0.9), y: yAt(0.515) },
    knee: { x: clamp(kneeRow.centerX, 0.1, 0.9), y: yAt(0.735) },
    ankle: { x: clamp(ankleRow.centerX, 0.1, 0.9), y: yAt(0.925) },
  };

  if (mpLandmarks && mpLandmarks.length >= 29) {
    // Pick the closer (higher visibility) side of body
    const leftVis = (mpLandmarks[11].visibility ?? 0) + (mpLandmarks[23].visibility ?? 0);
    const rightVis = (mpLandmarks[12].visibility ?? 0) + (mpLandmarks[24].visibility ?? 0);
    const useLeft = leftVis >= rightVis;

    const ear = mpLandmarks[useLeft ? 7 : 8];
    const nose = mpLandmarks[0];
    const sh = mpLandmarks[useLeft ? 11 : 12];
    const hip = mpLandmarks[useLeft ? 23 : 24];
    const knee = mpLandmarks[useLeft ? 25 : 26];
    const ankle = mpLandmarks[useLeft ? 27 : 28];

    if ((sh.visibility ?? 0) > 0.4 && (hip.visibility ?? 0) > 0.4) {
      facing = nose.x >= ear.x ? 1 : -1;
      landmarks.facing = facing;
      landmarks.ear = { x: clamp(ear.x, 0.08, 0.92), y: clamp(ear.y, 0.04, 0.35) };
      landmarks.shoulder = { x: clamp(sh.x, 0.08, 0.92), y: clamp(sh.y, 0.1, 0.45) };
      landmarks.hip = { x: clamp(hip.x, 0.08, 0.92), y: clamp(hip.y, 0.3, 0.72) };
      if ((knee.visibility ?? 0) > 0.35) {
        landmarks.knee = { x: clamp(knee.x, 0.08, 0.92), y: clamp(knee.y, 0.5, 0.88) };
      }
      if ((ankle.visibility ?? 0) > 0.3) {
        landmarks.ankle = { x: clamp(ankle.x, 0.08, 0.92), y: clamp(ankle.y, 0.72, 0.97) };
      }
      // Keep upperBack & waist front/back aligned to silhouette relative to MP shoulder/hip
      const ubRow = sampleRowAtFrac(profile, clamp(((sh.y + 0.07) * h - yTop) / span, 0.2, 0.34));
      if (ubRow) {
        landmarks.upperBack = {
          x: clamp(facing === 1 ? ubRow.outerL : ubRow.outerR, 0.08, 0.92),
          y: clamp(sh.y + 0.07, 0.16, 0.45),
        };
      }
    }
  }

  return landmarks;
}

/**
 * Analyze a single angle photo (`front` | `side` | `back` | `side2`).
 */
export async function analyzeAnglePhoto(angleKey, dataUrl) {
  const img = await loadImageElement(dataUrl);
  const silhouette = extractSilhouetteProfile(img);

  let mpLandmarks = null;
  let method = 'local_silhouette';

  const landmarker = await tryInitMediaPipe();
  if (landmarker) {
    try {
      const res = landmarker.detect(img);
      if (res?.landmarks?.length && res.landmarks[0].length >= 29) {
        mpLandmarks = res.landmarks[0];
        method = 'mediapipe_hybrid';
      }
    } catch {
      // Fallback gracefully to local_silhouette
    }
  }

  let landmarks;
  if (angleKey === 'front') {
    landmarks = buildFrontOrBackLandmarks(silhouette, mpLandmarks, false);
  } else if (angleKey === 'back') {
    landmarks = buildFrontOrBackLandmarks(silhouette, mpLandmarks, true);
  } else {
    landmarks = buildSideLandmarks(silhouette, mpLandmarks);
  }

  return {
    angleKey,
    width: img.naturalWidth,
    height: img.naturalHeight,
    aspectRatio: img.naturalWidth / img.naturalHeight,
    method,
    silhouetteDetected: silhouette.valid,
    landmarks,
  };
}

/**
 * Compute comprehensive posture, symmetry & proportion metrics from analyzed angles.
 */
export function computeBodyMetrics(analyses, profile = {}) {
  const front = analyses.front;
  const side = analyses.side || analyses.side2;
  const back = analyses.back;
  const anglesProvided = Object.keys(analyses).filter((k) => analyses[k]);

  let shoulderToWaist = null;
  let waistToHip = null;
  let shoulderTiltDeg = 0;
  let hipTiltDeg = 0;
  let spineCenterOffset = 0;

  const frontLike = front || back;
  if (frontLike) {
    const lm = frontLike.landmarks;
    const ar = frontLike.aspectRatio || 0.67; // width / height
    const shWidth = Math.hypot((lm.rightShoulder.x - lm.leftShoulder.x) * ar, lm.rightShoulder.y - lm.leftShoulder.y);
    const waistWidth = Math.abs((lm.rightWaist.x - lm.leftWaist.x) * ar);
    const hipWidth = Math.hypot((lm.rightHip.x - lm.leftHip.x) * ar, lm.rightHip.y - lm.leftHip.y);

    shoulderToWaist = waistWidth > 0.01 ? Number((shWidth / waistWidth).toFixed(2)) : 1.28;
    waistToHip = hipWidth > 0.01 ? Number((waistWidth / hipWidth).toFixed(2)) : 0.85;

    const dxSh = (lm.rightShoulder.x - lm.leftShoulder.x) * ar;
    const dySh = lm.rightShoulder.y - lm.leftShoulder.y;
    shoulderTiltDeg = Number((Math.abs(Math.atan2(dySh, dxSh) * (180 / Math.PI))).toFixed(1));

    const dxHp = (lm.rightHip.x - lm.leftHip.x) * ar;
    const dyHp = lm.rightHip.y - lm.leftHip.y;
    hipTiltDeg = Number((Math.abs(Math.atan2(dyHp, dxHp) * (180 / Math.PI))).toFixed(1));

    const shMidX = (lm.leftShoulder.x + lm.rightShoulder.x) * 0.5;
    const hpMidX = (lm.leftHip.x + lm.rightHip.x) * 0.5;
    const ankMidX = (lm.leftAnkle.x + lm.rightAnkle.x) * 0.5;
    spineCenterOffset = Number((Math.abs(shMidX - ankMidX) * 100 + Math.abs(hpMidX - ankMidX) * 80).toFixed(1));
  }

  // Blend back shoulder tilt if both front and back exist
  if (front && back) {
    const blm = back.landmarks;
    const bar = back.aspectRatio || 0.67;
    const backTilt = Math.abs(
      Math.atan2(blm.rightShoulder.y - blm.leftShoulder.y, (blm.rightShoulder.x - blm.leftShoulder.x) * bar) *
        (180 / Math.PI)
    );
    shoulderTiltDeg = Number(((shoulderTiltDeg * 0.6 + backTilt * 0.4)).toFixed(1));
  }

  let forwardHeadDeg = null;
  let thoracicRoundScore = null;
  let pelvicTiltHint = 'neutral';
  let plumbDeviationPct = null;

  if (side) {
    const lm = side.landmarks;
    const ar = side.aspectRatio || 0.67;
    const facing = lm.facing || 1;
    // Positive dxForward means ear is shifted forward relative to shoulder in facing direction
    const dxForward = (lm.ear.x - lm.shoulder.x) * facing * ar;
    const dyUp = Math.max(0.04, lm.shoulder.y - lm.ear.y);
    const rawAngle = Math.atan2(dxForward, dyUp) * (180 / Math.PI);
    forwardHeadDeg = Number(clamp(rawAngle, -5, 38).toFixed(1));

    // Thoracic rounding: how far upperBack protrudes behind the shoulder-to-hip line
    const torsoH = Math.max(0.12, lm.hip.y - lm.shoulder.y);
    const t = clamp((lm.upperBack.y - lm.shoulder.y) / torsoH, 0.1, 0.7);
    const lineXAtUpperBack = lm.shoulder.x + (lm.hip.x - lm.shoulder.x) * t;
    const backOffset = (lineXAtUpperBack - lm.upperBack.x) * facing * ar;
    const torsoDepth = Math.max(0.05, Math.abs(lm.waistFront.x - lm.waistBack.x) * ar);
    // Typical neutral upper-back offset ratio ~0.58-0.70 of waist depth; higher = rounder thoracic curve
    const ratio = backOffset / torsoDepth;
    thoracicRoundScore = Math.round(clamp((ratio - 0.50) * 165, 5, 95));

    // Pelvic/swayback offset
    const hipForwardShift = (lm.hip.x - lm.ankle.x) * facing * ar;
    const waistCenterX = (lm.waistFront.x + lm.waistBack.x) * 0.5;
    const lumbarCurve = (waistCenterX - lm.hip.x) * facing * ar;
    if (hipForwardShift > 0.016 || lumbarCurve > 0.015) {
      pelvicTiltHint = 'anterior';
    } else if (hipForwardShift < -0.022) {
      pelvicTiltHint = 'posterior';
    } else {
      pelvicTiltHint = 'neutral';
    }

    plumbDeviationPct = Number(
      (
        (Math.abs(lm.ear.x - lm.ankle.x) +
          Math.abs(lm.shoulder.x - lm.ankle.x) +
          Math.abs(lm.hip.x - lm.ankle.x)) *
        ar *
        100
      ).toFixed(1)
    );
  }

  // Height / weight BMI
  let bmi = null;
  if (profile.heightCm > 100 && profile.weightKg > 30) {
    const m = profile.heightCm / 100;
    bmi = Number((profile.weightKg / (m * m)).toFixed(1));
  }

  // Symmetry & overall posture score (0..100)
  let score = 96;
  if (shoulderTiltDeg > 1.8) score -= Math.min(18, (shoulderTiltDeg - 1.8) * 3.8);
  if (hipTiltDeg > 1.8) score -= Math.min(14, (hipTiltDeg - 1.8) * 3.2);
  if (forwardHeadDeg !== null && forwardHeadDeg > 6) score -= Math.min(22, (forwardHeadDeg - 6) * 1.45);
  if (thoracicRoundScore !== null && thoracicRoundScore > 38) score -= Math.min(18, (thoracicRoundScore - 38) * 0.38);
  if (pelvicTiltHint !== 'neutral') score -= 7;
  const postureScore = Math.round(clamp(score, 42, 98));
  const symmetryScore = Math.round(clamp(98 - shoulderTiltDeg * 4.5 - hipTiltDeg * 3.8 - spineCenterOffset * 1.2, 50, 99));

  // Classify body frame / proportions respectfully
  const isFemale = profile.sex === 'female';
  let bodyFrame = 'Сбалансированные пропорции';
  if (shoulderToWaist !== null) {
    if (isFemale) {
      if (waistToHip !== null && waistToHip < 0.78 && shoulderToWaist >= 1.24) {
        bodyFrame = 'Выраженные «песочные часы» / атлетичный баланс';
      } else if (waistToHip !== null && waistToHip < 0.80) {
        bodyFrame = 'Акцент на нижнюю часть тела (груша / треугольник)';
      } else if (shoulderToWaist >= 1.32) {
        bodyFrame = 'Спортивный верх (перевёрнутый треугольник)';
      } else {
        bodyFrame = 'Ровный спортивный силуэт (прямоугольник)';
      }
    } else {
      if (shoulderToWaist >= 1.38) {
        bodyFrame = 'Выраженный атлетичный V-силуэт';
      } else if (shoulderToWaist >= 1.24) {
        bodyFrame = 'Сбалансированный трапециевидный силуэт';
      } else {
        bodyFrame = 'Прямой силуэт — хороший потенциал для расширения плеч и спины';
      }
    }
  }

  // Build actionable biomechanical findings (directly consumed by plan-generator.js)
  const findings = [];

  if (forwardHeadDeg !== null) {
    if (forwardHeadDeg >= 10) {
      findings.push({
        id: 'forward_head',
        severity: 'focus',
        title: 'Смещение головы вперёд («компьютерная шея»)',
        metricText: `+${forwardHeadDeg}°`,
        explanation:
          'Ушная линия вынесена вперёд относительно плечевого сустава. В план добавим ретракцию шеи, раскрытие грудного отдела и укрепление верхней спины.',
        tags: ['forward_head', 'posture_upper'],
      });
    } else if (forwardHeadDeg >= 6.5) {
      findings.push({
        id: 'forward_head_mild',
        severity: 'watch',
        title: 'Лёгкий наклон головы вперёд',
        metricText: `+${forwardHeadDeg}°`,
        explanation:
          'Небольшой вынос шеи вперёд. Короткая разминка на мобильность грудного отдела и упражнения на задние дельты быстро выровняют линию.',
        tags: ['forward_head', 'posture_upper'],
      });
    } else {
      findings.push({
        id: 'head_aligned',
        severity: 'good',
        title: 'Ровное положение головы и шеи',
        metricText: `${forwardHeadDeg}°`,
        explanation: 'Голова расположена близко к вертикальной оси плеч — отличная база для силовых упражнений.',
        tags: [],
      });
    }
  }

  if (thoracicRoundScore !== null && thoracicRoundScore >= 42) {
    findings.push({
      id: 'rounded_shoulders',
      severity: thoracicRoundScore >= 60 ? 'focus' : 'watch',
      title: 'Тенденция к сутулости грудного отдела',
      metricText: `Индекс ${thoracicRoundScore}/100`,
      explanation:
        'Заметно скругление верхней части спины. Сделаем акцент на тягах (верх спины, ромбовидные, задние дельты) и раскрытии грудных мышц.',
      tags: ['rounded_shoulders', 'posture_upper'],
    });
  }

  if (shoulderTiltDeg >= 2.2 || hipTiltDeg >= 2.2) {
    findings.push({
      id: 'asymmetry',
      severity: shoulderTiltDeg >= 3.5 || hipTiltDeg >= 3.5 ? 'focus' : 'watch',
      title: 'Небольшая асимметрия плеч или таза',
      metricText: `Плечи ${shoulderTiltDeg}° • Таз ${hipTiltDeg}°`,
      explanation:
        'Один край плечевого пояса или таза чуть выше другого. Включим односторонние (унилатеральные) упражнения, чтобы выровнять тонус обеих сторон.',
      tags: ['asymmetry', 'unilateral'],
    });
  } else if (frontLike) {
    findings.push({
      id: 'good_symmetry',
      severity: 'good',
      title: 'Хорошая фронтальная симметрия',
      metricText: `Плечи ${shoulderTiltDeg}° • Таз ${hipTiltDeg}°`,
      explanation: 'Линии плеч и таза практически горизонтальны — дисбалансов по сторонам не выявлено.',
      tags: [],
    });
  }

  if (pelvicTiltHint === 'anterior') {
    findings.push({
      id: 'anterior_pelvic_tilt',
      severity: 'watch',
      title: 'Тенденция к переднему наклону таза (усиленный прогиб)',
      metricText: 'Поясничный кор',
      explanation:
        'Стоит укрепить глубокие мышцы кора и ягодицы («Мёртвый жук», ягодичный мостик) и мягко растягивать сгибатели бедра.',
      tags: ['anterior_pelvic_tilt', 'core_stability'],
    });
  }

  if (shoulderToWaist !== null) {
    const targetV = isFemale ? 1.24 : 1.38;
    if (shoulderToWaist < targetV - 0.08) {
      findings.push({
        id: 'v_taper_boost',
        severity: 'watch',
        title: isFemale ? 'Тонус плечевого пояса и акцент на талию' : 'Потенциал для V-силуэта (плечи и широчайшие)',
        metricText: `Плечи/Талия ${shoulderToWaist}`,
        explanation: isFemale
          ? 'Умеренное укрепление дельт и спины визуально подчеркнёт талию и сделает осанку более статной.'
          : 'Добавим приоритетный объём на средние дельты, широчайшие и кор, чтобы визуально расширить верх и подчеркнуть талию.',
        tags: ['v_taper_boost', 'upper_width'],
      });
    } else {
      findings.push({
        id: 'strong_proportions',
        severity: 'good',
        title: 'Гармоничное соотношение плеч и талии',
        metricText: `Плечи/Талия ${shoulderToWaist}`,
        explanation: 'Пропорции верха и середины корпуса уже сбалансированы — можно равномерно развивать всё тело.',
        tags: [],
      });
    }
  }

  if (bmi !== null && bmi >= 26.5) {
    findings.push({
      id: 'metabolic_focus',
      severity: 'watch',
      title: 'Повышенный метаболический компонент',
      metricText: `ИМТ ${bmi}`,
      explanation:
        'Для более выраженного рельефа сочетаем базовые силовые движения с короткими интервалами отдыха и кардио-блоком.',
      tags: ['fat_burn'],
    });
  }

  const focusTags = [...new Set(findings.flatMap((f) => f.tags))];

  return {
    anglesProvided,
    shoulderToWaist,
    waistToHip,
    shoulderTiltDeg,
    hipTiltDeg,
    forwardHeadDeg,
    thoracicRoundScore,
    pelvicTiltHint,
    plumbDeviationPct,
    bmi,
    postureScore,
    symmetryScore,
    bodyFrame,
    findings,
    focusTags,
  };
}

/**
 * Render photo + posture/proportion/skeleton overlays onto a target canvas.
 */
export function renderAnalysisOverlay(canvas, img, analysis, options = {}) {
  const {
    showPosture = true,
    showProportions = true,
    showSkeleton = true,
    editMode = false,
    activeHandle = null,
  } = options;

  const rect = canvas.getBoundingClientRect();
  const displayW = Math.max(260, rect.width || 420);
  const ratio = img.naturalHeight / img.naturalWidth;
  const displayH = Math.round(displayW * ratio);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(displayW * dpr);
  canvas.height = Math.round(displayH * dpr);
  canvas.style.height = `${displayH}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Draw base image
  ctx.drawImage(img, 0, 0, displayW, displayH);

  // Subtle dark tint to make bright posture vectors pop cleanly
  ctx.fillStyle = 'rgba(10, 15, 25, 0.18)';
  ctx.fillRect(0, 0, displayW, displayH);

  const lm = analysis.landmarks;
  const px = (pt) => ({ x: pt.x * displayW, y: pt.y * displayH });
  const angleKey = analysis.angleKey;

  const drawBadge = (text, x, y, bg = 'rgba(15, 23, 42, 0.86)', border = '#22d3a7', fg = '#f8fafc') => {
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 14;
    const bh = 22;
    const bx = clamp(x - bw / 2, 8, displayW - bw - 8);
    const by = clamp(y - bh / 2, 8, displayH - bh - 8);
    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  };

  if (angleKey === 'front' || angleKey === 'back') {
    const head = px(lm.headTop);
    const lSh = px(lm.leftShoulder);
    const rSh = px(lm.rightShoulder);
    const lW = px(lm.leftWaist);
    const rW = px(lm.rightWaist);
    const lH = px(lm.leftHip);
    const rH = px(lm.rightHip);
    const lK = px(lm.leftKnee);
    const rK = px(lm.rightKnee);
    const lA = px(lm.leftAnkle);
    const rA = px(lm.rightAnkle);

    if (showPosture) {
      // Ideal central plumb line
      const centerX = (lA.x + rA.x) * 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, Math.max(12, head.y - 16));
      ctx.lineTo(centerX, Math.min(displayH - 12, Math.max(lA.y, rA.y) + 14));
      ctx.stroke();

      // Horizontal reference across shoulders
      const shMidY = (lSh.y + rSh.y) * 0.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lSh.x - 22, shMidY);
      ctx.lineTo(rSh.x + 22, shMidY);
      ctx.stroke();
      ctx.restore();

      // Actual shoulder tilt line
      const shDeg = Math.abs(Math.atan2(rSh.y - lSh.y, rSh.x - lSh.x) * (180 / Math.PI));
      const shColor = shDeg > 2.5 ? '#ff6b4a' : '#22d3a7';
      ctx.strokeStyle = shColor;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(lSh.x, lSh.y);
      ctx.lineTo(rSh.x, rSh.y);
      ctx.stroke();
      drawBadge(`Плечи ${shDeg.toFixed(1)}°`, (lSh.x + rSh.x) * 0.5, Math.min(lSh.y, rSh.y) - 18, undefined, shColor);

      // Actual hip tilt line
      const hpDeg = Math.abs(Math.atan2(rH.y - lH.y, rH.x - lH.x) * (180 / Math.PI));
      const hpColor = hpDeg > 2.5 ? '#f59e0b' : '#22d3a7';
      ctx.strokeStyle = hpColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(lH.x, lH.y);
      ctx.lineTo(rH.x, rH.y);
      ctx.stroke();
    }

    if (showProportions) {
      const shW = Math.hypot(rSh.x - lSh.x, rSh.y - lSh.y);
      const wW = Math.hypot(rW.x - lW.x, rW.y - lW.y);
      const hW = Math.hypot(rH.x - lH.x, rH.y - lH.y);
      const vRatio = wW > 5 ? (shW / wW).toFixed(2) : '—';
      const whr = hW > 5 ? (wW / hW).toFixed(2) : '—';

      // Waist caliper
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(lW.x, lW.y);
      ctx.lineTo(rW.x, rW.y);
      ctx.stroke();
      drawBadge(`V-индекс ${vRatio}`, (lW.x + rW.x) * 0.5, lW.y - 16, undefined, '#38bdf8');
      drawBadge(`WHR ${whr}`, (lH.x + rH.x) * 0.5, Math.max(lH.y, rH.y) + 18, undefined, '#a78bfa');

      // Silhouette V-taper envelope
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 167, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lSh.x, lSh.y);
      ctx.lineTo(lW.x, lW.y);
      ctx.lineTo(lH.x, lH.y);
      ctx.moveTo(rSh.x, rSh.y);
      ctx.lineTo(rW.x, rW.y);
      ctx.lineTo(rH.x, rH.y);
      ctx.stroke();
      ctx.restore();
    }

    if (showSkeleton) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.58)';
      ctx.lineWidth = 2;
      const chains = [
        [lH, lK, lA],
        [rH, rK, rA],
      ];
      if (angleKey === 'back' && lm.spineUpper && lm.spineLower) {
        chains.push([head, px(lm.spineUpper), px(lm.spineLower)]);
      }
      for (const chain of chains) {
        ctx.beginPath();
        chain.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
    }
  } else {
    // Side view overlay
    const ear = px(lm.ear);
    const sh = px(lm.shoulder);
    const ub = px(lm.upperBack);
    const wf = px(lm.waistFront);
    const wb = px(lm.waistBack);
    const hip = px(lm.hip);
    const knee = px(lm.knee);
    const ankle = px(lm.ankle);
    const facing = lm.facing || 1;

    if (showPosture) {
      // Ideal plumb line from ankle straight up
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 167, 0.78)';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ankle.x, Math.max(12, ear.y - 26));
      ctx.lineTo(ankle.x, Math.min(displayH - 12, ankle.y + 14));
      ctx.stroke();
      ctx.restore();

      // Actual posture chain: ear -> shoulder -> hip -> knee -> ankle
      const dxFwd = (ear.x - sh.x) * facing;
      const dyUp = Math.max(12, sh.y - ear.y);
      const fhDeg = Math.atan2(dxFwd, dyUp) * (180 / Math.PI);
      const fhColor = fhDeg > 9.5 ? '#ff6b4a' : fhDeg > 6 ? '#f59e0b' : '#22d3a7';

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(hip.x, hip.y);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(ankle.x, ankle.y);
      ctx.stroke();

      // Highlight neck forward segment separately
      ctx.strokeStyle = fhColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(ear.x, ear.y);
      ctx.stroke();

      drawBadge(`Шея ${fhDeg >= 0 ? '+' : ''}${fhDeg.toFixed(1)}°`, ear.x + facing * 42, ear.y - 14, undefined, fhColor);
      drawBadge('Вертикаль', ankle.x - facing * 42, Math.max(26, ear.y - 16), undefined, '#22d3a7');
    }

    if (showProportions) {
      // Thoracic curve & waist depth
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.quadraticCurveTo(ub.x, ub.y, wb.x, wb.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(167, 139, 250, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wb.x, wb.y);
      ctx.lineTo(wf.x, wf.y);
      ctx.stroke();
    }
  }

  // Draw landmark nodes (always subtle in view mode, prominent draggable handles in edit mode)
  if (showSkeleton || editMode) {
    for (const [key, pt] of Object.entries(lm)) {
      if (!pt || typeof pt.x !== 'number') continue;
      const p = px(pt);
      const isActive = activeHandle === key;
      const radius = editMode ? (isActive ? 9 : 7) : 4.2;

      if (editMode) {
        ctx.fillStyle = isActive ? 'rgba(255, 107, 74, 0.32)' : 'rgba(34, 211, 167, 0.24)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isActive ? '#ff6b4a' : '#22d3a7';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/**
 * Attach pointer drag handler so users can adjust any landmark directly on the photo.
 */
export function attachLandmarkEditor(canvas, getState, onUpdate) {
  let draggingKey = null;

  const getNormCoords = (evt) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((evt.clientX - rect.left) / rect.width, 0.03, 0.97),
      y: clamp((evt.clientY - rect.top) / rect.height, 0.03, 0.97),
      rect,
    };
  };

  const findNearestHandle = (x, y, rect, landmarks) => {
    let bestKey = null;
    let bestDist = 24; // pixels
    for (const [key, pt] of Object.entries(landmarks)) {
      if (!pt || typeof pt.x !== 'number') continue;
      const dist = Math.hypot((pt.x - x) * rect.width, (pt.y - y) * rect.height);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = key;
      }
    }
    return bestKey;
  };

  const onPointerDown = (evt) => {
    const st = getState();
    if (!st || !st.editMode || !st.analysis) return;
    const { x, y, rect } = getNormCoords(evt);
    const key = findNearestHandle(x, y, rect, st.analysis.landmarks);
    if (!key) return;
    draggingKey = key;
    canvas.setPointerCapture(evt.pointerId);
    onUpdate(draggingKey, null);
  };

  const onPointerMove = (evt) => {
    const st = getState();
    if (!st || !st.editMode || !st.analysis) {
      canvas.style.cursor = 'default';
      return;
    }
    const { x, y, rect } = getNormCoords(evt);
    if (!draggingKey) {
      const hover = findNearestHandle(x, y, rect, st.analysis.landmarks);
      canvas.style.cursor = hover ? 'grab' : 'crosshair';
      return;
    }
    canvas.style.cursor = 'grabbing';
    st.analysis.landmarks[draggingKey] = { x, y };
    onUpdate(draggingKey, st.analysis.landmarks[draggingKey]);
  };

  const onPointerUp = (evt) => {
    if (!draggingKey) return;
    try {
      canvas.releasePointerCapture(evt.pointerId);
    } catch {
      // Ignore if capture was already released
    }
    draggingKey = null;
    canvas.style.cursor = 'crosshair';
    onUpdate(null, null, true);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  };
}
