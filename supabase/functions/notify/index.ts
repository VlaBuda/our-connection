// Edge function "notify": sends push notifications.
//  - {type:"nudge", kind}          from the app: partner presses "нагадати попити" etc.
//  - {type:"state"}                from the app: I marked something my partner should know
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

const lastTs = (a: unknown) => (Array.isArray(a) && a.length ? Number(a[a.length - 1]) : 0);
const has = (v: unknown, k: string) => (Array.isArray(v) ? v.includes(k) : v === k);

async function tick() {
  const { date, hour } = kyivNow();
  if (hour < 9 || hour >= 22) return { skipped: "night" };
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
  hug: "думає про тебе",
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
  if (d.need && NEED_TEXT[d.need as string]) lines.push(NEED_TEXT[d.need as string]);
  if (has(d.sleep, "nightmares")) lines.push("були кошмари");
  if (d.head === "migraine") lines.push("мігрень");
  else if (d.head === "prodrome") lines.push("наближається мігрень");
  if (d.energy === 1) lines.push("сил майже немає");
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
    await pushTo(partner.id, { title: name, body: `${name} ${NUDGE_TEXT[kind]}`, tag: "nudge-" + kind });
    return json({ ok: true });
  }

  if (body.type === "state") {
    const { date } = kyivNow();
    const { data: row } = await admin.from("days").select("data").eq("user_id", user.id).eq("day", date).maybeSingle();
    const lines = stateLines((row?.data ?? {}) as Record<string, unknown>);
    if (!lines.length) return json({ ok: true, note: "nothing to send" });
    if (!(await allow(user.id, "state", 3))) return json({ ok: true, note: "too soon" });
    await pushTo(partner.id, { title: name, body: lines.join(" · "), tag: "state" });
    return json({ ok: true });
  }

  return json({ error: "unknown type" }, 400);
});
