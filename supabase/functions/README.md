# Supabase Edge Functions

## Cloudbeds preparation

The `cloudbeds-admin` function currently exposes an admin-authenticated **status-only** action. It verifies the signed-in Supabase user and checks the user's `profiles.role` before reading integration setup metadata.

It does not call Cloudbeds, validate an API key, import records, or write to production revenue/reservation tables.

### Deploy

From the repository root, after linking the correct Supabase project:

```bash
supabase login
supabase link --project-ref ueflhrlvclewvcfbnkmx
supabase db push
supabase functions deploy cloudbeds-admin
```

Do not run these commands against another project. Review the migration before applying it.

### Secrets

The function uses Supabase's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not add the service-role key to GitHub, `config.js`, SQL files, or chat.

When Cloudbeds issues credentials, store them as Edge Function secrets, for example:

```bash
supabase secrets set CLOUDBEDS_API_KEY="(paste locally in your terminal; never commit)"
```

The placeholder above is documentation only. Do not execute it with the literal placeholder value.

### Invoke

Authenticated admin request body:

```json
{ "action": "status" }
```

The function reports whether the secret exists, mapping rows, and the latest sync log. It never returns secret values.

### Before enabling a real Cloudbeds connection

- Confirm the current Cloudbeds authentication method, base URL, scopes, and group/property authorization.
- Confirm all nine Cloudbeds property IDs and reconcile the HHG property-code discrepancies first.
- Implement and test a read-only property discovery call.
- Add endpoint-specific sync functions only after confirming response schemas, pagination, date semantics, and stable source IDs.
- Reconcile API results against manual exports before production writes.
 
### Admin property mapping management

The `cloudbeds-admin` function also supports the authenticated admin action `save_mapping`. It validates the selected HHG `properties.id`, then inserts/updates the Cloudbeds ID as `pending`. A blank Cloudbeds ID clears that mapping. Duplicate Cloudbeds IDs are rejected by the database unique constraint. The UI never marks a mapping verified; verification must happen against actual Cloudbeds API property data before any synchronization.
