# 🏔️ GLACIER

**Build the day.** A daily-system PWA — schedule, habits, streaks, stats, notes, and body tracking in a single fast file. Dark, athletic, installable on your phone's home screen.

**Live app:** https://glacier-tawny.vercel.app

## Features

- **Today** — a live "Right Now" card that tracks your daily timeline in real time, with a countdown to your next task, quick-log habit checks, and a food/macros tracker
- **Timeline** — build your own daily schedule; every task has a time, note, and priority (none/low/medium/high). Tap to check off, tap the pencil to edit
- **Habits & streaks** — fully customizable habit groups with emoji icons, plus tap-to-count clean streaks (hold to reset)
- **Stats** — daily score ring, fire streaks, 30-day heatmap, weekly trend, and all-time records
- **Leveling** — every habit, task, meal, and weigh-in earns XP; climb from Rookie to GOAT
- **Body** — weight logging with an SVG trend chart and pace projection toward your goal
- **Notes** — rich text editor (bold/italic/underline/strike, sizes, colors, alignment)
- **Inspo** — a personal vision board of images
- **Cloud sync** — optional account (Supabase) backs up everything and syncs across devices; the app is fully functional offline/local-first without one
- **Reminders** — branded Web Push notifications for key tasks via a tiny serverless endpoint

## Stack

One HTML file. No framework, no build step. Vanilla JS + CSS custom properties, localStorage-first with optional Supabase sync (email/password auth, one `app_data` table with row-level security). Deployed as static files + one serverless function on Vercel.

```
app/
  index.html            the entire app
  sw.js                 service worker (push notifications)
  manifest.webmanifest  PWA manifest + icons
  api/tick.js           reminder trigger (Web Push, env-driven)
supabase/
  glacier-schema.sql    sync table + RLS policies
```

## Self-hosting

1. **Deploy the app**: drop the `app/` folder on any static host (Vercel, Netlify, Pages). Done — it works local-only out of the box.
2. **Cloud sync (optional)**: create a free [Supabase](https://supabase.com) project, run `supabase/glacier-schema.sql` in its SQL editor, then set `SB_URL` and `SB_KEY` (anon key) near the top of `index.html`.
3. **Push reminders (optional, needs step 2)**: generate VAPID keys (`npx web-push generate-vapid-keys`), set env vars on your host — `VAPID_PUBLIC` (also update it in `index.html`), `VAPID_PRIVATE`, `VAPID_SUBJECT`, `TICK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` — and point an external cron (e.g. cron-job.org) at `/api/tick?key=<TICK_SECRET>` every 5 minutes. Each signed-in device that turns on notifications registers itself; every user gets their own schedule in their own timezone.

## License

MIT
