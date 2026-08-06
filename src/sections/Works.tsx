import WorksFly from "./WorksFly";
import { PItem } from "./ParticleText";

const items: PItem[] = [
  { n: "01", t: "Разработка сайтов", d: "ЛЕНДИНГИ · КОРПОРАТИВНЫЕ · МАГАЗИНЫ", tags: ["HTML", "CSS", "JS"] },
  { n: "02", t: "Дизайн и интерфейсы", d: "ПРОТОТИПЫ · СИСТЕМЫ · АДАПТИВ", tags: ["UI", "UX", "FIGMA"] },
  { n: "03", t: "Моушн-дизайн", d: "АНИМАЦИЯ · РОЛИКИ · ПЕРЕХОДЫ", tags: ["MOTION", "ANIMATION"] },
  { n: "04", t: "3D-визуализация", d: "ПРОДУКТ · СЦЕНЫ · РЕНДЕР", tags: ["3D", "RENDER"] },
  { n: "05", t: "Нейросети и AI", d: "ГЕНЕРАЦИЯ · ОБРАБОТКА · АВТОМАТИЗАЦИЯ", tags: ["AI", "GENERATIVE"] },
  { n: "06", t: "Брендинг и графика", d: "ЛОГОТИП · ФИРСТИЛЬ · ГАЙДЛАЙН", tags: ["BRAND", "GRAPHIC"] },
];

export default function Works() {
  return <WorksFly id="works" eyebrow="02 — РАБОТЫ" items={items} />;
}
