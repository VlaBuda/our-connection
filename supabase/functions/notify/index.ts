// Edge function "notify": sends push notifications.
//  - {type:"nudge", kind}          from the app: partner presses "нагадати попити" etc.
//  - {type:"thanks", id}           from the app: I answered my partner's nudge ("Пʼю воду")
//  - {type:"show", caption}        from the app: I shared a photo in "Хочу тобі показати"
//  - {type:"status"}               from the app: I changed "Що я зараз роблю" (push only for military statuses)
//  - {type:"plan", id, event}      from the app: "Наш час" — new plan, "я за", new time
//  - {type:"state", dir, changes}  from the app: my state changed (dir = "better" | "worse" | absent)
//  - {type:"tick"} + x-cron-secret from pg_cron: water / food / check-in reminders
// Deploy with "Verify JWT" turned OFF; the function checks callers itself.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Service key: legacy name first, then the newer "secret keys" JSON.
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] as string;
  } catch { return ""; }
}
const SERVICE_KEY = serviceKey();
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
webpush.setVapidDetails(
  "mailto:" + (Deno.env.get("VAPID_CONTACT") ?? "noreply@example.com"),
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const TZ = "Europe/Kyiv";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function kyivNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24 };
}

async function pushTo(userId: string, payload: Record<string, unknown>) {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6 },
      );
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, (e as Error).message);
    }
  }
}

// Returns true if this reminder may be sent now, and records it.
async function allow(userId: string, kind: string, minutes: number) {
  const { data } = await admin.from("reminders_sent").select("sent_at").eq("user_id", userId).eq("kind", kind).maybeSingle();
  if (data && Date.now() - new Date(data.sent_at).getTime() < minutes * 60_000) return false;
  await admin.from("reminders_sent").upsert({ user_id: userId, kind, sent_at: new Date().toISOString() });
  return true;
}

// "Наш час": human time in Kyiv — "сьогодні о 20:00", "завтра о 19:30", "пт, 25 жовт. о 20:00".
const PLAN_ICON: Record<string, string> = { game: "🎮", watch: "🎬", call: "📞", other: "✨" };
function kyivDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function whenText(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  const day = kyivDate(d), today = kyivDate(new Date()), tomorrow = kyivDate(new Date(Date.now() + 864e5));
  if (day === today) return `сьогодні о ${time}`;
  if (day === tomorrow) return `завтра о ${time}`;
  const date = new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
  return `${date} о ${time}`;
}
const planLine = (p: Record<string, unknown>) =>
  `${PLAN_ICON[p.kind as string] ?? "✨"} ${p.title}${p.at ? " · " + whenText(p.at as string) : ""}`;

// Reminder ~30 minutes before a planned "Наш час", to both people. Runs day and night.
async function planReminders() {
  const soon = new Date(Date.now() + 40 * 60_000).toISOString();
  const { data: plans } = await admin.from("plans").select("*")
    .is("done_at", null).gt("at", new Date().toISOString()).lte("at", soon);
  let sent = 0;
  for (const p of plans ?? []) {
    const { data: people } = await admin.from("profiles").select("id").eq("couple_id", p.couple_id);
    for (const person of people ?? []) {
      if (!(await allow(person.id, "plan:" + p.id, 24 * 60))) continue;
      await pushTo(person.id, { title: "Скоро ваш час", body: planLine(p), tag: "plan-" + p.id });
      sent++;
    }
  }
  return sent;
}

const lastTs = (a: unknown) => (Array.isArray(a) && a.length ? Number(a[a.length - 1]) : 0);
const has = (v: unknown, k: string) => (Array.isArray(v) ? v.includes(k) : v === k);

