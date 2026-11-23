const pptxgen = require("pptxgenjs");
const fs = require("fs");
const T = require("./sar_theme.js");
const L = require("./sar_layouts.js");
const C = T.C;
const D = JSON.parse(fs.readFileSync("./deck.json", "utf8"));
const b64 = (p, mime) => `${mime};base64,` + fs.readFileSync(p).toString("base64");
const logo = b64("sar-logo.png", "image/png");
const logoWhite = b64("sar-logo-white-ar.png", "image/png");
const art = b64("train_art.png", "image/png");
const mapImg = b64("map.png", "image/png");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "Zulfi Train Station - CEO Briefing";
pres.author = "Saudi Arabia Railways (SAR)";
const S = L.init(pres, { logo, logoWhite, logoRatio: 420 / 127 });
const F = T.F_EN;
const TX = (o = {}) => Object.assign({ fontFace: F, margin: 0, isTextBox: true, color: C.black }, o);
const ANIM = {};
function step(n, list, gap) { if (gap) list[0].gap = gap; (ANIM[n] = ANIM[n] || []).push(list); }
const BC = "Zulfi Train Station | CEO Briefing";
let page = 0;
function content(title, sub) {
  const s = pres.addSlide(); page += 1;
  S.content(s, { titleText: title, sub, breadcrumb: BC, page });
  return s;
}
const sq = (s, x, y, w, h, fill, name, line) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: line || fill, width: line ? 0.75 : 0 }, objectName: name });
const NTP_NOTE = "Months count from the Notice to Proceed (Month 1 = first month). The NTP date is not yet confirmed, so every calendar date moves with it.";
const M = (v) => (v / 1e6).toFixed(1);
const DARK_T = "006069", MID_T = "008A97";

// ====================================================== 1. COVER (project template)
{
  const s = pres.addSlide(); page += 1;
  s.background = { color: C.white };
  const lg = S.box(0.8);
  s.addImage({ data: logo, x: (13.33 - lg.w) / 2, y: 0.45, w: lg.w, h: lg.h, objectName: "cv_logo" });
  sq(s, 0, 1.55, 0.8, 2.2, DARK_T, "cv_bl1"); sq(s, 0.8, 1.55, 0.7, 2.2, MID_T, "cv_bl2");
  sq(s, 13.33 - 1.5, 1.55, 0.7, 2.2, MID_T, "cv_br1"); sq(s, 13.33 - 0.8, 1.55, 0.8, 2.2, DARK_T, "cv_br2");
  s.addText("Zulfi Train Station", TX({ x: 1.7, y: 1.7, w: 9.93, h: 0.85, align: "center", fontSize: 40, bold: true, valign: "middle", objectName: "cv_title" }));
  s.addText("CEO Briefing", TX({ x: 1.7, y: 2.6, w: 9.93, h: 0.45, align: "center", fontSize: 24, italic: true, color: DARK_T, valign: "middle", objectName: "cv_sub" }));
  s.addText("Project Brief, Location, Scope of Work, Phasing, Cash Flow and Current Status", TX({ x: 1.7, y: 3.12, w: 9.93, h: 0.4, align: "center", fontSize: 14, italic: true, color: C.slate, valign: "middle", objectName: "cv_tag" }));
  s.addImage({ data: art, x: 2.68, y: 4.1, w: 7.5, h: 1.6, objectName: "cv_art" });
  sq(s, 0, 6.3, 13.33, 0.06, DARK_T, "cv_line");
  sq(s, 0, 6.36, 13.33, 0.78, "F4F8F9", "cv_strip");
  s.addText("NSR Programme Management", TX({ x: 0, y: 6.36, w: 13.33, h: 0.78, align: "center", fontSize: 16, bold: true, valign: "middle", objectName: "cv_nsr" }));
  s.addText("[I] Internal", TX({ x: 0, y: 7.18, w: 13.33, h: 0.22, align: "center", fontSize: 9, italic: true, color: C.slate, objectName: "cv_int" }));
  step(page, [{ name: "cv_logo", fx: "fade" }]);
  step(page, [{ name: "cv_bl1", fx: "wipe" }, { name: "cv_bl2", fx: "wipe" }, { name: "cv_br1", fx: "wipe" }, { name: "cv_br2", fx: "wipe" }]);
  step(page, [{ name: "cv_title", fx: "fade" }]);
  step(page, [{ name: "cv_sub", fx: "fade" }]);
  step(page, [{ name: "cv_tag", fx: "fade" }]);
  step(page, [{ name: "cv_art", fx: "fade" }, { name: "cv_line", fx: "wipe" }, { name: "cv_strip", fx: "wipe" }, { name: "cv_nsr", fx: "fade" }]);
  s.addNotes("Briefing for the CEO: what the project is, where it is, what is in scope, how it is phased, how much cash is needed and when, and where we stand today.");
}

