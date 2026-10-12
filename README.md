# HHG BI SUITE

Static site (GitHub Pages) + Supabase. Roles: **admin** uploads reports and sees logs, **viewer** only reads.

Files: `index.html` (app) · `importer.js` (report parsers) · `config.js` (Supabase URL and key) · `supabase/schema.sql` (database)

## Setup
1. **Database**: Supabase > SQL Editor > paste `supabase/schema.sql` > Run, then `supabase/002_users.sql` > Run (user management and viewer date windows). Then set the real code and room count for `Villa V` in the `properties` table.
2. **Key**: Project Settings > API > copy the `anon public` key into `config.js`. Never put the `service_role` key in this repo.
3. **Users**: Authentication > Providers > Email: turn off "Allow new users to sign up". Add users under Authentication > Users. Everyone starts as a viewer.
4. **First admin**: SQL Editor: `update profiles set role = 'admin' where email = 'you@example.com';`
5. **GitHub**: push this folder, then Settings > Pages > Deploy from branch > `main` / root.
   Add the Pages URL in Supabase > Authentication > URL Configuration > Site URL.

## Users and access
- **Admin**: uploads files, sees every date, and manages users on the **Users** page.
- **Viewer**: read-only. An admin can set "Can view from / to" so the viewer only sees data inside those dates. The database enforces it. Leave both empty for no limit.
- Add people in Supabase > Authentication > Users. They appear on the Users page as viewers, and an admin can promote them or switch them off (Active).
- Note: a viewer's comparison with last year only shows last-year data that falls inside their dates.

## Daily routine (admin)
Upload & logs > choose the property > attach the reports > Upload. Repeat per property.

| Report | On upload |
|---|---|
| ADR (`average_daily_rate.xlsx`), up to 2 files | Replaces the same property / year / month. The report only covers 2 years, so upload file 1 (2025 and 2026) and file 2 (2027). Any years in a file are saved. |
| Reservations by Booking Date | Replaces that property's rows inside the file's booking-date range |
| Pace Report | Saved as a snapshot. The date comes from the file's "Generated at" line (Philippine time) unless you type one. Older snapshots are kept. |

Every upload (success or error) is written to `upload_log`: time, user, property, report, rows, result. The Upload & logs page shows any day's summary.
The Pace screen needs one Pace Report upload per property per day to build its daily record table.

## How the numbers work
- Room revenue = ADR report "Room Rates". Rooms sold = "Accommodations Booked".
- Occupancy = rooms sold / (total rooms x days). ADR = revenue / rooms sold. RevPAR = revenue / (total rooms x days). Group figures are weighted by rooms.
- Pace: room nights on the books for a month = sum of the Pace Report's "Rooms Sold" for that month's stay dates. Occupancy uses the report's "Capacity".
- Cancellation rate = Cancelled bookings / all bookings (also by room nights). Value lost = Suggested Deposit of cancelled bookings. Where the export shows "-" for room nights, nights are taken from check-in and check-out.
- Next year on the Compare page is whatever the ADR report already holds for that year (on the books).
- Total rooms come from the `properties` table. Keep it accurate.
