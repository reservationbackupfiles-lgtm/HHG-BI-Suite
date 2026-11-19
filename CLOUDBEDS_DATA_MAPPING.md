# HHG BI Suite — Cloudbeds Data Mapping & Readiness Contract

**Status:** Preparation only. This document defines the intended mapping and validation rules before Cloudbeds API access is available. It does not authorize API synchronization or production writes.

## 1. Current architecture observed in the repository

The current frontend reads the following Supabase objects:

| Current object | Current use in HHG BI Suite | Cloudbeds integration approach |
|---|---|---|
| `properties` | HHG property master; actual deployed shape observed by the user is `id, name, rooms, sort` | Use `properties.id` as the internal foreign key. Derive the HHG code from the approved name-to-code mapping until a canonical code column is agreed. |
| `adr_daily` | Monthly room nights sold, room revenue and available room nights by property and stay date | Populate only after the relevant Cloudbeds endpoint/fields and date semantics are confirmed. |
| `adr_history` | Historical ADR/room-revenue snapshots by property, snapshot date and stay date | Preserve snapshots; do not overwrite history with a current API pull. |
| `reservations` | Reservation-level records used by booking-date reporting | Use Cloudbeds reservation ID as the stable external identifier if provided. Preserve booking date, stay dates, status, source, room type, nights, guest count and financial totals only where exposed and authorized. |
| `pace_snapshots` | Historical pace snapshots by property, stay date and snapshot date | Do not assume standard PMS API exposes the same Pace report. Confirm endpoint/product entitlement first. |
| `cancellations` | Cancellation reporting used by the application | Confirm whether cancellations are a distinct endpoint/event or reservation status/history. Preserve cancellation timestamp separately from booking/stay dates. |
| `transaction_details` | Expanded transaction/folio detail used by Revenue Monitoring | Requires a confirmed endpoint and stable transaction ID. Do not upsert by guest/date/amount. Keep raw source payload and current classification/reconciliation rules. |
| `cloudbeds_property_map` | HHG property ID ↔ Cloudbeds property ID | Save mappings as `pending`; only mark verified after matching API-returned ID and property name. |
| `cloudbeds_sync_log` | Sync audit | Record endpoint, property, date window/cursor, status, fetched/inserted/updated counts and sanitized error. Never store secrets. |

**Important schema drift found:** the committed legacy `schema.sql` describes a different, older schema (`properties.code`, `monthly_adr`, legacy `pace`, and a different reservations shape). The live Supabase `properties` table reported by the user has `id, name, rooms, sort`. The current application also queries newer objects such as `adr_daily`, `adr_history`, `pace_snapshots`, `cancellations`, and `transaction_details`. Do not rerun the legacy schema file or use it as the live database contract. A fresh schema export from the actual Supabase project is required before any schema migration is proposed.

## 2. HHG property master mapping

Use internal `properties.id` as the HHG database key. HHG codes are application-level aliases until a canonical code field is added deliberately.

| HHG code | Property name | Latest HHG room inventory | Cloudbeds property ID |
|---|---|---:|---|
| HHO | H Hotel | 41 | Pending API discovery |
| HSR | S Resort | 44 | Pending API discovery |
| PCL | Piece Lio | 36 | Pending API discovery |
| NBR | Nacpan Beach Resort | 25 | Pending API discovery |
| NBG | Nacpan Beach Glamping | 18 | Pending API discovery |
| NBV | Nacpan Beach Villas | 15 | Pending API discovery |
| JBH | J Boutique Hotel | 14 | Pending API discovery |
| HZG | Z Garden Hotel | 28 | Pending API discovery |
| HVV | Villa V | 39 | Pending API discovery |

Do not infer a Cloudbeds ID from HHG code, property database ID, property name, or URL. Retrieve IDs from an authorized Cloudbeds property-list response and verify names before saving.

## 3. Canonical data mapping proposal

### Reservations

| Canonical HHG field | Existing application field | Source meaning / rule |
|---|---|---|
| `property_id` | `property_id` | Internal `properties.id`, resolved only through verified property mapping |
| `external_reservation_id` | Not confirmed in current table shape | Cloudbeds immutable reservation ID; required stable key for API sync |
| `reservation_no` | `reservation_no` | Cloudbeds confirmation/reference number; retain as business reference, not sole key unless guaranteed unique |
| `booking_date` | `booking_date` | Booking-created date/time converted using property timezone rules |
| `check_in`, `check_out` | Same | Stay dates, not booking or transaction dates |
| `status` | `status` | Preserve raw Cloudbeds status and map to normalized status separately |
| `source`, `source_category` | Same | Preserve raw source/channel and normalized category separately |
| `room_type` | `room_type` | Preserve API value; room-level allocation may require a separate endpoint |
| `room_nights` | `nights` in current UI write path | Use API-provided room nights if available; otherwise calculate only after validating multi-room reservation semantics |
| `guests` | Not confirmed in current UI write path | Guest count only if exposed and permitted |
| `grand_total`, `paid`, `balance_due`, `taxes` | Existing fields vary by deployed schema | Store only when endpoint exposes them; define currency, tax inclusion and payment semantics before reporting |

