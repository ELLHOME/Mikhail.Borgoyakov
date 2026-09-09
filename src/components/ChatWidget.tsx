import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import BorderBeam from "./BorderBeam";

const API_URL = "https://ellhome-bot-api.onrender.com/chat";
const STORE_KEY = "ellhome_chat";
const KEEP = 40; // сколько последних сообщений храним

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "consult" | "lab" | "guide";

function loadSaved(): Msg[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-KEEP);
    }
  } catch { /* storage unavailable */ }
  return [];
}

const STR = {
  ru: {
    launch: "Спросить ИИ",
    title: "AI-консультант ELLHOME",
    subtitle: "Обычно отвечает за пару секунд",
    greeting:
      "Здравствуйте! Я AI-консультант ELLHOME. Расскажу об услугах, прикину цену и сроки или приму заявку. Чем помочь?",
    placeholder: "Спросите или оставьте заявку…",
    tabConsult: "Консультант",
    tabLab: "Лаборатория",
    titleLab: "Лаборатория ELLHOME",
    subtitleLab: "Придумывает названия и идеи",
    greetingLab:
      "Это Лаборатория. Придумаю название проекту или подкину идею — скажите, для чего. Чем конкретнее запрос, тем острее выйдет.",
    placeholderLab: "Попросите название или идею…",
    tabGuide: "wikiмантия",
    titleGuide: "wikiмантия",
    subtitleGuide: "Гадание по энциклопедии",
    greetingGuide:
      "wikiмантия — гадание по энциклопедии. Сначала напишите свой вопрос, потом назовёте страницу и строку: что окажется на этих координатах, то и будет ответом.",
    placeholderGuide: "Напишите свой вопрос…",
    waking: "Бот просыпается (первый запрос может занять до минуты)…",
    error: "Не удалось связаться. Попробуйте ещё раз или напишите в Telegram @M_B_lab.",
    send: "Отправить",
    close: "Закрыть",
    clear: "Очистить переписку",
  },
  en: {
    launch: "Ask AI",
    title: "ELLHOME AI consultant",
    subtitle: "Usually replies in seconds",
    greeting:
      "Hi! I'm ELLHOME's AI consultant. I can tell you about services, estimate price and timelines, or take a request. How can I help?",
    placeholder: "Ask or leave a request…",
    tabConsult: "Consultant",
    tabLab: "Lab",
    titleLab: "ELLHOME Lab",
    subtitleLab: "Invents names and ideas",
    greetingLab:
      "This is the Lab. I'll name your project or throw you an idea — tell me what for. The more specific, the sharper it gets.",
    placeholderLab: "Ask for a name or an idea…",
    tabGuide: "wikimancy",
    titleGuide: "wikimancy",
    subtitleGuide: "Divination by encyclopedia",
    greetingGuide:
      "wikimancy — divination by encyclopedia. First write your question, then you\u2019ll name a page and a line — whatever sits at those coordinates is your answer.",
    placeholderGuide: "Write your question…",
    waking: "Waking the bot up (the first request can take up to a minute)…",
    error: "Couldn't reach the assistant. Try again or message Telegram @M_B_lab.",
    send: "Send",
    close: "Close",
    clear: "Clear conversation",
  },
};

function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.5 8.5 0 0 1-3.9-.9L3 20l1.3-4.1A8.4 8.4 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

