# Запас сил

Невеликий застосунок на двох: стан, сон, голова, настрій, «що мені зараз треба»,
вода й їжа з нагадуваннями одне одному, скринька «для нас» і особисті задачі.

Працює як веб-застосунок (PWA): відкривається в Chrome і встановлюється на телефон.
Дані зберігаються в Supabase, сайт публікується через GitHub Pages.

## Структура

- `index.html`, `styles.css`, `app.js` — інтерфейс
- `config.js` — публічні налаштування (адреса Supabase, публічний ключ, публічний ключ сповіщень)
- `sw.js`, `manifest.webmanifest`, `icons/` — встановлення на телефон і пуші
- `supabase/schema.sql` — таблиці й правила доступу
- `supabase/functions/notify/` — функція, що надсилає сповіщення
- `supabase/cron.sql` — нагадування за розкладом (кожні 20 хвилин, з 9:00 до 22:00 за Києвом)

## Налаштування (один раз)

1. **База.** Supabase → SQL Editor → New query → встав увесь `supabase/schema.sql` → Run.
2. **Вхід.** Authentication → Sign In / Providers → Email: вимкни «Confirm email»
   (або залиш і підтверджуй пошту листом). Authentication → URL Configuration →
   Site URL: `https://vlabuda.github.io/our-connection/`.
3. **Функція сповіщень.** Edge Functions → Deploy a new function → Via Editor →
   назва `notify` → встав код з `supabase/functions/notify/index.ts` → Deploy.
   Потім у налаштуваннях функції вимкни «Verify JWT».
4. **Секрети функції.** Edge Functions → Secrets: додай
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `VAPID_CONTACT` (твоя пошта).
   Значення ніколи не комітяться в цей репозиторій.
5. **Розклад.** SQL Editor → встав `supabase/cron.sql`, заміни `YOUR_CRON_SECRET`
   на той самий `CRON_SECRET` → Run.
6. **Сайт.** GitHub → Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.

## Встановлення на телефон

Відкрий `https://vlabuda.github.io/our-connection/` у Chrome → меню ⋮ →
«Додати на головний екран» / «Встановити застосунок». Увійди, зʼєднай пару кодом,
у налаштуваннях натисни «Увімкнути сповіщення».