async function tick() {
  const { date, hour } = kyivNow();
  const plansSent = await planReminders();
  if (hour < 9 || hour >= 22) return { skipped: "night", plansSent };
  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const users = [...new Set((subs ?? []).map((s) => s.user_id))];
  let sent = 0;
  for (const uid of users) {
    const { data: row } = await admin.from("days").select("data").eq("user_id", uid).eq("day", date).maybeSingle();
    const d = (row?.data ?? {}) as Record<string, unknown>;
    const now = Date.now();
    if (hour >= 10 && !d.energy && (await allow(uid, "checkin:" + date, 24 * 60))) {
      await pushTo(uid, { title: "Як ти?", body: "Відміть, скільки зараз сил. Це один дотик.", tag: "checkin" });
      sent++;
    }
    // Rest reminder: on low-energy days people often keep working anyway.
    const restEvery = d.energy === 1 ? 90 : d.energy === 2 ? 150 : 0;
    if (restEvery && hour >= 10 && hour < 21 && (await allow(uid, "rest", restEvery))) {
      await pushTo(uid, {
        title: "Пауза",
        body: d.energy === 1
          ? "Сил майже немає. 10 хвилин полежати без роботи й телефону теж справа."
          : "Сил небагато. Зроби перерву хвилин на 10, поки не стало нуль.",
        tag: "rest",
      });
      sent++;
    }
    const w = lastTs(d.water);
    if ((w ? now - w > 2.5 * 3600_000 : hour >= 10) && (await allow(uid, "water", 150))) {
      await pushTo(uid, { title: "Вода", body: "Давно не було води. Ковток зараз?", tag: "water" });
      sent++;
    }
    const f = lastTs(d.food);
    if ((f ? now - f > 4.5 * 3600_000 : hour >= 12) && (await allow(uid, "food", 240))) {
      await pushTo(uid, { title: "Їжа", body: "Давно не було їжі. Хоч щось маленьке.", tag: "food" });
      sent++;
    }
  }
  return { users: users.length, sent };
}

const NUDGE_TEXT: Record<string, string> = {
  water: "нагадує тобі попити води",
  food: "нагадує тобі поїсти",
  rest: "нагадує тобі відпочити",
  embrace: "обіймає тебе 🫂",
  hug: "думає про тебе",
};
// What the partner sees after a nudge was answered. Same words as in app.js (REPLY_THANKS).
const THANKS: Record<string, string> = {
  water: "Пʼю воду 💧 Дякую, що нагадуєш!",
  food: "Іду їсти 🍽 Дякую, що нагадуєш!",
  rest: "Роблю паузу 🌿 Дякую, що нагадуєш!",
  embrace: "Дякую за обійми 🤍 Стало трохи тепліше",
  hug: "І я про тебе думаю 🤍",
};
const NEED_TEXT: Record<string, string> = {
  call: "чекає дзвінка, коли зможеш",
  text: "чекає будь-якого повідомлення",
  know: "просить просто знати, без питань",
  alone: "хоче трохи побути наодинці. Це не про тебе",
  together: "хоче побути разом",
};

