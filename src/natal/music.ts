import trackUrl from "./planets.mp3";

/* Музыка «Дыхание планет».
 *
 * Файл не трогаем — это исходник из Suno как есть, только без обложки внутри.
 * Страницу он не тяжелит: грузится лишь после нажатия на кнопку и играет
 * потоком, не дожидаясь конца загрузки.
 *
 * Громкость ведём через Web Audio, а не через audio.volume: на iPhone
 * volume только для чтения, и музыка там гремела бы на полную.
 *
 * Трек идёт по кругу без шва: за FADE секунд до конца вторая копия
 * начинает с начала и плавно перекрывает первую. */

const BASE = 0.34;     // трек громкий (−13 LUFS), фону хватает трети
const LIFT = 0.25;     // насколько громче, когда карта рассыпается
const FADE = 7;        // длина перехода на стыке, секунд
const RAMP = 1.2;      // включение и выключение, секунд

type Voice = { el: HTMLAudioElement; gain: GainNode };

export function createMusic(chaos: () => number) {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let voices: Voice[] = [];
  let cur = 0;
  let on = false;
  let crossing = false;
  let timer = 0;

  function setup() {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    voices = [0, 1].map((i) => {
      const el = new Audio(trackUrl);
      // вторая копия нужна только на стыке — пусть не качает файл дважды заранее
      el.preload = i === 0 ? "auto" : "none";
      el.crossOrigin = "anonymous";
      const gain = ctx!.createGain();
      gain.gain.value = 0;
      ctx!.createMediaElementSource(el).connect(gain).connect(master!);
      return { el, gain };
    });
  }

  function tick() {
    if (!ctx || !master || !on) return;
    const t = ctx.currentTime;
    // дыхание вместе с картой: рассыпалась — чуть громче, собралась — тише
    master.gain.setTargetAtTime(BASE * (1 + LIFT * chaos()), t, 0.8);

    const a = voices[cur];
    const left = a.el.duration - a.el.currentTime;
    if (!crossing && isFinite(left) && left < FADE) {
      crossing = true;
      const b = voices[1 - cur];
      b.el.currentTime = 0;
      b.gain.gain.cancelScheduledValues(t);
      b.gain.gain.setValueAtTime(0, t);
      b.gain.gain.linearRampToValueAtTime(1, t + FADE);
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(a.gain.gain.value, t);
      a.gain.gain.linearRampToValueAtTime(0, t + FADE);
      b.el.play().catch(() => {});
      const was = cur;
      cur = 1 - cur;
      window.setTimeout(() => { voices[was].el.pause(); crossing = false; }, FADE * 1000 + 200);
    }
  }

  async function start() {
    setup();
    if (!ctx || !master) return false;
    on = true;
    try { await ctx.resume(); } catch { /* пусть попробует play */ }
    const v = voices[cur];
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(1, ctx.currentTime);
    try { await v.el.play(); } catch { on = false; return false; }
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(BASE * (1 + LIFT * chaos()), t + RAMP);
    window.clearInterval(timer);
    timer = window.setInterval(tick, 250);
    return true;
  }

  function stop() {
    on = false;
    window.clearInterval(timer);
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + RAMP);
    window.setTimeout(() => { if (!on) voices.forEach((v) => v.el.pause()); }, RAMP * 1000 + 100);
  }

  // Свернули вкладку — затихаем; вернулись — продолжаем с того же места.
  let resumeOnShow = false;
  const onVis = () => {
    if (document.hidden) { resumeOnShow = on; if (on) stop(); }
    else if (resumeOnShow) { resumeOnShow = false; void start(); }
  };
  document.addEventListener("visibilitychange", onVis);

  return {
    start, stop,
    get playing() { return on; },
    destroy() {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      voices.forEach((v) => { v.el.pause(); v.el.src = ""; });
      void ctx?.close();
    },
  };
}