// ====================================================== 3. PROJECT BRIEF
{
  const s = content("Project brief", "Design and construction of the Zulfi Passenger Station");
  const rows = [
    ["Project", "Design and construction of Zulfi Train Station and its infrastructure"],
    ["Line", "North-South Railway (NSR), Zulfi City"],
    ["Delivery", "EPC (design and build) with Awj International Contracting Co."],
    ["Contract value", "SAR 99,999,000 excl. VAT"],
    ["Duration", "26 months from Notice to Proceed"],
    ["Station", "Single-storey building, approx. 1,100 m²; single-face platform, approx. 500 m"],
    ["Capacity", "400 passengers per day (100 per trip)"],
    ["Operations", "Bi-directional running, 50 km/h, ETCS Level 2"],
    ["Standards", "SAR, TGA and HCIS"],
  ];
  const hdr = ["Item", "Description"].map((t) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: "left" } }));
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white;
    const o = (e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 11, align: "left", valign: "middle" }, e);
    return [{ text: r[0], options: o({ bold: true, color: C.blue }) }, { text: r[1], options: o() }];
  });
  s.addTable([hdr, ...body], { x: 0.85, y: 1.9, w: 7.6, colW: [1.8, 5.8], rowH: 0.34, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step(page, [{ name: "tbl", fx: "wipe" }]);
  const chips = [["CAPEX", C.blue], ["Construction", C.slate], ["Complex", C.black], ["Mega", C.yellow], ["Group 4", C.midBlue]];
  s.addText("Project classification", TX({ x: 8.8, y: 1.9, w: 3.8, h: 0.3, fontSize: 14, bold: true, color: C.blue, objectName: "cl_h" }));
  step(page, [{ name: "cl_h", fx: "fade" }]);
  chips.forEach((c, i) => {
    const x = 8.8 + (i % 3) * 1.3, y = 2.35 + Math.floor(i / 3) * 0.55;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 1.2, h: 0.4, fill: { color: c[1] }, line: { color: c[1], width: 0 }, rectRadius: 0.2, objectName: `chip${i}` });
    s.addText(c[0], TX({ x, y, w: 1.2, h: 0.4, align: "center", valign: "middle", fontSize: 11, bold: true, color: c[1] === C.yellow ? C.black : C.white, objectName: `chip${i}_t` }));
    step(page, [{ name: `chip${i}`, fx: "wipe" }, { name: `chip${i}_t`, fx: "fade" }]);
  });
  sq(s, 8.8, 3.65, 3.8, 1.7, C.tint05, "scope_bg", C.coolGray);
  sq(s, 8.8, 3.65, 0.07, 1.7, C.blue, "scope_bar");
  s.addText("In short", TX({ x: 9.05, y: 3.75, w: 3.4, h: 0.28, fontSize: 13, bold: true, color: C.blue, objectName: "sh_h" }));
  s.addText("End-to-end design, construction and commissioning of the Zulfi Passenger Station and its infrastructure: station building, ancillary buildings, external and road works, signalling and the loop line.", TX({ x: 9.05, y: 4.08, w: 3.4, h: 1.2, fontSize: 11.5, valign: "top", objectName: "sh_t" }));
  step(page, [{ name: "scope_bg", fx: "wipe" }, { name: "scope_bar", fx: "wipe" }, { name: "sh_h", fx: "fade" }, { name: "sh_t", fx: "fade" }]);
  const kp = [["SAR 99.999 M", "EPC contract value, excl. VAT"], ["26 months", "Duration from Notice to Proceed"], ["16 BOQ items", "Delivered in two phases"], ["SAR 14.7 M", "Cash needed in the first 6 months"]];
  const tw = 2.8, gx = 0.183;
  kp.forEach((k, i) => {
    const x = 0.85 + i * (tw + gx), y = 5.6;
    sq(s, x, y, tw, 1.1, C.tint05, `k${i}_bg`, C.coolGray); sq(s, x, y, tw, 0.07, i === 3 ? C.yellow : C.blue, `k${i}_bar`);
    s.addText(k[0], TX({ x: x + 0.15, y: y + 0.13, w: tw - 0.3, h: 0.55, fontSize: 22, bold: true, color: C.blue, valign: "middle", objectName: `k${i}_v` }));
    s.addText(k[1], TX({ x: x + 0.15, y: y + 0.72, w: tw - 0.3, h: 0.35, fontSize: 12, objectName: `k${i}_l` }));
    step(page, [{ name: `k${i}_bg`, fx: "wipe" }, { name: `k${i}_bar`, fx: "wipe" }, { name: `k${i}_v`, fx: "fade" }, { name: `k${i}_l`, fx: "fade" }]);
  });
  s.addNotes("Project brief: EPC design and build on the North-South Railway at Zulfi, SAR 99.999 M, 26 months from Notice to Proceed.");
}

// ====================================================== 4. LOCATION
{
  const s = content("Project location", "Zulfi City, on the North-South Railway");
  const mw = 7.4, mh = mw * 1287 / 2080;
  s.addImage({ data: mapImg, x: 0.85, y: 1.9, w: mw, h: mh, objectName: "map" });
  s.addShape(pres.ShapeType.rect, { x: 0.85, y: 1.9, w: mw, h: mh, fill: { type: "none" }, line: { color: C.coolGray, width: 1 }, objectName: "map_fr" });
  step(page, [{ name: "map", fx: "wipe" }, { name: "map_fr", fx: "fade" }]);
  const pts = [
    ["Site", "SAR land plot beside the North-South Railway, at chainage TK 254."],
    ["Access", "New access road of about 1,700 m (dual carriageway) from the Zulfi / Majmaah road to the station."],
    ["Station", "Station building, platform, loop line with turnouts, ancillary buildings and car park on the plot."],
  ];
  pts.forEach((p, i) => {
    const y = 1.9 + i * 1.5, x = 8.85;
    sq(s, x, y, 3.75, 1.35, C.tint05, `lp${i}_bg`, C.coolGray); sq(s, x, y, 0.07, 1.35, C.blue, `lp${i}_bar`);
    s.addText(p[0], TX({ x: x + 0.22, y: y + 0.1, w: 3.4, h: 0.3, fontSize: 14, bold: true, color: C.blue, objectName: `lp${i}_h` }));
    s.addText(p[1], TX({ x: x + 0.22, y: y + 0.45, w: 3.4, h: 0.85, fontSize: 12, valign: "top", objectName: `lp${i}_t` }));
    step(page, [{ name: `lp${i}_bg`, fx: "wipe" }, { name: `lp${i}_bar`, fx: "wipe" }, { name: `lp${i}_h`, fx: "fade" }, { name: `lp${i}_t`, fx: "fade" }]);
  });
  s.addText("Schematic, not to scale. Points 1 to 5 mark the corners of the SAR land plot.", TX({ x: 0.85, y: 1.9 + mh + 0.1, w: 7.7, h: 0.25, fontSize: 10, color: C.slate, objectName: "map_note" }));
  step(page, [{ name: "map_note", fx: "fade" }]);
  s.addNotes("The station sits on the SAR land plot next to the main line. A new access road connects it to the Zulfi / Majmaah road. The map is schematic; dimensions are confirmed by SAR in writing.");
}

