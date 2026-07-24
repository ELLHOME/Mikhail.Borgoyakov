# ELLHOME — Electronic Life Lab

Персональный сайт-портфолио. Перенесён с одностраничного HTML на современный стек:
**React + Vite + TypeScript + Tailwind CSS v4**.

## Структура

```
src/
  App.tsx              — сборка страницы
  main.tsx             — точка входа
  index.css            — глобальные стили (Tailwind + перенесённый дизайн)
  fonts.css            — встроенные шрифты Montserrat (self-hosted)
  components/
    Nav.tsx            — меню + мобильный оверлей
    Footer.tsx
  sections/
    Hero.tsx           — руки-hero (canvas, кадры проигрываются по скроллу)
    About.tsx          — «Обо мне» + слайдер before/after
    Works.tsx          — «Что я делаю» (колода → сетка)
    Lab.tsx            — портфолио (раскрытие + светящаяся рамка)
    Contact.tsx
  hooks/
    useSiteEffects.ts  — вся скролл-логика и интерактив
public/
  frames/              — кадры анимации рук (f00..f48.webp)
  before.webp, after.webp — фото для слайдера «Обо мне»
```

## Запуск локально

```bash
npm install
npm run dev      # http://localhost:5173
```

## Сборка

```bash
npm run build    # результат в dist/
npm run preview  # локальный просмотр собранного
```

## Деплой на GitHub Pages (автосборка)

В репозитории уже лежит `.github/workflows/deploy.yml`.

1. Залей проект в репозиторий (ветка `main`).
2. Settings → Pages → **Source: GitHub Actions**.
3. При каждом пуше в `main` сайт собирается и публикуется автоматически.

`vite.config.ts` использует `base: "./"` — сайт работает в любой подпапке
(в т.ч. `username.github.io/repo/`), домен настраивать не нужно.
