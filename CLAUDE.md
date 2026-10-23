# Наш звʼязок — project notes

A small PWA for a couple (both neurodivergent, both burned out; he serves in the military, she works
several jobs). Purpose: share state without having to explain it in words, remind each other to
eat/drink/rest, keep the connection alive at a distance. Owner: Vla (GitHub VlaBuda). UI language: Ukrainian.
Tone of all copy: warm, plain, no guilt, no streaks or penalties. Gender-neutral wording where both use it.

## Stack
- Static site on GitHub Pages: https://vlabuda.github.io/our-connection/ (deploys from `main`, root).
- Supabase project `usucbzsikqieaywmfkfd` (Frankfurt): auth (email+password, email confirmation off),
  Postgres with RLS, realtime, Edge Function `notify`, pg_cron.
- No build step. `index.html` + `styles.css` + `app.js` (vanilla JS, supabase-js UMD from jsDelivr).
- `config.js` holds only public values (URL, publishable key, VAPID public key).
- Secrets (VAPID private key, CRON_SECRET) live only in Supabase Edge Function secrets. Never commit them.
- Both users are on Android + Chrome; she also uses Edge on a Windows laptop.

## Data model (see supabase/schema.sql, supabase/migrations/)
- `profiles` (name, color, theme, couple_id) · `couples` (invite_code)
- `days` (user_id, day, data jsonb): shared daily state — energy 1–4, need, sleep[], head, pain, signs[],
  mood[], whys[{text,ts}], water[ts], food[ts]. Partner can read, only owner writes.
- `private_items` (tasks, daily care ticks `d_<date>`, custom care `care_custom`) — owner only.
- `box` ("Для нас": tell/dream/talk, done_at/done_by for history) · `push_subscriptions` · `reminders_sent`.
- `nudges` (water/food/rest/embrace/hug): one per kind per 2h from a sender (RLS `nudge_ok`); never deleted —
  `dismissed_at`, `answered_at` (reply button → partner gets a thank-you), `thanks_seen_at`.
- `shows` + private Storage bucket `shows` (`<couple_id>/<user_id>/<file>.jpg`): "Хочу тобі показати" photos.
- `days.data.log` [{ts,k,from,to}]: today's state changes (energy/need/sleep/head/mood/why), shown on cards;
  "fresh" marks use localStorage `seenLog`. Push "стало краще/важче" compares with localStorage `pushBase`.
- `plans` ("Наш час": game/watch/call/other, optional `at`, `proposed_by`, `agreed_at`, `done_at`); cron tick
  sends a reminder to both ~30 min before `at`.
- Status "Що я зараз роблю" on `profiles` (status key or 'own' + status_text, status_at, status_set civil|military);
  lists in `STATUS` (app.js); push to partner only for military statuses.
- Emotion map (How We Feel style, ~80 words in `EMO` with intensity i 1–3, quadrant first, search): `days.data.emo[]` (≤5) + `unsure` flag.
  `hardNow()` decides when the partner's card offers the "embrace" nudge.
- "Нервова система" on `profiles.ns` {long:[{k,text?,since}], episodes:[{id,k,ts,end?}]}: long states (burnout, autistic
  burnout…) stay until removed; episodes (`NS_EP`: shutdown, meltdown, panic attack…) show "now" tips for 1 h, then
  "after" tips until `h` hours pass or "Вже легше". Push type "ns".
- Episode recovery is configurable: `episode.h` (hours, -1 = until "Вже легше"), else `ns.defaults[k]`, else NS_EP h;
  episodes can carry a `note` (what triggered it).
- Food kinds: `days.data.foodK` {ts: snack|bite|meal}; snack/bite shift the next reminder sooner (FOOD_K, also in notify tick).
- `watches` (one-time "сповісти, коли зайде / оновить стан") fire via notify type "seen"; `profiles.last_seen_at`.
- Own "що мені треба": `days.data.need = "own"` + `needText`; saved list in `private_items` id `needs_own`.

## Applying changes
- SQL changes: add a new file in `supabase/migrations/` and ask the user to run it in Supabase SQL Editor.
- `notify` function changes: the user redeploys by pasting `supabase/functions/notify/index.ts` into
  Supabase → Edge Functions → notify → Code → Deploy ("Verify JWT" must stay off).
- Bump `CACHE` in `sw.js` on every frontend release.
- The user is non-technical-ish (PM background); give step-by-step instructions in Ukrainian.

## UI
- Tabs: Ми (two cards, partner's advice under each state; "Хочу тобі показати" photo feed) · Стан · Турбота (now, water/food with
  editable times, self-care by energy level, tasks) · Наш час (plans, ideas, history) · Для нас (with history) · Статистика.
- Her colour red, his yellow. 13 themes in `THEMES` (app.js); images in `themes/` with `-sm` previews
  and AI-upscaled `-hd` versions used on screens ≥900px (`HD_READY`).
- Emoji picker on text inputs.
- Settings dialog has tabs (Про мене · Вигляд · Сповіщення · Пара); theme picker is a dropdown with previews.

## Ideas not done yet
- Fun personality quizzes ("яка я дівчина?" style) — user will pick the format later.
- Description of her typical week / recurring tasks (she plans to write a spec).
