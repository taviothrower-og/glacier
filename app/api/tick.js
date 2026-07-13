// Glacier reminder trigger. An external cron pings this every 5 min; it sends
// branded Web Push reminders to every registered device — each user gets their
// own schedule (synced by the app), evaluated in their own timezone.
//
// Env vars:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE — to read push_subs + user schedules
//   VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT — push credentials
//   TICK_SECRET — shared secret checked against ?key=
//   REMINDER_SCHEDULE / PUSH_SUBSCRIPTION — legacy single-user fallback (optional)
const webpush = require("web-push");

function loadJSON(name, fallback) {
  try { return JSON.parse(process.env[name] || ""); } catch (e) { return fallback; }
}
const LEGACY_SCHEDULE = loadJSON("REMINDER_SCHEDULE", {});
const LEGACY_SUB = loadJSON("PUSH_SUBSCRIPTION", null);
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE || "";

const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const fmt12 = (t) => { const [h, m] = String(t).split(":"); const H = +h; const ap = H < 12 ? "AM" : "PM"; const h12 = H % 12 || 12; return `${h12}:${m} ${ap}`; };

// Wall-clock now in a given IANA timezone.
function nowIn(tz) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const get = (t) => p.find((x) => x.type === t).value;
    let hour = parseInt(get("hour"), 10); if (hour === 24) hour = 0;
    return { weekday: get("weekday"), min: hour * 60 + parseInt(get("minute"), 10) };
  } catch (e) { return null; }
}

async function sbFetch(path) {
  const r = await fetch(SB_URL + path, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
  if (!r.ok) throw new Error("supabase " + r.status);
  return r.json();
}
async function sbDelete(path) {
  await fetch(SB_URL + path, { method: "DELETE", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }).catch(() => {});
}

function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:example@example.com",
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
}
async function push(sub, title, body) {
  await webpush.sendNotification(sub, JSON.stringify({ title, body }));
}

// Which of this user's tasks are due in [bucket, bucket+5) local time?
function dueFor(main, weekday, bucket) {
  const due = [];
  const sched = (main.schedDefs && main.schedDefs.byDay && main.schedDefs.byDay[weekday]) || [];
  for (const block of sched) {
    for (const t of (block.tasks || [])) {
      if (!t.remind) continue;
      const m = toMin(t.t);
      if (m >= bucket && m < bucket + 5) due.push({ t: t.t, title: t.title, note: t.note, block: block.head });
    }
  }
  for (const ut of (main.userTasks || [])) {
    if (ut.remind === false || !ut.time) continue;
    const m = toMin(ut.time);
    if (m >= bucket && m < bucket + 5) due.push({ t: ut.time, title: ut.title, note: ut.note, block: "Your tasks" });
  }
  // 9:00 AM learning tip for users who follow topics
  if (main.learnTopics && main.learnTopics.length && 540 >= bucket && 540 < bucket + 5) {
    due.push({ t: "09:00", title: "Today's tip", note: "Open the Learn tab in Glacier.", block: "Learn" });
  }
  return due;
}

module.exports = async (req, res) => {
  const key = (req.query && req.query.key) || "";
  if (!process.env.TICK_SECRET || key !== process.env.TICK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  initVapid();
  try {
    if (req.query.test) {
      if (!LEGACY_SUB) return res.status(200).json({ ok: false, error: "no legacy subscription for test" });
      await push(LEGACY_SUB, "🏔️ Glacier test", "Your reliable reminder trigger is live.");
      return res.status(200).json({ ok: true, test: true });
    }

    const report = { ok: true, sent: 0, devices: 0, cleaned: 0, legacy: false };
    let seenEndpoints = new Set();

    if (SB_URL && SB_KEY) {
      const subs = await sbFetch("/rest/v1/push_subs?select=user_id,endpoint,sub,tz,enabled&enabled=eq.true");
      report.devices = subs.length;
      if (subs.length) {
        const ids = [...new Set(subs.map((s) => s.user_id))].join(",");
        const mains = await sbFetch(`/rest/v1/app_data?select=user_id,value&key=eq.glacier_main&user_id=in.(${ids})`);
        const byUser = {}; mains.forEach((m) => { byUser[m.user_id] = m.value || {}; });
        for (const s of subs) {
          seenEndpoints.add(s.endpoint);
          const main = byUser[s.user_id]; if (!main) continue;
          const local = nowIn(s.tz || "America/Los_Angeles"); if (!local) continue;
          const bucket = Math.floor(local.min / 5) * 5;
          const due = dueFor(main, local.weekday, bucket);
          for (const t of due) {
            try {
              await push(s.sub, "⏰ " + t.title, `${t.block} · ${fmt12(t.t)}${t.note ? " — " + t.note : ""}`);
              report.sent++;
            } catch (e) {
              if (e.statusCode === 404 || e.statusCode === 410) {
                await sbDelete(`/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`);
                report.cleaned++;
                break;
              }
            }
          }
        }
      }
    }

    // Legacy single-device fallback — skipped once that device registers itself.
    if (LEGACY_SUB && !seenEndpoints.has(LEGACY_SUB.endpoint)) {
      const local = nowIn("America/Los_Angeles");
      const bucket = Math.floor(local.min / 5) * 5;
      const tasks = LEGACY_SCHEDULE[local.weekday] || [];
      const due = tasks.filter((t) => { const m = toMin(t.t); return m >= bucket && m < bucket + 5; });
      for (const t of due) {
        try { await push(LEGACY_SUB, "⏰ " + t.title, `${t.block} · ${fmt12(t.t)}${t.note ? " — " + t.note : ""}`); report.sent++; report.legacy = true; }
        catch (e) { /* legacy sub expired — app re-registers via push_subs */ }
      }
    }

    return res.status(200).json(report);
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.statusCode || e.message });
  }
};