// ====================================================== 4b. STATION LAYOUT BY PHASE
{
  const s = content("Station layout by phase", "What is built in Phase 1 and what is built in Phase 2");
  const P1 = C.blue, P2 = C.black, EX = C.coolGray;
  const px = 0.85, py = 1.85, pw = 8.3, ph = 4.75;
  sq(s, px, py, pw, ph, C.tint05, "ly_bg", C.coolGray);
  step(page, [{ name: "ly_bg", fx: "wipe" }]);
  const box = (id, x, y, w, h, fill, title, sub, tcol) => {
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.06, objectName: id });
    const arr = [{ text: title, options: { bold: true, fontSize: 12, color: tcol, breakLine: !!sub } }];
    if (sub) arr.push({ text: sub, options: { fontSize: 10, color: tcol } });
    s.addText(arr, TX({ x: x + 0.05, y, w: w - 0.1, h, align: "center", valign: "middle", objectName: id + "_t" }));
    step(page, [{ name: id, fx: "wipe" }, { name: id + "_t", fx: "fade" }], 260);
  };
  // main line (existing) with ties
  sq(s, px + 0.2, 2.15, pw - 0.4, 0.2, C.black, "ml");
  for (let i = 0; i < 28; i++) s.addShape(pres.ShapeType.rect, { x: px + 0.3 + i * 0.28, y: 2.08, w: 0.07, h: 0.34, fill: { color: C.slate }, line: { color: C.slate, width: 0 }, objectName: "tie" + i });
  s.addText("NSR main line (existing)", TX({ x: px + 0.2, y: 2.45, w: 3, h: 0.25, fontSize: 10, color: C.slate, objectName: "ml_t" }));
  step(page, [{ name: "ml", fx: "wipe" }, { name: "ml_t", fx: "fade" }, ...Array.from({ length: 28 }, (_, i) => ({ name: "tie" + i, fx: "fade" }))]);
  box("sig", px + pw - 3.2, 2.48, 3.0, 0.3, P1, "Signalling and telecommunication", null, C.white);
  // turnouts (Phase 1) and loop line (Phase 2)
  s.addShape(pres.ShapeType.parallelogram, { x: px + 0.7, y: 2.85, w: 0.8, h: 0.5, fill: { color: P1 }, line: { color: P1, width: 0 }, objectName: "to1" });
  s.addShape(pres.ShapeType.parallelogram, { x: px + pw - 1.5, y: 2.85, w: 0.8, h: 0.5, fill: { color: P1 }, line: { color: P1, width: 0 }, flipH: true, objectName: "to2" });
  step(page, [{ name: "to1", fx: "wipe" }, { name: "to2", fx: "wipe" }]);
  box("loop", px + 1.2, 3.3, pw - 2.4, 0.3, P2, "Loop line track, 2,500 m", null, C.white);
  s.addText("Turnouts", TX({ x: px + 1.55, y: 2.95, w: 1.2, h: 0.28, fontSize: 10, bold: true, color: P1, objectName: "to_t" }));
  step(page, [{ name: "to_t", fx: "fade" }]);
  box("plat", px + 1.2, 3.72, pw - 2.4, 0.38, P1, "Platform, approx. 500 m (single face)", null, C.white);
  // buildings row
  const rowY = 4.25, rh = 0.8; let bx = px + 0.2;
  const items = [
    ["sec", 1.4, P1, "Substation and SEC", null, C.white], ["stn", 2.2, P1, "Station building", "1,100 m². FF&E: Phase 2", C.white], ["fire", 1.4, P1, "Firefighting building", null, C.white],
    ["gen", 1.2, P2, "Generator room", null, C.white], ["wt", 1.2, P1, "Water tank", null, C.white],
  ];
  items.forEach((it) => { box(it[0], bx, rowY, it[1], rh, it[2], it[3], it[4], it[5]); bx += it[1] + 0.1; });
  // parking row
  box("park", px + 0.2, 5.15, 5.0, 0.6, P1, "Car park and parking sheds", "Site works, fence and automatic gates also Phase 1", C.white);
  box("bus", px + 5.3, 5.15, pw - 5.5, 0.6, P1, "Bus and taxi bays", null, C.white);
  // access road arrow
  s.addShape(pres.ShapeType.rightArrow, { x: px + 0.2, y: 5.88, w: pw - 0.4, h: 0.55, fill: { color: P2 }, line: { color: P2, width: 0 }, objectName: "road" });
  s.addText("New access road, about 1,700 m dual carriageway", TX({ x: px + 0.3, y: 5.88, w: pw - 1.0, h: 0.55, align: "center", valign: "middle", fontSize: 12, bold: true, color: C.white, objectName: "road_t" }));
  step(page, [{ name: "road", fx: "wipe" }, { name: "road_t", fx: "fade" }]);
  // legend
  const lx = 9.4, lw = 3.2;
  const leg = [
    [P1, "Phase 1", "12 items", "Station building, IT equipment, substation and SEC, firefighting building, water tank, site works and utilities, parking sheds, fence, gates, signalling and telecom, external works, turnouts", C.white],
    [P2, "Phase 2", "4 items", "FF&E, generator room, access road, railway track (loop line)", C.white],
  ];
  let ly = 1.85;
  leg.forEach((l, i) => {
    const h = i === 0 ? 2.1 : 1.25;
    sq(s, lx, ly, lw, h, C.white, `lg${i}_bg`, C.coolGray); sq(s, lx, ly, lw, 0.45, l[0], `lg${i}_hd`);
    s.addText(l[1], TX({ x: lx + 0.15, y: ly, w: 1.6, h: 0.45, fontSize: 15, bold: true, color: C.white, valign: "middle", objectName: `lg${i}_n` }));
    s.addText(l[2], TX({ x: lx + 1.6, y: ly, w: lw - 1.75, h: 0.45, fontSize: 12, color: C.white, align: "right", valign: "middle", objectName: `lg${i}_c` }));
    s.addText(l[3], TX({ x: lx + 0.15, y: ly + 0.55, w: lw - 0.3, h: h - 0.62, fontSize: 11, valign: "top", objectName: `lg${i}_t` }));
    step(page, [{ name: `lg${i}_bg`, fx: "wipe" }, { name: `lg${i}_hd`, fx: "wipe" }, { name: `lg${i}_n`, fx: "fade" }, { name: `lg${i}_c`, fx: "fade" }, { name: `lg${i}_t`, fx: "fade" }]);
    ly += h + 0.15;
  });
  sq(s, lx, ly, lw, 0.3, EX, "lg2_bg");
  s.addText("Existing: NSR main line", TX({ x: lx + 0.15, y: ly, w: lw - 0.3, h: 0.3, fontSize: 10.5, bold: true, valign: "middle", objectName: "lg2_t" }));
  step(page, [{ name: "lg2_bg", fx: "wipe" }, { name: "lg2_t", fx: "fade" }]);
  s.addText("Schematic layout, not to scale. The platform is shown with the station building.", TX({ x: 0.85, y: 6.62, w: 11.75, h: 0.25, fontSize: 10, color: C.slate, objectName: "note" }));
  step(page, [{ name: "note", fx: "fade" }]);
  s.addNotes("Phase 1 delivers the station building, platform, substation, firefighting building, water tank, site works, parking, signalling and the turnouts. Phase 2 delivers the loop line track, the access road, the generator room and the FF&E.");
}

