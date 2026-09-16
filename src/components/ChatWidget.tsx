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
    tabLab: "Соб~~у~~^е^седник",
    titleLab: "Соб~~у~~^е^седник",
    subtitleLab: "Начальник отошёл, я за него",
    greetingLab:
      "~~Начальник вышел за сигаретами.~~ Начальник отошёл, я за него.\n\nСпрашивай что хочешь. Про цены и сроки — это к «Консультанту» на соседней вкладке.",
    placeholderLab: "Спросите о чём угодно…",
    tabGuide: "wikiмантия",
    titleGuide: "wikiмантия",
    subtitleGuide: "Гадание по энциклопедии",
    greetingGuide:
      "wikiмантия — гадание по энциклопедии. Сначала напишите свой вопрос, потом назовёте страницу (1–11 500) и строку (1–99): что окажется на этих координатах, то и будет ответом.",
    placeholderGuide: "Напишите свой вопрос…",
    copy: "Скопировать",
    copied: "Скопировано",
    copyQ: "Вопрос:",
    copyTail: "Погадать самому:",
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
    tabLab: "Stand-in",
    titleLab: "Stand-in",
    subtitleLab: "The boss stepped out, I'm covering",
    greetingLab:
      "~~The boss went out for cigarettes.~~ The boss stepped out, I'm covering for him.\n\nAsk me anything. Prices and deadlines aren't mine — that's the Consultant tab.",
    placeholderLab: "Ask me anything…",
    tabGuide: "wikimancy",
    titleGuide: "wikimancy",
    subtitleGuide: "Divination by encyclopedia",
    greetingGuide:
      "wikimancy — divination by encyclopedia. First write your question, then you\u2019ll name a page (1–11,500) and a line (1–99) — whatever sits at those coordinates is your answer.",
    placeholderGuide: "Write your question…",
    copy: "Copy",
    copied: "Copied",
    copyQ: "Question:",
    copyTail: "Try it yourself:",
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

// Лёгкий рендер разметки бота: **жирный**, *курсив*, ~~зачёркнутый~~,
// [ссылка](url) и списки "* "/"- " -> "• ".
// Зачёркивание — фирменный приём двойника: сначала честная версия, потом приличная.
// Отдельно ~~у~~^е^ — школьная правка: буква вычеркнута, верная вписана сверху.
// Живёт только в названии вкладки, в репликах бот такой разметки не пишет.
function renderRich(text: string) {
  const src = text
    .split("\n")
    .map((l) => l.replace(/^\s*[*-]\s+/, "• "))
    .join("\n");
  // без lookbehind — Safari на старых iPhone его не понимает
  const re = /\*\*([^*]+)\*\*|~~([^~\n]+)~~\^([^^\n]+)\^|~~([^~\n]+)~~|\*([^*\n]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{src.slice(last, m.index)}</span>);
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined && m[3] !== undefined) out.push(
      <span className="cw-edit" key={key++}>
        <s>{m[2]}</s>
        <i className="cw-fix" aria-hidden="true">{m[3]}</i>
      </span>
    );
    else if (m[4] !== undefined) out.push(<s key={key++}>{m[4]}</s>);
    else if (m[5] !== undefined) out.push(<em key={key++}>{m[5]}</em>);
    else out.push(
      <a key={key++} className="cw-link" href={m[7]} target="_blank" rel="noopener noreferrer">{m[6]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(<span key={key++}>{src.slice(last)}</span>);
  return out;
}

// Разметку бота в буфер не тащим: в мессенджере звёздочки и тильды
// выглядят мусором. Ссылку разворачиваем в «текст: адрес».
function toPlain(text: string) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~\n]+)~~\^([^^\n]+)\^/g, "$2")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

// clipboard API есть не везде (старый Safari, страница без https) —
// поэтому запасной путь через скрытое поле и execCommand
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* пробуем запасной путь */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
  const [copied, setCopied] = useState<number | null>(null);

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

  // Гадание копируется целиком: вопрос человека, координаты, статья и толкование.
  // Вопрос ищем выше по переписке — рядом с ответом лежат только числа.
  async function copyReading(i: number) {
    const answer = messages[i]?.content || "";
    let question = "";
    for (let k = i - 1; k >= 0; k--) {
      const m = messages[k];
      if (m.role !== "user") continue;
      if (/[\p{L}]{3,}/u.test(m.content)) { question = m.content.trim(); break; }
    }
    const link = window.location.href.split("#")[0];
    const text = (question ? `${t.copyQ} ${question}\n\n` : "")
      + toPlain(answer).trim()
      + `\n\n${t.copyTail} ${link}`;
    if (await copyText(text)) {
      setCopied(i);
      window.setTimeout(() => setCopied((cur) => (cur === i ? null : cur)), 1800);
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
                <div className="cw-title">{renderRich(mode === "guide" ? t.titleGuide : mode === "lab" ? t.titleLab : t.title)}</div>
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
                onClick={() => setMode("lab")}>{renderRich(t.tabLab)}</button>
              <button role="tab" aria-selected={mode === "guide"}
                className={`cw-tab${mode === "guide" ? " on" : ""}`}
                onClick={() => setMode("guide")}>{t.tabGuide}</button>
            </div>

            <div className="cw-msgs" ref={scrollRef}>
              <div className="cw-msg cw-a">
                <div className="cw-bubble">{renderRich(mode === "guide" ? t.greetingGuide : mode === "lab" ? t.greetingLab : t.greeting)}</div>
              </div>
              {messages.map((m, i) => {
                // кнопка только у ответов гадания: там есть что унести с собой
                const canCopy = mode === "guide" && m.role !== "user"
                  && !m.content.startsWith("⚠️");
                return (
                  <div key={i} className={`cw-msg ${m.role === "user" ? "cw-u" : "cw-a"}`}>
                    <div className="cw-col">
                      <div className="cw-bubble">{renderRich(m.content)}</div>
                      {canCopy && (
                        <button type="button" className="cw-copy" onClick={() => copyReading(i)}>
                          {copied === i ? t.copied : t.copy}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
