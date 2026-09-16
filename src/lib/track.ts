// Свой счётчик вместо внешнего: без куки, без внешних скриптов.
// Шлём только имена событий и пару сухих полей — ни текстов переписки,
// ни персональных данных здесь не бывает.
const API = "https://ellhome-bot-api.onrender.com/event";
const SID_KEY = "ellhome_sid";

function sessionId(): string {
  try {
    let v = sessionStorage.getItem(SID_KEY);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SID_KEY, v);
    }
    return v;
  } catch {
    return "no-storage";   // приватный режим — просто без склейки визита
  }
}

const already = new Set<string>();

export function track(
  name: string,
  props: Record<string, string | number | boolean> = {},
  onceKey?: string,
): void {
  // с локальной машины не шумим — иначе своя же разработка испортит статистику
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return;
  // страница, которую браузер предзагрузил, но человек не открыл, — не визит
  if (typeof document !== "undefined" && document.hidden) return;
  if (onceKey) {
    if (already.has(onceKey)) return;
    already.add(onceKey);
  }
  try {
    // keepalive — чтобы событие ушло, даже если человек уже закрывает вкладку
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, props, session: sessionId() }),
      keepalive: true,
    }).catch(() => { /* счётчик не должен мешать сайту */ });
  } catch { /* и тем более ронять его */ }
}