// ====================================================== 5. SCOPE OF WORK
{
  const s = content("Scope of work", "Sixteen BOQ items in six groups, SAR million excl. VAT");
  const groups = [
    ["Railway Systems", 45.799, "Signalling and telecommunication; 2,500 m loop line track; turnouts"],
    ["Road Works", 19.19, "1,700 m dual-carriageway access road; external works above ground"],
    ["External Works", 12.17, "Site works and underground utilities, car parking sheds, fence, automatic gates"],
    ["General", 9.789, "Preliminaries and general requirements; design works"],
    ["Ancillary Buildings", 8.501, "Substation and SEC works, firefighting building, generator room, water tank"],
    ["Main Building", 4.55, "1,100 m² station building, IT equipment, FF&E"],
  ];
  s.addChart(pres.charts.BAR, [{ name: "SAR M", labels: groups.map(g => g[0]), values: groups.map(g => g[1]) }], {
    x: 0.85, y: 1.8, w: 5.6, h: 4.8, barDir: "bar", chartColors: [C.blue], showLegend: false, showValue: true, dataLabelFormatCode: "0.0", dataLabelFontFace: F, dataLabelFontSize: 11, dataLabelColor: C.black,
    catAxisLabelFontFace: F, catAxisLabelFontSize: 11, valAxisLabelFontFace: F, valAxisLabelFontSize: 9, catAxisLabelColor: C.black, valAxisLabelColor: C.black, catAxisOrientation: "maxMin",
    valGridLine: { color: C.coolGray, size: 0.5 }, catGridLine: { style: "none" }, barGapWidthPct: 45, valAxisHidden: true, valAxisMaxVal: 54, showTitle: false, objectName: "ch1",
  });
  step(page, [{ name: "ch1", fx: "wipe" }]);
  groups.forEach((g, i) => {
    const y = 1.85 + i * 0.8, x = 6.75;
    sq(s, x, y, 5.85, 0.72, i % 2 ? C.white : C.tint05, `sg${i}_bg`, C.coolGray); sq(s, x, y, 0.07, 0.72, i === 0 ? C.red : C.blue, `sg${i}_bar`);
    s.addText(g[0], TX({ x: x + 0.2, y: y + 0.04, w: 2.2, h: 0.64, fontSize: 12, bold: true, color: C.blue, valign: "middle", objectName: `sg${i}_h` }));
    s.addText(g[2], TX({ x: x + 2.4, y: y + 0.04, w: 3.35, h: 0.64, fontSize: 11, valign: "middle", objectName: `sg${i}_t` }));
    step(page, [{ name: `sg${i}_bg`, fx: "wipe" }, { name: `sg${i}_bar`, fx: "wipe" }, { name: `sg${i}_h`, fx: "fade" }, { name: `sg${i}_t`, fx: "fade" }], 300);
  });
  s.addText("Total SAR 99.999 M. Railway Systems (red bar) carries the critical path.", TX({ x: 6.75, y: 6.62, w: 5.85, h: 0.28, fontSize: 10, color: C.slate, objectName: "note" }));
  step(page, [{ name: "note", fx: "fade" }]);
  s.addNotes("Scope grouped from the 16 BOQ items plus preliminaries and design. Railway Systems is almost half of the contract value and holds the critical path.");
}

