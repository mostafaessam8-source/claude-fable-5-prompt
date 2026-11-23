const pptxgen = require("pptxgenjs");
const fs = require("fs");
const T = require("./sar_theme.js");
const L = require("./sar_layouts.js");
const C = T.C;
const D = JSON.parse(fs.readFileSync("./deck.json", "utf8"));

const b64 = (p, mime) => `${mime};base64,` + fs.readFileSync(p).toString("base64");
const logo = b64("sar-logo.png", "image/png");
const logoWhite = b64("sar-logo-white-ar.png", "image/png");
const photoCover = b64("photo-platform.jpg", "image/jpeg");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "Zulfi Train Station - Project Schedule, Spending Plan and Approval";
pres.author = "Saudi Arabia Railways (SAR)";
const S = L.init(pres, { logo, logoWhite, logoRatio: 420 / 127 });

const F = T.F_EN;
const TX = (o = {}) => Object.assign({ fontFace: F, margin: 0, isTextBox: true, color: C.black }, o);
const ANIM = {};
function step(n, list, gap) { if (gap) list[0].gap = gap; (ANIM[n] = ANIM[n] || []).push(list); }
const NTP_NOTE = "Month numbers count from the Notice to Proceed (Month 1 = first month). Calendar dates are indicative: the NTP date is not yet confirmed.";
const BC = "Zulfi Train Station | Schedule Review";
const fmtM = (v, d = 1) => v.toFixed(d);
let page = 0;
function content(title, sub) {
  const s = pres.addSlide(); page += 1;
  const r = S.content(s, { titleText: title, sub, breadcrumb: BC, page });
  return { s, r };
}
const sq = (s, x, y, w, h, fill, name, line) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: line || fill, width: line ? 0.75 : 0 }, objectName: name });

// ====================================================== 1. COVER
{
  const s = pres.addSlide(); page += 1;
  S.cover(s, { photo: photoCover, titleText: "Zulfi Train Station", subtitle: "Project Schedule, Spending Plan and Approval", meta: "EPC contract | SAR 99.999 M excl. VAT | 26 months from Notice to Proceed" });
  step(1, [{ name: "t:Zulfi Train Station", fx: "fade" }]);
  step(1, [{ name: "t:Project Schedule, Spending Plan and Approval", fx: "fade" }]);
  step(1, [{ name: "t:EPC contract | SAR 99.999 M excl. VAT | 26 months from Notice to Proceed", fx: "fade" }]);
  s.addNotes("Purpose of this review: present the baseline schedule, the two phases, the spending plan and the open comments, and obtain approval (OK / Not OK).");
}