### ADR / room revenue

| Canonical concept | Existing application destination | Rule |
|---|---|---|
| Stay date / business date | `adr_daily.stay_date` | Confirm whether API revenue is attributed by stay date or business date |
| Rooms sold / room nights | `adr_daily.rooms_sold` | Must reconcile with Cloudbeds ADR report definition |
| Room revenue | `adr_daily.room_revenue` | Define tax/fee inclusion and currency; do not mix payments with earned room revenue |
| Available room nights | `adr_daily.rooms_available` | Use approved inventory and availability rules; do not infer from reservations alone |
| Snapshot date | `adr_history.snapshot_date` | Preserve each extract's as-of date for historical comparisons |

### Pace

Keep `pace_snapshots` as a snapshot series. Confirm whether Cloudbeds offers the same pace metrics via API or whether pace must be derived from reservation snapshots. Do not replace historical pace snapshots with a current-state reservation query.

### Transactions / Revenue Monitoring

| Canonical concept | Existing transaction field |
|---|---|
| Cloudbeds transaction identifier | Not confirmed in current schema; must be added only after endpoint contract is known |
| Reservation reference | `reservation_no` |
| Transaction timestamp | `transaction_date` / normalized transaction date |
| Business date | `business_date` |
| Service/stay date | `service_date` |
| Transaction type | `transaction_type` |
| Debit / credit | `debits`, `credits` |
| Net amount | Derived using existing signed convention; preserve debit/credit separately |
| Room revenue type | `room_revenue_type` |
| Tax / fee / refund / void / adjustment indicators | Existing corresponding columns |
| Original payload | `raw_data` |

The API transaction sync must preserve the current Revenue Monitoring classifications: voids excluded from revenue but retained for audit; deposits/payments separated from earned revenue; taxes and fees not treated as room revenue; inter-entity transfers excluded from external consolidated revenue; sample/test records excluded from financial KPIs but retained in audit/exclusion reporting. Do not discard negative adjustments automatically.

## 4. Sync identity and duplicate protection

Before writing any API rows, identify a stable Cloudbeds record ID for each entity. Proposed keys:

- Properties: Cloudbeds property ID.
- Reservations: Cloudbeds reservation ID + property scope if the ID is not globally unique.
- Transactions: Cloudbeds transaction ID + property scope.
- Snapshot records: property + snapshot timestamp/date + stay date/metric dimension.

Do not use guest name, dates, amount, reservation confirmation number alone, or CSV row number as API idempotency keys. Preserve source file upload keys for manual imports separately from API external IDs.

## 5. Date, timezone and currency rules

- Store source timestamps and the property-local business date separately where available.
- Confirm each property's timezone from Cloudbeds/account configuration; do not assume all API timestamps are UTC or local.
- Keep booking date, stay/service date, transaction date, and business date distinct.
- Confirm API currency and whether amounts include tax, fees, or commissions.
- Do not combine payment/collection totals with earned room revenue.

## 6. API readiness checklist

- [ ] Cloudbeds confirms group-level API access and all nine properties are within scope.
- [ ] Cloudbeds confirms available endpoints/scopes for properties, reservations, ADR/revenue, transactions/folios and pace.
- [ ] Retrieve and verify all nine property IDs.
- [ ] Confirm response schemas, pagination, rate limits, historical lookback and incremental-update behavior.
- [ ] Confirm stable reservation and transaction IDs.
- [ ] Confirm timestamp/timezone and currency semantics.
- [ ] Test one property read-only.
- [ ] Reconcile against Cloudbeds exports for matching date windows.
- [ ] Test all nine properties and partial-failure handling.
- [ ] Enable scheduled sync only after successful reconciliation.

## 7. Explicitly out of scope until API access is granted

No Cloudbeds API call, production import, automated schedule, or source-of-truth switch is enabled by this document. Manual CSV/XLSX imports remain active. No production tables are altered by this preparation contract.
