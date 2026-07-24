import ParticleText, { PItem } from "./ParticleText";

const items: PItem[] = [
  { n: "01", t: "МонТерра", d: "ГЕОДЕЗИЯ · МОНИТОРИНГ · 3D", tags: ["ВЕБ", "ДИЗАЙН", "3D"] },
  { n: "02", t: "SmartNet", d: "ВЕБ-ПЛАТФОРМА · UI / UX", tags: ["ПО", "ВЕБ", "UI/UX"] },
  { n: "03", t: "Промгеосервис", d: "КОРПОРАТИВНЫЙ САЙТ", tags: ["ВЕБ", "ДИЗАЙН"] },
  { n: "04", t: "СКАЛА", d: "ПРОДУКТ · 3D · МОУШН", tags: ["ПРОДУКТ", "3D", "MOTION"] },
  { n: "05", t: "Lynq", d: "ПРОМЫШЛЕННЫЙ СКАНЕР", tags: ["ПРОДУКТ", "3D"] },
  { n: "06", t: "КГР", d: "САЙТ КОМПАНИИ", tags: ["ВЕБ", "ДИЗАЙН"] },
];

// vibrant but deep multi-colour palette — readable on the light background
const palette = [
  "37,71,200",    // deep blue
  "14,138,126",   // deep teal
  "109,63,214",   // purple
  "192,42,134",   // magenta
  "208,106,18",   // burnt orange
  "43,138,78",    // green
  "58,63,176",    // indigo
];

export default function Lab() {
  return <ParticleText id="lab" eyebrow="03 — LAB" items={items} theme="light" palette={palette} />;
}
