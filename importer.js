// Parsers for the three PMS exports. They take sheet rows (array of arrays) and return rows ready for Supabase.
(function (root) {
  const MS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
  const pad = n => String(n).padStart(2, '0');
  const iso = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const s = String(v).trim();
    if (/^\d{4}-\d\d-\d\d/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const find = (rows, test) => rows.findIndex(r => test(r.map(norm)));
  const fail = (what, rows) => { throw new Error(`Could not find ${what}. Is this the right report for this upload slot?`); };

  function parseAdr(rows, code) {
    const hi = find(rows, n => n.includes('date') && n.some(k => /^adr\d{4}$/.test(k)));
    if (hi < 0) fail('the "Date / ADR <year>" header', rows);
    const keys = rows[hi].map(norm), at = k => keys.indexOf(k);
    const years = keys.map(k => (k.match(/^adr(\d{4})$/) || [])[1]).filter(Boolean);
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const m = MS.indexOf(norm(r[at('date')]).slice(0, 3)) + 1;
      if (!m) continue;
      for (const y of years) {
        const sold = num(r[at('accommodationsbooked' + y)]), rev = num(r[at('roomrates' + y)]);
        if (sold == null && rev == null) continue;
        out.push({ property: code, year: +y, month: m, rooms_sold: sold, room_revenue: rev, adr: num(r[at('adr' + y)]) });
      }
    }
    return { rows: out, note: `years ${years.join(', ')}` };
  }

  // "Generated at 2026-08-07 03:05:37 UTC" -> Philippine date
  function generatedDate(rows) {
    for (const r of rows.slice(0, 8)) {
      const m = String(r[0] ?? '').match(/Generated at (\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/);
      if (m) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) + 8 * 36e5).toISOString().slice(0, 10);
    }
    return null;
  }

  function parsePace(rows, code, override) {
    const gi = find(rows, n => n.includes('thisyear') && n.includes('lastyear'));
    if (gi < 0) fail('the "This Year / Last Year" header', rows);
    const g = rows[gi].map(norm), a = g.indexOf('thisyear'), b = g.indexOf('lastyear');
    const hi = find(rows.slice(gi + 1), n => n.includes('roomssold')) + gi + 1;
    if (hi <= gi) fail('the "Rooms Sold" header', rows);
    const h = rows[hi].map(norm);
    const col = (from, to, name) => { for (let i = from; i < to; i++) if (h[i] === name) return i; return -1; };
    const metricAliases = {
      roomssold: ['roomssold', 'rooms_sold'],
      roomrevenue: ['roomrevenue', 'totalroomrevenue', 'totalrevenue'],
      capacity: ['capacity', 'capacitycount', 'customavailablerooms']
    };
    const metricCol = (from, to, metric) => {
      for (const alias of (metricAliases[metric] || [metric])) {
        const idx = col(from, to, alias);
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const C = { ty: n => metricCol(a, b, n), ly: n => metricCol(b, h.length, n) };
    const snap = override || generatedDate(rows);
    if (!snap) throw new Error('No "Generated at" date in the file. Enter the snapshot date.');
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const m = String(r[0] ?? '').match(/^(\d\d)-(\d\d)$/);
      if (!m) continue;
      const v = (w, n) => num(r[C[w](n)]);
      out.push({ property: code, snapshot_date: snap, month_no: +m[1], day: +m[2],
        ty_rooms_sold: v('ty', 'roomssold'), ty_room_revenue: v('ty', 'roomrevenue'), ty_capacity: v('ty', 'capacity'),
        ly_rooms_sold: v('ly', 'roomssold'), ly_room_revenue: v('ly', 'roomrevenue'), ly_capacity: v('ly', 'capacity') });
    }
    if (!out.length) fail('stay-date rows (MM-DD)', rows);
    return { rows: out, snap, note: `snapshot ${snap}` };
  }

  function parseRes(rows, code) {
    const hi = find(rows, n => n.includes('reservationstatus') && n.includes('checkindate'));
    if (hi < 0) fail('the "Reservation Status / Check-In Date" header', rows);
    const keys = rows[hi].map(norm), g = (r, k) => r[keys.indexOf(k)];
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const bd = iso(g(r, 'bookingdatetimeproperty'));
      if (!bd) continue;
      const cin = iso(g(r, 'checkindate')), cout = iso(g(r, 'checkoutdate'));
      let nights = num(g(r, 'roomnights'));
      if (nights == null && cin && cout) nights = Math.round((new Date(cout) - new Date(cin)) / 864e5);
      out.push({ property: code, reservation_no: g(r, 'reservationnumber') || null, booking_date: bd, status: g(r, 'reservationstatus'),
        room_type: g(r, 'roomtypes'), source: g(r, 'reservationsource'), source_category: g(r, 'reservationsourcecategory'),
        check_in: cin, check_out: cout, room_nights: nights, guests: num(g(r, 'guestcount')),
        suggested_deposit: num(g(r, 'suggesteddeposit')), grand_total: num(g(r, 'grandtotal')), room_revenue: num(g(r, 'roomrevenuetotal')),
        taxes: num(g(r, 'totalreservationtaxes')), paid: num(g(r, 'reservationpaidamount')), balance_due: num(g(r, 'reservationbalancedue')) });
    }
    const ds = out.map(r => r.booking_date).sort();
    return { rows: out, from: ds[0], to: ds.at(-1), note: `booked ${ds[0]} to ${ds.at(-1)}` };
  }
  root.Imp = { parseAdr, parsePace, parseRes };
  if (typeof module !== 'undefined') module.exports = root.Imp;
})(typeof window !== 'undefined' ? window : globalThis);