// ====================================================== 6. PHASES
{
  const s = content("Project phases", "Two phases share one design stage and one completion date");
  const P = D.phases, p1 = P["Phase 1"], p2 = P["Phase 2"];
  const lx = 0.85, lw = 2.9, x0 = lx + lw + 0.1, x1 = 12.55, W = (x1 - x0) / 26, ry0 = 2.75, rh = 0.3;
  sq(s, x0, 2.38, x1 - x0, 0.28, C.tint10, "ruler");
  for (let m = 1; m <= 26; m++) s.addText(String(m), TX({ x: x0 + (m - 1) * W, y: 2.38, w: W, h: 0.28, fontSize: 9, align: "center", valign: "middle" }));
  s.addText("Month from NTP", TX({ x: lx, y: 2.38, w: lw, h: 0.28, fontSize: 10, bold: true, color: C.blue, valign: "middle" }));
  step(page, [{ name: "ruler", fx: "wipe" }]);
  const rows = [
    ["Design (both phases)", p1.design_s_m, p1.design_f_m, C.sky, null],
    ["Procurement", p1.pc_s_m, p1.pc_f_m, C.midBlue, 1], ["Construction", p1.cn_s_m, p1.cn_f_m, C.blue, 1], ["Testing and commissioning", p1.tc_s_m, p1.tc_f_m, C.yellow, 1],
    ["Procurement", p2.pc_s_m, p2.pc_f_m, C.midBlue, 2], ["Construction", p2.cn_s_m, p2.cn_f_m, C.blue, 2], ["Testing and commissioning", p2.tc_s_m, p2.tc_f_m, C.yellow, 2],
  ];
  let y = ry0, ri = 0;
  const band = (label, sub, color, id) => {
    sq(s, lx, y, x1 - lx, 0.32, color, `${id}_bd`);
    s.addText(label, TX({ x: lx + 0.12, y, w: 4, h: 0.32, fontSize: 12, bold: true, color: C.white, valign: "middle", objectName: `${id}_bt` }));
    s.addText(sub, TX({ x: x0, y, w: x1 - x0 - 0.1, h: 0.32, fontSize: 10.5, color: C.white, align: "right", valign: "middle", objectName: `${id}_bs` }));
    step(page, [{ name: `${id}_bd`, fx: "wipe" }, { name: `${id}_bt`, fx: "fade" }, { name: `${id}_bs`, fx: "fade" }]);
    y += 0.35;
  };
  const bar = (r, i) => {
    sq(s, lx, y, x1 - lx, rh, i % 2 ? C.white : C.tint05, `r${i}_bg`);
    s.addText(r[0], TX({ x: lx + 0.25, y, w: lw - 0.3, h: rh, fontSize: 11, valign: "middle", objectName: `r${i}_l` }));
    const bx = x0 + (r[1] - 1) * W, bw = (r[2] - r[1] + 1) * W;
    sq(s, bx, y + 0.07, bw, rh - 0.14, r[3], `r${i}_b`);
    s.addText(`M${r[1]}-${r[2]}`, TX({ x: bx, y: y + 0.07, w: bw, h: rh - 0.14, fontSize: 9, bold: true, align: "center", valign: "middle", color: r[3] === C.yellow || r[3] === C.sky ? C.black : C.white, objectName: `r${i}_m` }));
    step(page, [{ name: `r${i}_l`, fx: "fade" }, { name: `r${i}_b`, fx: "wipe" }, { name: `r${i}_m`, fx: "fade" }], 300);
    y += rh;
  };
  band("Design stage", "Gate 1 Concept (Month 3), Gate 2 Preliminary (Month 6), Gate 3 Detailed / IFC (Month 11)", C.slate, "b0"); bar(rows[0], 0);
  y += 0.04; band("Phase 1", `${p1.items.length} items, including the station building, substation, signalling and turnouts`, C.blue, "b1");
  [1, 2, 3].forEach(k => bar(rows[k], k));
  y += 0.04; band("Phase 2", `${p2.items.length} items: FF&E, generator room, access road, railway track`, C.black, "b2");
  [4, 5, 6].forEach(k => bar(rows[k], k));
  s.addText("Phase 1 procurement starts earlier because its long-lead packages (substation, signalling, turnouts) set the pace. Phase 2 is led by railway track, the critical path.", TX({ x: 0.85, y: 6.12, w: 11.75, h: 0.4, fontSize: 11, color: C.black, valign: "top", objectName: "ph_note" }));
  s.addText(NTP_NOTE, TX({ x: 0.85, y: 6.6, w: 11.75, h: 0.28, fontSize: 10, color: C.slate, objectName: "note" }));
  step(page, [{ name: "ph_note", fx: "fade" }, { name: "note", fx: "fade" }]);
  s.addNotes("Both phases run one design stage through three gates. Phase 1 has twelve items and Phase 2 has four. Construction starts in Month 12 for both; Taking-Over of all works is in Month 26.");
}

