/* HHG BI Suite — static front-end for GitHub Pages, backed by Supabase. */
(() => {
"use strict";
const CFG = window.HHG_CONFIG || {};
const DEMO = !CFG.SUPABASE_ANON_KEY || /^PASTE/.test(CFG.SUPABASE_ANON_KEY);
const sb = DEMO ? null : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = n => `<i data-lucide="${n}"></i>`;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TEAL = "#0E7C86", AMBER = "#F2B134", GREY = "#9DB0B8";

/* ---------- formatting ---------- */
const nf = n => Math.round(n).toLocaleString("en-US");
const peso = n => "₱" + nf(n);
const pesoM = n => "₱" + (n / 1e6).toFixed(1) + "M";
const pc = n => (n * 100).toFixed(1) + "%";
const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dim = (y, m) => new Date(y, m, 0).getDate();
function phNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, iso: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const today = () => phNow();
function clockHtml() {
  const t = new Date();
  const d = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", weekday: "long", day: "2-digit", month: "short", year: "numeric" }).format(t).replace(",", "");
  const h = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(t);
  return `${d}<small>${ic("clock")} ${h} · Philippine time</small>`;
}
const ymd = s => ({ y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) });

/* delta chip. kind: 'pct' | 'pts' | 'num' ; fmt formats the abs diff */
function delta(cur, prev, fmt) {
  if (!prev) return `<span class="mu">no last-year data</span>`;
  const d = cur - prev, up = d >= 0, cls = up ? "up" : "dn", ar = up ? "▲" : "▼";
  return `<span class="${cls}">${ar} ${fmt(Math.abs(d))}</span> · <span class="${cls}">${ar} ${Math.abs(d / prev * 100).toFixed(1)}%</span>`;
}
const deltaPts = (c, p) => { const d = (c - p) * 100, up = d >= 0; return `<span class="${up ? "up" : "dn"}">${up ? "▲" : "▼"} ${Math.abs(d).toFixed(1)} pts</span>`; };
const kpi = (icon, label, value, sub, tone = "", foot = "") =>
  `<div class="c"><div class="k"><span class="ki ${tone}">${ic(icon)}</span>${esc(label)}</div><b>${value}</b><i>${sub}</i>${foot ? `<br><i>${foot}</i>` : ""}</div>`;

/* ---------- data layer ---------- */
async function fetchAll(table, cols, mod) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols);
    if (mod) q = mod(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const cache = {};
const D = {
  async props() { return cache.props ??= DEMO ? demo().props : await fetchAll("properties", "*", q => q.order("sort")); },
  async adr() { return cache.adr ??= DEMO ? demo().adr : await fetchAll("adr_daily", "*", q => q.order("property_id").order("stay_date")); },
  async res() { return cache.res ??= DEMO ? demo().res : await fetchAll("reservations", "*", q => q.order("id")); },
  async targets() { return cache.targets ??= DEMO ? [] : await fetchAll("targets", "*"); },
  async pace() {
    if (cache.pace) return cache.pace;
    if (DEMO) return cache.pace = demo().pace;
    const t = today(), start = iso(t.y, t.m, 1), e = new Date(t.y, t.m - 1 + 5, 1);
    return cache.pace = await fetchAll("pace_snapshots", "*", q => q.gte("snapshot_date", start).gte("stay_date", start).lt("stay_date", iso(e.getFullYear(), e.getMonth() + 1, 1)).order("snapshot_date"));
  },
  async log() {
    if (DEMO) return demo().log;
    const { data, error } = await sb.from("upload_log").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error; return data;
  },
  clear() { for (const k in cache) delete cache[k]; }
};

/* ---------- demo data (used until a Supabase anon key is set) ---------- */
let _demo;
function demo() {
  if (_demo) return _demo;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const props = [["H Hotel", 41], ["J Boutique Hotel", 24], ["Nacpan Beach Glamping", 20], ["Nacpan Beach Resort", 36], ["Nacpan Beach Villas", 12], ["Piece Lio", 36], ["S Resort", 45], ["Z Garden Hotel", 30], ["Villa V", 6]].map((p, i) => ({ id: i + 1, name: p[0], rooms: p[1], sort: i + 1 }));
  const base = { 1: 12500, 2: 4400, 3: 9200, 4: 9200, 5: 14000, 6: 16000, 7: 8300, 8: 5400 };
  const season = [.7, .72, .7, .62, .5, .38, .36, .35, .33, .4, .5, .62];
  const t = today(), adr = [];
  for (const p of props.slice(0, 8)) for (const y of [t.y - 1, t.y]) for (let m = 1; m <= 12; m++) for (let d = 1; d <= dim(y, m); d++) {
    if (y === t.y && (m > t.m || (m === t.m && d >= t.d))) continue;
    const occ = Math.min(.95, season[m - 1] * (.85 + rnd() * .3) * (y === t.y ? .96 : 1));
    const sold = Math.round(p.rooms * occ);
    adr.push({ property_id: p.id, stay_date: iso(y, m, d), rooms_sold: sold, rooms_available: p.rooms, room_revenue: Math.round(sold * base[p.id] * (.95 + rnd() * .1)) });
  }
  const pace = [];
  for (const p of props.slice(0, 8)) for (let sd = 1; sd < t.d; sd++) {
    if (sd === 3 || sd === 4) continue;
    for (let k = 0; k < 5; k++) { const ym = new Date(t.y, t.m - 1 + k, 1), n = dim(ym.getFullYear(), ym.getMonth() + 1);
      for (let d = 1; d <= n; d++) pace.push({ property_id: p.id, snapshot_date: iso(t.y, t.m, sd), stay_date: iso(ym.getFullYear(), ym.getMonth() + 1, d), room_nights: Math.round(p.rooms * (.32 - k * .05) * (.8 + sd * .03 + rnd() * .1)) }); }
  }
  const res = [], src = ["Direct", "Booking.com", "Agoda", "Walk-in", "Facebook"];
  for (let i = 0; i < 320; i++) {
    const p = props[Math.floor(rnd() * 8)], off = Math.floor(rnd() * 240) - 40, ci = new Date(t.y, t.m - 1, t.d + off), n = 1 + Math.floor(rnd() * 5), co = new Date(ci.getTime() + n * 864e5), bk = new Date(ci.getTime() - Math.floor(rnd() * 60) * 864e5);
    const f = d => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    res.push({ id: i, property_id: p.id, reservation_no: "R" + i, booking_date: f(bk), check_in: f(ci), check_out: f(co), nights: n, revenue: Math.round(n * base[p.id] * (.9 + rnd() * .3)), status: rnd() < .15 ? "Cancelled" : "Confirmed", source: src[Math.floor(rnd() * src.length)] });
  }
  const log = [["08:12 AM", 1, "ADR", 24, "Saved"], ["08:12 AM", 1, "Pace", 248, "Saved"], ["08:14 AM", 7, "Reservations", 41, "Saved"], ["08:20 AM", 9, "ADR", null, "Waiting"], ["08:31 AM", 6, "Pace", 248, "Error", "missing Day column"]].map((r, i) => ({ id: i, created_at: new Date().toISOString(), _t: r[0], property_id: r[1], report: r[2], rows: r[3], result: r[4], message: r[5], user_email: "demo" }));
  return _demo = { props, adr, pace, res, log };
}

/* ---------- aggregation ---------- */
function agg(rows) {
  let rev = 0, sold = 0, av = 0;
  for (const r of rows) { rev += +r.room_revenue; sold += +r.rooms_sold; av += +r.rooms_available; }
  return { rev, sold, av, occ: av ? sold / av : 0, adr: sold ? rev / sold : 0, revpar: av ? rev / av : 0 };
}
const adrFilter = (rows, y, m, pid) => rows.filter(r => +r.stay_date.slice(0, 4) === y && (!m || +r.stay_date.slice(5, 7) === m) && (!pid || r.property_id === pid));

/* ---------- charts (inline SVG) ---------- */
function groupedMonths(series, unit) {
  const W = 600, H = 270, base = 230, left = 40, step = (W - left) / 12;
  const max = Math.max(1, ...series.flatMap(s => s.vals));
  const bw = Math.min(20, (step - 10) / series.length);
  let g = "";
  for (let i = 0; i < 12; i++) {
    const cx = left + step * i + step / 2;
    g += `<text x="${cx}" y="248" font-size="11" fill="#5E7480" text-anchor="middle">${MON[i]}</text>`;
    series.forEach((s, j) => {
      const h = s.vals[i] / max * 200, x = cx - bw * series.length / 2 + bw * j;
      g += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" fill="${s.color}" rx="2"><title>${s.name} ${MON[i]}: ${s.vals[i].toFixed(1)}${unit}</title></rect>`;
    });
  }
  g += `<line x1="${left}" y1="${base}" x2="${W}" y2="${base}" stroke="#DDE5E8"/><text x="0" y="14" font-size="11" fill="#5E7480">max ${max.toFixed(0)}${unit}</text>`;
  series.forEach((s, j) => { g += `<rect x="${50 + j * 120}" y="258" width="10" height="10" rx="2" fill="${s.color}"/><text x="${66 + j * 120}" y="267" font-size="11" fill="#10242B">${s.name}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Monthly chart">${g}</svg>`;
}
function hbars(items, fmt) {
  const max = Math.max(1, ...items.flatMap(i => [i.a, i.b])), H = items.length * 32 + 34;
  let g = "";
  items.forEach((it, i) => {
    const y = i * 32, wa = it.a / max * 288, wb = it.b / max * 288;
    g += `<text x="0" y="${y + 20}" font-size="12" fill="#10242B">${esc(it.label.length > 24 ? it.label.slice(0, 23) + "…" : it.label)}</text>
<rect x="150" y="${y + 4}" width="${wa}" height="11" rx="2" fill="${TEAL}"/><text x="${156 + wa}" y="${y + 14}" font-size="11" fill="#10242B">${fmt(it.a)}</text>
<rect x="150" y="${y + 17}" width="${wb}" height="11" rx="2" fill="${AMBER}"/><text x="${156 + wb}" y="${y + 27}" font-size="11" fill="#5E7480">${fmt(it.b)}</text>`;
  });
  const ly = items.length * 32 + 8;
  g += `<rect x="150" y="${ly}" width="10" height="10" rx="2" fill="${TEAL}"/><text x="166" y="${ly + 9}" font-size="11">This year</text><rect x="280" y="${ly}" width="10" height="10" rx="2" fill="${AMBER}"/><text x="296" y="${ly + 9}" font-size="11">Last year</text>`;
  return `<svg viewBox="0 0 560 ${H}" style="width:100%;height:auto" role="img">${g}</svg>`;
}

/* ---------- shell ---------- */
const state = { user: null, role: "viewer", page: "dashboard", dash: {}, cmp: {}, pace: { k: 0, exp: false }, rsv: {}, adm: {} };
const NAV = [["dashboard", "Dashboard", "layout-dashboard"], ["compare", "Compare", "git-compare"], ["pace", "Pace", "gauge"], ["reservations", "Reservations", "calendar-days"], ["admin", "Upload & logs", "upload-cloud"]];
const TITLES = Object.fromEntries(NAV.map(n => [n[0], n]));

function shell(title, icon, body) {
  return `<div class="app"><nav class="side"><div class="brand"><span class="logo">${ic("bar-chart-3")}</span><span>HHG <b>BI</b></span></div>
${NAV.filter(n => n[0] !== "admin" || state.role === "admin").map(n => `<a class="nv ${n[0] === state.page ? "on" : ""}" href="#/${n[0]}">${ic(n[2])}${n[1]}</a>`).join("")}
<div class="who">${ic("user-circle")} ${esc(state.user.email)}<br>Role: ${esc(state.role)}<br><a id="signout">${ic("log-out")} Sign out</a></div></nav>
<div class="main"><div class="top"><h1><span class="hi">${ic(icon)}</span>${title}${DEMO ? ' <span class="tag">Sample data</span>' : ""}</h1><div class="clock">${clockHtml()}</div></div>${body}</div></div>`;
}
function paint(html) {
  $("#root").innerHTML = html;
  window.lucide && if (window.lucide) window.lucide.createIcons();
  const so = $("#signout"); if (so) so.onclick = signOut;
}
const selHtml = (id, opts, val) => `<select class="sel" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const bind = (ids, st, rerender) => ids.forEach(id => { const el = $("#" + id); if (el) el.onchange = () => { st[id] = el.value; rerender(); }; });
const yearsOf = rows => [...new Set(rows.map(r => +r.stay_date.slice(0, 4)))].sort((a, b) => b - a);
const monthOpts = [[0, "All months"], ...MON.map((m, i) => [i + 1, m])];
const propOpts = props => [[0, "All properties"], ...props.map(p => [p.id, p.name])];

/* ---------- pages ---------- */
async function pageDashboard() {
  const [props, adr] = await Promise.all([D.props(), D.adr()]);
  const st = state.dash, ys = yearsOf(adr); const Y = +(st.y ?? ys[0] ?? today().y), M = +(st.m || 0), P = +(st.p || 0);
  const cur = adrFilter(adr, Y, M, P), prev = adrFilter(adr, Y - 1, M, P), a = agg(cur), b = agg(prev);
  const shown = props.filter(p => !P || p.id === P);
  const per = shown.map(p => ({ p, a: agg(cur.filter(r => r.property_id === p.id)), b: agg(prev.filter(r => r.property_id === p.id)) }));
  const has = per.filter(x => x.a.av);
  const mon = y => MON.map((_, i) => agg(adrFilter(adr, y, i + 1, P)).rev / 1e6);
  const chart = (title, icon, key, fmt) => `<div class="p"><h3>${ic(icon)}${title}</h3>${hbars(has.map(x => ({ label: x.p.name, a: x.a[key], b: x.b[key] })), fmt)}</div>`;
  paint(shell("Dashboard", "layout-dashboard", `
<div class="bar">${selHtml("y", (ys.length ? ys : [Y]).map(y => [y, y]), Y)}${selHtml("m", monthOpts, M)}${selHtml("p", propOpts(props), P)}</div>
<div class="cards">
 ${kpi("banknote", "Room revenue", pesoM(a.rev), `Last year ${pesoM(b.rev)}`, "", delta(a.rev, b.rev, pesoM))}
 ${kpi("bed-double", "Occupancy", pc(a.occ), `Last year ${pc(b.occ)}`, "green", b.av ? deltaPts(a.occ, b.occ) + " · " + `<span class="${a.occ >= b.occ ? "up" : "dn"}">${a.occ >= b.occ ? "▲" : "▼"} ${Math.abs((a.occ / b.occ - 1) * 100).toFixed(1)}%</span>` : "")}
 ${kpi("tag", "ADR", peso(a.adr), `Last year ${peso(b.adr)}`, "amber", delta(a.adr, b.adr, peso))}
 ${kpi("line-chart", "RevPAR", peso(a.revpar), `Last year ${peso(b.revpar)}`, "", delta(a.revpar, b.revpar, peso))}
 ${kpi("door-open", "Rooms sold", nf(a.sold), `Last year ${nf(b.sold)}`, "green", delta(a.sold, b.sold, nf))}
</div>
<div class="p"><h3>${ic("bar-chart-3")}Room revenue by month, ₱ millions</h3>${groupedMonths([{ name: String(Y), color: TEAL, vals: mon(Y) }, { name: String(Y - 1), color: AMBER, vals: mon(Y - 1) }], "M")}</div>
<div class="two">${chart("Occupancy by property", "bed-double", "occ", pc)}${chart("Revenue by property, ₱ millions", "banknote", "rev", pesoM)}${chart("ADR by property", "tag", "adr", peso)}${chart("RevPAR by property", "line-chart", "revpar", peso)}</div>
<div class="p"><h3>${ic("building-2")}Property performance, ${Y}</h3><table><tr><th>Property</th><th>Room revenue</th><th>Occupancy</th><th>ADR</th><th>RevPAR</th><th>Rooms sold</th></tr>
${per.map(x => x.a.av ? `<tr><td>${esc(x.p.name)}</td><td>${pesoM(x.a.rev)}</td><td>${pc(x.a.occ)}<span class="bx" style="width:${Math.round(x.a.occ * 100)}px"></span></td><td>${peso(x.a.adr)}</td><td>${peso(x.a.revpar)}</td><td>${nf(x.a.sold)}</td></tr>` : `<tr><td>${esc(x.p.name)}</td><td><span class="mu">no data yet</span></td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`).join("")}</table></div>`));
  bind(["y", "m", "p"], st, pageDashboard);
}

async function pageCompare() {
  const [props, adr, res, targets] = await Promise.all([D.props(), D.adr(), D.res(), D.targets()]);
  const st = state.cmp, ys = yearsOf(adr); const Y = +(st.y ?? ys[0] ?? today().y), M = +(st.m || 0), P = +(st.p || 0);
  const chosen = props.filter(p => !P || p.id === P);
  const fc = (m) => { // next-year forecast = reservations on the books (not cancelled), by check-in month
    const rows = res.filter(r => r.status !== "Cancelled" && r.check_in && +r.check_in.slice(0, 4) === Y + 1 && (!m || +r.check_in.slice(5, 7) === m) && (!P || r.property_id === P));
    const months = m ? [m] : [...Array(12)].map((_, i) => i + 1);
    const av = chosen.reduce((s, p) => s + months.reduce((t, mm) => t + p.rooms * dim(Y + 1, mm), 0), 0);
    const rev = rows.reduce((s, r) => s + +r.revenue, 0), nights = rows.reduce((s, r) => s + +r.nights, 0);
    return { rev, sold: nights, av, occ: av ? nights / av : 0, adr: nights ? rev / nights : 0, revpar: av ? rev / av : 0 };
  };
  const a = agg(adrFilter(adr, Y, M, P)), b = agg(adrFilter(adr, Y - 1, M, P)), f = fc(M);
  const target = targets.filter(t => t.year === Y + 1 && (!t.property_id || !P || t.property_id === P)).reduce((s, t) => s + +t.room_revenue, 0);
  const mon = y => MON.map((_, i) => agg(adrFilter(adr, y, i + 1, P)).rev / 1e6);
  const mf = MON.map((_, i) => fc(i + 1).rev / 1e6), m1 = mon(Y - 1), m2 = mon(Y);
  const chg = (c, p) => p ? `<span class="${c >= p ? "up" : "dn"}">${c >= p ? "▲" : "▼"} ${Math.abs((c / p - 1) * 100).toFixed(1)}%</span>` : "–";
  const row = (icn, name, k, fmt, ptsMode) => `<tr><td>${ic(icn)} ${name}</td><td>${fmt(b[k])}</td><td>${fmt(a[k])}</td><td>${fmt(f[k])}</td><td>${ptsMode ? (b.av ? deltaPts(a[k], b[k]) : "–") : chg(a[k], b[k])}</td></tr>`;
  const dl = v => `<td><span class="${v >= 0 ? "up" : "dn"}">${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}</span></td>`;
  paint(shell("Compare", "git-compare", `
<div class="bar">${selHtml("y", (ys.length ? ys : [Y]).map(y => [y, y]), Y)}${selHtml("m", monthOpts, M)}${selHtml("p", propOpts(props), P)}</div>
<div class="p"><h3>${ic("scale")}Last year, this year and next year</h3><table><tr><th>Metric</th><th>${Y - 1} (last year)</th><th>${Y} (this year)</th><th>${Y + 1} forecast</th><th>${Y} vs ${Y - 1}</th></tr>
${row("banknote", "Room revenue", "rev", pesoM)}${row("bed-double", "Occupancy", "occ", pc, true)}${row("tag", "ADR", "adr", peso)}${row("line-chart", "RevPAR", "revpar", peso)}</table>
<p class="mu" style="margin:10px 0 0">${ic("info")} ${Y + 1} forecast = bookings on the books for ${Y + 1} stays${target ? `, against a target of ${pesoM(target)} (${pc(f.rev / target)} reached)` : ", plus an optional target entered by the admin"}.</p></div>
<div class="p"><h3>${ic("bar-chart-3")}Room revenue by month, ₱ millions</h3>${groupedMonths([{ name: String(Y - 1), color: AMBER, vals: m1 }, { name: String(Y), color: TEAL, vals: m2 }, { name: Y + 1 + " forecast", color: GREY, vals: mf }], "M")}
<div style="margin-top:12px"><table><tr><th>₱ millions</th>${MON.map(m => `<th>${m}</th>`).join("")}</tr>
<tr><td>${Y - 1} (last year)</td>${m1.map(v => `<td>${v.toFixed(1)}</td>`).join("")}</tr><tr><td>${Y} (this year)</td>${m2.map(v => `<td>${v.toFixed(1)}</td>`).join("")}</tr>
<tr><td>${Y + 1} forecast</td>${mf.map(v => `<td>${v.toFixed(1)}</td>`).join("")}</tr><tr><td>${Y} vs ${Y - 1}</td>${m2.map((v, i) => dl(v - m1[i])).join("")}</tr></table></div></div>`));
  bind(["y", "m", "p"], st, pageCompare);
}

async function pagePace() {
  const [props, pace] = await Promise.all([D.props(), D.pace()]);
  const t = today(), st = state.pace, k = st.k;
  const tabs = [0, 1, 2, 3, 4].map(i => { const d = new Date(t.y, t.m - 1 + i, 1); return { i, y: d.getFullYear(), m: d.getMonth() + 1, label: (i ? `${i * 30 + 30 > 0 ? (i + 1) * 30 : 30} days` : "This month") + ` · ${MON[d.getMonth()]}` }; });
  tabs.forEach(x => { x.label = (x.i === 0 ? "This month" : `${(x.i + 1) * 30} days`) + ` · ${MON[x.m - 1]}`; });
  const T = tabs[k], monthPrefix = `${T.y}-${pad(T.m)}`;
  const days = dim(t.y, t.m), snapDays = [...Array(days)].map((_, i) => iso(t.y, t.m, i + 1));
  const by = {}; // by[pid][snap] = nights
  for (const r of pace) if (r.stay_date.startsWith(monthPrefix)) ((by[r.property_id] ??= {})[r.snapshot_date] = (by[r.property_id][r.snapshot_date] || 0) + +r.room_nights);
  const withData = props.filter(p => by[p.id]);
  const allSnaps = [...new Set(pace.map(r => r.snapshot_date))].sort(), latest = allSnaps.at(-1), prevS = allSnaps.at(-2);
  const tot = s => withData.reduce((n, p) => n + (by[p.id][s] || 0), 0);
  const avail = withData.reduce((n, p) => n + p.rooms * dim(T.y, T.m), 0);
  const missing = snapDays.filter(d => d < t.iso && !allSnaps.includes(d));
  const dayName = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
  const cell = (n, a, s) => !allSnaps.includes(s) && s <= (latest || "") ? `<td class="no"><small>no upload</small></td>` : n == null ? `<td class="${s === latest ? "now" : ""}"></td>` : `<td class="${s === latest ? "now" : ""}"><b>${nf(n)}</b>${a != null ? `<small>${pc(a)}</small>` : ""}</td>`;
  const diffCell = (n, p, s) => { if (n == null || p == null) return `<td class="${s === latest ? "now" : ""}"></td>`; const d = n - p; return `<td class="${s === latest ? "now" : ""}"><b class="${d >= 0 ? "up" : "dn"}">${d >= 0 ? "+" : ""}${nf(d)}</b><small class="${d >= 0 ? "up" : "dn"}">${p ? (d / p * 100).toFixed(1) + "%" : ""}</small></td>`; };
  const prevSnap = s => { const i = allSnaps.indexOf(s); return i > 0 ? allSnaps[i - 1] : null; };
  const rowsHtml = withData.map(p => { const cap = p.rooms * dim(T.y, T.m);
    const main = `<tr><td class="f"><b>${esc(p.name)}</b><small>${p.rooms} rooms · ${nf(cap)} room nights</small></td>${snapDays.map(s => cell(by[p.id][s], by[p.id][s] != null ? by[p.id][s] / cap : null, s)).join("")}</tr>`;
    const sub = st.exp ? `<tr class="sub"><td class="f"><small>Added since last upload</small></td>${snapDays.map(s => { const ps = prevSnap(s); return diffCell(by[p.id][s], ps ? by[p.id][ps] : null, s); }).join("")}</tr>` : "";
    return main + sub; }).join("");
  const totRow = `<tr class="tot"><td class="f"><b>All hotels</b><small>${nf(avail)} room nights</small></td>${snapDays.map(s => allSnaps.includes(s) ? `<td class="${s === latest ? "now" : ""}"><b>${nf(tot(s))}</b><small>${pc(tot(s) / (avail || 1))}</small></td>` : cell(null, null, s)).join("")}</tr>`;
  const added = latest && prevS ? tot(latest) - tot(prevS) : null;
  paint(shell("Pace", "gauge", `
<div class="bar">${tabs.map(x => `<button class="tab ${x.i === k ? "on" : ""}" data-k="${x.i}">${ic("calendar-range")}${x.label}</button>`).join("")}</div>
<div class="cards">
 ${kpi("book-open-check", "Room nights on the books", latest ? nf(tot(latest)) : "–", latest ? `latest upload: ${dayName(latest)} ${md(latest)}` : "no uploads yet")}
 ${kpi("percent", "Occupancy for the month", latest ? pc(tot(latest) / (avail || 1)) : "–", `of ${nf(avail)} available room nights`, "green")}
 ${kpi("plus-circle", "Added since the previous upload", added == null ? "–" : `<span class="${added >= 0 ? "up" : "dn"}">${added >= 0 ? "+" : ""}${nf(added)}</span>`, prevS ? `${nf(tot(prevS))} on ${md(prevS)}` : "need two uploads", "amber")}
 ${kpi("alert-triangle", "Missing uploads", `<span class="${missing.length ? "dn" : "up"}">${missing.length}</span>`, missing.length ? esc(missing.map(md).join(" and ")) : "all days uploaded", "red")}
</div>
<div class="p"><h3>${ic("table-2")}Room nights on the books for ${MON[T.m - 1]} ${T.y}, by upload day</h3>
<label class="tgl"><input type="checkbox" id="ex" ${st.exp ? "checked" : ""}> ${ic("chevrons-up-down")} Show "Added since last upload" for each hotel</label>
${withData.length ? `<table class="dm2"><tr><th class="f">Hotel</th>${snapDays.map(s => `<th class="${s === latest ? "now" : ""}">${md(s)}<br>${dayName(s)}</th>`).join("")}</tr>${rowsHtml}${totRow}</table>` : `<div class="empty">No pace uploads yet this month.</div>`}
<p class="mu" style="margin:10px 0 0">Each column is one day's upload. The bold number is room nights on the books for the whole month, the grey number is occupancy. Teal is the latest upload and yellow means no file was uploaded that day.</p></div>`));
  document.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { st.k = +b.dataset.k; pagePace(); });
  $("#ex").onchange = e => { st.exp = e.target.checked; pagePace(); };
}

async function pageReservations() {
  const [props, res] = await Promise.all([D.props(), D.res()]);
  const st = state.rsv; st.p ??= 0; st.src ??= "";
  const range = (key, label, icon) => { const a = st[key + "a"] || "", b = st[key + "b"] || ""; return `<div class="pill ${a || b ? "act" : ""}"><span>${ic(icon)}${label}</span><input type="date" id="${key}a" value="${a}"> – <input type="date" id="${key}b" value="${b}"></div>`; };
  const inR = (v, a, b) => !(a || b) || (v && (!a || v >= a) && (!b || v <= b));
  const rows = res.filter(r => (!+st.p || r.property_id === +st.p) && (!st.src || r.source === st.src) && inR(r.booking_date, st.bka, st.bkb) && inR(r.check_in, st.cia, st.cib) && inR(r.check_out, st.coa, st.cob));
  const sources = [...new Set(res.map(r => r.source).filter(Boolean))].sort();
  const sum = (arr, f) => arr.reduce((s, r) => s + +f(r), 0), canc = r => r.status === "Cancelled";
  const stats = arr => { const c = arr.filter(canc), ok = arr.filter(r => !canc(r)); const n = sum(arr, r => r.nights), cn = sum(c, r => r.nights);
    return { n: arr.length, c: c.length, rate: arr.length ? c.length / arr.length : 0, nights: n, cn, rev: sum(ok, r => r.revenue), lost: sum(c, r => r.revenue) }; };
  const s = stats(rows);
  const months = [...new Set(rows.filter(r => r.check_in).map(r => r.check_in.slice(0, 7)))].sort();
  const mrow = (label, x, b) => { const w = b ? "<b>" : "", e = b ? "</b>" : ""; return `<tr><td>${w}${label}${e}</td><td>${w}${nf(x.n)}${e}</td><td>${w}${nf(x.c)}${e}</td><td>${w}${pc(x.rate)}${e}</td><td>${w}${nf(x.nights)}${e}</td><td>${w}${nf(x.cn)}${e}</td><td>${w}${peso(x.rev)}${e}</td><td>${w}${peso(x.lost)}${e}</td></tr>`; };
  paint(shell("Reservations", "calendar-days", `
<div class="bar"><div class="pill"><span>${ic("building-2")}Property</span>${selHtml("p", propOpts(props), st.p).replace('class="sel"', "")}</div>
${range("bk", "Booking date", "calendar-plus")}${range("ci", "Check-in", "log-in")}${range("co", "Check-out", "log-out")}
<div class="pill"><span>${ic("globe")}Source</span>${selHtml("src", [["", "All"], ...sources.map(x => [x, x])], st.src).replace('class="sel"', "")}</div>
<button class="rst" id="rst">${ic("rotate-ccw")}Reset filters</button></div>
<p class="mu" style="margin:-6px 0 16px">${nf(s.n)} reservations match the filters.</p>
<div class="cards">
 ${kpi("calendar-check", "Bookings", nf(s.n), "in the selected filters")}
 ${kpi("calendar-x", "Cancelled", nf(s.c), `${pc(s.rate)} of bookings`, "red")}
 ${kpi("moon", "Room nights", nf(s.nights), "booked", "green")}
 ${kpi("calendar-minus", "Cancelled nights", nf(s.cn), `${pc(s.nights ? s.cn / s.nights : 0)} of room nights`, "amber")}
 ${kpi("wallet", "Booked revenue", peso(s.rev), "excluding cancelled")}
 ${kpi("trending-down", "Value lost", `<span class="dn">${peso(s.lost)}</span>`, "from cancelled bookings", "red")}
</div>
<div class="p"><h3>${ic("calendar-range")}Reservations and cancellations by month (check-in month)</h3><table><tr><th>Check-in month</th><th>Bookings</th><th>Cancelled</th><th>Cancel rate</th><th>Room nights</th><th>Cancelled nights</th><th>Booked revenue</th><th>Value lost</th></tr>
${months.map(m => mrow(`${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}`, stats(rows.filter(r => r.check_in && r.check_in.startsWith(m))))).join("")}${mrow("Total", s, true)}</table></div>
<div class="p"><h3>${ic("building-2")}By property</h3><table><tr><th>Property</th><th>Bookings</th><th>Cancelled</th><th>Cancel rate</th><th>Cancelled nights</th><th>Value lost</th></tr>
${props.map(p => ({ p, x: stats(rows.filter(r => r.property_id === p.id)) })).filter(o => o.x.n).map(o => `<tr><td>${esc(o.p.name)}</td><td>${nf(o.x.n)}</td><td>${nf(o.x.c)}</td><td>${pc(o.x.rate)}<span class="bx" style="width:${Math.round(o.x.rate * 200)}px;background:#B03A2E"></span></td><td>${nf(o.x.cn)}</td><td>${peso(o.x.lost)}</td></tr>`).join("")}</table></div>`));
  ["p", "src", "bka", "bkb", "cia", "cib", "coa", "cob"].forEach(id => { $("#" + id).onchange = e => { st[id] = e.target.value; pageReservations(); }; });
  $("#rst").onclick = () => { state.rsv = {}; pageReservations(); };
}

/* ---------- admin: upload & logs ---------- */
const ALIAS = {
  adr: { date: ["date", "stay date", "business date", "day"], sold: ["rooms sold", "room nights sold", "occupied rooms", "rooms occupied", "sold"], avail: ["rooms available", "available rooms", "rooms avail", "capacity", "available"], rev: ["room revenue", "rooms revenue", "total room revenue", "revenue"] },
  pace: { day: ["day", "stay date", "date", "stay day"], nights: ["room nights", "room nights on the books", "rooms on the books", "otb", "rooms", "nights"] },
  res: { no: ["reservation no", "reservation no.", "reservation number", "confirmation", "confirmation no", "res no", "booking id", "reservation id", "reservation"], book: ["booking date", "booked", "date booked", "created", "booked on"], ci: ["check-in", "check in", "checkin", "arrival", "arrival date"], co: ["check-out", "check out", "checkout", "departure", "departure date"], nights: ["nights", "room nights", "los", "no. of nights"], rev: ["room revenue", "revenue", "total", "amount", "total amount", "total revenue"], status: ["status", "booking status"], src: ["source", "channel", "ota"] }
};
function sheetRows(buf) {
  const wb = XLSX.read(buf, { type: "array" }), ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}
function mapCols(grid, alias, need) {
  const norm = s => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  for (let h = 0; h < Math.min(grid.length, 20); h++) {
    const hdr = grid[h].map(norm), idx = {};
    for (const k in alias) { const j = hdr.findIndex(c => alias[k].includes(c)); if (j >= 0) idx[k] = j; }
    if (need.every(k => k in idx)) return { idx, data: grid.slice(h + 1) };
  }
  const first = grid.slice(0, 20).map(r => r.map(norm));
  const missing = need.filter(k => !first.some(r => r.some(c => alias[k].includes(c))));
  throw new Error("missing " + (missing.map(k => alias[k][0]).join(", ") || "header") + " column");
}
function toIso(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 864e5)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const d = new Date(String(v)); return isNaN(d) ? null : iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
const num = v => { const n = parseFloat(String(v ?? "0").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
function parseReport(kind, grid, prop, snap) {
  if (kind === "adr") { const { idx: i, data } = mapCols(grid, ALIAS.adr, ["date", "sold", "rev"]);
    return data.map(r => ({ property_id: prop.id, stay_date: toIso(r[i.date]), rooms_sold: Math.round(num(r[i.sold])), rooms_available: i.avail != null ? Math.round(num(r[i.avail])) : prop.rooms, room_revenue: num(r[i.rev]) })).filter(r => r.stay_date); }
  if (kind === "pace") { const { idx: i, data } = mapCols(grid, ALIAS.pace, ["day", "nights"]);
    return data.map(r => ({ property_id: prop.id, snapshot_date: snap, stay_date: toIso(r[i.day]), room_nights: Math.round(num(r[i.nights])) })).filter(r => r.stay_date); }
  const { idx: i, data } = mapCols(grid, ALIAS.res, ["ci", "co"]);
  return data.map((r, n) => { const ci = toIso(r[i.ci]), co = toIso(r[i.co]), bk = i.book != null ? toIso(r[i.book]) : null;
    const nights = i.nights != null ? Math.round(num(r[i.nights])) : Math.max(0, Math.round((new Date(co) - new Date(ci)) / 864e5));
    return { property_id: prop.id, reservation_no: String(i.no != null && r[i.no] != null ? r[i.no] : `${bk}|${ci}|${co}|${n}`), booking_date: bk, check_in: ci, check_out: co, nights, revenue: i.rev != null ? num(r[i.rev]) : 0, status: i.status != null && /cancel/i.test(String(r[i.status] ?? "")) ? "Cancelled" : "Confirmed", source: i.src != null ? r[i.src] : null }; }).filter(r => r.check_in && r.check_out);
}
async function upsert(table, rows, conflict) {
  if (DEMO) return;
  for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict }); if (error) throw error; }
}
async function pageAdmin() {
  if (state.role !== "admin") { paint(shell("Upload & logs", "upload-cloud", `<div class="p"><div class="empty">${ic("lock")}<p>Only admins can upload reports and view the log.</p></div></div>`)); return; }
  const [props, logAll] = await Promise.all([D.props(), D.log()]);
  const st = state.adm, t = today();
  const days = [...Array(15)].map((_, i) => { const d = new Date(Date.UTC(t.y, t.m - 1, t.d - i)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); });
  st.d ??= days[0]; st.fp ??= 0; st.up ??= props[0]?.id; st.snap ??= t.iso;
  const phDate = x => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(x));
  const phTime = x => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" }).format(new Date(x));
  const logs = logAll.filter(l => (DEMO || phDate(l.created_at) === st.d) && (!+st.fp || l.property_id === +st.fp));
  const dayLogs = logAll.filter(l => DEMO || phDate(l.created_at) === st.d);
  const upd = new Set(dayLogs.filter(l => l.result === "Saved").map(l => l.property_id)), waiting = props.filter(p => !upd.has(p.id));
  const pname = id => props.find(p => p.id === id)?.name || "–";
  const drop = (id, label) => `<div class="drop"><span>${ic("file-spreadsheet")}${label}</span><input type="file" id="${id}" accept=".xlsx,.xls"></div>`;
  paint(shell("Upload & logs", "upload-cloud", `
<div class="bar">${selHtml("d", days.map((d, i) => [d, i ? `Log date: ${d}` : "Log date: today"]), st.d)}${selHtml("fp", propOpts(props), st.fp)}</div>
<div class="two"><div class="p f"><h3>${ic("upload-cloud")}Upload reports</h3><div id="msg"></div>
<label for="up">Property</label>${selHtml("up", props.map(p => [p.id, p.name]), st.up).replace('class="sel"', 'class="sel w" style="width:100%"')}
<div style="margin-top:12px">${drop("fadr", "ADR report")}${drop("fres", "Reservations by Booking Date")}${drop("fpace", "Pace Report")}</div>
<label for="snap">Pace snapshot date</label><input id="snap" type="date" value="${st.snap}">
<button class="btn" id="go" style="margin-top:16px">${ic("upload")}Upload</button></div>
<div class="p"><h3>${ic("clipboard-check")}Summary for ${st.d}</h3><div class="cards" style="grid-template-columns:1fr 1fr">
${kpi("building-2", "Properties updated", `${upd.size} of ${props.length}`, `${waiting.length} waiting`, "green")}${kpi("files", "Files received", nf(dayLogs.length), `${dayLogs.filter(l => l.result !== "Saved").length} with errors`, "red")}</div>
<p class="mu" style="margin:0">${waiting.length ? "Waiting: " + esc(waiting.map(p => p.name).join(" · ")) : "All properties updated."}</p></div></div>
<div class="p"><h3>${ic("history")}Upload log</h3><table><tr><th>Time</th><th>Property</th><th>Report</th><th>Rows</th><th>Result</th><th>User</th></tr>
${logs.length ? logs.map(l => `<tr><td>${esc(l._t || phTime(l.created_at))}</td><td>${esc(pname(l.property_id))}</td><td>${esc(l.report)}</td><td>${l.rows ?? "–"}</td><td><span class="${l.result === "Saved" ? "up" : "dn"}">${ic(l.result === "Saved" ? "check-circle-2" : "x-circle")} ${esc(l.result)}${l.message ? ": " + esc(l.message) : ""}</span></td><td>${esc(l.user_email || "")}</td></tr>`).join("") : `<tr><td colspan="6" class="mu">No uploads for this day.</td></tr>`}</table>
<p class="mu" style="margin:10px 0 0">Every upload is saved with date, time and user. Pick any past day to see its summary.</p></div>`));
  bind(["d", "fp"], st, pageAdmin);
  $("#up").onchange = e => st.up = +e.target.value; $("#snap").onchange = e => st.snap = e.target.value;
  $("#go").onclick = async () => {
    
  $("#go").onclick = async () => {
    const prop = props.find(p => p.id === +$("#up").value);
    const snap = $("#snap").value;
    const msg = $("#msg");

    const jobs = [
      ["fadr", "adr", "ADR", "adr_daily", "property_id,stay_date"],
      ["fres", "res", "Reservations", "reservations", "property_id,reservation_no"],
      ["fpace", "pace", "Pace", "pace_snapshots", "property_id,snapshot_date,stay_date"]
    ].filter(j => $("#" + j[0]).files[0]);

    if (!jobs.length) {
      msg.innerHTML = `<div class="err">Choose at least one .xlsx file.</div>`;
      return;
    }

    $("#go").disabled = true;
    $("#go").textContent = "Uploading…";
    const results = [];

    try {
      for (const [fid, kind, label, table, conflict] of jobs) {
        let rows = null;

        try {
          rows = parseReport(
            kind,
            sheetRows(await $("#" + fid).files[0].arrayBuffer()),
            prop,
            snap
          );

          if (!rows.length) throw new Error("No data rows found.");

          await upsert(table, rows, conflict);

          const entry = {
            user_email: state.user.email,
            property_id: prop.id,
            report: label,
            rows: rows.length,
            result: "Saved",
            message: null
          };

          if (DEMO) {
            demo().log.unshift({
              ...entry,
              id: Date.now(),
              created_at: new Date().toISOString()
            });
          } else {
            const { error } = await sb.from("upload_log").insert(entry);
            if (error) throw error;
          }

          results.push(`${label}: Saved (${rows.length} rows)`);
        } catch (e) {
          results.push(`${label}: ERROR — ${e.message || String(e)}`);
        }
      }

      D.clear();
      pageAdmin();

      alert(results.join("\n"));
    } catch (e) {
      alert("Upload failed: " + (e.message || String(e)));
    } finally {
      const button = $("#go");
      if (button) {
        button.disabled = false;
        button.textContent = "Upload";
      }
    }
  };

  };
}

