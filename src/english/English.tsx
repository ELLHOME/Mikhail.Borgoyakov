import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import Pairs, { type PairsResult } from "./Pairs";
import "./english.css";

const API = "https://ellhome-bot-api.onrender.com";

type Corr = { wrong: string; right: string; why: string };
type Say = { ru: string; en: string };
/** box — ступень повторения, due — когда показать снова (мс). */
/** t — когда слово меняли в последний раз, del — удалено. Оба нужны для
 *  синхронизации: из двух копий побеждает более свежая, а удалённое слово
 *  остаётся отметкой, иначе другое устройство вернуло бы его обратно. */
type Word = { en: string; ru: string; at?: number; box?: number; due?: number; t?: number; del?: boolean };
type Msg = {
  role: "user" | "tutor";
  text: string;
  hint?: string;
  corrections?: Corr[];
  say?: Say | null;
  words?: Word[];
  suggest?: string[];
  voice?: boolean;
  unclear?: { word: string; tip: string }[];
};

/* Повторение по коробкам Лейтнера: вспомнила — слово уходит на ступень
   дальше и возвращается реже, забыла — снова в начало. Проще FSRS, но для
   первых сотен слов разницы почти нет, а понятно без объяснений. */
const DAY = 86400000;
const STEP = [0, 1, 3, 7, 16, 35].map((d) => d * DAY);
const isDue = (w: Word, now = Date.now()) => (w.due ?? 0) <= now;

const TOPICS: { id: string; label: string }[] = [
  { id: "free", label: "О чём угодно" },
  { id: "me", label: "Рассказать о себе" },
  { id: "cafe", label: "В кафе" },
  { id: "travel", label: "В поездке" },
  { id: "shop", label: "В магазине" },
  { id: "work", label: "Про работу" },
  { id: "doctor", label: "У врача" },
];

const SELF = [
  { id: "zero", label: "Почти с нуля", level: "A1" },
  { id: "school", label: "Школьный, давно забытый", level: "" },
  { id: "ok", label: "Могу объясниться", level: "B1" },
];

const LEVEL_NAME: Record<string, string> = {
  A1: "начальный", A2: "элементарный", B1: "средний", B2: "выше среднего", C1: "продвинутый",
};

/* Хранилище браузера: может не работать в приватном режиме — тогда просто
   живём без памяти, страница от этого не ломается. */
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ничего страшного */ }
}

/* Озвучка. Главный путь — голос модели с сервера: он одинаковый на любом
   устройстве. Голос браузера — только запасной и только если в системе
   правда есть английский голос. Иначе браузер читает «interesting» русским
   голосом — «интерестинг», и такое произношение хуже, чем никакого. */
const audioCache = new Map<string, string>();
let playing: HTMLAudioElement | null = null;

