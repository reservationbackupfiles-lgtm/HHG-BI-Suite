
 // Parsers for Cloudbeds PMS exports. Returns rows ready for Supabase.
(function (root) {
  const MS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
  const pad = n => String(n).padStart(2, '0');

  const iso = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    if (/^\d{4}-\d\d-\d\d/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const srcName = x => {
    if (x == null) return x;
    const s = String(x).trim().replace(/\s*\/\s*/g, ' / ');
    return /^website( \/ booking engine)?$/i.test(s) ? 'Website / Booking Engine' : s;
  };

  const find = (rows, test) => rows.findIndex(r => Array.isArray(r) && test(r.map(norm)));
  const fail = what => { throw new Error(`Could not find ${what}. Is this the right report for this upload slot?`); };

  function parseAdr(rows, code) {
    const hi = find(rows, n => n.includes('date') && n.some(k => /^adr\d{4}$/.test(k)));
    if (hi < 0) fail('the "Date / ADR <year>" header');

    const keys = rows[hi].map(norm), at = k => keys.indexOf(k);
    const years = keys.map(k => (k.match(/^adr(\d{4})$/) || [])[1]).filter(Boolean);
    const out = [];

    for (const r of rows.slice(hi + 1)) {
      if (!Array.isArray(r)) continue;
      const m = MS.indexOf(norm(r[at('date')]).slice(0, 3)) + 1;
      if (!m) continue;

      for (const y of years) {
        const sold = num(r[at('accommodationsbooked' + y)]);
        const rev = num(r[at('roomrates' + y)]);
        if (sold == null && rev == null) continue;
        out.push({
          property: code,
          year: +y,
          month: m,
          rooms_sold: sold,
          room_revenue: rev,
          adr: num(r[at('adr' + y)])
        });
      }
    }

    return { rows: out, note: `years ${years.join(', ')}` };
  }

  function generatedDate(rows) {
    for (const r of rows.slice(0, 8)) {
      const m = String(r[0] ?? '').match(/Generated at (\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/);
      if (m) {
        return new Date(
          Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) + 8 * 36e5
        ).toISOString().slice(0, 10);
      }
    }
    return null;
  }

  function parsePace(rows, code, override) {
    const gi = find(rows, n => n.includes('thisyear') && n.includes('lastyear'));
    if (gi < 0) fail('the "This Year / Last Year" header');

    const g = rows[gi].map(norm), a = g.indexOf('thisyear'), b = g.indexOf('lastyear');
    const hi = find(rows.slice(gi + 1), n => n.includes('roomssold')) + gi + 1;
    if (hi <= gi) fail('the "Rooms Sold" header');

    const h = rows[hi].map(norm);
    const col = (from, to, name) => {
      for (let i = from; i < to; i++) if (h[i] === name) return i;
      return -1;
    };

    const C = { ty: n => col(a, b, n), ly: n => col(b, h.length, n) };
    const snap = override || generatedDate(rows);
    if (!snap) throw new Error('No "Generated at" date in the file. Enter the snapshot date.');

    const out = [];
    for (const r of rows.slice(hi + 1)) {
      if (!Array.isArray(r)) continue;
      const m = String(r[0] ?? '').match(/^(\d\d)-(\d\d)$/);
      if (!m) continue;

      const v = (w, n) => num(r[C[w](n)]);
      out.push({
        property: code,
        snapshot_date: snap,
        month_no: +m[1],
        day: +m[2],
        ty_rooms_sold: v('ty', 'roomssold'),
        ty_room_revenue: v('ty', 'totalroomrevenue'),
        ty_capacity: v('ty', 'capacity'),
        ly_rooms_sold: v('ly', 'roomssold'),
        ly_room_revenue: v('ly', 'totalroomrevenue'),
        ly_capacity: v('ly', 'capacity')
      });
    }

    if (!out.length) fail('stay-date rows (MM-DD)');
    return { rows: out, snap, note: `snapshot ${snap}` };
  }

  function parseRes(rows, code) {
    const hi = find(rows, n => n.includes('reservationstatus') && n.includes('checkindate'));
    if (hi < 0) fail('the "Reservation Status / Check-In Date" header');

    const keys = rows[hi].map(norm);
    const g = (r, k) => {
      const i = keys.indexOf(k);
      return i < 0 ? undefined : r[i];
    };

    const guestKey = [
      'primaryguestfullname', 'primaryguestname', 'guestfullname',
      'guestname', 'primaryguest'
    ].find(k => keys.includes(k));

    const out = [];
    for (const r of rows.slice(hi + 1)) {
      if (!Array.isArray(r)) continue;
      const bd = iso(g(r, 'bookingdatetimeproperty'));
      if (!bd) continue;

      const cin = iso(g(r, 'checkindate')), cout = iso(g(r, 'checkoutdate'));
      let nights = num(g(r, 'roomnights'));
      if (nights == null && cin && cout) {
        nights = Math.round((new Date(cout) - new Date(cin)) / 864e5);
      }

      const guestName = guestKey ? String(g(r, guestKey) ?? '').trim() : '';
      out.push({
        property: code,
        reservation_no: g(r, 'reservationnumber') || null,
        booking_date: bd,
        status: g(r, 'reservationstatus'),
        guest_name: guestName,
        room_type: g(r, 'roomtypes'),
        source: srcName(g(r, 'reservationsource')),
        source_category: g(r, 'reservationsourcecategory'),
        check_in: cin,
        check_out: cout,
        room_nights: nights,
        guests: num(g(r, 'guestcount')),
        suggested_deposit: num(g(r, 'suggesteddeposit')),
        grand_total: num(g(r, 'grandtotal')),
        room_revenue: num(g(r, 'roomrevenuetotal')),
        taxes: num(g(r, 'totalreservationtaxes')),
        paid: num(g(r, 'reservationpaidamount')),
        balance_due: num(g(r, 'reservationbalancedue'))
      });
    }

    const ds = out.map(r => r.booking_date).sort();
    const named = out.filter(r => r.guest_name).length;
    const missingNo = out.filter(r => !r.reservation_no).length;

    return {
      rows: out,
      from: ds[0],
      to: ds.at(-1),
      note: `booked ${ds[0]} to ${ds.at(-1)} · guest names ${named}/${out.length} · missing reservation numbers ${missingNo}`
    };
  }

  function cancellationHeaderIndex(rows) {
    return (rows || []).findIndex(row =>
      Array.isArray(row) &&
      row.some(cell => norm(cell) === 'reservationnumber') &&
      row.some(cell => norm(cell) === 'cancellationdatetimeproperty')
    );
  }

  function parseCancellations(rows, propertyId) {
    const headerIndex = cancellationHeaderIndex(rows);
    if (headerIndex < 0) {
      fail('the "Reservation Number / Cancellation Date Time - Property" cancellation header');
    }

    const headers = rows[headerIndex].map(cell => String(cell ?? '').trim().toLowerCase());
    const index = Object.fromEntries(headers.map((header, i) => [header, i]));
    const get = (row, name) => {
      const i = index[name.toLowerCase()];
      return i == null ? '' : row[i];
    };

    const dateTime = value => {
      if (value == null || value === '') return null;
      if (value instanceof Date && !isNaN(value)) return value.toISOString();

      if (typeof value === 'number' && root.XLSX?.SSF?.parse_date_code) {
        const p = root.XLSX.SSF.parse_date_code(value);
        if (p) {
          return new Date(Date.UTC(
            p.y, p.m - 1, p.d, p.H || 0, p.M || 0, Math.floor(p.S || 0)
          )).toISOString();
        }
      }

      const s = String(value).trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

      const d = new Date(s);
      return isNaN(d) ? null : d.toISOString();
    };

    const numberValue = value => {
      if (value == null || value === '') return 0;
      const n = Number(String(value).replace(/[₱,$\s]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const textValue = value =>
      value == null || String(value).trim() === '' ? null : String(value).trim();

    const out = [];
    // Start after the actual header so the header itself is never imported as data.
    for (const row of rows.slice(headerIndex + 1)) {
      if (!Array.isArray(row)) continue;

      const reservationNo = textValue(get(row, 'Reservation Number'));
      if (!reservationNo) continue;

     out.push({
        property_id: propertyId,
        reservation_no: reservationNo,
        source_category: textValue(get(row, 'Reservation Source Category')),
        source: srcName(textValue(get(row, 'Reservation Source'))),
        status: textValue(get(row, 'Reservation Status')),
        cancellation_date: dateTime(get(row, 'Cancellation Date Time - Property')),
        booking_date: dateTime(get(row, 'Booking Date Time - Property')),
        booking_window: textValue(get(row, 'Booking Window')),
        guest_name: textValue(get(row, 'Primary Guest Full Name')),
        check_in: iso(get(row, 'Check-In Date')),
        check_out: iso(get(row, 'Check-Out Date')),
        room_nights: numberValue(get(row, 'Room Nights')),
        room_revenue_total: numberValue(get(row, 'Room Revenue Total')),
        original_room_revenue_total: numberValue(get(row, 'Original Room Revenue Total')),
        grand_total: numberValue(get(row, 'Grand Total')),
        original_grand_total: numberValue(get(row, 'Original Grand Total')),
        paid_amount: numberValue(get(row, 'Reservation Paid Amount')),
        refund_issued: numberValue(get(row, 'Refund Issued')),
        balance_due: numberValue(get(row, 'Reservation Balance Due')),
        hotel_collect_booking_flag: textValue(get(row, 'Hotel Collect Booking Flag')),
        room_types: textValue(get(row, 'Room Types')),
        rate_plan_public: textValue(get(row, 'Rate Plans - Public Names')),
        rate_plan_private: textValue(get(row, 'Rate Plans - Private Names')),
        rate_plan_channel: textValue(get(row, 'Rate Plans - Channel Names')),
        guest_email: textValue(get(row, 'Primary Guest Email')),
        guest_phone: textValue(get(row, 'Primary Guest Mobile Phone Number')),
        guest_country: textValue(get(row, 'Primary Guest Residence Country Name')),
        guest_city: textValue(get(row, 'Primary Guest City'))
      });
    }

    if (!out.length) throw new Error('No cancellation records found below the report header.');
    return { rows: out, note: `${out.length} cancellation records` };
  }

  

  const textValue = v => {
    if (v == null) return null;
    const s = String(v).trim();
    return !s || s === '-' ? null : s;
  };
  const flagValue = v => /^(yes|true|1)$/i.test(String(v ?? '').trim());
  const moneyValue = v => {
    if (v == null || v === '' || v === '-') return 0;
    const n = Number(String(v).replace(/[₱,$\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  function transactionHeaderIndex(rows) {
    return (rows || []).findIndex(row => Array.isArray(row) &&
      ['propertyname','transactiontype','transactionamount','cloudbedstransactioncode'].every(k => row.map(norm).includes(k)));
  }
  // Normalize Cloudbeds date values before writing to Supabase.
  // Excel serials are converted using the Excel 1900 date system.
  // Transaction timestamps retain their local wall-clock time (no timezone shift).
  function transactionDateValue(value, includeTime = false) {
    if (value == null || value === '') return null;

    const excelSerial = n => {
      if (!Number.isFinite(n) || n < 1 || n > 100000) return null;
      const ms = Math.round(n * 86400000);
      const d = new Date(Date.UTC(1899, 11, 30) + ms);
      if (!Number.isFinite(d.getTime())) return null;
      const date = d.toISOString().slice(0, 10);
      if (!includeTime) return date;
      const time = d.toISOString().slice(11, 19);
      return `${date} ${time}`;
    };

    if (value instanceof Date && !isNaN(value)) {
      const iso = value.toISOString();
      return includeTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
    }

    if (typeof value === 'number') return excelSerial(value);

    const s = String(value).trim();
    if (!s || s === '-') return null;

    // Excel serials sometimes arrive as strings (especially from CSV imports).
    if (/^\d{4,6}(\.\d+)?$/.test(s)) return excelSerial(Number(s));

    // Preserve Cloudbeds property-local date/time strings without timezone conversion.
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
    if (isoMatch) {
      if (!includeTime || !isoMatch[2]) return isoMatch[1];
      return `${isoMatch[1]} ${isoMatch[2].length === 5 ? isoMatch[2] + ':00' : isoMatch[2]}`;
    }

    // Fallback for parseable date strings; use UTC components to avoid browser-local shifts.
    const d = new Date(s);
    if (isNaN(d)) return null;
    const iso = d.toISOString();
    return includeTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
  }

  function parseTransactions(rows, propertyId, sourceFile) {
    const hi = transactionHeaderIndex(rows);
    if (hi < 0) fail('the Expanded Transaction Report header (Property Name / Transaction Type / Transaction Amount / Cloudbeds Transaction Code)');
    const headers = rows[hi].map(norm);
    const get = (row, key) => { const i=headers.indexOf(norm(key)); return i < 0 ? null : row[i]; };
    const out=[];
    for (let i=hi+1;i<rows.length;i++) {
      const row=rows[i]; if(!Array.isArray(row)) continue;
      const transactionCode=textValue(get(row,'Cloudbeds Transaction Code'));
      const transactionType=textValue(get(row,'Transaction Type'));
      const transactionDate=transactionDateValue(get(row,'Transaction Date Time - Property'), true);
      const transactionDescription=textValue(get(row,'Transaction Description'));
      // Ignore completely blank/footer rows; preserve zero-value and flagged transactions.
      if(!transactionCode && !transactionType && !transactionDate && !transactionDescription) continue;
      const tx={
        property_id:propertyId, source_file:sourceFile, source_row_number:i+1,
        property_name:textValue(get(row,'Property Name')), transaction_user:textValue(get(row,'User')),
        guest_name:textValue(get(row,'Primary Guest Full Name')), reservation_no:textValue(get(row,'Reservation Number')),
        reservation_source:textValue(get(row,'Reservation Source')), house_account_name:textValue(get(row,'House Account Name')),
        group_profile_name:textValue(get(row,'Group Profile Name')), reservation_status:textValue(get(row,'Reservation Status')),
        check_in_date:transactionDateValue(get(row,'Check-In Date')), check_out_date:transactionDateValue(get(row,'Check-Out Date')),
        transaction_date:transactionDate, business_date:transactionDateValue(get(row,'Business Date')), service_date:transactionDateValue(get(row,'Service Date')),
        room_number:textValue(get(row,'Room Number')), room_type:textValue(get(row,'Room Type')),
        hotel_collect_booking_flag:textValue(get(row,'Hotel Collect Booking Flag')), card_type:textValue(get(row,'Card Type')),
        card_last_4_digits:textValue(get(row,'Card Last 4 Digits')), transaction_type:transactionType,
        void_flag:textValue(get(row,'Void Flag')), tax_type:textValue(get(row,'Tax Type')),
        room_revenue_type:textValue(get(row,'Room Revenue Type')), refund_flag:textValue(get(row,'Refund Flag')),
        pos_charge_description:textValue(get(row,'POS Charge Description')), pos_charge_category:textValue(get(row,'POS Charge Category')),
        item_service_name:textValue(get(row,'Item and Service Name')), item_service_category:textValue(get(row,'Item and Service Category')),
        fee_type:textValue(get(row,'Fee Type')), adjustment_flag:textValue(get(row,'Adjustment Flag')),
        addon_charge_type:textValue(get(row,'Add-on Charge Type')), addon_item:textValue(get(row,'Add-on Item')),
        quantity:moneyValue(get(row,'Quantity')), debits:moneyValue(get(row,'Debits')), credits:moneyValue(get(row,'Credits')),
        transaction_amount:moneyValue(get(row,'Transaction Amount')), cloudbeds_transaction_code:transactionCode,
        cloudbeds_transaction_code_description:textValue(get(row,'Cloudbeds Transaction Code Description')),
        transaction_description:transactionDescription, transaction_notes:textValue(get(row,'Transaction Notes')),
        transaction_source:textValue(get(row,'Transaction Source')), custom_general_ledger_code:textValue(get(row,'Custom General Ledger Code')),
        custom_transaction_code:textValue(get(row,'Custom Transaction Code')),
        raw_data:Object.fromEntries(rows[hi].map((h,j)=>[String(h||`column_${j}`).trim(),row[j]??null]))
      };
      out.push(tx);
    }
    if(!out.length) throw new Error('No transaction rows found below the Expanded Transaction Report header.');
    return {rows:out,note:`${out.length} transaction rows; original Cloudbeds fields preserved`};
  }

function detect(rows) {
  if (transactionHeaderIndex(rows) >= 0) return 'Transactions';
  if (cancellationHeaderIndex(rows) >= 0) return 'Cancellations';
  if (find(rows, n => n.includes('date') && n.some(k => /^adr\d{4}$/.test(k))) >= 0) return 'ADR';
  if (find(rows, n => n.includes('reservationstatus') && n.includes('checkindate')) >= 0) return 'Reservations';
  if (find(rows, n => n.includes('thisyear') && n.includes('lastyear')) >= 0) return 'Pace';
  return null;
}


  function generatedAt(rows) {
    for (const r of rows.slice(0, 8)) {
      const m = String(r[0] ?? '').match(/Generated at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)/);
      if (m) return m[1];
    }
    return '';
  }

  root.Imp = {
    parseAdr,
    parsePace,
    parseRes,
    parseCancellations,
    parseTransactions,
    detect,
    generatedAt
  };

  if (typeof module !== 'undefined') module.exports = root.Imp;
})(typeof window !== 'undefined' ? window : globalThis);