/* ---------- auth + routing ---------- */
function loginView(err = "") {
  paint(`<div class="login"><form class="card f" id="lf"><div class="brand"><span class="logo">${ic("bar-chart-3")}</span><span>HHG <b>BI SUITE</b></span></div>
<p class="mu" style="margin:8px 0 8px;text-align:center">Sign in to view reports.</p>${err ? `<div class="err">${esc(err)}</div>` : ""}
<label for="e">Email</label><div class="ip">${ic("mail")}<input id="e" type="email" required autocomplete="username"></div>
<label for="pw">Password</label><div class="ip">${ic("lock")}<input id="pw" type="password" required autocomplete="current-password"></div>
<button class="btn" style="width:100%;margin-top:18px">${ic("log-in")}Sign in</button>
<p class="mu" style="text-align:center;margin:18px 0 0;font-size:12.5px">${ic("clock")} ${clockHtml().replace(/<\/?small>/g, " ")}</p></form></div>`);
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $("#e").value, password: $("#pw").value });
    if (error) return loginView(error.message);
    start();
  };
}
async function signOut() { if (sb) await sb.auth.signOut(); D.clear(); start(); }
async function start() {
  if (DEMO) { state.user = { email: "demo@hhg.local" }; state.role = "admin"; return route(); }
  const { data } = await sb.auth.getSession();
  if (!data.session) return loginView();
  state.user = data.session.user;
  const { data: prof, error: profileError } = await sb
  .from("profiles")
  .select("role")
  .eq("id", state.user.id)
  .maybeSingle();

if (profileError) {
  console.error("Profile role lookup failed:", profileError);
  state.role = "viewer";
} else {
  state.role = prof?.role || "viewer";
}
  route();
}
const PAGES = { dashboard: pageDashboard, compare: pageCompare, pace: pagePace, reservations: pageReservations, admin: pageAdmin };
async function route() {
  if (!state.user) return;
  state.page = (location.hash.replace(/^#\//, "") || "dashboard"); if (!PAGES[state.page]) state.page = "dashboard";
  const [, label, icon] = TITLES[state.page];
  paint(shell(label, icon, `<div class="empty">${ic("loader-2")} Loading…</div>`)); $(".empty i")?.classList.add("spin");
  try { await PAGES[state.page](); }
  catch (e) { console.error(e); paint(shell(label, icon, `<div class="err">${ic("alert-circle")} Could not load data: ${esc(e.message || e)}. Check that supabase/schema.sql has been run and the anon key in config.js is correct.</div>`)); }
}
window.addEventListener("hashchange", route);
start();
})();