// ====================================================== 7. KEY MILESTONES
{
  const s = content("Key milestones", "The dates that matter, in months from Notice to Proceed");
  const ms = D.ms;
  const list = [
    ["Notice to Proceed", 1, C.black], ["Gate 1: Concept design approved", 3, C.blue], ["Gate 2: Preliminary design approved", 6, C.blue], ["Phase 1 procurement starts", ms["MS-0050"].m, C.midBlue],
    ["Gate 3: Detailed design (IFC) approved", 11, C.blue], ["Work permit and construction start", ms["MS-0090"].m, C.yellow], ["All construction works complete", ms["MS-0120"].m, C.slate], ["Taking-Over of all works", 26, C.red],
  ];
  const x0 = 1.0, x1 = 12.35, y0 = 2.55, W = (x1 - x0) / 25;
  sq(s, x0, y0 - 0.04, x1 - x0, 0.08, C.coolGray, "tl_line");
  step(page, [{ name: "tl_line", fx: "wipe" }]);
  [1, 6, 11, 16, 21, 26].forEach((m) => s.addText("M" + m, TX({ x: x0 + (m - 1) * W - 0.3, y: y0 + 0.42, w: 0.6, h: 0.2, fontSize: 9, color: C.slate, align: "center" })));
  list.forEach((l, i) => {
    const x = x0 + (l[1] - 1) * W;
    s.addShape(pres.ShapeType.ellipse, { x: x - 0.2, y: y0 - 0.2, w: 0.4, h: 0.4, fill: { color: l[2] }, line: { color: C.white, width: 1.5 }, objectName: `ms${i}_dot` });
    s.addText(String(i + 1), TX({ x: x - 0.2, y: y0 - 0.2, w: 0.4, h: 0.4, align: "center", valign: "middle", fontSize: 12, bold: true, color: l[2] === C.yellow ? C.black : C.white, objectName: `ms${i}_n` }));
    step(page, [{ name: `ms${i}_dot`, fx: "fade" }, { name: `ms${i}_n`, fx: "fade" }], 250);
  });
  const cw = 2.78, gap = 0.21;
  list.forEach((l, i) => {
    const x = 0.85 + (i % 4) * (cw + gap), y = 3.45 + Math.floor(i / 4) * 1.5;
    sq(s, x, y, cw, 1.32, C.tint05, `mc${i}_bg`, C.coolGray); sq(s, x, y, cw, 0.07, l[2], `mc${i}_bar`);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.15, y: y + 0.22, w: 0.4, h: 0.4, fill: { color: l[2] }, line: { color: l[2], width: 0 }, objectName: `mc${i}_c` });
    s.addText(String(i + 1), TX({ x: x + 0.15, y: y + 0.22, w: 0.4, h: 0.4, align: "center", valign: "middle", fontSize: 12, bold: true, color: l[2] === C.yellow ? C.black : C.white, objectName: `mc${i}_n` }));
    s.addText("Month " + l[1], TX({ x: x + 0.68, y: y + 0.2, w: cw - 0.8, h: 0.44, fontSize: 18, bold: true, color: C.blue, valign: "middle", objectName: `mc${i}_m` }));
    s.addText(l[0], TX({ x: x + 0.15, y: y + 0.72, w: cw - 0.3, h: 0.52, fontSize: 12, valign: "top", objectName: `mc${i}_t` }));
    step(page, [{ name: `mc${i}_bg`, fx: "wipe" }, { name: `mc${i}_bar`, fx: "wipe" }, { name: `mc${i}_c`, fx: "fade" }, { name: `mc${i}_n`, fx: "fade" }, { name: `mc${i}_m`, fx: "fade" }, { name: `mc${i}_t`, fx: "fade" }], 300);
  });
  s.addText("Zero float: the programme finishes exactly on the contract completion date. " + NTP_NOTE, TX({ x: 0.85, y: 6.5, w: 11.75, h: 0.4, fontSize: 10, color: C.slate, objectName: "note" }));
  step(page, [{ name: "note", fx: "fade" }]);
  s.addNotes("The three design gates, the work permit in Month 12 and Taking-Over in Month 26. There is no float to the contract completion date, so any delay to the Notice to Proceed moves completion one for one.");
}

