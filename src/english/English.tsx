import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import Pairs, { type PairsResult } from "./Pairs";
import "./english.css";

const API = "https://ellhome-bot-api.onrender.com";

type Corr = { wrong: string; right: string; why: string };
type Say = { ru: string; en: string };
/** box — ступень повторения, due — когда показать снова (мс). */
type Word = { en: string; ru: string; at?: number; box?: number; due?: number };
type Msg = {
  role: "user" | "tutor";
  text: string;
  hint?: string;
  corrections?: Corr[];
  say?: Say | null;
  words?: Word[];
  suggest?: string[];
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

/* Микрофон. Записываем в том формате, который браузер умеет сам: Chrome и
   Android — webm/opus, Safari и iPhone — mp4/aac. Сервер отдаёт запись модели
   как есть, она понимает оба. */
const canHear = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  && typeof MediaRecorder !== "undefined";
const REC_MAX = 30;
function recMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* */ }
  }
  return "";
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
  const [level, setLevel] = useState<string>(() => load("st-level", ""));
  const [self, setSelf] = useState<string>(() => load("st-self", "school"));
  const [words, setWords] = useState<Word[]>(() => load("st-words", []));
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
  const secRef = useRef(0);
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; timer: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { save("st-chat", { topic, msgs }); }, [topic, msgs]);
  useEffect(() => { save("st-words", words); }, [words]);
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
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: t }];
    setMsgs(next); setText("");
    track("english_msg", { n: next.filter((m) => m.role === "user").length });
    call(next, level, topic);
  }

  function retry() {
    if (busy) return;
    call(msgs, level, topic);
  }

  function addWord(w: Word) {
    if (known.has(w.en.toLowerCase())) return;
    setWords((ws) => [{ en: w.en, ru: w.ru, at: Date.now(), box: 0, due: 0 }, ...ws]);
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
    setWords((ws) => ws.map((w) => {
      if (w.en !== en) return w;
      const box = remember ? Math.min((w.box ?? 0) + 1, STEP.length - 1) : 0;
      return { ...w, box, due: Date.now() + (remember ? STEP[box] : 0) };
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
    if (rec !== "idle" || busy) return;
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера — значок слева от адреса сайта.");
      return;
    }
    const mime = recMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: (mr.mimeType || mime || "audio/webm").split(";")[0] });
      setRec("busy");
      try {
        const r = await fetch(`${API}/english/hear`, {
          method: "POST", headers: { "Content-Type": blob.type }, body: blob,
        });
        const d = await r.json();
        if (d.error) setError(d.error);
        else if (d.text) {
          // не отправляем сами: человек видит, как его услышали, — это уже
          // проверка произношения — и может поправить перед отправкой
          setText((t) => (t.trim() ? t.trim() + " " : "") + d.text);
          requestAnimationFrame(() => inputRef.current?.focus());
          track("english_voice", { sec: Math.min(secRef.current, REC_MAX) });
        }
      } catch {
        setError("Сервер не ответил. Попробуйте ещё раз через полминуты.");
      } finally {
        setRec("idle"); setRecSec(0);
      }
    };
    mr.start();
    setRec("rec"); setRecSec(0);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000);
      setRecSec(sec); secRef.current = sec;
      if (sec >= REC_MAX) stopRec();
    }, 250);
    recRef.current = { mr, stream, timer };
  }

  function stopRec() {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    window.clearInterval(r.timer);
    if (r.mr.state !== "inactive") r.mr.stop();
  }

  // ушли со страницы посреди записи — микрофон отпускаем
  useEffect(() => () => {
    const r = recRef.current;
    if (r) { window.clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); }
  }, []);

  function finishPairs(res: PairsResult) {
    const now = Date.now();
    const clean = new Set(res.clean.map((x) => x.toLowerCase()));
    const missed = new Map(res.missed.map((w) => [w.en.toLowerCase(), w]));
    setWords((ws) => {
      // свои слова: без ошибки и пора повторять — ступень вверх; с ошибкой — в начало
      const next = ws.map((w) => {
        const k = w.en.toLowerCase();
        if (missed.has(k)) return { ...w, box: 0, due: now };
        if (clean.has(k) && isDue(w, now)) {
          const box = Math.min((w.box ?? 0) + 1, STEP.length - 1);
          return { ...w, box, due: now + STEP[box] };
        }
        return w;
      });
      // чужие слова, на которых ошиблась, — в колоду, чтобы вернулись
      const have = new Set(next.map((w) => w.en.toLowerCase()));
      const add = [...missed.values()].filter((w) => !have.has(w.en.toLowerCase()))
        .map((w) => ({ en: w.en, ru: w.ru, at: now, box: 0, due: now }));
      return [...add, ...next];
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
    setWords((ws) => ws.filter((w) => w.en !== en));
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
              <li><b>Голосом или текстом</b>Нажмите микрофон и скажите фразу — она появится в поле.</li>
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
                <p>{m.text}</p>
                {!!m.corrections?.length && (
                  <ul className="st-fix">
                    {m.corrections.map((c, j) => (
                      <li key={j}>
                        <s>{c.wrong}</s> → <b>{c.right}</b>
                        {c.why && <span>{c.why}</span>}
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
                    onClick={() => (rec === "rec" ? stopRec() : startRec())}
                    aria-label={rec === "rec" ? "Закончить запись" : "Сказать голосом"}
                    title={rec === "rec" ? "Нажмите, чтобы закончить" : "Сказать голосом"}>
              {rec === "busy" ? <i className="st-spin" /> : <Mic />}
            </button>
          )}
          {rec === "rec" ? (
            <div className="st-recbar" aria-live="polite">
              <span className="st-recdot" /> Говорите… <b>0:{String(recSec).padStart(2, "0")}</b>
              <em>нажмите на микрофон, когда закончите</em>
            </div>
          ) : (
            <textarea ref={inputRef} value={text} rows={1} maxLength={600}
                      placeholder={rec === "busy" ? "Слушаю запись…"
                        : beginner ? "Скажите или напишите — можно по-русски" : "Say it or type it…"}
                      onChange={(e) => setText(e.target.value)}
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