function stateLines(d: Record<string, unknown>) {
  const lines: string[] = [];
  if (d.need === "own" && d.needText) lines.push(`просить: «${String(d.needText).slice(0, 120)}»`);
  else if (d.need && NEED_TEXT[d.need as string]) lines.push(NEED_TEXT[d.need as string]);
  if (has(d.sleep, "nightmares")) lines.push("були кошмари");
  if (d.head === "migraine") lines.push("мігрень");
  else if (d.head === "prodrome") lines.push("наближається мігрень");
  if (d.energy === 1) lines.push("сил майже немає");
  if (d.unsure) lines.push("не розуміє свій стан");
  const heavy: Record<string, string> = {
    panic: "паніка", rage: "лють", shutdown: "шатдаун", depressed: "пригніченість", empty: "порожнеча",
    apathy: "апатія", hopeless: "безнадія", despair: "відчай", grief: "горе", burnout: "вигорання",
  };
  for (const k of Object.keys(heavy)) if (has(d.emo, k)) lines.push(heavy[k]);
  if (has(d.mood, "cry")) lines.push("хочеться плакати");
  else if (has(d.mood, "scared")) lines.push("страшно");
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (body.type === "tick") {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "forbidden" }, 403);
    return json(await tick());
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "not signed in" }, 401);

  if (body.type === "test") {
    await pushTo(user.id, { title: "Наш звʼязок", body: "Сповіщення працюють. Так виглядатимуть нагадування.", tag: "test" });
    return json({ ok: true });
  }

  const { data: me } = await admin.from("profiles").select("*").eq("id", user.id).single();
  if (!me?.couple_id) return json({ ok: true, note: "no partner yet" });
  const { data: partner } = await admin.from("profiles").select("*")
    .eq("couple_id", me.couple_id).neq("id", user.id).maybeSingle();
  if (!partner) return json({ ok: true, note: "no partner yet" });
  const name = me.name || "Твоя людина";

  if (body.type === "nudge") {
    const kind = String(body.kind);
    if (!NUDGE_TEXT[kind]) return json({ error: "bad kind" }, 400);
    if (!(await allow(user.id, "nudge:" + kind, 115))) return json({ ok: true, note: "too soon" });
    await pushTo(partner.id, { title: name, body: `${name} ${NUDGE_TEXT[kind]}`, tag: "nudge-" + kind });
    return json({ ok: true });
  }

  if (body.type === "thanks") {
    const { data: n } = await admin.from("nudges").select("*").eq("id", String(body.id)).maybeSingle();
    if (!n || n.to_user !== user.id || !n.answered_at) return json({ error: "not found" }, 404);
    await pushTo(n.from_user, { title: name, body: THANKS[n.kind] ?? "Дякую!", tag: "thanks-" + n.kind });
    return json({ ok: true });
  }

  if (body.type === "show") {
    if (!(await allow(user.id, "show", 1))) return json({ ok: true, note: "too soon" });
    const caption = String(body.caption ?? "").trim().slice(0, 120);
    await pushTo(partner.id, {
      title: name,
      body: caption ? `Хоче тобі показати: ${caption}` : "Хоче тобі щось показати 📷",
      tag: "show",
    });
    return json({ ok: true });
  }

  if (body.type === "status") {
    // Only military statuses are worth a push; everyday ones are just visible on the card.
    const STATUS_PUSH: Record<string, string> = {
      position: "🪖 на позиції", task: "🎯 на завданні", duty: "🕑 на чергуванні", base: "🏢 у штабі або на базі",
      training: "📋 на навчаннях", road: "🚙 у дорозі", rest: "🛌 відпочинок", offline: "📵 без звʼязку",
    };
    if ((me.status_set ?? "civil") !== "military" || !STATUS_PUSH[me.status]) return json({ ok: true, note: "no push" });
    if (!(await allow(user.id, "status", 2))) return json({ ok: true, note: "too soon" });
    await pushTo(partner.id, { title: name, body: STATUS_PUSH[me.status], tag: "status" });
    return json({ ok: true });
  }

  if (body.type === "plan") {
    const { data: p } = await admin.from("plans").select("*").eq("id", String(body.id)).maybeSingle();
    if (!p || p.couple_id !== me.couple_id) return json({ error: "not found" }, 404);
    const ev = String(body.event);
    const text = ev === "agree" ? `Я за! ${planLine(p)}`
      : ev === "time" ? `Пропонує інший час: ${planLine(p)}`
      : p.at ? `Пропонує разом: ${planLine(p)}` : `Нова ідея на «Наш час»: ${planLine(p)}`;
    await pushTo(partner.id, { title: name, body: text, tag: "plan-" + p.id });
    return json({ ok: true });
  }

  if (body.type === "state") {
    const { date } = kyivNow();
    const { data: row } = await admin.from("days").select("data").eq("user_id", user.id).eq("day", date).maybeSingle();
    const lines = stateLines((row?.data ?? {}) as Record<string, unknown>);
    const dir = body.dir === "better" || body.dir === "worse" ? body.dir : null;
    const changes = (Array.isArray(body.changes) ? body.changes : []).map((c) => String(c).slice(0, 80)).slice(0, 5);
    if (!dir && !lines.length) return json({ ok: true, note: "nothing to send" });
    if (!(await allow(user.id, "state", 3))) return json({ ok: true, note: "too soon" });
    if (dir) {
      const head = dir === "better" ? "стало краще 🌤" : "стало важче";
      const extra = dir === "worse" ? lines.filter((l) => !changes.some((c) => c.includes(l))) : [];
      await pushTo(partner.id, {
        title: `${name}: ${head}`,
        body: [...changes, ...extra].join(" · ") || lines.join(" · "),
        tag: "state",
      });
    } else {
      await pushTo(partner.id, { title: name, body: lines.join(" · "), tag: "state" });
    }
    return json({ ok: true });
  }

  return json({ error: "unknown type" }, 400);
});