async function speakServer(text: string, slow: boolean): Promise<boolean> {
  const key = `${slow ? 1 : 0}|${text}`;
  let url = audioCache.get(key);
  if (!url) {
    const r = await fetch(`${API}/english/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, slow }),
    });
    if (!r.ok) return false;
    url = URL.createObjectURL(await r.blob());
    audioCache.set(key, url);
  }
  playing?.pause();
  playing = new Audio(url);
  await playing.play();
  return true;
}

function englishVoice(): SpeechSynthesisVoice | undefined {
  try {
    const voices = window.speechSynthesis?.getVoices() || [];
    return voices.find((x) => /^en[-_](US|GB)/i.test(x.lang) && /natural|google|samantha|daniel|aria|jenny|guy/i.test(x.name))
      || voices.find((x) => /^en[-_]/i.test(x.lang));
  } catch {
    return undefined;
  }
}

function speakBrowser(text: string, slow: boolean): boolean {
  const v = englishVoice();
  if (!v) return false;          // русским голосом английский не читаем
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ""));
    u.voice = v; u.lang = v.lang; u.rate = slow ? 0.85 : 1;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

const canSpeak = typeof window !== "undefined" && typeof Audio !== "undefined";

/* Профиль для синхронизации — без регистрации. Номер и ключ создаются в
   браузере; на сервере хранится только хэш ключа. */
type Profile = { id: string; secret: string };
function hex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
function profile(): Profile {
  const p = load<Profile | null>("st-profile", null);
  if (p && /^[a-f0-9]{32}$/.test(p.id) && /^[a-f0-9]{64}$/.test(p.secret)) return p;
  const fresh = { id: hex(16), secret: hex(32) };
  save("st-profile", fresh);
  return fresh;
}
const stamp = (w: Word) => w.t ?? w.at ?? 0;
/** То же правило, что на сервере: из двух копий слова берём более свежую. */
function mergeWords(a: Word[], b: Word[]): Word[] {
  const best = new Map<string, Word>();
  for (const w of [...a, ...b]) {
    const k = w.en.toLowerCase(), cur = best.get(k);
    if (!cur || stamp(w) > stamp(cur) || (stamp(w) === stamp(cur) && w.del && !cur.del)) best.set(k, w);
  }
  return [...best.values()].sort((x, y) => (y.at ?? 0) - (x.at ?? 0));
}

/* Микрофон. Звук берём прямо из микрофона и сами собираем WAV 16 кГц моно:
   этот формат понимает любая модель, в отличие от webm, который одни версии
   принимают, а другие нет. Заодно видно громкость — по ней запись сама
   заканчивается, когда человек замолчал. Нажимать второй раз не нужно. */
type AC = typeof AudioContext;
const AudioCtx: AC | undefined = typeof window !== "undefined"
  ? (window.AudioContext || (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext) : undefined;
const canHear = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!AudioCtx;
const REC_MAX = 30;          // секунд — дольше это уже не реплика
const SILENCE_END = 1300;    // мс тишины после речи — фраза закончена
const NO_SPEECH = 7000;      // мс без единого звука — видимо, не говорят

function toWav(chunks: Float32Array[], rate: number, target = 16000): Blob {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  // понижаем частоту усреднением — для речи этого достаточно
  const ratio = rate / target;
  const n = Math.floor(len / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += all[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (off: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(off + i, t.charCodeAt(i)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, target, true); dv.setUint32(28, target * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

/** Подсвечиваем в фразе человека то, что поправили, и то, что прозвучало
 *  нечётко. Ищем без учёта регистра; перекрытия не допускаем. */
function marks(text: string, bad: string[], fuzzy: string[]) {
  type R = { a: number; b: number; k: "bad" | "fuzzy" };
  const rs: R[] = [];
  const low = text.toLowerCase();
  const add = (needle: string, k: R["k"], word: boolean) => {
    const n = needle.trim().toLowerCase();
    if (!n) return;
    let from = 0;
    while (from <= low.length) {
      const i = low.indexOf(n, from);
      if (i < 0) return;
      const j = i + n.length;
      const edge = !word || ((i === 0 || !/[\w']/.test(low[i - 1])) && (j >= low.length || !/[\w']/.test(low[j])));
      if (edge && !rs.some((r) => i < r.b && j > r.a)) { rs.push({ a: i, b: j, k }); return; }
      from = i + 1;
    }
  };
  bad.forEach((w) => add(w, "bad", false));
  fuzzy.forEach((w) => add(w, "fuzzy", true));
  rs.sort((x, y) => x.a - y.a);
  const out: (string | JSX.Element)[] = [];
  let at = 0;
  rs.forEach((r, i) => {
    if (r.a > at) out.push(text.slice(at, r.a));
    out.push(<mark key={i} className={`st-mk st-mk-${r.k}`}>{text.slice(r.a, r.b)}</mark>);
    at = r.b;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** Фраза целиком с исправлениями — её удобно послушать и повторить. */
function fixed(text: string, corr: Corr[]): string {
  let t = text;
  for (const c of corr) {
    const i = t.toLowerCase().indexOf(c.wrong.toLowerCase());
    if (i >= 0) t = t.slice(0, i) + c.right + t.slice(i + c.wrong.length);
  }
  return t;
}

const Mic = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const Send = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

function bold(text: string) {
  return text.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
    i % 2 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>);
}

export default function English() {
  const [msgs, setMsgs] = useState<Msg[]>(() => load<{ msgs: Msg[] }>("st-chat", { msgs: [] }).msgs || []);
  const [topic, setTopic] = useState<string>(() => load<{ topic: string }>("st-chat", { topic: "free" }).topic || "free");
  const [level, setLevelRaw] = useState<string>(() => load("st-level", ""));
  const [self, setSelfRaw] = useState<string>(() => load("st-self", "school"));
  const levelT = useRef<number>(load("st-level-t", 0));
  const selfT = useRef<number>(load("st-self-t", 0));
  const setLevel = (v: string) => { setLevelRaw(v); levelT.current = Date.now(); save("st-level-t", levelT.current); };
  const setSelf = (v: string) => { setSelfRaw(v); selfT.current = Date.now(); save("st-self-t", selfT.current); };
  // allWords — вместе с отметками удаления; words — то, что видит человек
  const [allWords, setAllWords] = useState<Word[]>(() => load("st-words", []));
  const words = allWords.filter((w) => !w.del);
  const [sync, setSync] = useState<"idle" | "busy" | "ok" | "off">("idle");
  const [linkCode, setLinkCode] = useState("");
  const [linkIn, setLinkIn] = useState<string | null>(null);   // null — поле ввода кода скрыто
  const [linkMsg, setLinkMsg] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [showWords, setShowWords] = useState(false);
  const [openHint, setOpenHint] = useState<Record<number, boolean>>({});
  // В разговоре ли мы — отдельно от числа сообщений: если сервер не ответил
  // на самое первое приветствие, человек должен увидеть ошибку и «Повторить»,
  // а не молча вернуться на стартовый экран.
  const [inChat, setInChat] = useState<boolean>(() => msgs.length > 0);
  const [speaking, setSpeaking] = useState("");
  const [review, setReview] = useState<string[] | null>(null);   // очередь слов на повторение
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [pairs, setPairs] = useState(0);     // 0 — игры нет, иначе номер партии (ключ для перезапуска)
  const [rec, setRec] = useState<"idle" | "rec" | "busy">("idle");
  const [recSec, setRecSec] = useState(0);
  const [vol, setVol] = useState(0);                 // громкость 0…1 — для живой полоски
  const recRef = useRef<{ stop: (send: boolean) => void } | null>(null);
  // что прозвучало нечётко в последней надиктовке — уйдёт вместе с фразой,
  // когда человек нажмёт «отправить»
  const voiceRef = useRef<{ unclear: NonNullable<Msg["unclear"]> } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { save("st-chat", { topic, msgs }); }, [topic, msgs]);
  useEffect(() => { save("st-words", allWords); }, [allWords]);
  useEffect(() => { save("st-level", level); }, [level]);
  useEffect(() => { save("st-self", self); }, [self]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  useEffect(() => {
    // голоса в Chrome подгружаются не сразу — дёргаем список заранее
    try { window.speechSynthesis?.getVoices(); } catch { /* */ }
    track("page_view", { page: "english", w: window.innerWidth || 0 }, "page_view");
  }, []);

  async function say(text: string, slow: boolean) {
    if (speaking) return;
    setSpeaking(text); setNote("");
    try {
      const ok = await speakServer(text, slow).catch(() => false);
      if (!ok && !speakBrowser(text, slow)) {
        setNote("Озвучка сейчас недоступна. Попробуйте через минуту.");
      }
    } finally {
      setSpeaking("");
    }
  }

  /* Синхронизация: при открытии, через полторы секунды после любой правки
     и при возвращении на вкладку. Сервер сливает свою копию с нашей и
     отдаёт общую; её ещё раз сливаем с тем, что успело измениться, пока
     шёл запрос, — чтобы не потерять нажатие, сделанное в эту секунду. */
  const syncing = useRef(false);
  const again = useRef(false);
  const latest = useRef({ allWords, level, self });
  latest.current = { allWords, level, self };

  async function doSync() {
    if (syncing.current) { again.current = true; return; }
    syncing.current = true; setSync("busy");
    try {
      const p = profile();
      const cur = latest.current;
      const r = await fetch(`${API}/english/sync`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, words: cur.allWords, level: cur.level, level_t: levelT.current,
                               self: cur.self, self_t: selfT.current }),
      });
      const d = await r.json();
      if (!d.ok) { setSync("off"); return; }
      setAllWords((ws) => mergeWords(d.words || [], ws));
      if ((d.level_t || 0) > levelT.current) { setLevelRaw(d.level || ""); levelT.current = d.level_t; save("st-level-t", d.level_t); }
      if ((d.self_t || 0) > selfT.current && d.self) { setSelfRaw(d.self); selfT.current = d.self_t; save("st-self-t", d.self_t); }
      setSync("ok");
    } catch {
      setSync("off");
    } finally {
      syncing.current = false;
      if (again.current) { again.current = false; window.setTimeout(doSync, 300); }
    }
  }

  // Отпечаток того, что стоит отправить. Без него каждый ответ сервера
  // (он тоже меняет allWords) запускал бы новую синхронизацию по кругу.
  const fp = allWords.map((w) => `${w.en}:${stamp(w)}:${w.del ? 1 : 0}`).join("|")
    + `#${level}:${levelT.current}#${self}:${selfT.current}`;
  const sentFp = useRef("");
  useEffect(() => {
    const t = window.setTimeout(() => { if (fp !== sentFp.current) { sentFp.current = fp; doSync(); } },
                                sentFp.current ? 1500 : 200);
    return () => window.clearTimeout(t);
  }, [fp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onVis = () => { if (!document.hidden) doSync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function makeCode() {
    setLinkMsg(""); setLinkCode("");
    try {
      await doSync();
      const r = await fetch(`${API}/english/link/new`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile()) });
      const d = await r.json();
      if (d.code) setLinkCode(d.code);
      else setLinkMsg(d.error || "Не получилось. Попробуйте ещё раз.");
    } catch { setLinkMsg("Сервер не ответил. Попробуйте ещё раз через минуту."); }
  }

  async function enterCode() {
    const code = (linkIn || "").trim();
    if (!code) return;
    setLinkMsg("");
    try {
      const r = await fetch(`${API}/english/link/use`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const d = await r.json();
      if (d.id && d.secret) {
        // Слова этого устройства не пропадут: при следующей синхронизации
        // они сольются со словами профиля, к которому мы подключились.
        save("st-profile", { id: d.id, secret: d.secret });
        setLinkIn(null); setLinkMsg("Готово — устройства связаны. Слова объединятся через пару секунд.");
        sentFp.current = ""; doSync();
      } else setLinkMsg(d.error || "Код не подошёл.");
    } catch { setLinkMsg("Сервер не ответил. Попробуйте ещё раз через минуту."); }
  }

  const beginner = level === "A1" || level === "A2" || (!level && self !== "ok");
  const known = new Set(words.map((w) => w.en.toLowerCase()));

  async function call(history: Msg[], lvl: string, tp: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API}/english/talk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: history.slice(-14).map((m) => ({ role: m.role, text: m.text })),
          level: lvl, topic: tp,
        }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setMsgs((prev) => {
        const next = prev.slice();
        // исправления и «как сказать» относятся к последней реплике человека
        const last = next.length - 1;
        if (last >= 0 && next[last].role === "user") {
          next[last] = { ...next[last], corrections: d.corrections || [], say: d.say || null };
        }
        next.push({ role: "tutor", text: d.reply, hint: d.hint_ru, words: d.words || [],
                    suggest: d.suggest || [] });
        return next;
      });
      if (d.level && d.level !== lvl) {
        setLevel(d.level);
        setNote(`Похоже, ваш уровень — ${d.level}, ${LEVEL_NAME[d.level] || ""}. Дальше говорю под него.`);
      }
    } catch {
      setError("Сервер не ответил. Он мог уснуть — попробуйте ещё раз через полминуты.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function start(tp: string) {
    const lvl = SELF.find((s) => s.id === self)?.level ?? "";
    const startLevel = level || lvl;
    setTopic(tp); setMsgs([]); setNote(""); setOpenHint({}); setInChat(true);
    if (!level && lvl) setLevel(lvl);
    track("english_start", { topic: tp, self });
    call([], startLevel, tp);
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy || rec !== "idle") return;
    // Замечания о произношении берём только про слова, которые остались
    // в тексте: если человек слово исправил, и замечание больше не к месту.
    const v = voiceRef.current;
    voiceRef.current = null;
    const low = t.toLowerCase();
    const unclear = (v?.unclear || []).filter((u) => low.includes(u.word.toLowerCase()));
    const next: Msg[] = [...msgs, v ? { role: "user", text: t, voice: true, unclear } : { role: "user", text: t }];
    setMsgs(next);
    setText("");
    track("english_msg", { n: next.filter((m) => m.role === "user").length });
    call(next, level, topic);
  }

  function retry() {
    if (busy) return;
    call(msgs, level, topic);
  }

  function addWord(w: Word) {
    if (known.has(w.en.toLowerCase())) return;
    const now = Date.now(), k = w.en.toLowerCase();
    setAllWords((ws) => [{ en: w.en, ru: w.ru, at: now, box: 0, due: 0, t: now },
                         ...ws.filter((x) => x.en.toLowerCase() !== k)]);
  }

  const dueWords = words.filter((w) => isDue(w));

  function startReview() {
    // по 15 за раз: больше — устаёшь и начинаешь угадывать
    setReview(dueWords.slice(0, 15).map((w) => w.en));
    setFlipped(false); setDone(0); setShowWords(false);
  }

  function grade(remember: boolean) {
    if (!review?.length) return;
    const en = review[0];
    setAllWords((ws) => ws.map((w) => {
      if (w.en !== en || w.del) return w;
      const box = remember ? Math.min((w.box ?? 0) + 1, STEP.length - 1) : 0;
      const now = Date.now();
      return { ...w, box, due: now + (remember ? STEP[box] : 0), t: now };
    }));
    // забытое слово возвращается в конец этой же серии, чтобы вспомнить сегодня
    setReview((q) => (q ? (remember ? q.slice(1) : [...q.slice(1), en]) : q));
    if (remember) setDone((n) => n + 1);
    setFlipped(false);
  }

  // Выделение ставим после того, как React положил текст в поле: раньше
  // браузер сбрасывает его на конец, и напечатанное уходит мимо многоточия.
  const pendingSel = useRef<[number, number] | null>(null);
  useEffect(() => {
    const el = inputRef.current, sel = pendingSel.current;
    if (!el || !sel) return;
    pendingSel.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
  }, [text]);

  async function startRec() {
    if (rec !== "idle" || busy || !AudioCtx) return;
    setError(""); setNote("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера — значок слева от адреса сайта.");
      return;
    }
    const ctx = new AudioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    const t0 = performance.now();
    let floor = 0, heard = false, lastVoice = 0, closed = false;
    let calib: number[] = [];

    const finish = async (sendIt: boolean) => {
      if (closed) return;
      closed = true;
      recRef.current = null;
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate;
      ctx.close().catch(() => {});
      setVol(0);
      if (!sendIt) { setRec("idle"); setRecSec(0); return; }
      if (!heard) {
        setRec("idle"); setRecSec(0);
        setNote("Не слышу вас. Нажмите микрофон и скажите фразу погромче.");
        return;
      }
      setRec("busy");
      try {
        const r = await fetch(`${API}/english/hear`, {
          method: "POST", headers: { "Content-Type": "audio/wav" }, body: toWav(chunks, rate),
        });
        const d = await r.json();
        if (d.error) setError(d.error + (d.detail ? `\n(${d.detail})` : ""));
        else if (d.text) {
          track("english_voice", { sec: Math.round((performance.now() - t0) / 1000) });
          // Надиктованное встаёт в поле, а не уходит само: распознавание
          // ошибается, и человек должен успеть поправить слово клавиатурой.
          const prev = voiceRef.current?.unclear || [];
          voiceRef.current = { unclear: [...prev, ...(d.unclear || [])] };
          setText((t) => (t.trim() ? t.trim() + " " : "") + d.text);
          requestAnimationFrame(() => {
            const el = inputRef.current;
            if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
          });
        }
      } catch {
        setError("Сервер не ответил. Попробуйте ещё раз через полминуты.");
      } finally {
        setRec("idle"); setRecSec(0);
      }
    };

    proc.onaudioprocess = (ev) => {
      if (closed) return;
      const x = ev.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(x));
      let sum = 0;
      for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
      const rms = Math.sqrt(sum / x.length);
      const now = performance.now() - t0;
      // первые 300 мс — слушаем, какой в комнате шум
      if (now < 300) { calib.push(rms); floor = calib.reduce((a, b) => a + b, 0) / calib.length; return; }
      const voiced = rms > Math.max(0.012, floor * 3);
      setVol(Math.min(1, rms / Math.max(0.05, floor * 8)));
      if (voiced) { heard = true; lastVoice = now; }
      setRecSec(Math.floor(now / 1000));
      if (heard && now - lastVoice > SILENCE_END) finish(true);
      else if (!heard && now > NO_SPEECH) finish(true);
      else if (now > REC_MAX * 1000) finish(true);
    };
    src.connect(proc);
    proc.connect(ctx.destination);           // без этого часть браузеров не зовёт onaudioprocess
    recRef.current = { stop: finish };
    setRec("rec"); setRecSec(0);
  }

  function stopRec(sendIt = true) {
    recRef.current?.stop(sendIt);
  }

  // ушли со страницы посреди записи — микрофон отпускаем
  useEffect(() => () => { recRef.current?.stop(false); }, []);

  function finishPairs(res: PairsResult) {
    const now = Date.now();
    const clean = new Set(res.clean.map((x) => x.toLowerCase()));
    const missed = new Map(res.missed.map((w) => [w.en.toLowerCase(), w]));
    setAllWords((ws) => {
      // свои слова: без ошибки и пора повторять — ступень вверх; с ошибкой — в начало
      const next = ws.map((w) => {
        if (w.del) return w;
        const k = w.en.toLowerCase();
        if (missed.has(k)) return { ...w, box: 0, due: now, t: now };
        if (clean.has(k) && isDue(w, now)) {
          const box = Math.min((w.box ?? 0) + 1, STEP.length - 1);
          return { ...w, box, due: now + STEP[box], t: now };
        }
        return w;
      });
      // чужие слова, на которых ошиблась, — в колоду, чтобы вернулись
      // (удалённое раньше слово тоже возвращается: раз ошиблась, оно нужно)
      const have = new Set(next.filter((w) => !w.del).map((w) => w.en.toLowerCase()));
      const add = [...missed.values()].filter((w) => !have.has(w.en.toLowerCase()))
        .map((w) => ({ en: w.en, ru: w.ru, at: now, box: 0, due: now, t: now }));
      const addK = new Set(add.map((w) => w.en.toLowerCase()));
      return [...add, ...next.filter((w) => !addK.has(w.en.toLowerCase()))];
    });
    track("english_pairs", { clean: res.clean.length, missed: res.missed.length });
  }

  function pickSuggest(t: string) {
    // заготовку «My name is ...» надо дописать — выделяем многоточие,
    // чтобы первая же буква его заменила
    const at = t.indexOf("...");
    pendingSel.current = at >= 0 ? [at, at + 3] : [t.length, t.length];
    if (t === text) {           // тот же текст — эффект не сработает, ставим сами
      const el = inputRef.current;
      el?.focus(); el?.setSelectionRange(pendingSel.current[0], pendingSel.current[1]);
      pendingSel.current = null;
    }
    setText(t);
  }
  function dropWord(en: string) {
    const now = Date.now();
    setAllWords((ws) => ws.map((w) => (w.en === en ? { ...w, del: true, t: now } : w)));
  }

  function reset() {
    setMsgs([]); setNote(""); setError(""); setOpenHint({}); setInChat(false);
  }

  const started = inChat;
  const lastIsUser = msgs.length > 0 && msgs[msgs.length - 1].role === "user";

  return (
    <div className="st">
      <header className="st-top">
        <a className="st-home" href="../">← ELLHOME</a>
        <div className="st-brand">
          <b>Small Talk</b>
          {level && <span className="st-level" title="Оценка по разговору">{level}</span>}
        </div>
        <button type="button" className="st-wordsbtn" onClick={() => setShowWords((v) => !v)}
                aria-expanded={showWords}>
          Мои слова <span>{words.length}</span>
        </button>
      </header>

      {showWords && (
        <section className="st-words" aria-label="Мои слова">
          {words.length > 0 && (
            <div className="st-reviewbar">
              <button type="button" onClick={() => { setPairs(1); setShowWords(false); }}>Пары слов</button>
              {dueWords.length
                ? <button type="button" onClick={startReview}>Повторить слова · {Math.min(dueWords.length, 15)}</button>
                : <span className="st-muted st-small">Всё повторено. Следующие слова вернутся позже.</span>}
            </div>
          )}
          {words.length ? (
            <ul>
              {words.map((w) => (
                <li key={w.en}>
                  <button type="button" className="st-say" disabled={!canSpeak}
                          onClick={() => say(w.en, beginner)} aria-label={`Послушать ${w.en}`}>▶</button>
                  <b>{w.en}</b><span>{w.ru}</span>
                  <button type="button" className="st-x" onClick={() => dropWord(w.en)}
                          aria-label={`Убрать ${w.en}`}>×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="st-muted">Пока пусто. Новые слова появляются под репликами собеседника —
              нажмите «+», и слово сохранится здесь.</p>
          )}
          <p className="st-muted st-small">Слово, которое вы вспомнили, вернётся через день,
            потом через три, неделю и дальше. Забытое — сразу.</p>

          <div className="st-sync">
            <p className="st-syncstate" data-s={sync}>
              {sync === "ok" ? "Слова сохранены на сервере"
                : sync === "busy" ? "Сохраняю…"
                : sync === "off" ? "Нет связи с сервером — слова сохранены на этом устройстве"
                : "Слова сохраняются автоматически"}
            </p>
            {linkCode ? (
              <div className="st-code">
                <p>На другом устройстве откройте Small Talk → «Мои слова» → «У меня есть код» и введите:</p>
                <b>{linkCode.slice(0, 3)} {linkCode.slice(3)}</b>
                <p className="st-muted st-small">Код действует 15 минут и срабатывает один раз.</p>
              </div>
            ) : linkIn !== null ? (
              <form className="st-codein" onSubmit={(e) => { e.preventDefault(); enterCode(); }}>
                <input value={linkIn} onChange={(e) => setLinkIn(e.target.value.toUpperCase())} maxLength={8}
                       placeholder="Код с другого устройства" autoComplete="off" autoCapitalize="characters"
                       aria-label="Код с другого устройства" />
                <button type="submit" disabled={linkIn.replace(/[^A-Za-z0-9]/g, "").length !== 6}>Подключить</button>
                <button type="button" className="st-back" onClick={() => setLinkIn(null)}>Отмена</button>
              </form>
            ) : (
              <div className="st-linkbtns">
                <button type="button" onClick={makeCode}>Подключить другое устройство</button>
                <button type="button" onClick={() => { setLinkIn(""); setLinkMsg(""); }}>У меня есть код</button>
              </div>
            )}
            {linkMsg && <p className="st-muted st-small">{linkMsg}</p>}
          </div>
        </section>
      )}

      <main className="st-main">
        {pairs ? (
          <Pairs key={pairs} deck={words} level={level || (self === "ok" ? "B1" : "A1")}
                 canSpeak={canSpeak} say={say} onFinish={finishPairs}
                 onClose={() => setPairs(0)} onAgain={() => setPairs((n) => n + 1)} />
        ) : review ? (
          <section className="st-review" aria-live="polite">
            {review.length ? (() => {
              const w = words.find((x) => x.en === review[0]);
              if (!w) return null;
              return (
                <>
                  <p className="st-muted st-small">Осталось {review.length} · вспомнили {done}</p>
                  <button type="button" className="st-card" data-flipped={flipped ? "1" : "0"}
                          onClick={() => { if (!flipped) { setFlipped(true); say(w.en, beginner); } }}>
                    <b>{w.en}</b>
                    {flipped ? <span>{w.ru}</span> : <i>нажмите, чтобы увидеть перевод</i>}
                  </button>
                  {flipped ? (
                    <div className="st-grade">
                      <button type="button" className="st-no" onClick={() => grade(false)}>Не помню</button>
                      <button type="button" className="st-yes" onClick={() => grade(true)}>Помню</button>
                    </div>
                  ) : (
                    canSpeak && <button type="button" className="st-cardsay" onClick={() => say(w.en, beginner)}>▶ послушать</button>
                  )}
                </>
              );
            })() : (
              <div className="st-reviewdone">
                <h2>Готово</h2>
                <p>Вспомнили {done} {done === 1 ? "слово" : done >= 2 && done <= 4 ? "слова" : "слов"}.
                  Забытые вернутся в следующий раз.</p>
              </div>
            )}
            <button type="button" className="st-back" onClick={() => setReview(null)}>
              {review.length ? "Закончить" : "Вернуться"}</button>
          </section>
        ) : !started ? (
          <section className="st-intro">
            <h1>Поговорим <br />по-английски</h1>
            <p className="st-lead">Спокойно, без оценок. Собеседник подстроится под ваш уровень,
              а под каждым его вопросом будут готовые ответы.</p>

            <h2>Как у вас с английским?</h2>
            <div className="st-chips">
              {SELF.map((s) => (
                <button key={s.id} type="button" data-on={self === s.id ? "1" : "0"}
                        onClick={() => { setSelf(s.id); if (!msgs.length) setLevel(s.level); }}>
                  {s.label}
                </button>
              ))}
            </div>
            {level && <p className="st-muted st-small">Уровень по прошлым разговорам: {level},{" "}
              {LEVEL_NAME[level]}. Он уточняется сам.</p>}

            <h2>О чём поговорим?</h2>
            <div className="st-topics">
              {TOPICS.map((t) => (
                <button key={t.id} type="button" onClick={() => start(t.id)}>{t.label}</button>
              ))}
            </div>
            <h2>Упражнения</h2>
            <div className="st-drills">
              <button type="button" onClick={() => { setPairs(1); setShowWords(false); }}>
                <b>Пары слов</b>
                <span>Соедините английское слово с переводом. Пять минут, без клавиатуры.</span>
              </button>
              {words.length > 0 && (
                <button type="button" disabled={!dueWords.length} onClick={startReview}>
                  <b>Карточки</b>
                  <span>{dueWords.length ? `Пора повторить: ${Math.min(dueWords.length, 15)}` : "Всё повторено — загляните завтра"}</span>
                </button>
              )}
            </div>

            <h2>Как это устроено</h2>
            <ul className="st-how">
              <li><b>Голосом или текстом</b>Нажмите микрофон и говорите. Фраза появится в поле — поправьте, если нужно, и отправьте.</li>
              <li><b>Можно по-русски</b>Не знаете, как сказать, — напишите по-русски, он подскажет.</li>
              <li><b>Слова не теряются</b>Нажмите «+» под новым словом — оно вернётся в «Парах» и карточках.</li>
            </ul>

            <p className="st-credit">Уровни слов — по{" "}
              <a href="https://github.com/openlanguageprofiles/olp-en-cefrj" target="_blank" rel="noreferrer">
                CEFR-J Wordlist</a> (Tono Laboratory, TUFS).</p>
          </section>
        ) : (
          <section className="st-chat" aria-live="polite">
            <div className="st-chatbar">
              <span>{TOPICS.find((t) => t.id === topic)?.label}</span>
              <button type="button" onClick={reset}>Новый разговор</button>
            </div>

            {msgs.map((m, i) => m.role === "tutor" ? (
              <div className="st-msg st-tutor" key={i}>
                <p>{bold(m.text)}</p>
                <div className="st-tools">
                  {canSpeak && <button type="button" onClick={() => say(m.text, beginner)} disabled={!!speaking}>
                    {speaking === m.text ? "… загружаю" : "▶ послушать"}</button>}
                  {m.hint && (beginner || openHint[i]
                    ? null
                    : <button type="button" onClick={() => setOpenHint((o) => ({ ...o, [i]: true }))}>перевод</button>)}
                </div>
                {m.hint && (beginner || openHint[i]) && <p className="st-hint">{m.hint}</p>}
                {!!m.words?.length && (
                  <div className="st-newwords">
                    {m.words.map((w) => {
                      const have = known.has(w.en.toLowerCase());
                      return (
                        <button key={w.en} type="button" data-on={have ? "1" : "0"}
                                onClick={() => addWord(w)} disabled={have}
                                title={have ? "Уже в ваших словах" : "Добавить в мои слова"}>
                          {have ? "✓" : "+"} <b>{w.en}</b> — {w.ru}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="st-msg st-user" key={i}>
                <p>
                  {m.voice && <span className="st-voiced" aria-label="Сказано голосом"><Mic /></span>}
                  {marks(m.text, (m.corrections || []).map((c) => c.wrong), (m.unclear || []).map((u) => u.word))}
                </p>
                {!!m.corrections?.length && (
                  <div className="st-fix">
                    <p className="st-fixed">
                      <span>Правильно:</span> <b>{fixed(m.text, m.corrections)}</b>
                      {canSpeak && <button type="button" onClick={() => say(fixed(m.text, m.corrections!), true)}
                                           aria-label="Послушать правильный вариант">▶</button>}
                    </p>
                    <ul>
                      {m.corrections.map((c, j) => (
                        <li key={j}><s>{c.wrong}</s> → <b>{c.right}</b>{c.why && <span> — {c.why}</span>}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!m.unclear?.length && (
                  <ul className="st-unclear">
                    {m.unclear.map((u) => (
                      <li key={u.word}>
                        <b>{u.word}</b> прозвучало нечётко: {u.tip}
                        {canSpeak && <button type="button" onClick={() => say(u.word, true)}
                                             aria-label={`Как звучит ${u.word}`}>▶</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {m.say && (
                  <p className="st-sayit">
                    По-английски: <b>{m.say.en}</b>
                    {canSpeak && <button type="button" onClick={() => say(m.say!.en, true)}
                                         aria-label="Послушать">▶</button>}
                  </p>
                )}
              </div>
            ))}

            {!busy && (() => {
              const last = msgs[msgs.length - 1];
              if (!last || last.role !== "tutor" || !last.suggest?.length) return null;
              return (
                <div className="st-suggest">
                  <p>Можно ответить так — нажмите и поправьте под себя:</p>
                  <div>
                    {last.suggest.map((t) => (
                      <button key={t} type="button" onClick={() => pickSuggest(t)}>{t}</button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {busy && <div className="st-msg st-tutor st-typing" aria-label="Собеседник пишет"><i /><i /><i /></div>}
            {note && !busy && <p className="st-note">{note}</p>}
            {error && (
              <p className="st-error">{error}{" "}
                {(lastIsUser || !msgs.length) && <button type="button" onClick={retry}>Повторить</button>}
              </p>
            )}
            <div ref={endRef} className="st-end" />
          </section>
        )}
      </main>

      {started && !review && !pairs && (
        <form className="st-input" onSubmit={send} data-rec={rec}>
          {canHear && (
            <button type="button" className="st-mic" data-rec={rec} disabled={rec === "busy" || busy}
                    onClick={() => (rec === "rec" ? stopRec(true) : startRec())}
                    aria-label={rec === "rec" ? "Готово" : "Сказать голосом"}
                    title={rec === "rec" ? "Готово — можно не ждать" : "Сказать голосом"}>
              {rec === "busy" ? <i className="st-spin" /> : <Mic />}
            </button>
          )}
          {rec === "rec" ? (
            <div className="st-recbar" aria-live="polite">
              <span className="st-wave" aria-hidden="true">
                {[0.55, 0.85, 1, 0.8, 0.5].map((k, j) => (
                  <i key={j} style={{ transform: `scaleY(${0.18 + Math.min(1, vol * k * 1.4) * 0.82})` }} />
                ))}
              </span>
              <span>Слушаю…</span>
              <b>0:{String(recSec).padStart(2, "0")}</b>
              <em>остановлюсь сам, когда вы замолчите — текст появится в поле</em>
            </div>
          ) : (
            <textarea ref={inputRef} value={text} rows={1} maxLength={600}
                      placeholder={rec === "busy" ? "Слушаю запись…"
                        : beginner ? "Скажите или напишите — можно по-русски" : "Say it or type it…"}
                      onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) voiceRef.current = null; }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                      }} />
          )}
          <button type="submit" className="st-send" disabled={busy || !text.trim() || rec !== "idle"}
                  aria-label="Отправить"><Send /></button>
        </form>
      )}
    </div>
  );
}
