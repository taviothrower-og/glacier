// Glacier reminder trigger. An external cron pings this every 5 min; it sends a
// branded Web Push for any key task whose time falls in the current 5-minute
// bucket (Pacific). One push per task — reliable, no bursts.
//
// All personal data lives in env vars:
//   REMINDER_SCHEDULE — {"Monday":[{t,title,note,block},...], ...} per weekday
//   PUSH_SUBSCRIPTION — the device's Web Push subscription JSON
//   VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT — push credentials
//   TICK_SECRET — shared secret checked against ?key=
const webpush = require("web-push");

function loadJSON(name, fallback) {
  try { return JSON.parse(process.env[name] || ""); } catch (e) { return fallback; }
}
const SCHEDULE = loadJSON("REMINDER_SCHEDULE", {});
const SUBSCRIPTION = loadJSON("PUSH_SUBSCRIPTION", null);

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt12 = (t) => { const [h, m] = t.split(":"); const H = +h; const ap = H < 12 ? "AM" : "PM"; const h12 = H % 12 || 12; return `${h12}:${m} ${ap}`; };

// Pacific wall-clock now, via Intl (robust regardless of server TZ).
function pacificNow() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t) => p.find((x) => x.type === t).value;
  let hour = parseInt(get("hour"), 10); if (hour === 24) hour = 0;
  return { weekday: get("weekday"), min: hour * 60 + parseInt(get("minute"), 10) };
}

async function sendPush(title, body) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:example@example.com",
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
  await webpush.sendNotification(SUBSCRIPTION, JSON.stringify({ title, body }));
}

module.exports = async (req, res) => {
  const key = (req.query && req.query.key) || "";
  if (!process.env.TICK_SECRET || key !== process.env.TICK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!SUBSCRIPTION) return res.status(200).json({ ok: false, error: "PUSH_SUBSCRIPTION not configured" });
  try {
    if (req.query.test) {
      await sendPush("🏔️ Glacier test", "Your reliable reminder trigger is live.");
      return res.status(200).json({ ok: true, test: true });
    }
    const now = pacificNow();
    const bucket = Math.floor(now.min / 5) * 5; // current 5-min window
    const tasks = SCHEDULE[now.weekday] || [];
    const due = tasks.filter((t) => { const m = toMin(t.t); return m >= bucket && m < bucket + 5; });
    for (const t of due) await sendPush("⏰ " + t.title, `${t.block} · ${fmt12(t.t)}${t.note ? " — " + t.note : ""}`);
    return res.status(200).json({ ok: true, bucket, fired: due.map((t) => t.t) });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.statusCode || e.message });
  }
};
