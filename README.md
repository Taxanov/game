# BAVIX — сайт студии

Статичный одностраничный сайт, сборка не нужна.

- `index.html` — разметка и контент
- `assets/style.css` — стили (токены цвета и шрифтов в начале файла)
- `assets/main.js` — анимации: интро как в ролике identity.build, поле точек за курсором, глитч логотипа, сценарии на скролле
- `assets/vendor/` — GSAP 3.12.5, ScrollTrigger, Lenis 1.1.13
- `assets/fonts/` — Unbounded, Onest, JetBrains Mono (OFL, через @fontsource)

## Запуск локально

```
npx serve .
```

## Публикация

Подходит любой статичный хостинг: GitHub Pages (Settings → Pages → ветка и корень), Netlify, Vercel, Cloudflare Pages.