// ====================================================== 2. HIGHLIGHTS
{
  const { s } = content("Project highlights", "Summary of the baseline programme for approval");
  const m = D.ms, st = D.stats;
  const kp = [
    ["99.999 M", "Contract value, SAR excl. VAT"],
    ["26 months", "Contract duration from NTP"],
    ["16 items", "BOQ items, 5 of them long-lead"],
    ["Month 12", "Work permit and construction start"],
    ["Month 26", "Taking-Over of all works"],
    ["Zero float", "Finish on the 31 Dec 2028 contract completion"],
  ];
  const tw = 2.2, th = 1.5, gx = 0.2, gy = 0.2, x0 = 0.85, y0 = 1.95;
  kp.forEach((k, i) => {
    const x = x0 + (i % 3) * (tw + gx), y = y0 + Math.floor(i / 3) * (th + gy);
    sq(s, x, y, tw, th, C.tint05, `k${i}_bg`, C.coolGray);
    sq(s, x, y, tw, 0.07, i === 5 ? C.yellow : C.blue, `k${i}_bar`);
    s.addText(k[0], TX({ x: x + 0.15, y: y + 0.22, w: tw - 0.3, h: 0.62, fontSize: 26, bold: true, color: C.blue, valign: "middle", objectName: `k${i}_v` }));
    s.addText(k[1], TX({ x: x + 0.15, y: y + 0.88, w: tw - 0.3, h: 0.5, fontSize: 12, objectName: `k${i}_l` }));
    step(2, [{ name: `k${i}_bg`, fx: "wipe" }, { name: `k${i}_bar`, fx: "wipe" }, { name: `k${i}_v`, fx: "fade" }, { name: `k${i}_l`, fx: "fade" }]);
  });
  const bx = 8.1, bw = 12.6 - bx;
  s.addText("Key highlights", TX({ x: bx, y: 1.95, w: bw, h: 0.35, fontSize: 16, bold: true, color: C.blue, objectName: "hl_h" }));
  step(2, [{ name: "hl_h", fx: "fade" }]);
  const hl = [
    "Two-phase EPC delivery: Phase 1 with 12 items and Phase 2 with 4 items.",
    "Design is approved in three gates: Month 3, Month 6 and Month 11.",
    "Five long-lead packages (150 to 245 days of manufacture) shape the schedule.",
    "Construction runs from Month 12 to Month 24; Taking-Over in Month 26 with zero float to contract completion.",
    "Critical path: Phase 2 Railway Track, from Gate 3 to Taking-Over.",
    "72 submittals are now separate from their SAR or authority approvals.",
  ];
  hl.forEach((t, i) => {
    const y = 2.42 + i * 0.7;
    sq(s, bx, y + 0.1, 0.13, 0.13, C.blue, `h${i}_b`);
    s.addText(t, TX({ x: bx + 0.28, y, w: bw - 0.28, h: 0.62, fontSize: 13, valign: "top", objectName: `h${i}_t` }));
    step(2, [{ name: `h${i}_b`, fx: "wipe" }, { name: `h${i}_t`, fx: "fade" }]);
  });
  s.addText(NTP_NOTE, TX({ x: 0.85, y: 6.45, w: 11.75, h: 0.3, fontSize: 10, color: C.slate, objectName: "note" }));
  s.addNotes("Highlights of the baseline: SAR 99.999 M excl. VAT, 26 months, Taking-Over in Month 26 with " + D.stats.float + " days of float to the contract completion date.");
}

// ====================================================== 3. PHASES
{
  const { s } = content("Phase 1 and Phase 2 launch", "What starts when, and what each phase delivers");
  const P = D.phases;
  const cols = [
    { n: "Phase 1", p: P["Phase 1"], launch: "Procurement launches 15 days after Gate 2 (Month 7)", color: C.blue },
    { n: "Phase 2", p: P["Phase 2"], launch: "Procurement launches after Gate 3 approval (Month 11)", color: C.black },
  ];
  const cw = 5.8, gap = 0.15;
  cols.forEach((c, i) => {
    const x = 0.85 + i * (cw + gap), y = 1.95, p = c.p, id = `p${i}`;
    sq(s, x, y, cw, 4.55, C.white, `${id}_bg`, C.coolGray);
    sq(s, x, y, cw, 0.75, c.color, `${id}_hd`);
    s.addText(c.n, TX({ x: x + 0.25, y, w: 2.2, h: 0.75, fontSize: 22, bold: true, color: C.white, valign: "middle", objectName: `${id}_n` }));
    s.addText(`${p.items.length} items | SAR ${(p.value / 1e6).toFixed(1)} M`, TX({ x: x + 2.4, y, w: cw - 2.65, h: 0.75, fontSize: 15, color: C.white, align: "right", valign: "middle", objectName: `${id}_v` }));
    step(3, [{ name: `${id}_bg`, fx: "wipe" }, { name: `${id}_hd`, fx: "wipe" }, { name: `${id}_n`, fx: "fade" }, { name: `${id}_v`, fx: "fade" }]);
    const mm = (a, b) => `Month ${a} to ${b}`;
    const rows = [
      ["Launch", c.launch],
      ["Design", `${mm(p.design_s_m, p.design_f_m)} (${p.design_s_l} to ${p.design_f_l})`],
      ["Procurement", `${mm(p.pc_s_m, p.pc_f_m)} (${p.pc_s_l} to ${p.pc_f_l})`],
      ["Construction", `${mm(p.cn_s_m, p.cn_f_m)} (${p.cn_s_l} to ${p.cn_f_l})`],
      ["Testing and commissioning", `${mm(p.tc_s_m, p.tc_f_m)} (${p.tc_s_l} to ${p.tc_f_l})`],
      ["Long-lead packages", p.long.join(", ")],
    ];
    rows.forEach((r, k) => {
      const ry = y + 0.9 + k * 0.52;
      s.addText(r[0], TX({ x: x + 0.25, y: ry, w: 1.9, h: 0.46, fontSize: 12, bold: true, color: c.color === C.black ? C.black : C.blue, valign: "middle", objectName: `${id}_r${k}l` }));
      s.addText(r[1], TX({ x: x + 2.15, y: ry, w: cw - 2.4, h: 0.46, fontSize: 12, valign: "middle", objectName: `${id}_r${k}v` }));
      step(3, [{ name: `${id}_r${k}l`, fx: "fade" }, { name: `${id}_r${k}v`, fx: "fade" }]);
    });
    const items = p.items.map(a => a[1]).join(", ");
    s.addText("Scope: " + items, TX({ x: x + 0.25, y: y + 4.02, w: cw - 0.5, h: 0.45, fontSize: 10, color: C.slate, valign: "top", objectName: `${id}_sc` }));
    step(3, [{ name: `${id}_sc`, fx: "fade" }]);
  });
  s.addText("Design for both phases runs together through the three gates; the phases differ in when procurement and construction are released. " + NTP_NOTE, TX({ x: 0.85, y: 6.55, w: 11.75, h: 0.35, fontSize: 10, color: C.slate, objectName: "note" }));
  s.addNotes("Phase 1 procurement is released 15 days after Gate 2. Phase 2 procurement follows Gate 3, as required by the SAR comment on the tender programme.");
}

