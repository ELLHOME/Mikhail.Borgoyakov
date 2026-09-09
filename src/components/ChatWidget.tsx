import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import BorderBeam from "./BorderBeam";

const API_URL = "https://ellhome-bot-api.onrender.com/chat";

type Msg = { role: "user" | "assistant"; content: string };

const STR = {
  ru: {
    launch: "Спросить ИИ",
    title: "AI-консультант ELLHOME",
    subtitle: "Обычно отвечает за пару секунд",
    greeting:
      "Здравствуйте! Я AI-консультант ELLHOME. Расскажу об услугах, прикину цену и сроки или приму заявку. Чем помочь?",
    placeholder: "Спросите или оставьте заявку…",
    waking: "Бот просыпается (первый запрос может занять до минуты)…",
    error: "Не удалось связаться. Попробуйте ещё раз или напишите в Telegram @M_B_lab.",
    send: "Отправить",
    close: "Закрыть",
  },
  en: {
    launch: "Ask AI",
    title: "ELLHOME AI consultant",
    subtitle: "Usually replies in seconds",
    greeting:
      "Hi! I'm ELLHOME's AI consultant. I can tell you about services, estimate price and timelines, or take a request. How can I help?",
    placeholder: "Ask or leave a request…",
    waking: "Waking the bot up (the first request can take up to a minute)…",
    error: "Couldn't reach the assistant. Try again or message Telegram @M_B_lab.",
    send: "Send",
    close: "Close",
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
function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export default function ChatWidget() {
  const { lang } = useLang();
  const t = STR[lang];

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
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
        body: JSON.stringify({ message: text, history }),
      });
      const j = await r.json();
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
                <div className="cw-title">{t.title}</div>
                <div className="cw-sub"><span className="cw-online" />{t.subtitle}</div>
              </div>
              <button className="cw-x" onClick={() => setOpen(false)} aria-label={t.close}><IconClose /></button>
            </header>

            <div className="cw-msgs" ref={scrollRef}>
              <div className="cw-msg cw-a">
                <div className="cw-bubble">{t.greeting}</div>
              </div>
              {messages.map((m, i) => (
                <div key={i} className={`cw-msg ${m.role === "user" ? "cw-u" : "cw-a"}`}>
                  <div className="cw-bubble">{m.content}</div>
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
                placeholder={t.placeholder}
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