// Лёгкий рендер разметки бота: **жирный**, *курсив*, [ссылка](url)
// и списки "* "/"- " -> "• "
function renderRich(text: string) {
  const src = text
    .split("\n")
    .map((l) => l.replace(/^\s*[*-]\s+/, "• "))
    .join("\n");
  // без lookbehind — Safari на старых iPhone его не понимает
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{src.slice(last, m.index)}</span>);
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key++}>{m[2]}</em>);
    else out.push(
      <a key={key++} className="cw-link" href={m[4]} target="_blank" rel="noopener noreferrer">{m[3]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(<span key={key++}>{src.slice(last)}</span>);
  return out;
}

export default function ChatWidget() {
  const { lang } = useLang();
  const t = STR[lang];

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("consult");
  const [messages, setMessages] = useState<Msg[]>(loadSaved);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 130) + "px";
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // iOS: при открытой клавиатуре fixed-элементы остаются на месте и поле ввода
  // уезжает под неё. Меряем visualViewport и поднимаем панель на высоту клавиатуры.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--cw-kb", (open ? Math.round(inset) : 0) + "px");
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.setProperty("--cw-kb", "0px");
    };
  }, [open]);

  // переписка переживает перезагрузку страницы
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-KEEP))); } catch { /* noop */ }
  }, [messages]);

  function clearChat() {
    setMessages([]);
    try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
    inputRef.current?.focus();
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 8000);
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, mode }),
      });
      const j = await r.json();
      if (j?.mode === "consult" || j?.mode === "lab") setMode(j.mode);
      setMessages((m) => [...m, { role: "assistant", content: j?.reply || t.error }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: t.error }]);
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlow(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <button
        className={`cw-launcher${open ? " cw-hidden" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={t.launch}
      >
        <IconChat />
        <span className="cw-launch-label">{t.launch}</span>
        <span className="cw-launch-dot" />
      </button>

      <div className={`cw-panel${open ? " cw-open" : ""}`} role="dialog" aria-label={t.title}>
        <BorderBeam size="md" colorVariant="colorful" radius={20} duration={6}>
          <div className="cw-card" data-lenis-prevent>
            <header className="cw-head">
              <span className="cw-avatar"><IconChat /></span>
              <div className="cw-head-txt">
                <div className="cw-title">{mode === "guide" ? t.titleGuide : mode === "lab" ? t.titleLab : t.title}</div>
                <div className="cw-sub"><span className="cw-online" />{mode === "guide" ? t.subtitleGuide : mode === "lab" ? t.subtitleLab : t.subtitle}</div>
              </div>
              {messages.length > 0 && (
                <button className="cw-x" onClick={clearChat} aria-label={t.clear} title={t.clear}><IconTrash /></button>
              )}
              <button className="cw-x" onClick={() => setOpen(false)} aria-label={t.close}><IconClose /></button>
            </header>

            <div className="cw-tabs" role="tablist">
              <button role="tab" aria-selected={mode === "consult"}
                className={`cw-tab${mode === "consult" ? " on" : ""}`}
                onClick={() => setMode("consult")}>{t.tabConsult}</button>
              <button role="tab" aria-selected={mode === "lab"}
                className={`cw-tab${mode === "lab" ? " on" : ""}`}
                onClick={() => setMode("lab")}>{t.tabLab}</button>
              <button role="tab" aria-selected={mode === "guide"}
                className={`cw-tab${mode === "guide" ? " on" : ""}`}
                onClick={() => setMode("guide")}>{t.tabGuide}</button>
            </div>

            <div className="cw-msgs" ref={scrollRef}>
              <div className="cw-msg cw-a">
                <div className="cw-bubble">{mode === "guide" ? t.greetingGuide : mode === "lab" ? t.greetingLab : t.greeting}</div>
              </div>
              {messages.map((m, i) => (
                <div key={i} className={`cw-msg ${m.role === "user" ? "cw-u" : "cw-a"}`}>
                  <div className="cw-bubble">{renderRich(m.content)}</div>
                </div>
              ))}
              {loading && (
                <div className="cw-msg cw-a">
                  <div className="cw-bubble cw-typing"><span></span><span></span><span></span></div>
                </div>
              )}
              {slow && <div className="cw-waking">{t.waking}</div>}
            </div>

            <form className="cw-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <textarea
                ref={inputRef}
                className="cw-input"
                rows={1}
                value={input}
                placeholder={mode === "guide" ? t.placeholderGuide : mode === "lab" ? t.placeholderLab : t.placeholder}
                onChange={(e) => { setInput(e.target.value); autosize(e.target); }}
                onKeyDown={onKey}
              />
              <button type="submit" className="cw-send" disabled={!input.trim() || loading} aria-label={t.send}>
                <IconSend />
              </button>
            </form>
          </div>
        </BorderBeam>
      </div>
    </>
  );
}