// ====================================================== 4. GANTT FOR APPROVAL
{
  const { s } = content("Programme for approval", "Level 2 schedule - months from Notice to Proceed");
  const rowsSrc = D.gantt;
  const lab = {
    "Preliminaries, surveys & mobilisation": "Preliminaries and mobilisation", "Authority approvals & permits": "Authority approvals and permits", "Design - Concept": "Design - Concept", "Design - Preliminary": "Design - Preliminary",
    "Design - Detailed": "Design - Detailed (IFC)", "Procurement - Phase 1 short lead": "Procurement - Phase 1 short lead", "Procurement - long lead (manufacture & ship)": "Long-lead manufacture and shipping",
    "Procurement - Phase 2 short lead": "Procurement - Phase 2 short lead", "Construction - Main Building": "Construction - Main Building", "Construction - Ancillary Buildings": "Construction - Ancillary Buildings",
    "Construction - External Works": "Construction - External Works", "Construction - Road Works": "Construction - Road Works", "Construction - Railway Systems": "Construction - Railway Systems",
    "Testing, commissioning & trial running": "Testing, commissioning, trial running", "Close-out & taking over": "Close-out and Taking-Over",
  };
  const col = (l) => l.startsWith("Preliminaries") ? C.coolGray : l.startsWith("Authority") ? C.slate : l.startsWith("Design") ? C.sky : l.includes("Phase 1") ? C.midBlue : l.includes("long lead") ? C.black : l.includes("Phase 2") ? C.slate :
    l.includes("Railway") ? C.red : l.startsWith("Construction") ? C.blue : l.startsWith("Testing") ? C.yellow : C.coolGray;
  const NTP = Date.parse("2026-11-01");
  const mf = (iso) => (Date.parse(iso) - NTP) / 864e5 / 30.4375;
  const lx = 0.85, lw = 3.3, x0 = lx + lw + 0.1, x1 = 12.55, W = (x1 - x0) / 26, ry0 = 2.5, rh = 0.27;
  // gates flags
  const flags = [["Gate 1", 3], ["Gate 2", 6], ["Gate 3", 11], ["Work permit", 12], ["Taking-Over", 26]];
  s.addShape(pres.ShapeType.rect, { x: x0, y: 2.18, w: x1 - x0, h: 0.26, fill: { color: C.tint10 }, line: { color: C.tint10, width: 0 }, objectName: "ruler" });
  for (let m = 1; m <= 26; m++) {
    s.addText(String(m), TX({ x: x0 + (m - 1) * W, y: 2.18, w: W, h: 0.26, fontSize: 9, color: C.black, align: "center", valign: "middle", objectName: m === 1 ? "mn1" : undefined }));
  }
  s.addText("Month", TX({ x: lx, y: 2.18, w: lw, h: 0.26, fontSize: 10, bold: true, color: C.blue, valign: "middle" }));
  flags.forEach((f, i) => {
    const x = x0 + f[1] * W;
    s.addShape(pres.ShapeType.line, { x, y: 2.44, w: 0, h: rowsSrc.length * rh + 0.1, line: { color: f[0] === "Taking-Over" ? C.black : C.slate, width: 1, dashType: "dash" }, objectName: `fl${i}_ln` });
    const al = f[0] === "Gate 3" || f[0] === "Taking-Over" ? "right" : f[0] === "Work permit" ? "left" : "center";
    const fx0 = al === "right" ? x - 1.4 + 0.05 : al === "left" ? x - 0.05 : x - 0.7;
    s.addText(f[0], TX({ x: fx0, y: 1.9, w: 1.4, h: 0.26, fontSize: 9, bold: true, color: C.black, align: al, objectName: `fl${i}_t` }));
  });
  step(4, [{ name: "ruler", fx: "wipe" }, ...flags.map((f, i) => ({ name: `fl${i}_ln`, fx: "wipe" })), ...flags.map((f, i) => ({ name: `fl${i}_t`, fx: "fade" }))]);
  rowsSrc.forEach((r, i) => {
    const y = ry0 + i * rh, a = mf(r.s), b = mf(r.e) + 0.03;
    if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: lx, y, w: x1 - lx, h: rh, fill: { color: C.tint05 }, line: { color: C.tint05, width: 0 }, objectName: `g${i}_bg` });
    s.addText(lab[r.label] || r.label, TX({ x: lx + 0.08, y, w: lw - 0.1, h: rh, fontSize: 10, valign: "middle", objectName: `g${i}_l` }));
    const bx = x0 + a * W, bw = Math.max((b - a) * W, 0.08);
    s.addShape(pres.ShapeType.rect, { x: bx, y: y + 0.045, w: bw, h: rh - 0.09, fill: { color: col(r.label) }, line: { color: col(r.label), width: 0 }, objectName: `g${i}_b` });
    step(4, [{ name: `g${i}_l`, fx: "fade" }, { name: `g${i}_b`, fx: "wipe" }], 140);
  });
  const lg = [["Preliminaries / approvals", C.coolGray], ["Design", C.sky], ["Procurement", C.midBlue], ["Long-lead", C.black], ["Construction", C.blue], ["Railway", C.red], ["Testing", C.yellow]];
  lg.forEach((l, i) => {
    const x = 0.85 + i * 1.75;
    sq(s, x, 6.66, 0.16, 0.16, l[1], `lg${i}_c`);
    s.addText(l[0], TX({ x: x + 0.22, y: 6.6, w: 1.5, h: 0.28, fontSize: 9, valign: "middle", objectName: `lg${i}_t` }));
  });
  step(4, [...lg.map((l, i) => ({ name: `lg${i}_c`, fx: "fade" })), ...lg.map((l, i) => ({ name: `lg${i}_t`, fx: "fade" }))]);
  s.addNotes("Level 2 programme. Gate 1, Gate 2 and Gate 3 close the design; the work permit follows Gate 3; Taking-Over is in Month 26.");
}

