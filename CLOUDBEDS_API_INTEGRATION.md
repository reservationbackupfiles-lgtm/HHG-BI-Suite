# Cloudbeds API Integration Plan

## Objective
Connect HHG BI Suite to Cloudbeds so approved PMS data can be synchronized for the HHG portfolio without manually downloading reports for each property.

## Authentication decision
Build for **one organization/group API key first**, while keeping the connector capable of using separate property-level keys if Cloudbeds does not grant group access.

Cloudbeds supports group API access for one, multiple, or all properties under one credential set when an organization/group user authorizes the integration. Property-level credentials only access the authorized property. The group-level option must be confirmed in HHG's Cloudbeds account.

Official references:
- Property and Group Account API Access: https://developers.cloudbeds.com/docs/property-and-group-account-api-access
- API key quickstart: https://developers.cloudbeds.com/docs/quickstart-guide-api-authentication-for-property-level-users
- API reference: https://hotels.cloudbeds.com/api/docs/

## HHG property mapping
The connector must map Cloudbeds property IDs to the existing HHG property codes. Do not assume the Cloudbeds property ID is the same as an HHG code or database ID.

| HHG code | Property |
|---|---|
| HHO | H Hotel |
| HSR | S Resort |
| PCL | Piece Lio |
| NBR | Nacpan Beach Resort |
| NBG | Nacpan Beach Glamping |
| NBV | Nacpan Beach Villas |
| JBH | J Boutique Hotel |
| HZG | Z Garden Hotel |
| HVV | Villa V |

The authoritative Cloudbeds property IDs will be discovered from the authorized getHotels response and verified against the property names before syncing.

**Pre-sync data cleanup required:** the current repository schema uses `HJH` for J Boutique Hotel, while HHG's current operational code is `JBH`. The schema also lists NBR as 26 rooms, while the latest HHG correction is 25. Do not silently map or overwrite these values during API onboarding. Confirm the canonical property codes and room counts, then reconcile the existing `properties` table before enabling automated sync.

## Security architecture
1. The GitHub Pages frontend must never contain a Cloudbeds API key, client secret, or service-role key.
2. Store Cloudbeds credentials as Supabase Edge Function secrets (or another server-side secret manager).
3. The browser calls an authenticated Supabase Edge Function. The function validates the signed-in HHG user and admin permission before accessing Cloudbeds.
4. The Edge Function calls Cloudbeds, handles pagination, rate limits, retries, and errors, then writes normalized records to Supabase.
5. Keep a sync log with property, endpoint, date range/cursor, rows fetched, rows inserted/updated, result, and error details. Never log credentials or sensitive payment-card data.

## Proposed rollout
### Phase 1 — Connection validation
- Obtain written confirmation from Cloudbeds that HHG can use group/organization API access for the nine properties.
- Create a read-only API credential with only the scopes needed for the first approved use case.
- Call getHotels, capture the nine Cloudbeds property IDs, and verify each property mapping.
- Test one property first; then test all nine.

### Phase 2 — Read-only data synchronization
- Confirm which Cloudbeds endpoints and scopes expose the same data HHG currently imports (ADR, reservations, pace, and transaction details).
- Build server-side sync functions only after confirming endpoint availability, response fields, pagination, and date semantics.
- Preserve the current manual CSV/XLSX importer as a fallback during parallel validation.
- Reconcile API totals against existing Cloudbeds exports before using API data in management reporting.

### Phase 3 — Production controls
- Add scheduled incremental sync and a manual admin-triggered sync.
- Use idempotent upserts and a stable source identifier from Cloudbeds; do not rely only on guest name/date/amount as a duplicate key.
- Add monitoring for expired/revoked credentials, scope errors, rate limits, partial property failures, and stale data.
- Keep manual uploads available until the API feed has passed reconciliation for all nine properties.

## What HHG needs to request from Cloudbeds
1. Confirm API access is enabled for the HHG group account and whether one group-level API key can authorize all nine properties.
2. Confirm the nine properties are linked under the same organization/group account and that the authorizing user has organization admin/owner access plus API & Integration permissions.
3. Confirm the required read-only scopes/endpoints for reservations, room revenue/ADR, pace or availability, and transaction/folio details.
4. Confirm whether any required reporting data is only available through Cloudbeds Insights API rather than the standard PMS API.
5. Ask whether API access has an additional subscription cost and request a sandbox/test environment if available.

## Credential handling checklist
- Do not send API keys in chat, email, screenshots, GitHub, or frontend config files.
- Do not paste credentials into SQL Editor or browser developer tools.
- Once the server-side function is deployed, enter the key only as a Supabase secret through the Supabase project controls/CLI.
- If a key is exposed, revoke/regenerate it in Cloudbeds immediately.

## Current implementation status
**Planning / pre-integration.** No Cloudbeds credential has been installed, no live API request has been made, and no API-sourced data is being written to production tables yet. The existing report upload workflow remains the source of record until the API integration has been tested and reconciled.