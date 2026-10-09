# HHG BI Suite

Static dashboard (GitHub Pages) backed by Supabase. Pages: Login, Dashboard, Compare, Pace, Reservations, Upload & logs. KPI cards on every page, with Lucide icons.

## Setup
1. **Supabase** → SQL Editor → run `supabase/schema.sql` (tables, RLS, 9 properties).
2. Create users in Authentication → Users, then make yourself admin:
   `update profiles set role='admin' where email='hanszpaul@gmail.com';`
3. Put your **anon public** key (Project Settings → API) in `config.js`. It is safe to publish; RLS protects the data.
4. Push to GitHub → Settings → Pages → Deploy from branch `main` / root.

Until a key is set, the site runs in **demo mode** with sample data.

## Notes
- Viewers can read; only admins can upload (enforced by RLS).
- Excel column headers are matched by common names (see `ALIAS` in `js/app.js`). Adjust if your reports differ.
- Next-year forecast = non-cancelled reservations by check-in date, plus an optional `targets` row.
