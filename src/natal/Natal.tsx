import { useEffect, useRef, useState } from "react";
import { createSky, type Chart, type Now } from "./sky";
import { createMusic } from "./music";
import { track } from "../lib/track";
import "./natal.css";

const API = "https://ellhome-bot-api.onrender.com";

type City = { name: string; country: string; region: string;
              lat: number; lon: number; tz: string; pop: number };
type Section = { id: string; title: string; text: string; fields?: string[] };
type Reading = { lead: string; blocks: string[]; verdict: string;
                 summary?: string; sections?: Section[] };

/** С чего обычно начинают. Кнопки задают вопрос сразу — человеку не надо
 *  придумывать формулировку, чтобы понять, что спрашивать можно. */
const STARTERS = [
  "Какая работа мне подходит?",
  "Какой я в отношениях?",
  "В чём мои сильные стороны?",
  "Что меня ждёт в ближайшие месяцы?",
];
type Result = {
  chart: Chart; reading: Reading; place: string; tz: string; when: string;
  utc_offset: number; time_known: boolean; note: string; tz_note?: string;
  now?: Now | null;
};

/** Разметка у нас одна: **жирный**. Ничего больше модель не присылает,
 *  поэтому и разбирать больше нечего — и HTML со стороны сюда не попадёт. */
function bold(text: string) {
  return text.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
    i % 2 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>);
}

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
                "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function ruDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** Орб в привычном виде: секунды, минуты или градусы. */
function orbLabel(deg: number) {
  const m = deg * 60;
  if (m < 1) return `${Math.round(m * 60)}″`;
  if (deg < 1) return `${Math.round(m)}′`;
  return `${deg.toFixed(2)}°`;
}

/** Сводка под колесом: по одному факту в клетке, все посчитанные.
 *  Без времени рождения дома неизвестны, поэтому всё, что от них зависит,
 *  из сводки выпадает — показывать недостоверное хуже, чем не показывать. */
function summary(c: Chart, timeKnown: boolean): [string, string][] {
  const out: [string, string][] = [];
  const order = ["огонь", "земля", "воздух", "вода"];
  if (c.moon_phase) out.push(["фаза луны", `${c.moon_phase.name}, ${c.moon_phase.illum}%`]);
  if (timeKnown && c.day_chart !== undefined) out.push(["карта", c.day_chart ? "дневная" : "ночная"]);
  if (timeKnown && c.ruler?.planet)
    out.push(["управитель", `${c.ruler.planet}, дом ${c.ruler.house}`]);
  if (c.elements)
    out.push(["стихии", order.filter((e) => c.elements![e])
      .map((e) => `${e} ${c.elements![e]}`).join(" · ")]);
  if (c.modes)
    out.push(["кресты", Object.entries(c.modes).map(([k, v]) => `${k} ${v}`).join(" · ")]);
  const st = (c.stelliums || []).filter((g) => timeKnown || g.where.startsWith("знак"));
  if (st.length) out.push(["скопления", st.map((g) => `${g.where} ×${g.who.length}`).join(", ")]);
  if (c.stations?.length) out.push(["на станции", c.stations.join(", ")]);
  // Апогей лунной орбиты считают двумя способами, и расходятся они заметно.
  // Показываем оба: выбирать за человека, какая «правильная», не наше дело.
  if (c.lilith?.label) out.push(["чёрная луна · средняя", c.lilith.label]);
  if (c.lilith_true?.label) out.push(["чёрная луна · истинная", c.lilith_true.label]);
  return out;
}
const offsetLabel = (h: number) =>
  "UTC" + (h < 0 ? "−" : "+") + (Number.isInteger(h) ? h : h.toFixed(1)).toString().replace("-", "");

