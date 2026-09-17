/**
 * Небо страницы «Эфемерида»: три слоя в одном кадре.
 *
 *  1. поле  — шейдерный рейтрейс на WebGL2, живая подложка;
 *  2. поток — цифры, плывущие по одной общей траектории;
 *  3. карта — натальное колесо, нарисованное частицами.
 *
 * Карта живёт на том же холсте, что и поток: только так её частицы могут
 * в него влиться, а не кружить внутри своего квадрата. Когда карта
 * распадается, каждая её точка получает место в потоке и уходит туда,
 * а потом возвращается на своё место в чертеже.
 */

export type Planet = {
  name: string; lon: number; sign: string; deg: number;
  label: string; retro: boolean; house: number;
  /* точка авестийской школы: физического тела за ней нет */
  fictional?: boolean;
};
export type Aspect = { a: string; b: string; type: string; exact: number };
export type Chart = {
  planets: Planet[];
  houses: { n: number; lon: number; label: string }[];
  asc: { lon: number; label: string };
  mc: { lon: number; label: string };
  aspects: Aspect[];
  /* всё ниже даёт та же эфемерида, колесу оно не нужно — только тексту */
  angle_aspects?: Aspect[];
  moon_phase?: { angle: number; illum: number; name: string };
  day_chart?: boolean;
  ruler?: { sign: string; planet: string; classic: string; label: string; house: number };
  elements?: Record<string, number>;
  modes?: Record<string, number>;
  stelliums?: { where: string; who: string[] }[];
  stations?: string[];
  lilith?: { lon: number; label: string; house: number } | null;
  lilith_true?: { lon: number; label: string; house: number } | null;
  school?: string;
};

/** Сегодняшнее небо против карты рождения. Карта не меняется, небо — каждый день. */
export type Now = {
  when: string;
  sky: { name: string; lon: number; label: string; retro: boolean }[];
  moon: { label: string; sign: string; phase: string; illum: number };
  hits: {
    who: string; type: string; to: string; orb: number;
    state: string; exact: string; days: number; retro: boolean; slow: boolean;
  }[];
  text: { blocks: string[]; tail: string };
};

type Item = {
  x: number; y: number; c: string; a: number; s: number; ch: string;
  g?: string; gs?: number;
  t: number; off: number; spd: number; wAmp: number; wFreq: number; ph: number;
  st: number; dp: number; dx: number; dy: number; vx: number; vy: number; dl: number;
};

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const digit = () =>
  Math.random() < 0.5 ? (Math.random() < 0.5 ? "7" : "0")
                      : String(Math.floor(Math.random() * 10));

// Хаос состоит из того же, из чего карта: цифры, символы градуса и
// ретроградности, глифы планет и знаков. Каждый символ идёт с ︎ —
// иначе система рисует знаки зодиака цветными эмодзи-плашками,
// и распад выглядит набором пикселей, а не цифр.
const VS = "︎";
const NOISE = "0123456789".split("")
  .concat("°′RASCMC".split(""))
  .concat("☉☽☿♀♂♃♄♅♆♇☊".split("").map((c) => c + VS))
  .concat(glyphSupported("⚷") ? ["⚷" + VS] : [])
  .concat("♈♉♊♋♌♍♎♏♐♑♒♓".split("").map((c) => c + VS));
const noiseChar = () => NOISE[(Math.random() * NOISE.length) | 0];

const SIGNS = "♈♉♊♋♌♍♎♏♐♑♒♓".split("").map((c) => c + VS);

/** Есть ли такой знак в шрифте. Глиф Хирона ⚷ живёт в редком блоке, и на
 *  части систем вместо него рисуется пустой квадрат. Проверяем измерением:
 *  у отсутствующего символа ширина совпадает с заведомо несуществующим. */
function glyphSupported(ch: string): boolean {
  try {
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return false;
    c.font = '32px "Golos Text", system-ui, sans-serif';
    const tofu = c.measureText("\uFFFF").width;
    return Math.abs(c.measureText(ch).width - tofu) > 0.5;
  } catch {
    return false;
  }
}

const CHIRON = glyphSupported("⚷") ? "⚷" : "Хр";

