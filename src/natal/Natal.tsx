import { useEffect, useRef, useState } from "react";
import { createSky, type Chart } from "./sky";
import { track } from "../lib/track";
import "./natal.css";

const API = "https://ellhome-bot-api.onrender.com";

type City = { name: string; country: string; region: string;
              lat: number; lon: number; tz: string; pop: number };
type Reading = { lead: string; blocks: string[]; verdict: string };
type Result = {
  chart: Chart; reading: Reading; place: string; tz: string; when: string;
  utc_offset: number; time_known: boolean; note: string;
};

/** Разметка у нас одна: **жирный**. Ничего больше модель не присылает,
 *  поэтому и разбирать больше нечего — и HTML со стороны сюда не попадёт. */
function bold(text: string) {
  return text.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
    i % 2 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>);
}

const pad = (n: number) => String(n).padStart(2, "0");
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

  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [fieldOn, setFieldOn] = useState(true);
  const [hasField, setHasField] = useState(false);

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
    track("page_view", { page: "natal", w: window.innerWidth || 0 }, "page_view");
    return () => { sky.destroy(); skyRef.current = null; };
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
    if (city && q === cityLabel(city)) { setSugg([]); return; }
    if (q.length < 2) { setSugg([]); return; }
    const ac = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`${API}/natal/suggest?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const d = await r.json();
        setSugg(d.cities || []); setPick(0);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!date) { setError("Без даты рождения карты не будет."); return; }
    if (!city) { setError("Выберите город из подсказки — нужны координаты и часовой пояс."); return; }
    if (!unknownTime && !time) { setError("Укажите время или отметьте, что оно неизвестно."); return; }

    setBusy(true);
    setSlow(false);
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
          place: cityLabel(city), unknown_time: unknownTime,
        }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); setResult(null); }
      else {
        setResult(d);
        track("natal_chart", { year: Number(date.slice(0, 4)), known: unknownTime ? 0 : 1 });
      }
    } catch {
      setError("Сервер не ответил. Похоже, он ещё просыпается — попробуйте ещё раз через минуту.");
    } finally {
      clearTimeout(slowTimer);
      setBusy(false); setSlow(false);
    }
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
          <a className="ef-back" href="../">← на сайт</a>
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
            <input id="ef-city" type="text" value={cityText} placeholder="Абакан"
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

        {(error || slow || (!result && !busy)) && (
          <p className={"ef-hint" + (error ? " ef-error" : "")}>
            {error ? error
              : slow ? "Сервер просыпается после простоя — это занимает до минуты."
              : "Координаты и часовой пояс подставятся сами. Время влияет на дома и асцендент."}
          </p>
        )}

        <div className="ef-box" ref={boxRef} data-empty={result ? "0" : "1"}
             aria-label={result ? "Натальная карта" : undefined} />

        {result && (
          <>
            <div className="ef-grid">
              <section className="ef-read">
                <h2>Что из этого следует</h2>
                {result.note && <p className="ef-note">{result.note}</p>}
                <p className="ef-lead">{result.reading.lead}</p>
                {result.reading.blocks.map((b, i) => <p key={i}>{bold(b)}</p>)}
                {result.reading.verdict && <p className="ef-verdict">{result.reading.verdict}</p>}
              </section>

              <section className="ef-data">
                <h2>Положения</h2>
                <ul>
                  {result.chart.planets.map((p) => (
                    <li key={p.name}>
                      <span className="g">{p.name}</span>
                      <span className="v">{p.label}</span>
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
                      <span className="d">{a.exact.toFixed(2)}°</span>
                    </li>
                  ))}
                </ul>
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

      {hasField && (
        <button className="ef-toggle" type="button" onClick={toggleField} title="Клавиша F">
          фон: <b>{fieldOn ? "поле" : "поток"}</b>
        </button>
      )}
    </div>
  );
}
