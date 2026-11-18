# Supabase project files

- `migrations/202611180001_cloudbeds_integration.sql`: additive Cloudbeds mapping and sync-log tables with admin-only access.
- `functions/cloudbeds-admin/index.ts`: admin-authenticated status endpoint; no Cloudbeds calls or production sync yet.
- `functions/README.md`: deployment and secret-handling instructions.

Existing root-level `schema.sql` and `002_users.sql` remain the original project bootstrap scripts. Apply the new migration only to the linked HHG Supabase project after reviewing it.