const GLYPH: Record<string, string> = {
  "Солнце": "☉", "Луна": "☽", "Меркурий": "☿", "Венера": "♀", "Марс": "♂",
  "Юпитер": "♃", "Сатурн": "♄", "Уран": "♅", "Нептун": "♆", "Плутон": "♇",
  "Сев. узел": "☊", "Хирон": CHIRON,
  // У Прозерпины и Селены нет общепринятого знака в Юникоде — пишем буквами.
  // Заодно они и на колесе видны как чужаки среди глифов, и это честно.
  "Прозерпина": "Пр", "Селена": "Се",
};
const ASPC: Record<string, string> = {
  "соединение": "#8a8f9a", "секстиль": "#4e8ad4", "квадрат": "#d4574e",
  "тригон": "#3f9d78", "оппозиция": "#d4574e",
};

/* ── поле ─────────────────────────────────────────────────────────── */
const FIELD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FIELD_FS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec3 iResolution;
uniform float iTime;
uniform float uGain;
void main(){
  vec2 r = iResolution.xy;
  float t = iTime;
  vec3 FC = vec3(gl_FragCoord.xy, t);
  vec4 o = vec4(0.0);
  float s = 0.0;
  for (float i = 0.0, z = 0.0, d = 0.0; i++ < 8e1; o += (cos(s + vec4(0.0,1.0,8.0,0.0)) + 1.0) / d) {
    vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
    vec3 a = normalize(cos(vec3(5.0,0.0,1.0) + t - d * 4.0));
    p.z += 5.0;
    a = a * dot(a, p) - cross(a, p);
    for (d = 1.0; d++ < 9.0; ) a -= sin(a * d + t).zxy / d;
    z += d = 0.1 * abs(length(p) - 3.0) + 0.07 * abs(cos(s = a.y));
  }
  o = tanh(o / 5e3);
  vec3 col = o.rgb;
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(lum), col, 0.5) * vec3(0.66, 0.76, 1.02);
  fragColor = vec4(col * uGain, 1.0);
}`;

function makeField(cv: HTMLCanvasElement) {
  const gl = cv.getContext("webgl2", {
    antialias: false, alpha: false, depth: false, powerPreference: "high-performance",
  });
  if (!gl) { cv.style.display = "none"; return null; }

  type Res = {
    prog: WebGLProgram; vao: WebGLVertexArrayObject; vbo: WebGLBuffer;
    uRes: WebGLUniformLocation | null;
    uTime: WebGLUniformLocation | null;
    uGain: WebGLUniformLocation | null;
  };

  // Всё, что живёт в видеопамяти, собирается здесь и только здесь. Потеря
  // контекста уничтожает и программу, и буферы, и адреса переменных — значит
  // после восстановления их надо собрать заново, а не просто снять флаг.
  const build = (): Res | null => {
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, FIELD_VS);
    const fs = vs && compile(gl.FRAGMENT_SHADER, FIELD_FS);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog)); return null;
    }
    const vao = gl.createVertexArray()!, vbo = gl.createBuffer()!;
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return {
      prog, vao, vbo,
      uRes: gl.getUniformLocation(prog, "iResolution"),
      uTime: gl.getUniformLocation(prog, "iTime"),
      uGain: gl.getUniformLocation(prog, "uGain"),
    };
  };

  let res = build();
  if (!res) { cv.style.display = "none"; return null; }

  // Рейтрейс дорогой: считаем в половину экранного разрешения и даём браузеру
  // растянуть. Поле мягкое, потери не видно, а кадр дешевле вчетверо.
  const scale0 = window.innerWidth < 700 ? 0.4 : 0.5;
  let scale = scale0;
  let cw = 0, ch = 0, clock = 0;
  let dead = false, off = false;
  // Меряем длительность кадра, а не время вызова отрисовки. Время вызова
  // ничего не говорит о шейдере: команды уходят в очередь и выполняются
  // потом, поэтому цифра оставалась маленькой на любой видеокарте и росла
  // только от постороннего провисания — то есть срабатывала лишь ложно.
  // Длительность кадра — ровно то, что человек видит.
  //
  // И держим замеры списком, а не суммой: по сумме считается среднее,
  // а среднее беззащитно перед выбросом. Один провис в триста миллисекунд
  // (сборка мусора, переключение вкладки, уход на батарею) поднимал среднее
  // выше порога. Медиана такой выброс не замечает.
  let samples: number[] = [];
  let winStart = performance.now();
  let badRuns = 0, goodRuns = 0;

  const median = (a: number[]) => {
    const v = a.slice().sort((x, y) => x - y);
    return v[v.length >> 1];
  };

  const restart = () => { samples = []; winStart = performance.now(); badRuns = goodRuns = 0; };

  // После возвращения на вкладку первые кадры всегда длинные — судить
  // по ним нельзя, поэтому окно замеров начинаем заново.
  const onVisible = () => { if (!document.hidden) restart(); };
  document.addEventListener("visibilitychange", onVisible);

  // Браузер отбирает контекст сам: уснул ноутбук, перезапустился драйвер,
  // вкладка провисела фоном полдня. Раньше мы на это только поднимали флаг,
  // а восстановление сводилось к его снятию — и поле оставалось чёрным
  // навсегда, потому что рисовать было уже нечем. Пересобираем.
  const revive = () => {
    res = build();
    if (!res) return;            // шейдер не собрался — пробуем в следующий раз
    cw = ch = 0; restart();
  };
  const onLost = (e: Event) => { e.preventDefault(); res = null; };
  const onRestored = () => revive();
  cv.addEventListener("webglcontextlost", onLost);
  cv.addEventListener("webglcontextrestored", onRestored);

  const size = () => {
    const w = Math.max(1, Math.round(window.innerWidth * scale));
    const h = Math.max(1, Math.round(window.innerHeight * scale));
    if (w === cw && h === ch) return;
    cw = w; ch = h; cv.width = w; cv.height = h; gl.viewport(0, 0, w, h);
  };
  size();

  return {
    set(on: boolean) {
      off = !on;
      cv.style.transition = "opacity .45s";
      cv.style.opacity = off ? "0" : "1";
    },
    resize: size,
    draw(dt: number, chaos: number) {
      if (off || dead) return;
      if (!res) {
        // Событие webglcontextrestored приходит не всегда — на части машин
        // контекст оживает молча. Поэтому не ждём события, а спрашиваем сам
        // контекст, и пересобираемся, как только он готов.
        if (gl.isContextLost()) return;
        revive();
        if (!res) return;
      }
      size();
      // Спокойная карта — поле медленное и приглушённое; распад его будит.
      clock += (dt / 1000) * (0.32 + chaos * 0.85);
      gl.useProgram(res.prog);
      gl.uniform3f(res.uRes, cw, ch, 1);
      gl.uniform1f(res.uTime, clock);
      gl.uniform1f(res.uGain, 1.02 + chaos * 0.6);
      gl.bindVertexArray(res.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Не укладываемся в кадр — роняем разрешение, а не частоту.
      const now = performance.now();
      samples.push(dt);
      // Окно закрывается по числу кадров или по времени — что раньше.
      // На слабой машине сорок кадров идут полминуты, и без второго условия
      // защита просыпалась бы тогда, когда человек уже ушёл со страницы.
      if (samples.length >= 40 || (samples.length >= 8 && now - winStart > 3000)) {
        const m = median(samples);
        samples = [];
        winStart = now;
        if (m > 28) {                 // медленнее 36 кадров в секунду
          badRuns++; goodRuns = 0;
          // Два тяжёлых окна подряд, а не одно: случайность так не проходит.
          if (badRuns >= 2 && scale > 0.3) {
            scale = Math.max(0.3, scale - 0.08); cw = ch = 0; badRuns = 0;
          }
        } else if (m < 19) {          // держим за полсотни кадров — есть запас
          goodRuns++; badRuns = 0;
          // Машина освободилась — возвращаем разрешение обратно.
          // Раньше падение было в одну сторону и навсегда.
          if (goodRuns >= 6 && scale < scale0) {
            scale = Math.min(scale0, scale + 0.05); cw = ch = 0; goodRuns = 0;
          }
        } else {
          badRuns = goodRuns = 0;
        }
      }
    },
    destroy() {
      dead = true;
      document.removeEventListener("visibilitychange", onVisible);
      cv.removeEventListener("webglcontextlost", onLost);
      cv.removeEventListener("webglcontextrestored", onRestored);
      if (res && !gl.isContextLost()) {
        gl.deleteBuffer(res.vbo); gl.deleteVertexArray(res.vao); gl.deleteProgram(res.prog);
      }
      res = null;
    },
  };
}

/* ── небо целиком ─────────────────────────────────────────────────── */
export function createSky(
  fieldCv: HTMLCanvasElement,
  streamCv: HTMLCanvasElement,
  box: HTMLElement,
) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const bctx = streamCv.getContext("2d")!;
  const field = makeField(fieldCv);
  let fieldOn = true;

  /* траектория потока — одна на всю страницу */
  const WAVES = 2.4, WAVES2 = 5.5, PHASE = -0.35, PHASE2 = 0.2;
  const WAVESY = 3, AMPY = 0.02, AMP = 0.15;
  const pathPoint = (t: number) => {
    const a2 = AMP * 0.37;
    return {
      x: 0.5 + AMP * Math.sin((t * WAVES + PHASE) * TAU) + a2 * Math.sin((t * WAVES2 + PHASE2) * TAU),
      y: -0.06 + t * 1.12 + AMPY * Math.sin(t * WAVESY * TAU),
    };
  };
  const tangent = (t: number) => {
    const e = 0.001, a = pathPoint(Math.max(0, t - e)), b = pathPoint(Math.min(1, t + e));
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };

  /* поток */
  let bw = 0, bh = 0, bright = 1, disperse = 0, drift = 0, flow = 0, lastActive = 0;
  const COUNT = window.innerWidth < 700 ? 360 : 720;
  const COUNT_FIELD = window.innerWidth < 700 ? 240 : 460;
  const spawn = () => {
    const wide = Math.random() < 0.28, t = Math.random();
    return {
      t, off: wide ? rand(-0.16, 0.16) : rand(-0.03, 0.03), speed: rand(0.0001, 0.0004),
      size: Math.round(rand(7, 13)), hue: rand(190, 320),
      colorful: Math.random() < 0.3 && t < 0.55, life: rand(0.5, 1),
      wAmp: rand(0.02, 0.1), wFreq: rand(1.5, 5), wPhase: rand(0, TAU), ch: digit(),
      dAx: rand(0.06, 0.24) * (Math.random() < 0.5 ? -1 : 1),
      dAy: rand(0.02, 0.09) * (Math.random() < 0.5 ? -1 : 1),
      dFx: rand(0.3, 1.1), dFy: rand(0.3, 1.1), dPx: rand(0, TAU), dPy: rand(0, TAU),
    };
  };
  const parts = Array.from({ length: COUNT }, spawn);
  const sizeBg = () => {
    const r = streamCv.getBoundingClientRect();
    bw = r.width; bh = r.height;
    streamCv.width = Math.max(1, Math.round(bw * dpr));
    streamCv.height = Math.max(1, Math.round(bh * dpr));
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /* карта */
  let ww = 0, wh = 0, items: Item[] = [];
  let chart: Chart | null = null;
  const ang = (lon: number) => (lon - (chart ? chart.asc.lon : 0) + 360) % 360;

  /* Чертёж карты считается один раз: из него и частицы, и чёткие линии.
     Так обе картинки заведомо совпадают точка в точку, и переход между
     ними читается как гранулирование линии, а не как подмена рисунка. */
  type Plan = {
    s: number; R: number; rSign: number; rHouse: number; rAsp: number;
    rings: { r: number; color: string; a: number; w: number }[];
    spokes: { x1: number; y1: number; x2: number; y2: number; color: string; a: number; w: number }[];
    lines: { x1: number; y1: number; x2: number; y2: number; color: string; a: number; w: number }[];
    texts: { x: number; y: number; t: string; color: string; size: number; a: number }[];
  };
  let plan: Plan | null = null;

  function build() {
    items = [];
    plan = null;
    if (!chart) return;
    const c = chart;
    const s = Math.min(ww, wh), cx = ww / 2, cy = wh / 2;
    const R = s * 0.40, rSign = s * 0.345, rHouse = s * 0.285;
    const rPlan = s * 0.245, rAsp = s * 0.21;
    const xy = (r: number, deg: number): [number, number] => {
      const a = ((180 + deg) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    };
    const P: Plan = { s, R, rSign, rHouse, rAsp, rings: [], spokes: [], lines: [], texts: [] };

    // t и off — место частицы в общем потоке: та же змейка и те же скорости,
    // что у фоновых цифр. В хаосе карта не «похожа» на поток, а плывёт в нём.
    const scatter = () => ({
      t: Math.random(), off: rand(-0.19, 0.19), spd: rand(0.00012, 0.00042),
      wAmp: rand(0.02, 0.09), wFreq: rand(1.5, 5), ph: rand(0, TAU),
      // жёсткость и затухание пружины: разброс даёт живость,
      // затухание чуть меньше единицы — источник инерции
      st: rand(0.010, 0.026), dp: rand(0.885, 0.935),
    });
    // layer — очередь сборки: сначала кольца, потом дома и аспекты,
    // глифы прилетают последними. Так фигура проявляется, а не возникает.
    const dot = (x: number, y: number, color: string, alpha: number, size = 1.1, layer = 0) => {
      items.push({
        x, y, c: color, a: alpha, s: size, ch: noiseChar(), ...scatter(),
        dx: 0, dy: 0, vx: 0, vy: 0,
        dl: Math.min(0.92, layer * 0.18 + Math.random() * 0.22),
      });
    };
    const glyph = (x: number, y: number, text: string, color: string,
                   gs: number, alpha: number, layer: number) => {
      items.push({
        x, y, c: color, a: alpha, s: 1.1, g: text, gs, ch: noiseChar(), ...scatter(),
        dx: 0, dy: 0, vx: 0, vy: 0,
        dl: Math.min(0.94, layer * 0.18 + Math.random() * 0.2),
      });
      P.texts.push({ x, y, t: text, color, size: gs, a: alpha });
    };
    const seg = (r1: number, r2: number, deg: number, color: string,
                 alpha: number, step: number, layer: number, w = 1) => {
      const p1 = xy(r1, deg), p2 = xy(r2, deg);
      const n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 0; k <= n; k++)
        dot(p1[0] + ((p2[0] - p1[0]) * k) / n, p1[1] + ((p2[1] - p1[1]) * k) / n, color, alpha, 1.1, layer);
      P.spokes.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], color, a: alpha, w });
    };
    const ring = (r: number, color: string, alpha: number, step: number, layer: number, w = 1) => {
      const n = Math.max(24, Math.round((TAU * r) / step));
      for (let k = 0; k < n; k++) { const p = xy(r, (k * 360) / n); dot(p[0], p[1], color, alpha, 1.1, layer); }
      P.rings.push({ r, color, a: alpha, w });
    };
    const link = (p1: [number, number], p2: [number, number], color: string,
                  alpha: number, step: number, layer: number, w = 1) => {
      const n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 0; k <= n; k++)
        dot(p1[0] + ((p2[0] - p1[0]) * k) / n, p1[1] + ((p2[1] - p1[1]) * k) / n, color, alpha, 1.15, layer);
      P.lines.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], color, a: alpha, w });
    };

    ring(R, "#5b6577", 0.95, 2.4, 0, 1.1); ring(rSign, "#5b6577", 0.95, 2.4, 0, 1.1);
    ring(rHouse, "#3d4654", 0.9, 2.8, 0); ring(rAsp, "#333b47", 0.9, 3.2, 0);

    for (let z = 0; z < 12; z++) {
      seg(rSign, R, ang(z * 30), "#5b6577", 0.95, 2.6, 1);
      const g = xy((R + rSign) / 2, ang(z * 30 + 15));
      glyph(g[0], g[1], SIGNS[z], "#aab5c9", s * 0.036, 1, 4);
    }
    for (let h = 0; h < 12; h++) {
      const strong = h === 0 || h === 3 || h === 6 || h === 9;
      seg(rAsp, rSign, ang(c.houses[h].lon), strong ? "#8792a3" : "#3d4654",
          strong ? 1 : 0.85, strong ? 2.6 : 4.5, 1, strong ? 1.4 : 0.8);
      // Номер дома ставим под самое кольцо домов. Раньше он стоял у кольца
      // аспектов — там же, где подписи градусов планет, и они наезжали друг
      // на друга: на россыпи точек это было незаметно, на чертеже — сразу.
      const np = xy(rHouse - s * 0.024, ang(c.houses[h].lon + 5));
      glyph(np[0], np[1], String(h + 1), "#79828f", s * 0.018, 0.85, 3);
    }
    const lons: Record<string, number> = {};
    for (const p of c.planets) lons[p.name] = p.lon;
    for (const A of c.aspects) {
      if (lons[A.a] === undefined || lons[A.b] === undefined) continue;
      link(xy(rAsp, ang(lons[A.a])), xy(rAsp, ang(lons[A.b])),
           ASPC[A.type] || "#9aa2b1", 0.7, 3.4, 2, 0.9);
    }
    const placed: number[] = [];
    const sorted = c.planets.slice().sort((a, b) => ang(a.lon) - ang(b.lon));
    for (const P2 of sorted) {
      let a0 = ang(P2.lon), guard = 0;
      while (guard++ < 60 && placed.some((v) => { const d = Math.abs(a0 - v); return d < 7 || d > 353; })) a0 += 7;
      placed.push(a0 % 360);
      link(xy(rAsp, ang(P2.lon)), xy(rPlan, a0), "#5b6577", 0.85, 3.4, 3, 0.8);
      const gp = xy(rPlan, a0);
      // Буквенные обозначения (Пр, Се, Хр) при том же кегле выглядят вдвое
      // крупнее глифов и перетягивают на себя карту — уменьшаем их.
      const mark = (GLYPH[P2.name] || "•") + VS;
      const ms = s * (mark.replace(VS, "").length > 1 ? 0.022 : 0.034);
      glyph(gp[0], gp[1], mark, "#eef1f7", ms, 1, 5);
      const dp = xy(rPlan - s * 0.042, a0);
      glyph(dp[0], dp[1], Math.floor(P2.deg) + "°" + (P2.retro ? "R" : ""),
            "#9aa4b4", s * 0.016, 0.95, 5);
    }
    for (let ax = 0; ax < 2; ax++) {
      const lab = ax ? "MC" : "ASC";
      const lp = xy(R + s * 0.03, ang(ax ? c.mc.lon : c.asc.lon));
      glyph(lp[0], lp[1], lab, "#8f9bb3", s * 0.019, 0.9, 4);
    }
    plan = P;
  }

  /** Собранная карта — настоящий чертёж: дуги, отрезки и текст, а не точки.
   *  Рисуется поверх частиц с прозрачностью (1 − хаос); когда карта начинает
   *  распадаться, линии гаснут ровно в том темпе, в каком проявляются цифры. */
  function drawPlan(ox: number, oy: number, alpha: number, jx: number, jy: number) {
    if (!plan || alpha <= 0.01) return;
    const P = plan, cx = ox + ww / 2 + jx, cy = oy + wh / 2 + jy;
    bctx.globalCompositeOperation = "source-over";
    bctx.lineCap = "round";
    for (const r of P.rings) {
      bctx.globalAlpha = r.a * alpha;
      bctx.strokeStyle = r.color; bctx.lineWidth = r.w;
      bctx.beginPath(); bctx.arc(cx, cy, r.r, 0, TAU); bctx.stroke();
    }
    for (const g of P.spokes.concat(P.lines)) {
      bctx.globalAlpha = g.a * alpha;
      bctx.strokeStyle = g.color; bctx.lineWidth = g.w;
      bctx.beginPath();
      bctx.moveTo(ox + g.x1 + jx, oy + g.y1 + jy);
      bctx.lineTo(ox + g.x2 + jx, oy + g.y2 + jy);
      bctx.stroke();
    }
    bctx.textAlign = "center"; bctx.textBaseline = "middle";
    for (const t of P.texts) {
      bctx.globalAlpha = t.a * alpha;
      bctx.fillStyle = t.color;
      bctx.font = t.size + 'px "Golos Text", system-ui, sans-serif';
      bctx.fillText(t.t, ox + t.x + jx, oy + t.y + jy);
    }
    bctx.globalAlpha = 1;
  }

  const sizeWheel = () => {
    const r = box.getBoundingClientRect();
    ww = r.width; wh = r.height;
    build();
  };
  const sizeAll = () => { sizeBg(); sizeWheel(); field?.resize(); };
  sizeAll();

  const onResize = () => sizeAll();
  window.addEventListener("resize", onResize);

  let lastY = window.scrollY;
  const bump = (d: number) => { flow += d * 0.0007 * 0.5; lastActive = performance.now(); };
  const onScroll = () => { bump(window.scrollY - lastY); lastY = window.scrollY; };
  const onWheel = (e: WheelEvent) => bump(e.deltaY);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: true });

  /* распад */
  // Карта иногда рассыпается в цифры и собирается обратно. Цикл дышит:
  // держится собранной около двадцати секунд, разлетается за две,
  // живёт рассыпанной пару секунд и возвращается медленнее, чем ушла.
  let phase: "gather" | "calm" | "melt" | "drift" = "gather";
  let phaseT = 0, tPrev = 0, firstRun = true, prog = 1;
  let GATHER = 2600;
  const MELT = 2000, DRIFT = 2600;
  let calmFor = 13000 + Math.random() * 9000;

  function chaosStep(dt: number) {
    phaseT += dt;
    if (phase === "gather") {
      prog = 1 - Math.min(1, phaseT / GATHER);
      if (phaseT >= GATHER) {
        phase = "calm"; phaseT = 0; prog = 0;
        if (firstRun) { firstRun = false; GATHER = 4200; }
      }
    } else if (phase === "calm") {
      if (phaseT >= calmFor) { phase = "melt"; phaseT = 0; }
    } else if (phase === "melt") {
      prog = Math.min(1, phaseT / MELT);
      if (phaseT >= MELT) { phase = "drift"; phaseT = 0; prog = 1; }
    } else if (phaseT >= DRIFT) {
      phase = "gather"; phaseT = 0; calmFor = 13000 + Math.random() * 9000;
    }
  }

  // Сборка — не общий рывок: у каждой частицы своя доля времени.
  // Кольца приходят первыми, глифы последними, движение тормозится к концу.
  const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
  // Распад разгоняется и так же плавно входит в поток: резкость раньше брала
  // начало не в кривой, а в том, что частица мгновенно принимала скорость
  // потока. Кривая помогает, инерция ниже — решает.
  const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  function chaosOf(dl: number) {
    if (phase === "calm") return 0;
    if (phase === "drift") return 1;
    const span = 1 - dl * 0.55;
    if (phase === "gather") return 1 - easeOut(clamp01((1 - prog - dl * 0.55) / span));
    return easeInOut(clamp01((prog - (1 - dl) * 0.35) / (1 - (1 - dl) * 0.35)));
  }

  function drawBg(step: boolean) {
    const idle = performance.now() - lastActive > 160;
    if (step) {
      bright += ((idle ? 0.6 : 1) - bright) * (idle ? 0.03 : 0.12);
      disperse += ((idle ? 1 : 0) - disperse) * (idle ? 0.01 : 0.06);
      drift += 0.02;
    }
    bctx.clearRect(0, 0, bw, bh);
    bctx.globalCompositeOperation = "lighter";
    bctx.textAlign = "center"; bctx.textBaseline = "middle";
    // Без поля цифр больше: иначе страница выглядит просто пустее,
    // и сравнивать два фона становится нечестно.
    const lim = fieldOn && field ? COUNT_FIELD : parts.length;
    for (let k = 0; k < lim; k++) {
      const p = parts[k];
      if (step) {
        p.t += p.speed; if (p.t >= 1) p.t -= 1;
        if (Math.random() < 0.003) p.ch = digit();
      }
      let et = p.t + flow; et -= Math.floor(et);
      const c = pathPoint(et), tan = tangent(et);
      const off = p.off + p.wAmp * Math.sin(et * p.wFreq * TAU + p.wPhase);
      const x = (c.x + -tan.y * off + disperse * p.dAx * Math.sin(drift * p.dFx + p.dPx)) * bw;
      const y = (c.y + tan.x * off + disperse * p.dAy * Math.sin(drift * p.dFy + p.dPy)) * bh;
      const core = 1 - Math.min(1, Math.abs(off) / 0.22);
      const alpha = (0.42 * core * p.life + 0.03) * bright;
      bctx.font = p.size + 'px "JetBrains Mono", ui-monospace, monospace';
      bctx.fillStyle = p.colorful
        ? `hsla(${p.hue}, 60%, 66%, ${alpha})`
        : `rgba(238,241,247,${alpha})`;
      bctx.fillText(p.ch, x, y);
    }
  }

  function drawWheel(step: boolean) {
    if (!items.length) return;
    const r = box.getBoundingClientRect();
    if (r.width !== ww || r.height !== wh) sizeWheel();
    const ox = r.left, oy = r.top, s = Math.min(ww, wh);
    // Пока карта собрана, поток под ней гасится: два тонких рисунка в одном
    // слое спорят. По мере распада затемнение уходит вместе с фигурой.
    const calmness = 1 - chaosOf(0.5);
    if (calmness > 0.01) {
      const cx = ox + ww / 2, cy = oy + wh / 2, rad = s * 0.52;
      const grd = bctx.createRadialGradient(cx, cy, rad * 0.25, cx, cy, rad);
      grd.addColorStop(0, `rgba(5,6,10,${0.92 * calmness})`);
      grd.addColorStop(0.62, `rgba(5,6,10,${0.55 * calmness})`);
      grd.addColorStop(1, "rgba(5,6,10,0)");
      bctx.globalCompositeOperation = "source-over";
      bctx.fillStyle = grd;
      bctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      bctx.globalCompositeOperation = "lighter";
    }
    // Собранная карта — это чертёж, а не россыпь точек: пока хаоса нет,
    // видны чёткие линии, а частицы погашены. Как только начинается распад,
    // линии тают, а цифры на их местах проявляются — и линия гранулируется.
    const order = 1 - clamp01(chaosOf(0.5) / 0.3);
    // Чертёж не стоит намертво: вся карта целиком ходит по крошечной орбите
    // в три пикселя. Этого хватает, чтобы она жила в одном воздухе с потоком,
    // и при этом ни одна линия не размывается.
    const jx = Math.sin(drift * 0.42) * s * 0.004 * order;
    const jy = Math.cos(drift * 0.33) * s * 0.004 * order;
    drawPlan(ox, oy, order, jx, jy);

    bctx.globalCompositeOperation = "lighter";
    bctx.textAlign = "center"; bctx.textBaseline = "middle";
    for (const it of items) {
      const k = chaosOf(it.dl);
      // частица существует только на время распада
      const vis = clamp01((k - 0.02) / 0.16);
      if (vis <= 0) continue;
      const hx = ox + it.x, hy = oy + it.y;
      if (step) { it.t += it.spd; if (it.t >= 1) it.t -= 1; }
      if (k > 0.5 && Math.random() < 0.02) it.ch = noiseChar();

      // Цель считается как смещение от чертежа, а не как точка на экране:
      // тогда прокрутка двигает карту жёстко, без тянучки, а пружина отвечает
      // только за уход в поток и возвращение. Даже собранная карта не стоит
      // намертво: каждая частица ходит по своей орбите в три-четыре пикселя.
      const idle = s * 0.0055 * (1 - k * 0.85);
      const rate = 0.55 + it.wFreq * 0.12;   // период орбиты — пять-семь секунд
      let gx = Math.sin(drift * rate + it.ph) * idle;
      let gy = Math.cos(drift * rate * 0.77 + it.ph * 1.7) * idle * 0.8;
      if (k > 0) {
        let et = it.t + flow; et -= Math.floor(et);
        const c = pathPoint(et), tan = tangent(et);
        const off = it.off + it.wAmp * Math.sin(et * it.wFreq * TAU + it.ph);
        const sx = (c.x + -tan.y * off + disperse * 0.12 * Math.sin(drift * 0.7 + it.ph)) * bw;
        const sy = (c.y + tan.x * off) * bh;
        gx += (sx - hx - gx) * k;
        gy += (sy - hy - gy) * k;
      }
      if (step) {
        // пружина с затуханием: частица разгоняется, а к цели подходит
        // с остатком скорости и гасит его — вместо удара о стенку
        it.vx = (it.vx + (gx - it.dx) * it.st) * it.dp;
        it.vy = (it.vy + (gy - it.dy) * it.st) * it.dp;
        it.dx += it.vx; it.dy += it.vy;
      }
      const x = hx + it.dx, y = hy + it.dy;
      // Ближе к порядку частица становится собой, в хаосе — случайным символом
      // карты. Точке кольца нельзя ехать квадратиком: она становится символом
      // почти сразу, глиф держится дольше — его форма и так читается.
      const lo = it.g ? 0.2 : 0.04, hi = it.g ? 0.36 : 0.12;
      const mix = clamp01((k - lo) / hi);
      const alpha = it.a * (1 - k * 0.15) * (it.g ? 1 : 1 + mix * 0.7) * vis;
      if (mix < 1) {
        bctx.globalAlpha = alpha * (1 - mix);
        bctx.fillStyle = it.c;
        if (it.g) {
          bctx.font = it.gs + 'px "Golos Text", system-ui, sans-serif';
          bctx.fillText(it.g, x, y);
        } else {
          bctx.fillRect(x - it.s / 2, y - it.s / 2, it.s, it.s);
        }
      }
      if (mix > 0) {
        bctx.globalAlpha = alpha * mix * 0.9;
        bctx.font = (it.gs ? it.gs * 0.75 : s * 0.014) +
          'px "JetBrains Mono", ui-monospace, monospace';
        bctx.fillStyle = it.c;
        bctx.fillText(it.ch, x, y);
      }
    }
    bctx.globalAlpha = 1;
  }

  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = tPrev ? Math.min(64, now - tPrev) : 16;
    tPrev = now;
    chaosStep(dt);
    // Рейтрейс не считаем, пока вкладка не видна: это чистый расход батареи.
    if (field && fieldOn && !document.hidden) field.draw(dt, chaosOf(0.5));
    drawBg(true);
    drawWheel(true);
  };

  if (reduced) {
    phase = "calm"; prog = 0;
    field?.draw(0, 0);
    drawBg(false); drawWheel(false);
  } else {
    raf = requestAnimationFrame(frame);
  }

  return {
    hasField: !!field,
    setField(on: boolean) { fieldOn = on; field?.set(on); },
    setChart(next: Chart | null) {
      chart = next;
      sizeWheel();
      // новая карта всегда собирается на глазах — иначе она просто возникает
      phase = "gather"; phaseT = 0; prog = 1; firstRun = true; GATHER = 3400;
      if (reduced) { phase = "calm"; prog = 0; drawBg(false); drawWheel(false); }
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      field?.destroy();
    },
  };
}