export default function Natal() {
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<ReturnType<typeof createSky> | null>(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [unknownTime, setUnknownTime] = useState(false);
  const [cityText, setCityText] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [sugg, setSugg] = useState<City[]>([]);
  const [pick, setPick] = useState(0);
  const [noCity, setNoCity] = useState(false);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);
  const [qError, setQError] = useState("");
  const [school, setSchool] = useState<"classic" | "avestan">("classic");

  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [fieldOn, setFieldOn] = useState(true);
  const [hasField, setHasField] = useState(false);
  const musicRef = useRef<ReturnType<typeof createMusic> | null>(null);
  const [musicOn, setMusicOn] = useState(false);

  /* небо живёт вне React: это канвас с собственным кадром */
  useEffect(() => {
    if (!fieldRef.current || !streamRef.current || !boxRef.current) return;
    const sky = createSky(fieldRef.current, streamRef.current, boxRef.current);
    skyRef.current = sky;
    setHasField(sky.hasField);
    let saved = true;
    try { saved = localStorage.getItem("ef-field") !== "0"; } catch { /* приватный режим */ }
    setFieldOn(saved);
    sky.setField(saved);
    try {
      if (localStorage.getItem("ef-school") === "avestan") setSchool("avestan");
    } catch { /* приватный режим */ }
    track("page_view", { page: "natal", w: window.innerWidth || 0 }, "page_view");
    const music = createMusic(() => sky.chaos());
    musicRef.current = music;
    // Браузер не даёт играть звук, пока человек ничего не нажал. Поэтому
    // если музыку включали в прошлый раз, она вступает с первым касанием.
    let want = false;
    try { want = localStorage.getItem("ef-music") === "1"; } catch { /* приватный режим */ }
    const wake = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.(".ef-music")) return;
      off();
      void music.start().then((ok) => setMusicOn(ok));
    };
    const off = () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
    if (want) {
      setMusicOn(true);
      window.addEventListener("pointerdown", wake);
      window.addEventListener("keydown", wake);
    }
    return () => {
      off(); music.destroy(); musicRef.current = null;
      sky.destroy(); skyRef.current = null;
    };
  }, []);

  useEffect(() => { skyRef.current?.setChart(result ? result.chart : null); }, [result]);

  /* клавиша F переключает фон — но не тогда, когда человек печатает */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") toggleField();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* подсказка городов: ждём, пока человек допечатает */
  useEffect(() => {
    const q = cityText.trim();
    setNoCity(false);
    if (city && q === cityLabel(city)) { setSugg([]); return; }
    if (q.length < 2) { setSugg([]); return; }
    const ac = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`${API}/natal/suggest?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const d = await r.json();
        const list = d.cities || [];
        setSugg(list); setPick(0);
        // Деревень в базе много, но не все. Молчаливый пустой список
        // читается как «такого места не существует» — а это неправда.
        setNoCity(list.length === 0);
      } catch { /* подсказка не обязана работать: координаты можно выбрать позже */ }
    }, 350);
    return () => { clearTimeout(id); ac.abort(); };
  }, [cityText, city]);

  function cityLabel(c: City) {
    return [c.name, c.region && c.region !== c.name ? c.region : "", c.country]
      .filter(Boolean).join(", ");
  }

  function choose(c: City) {
    setCity(c); setCityText(cityLabel(c)); setSugg([]);
  }

  /* Смена школы — это другая карта, а не другой вид той же.
     Поэтому она пересчитывается на сервере, а не прячется на клиенте. */
  function switchSchool(next: "classic" | "avestan") {
    if (next === school) return;
    setSchool(next);
    try { localStorage.setItem("ef-school", next); } catch { /* ничего страшного */ }
    if (result) void compute(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!date) { setError("Без даты рождения карты не будет."); return; }
    if (!city) { setError("Выберите город из подсказки — нужны координаты и часовой пояс."); return; }
    if (!unknownTime && !time) { setError("Укажите время или отметьте, что оно неизвестно."); return; }

    await compute(school);
  }

  async function compute(which: "classic" | "avestan") {
    if (!city) return;
    setBusy(true);
    setSlow(false);
    setError("");
    // Сервер на бесплатном хостинге засыпает. Первый запрос после сна
    // может идти под минуту — честнее сказать это, чем молча крутить точки.
    const slowTimer = window.setTimeout(() => setSlow(true), 6000);
    try {
      const r = await fetch(`${API}/natal/chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, time: unknownTime ? "12:00" : time,
          lat: city.lat, lon: city.lon, tz: city.tz,
          place: cityLabel(city), unknown_time: unknownTime, school: which,
        }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); setResult(null); }
      else {
        setResult(d);
        track("natal_chart", { year: Number(date.slice(0, 4)),
                               known: unknownTime ? 0 : 1, school: which });
      }
    } catch {
      setError("Сервер не ответил. Похоже, он ещё просыпается — попробуйте ещё раз через минуту.");
    } finally {
      clearTimeout(slowTimer);
      setBusy(false); setSlow(false);
    }
  }

  async function askChart(e: React.FormEvent | null, preset?: string) {
    e?.preventDefault();
    const text = (preset ?? q).trim();
    if (text.length < 3 || !city || asking) return;
    setAsking(true); setQError("");
    try {
      const r = await fetch(`${API}/natal/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, time: unknownTime ? "12:00" : time,
          lat: city.lat, lon: city.lon, tz: city.tz,
          unknown_time: unknownTime, question: text, school,
          // последние ответы — чтобы уточнение понималось как продолжение
          history: thread.slice(-3),
        }),
      });
      const d = await r.json();
      if (d.error) setQError(d.error);
      else {
        setThread((t) => [...t, { q: text, a: d.answer }]);
        setQ("");
        track("natal_ask", { len: text.length });
      }
    } catch {
      setQError("Сервер не ответил. Попробуйте ещё раз через минуту.");
    } finally {
      setAsking(false);
    }
  }

  async function toggleMusic() {
    const m = musicRef.current;
    if (!m) return;
    const next = !m.playing;
    if (next) {
      const ok = await m.start();
      setMusicOn(ok);
    } else {
      m.stop();
      setMusicOn(false);
    }
    try { localStorage.setItem("ef-music", next ? "1" : "0"); } catch { /* ничего страшного */ }
  }

  function toggleField() {
    const next = !fieldOn;
    setFieldOn(next);
    try { localStorage.setItem("ef-field", next ? "1" : "0"); } catch { /* ничего страшного */ }
    skyRef.current?.setField(next);
  }

  const today = new Date();
  const maxDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="ef">
      <canvas className="ef-field" ref={fieldRef} aria-hidden="true" />
      <div className="ef-veil" aria-hidden="true" />
      <canvas className="ef-stream" ref={streamRef} aria-hidden="true" />

      <a className="ef-home" href="../" aria-label="Вернуться на сайт ELLHOME">
        <span className="ef-home-name">← ELLHOME</span>
        <span className="ef-home-sub">Electronic Life Lab</span>
      </a>

      <div className="ef-page">
        <header className="ef-head">
          <h1>Эфемерида</h1>
          {result ? (
            <div className="ef-coords">
              {result.when} · {offsetLabel(result.utc_offset)} · {result.place}{" "}
              <b>{result.chart.asc.label} ASC</b>
            </div>
          ) : (
            <div className="ef-coords">Натальная карта, посчитанная всерьёз</div>
          )}
        </header>

        <form className="ef-form" onSubmit={submit}>
          <div className="ef-field-wrap">
            <label htmlFor="ef-date">дата рождения</label>
            <input id="ef-date" type="date" value={date} max={maxDate} min="1900-01-01"
                   onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="ef-field-wrap">
            <label htmlFor="ef-time">время</label>
            <input id="ef-time" type="time" value={time} disabled={unknownTime}
                   onChange={(e) => setTime(e.target.value)} />
            <label className="ef-unknown">
              <input type="checkbox" checked={unknownTime}
                     onChange={(e) => setUnknownTime(e.target.checked)} />
              не знаю
            </label>
          </div>

          <div className="ef-field-wrap">
            <label htmlFor="ef-city">город рождения</label>
            <input id="ef-city" type="text" value={cityText} placeholder="Абакан или Николаевка Хакасия"
                   autoComplete="off" spellCheck={false}
                   onChange={(e) => { setCityText(e.target.value); setCity(null); }}
                   onKeyDown={(e) => {
                     if (!sugg.length) return;
                     if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % sugg.length); }
                     if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + sugg.length) % sugg.length); }
                     if (e.key === "Enter") { e.preventDefault(); choose(sugg[pick]); }
                     if (e.key === "Escape") setSugg([]);
                   }} />
            {sugg.length > 0 && (
              <div className="ef-sugg">
                {sugg.map((c, i) => (
                  <button key={`${c.lat},${c.lon}`} type="button" data-on={i === pick ? "1" : "0"}
                          onMouseEnter={() => setPick(i)} onClick={() => choose(c)}>
                    {c.name} <span>{[c.region, c.country].filter(Boolean).join(", ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ef-field-wrap">
            {/* пустая подпись держит кнопку на одной линии с полями */}
            <label aria-hidden="true">&nbsp;</label>
            <button className="ef-submit" type="submit" disabled={busy}>
              {busy ? "считаю…" : "посчитать"}
            </button>
          </div>
        </form>

        {(error || slow || noCity || (!result && !busy)) && (
          <p className={"ef-hint" + (error ? " ef-error" : "")}>
            {error ? error
              : slow ? "Сервер просыпается после простоя — это занимает до минуты."
              : noCity ? (
                  <>Такого места не нашлось. Если название частое, добавьте область —
                  «Николаевка Красноярский». А если деревни нет в базе совсем, возьмите
                  ближайший райцентр: пятьдесят километров сдвигают асцендент на три
                  угловых минуты, это как ошибиться во времени рождения на двенадцать секунд.</>
                )
              : "Координаты и часовой пояс подставятся сами. Если название частое, "
                + "допишите область. Время влияет на дома и асцендент."}
          </p>
        )}

        {result && (
          <div className="ef-school">
            <div className="ef-school-pick" role="group" aria-label="Школа расчёта">
              {(["classic", "avestan"] as const).map((k) => (
                <button key={k} type="button" disabled={busy}
                        className={school === k ? "on" : undefined}
                        onClick={() => switchSchool(k)}>
                  {k === "classic" ? "классическая" : "авестийская · тимашевская"}
                </button>
              ))}
            </div>
            <p className="ef-school-note">
              {school === "classic"
                ? "Десять планет, узел и Хирон — всё, что есть на небе."
                : "Набор авестийской школы Глобы, посчитанный по эфемеридам Тимашева. " +
                  "Добавлены Прозерпина и Селена. Это не тела: их никто не наблюдал, " +
                  "орбиты им назначены школой. Файл этих орбит идёт в составе Swiss " +
                  "Ephemeris и начинается предупреждением её авторов: «Warning! These " +
                  "planets do not exist!»"}
            </p>
          </div>
        )}

        <div className="ef-box" ref={boxRef} data-empty={result ? "0" : "1"}
             aria-label={result ? "Натальная карта" : undefined} />

        {result && (
          <dl className="ef-sum">
            {summary(result.chart, result.time_known).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {result && (
          <>
            {result.now && (
              <div className="ef-grid ef-now">
                <section className="ef-read">
                  <h2>Что сейчас · {ruDate(result.now.when)}</h2>
                  {result.now.text.blocks.map((b, i) => <p key={i}>{bold(b)}</p>)}
                  {result.now.text.tail && (
                    <p className="ef-verdict">{result.now.text.tail}</p>
                  )}
                </section>

                <section className="ef-data">
                  <h2>Небо сегодня</h2>
                  <ul className="ef-houses">
                    <li>
                      <span className="g">Луна</span>
                      <span className="v">
                        {result.now.moon.label} · {result.now.moon.phase},{" "}
                        {result.now.moon.illum}%
                      </span>
                    </li>
                    {result.now.sky.map((p) => (
                      <li key={p.name}>
                        <span className="g">{p.name}</span>
                        <span className="v">{p.label}</span>
                        <span className="r">{p.retro ? "R" : ""}</span>
                      </li>
                    ))}
                  </ul>

                  {!!result.now.hits.length && (
                    <>
                      <h2>Углы к карте рождения</h2>
                      <ul className="ef-events">
                        {result.now.hits.slice(0, 7).map((h, i) => (
                          <li key={i}>
                            <span className="e-what">
                              {h.who}{h.retro ? " R" : ""} <i>{h.type}</i> {h.to}
                            </span>
                            <span className="e-when">
                              {orbLabel(h.orb)} от точного ·{" "}
                              {h.state === "точен сейчас"
                                ? "точен сегодня"
                                : `${h.state}, точный угол ${ruDate(h.exact)}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </div>
            )}

            <section className="ef-ask">
              <h2>Спросить</h2>
              {thread.map((t, i) => (
                <div className="ef-qa" key={i}>
                  <p className="ef-q">{t.q}</p>
                  {t.a.split(/\n{2,}/).map((para, j) => <p key={j}>{bold(para)}</p>)}
                </div>
              ))}
              <form onSubmit={askChart}>
                <input type="text" value={q} maxLength={400} autoComplete="off"
                       placeholder={thread.length ? "ещё вопрос" : "чем мне заниматься?"}
                       onChange={(e) => setQ(e.target.value)} />
                <button type="submit" disabled={asking || q.trim().length < 3}>
                  {asking ? "думаю…" : "спросить"}
                </button>
              </form>
              {!thread.length && (
                <div className="ef-starters">
                  {STARTERS.map((st) => (
                    <button key={st} type="button" disabled={asking}
                            onClick={() => askChart(null, st)}>{st}</button>
                  ))}
                </div>
              )}
              <p className={"ef-ask-note" + (qError ? " ef-error" : "")}>
                {qError ||
                  "Расскажите о себе в вопросе — чем заняты, что выбираете, — и ответ " +
                  "будет про ваш случай, а не про всех с такой картой. Это толкование, " +
                  "а не обещание событий."}
              </p>
            </section>

            <div className="ef-grid">
              <section className="ef-read">
                <h2>О вас по карте</h2>
                {result.note && <p className="ef-note">{result.note}</p>}
                {result.tz_note && <p className="ef-note">{result.tz_note}</p>}
                <p className="ef-lead">{result.reading.lead}</p>
                {result.reading.summary && <p className="ef-summary">{result.reading.summary}</p>}
                {result.reading.sections?.length ? (
                  <>
                    <nav className="ef-toc" aria-label="Разделы разбора">
                      {result.reading.sections.map((sec) => (
                        <a key={sec.id} href={`#ef-${sec.id}`}>{sec.title}</a>
                      ))}
                    </nav>
                    {result.reading.sections.map((sec) => (
                      <section className="ef-topic" id={`ef-${sec.id}`} key={sec.id}>
                        <h3>{sec.title}</h3>
                        {sec.text.split(/\n{2,}/).map((para, j) => <p key={j}>{bold(para)}</p>)}
                        {!!sec.fields?.length && (
                          <>
                            <p className="ef-fields-h">Сферы, которые традиция связывает с картой</p>
                            <ul className="ef-fields">
                              {sec.fields.map((f) => <li key={f}>{f}</li>)}
                            </ul>
                          </>
                        )}
                      </section>
                    ))}
                  </>
                ) : (
                  <>
                    {result.reading.blocks.map((b, i) => <p key={i}>{bold(b)}</p>)}
                    {result.reading.verdict && <p className="ef-verdict">{result.reading.verdict}</p>}
                  </>
                )}
              </section>

              <section className="ef-data">
                <h2>Положения</h2>
                <ul>
                  {result.chart.planets.map((p) => (
                    <li key={p.name}>
                      <span className="g">{p.name}</span>
                      <span className="v">
                        {p.name === "Луна" && result.chart.moon_span
                          ? `${result.chart.moon_span.from} – ${result.chart.moon_span.to}`
                          : p.label}
                      </span>
                      <span className="h">{result.time_known ? `дом ${p.house}` : "—"}</span>
                      <span className="r">{p.retro ? "R" : ""}</span>
                    </li>
                  ))}
                </ul>
                <h2>Аспекты</h2>
                <ul className="ef-asp">
                  {result.chart.aspects.slice(0, 10).map((a, i) => (
                    <li key={i}>
                      <span className="a">{a.a}</span>
                      <span className="t">{a.type}</span>
                      <span className="a">{a.b}</span>
                      <span className="d" title={a.vague ? "Время рождения неизвестно: точность аспекта Луны не определить" : undefined}>
                        {a.vague ? (a.all_day ? "весь день" : "возможен") : `${a.exact.toFixed(2)}°`}
                      </span>
                    </li>
                  ))}
                </ul>
                {result.chart.moon_span && (
                  <p className="ef-hint ef-moonnote">
                    {result.chart.moon_span.signs.length > 1
                      ? `Луна в тот день перешла из знака ${result.chart.moon_span.signs[0]} в ${result.chart.moon_span.signs[result.chart.moon_span.signs.length - 1]}. Без времени рождения не узнать, в каком из них она была.`
                      : "Луна в тот день прошла больше десяти градусов, поэтому точность её аспектов неизвестна."}
                  </p>
                )}

                {/* Углы карты держатся на времени рождения: без него их нет. */}
                {result.time_known && !!result.chart.angle_aspects?.length && (
                  <>
                    <h2>Аспекты к углам</h2>
                    <ul className="ef-asp">
                      {result.chart.angle_aspects.slice(0, 8).map((a, i) => (
                        <li key={i}>
                          <span className="a">{a.a}</span>
                          <span className="t">{a.type}</span>
                          <span className="a">{a.b}</span>
                          <span className="d">{a.exact.toFixed(2)}°</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {result.time_known && (
                  <>
                    <h2>Дома</h2>
                    <ul className="ef-houses">
                      {result.chart.houses.map((h) => (
                        <li key={h.n}>
                          <span className="g">дом {h.n}</span>
                          <span className="v">{h.label}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>

            <footer className="ef-foot">
              Положения планет и куспиды домов — Swiss Ephemeris, режим Moshier; дома по Плацидусу.<br />
              Расчёт сверен с astropy на четырёх датах и полушариях: расхождение меньше
              полутора угловых минут при орбе аспекта в пять градусов.<br />
              Астрономия здесь точная. Выводы о характере — вопрос веры, а не измерения.
            </footer>
          </>
        )}
      </div>

      <button className={"ef-toggle ef-music" + (hasField ? "" : " ef-music-low")} type="button"
              onClick={toggleMusic} aria-pressed={musicOn}
              title="«Дыхание планет» — фоновая музыка">
        музыка: <b>{musicOn ? "вкл" : "выкл"}</b>
      </button>
      {hasField && (
        <button className="ef-toggle" type="button" onClick={toggleField} title="Клавиша F">
          фон: <b>{fieldOn ? "поле" : "поток"}</b>
        </button>
      )}
    </div>
  );
}