// ====================================================== 5. MILESTONES - DECISION
{
  const { s } = content("Key dates for approval", "Please mark each milestone: OK or Not OK");
  const ms = D.ms;
  const rows = [
    ["Notice to Proceed", ms["MS-0010"], "Contract start, date to be confirmed"],
    ["Access permits obtained", ms["MS-0020"], "Tender note: month 1"],
    ["Gate 1 - Concept design approved", ms["MS-0030"], "Tender window: months 2 to 3"],
    ["Gate 2 - Preliminary design approved", ms["MS-0040"], "Tender window: months 4 to 6"],
    ["Phase 1 procurement start", ms["MS-0050"], "15 days after Gate 2"],
    ["Gate 3 - Detailed design (IFC) approved", ms["MS-0060"], "Tender window: months 7 to 11"],
    ["Phase 2 procurement start", ms["MS-0080"], "Follows Gate 3 approval"],
    ["Work permit and construction start", ms["MS-0090"], "14 days after Gate 3"],
    ["Signalling and turnout materials on site", ms["MS-0100"], "Long-lead delivery"],
    ["Track materials on site", ms["MS-0110"], "Long-lead delivery"],
    ["All construction works complete", ms["MS-0120"], "Before testing and trial running"],
    ["Taking-Over of all works", ms["MS-0130"], "Contract completion: 31 Dec 2028"],
  ];
  const hdr = ["Milestone", "Month", "Indicative", "Basis", "OK", "Not OK"].map((t, i) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, align: i === 0 || i === 3 ? "left" : "center", fontFace: F, fontSize: 11 } }));
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white;
    const o = (al, extra = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 11, align: al, valign: "middle" }, extra);
    return [{ text: r[0], options: o("left", { bold: true }) }, { text: String(r[1].m), options: o("center") }, { text: r[1].l, options: o("center") }, { text: r[2], options: o("left") }, { text: "", options: o("center") }, { text: "", options: o("center") }];
  });
  const colW = [3.9, 0.8, 1.15, 3.4, 1.2, 1.3], rowH = 0.355, ty = 1.9;
  s.addTable([hdr, ...body], { x: 0.85, y: ty, w: 11.75, colW, rowH, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step(5, [{ name: "tbl", fx: "wipe" }]);
  rows.forEach((r, i) => {
    const y = ty + rowH * (i + 1) + (rowH - 0.2) / 2;
    sq(s, 0.85 + 3.9 + 0.8 + 1.15 + 3.4 + (1.2 - 0.2) / 2, y, 0.2, 0.2, C.white, `ok${i}`, C.slate);
    sq(s, 0.85 + 3.9 + 0.8 + 1.15 + 3.4 + 1.2 + (1.3 - 0.2) / 2, y, 0.2, 0.2, C.white, `no${i}`, C.slate);
  });
  step(5, rows.flatMap((r, i) => [{ name: `ok${i}`, fx: "fade" }, { name: `no${i}`, fx: "fade" }]), 600);
  s.addText(NTP_NOTE, TX({ x: 0.85, y: 6.62, w: 11.75, h: 0.3, fontSize: 10, color: C.slate, objectName: "note" }));
  s.addNotes("Each milestone is to be marked OK or Not OK. Not OK items go to the comments register before final approval.");
}

// ====================================================== 6. SPENDING PLAN
{
  const { s } = content("Spending plan", "Cumulative progress against cash, and the quarterly profile");
  const mon = D.months.map((_, i) => String(i + 1));
  s.addChart(pres.charts.LINE, [
    { name: "Performance (progress value)", labels: mon, values: D.cperf.map(v => +v.toFixed(1)) },
    { name: "Cash flow (net, incl. advance)", labels: mon, values: D.cnet.map(v => +v.toFixed(1)) },
  ], {
    x: 0.85, y: 1.8, w: 5.8, h: 2.35, chartColors: [C.blue, C.red], lineSize: 2.5, lineDataSymbol: "none", showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 10, legendColor: C.black,
    showTitle: true, title: "Cumulative, % of contract value (by month)", titleFontFace: F, titleFontSize: 12, titleColor: C.blue,
    catAxisLabelFontFace: F, catAxisLabelFontSize: 9, valAxisLabelFontFace: F, valAxisLabelFontSize: 9, catAxisLabelColor: C.black, valAxisLabelColor: C.black,
    valGridLine: { color: C.coolGray, size: 0.5 }, catGridLine: { style: "none" }, valAxisMaxVal: 100, valAxisMinVal: 0, valAxisLabelFormatCode: "0", objectName: "ch1",
  });
  const qs = D.q.map((b, i) => "Q" + (i + 1));
  s.addChart(pres.charts.BAR, [
    { name: "Performance", labels: qs, values: D.q.map(b => +b.perf.toFixed(1)) },
    { name: "Net cash", labels: qs, values: D.q.map(b => +b.net.toFixed(1)) },
  ], {
    x: 6.8, y: 1.8, w: 5.8, h: 2.35, barDir: "col", barGrouping: "clustered", chartColors: [C.midBlue, C.blue], showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 10, legendColor: C.black,
    showTitle: true, title: "Quarterly, SAR million", titleFontFace: F, titleFontSize: 12, titleColor: C.blue, catAxisLabelFontFace: F, catAxisLabelFontSize: 10, valAxisLabelFontFace: F, valAxisLabelFontSize: 9,
    catAxisLabelColor: C.black, valAxisLabelColor: C.black, valGridLine: { color: C.coolGray, size: 0.5 }, catGridLine: { style: "none" }, barGapWidthPct: 60, objectName: "ch2",
  });
  step(6, [{ name: "ch1", fx: "wipe" }]);
  step(6, [{ name: "ch2", fx: "wipe" }]);
  // table under the charts
  const cumNet = D.cnet; let cq = 0;
  const qcols = D.q.map((b, i) => {
    const endIdx = b.m1 - 1; return { q: "Q" + (i + 1), months: b.m1 > b.m0 ? `${b.m0}-${b.m1}` : String(b.m0), perf: b.perf, net: b.net, cum: cumNet[endIdx] };
  });
  const H = (t, al = "center") => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 10, align: al, valign: "middle" } });
  const cell = (t, i, o = {}) => ({ text: t, options: Object.assign({ fontFace: F, fontSize: 10, align: "center", valign: "middle", color: C.black, fill: { color: i % 2 ? C.tint05 : C.white } }, o) });
  const lab = (t, i) => cell(t, i, { align: "left", bold: true });
  const rowsT = [
    [H("Quarter", "left"), ...qcols.map(c => H(c.q))],
    [lab("Months from NTP", 0), ...qcols.map(c => cell(c.months, 0))],
    [lab("Performance, SAR M", 1), ...qcols.map(c => cell(c.perf.toFixed(1), 1))],
    [lab("Net cash, SAR M", 0), ...qcols.map(c => cell(c.net.toFixed(1), 0))],
    [lab("Cumulative cash, %", 1), ...qcols.map(c => cell(Math.round(c.cum) + "%", 1))],
  ];
  s.addTable(rowsT, { x: 0.85, y: 4.2, w: 11.75, colW: [2.35, ...Array(9).fill((11.75 - 2.35) / 9)], rowH: 0.27, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step(6, [{ name: "tbl", fx: "wipe" }]);
  s.addText("Expected semi-annual transfers, SAR million", TX({ x: 0.85, y: 5.58, w: 8, h: 0.26, fontSize: 12, bold: true, color: C.blue, objectName: "sa_h" }));
  step(6, [{ name: "sa_h", fx: "fade" }]);
  const totS = D.s.reduce((a, b) => a + b.net, 0); let cumS = 0;
  const tws = (11.75 - 4 * 0.15) / 5;
  D.s.forEach((b, i) => {
    cumS += b.net;
    const x = 0.85 + i * (tws + 0.15), y = 5.88;
    sq(s, x, y, tws, 0.72, C.tint05, `sa${i}_bg`, C.coolGray);
    s.addText(b.net.toFixed(1), TX({ x: x + 0.12, y: y + 0.02, w: tws - 0.24, h: 0.4, fontSize: 18, bold: true, color: C.blue, valign: "middle", objectName: `sa${i}_v` }));
    s.addText(`Months ${b.m0}-${b.m1} | cum. ${Math.round(cumS / totS * 100)}%`, TX({ x: x + 0.12, y: y + 0.43, w: tws - 0.24, h: 0.25, fontSize: 10, objectName: `sa${i}_l` }));
    step(6, [{ name: `sa${i}_bg`, fx: "wipe" }, { name: `sa${i}_v`, fx: "fade" }, { name: `sa${i}_l`, fx: "fade" }]);
  });
  s.addText("Planning estimates; include a 10% advance payment (assumption) recovered proportionally. Updated every quarter.", TX({ x: 0.85, y: 6.65, w: 11.75, h: 0.28, fontSize: 10, color: C.slate, objectName: "note" }));
  s.addNotes("Spending follows the baseline: performance is the progress value, cash is the invoiced value. The semi-annual figures are the expected transfers for the Zulfi Cooperative Society cost distribution plan.");
}

// ====================================================== 7. BUDGET DISTRIBUTION
{
  const { s } = content("Budget distribution mechanism", "How the SAR 99.999 M contract value is split and paid");
  const cp = D.comp;
  const comps = [
    ["Construction and T&C", cp.C, "Monthly progress"],
    ["Material delivered", cp.MD, "On delivery to site"],
    ["Engineering and design", cp.E + cp.D, "On completion of each submission"],
    ["Procurement", cp.P, "On approval and PO placement"],
    ["Preliminaries", cp.PRE, "Time-related lump sum"],
  ];
  const total = comps.reduce((a, c) => a + c[1], 0);
  s.addChart(pres.charts.DOUGHNUT, [{ name: "Budget", labels: comps.map(c => c[0]), values: comps.map(c => +(c[1] / 1e6).toFixed(2)) }], {
    x: 0.85, y: 1.85, w: 4.6, h: 3.0, chartColors: [C.blue, C.midBlue, C.sky, C.slate, C.coolGray], holeSize: 55, showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 9, legendColor: C.black,
    showPercent: true, showValue: false, showLabel: false, dataLabelColor: C.white, dataLabelFontFace: F, dataLabelFontSize: 10, showTitle: false, objectName: "donut",
  });
  step(7, [{ name: "donut", fx: "wipe" }]);
  const hdr = ["Component", "SAR M", "%", "Invoicing basis"].map((t, i) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: i === 0 || i === 3 ? "left" : "center" } }));
  const body = comps.map((c, i) => {
    const f = i % 2 ? C.tint05 : C.white;
    const o = (al, e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 11, align: al, valign: "middle" }, e);
    return [{ text: c[0], options: o("left", { bold: true }) }, { text: (c[1] / 1e6).toFixed(2), options: o("center") }, { text: (c[1] / total * 100).toFixed(1) + "%", options: o("center") }, { text: c[2], options: o("left") }];
  });
  body.push([{ text: "Total", options: { bold: true, fill: { color: C.tint10 }, fontFace: F, fontSize: 11, color: C.black } }, { text: (total / 1e6).toFixed(2), options: { bold: true, fill: { color: C.tint10 }, fontFace: F, fontSize: 11, align: "center", color: C.black } },
    { text: "100%", options: { bold: true, fill: { color: C.tint10 }, fontFace: F, fontSize: 11, align: "center", color: C.black } }, { text: "", options: { fill: { color: C.tint10 } } }]);
  s.addTable([hdr, ...body], { x: 5.7, y: 2.0, w: 6.9, colW: [2.2, 0.9, 0.8, 3.0], rowH: 0.42, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step(7, [{ name: "tbl", fx: "wipe" }]);
  // payment milestone graphic for the table above
  const LN = D.lanes, lx0 = 0.85, lw0 = 2.3, tx0 = lx0 + lw0 + 0.1, tx1 = 12.55, mw = (tx1 - tx0) / 26;
  s.addText("When each component is paid (month from NTP)", TX({ x: lx0, y: 4.98, w: 8, h: 0.26, fontSize: 12, bold: true, color: C.blue, objectName: "pm_h" }));
  sq(s, tx0, 5.27, tx1 - tx0, 0.2, C.tint10, "pm_ruler");
  for (let m = 1; m <= 26; m++) s.addText(String(m), TX({ x: tx0 + (m - 1) * mw, y: 5.27, w: mw, h: 0.2, fontSize: 9, align: "center", valign: "middle" }));
  step(7, [{ name: "pm_h", fx: "fade" }, { name: "pm_ruler", fx: "wipe" }]);
  const lanes = [
    ["Engineering and design", "ED", C.sky, "dia", "Design approvals (Gates 1, 2, 3)"],
    ["Procurement", "P", C.slate, "dia", "PO placement"],
    ["Material delivered", "MD", C.midBlue, "dia", "Delivery to site"],
    ["Construction and T&C", "C", C.blue, "bar", "Monthly progress"],
    ["Preliminaries", "PRE", C.coolGray, "bar", "Time-related"],
  ];
  const rh2 = 0.27;
  lanes.forEach((l, i) => {
    const y = 5.52 + i * rh2, ln = LN[l[1]];
    if (i % 2 === 0) sq(s, lx0, y, tx1 - lx0, rh2, C.tint05, `pl${i}_bg`);
    s.addText(l[0], TX({ x: lx0 + 0.08, y, w: lw0 - 0.1, h: rh2, fontSize: 10, bold: true, valign: "middle", objectName: `pl${i}_l` }));
    const els = [{ name: `pl${i}_l`, fx: "fade" }];
    if (l[3] === "bar") {
      sq(s, tx0 + (ln.first - 1) * mw, y + 0.06, (ln.last - ln.first + 1) * mw, rh2 - 0.12, l[2], `pl${i}_b`);
      els.push({ name: `pl${i}_b`, fx: "wipe" });
    } else {
      ln.fin.forEach((m, k) => {
        s.addShape(pres.ShapeType.diamond, { x: tx0 + (m - 1) * mw + (mw - 0.17) / 2, y: y + (rh2 - 0.17) / 2, w: 0.17, h: 0.17, fill: { color: l[2] }, line: { color: C.white, width: 0.5 }, objectName: `pl${i}_d${k}` });
        els.push({ name: `pl${i}_d${k}`, fx: "fade" });
      });
    }
    step(7, els, 250);
  });
  s.addNotes("The QS cost distribution splits each BOQ item into engineering and design, procurement, material delivered and construction. The same values are loaded in P6 twice: a performance resource for progress and a cash resource for invoicing. SAR issues a quarterly cash flow and the Zulfi Cooperative Society transfers payments every six months against this plan.");
}

// ====================================================== 8. COMMENTS + FINAL APPROVAL
{
  const { s } = content("Comments and final approval", "Review points to close before the schedule is approved");
  const rows = [
    ["1", "IFC review window", "28 days for 16 packages submitted together; confirm SAR review capacity or stagger the packages", "SAR Design", "Open"],
    ["2", "Concept and preliminary reviews", "14 and 21 days with all packages in the same window; confirm capacity", "SAR Design", "Open"],
    ["3", "Taking-Over certificate", "11 days to review and issue (critical path); confirm SAR can review within this period", "SAR PMO", "Open"],
    ["4", "Safety assessment", "15 days; about 30 days recommended after trial running (critical path)", "SAR Safety", "Open"],
    ["5", "Possession booking", "30 days for track and turnout tie-in; confirm with SAR Operations", "SAR Operations", "Open"],
    ["6", "SEC permanent power", "90 days for the supply agreement; confirm or allow 120 days", "SEC / SAR", "Open"],
    ["7", "Payment terms", "10% advance and recovery are planning assumptions; confirm", "SAR Finance", "Open"],
    ["8", "Notice to Proceed date", "Not yet confirmed; all calendar dates move with it", "SAR PMO", "Open"],
  ];
  const hdr = ["No.", "Topic", "Comment", "Owner", "Status"].map((t, i) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: i === 2 || i === 1 ? "left" : "center" } }));
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white;
    const o = (al, e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 10.5, align: al, valign: "middle" }, e);
    return [{ text: r[0], options: o("center") }, { text: r[1], options: o("left", { bold: true }) }, { text: r[2], options: o("left") }, { text: r[3], options: o("center") }, { text: r[4], options: o("center", { bold: true, color: C.black, fill: { color: C.yellow } }) }];
  });
  s.addTable([hdr, ...body], { x: 0.85, y: 1.9, w: 11.75, colW: [0.6, 2.4, 5.65, 1.7, 1.4], rowH: 0.4, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step(8, [{ name: "tbl", fx: "wipe" }]);
  sq(s, 0.85, 5.62, 11.75, 1.0, C.tint05, "dec_bg", C.coolGray);
  s.addText("Final decision", TX({ x: 1.05, y: 5.62, w: 2.2, h: 1.0, fontSize: 16, bold: true, color: C.blue, valign: "middle", objectName: "dec_h" }));
  const opts = ["Approved", "Approved with comments", "Not approved"];
  opts.forEach((o, i) => {
    const x = 3.4 + i * 3.05;
    sq(s, x, 5.98, 0.28, 0.28, C.white, `dec${i}_b`, C.slate);
    s.addText(o, TX({ x: x + 0.4, y: 5.62, w: 2.5, h: 1.0, fontSize: 13, bold: true, valign: "middle", objectName: `dec${i}_t` }));
  });
  step(8, [{ name: "dec_bg", fx: "wipe" }, { name: "dec_h", fx: "fade" }, ...opts.flatMap((o, i) => [{ name: `dec${i}_b`, fx: "fade" }, { name: `dec${i}_t`, fx: "fade" }])]);
  s.addNotes("These comments are recorded as open. They are reviewed with the owners, closed or accepted, and the final decision is then recorded.");
}

// ====================================================== 9. END
{
  const s = pres.addSlide(); page += 1;
  S.endSlide(s, { text: "Thank You" });
  step(9, [{ name: "t:Thank You", fx: "fade" }]);
}

fs.writeFileSync("anim.json", JSON.stringify(ANIM));
pres.writeFile({ fileName: "stage.pptx" }).then(() => console.log("built " + page));
