import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import "./english.css";

const API = "https://ellhome-bot-api.onrender.com";

type Corr = { wrong: string; right: string; why: string };
type Say = { ru: string; en: string };
type Word = { en: string; ru: string; at?: number };
type Msg = {
  role: "user" | "tutor";
  text: string;
  hint?: string;
  corrections?: Corr[];
  say?: Say | null;
  words?: Word[];
};

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

/** Голос браузера: бесплатно и без сервера. Качество зависит от системы,
 *  но для коротких реплик его хватает. */
function speak(text: string, slow: boolean) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const v = voices.find((x) => /^en[-_](US|GB)/i.test(x.lang) && /natural|google|samantha|daniel/i.test(x.name))
      || voices.find((x) => /^en[-_]/i.test(x.lang));
    if (v) u.voice = v;
    u.lang = v?.lang || "en-US";
    u.rate = slow ? 0.85 : 1;
    synth.speak(u);
  } catch { /* озвучка — приятное дополнение, не обязательство */ }
}
const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

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
        next.push({ role: "tutor", text: d.reply, hint: d.hint_ru, words: d.words || [] });
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
    setWords((ws) => [{ ...w, at: Date.now() }, ...ws]);
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
          {words.length ? (
            <ul>
              {words.map((w) => (
                <li key={w.en}>
                  <button type="button" className="st-say" disabled={!canSpeak}
                          onClick={() => speak(w.en, beginner)} aria-label={`Послушать ${w.en}`}>▶</button>
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
          <p className="st-muted st-small">Скоро здесь будет повторение по карточкам: слово
            всплывает ровно тогда, когда вы начинаете его забывать.</p>
        </section>
      )}

      <main className="st-main">
        {!started ? (
          <section className="st-intro">
            <h1>Поговорим по-английски</h1>
            <p className="st-lead">Собеседник подстроится под ваш уровень, поправит ошибки
              и подскажет по-русски. Не знаете, как сказать, — пишите по-русски, он покажет.</p>

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
                  {canSpeak && <button type="button" onClick={() => speak(m.text, beginner)}>▶ послушать</button>}
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
                    {canSpeak && <button type="button" onClick={() => speak(m.say!.en, true)}
                                         aria-label="Послушать">▶</button>}
                  </p>
                )}
              </div>
            ))}

            {busy && <div className="st-msg st-tutor st-typing" aria-label="Собеседник пишет"><i /><i /><i /></div>}
            {note && !busy && <p className="st-note">{note}</p>}
            {error && (
              <p className="st-error">{error}{" "}
                {(lastIsUser || !msgs.length) && <button type="button" onClick={retry}>Повторить</button>}
              </p>
            )}
            <div ref={endRef} />
          </section>
        )}
      </main>

      {started && (
        <form className="st-input" onSubmit={send}>
          <textarea ref={inputRef} value={text} rows={1} maxLength={600}
                    placeholder={beginner ? "Пишите по-английски или по-русски…" : "Type your answer…"}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                    }} />
          <button type="submit" disabled={busy || !text.trim()}>Отправить</button>
        </form>
      )}
    </div>
  );
}
