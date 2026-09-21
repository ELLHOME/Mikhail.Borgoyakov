import { useMemo, useRef, useState } from "react";
import { BANK } from "./bank";

export type PairWord = { en: string; ru: string };
export type PairsResult = { clean: string[]; missed: PairWord[] };

const ROUNDS = 3;
const PER = 5;
const RANK: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const key = (s: string) => s.trim().toLowerCase();

/** Слова на игру: сначала те, что пора повторить, потом свои остальные,
 *  потом стартовый набор по уровню. В одном раунде не бывает двух слов с
 *  одинаковым переводом — иначе правильных ответов два, а засчитан один. */
export function pickRounds(deck: { en: string; ru: string; due?: number }[], level: string,
                           now = Date.now()): PairWord[][] {
  const cap = RANK[level] ?? 1;
  const due = shuffle(deck.filter((w) => (w.due ?? 0) <= now));
  const rest = shuffle(deck.filter((w) => (w.due ?? 0) > now));
  const mine = new Set(deck.map((w) => key(w.en)));
  const bank = shuffle(BANK.filter((w) => RANK[w.lvl] <= Math.max(cap, 1) && !mine.has(key(w.en))));
  const pool: PairWord[] = [...due, ...rest, ...bank].map((w) => ({ en: w.en, ru: w.ru }));

  const rounds: PairWord[][] = [];
  const used = new Set<string>();
  for (let r = 0; r < ROUNDS; r++) {
    const round: PairWord[] = [];
    const ru = new Set<string>();
    for (const w of pool) {
      if (round.length === PER) break;
      if (used.has(key(w.en)) || ru.has(key(w.ru))) continue;
      round.push(w); used.add(key(w.en)); ru.add(key(w.ru));
    }
    if (round.length < 2) break;
    rounds.push(round);
  }
  return rounds;
}

type Props = {
  deck: { en: string; ru: string; due?: number }[];
  level: string;
  canSpeak: boolean;
  say: (text: string, slow: boolean) => void;
  onFinish: (r: PairsResult) => void;
  onClose: () => void;
  onAgain: () => void;
};

export default function Pairs({ deck, level, canSpeak, say, onFinish, onClose, onAgain }: Props) {
  const [rounds] = useState(() => pickRounds(deck, level));
  const [r, setR] = useState(0);
  const round = rounds[r] || [];
  const left = useMemo(() => shuffle(round), [r]);        // eslint-disable-line react-hooks/exhaustive-deps
  const right = useMemo(() => shuffle(round), [r]);       // eslint-disable-line react-hooks/exhaustive-deps
  const [pickL, setPickL] = useState<string | null>(null);
  const [pickR, setPickR] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const missed = useRef<Map<string, PairWord>>(new Map());
  const [finished, setFinished] = useState(false);
  const total = rounds.reduce((n, x) => n + x.length, 0);

  function tryMatch(l: string, rr: string) {
    if (l === rr) {
      const next = new Set(done); next.add(l); setDone(next);
      setPickL(null); setPickR(null);
      if (next.size === round.length) {
        // последний в раунде — короткая пауза, чтобы увидеть, что всё сошлось
        window.setTimeout(() => {
          if (r + 1 < rounds.length) { setR(r + 1); setDone(new Set()); }
          else {
            setFinished(true);
            const all = rounds.flat();
            onFinish({
              clean: all.filter((w) => !missed.current.has(key(w.en))).map((w) => w.en),
              missed: [...missed.current.values()],
            });
          }
        }, 450);
      }
    } else {
      const w = round.find((x) => x.en === l);
      if (w) missed.current.set(key(w.en), w);
      setWrong([l, rr]);
      window.setTimeout(() => { setWrong(null); setPickL(null); setPickR(null); }, 650);
    }
  }

  function tapLeft(en: string) {
    if (done.has(en) || wrong) return;
    if (canSpeak) say(en, false);
    if (pickR) tryMatch(en, pickR);
    else setPickL(pickL === en ? null : en);
  }
  function tapRight(en: string) {
    if (done.has(en) || wrong) return;
    if (pickL) tryMatch(pickL, en);
    else setPickR(pickR === en ? null : en);
  }

  if (!rounds.length) {
    return (
      <section className="st-pairs">
        <p>Слов пока не хватает для игры.</p>
        <button type="button" className="st-back" onClick={onClose}>Вернуться</button>
      </section>
    );
  }

  if (finished) {
    const miss = [...missed.current.values()];
    const cleanN = total - miss.length;
    return (
      <section className="st-pairs st-pairsdone" aria-live="polite">
        <h2>{miss.length === 0 ? "Без единой ошибки" : "Готово"}</h2>
        <p className="st-score"><b>{cleanN}</b> из {total} с первого раза</p>
        {miss.length > 0 && (
          <>
            <p className="st-muted">Эти слова попадут в «Мои слова» и вернутся на повторении:</p>
            <ul className="st-missed">
              {miss.map((w) => <li key={w.en}><b>{w.en}</b> — {w.ru}</li>)}
            </ul>
          </>
        )}
        <div className="st-pairsnav">
          <button type="button" className="st-yes" onClick={onAgain}>Ещё раз</button>
          <button type="button" className="st-back" onClick={onClose}>Вернуться</button>
        </div>
      </section>
    );
  }

  const state = (side: "l" | "r", en: string) =>
    done.has(en) ? "done"
      : wrong && ((side === "l" && wrong[0] === en) || (side === "r" && wrong[1] === en)) ? "wrong"
      : (side === "l" ? pickL : pickR) === en ? "pick" : "";

  return (
    <section className="st-pairs" aria-live="polite">
      <div className="st-pairshead">
        <p className="st-muted st-small">Раунд {r + 1} из {rounds.length}</p>
        <div className="st-progress" aria-hidden="true">
          <i style={{ width: `${((r + done.size / round.length) / rounds.length) * 100}%` }} />
        </div>
      </div>
      <h2>Соедините пары</h2>
      <p className="st-muted st-small">Нажмите слово слева, потом его перевод справа.</p>
      <div className="st-cols">
        <div>
          {left.map((w) => (
            <button key={w.en} type="button" lang="en" data-s={state("l", w.en)}
                    disabled={done.has(w.en)} onClick={() => tapLeft(w.en)}>{w.en}</button>
          ))}
        </div>
        <div>
          {right.map((w) => (
            <button key={w.en} type="button" data-s={state("r", w.en)}
                    disabled={done.has(w.en)} onClick={() => tapRight(w.en)}>{w.ru}</button>
          ))}
        </div>
      </div>
      <button type="button" className="st-back" onClick={onClose}>Закончить</button>
    </section>
  );
}
