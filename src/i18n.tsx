import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { PItem } from "./sections/ParticleText";
import type { LabItem, Stat } from "./sections/LabProcess";

export type Lang = "ru" | "en";

const BASE = import.meta.env.BASE_URL;

type Dict = {
  metaDesc: string;
  nav: {
    home: string;
    about: string;
    works: string;
    lab: string;
    contact: string;
    menu: string;
    close: string;
  };
  hero: { tag: string };
  about: {
    eyebrow: string;
    lead: ReactNode;
    p1: string;
    p2: string;
    chips: string[];
    altHuman: string;
    altDigital: string;
  };
  works: {
    eyebrow: string;
    introTitle: ReactNode;
    introText: string;
    items: PItem[];
  };
  lab: {
    eyebrow: string;
    title: ReactNode;
    lead: string;
    contrib: string;
    items: LabItem[];
    stats: Stat[];
  };
  contact: { eyebrow: string; title: ReactNode };
};

export const content: Record<Lang, Dict> = {
  ru: {
    metaDesc:
      "ELLHOME — Electronic Life Lab. Сайты, интерфейсы, моушн и 3D. A home for digital ideas.",
    nav: {
      home: "ГЛАВНАЯ",
      about: "ОБО МНЕ",
      works: "РАБОТЫ",
      lab: "LAB",
      contact: "КОНТАКТЫ",
      menu: "Меню",
      close: "Закрыть",
    },
    hero: { tag: "A home for digital ideas." },
    about: {
      eyebrow: "01 — ОБО МНЕ",
      lead: (
        <>
          Привет, я Михаил.<br />Дизайнер и разработчик цифровых продуктов.<br />
          ELLHOME — моя лаборатория, где идея и технология тянутся навстречу друг другу.
        </>
      ),
      p1: "Создаю сайты и программное обеспечение, работаю с моушном и 3D — от первой идеи до готового продукта. Мне интересно соединять технологии и визуальную форму так, чтобы они не просто работали, а создавали впечатление.",
      p2: "Каждый проект начинается с касания — момента, когда идея встречается с воплощением. Именно это и есть ELLHOME.",
      chips: ["ДИЗАЙН", "КОД", "МОУШН", "3D", "ИИ", "БРЕНДИНГ"],
      altHuman: "Михаил",
      altDigital: "Цифровой образ",
    },
    works: {
      eyebrow: "02 — РАБОТЫ",
      introTitle: (
        <>
          Что я <b>делаю</b>.
        </>
      ),
      introText:
        "Полный цикл цифрового продукта — от идеи и дизайна до кода, движения и запуска.",
      items: [
        { n: "01", t: "Разработка сайтов", d: "ЛЕНДИНГИ · КОРПОРАТИВНЫЕ · МАГАЗИНЫ", tags: ["HTML", "CSS", "JS"] },
        { n: "02", t: "Дизайн и интерфейсы", d: "ПРОТОТИПЫ · СИСТЕМЫ · АДАПТИВ", tags: ["UI", "UX", "FIGMA"] },
        { n: "03", t: "Моушн-дизайн", d: "АНИМАЦИЯ · РОЛИКИ · ПЕРЕХОДЫ", tags: ["MOTION", "ANIMATION"] },
        { n: "04", t: "3D-визуализация", d: "ПРОДУКТ · СЦЕНЫ · РЕНДЕР", tags: ["3D", "RENDER"] },
        { n: "05", t: "Нейросети и AI", d: "ГЕНЕРАЦИЯ · ОБРАБОТКА · АВТОМАТИЗАЦИЯ", tags: ["AI", "GENERATIVE"] },
        { n: "06", t: "Брендинг и графика", d: "ЛОГОТИП · ФИРСТИЛЬ · ГАЙДЛАЙН", tags: ["BRAND", "GRAPHIC"] },
      ],
    },
    lab: {
      eyebrow: "03 — LAB",
      title: (
        <>
          Избранные проекты<br />и <b>эксперименты</b>
        </>
      ),
      lead: "От идеи до запуска — веб, интерфейсы, 3D и моушн под задачи бренда. Проекты раскрываются по мере прокрутки.",
      contrib: "МОЙ ВКЛАД",
      items: [
        {
          n: "01", t: "МонТерра", img: `${BASE}works/01.webp`,
          tagline: "Экосистема цифровых решений для геотехнического мониторинга и контроля деформаций.",
          about: "Создал единый цифровой образ бренда: от корпоративного сайта до презентаций, 3D-визуализации и анимации. Основной задачей было показать сложные инженерные технологии современным, понятным и визуально выразительным языком.",
          points: ["Креативная концепция", "UX/UI дизайн", "Веб-разработка", "3D-визуализация", "Motion Design"],
        },
        {
          n: "02", t: "SmartNet", img: `${BASE}works/02.webp`,
          tagline: "Сервис высокоточного позиционирования с собственной сетью GNSS-базовых станций.",
          about: "Разработал цифровую экосистему сервиса: публичный сайт, личный кабинет пользователей, систему управления подписками и интерфейсы взаимодействия с сетью базовых станций. Особое внимание уделил удобству работы с технически сложным продуктом.",
          points: ["Архитектура сервиса", "UX/UI дизайн", "Веб-разработка", "Проектирование интерфейсов", "API-интеграции"],
        },
        {
          n: "03", t: "Промгеосервис", img: `${BASE}works/03.webp`,
          tagline: "Сервисный центр геодезического и мониторингового оборудования.",
          about: "Полностью обновил цифровое присутствие компании: разработал современный сайт, переработал структуру информации и создал визуальную систему, которая помогает просто рассказывать о сложных технических услугах.",
          points: ["Креативная концепция", "UX/UI дизайн", "Веб-разработка", "Графический дизайн"],
        },
        {
          n: "04", t: "СКАЛА", img: `${BASE}works/04.webp`,
          tagline: "Интерферометрический радар для дистанционного мониторинга деформаций.",
          about: "Создал визуальный язык продукта: от 3D-моделей до рекламных роликов и презентационных материалов. Главная задача — сделать высокотехнологичное оборудование понятным и визуально привлекательным.",
          points: ["Арт-дирекшн", "3D-визуализация", "Motion Design", "Рекламные материалы"],
        },
        {
          n: "05", t: "Lynq", img: `${BASE}works/05.webp`,
          tagline: "Линейка профессиональных GNSS-приёмников.",
          about: "Разработал визуальную концепцию продуктовой линейки, подготовил 3D-визуализации, графические материалы и единый стиль представления оборудования для различных цифровых и печатных носителей.",
          points: ["Арт-дирекшн", "3D-визуализация", "Графический дизайн", "Продуктовая презентация"],
        },
        {
          n: "06", t: "КГР", img: `${BASE}works/06.webp`,
          tagline: "Инженерные изыскания и геотехническое сопровождение строительства.",
          about: "Создал корпоративный сайт и современную визуальную коммуникацию компании, объединив техническую информацию, услуги и проекты в понятную цифровую структуру.",
          points: ["Креативная концепция", "UX/UI дизайн", "Веб-разработка", "Графический дизайн"],
        },
      ],
      stats: [
        { v: "06", l: "ПРОЕКТОВ" },
        { v: "100%", l: "ВОВЛЕЧЁННОСТЬ" },
        { v: "∞", l: "ИДЕЙ" },
      ],
    },
    contact: {
      eyebrow: "04 — КОНТАКТЫ",
      title: (
        <>
          Есть идея? <b>Напиши мне</b>.
        </>
      ),
    },
  },

  en: {
    metaDesc:
      "ELLHOME — Electronic Life Lab. Websites, interfaces, motion and 3D. A home for digital ideas.",
    nav: {
      home: "HOME",
      about: "ABOUT",
      works: "WORK",
      lab: "LAB",
      contact: "CONTACT",
      menu: "Menu",
      close: "Close",
    },
    hero: { tag: "A home for digital ideas." },
    about: {
      eyebrow: "01 — ABOUT",
      lead: (
        <>
          Hi, I'm Mikhail.<br />Designer and developer of digital products.<br />
          ELLHOME is my lab, where idea and technology reach toward one another.
        </>
      ),
      p1: "I build websites and software, and work with motion and 3D — from the first idea to a finished product. I like connecting technology and visual form so they don't just work, but leave an impression.",
      p2: "Every project starts with a touch — the moment an idea meets its realization. That's exactly what ELLHOME is.",
      chips: ["DESIGN", "CODE", "MOTION", "3D", "AI", "BRANDING"],
      altHuman: "Mikhail",
      altDigital: "Digital self",
    },
    works: {
      eyebrow: "02 — WORK",
      introTitle: (
        <>
          What I <b>do</b>.
        </>
      ),
      introText:
        "The full cycle of a digital product — from idea and design to code, motion and launch.",
      items: [
        { n: "01", t: "Web development", d: "LANDING · CORPORATE · STORES", tags: ["HTML", "CSS", "JS"] },
        { n: "02", t: "Design & interfaces", d: "PROTOTYPES · SYSTEMS · RESPONSIVE", tags: ["UI", "UX", "FIGMA"] },
        { n: "03", t: "Motion design", d: "ANIMATION · REELS · TRANSITIONS", tags: ["MOTION", "ANIMATION"] },
        { n: "04", t: "3D visualization", d: "PRODUCT · SCENES · RENDER", tags: ["3D", "RENDER"] },
        { n: "05", t: "Neural nets & AI", d: "GENERATION · PROCESSING · AUTOMATION", tags: ["AI", "GENERATIVE"] },
        { n: "06", t: "Branding & graphics", d: "LOGO · IDENTITY · GUIDELINES", tags: ["BRAND", "GRAPHIC"] },
      ],
    },
    lab: {
      eyebrow: "03 — LAB",
      title: (
        <>
          Selected projects<br />and <b>experiments</b>
        </>
      ),
      lead: "From idea to launch — web, interfaces, 3D and motion for brand goals. Projects unfold as you scroll.",
      contrib: "MY CONTRIBUTION",
      items: [
        {
          n: "01", t: "MonTerra", img: `${BASE}works/01.webp`,
          tagline: "An ecosystem of digital solutions for geotechnical monitoring and deformation control.",
          about: "Created a unified digital identity for the brand: from the corporate site to presentations, 3D visualization and animation. The main goal was to present complex engineering technology in a modern, clear and visually expressive language.",
          points: ["Creative concept", "UX/UI design", "Web development", "3D visualization", "Motion design"],
        },
        {
          n: "02", t: "SmartNet", img: `${BASE}works/02.webp`,
          tagline: "A high-precision positioning service with its own network of GNSS base stations.",
          about: "Built the service's digital ecosystem: public website, user personal cabinet, a subscription-management system and interfaces for working with the base-station network. I paid special attention to making a technically complex product easy to use.",
          points: ["Service architecture", "UX/UI design", "Web development", "Interface design", "API integrations"],
        },
        {
          n: "03", t: "Promgeoservice", img: `${BASE}works/03.webp`,
          tagline: "A service center for geodetic and monitoring equipment.",
          about: "Fully renewed the company's digital presence: built a modern website, reworked the information structure and created a visual system that helps explain complex technical services simply.",
          points: ["Creative concept", "UX/UI design", "Web development", "Graphic design"],
        },
        {
          n: "04", t: "SKALA", img: `${BASE}works/04.webp`,
          tagline: "An interferometric radar for remote deformation monitoring.",
          about: "Created the product's visual language: from 3D models to promo reels and presentation materials. The main goal was to make high-tech equipment clear and visually appealing.",
          points: ["Art direction", "3D visualization", "Motion design", "Promotional materials"],
        },
        {
          n: "05", t: "Lynq", img: `${BASE}works/05.webp`,
          tagline: "A line of professional GNSS receivers.",
          about: "Developed the visual concept for the product line, prepared 3D visualizations, graphic materials and a unified style for presenting the equipment across digital and print media.",
          points: ["Art direction", "3D visualization", "Graphic design", "Product presentation"],
        },
        {
          n: "06", t: "KGR", img: `${BASE}works/06.webp`,
          tagline: "Engineering surveys and geotechnical support for construction.",
          about: "Built a corporate website and modern visual communication for the company, bringing technical information, services and projects into a clear digital structure.",
          points: ["Creative concept", "UX/UI design", "Web development", "Graphic design"],
        },
      ],
      stats: [
        { v: "06", l: "PROJECTS" },
        { v: "100%", l: "INVOLVEMENT" },
        { v: "∞", l: "IDEAS" },
      ],
    },
    contact: {
      eyebrow: "04 — CONTACT",
      title: (
        <>
          Got an idea? <b>Write to me</b>.
        </>
      ),
    },
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "ru", setLang: () => {} });

export const useLang = () => useContext(LangCtx);

const STORE_KEY = "ellhome_lang";

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch { /* storage unavailable */ }
  try {
    if (typeof navigator !== "undefined" && /^ru/i.test(navigator.language)) return "ru";
  } catch { /* noop */ }
  return "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORE_KEY, l); } catch { /* noop */ }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", content[lang].metaDesc);
  }, [lang]);

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}
