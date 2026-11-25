const pptxgen = require("pptxgenjs");
const fs = require("fs");
const M = JSON.parse(fs.readFileSync("./bl02_model.json", "utf8"));
const K = {}; M.tasks.forEach(t => K[t.code] = t);
const DARK = "2B2D31", AMBER = "F5A623", CARD = "F3F4F6", GREY = "6B7280", MID = "D1D5DB", WHITE = "FFFFFF", LAMB = "FDE9C4";
const F = "Calibri";
const b64 = (p, mime) => `${mime};base64,` + fs.readFileSync(p).toString("base64");
const logo = b64("awj-logo.png", "image/png");
const pres = new pptxgen(); pres.layout = "LAYOUT_WIDE"; pres.title = "Zulfi Station Kick-Off Meeting - Baseline Schedule Overview"; pres.author = "Awj International Contracting Co.";
const TX = (o = {}) => Object.assign({ fontFace: F, margin: 0, isTextBox: true, color: DARK }, o);
const ANIM = {}; let page = 7;                       // slides are inserted after the Contract slide (slide 7)
const step = (list, gap) => { if (gap) list[0].gap = gap; (ANIM[page - 7] = ANIM[page - 7] || []).push(list); };
const SHADOW = { type: "outer", color: "000000", opacity: 0.14, blur: 5, offset: 1.5, angle: 90 };
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MN[m - 1]} ${String(y).slice(2)}`; };
const E = (c) => fd(K[c].ef);
const NTP = Date.parse("2026-11-01");
const mo = (iso) => (Date.parse(iso) - NTP) / 864e5 / 30.4375;
const mon = (iso) => Math.floor(mo(iso)) + 1;
const SEC = "BASELINE SCHEDULE OVERVIEW";
const NOTE = "Months count from the Notice to Proceed, assumed 1 Nov 2026 and not yet confirmed; all dates move with it. Source: baseline programme ZULFI-BL02 (Primavera P6).";

function slide(title) {
  const s = pres.addSlide(); page += 1; s.background = { color: WHITE };
  s.addText(SEC, TX({ x: 0.85, y: 0.32, w: 8, h: 0.28, fontSize: 12, bold: true, color: AMBER, charSpacing: 1, objectName: "sec" }));
  s.addText(title, TX({ x: 0.85, y: 0.62, w: 10.2, h: 0.75, fontSize: 32, bold: true, valign: "middle", objectName: "ttl" }));
  s.addImage({ data: logo, x: 11.95, y: 0.28, w: 0.98, h: 1.07, objectName: "logo" });
  s.addText("Zulfi Passenger Railway Station  |  Project Kick-Off Meeting  |  Awj International Contracting Co.", TX({ x: 0.85, y: 7.02, w: 9, h: 0.28, fontSize: 11, color: GREY, objectName: "foot" }));
  s.addText(String(page), TX({ x: 12.3, y: 7.02, w: 0.55, h: 0.28, fontSize: 11, color: GREY, align: "right", objectName: "pg" }));
  step([{ name: "sec", fx: "fade" }, { name: "ttl", fx: "fade" }]);
  return s;
}
const card = (s, id, x, y, w, h, fill = CARD) => { s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.08, shadow: Object.assign({}, SHADOW), objectName: id }); return { name: id, fx: "wipe" }; };
const rect = (s, id, x, y, w, h, fill) => { s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: id }); return { name: id, fx: "wipe" }; };
const text = (s, id, t, o) => { s.addText(t, TX(Object.assign({ objectName: id }, o))); return { name: id, fx: "fade" }; };
const note = (s, t) => { s.addText(t, TX({ x: 0.85, y: 6.68, w: 11.6, h: 0.3, fontSize: 10, color: GREY, valign: "top", objectName: "note" })); step([{ name: "note", fx: "fade" }]); };
const dot = (s, id, x, y, d, fill) => { s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: WHITE, width: 1.25 }, objectName: id }); return { name: id, fx: "fade" }; };

// ================================================= 1. OVERVIEW
{
  const s = slide("Baseline Schedule Overview");
  const kp = [["26 months", "Contract duration from the Notice to Proceed"], ["31 Dec 2028", "Contract completion, zero total float"], ["20 Dec 2028", "Taking-Over of all works"], ["597 activities", "1,086 logic links, Primavera P6"]];
  kp.forEach((k, i) => {
    const x = 0.85 + i * 3.0, id = `k${i}`;
    step([card(s, id + "c", x, 1.6, 2.85, 1.0), text(s, id + "v", k[0], { x: x + 0.18, y: 1.66, w: 2.5, h: 0.5, fontSize: 24, bold: true, color: i === 1 ? AMBER : DARK, valign: "middle" }), text(s, id + "l", k[1], { x: x + 0.18, y: 2.15, w: 2.55, h: 0.4, fontSize: 11, color: GREY, valign: "top" })]);
  });
  const lx = 0.85, lw = 2.75, x0 = lx + lw + 0.1, x1 = 12.55, W = (x1 - x0) / 26, y0 = 2.82, rh = 0.31;
  s.addShape(pres.ShapeType.rect, { x: x0, y: y0, w: x1 - x0, h: 0.28, fill: { color: MID }, line: { color: MID, width: 0 }, objectName: "ruler" });
  for (let m = 1; m <= 26; m++) s.addText(String(m), TX({ x: x0 + (m - 1) * W, y: y0, w: W, h: 0.28, fontSize: 9, align: "center", valign: "middle" }));
  s.addText("Month from NTP", TX({ x: lx, y: y0, w: lw, h: 0.28, fontSize: 11, bold: true, color: AMBER, valign: "middle", objectName: "mh" }));
  step([{ name: "ruler", fx: "wipe" }, { name: "mh", fx: "fade" }]);
  const rows = [
    ["Mobilisation and preliminaries", 1, 2, GREY, "h"], ["Design (3 SAR gates)", 2, 11, DARK, "h"], ["TGA, permits, approvals", 1, 12, AMBER, "h"],
    ["Phase 1 procurement (12 items)", 7, 18, GREY, "p"], ["Phase 2 procurement (4 items)", 11, 22, GREY, "p"],
    ["Phase 1 construction", 12, 20, AMBER, "p"], ["Phase 2 construction", 12, 24, AMBER, "p"],
    ["Phase 1 testing and commissioning", 14, 26, LAMB, "p"], ["Phase 2 testing and commissioning", 18, 25, LAMB, "p"], ["Taking-Over and close-out", 26, 26, DARK, "h"],
  ];
  rows.forEach((r, i) => {
    const y = y0 + 0.34 + i * rh, id = `g${i}`;
    if (i % 2 === 0) s.addShape(pres.ShapeType.rect, { x: lx, y, w: x1 - lx, h: rh, fill: { color: CARD }, line: { color: CARD, width: 0 }, objectName: id + "bg" });
    s.addText(r[0], TX({ x: lx + 0.1, y, w: lw, h: rh, fontSize: 11, valign: "middle", bold: r[4] === "h", objectName: id + "l" }));
    const bx = x0 + (r[1] - 1) * W, bw = (r[2] - r[1] + 1) * W;
    s.addShape(pres.ShapeType.rect, { x: bx, y: y + 0.06, w: bw, h: rh - 0.12, fill: { color: r[3] }, line: { color: r[3], width: 0 }, objectName: id + "b" });
    step([...(i % 2 === 0 ? [{ name: id + "bg", fx: "fade" }] : []), { name: id + "l", fx: "fade" }, { name: id + "b", fx: "wipe" }], 220);
  });
  const gy = y0 + 0.34, gh = rows.length * rh;
  [["Gate 1", 3], ["Gate 2", 6], ["Gate 3", 11]].forEach((g, i) => {
    s.addShape(pres.ShapeType.line, { x: x0 + g[1] * W, y: gy, w: 0, h: gh, line: { color: GREY, width: 1, dashType: "dash" }, objectName: `gl${i}` });
    s.addText(g[0], TX({ x: x0 + g[1] * W - 0.4, y: gy + gh + 0.03, w: 0.8, h: 0.24, fontSize: 9.5, bold: true, align: "center", objectName: `gt${i}` }));
    step([{ name: `gl${i}`, fx: "wipe" }, { name: `gt${i}`, fx: "fade" }], 200);
  });
  note(s, NOTE);
  s.addNotes("General overview of the baseline schedule: 26 months, two phases, one design stage with three SAR gates, procurement from Month 7 (Phase 1) and Month 11 (Phase 2), construction from Month 12, Taking-Over in Month 26. Insert after the Contract slide and add 'Baseline Schedule Overview' to the agenda.");
}

// ================================================= 2. KEY MILESTONES
{
  const s = slide("Baseline Milestones");
  const ms = [["MS-0010", "Notice to Proceed (assumed)", "1 Nov 26", 1], ["MS-0030", "Gate 1: Concept design approved", E("MS-0030"), null], ["MS-0040", "Gate 2: Preliminary design approved", E("MS-0040"), null], ["MS-0050", "Phase 1 procurement start", E("MS-0050"), null],
    ["MS-0075", "Environmental permit and authority approvals obtained", E("MS-0075"), null], ["MS-0060", "Gate 3: Detailed design (IFC) approved", E("MS-0060"), null], ["MS-0080", "Phase 2 procurement start", E("MS-0080"), null], ["MS-0070", "SAR work permit issued", E("MS-0070"), null],
    ["MS-0090", "Construction start", E("MS-0090"), null], ["MS-0100", "Signalling and turnout materials delivered", E("MS-0100"), null], ["MS-0110", "Track materials delivered", E("MS-0110"), null], ["MS-0120", "All construction works complete", E("MS-0120"), null],
    ["MS-0130", "Taking-Over of all works", E("MS-0130"), null], ["MS-0140", "Contract completion", E("MS-0140"), null]];
  const half = Math.ceil(ms.length / 2);
  [ms.slice(0, half), ms.slice(half)].forEach((col, ci) => {
    col.forEach((m, i) => {
      const x = 0.85 + ci * 6.0, y = 1.6 + i * 0.7, id = `m${ci}${i}`;
      const mm = m[3] || mon(K[m[0]].ef);
      const hot = m[0] === "MS-0140" || m[0] === "MS-0130";
      step([card(s, id + "c", x, y, 5.8, 0.6), dot(s, id + "d", x + 0.18, y + 0.19, 0.22, hot ? AMBER : DARK),
        text(s, id + "t", m[1], { x: x + 0.55, y, w: 3.35, h: 0.6, fontSize: 12.5, bold: true, valign: "middle" }),
        text(s, id + "m", "Month " + mm, { x: x + 3.9, y, w: 0.95, h: 0.6, fontSize: 11.5, color: GREY, valign: "middle" }),
        text(s, id + "dt", m[2], { x: x + 4.8, y, w: 0.9, h: 0.6, fontSize: 12.5, bold: true, color: hot ? "B9770E" : DARK, align: "right", valign: "middle" })], 260);
    });
  });
  note(s, NOTE);
  s.addNotes("Fourteen contract and programme milestones. Gate dates are the SAR approval dates in the design chain; the work permit is issued 14 days after Gate 3.");
}

// ================================================= 3. DESIGN, SUBMITTALS AND APPROVALS
{
  const s = slide("Design, Submittals and Approvals");
  const cols = [
    ["Design stages and gates", ["Concept: develop 24 to 40 d, submit 3 d, SAR review 14 d. Gate 1 " + E("DS-0020"), "Preliminary: develop 36 to 57 d, submit 3 d, SAR review 21 d. Gate 2 " + E("DS-0360"), "Detailed and IFC: develop up to 109 d, submit 3 d, SAR review 28 d. Gate 3 " + E("DS-0700"), "16 design packages run in parallel through the three gates"]],
    ["Submittals and reviews", ["Every submission is its own activity (Awj); every review or approval is its own activity (SAR or authority)", "Material submittal 3 d, SAR approval 28 d, then purchase order 10 d", "Inspection and possession requests are submitted before SAR or the authority reviews them"]],
    ["Permits and TGA", [`SAR work permit: package ${fd(K["TG-0610"].es)}, issued ${E("PR-0120")}`, `Environmental permit (GAMEP): approved ${E("PR-2270")}`, `HCIS and Civil Defense design approvals before Gate 3`, `Independent Competent Person appointed ${E("TG-2020")}; safety case ${E("TG-2220")}`, "TGA, ICP and HCIS review times to be confirmed"]],
  ];
  cols.forEach((c, i) => {
    const x = 0.85 + i * 3.95, id = `c${i}`;
    step([card(s, id + "c", x, 1.6, 3.8, 4.9), rect(s, id + "bar", x, 1.6, 3.8, 0.09, AMBER), text(s, id + "h", c[0], { x: x + 0.2, y: 1.8, w: 3.4, h: 0.4, fontSize: 16, bold: true, valign: "middle" })]);
    s.addText(c[1].map((t, k) => ({ text: t, options: { bullet: { code: "25CF", indent: 14 }, breakLine: k < c[1].length - 1, paraSpaceAfter: 9 } })), TX({ x: x + 0.2, y: 2.35, w: 3.4, h: 4.0, fontSize: 13, valign: "top", objectName: id + "l" }));
    step([{ name: id + "l", fx: "fade" }], 300);
  });
  note(s, NOTE);
  s.addNotes("Design review windows of 14, 21 and 28 days are baseline assumptions for SAR to confirm. The work permit chain follows the SAR Work Permit Handbook V2.");
}

// ================================================= 4. CRITICAL PATH, LONG-LEAD AND BASIS
{
  const s = slide("Critical Path, Long-Lead Items and Basis");
  const nodes = [["Gate 3", E("DS-0700")], ["Track material approved", E("PC-2310")], ["Track order placed", E("PC-0470")], ["Manufacture 245 d", E("PC-0660")], ["Delivered to site", E("PC-0670")], ["Track installed", E("CN-1660")], ["Trial running", E("TC-0460")], ["Safety assessment", E("TC-0380")], ["Taking-Over", E("CO-0015")]];
  s.addText("Critical path: 35 activities, zero float, ending at Taking-Over and completion", TX({ x: 0.85, y: 1.5, w: 11, h: 0.32, fontSize: 14, bold: true, objectName: "cph" })); step([{ name: "cph", fx: "fade" }]);
  const w = 1.27, g = 0.1;
  nodes.forEach((n, i) => {
    const x = 0.85 + i * (w + g), id = `n${i}`;
    step([card(s, id + "c", x, 1.92, w, 1.0, i === 3 ? LAMB : CARD), text(s, id + "t", n[0], { x: x + 0.06, y: 1.97, w: w - 0.12, h: 0.55, fontSize: 10.5, bold: true, align: "center", valign: "middle" }), text(s, id + "d", n[1], { x: x + 0.06, y: 2.5, w: w - 0.12, h: 0.35, fontSize: 11, bold: true, color: "B9770E", align: "center", valign: "middle" })], 200);
  });
  const lp = [["Railway Track (Phase 2)", "245 d", K["PC-0660"].tf, "PC-0670"], ["Signalling and Telecom", "245 d", K["PC-0640"].tf, "MS-0100"], ["Railway Turnouts", "245 d", K["PC-0680"].tf, "MS-0100"], ["Substation and SEC", "180 d", K["PC-0600"].tf, "PC-0610"], ["Generator room (Phase 2)", "150 d", K["PC-0620"].tf, "PC-0630"]];
  s.addText("Long-lead items", TX({ x: 0.85, y: 3.15, w: 5, h: 0.32, fontSize: 14, bold: true, objectName: "lph" })); step([{ name: "lph", fx: "fade" }]);
  ["Package", "Manufacture", "Delivered", "Float"].forEach((h, i) => { const xs = [0.95, 3.2, 4.35, 5.5], ws = [2.2, 1.1, 1.1, 0.8]; s.addText(h, TX({ x: xs[i], y: 3.52, w: ws[i], h: 0.28, fontSize: 10.5, bold: true, color: GREY, objectName: "lh" + i })); });
  step([0, 1, 2, 3].map(i => ({ name: "lh" + i, fx: "fade" })));
  lp.forEach((r, i) => {
    const y = 3.82 + i * 0.5, id = `l${i}`, crit = r[2] === 0;
    step([card(s, id + "c", 0.85, y, 5.55, 0.42, crit ? LAMB : CARD), text(s, id + "a", r[0], { x: 0.95, y, w: 2.25, h: 0.42, fontSize: 11.5, bold: true, valign: "middle" }), text(s, id + "b", r[1], { x: 3.2, y, w: 1.1, h: 0.42, fontSize: 11.5, valign: "middle" }),
      text(s, id + "d", E(r[3]), { x: 4.35, y, w: 1.1, h: 0.42, fontSize: 11.5, valign: "middle" }), text(s, id + "f", crit ? "0 d" : r[2] + " d", { x: 5.5, y, w: 0.85, h: 0.42, fontSize: 11.5, bold: true, color: crit ? "B9770E" : DARK, valign: "middle" })], 220);
  });
  step([card(s, "bs", 6.7, 3.15, 5.85, 3.35), rect(s, "bsb", 6.7, 3.15, 5.85, 0.09, AMBER), text(s, "bsh", "Baseline basis", { x: 6.9, y: 3.33, w: 5.4, h: 0.36, fontSize: 15, bold: true, valign: "middle" })]);
  s.addText(["Primavera P6 programme, 597 activities, 3 calendars: SAR 7-day for design and procurement, 6-day for construction (Friday off), calendar days for manufacture and shipping",
    "Notice to Proceed assumed 1 Nov 2026 (not confirmed); all dates move with it",
    "SAR review windows 14, 21 and 28 days for design; 28 days for material approval",
    "Phase 1: 12 items, procurement from Month 7. Phase 2: 4 items, procurement from Month 11",
    "No negative float: the programme finishes on 31 Dec 2028 with zero float"].map((t, k, a) => ({ text: t, options: { bullet: { code: "25CF", indent: 14 }, breakLine: k < a.length - 1, paraSpaceAfter: 6 } })), TX({ x: 6.9, y: 3.8, w: 5.45, h: 2.65, fontSize: 11.5, valign: "top", objectName: "bsl" }));
  step([{ name: "bsl", fx: "fade" }]);
  note(s, NOTE);
  s.addNotes("The railway track chain is the only chain with no float: it runs from Gate 3 through procurement, 245 days of manufacture, installation, testing, the SAR safety assessment and the Taking-Over certificate.");
}

fs.writeFileSync("anim.json", JSON.stringify(ANIM));
pres.writeFile({ fileName: "stage.pptx" }).then(() => console.log("built " + (page - 7)));