// ====================================================== 8. CASH FLOW (semi-annual + quarterly)
{
  const s = content("Cash flow", "Expected transfers by half-year and by quarter, SAR million");
  const cc = { catAxisLabelFontFace: F, valAxisLabelFontFace: F, valAxisLabelFontSize: 9, catAxisLabelColor: C.black, valAxisLabelColor: C.black, valGridLine: { color: C.coolGray, size: 0.5 }, catGridLine: { style: "none" },
    showValue: true, dataLabelFormatCode: "0.0", dataLabelFontFace: F, dataLabelColor: C.black, dataLabelPosition: "outEnd", showTitle: true, titleFontFace: F, titleFontSize: 12, titleColor: C.blue };
  const hl = D.s.map((b, i) => `H${i + 1}`);
  s.addChart(pres.charts.BAR, [{ name: "Net cash, SAR M", labels: hl, values: D.s.map(b => +b.net.toFixed(1)) }], Object.assign({}, cc, {
    x: 0.85, y: 1.8, w: 5.1, h: 2.45, barDir: "col", chartColors: [C.blue], showLegend: false, dataLabelFontSize: 11, catAxisLabelFontSize: 11, barGapWidthPct: 55, title: "Semi-annual net cash", objectName: "ch1" }));
  const qs = D.q.map((b, i) => "Q" + (i + 1));
  s.addChart(pres.charts.BAR, [
    { name: "Progress value", labels: qs, values: D.q.map(b => +b.perf.toFixed(1)) },
    { name: "Net cash", labels: qs, values: D.q.map(b => +b.net.toFixed(1)) },
  ], Object.assign({}, cc, {
    x: 6.1, y: 1.8, w: 6.5, h: 2.45, barDir: "col", barGrouping: "clustered", chartColors: [C.midBlue, C.blue], showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 10, legendColor: C.black,
    dataLabelFontSize: 8, catAxisLabelFontSize: 10, barGapWidthPct: 40, title: "Quarterly progress value and net cash", objectName: "ch2" }));
  step(page, [{ name: "ch1", fx: "wipe" }]);
  step(page, [{ name: "ch2", fx: "wipe" }]);
  sq(s, 0.85, 4.35, 11.75, 0.5, C.blue, "cb_bg");
  s.addText([{ text: "First 6 months: SAR 15 M ", options: { bold: true, fontSize: 15 } }, { text: `requested from the Zulfi Cooperative Society. The baseline need is SAR ${D.s[0].net.toFixed(1)} M.`, options: { fontSize: 12 } }],
    TX({ x: 1.05, y: 4.35, w: 11.4, h: 0.5, color: C.white, valign: "middle", objectName: "cb_t" }));
  step(page, [{ name: "cb_bg", fx: "wipe" }, { name: "cb_t", fx: "fade" }]);
  const H = (t, fs, al = "center") => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: fs, align: al, valign: "middle" } });
  const cell = (t, i, fs, o = {}) => ({ text: t, options: Object.assign({ fontFace: F, fontSize: fs, align: "center", valign: "middle", color: C.black, fill: { color: i % 2 ? C.tint05 : C.white } }, o) });
  const lab = (t, i, fs) => cell(t, i, fs, { align: "left", bold: true });
  const totS = D.s.reduce((a, b) => a + b.net, 0), totQ = D.q.reduce((a, b) => a + b.net, 0);
  let cs = 0, cq = 0;
  const cumS = D.s.map(b => (cs += b.net, cs / totS * 100)), cumQ = D.q.map(b => (cq += b.net, cq / totQ * 100));
  const t1 = [
    [H("Half-year", 10, "left"), ...D.s.map((b, i) => H(`H${i + 1}`, 10))],
    [lab("Months", 0, 10), ...D.s.map(b => cell(`${b.m0}-${b.m1}`, 0, 10))],
    [lab("Net cash", 1, 10), ...D.s.map(b => cell(b.net.toFixed(1), 1, 10))],
    [lab("Cumulative", 0, 10), ...cumS.map(c => cell(Math.round(c) + "%", 0, 10))],
  ];
  s.addTable(t1, { x: 0.85, y: 5.0, w: 5.1, colW: [1.1, ...Array(5).fill(0.8)], rowH: 0.3, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl1" });
  const t2 = [
    [H("Quarter", 9, "left"), ...qs.map(q => H(q, 9))],
    [lab("Months", 0, 9), ...D.q.map(b => cell(b.m1 > b.m0 ? `${b.m0}-${b.m1}` : String(b.m0), 0, 9))],
    [lab("Net cash", 1, 9), ...D.q.map(b => cell(b.net.toFixed(1), 1, 9))],
    [lab("Cumulative", 0, 9), ...cumQ.map(c => cell(Math.round(c) + "%", 0, 9))],
  ];
  s.addTable(t2, { x: 6.1, y: 5.0, w: 6.5, colW: [1.0, ...Array(9).fill((6.5 - 1.0) / 9)], rowH: 0.3, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl2" });
  step(page, [{ name: "tbl1", fx: "wipe" }, { name: "tbl2", fx: "wipe" }]);
  s.addText("Planning estimates, excl. VAT; include a 10% advance payment (assumption) recovered proportionally. Progress value is work done; net cash is what is invoiced after the advance. Updated every quarter.", TX({ x: 0.85, y: 6.35, w: 11.75, h: 0.45, fontSize: 10, color: C.slate, valign: "top", objectName: "note" }));
  step(page, [{ name: "note", fx: "fade" }]);
  s.addNotes("Peak funding is in the third half-year (Months 13-18), when construction is at full rate. The first six months need about SAR 14.7 M against the SAR 15 M requested from the Cooperative Society. The quarterly view shows the same plan in more detail; cash is ahead of progress early because of the advance payment, and behind it later as the advance is recovered.");
}

// ====================================================== 10. PROJECT STATUS
{
  const s = content("Project status", "Where we stand before the Notice to Proceed");
  const cols = [
    ["Done", C.slate, [["Contractor Project Manager", "Appointed; contract signed."]]],
    ["In progress", C.yellow, [["Key personnel", "Interviews under way for the Construction Manager and the Planning Engineer."], ["Design firm", "Contractor has started appointing the project design firm."], ["Funding for 6 months", "Zulfi Cooperative Society asked to provide SAR 15 M."]]],
    ["Waiting", C.red, [["Purchase Order", "Still with Finance. The Notice to Proceed starts once it is issued."]]],
  ];
  const cw = 3.78, gap = 0.205;
  cols.forEach((c, i) => {
    const x = 0.85 + i * (cw + gap), id = `st${i}`;
    sq(s, x, 1.9, cw, 0.5, c[1], `${id}_hd`);
    s.addText(c[0], TX({ x: x + 0.2, y: 1.9, w: cw - 0.4, h: 0.5, fontSize: 16, bold: true, color: c[1] === C.yellow ? C.black : C.white, valign: "middle", objectName: `${id}_ht` }));
    step(page, [{ name: `${id}_hd`, fx: "wipe" }, { name: `${id}_ht`, fx: "fade" }]);
    c[2].forEach((it, k) => {
      const y = 2.55 + k * 1.2;
      sq(s, x, y, cw, 1.08, C.tint05, `${id}_c${k}`, C.coolGray); sq(s, x, y, 0.07, 1.08, c[1], `${id}_cb${k}`);
      s.addText(it[0], TX({ x: x + 0.22, y: y + 0.08, w: cw - 0.35, h: 0.32, fontSize: 13, bold: true, color: C.blue, objectName: `${id}_ch${k}` }));
      s.addText(it[1], TX({ x: x + 0.22, y: y + 0.42, w: cw - 0.35, h: 0.6, fontSize: 11.5, valign: "top", objectName: `${id}_ct${k}` }));
      step(page, [{ name: `${id}_c${k}`, fx: "wipe" }, { name: `${id}_cb${k}`, fx: "wipe" }, { name: `${id}_ch${k}`, fx: "fade" }, { name: `${id}_ct${k}`, fx: "fade" }]);
    });
  });
  sq(s, 0.85, 6.0, 11.75, 0.7, C.black, "ban_bg");
  s.addText("Critical dependency: Purchase Order, then Notice to Proceed. Every month of delay moves Taking-Over by a month.", TX({ x: 1.1, y: 6.0, w: 11.3, h: 0.7, fontSize: 14, bold: true, color: C.white, valign: "middle", objectName: "ban_t" }));
  step(page, [{ name: "ban_bg", fx: "wipe" }, { name: "ban_t", fx: "fade" }]);
  s.addNotes("Contractor mobilisation is progressing: the Project Manager is contracted, the Construction Manager and Planning Engineer are in interview, and the design firm appointment has started. The gating item is the Purchase Order with Finance.");
}

// ====================================================== 11. NEXT STEPS AND SUPPORT
{
  const s = content("Next steps and support needed", "What happens next, and where your help moves the date");
  s.addText("Next steps", TX({ x: 0.85, y: 1.9, w: 5.8, h: 0.35, fontSize: 16, bold: true, color: C.blue, objectName: "ns_h" }));
  step(page, [{ name: "ns_h", fx: "fade" }]);
  const ns = [
    ["1", "Finance releases the Purchase Order", "Unlocks the Notice to Proceed."],
    ["2", "Cooperative Society confirms the SAR 15 M", "Covers the first six months."],
    ["3", "Contractor completes its key team", "Construction Manager, Planning Engineer and the design firm."],
    ["4", "Design starts toward Gate 1", "Concept design approval in Month 3."],
  ];
  ns.forEach((n, i) => {
    const y = 2.4 + i * 0.95;
    s.addShape(pres.ShapeType.ellipse, { x: 0.85, y: y + 0.1, w: 0.5, h: 0.5, fill: { color: C.blue }, line: { color: C.blue, width: 0 }, objectName: `ns${i}_c` });
    s.addText(n[0], TX({ x: 0.85, y: y + 0.1, w: 0.5, h: 0.5, align: "center", valign: "middle", fontSize: 16, bold: true, color: C.white, objectName: `ns${i}_n` }));
    s.addText(n[1], TX({ x: 1.55, y, w: 5.1, h: 0.36, fontSize: 14, bold: true, valign: "middle", objectName: `ns${i}_t` }));
    s.addText(n[2], TX({ x: 1.55, y: y + 0.36, w: 5.1, h: 0.4, fontSize: 11.5, color: C.slate, valign: "top", objectName: `ns${i}_s` }));
    step(page, [{ name: `ns${i}_c`, fx: "fade" }, { name: `ns${i}_n`, fx: "fade" }, { name: `ns${i}_t`, fx: "fade" }, { name: `ns${i}_s`, fx: "fade" }], 300);
  });
  sq(s, 7.0, 1.9, 5.6, 2.35, C.blue, "ask_bg");
  s.addText("Support requested", TX({ x: 7.25, y: 2.0, w: 5.1, h: 0.35, fontSize: 16, bold: true, color: C.white, objectName: "ask_h" }));
  s.addText([
    { text: "Help Finance release the Purchase Order.", options: { bullet: { code: "25A0", indent: 18 }, breakLine: true, paraSpaceAfter: 8 } },
    { text: "Confirm the date of the SAR 15 M transfer.", options: { bullet: { code: "25A0", indent: 18 }, breakLine: true, paraSpaceAfter: 8 } },
    { text: "Confirm the Notice to Proceed date.", options: { bullet: { code: "25A0", indent: 18 } } },
  ], TX({ x: 7.25, y: 2.45, w: 5.1, h: 1.7, fontSize: 14, color: C.white, valign: "top", objectName: "ask_t" }));
  step(page, [{ name: "ask_bg", fx: "wipe" }, { name: "ask_h", fx: "fade" }, { name: "ask_t", fx: "fade" }]);
  s.addText("Risks we are watching", TX({ x: 7.0, y: 4.45, w: 5.6, h: 0.3, fontSize: 14, bold: true, color: C.blue, objectName: "rk_h" }));
  step(page, [{ name: "rk_h", fx: "fade" }]);
  const rk = [["Notice to Proceed delay", "Moves completion month for month; no float."], ["Long-lead packages", "Five packages need 150 to 245 days of manufacture."], ["SAR review capacity", "28-day review of 16 design packages at Gate 3."]];
  rk.forEach((r, i) => {
    const y = 4.82 + i * 0.62;
    sq(s, 7.0, y, 5.6, 0.55, i % 2 ? C.white : C.tint05, `rk${i}_bg`, C.coolGray); sq(s, 7.0, y, 0.07, 0.55, C.yellow, `rk${i}_bar`);
    s.addText(r[0], TX({ x: 7.2, y, w: 2.1, h: 0.55, fontSize: 11.5, bold: true, valign: "middle", objectName: `rk${i}_h` }));
    s.addText(r[1], TX({ x: 9.3, y, w: 3.25, h: 0.55, fontSize: 11, valign: "middle", objectName: `rk${i}_t` }));
    step(page, [{ name: `rk${i}_bg`, fx: "wipe" }, { name: `rk${i}_bar`, fx: "wipe" }, { name: `rk${i}_h`, fx: "fade" }, { name: `rk${i}_t`, fx: "fade" }], 300);
  });
  s.addNotes("Three requests: Purchase Order release, the date of the SAR 15 M transfer, and the Notice to Proceed date. The main risks are the NTP delay, the long-lead packages and SAR review capacity at the design gates.");
}

// ====================================================== 12. END
{
  const s = pres.addSlide(); page += 1;
  S.endSlide(s, { text: "Thank You" });
  step(page, [{ name: "t:Thank You", fx: "fade" }]);
}

fs.writeFileSync("anim.json", JSON.stringify(ANIM));
pres.writeFile({ fileName: "stage.pptx" }).then(() => console.log("built " + page));
