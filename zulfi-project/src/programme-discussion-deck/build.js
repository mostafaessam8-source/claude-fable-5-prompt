const pptxgen = require("pptxgenjs");
const fs = require("fs");
const T = require("./sar_theme.js");
const L = require("./sar_layouts.js");
const C = T.C;
const M = JSON.parse(fs.readFileSync("./bl02_model.json", "utf8"));
const K = {}; M.tasks.forEach(t => K[t.code] = t);
const b64 = (p, mime) => `${mime};base64,` + fs.readFileSync(p).toString("base64");
const logo = b64("sar-logo.png", "image/png"), logoWhite = b64("sar-logo-white-ar.png", "image/png"), photo = b64("photo-platform.jpg", "image/jpeg");
const pres = new pptxgen(); pres.layout = "LAYOUT_WIDE"; pres.title = "Zulfi Train Station - Programme Discussion"; pres.author = "Saudi Arabia Railways (SAR)";
const S = L.init(pres, { logo, logoWhite, logoRatio: 420 / 127 });
const F = T.F_EN;
const TX = (o = {}) => Object.assign({ fontFace: F, margin: 0, isTextBox: true, color: C.black }, o);
const ANIM = {}; let page = 0;
function step(list, gap) { if (gap) list[0].gap = gap; (ANIM[page] = ANIM[page] || []).push(list); }
const BC = "Zulfi Train Station | Programme Discussion";
function content(title, sub) { const s = pres.addSlide(); page += 1; S.content(s, { titleText: title, sub, breadcrumb: BC, page }); return s; }
const sq = (s, x, y, w, h, fill, name, line) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: line || fill, width: line ? 0.75 : 0 }, objectName: name });
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MN[m - 1]} ${String(y).slice(2)}`; };
const E = (c) => fd(K[c].ef), St = (c) => fd(K[c].es);
const NTP = Date.parse("2026-11-01");
const mo = (iso) => (Date.parse(iso) - NTP) / 864e5 / 30.4375;
const NOTE = "Months count from the Notice to Proceed, assumed 1 Nov 2026 and not yet confirmed; all dates move with it. Dates are from programme BL02.";
const note = (s, t, y = 6.55) => { s.addText(t, TX({ x: 0.85, y, w: 11.75, h: 0.32, fontSize: 10, color: C.slate, valign: "top", objectName: "note" })); step([{ name: "note", fx: "fade" }]); };
const card = (s, id, x, y, w, h, fill, bar) => { sq(s, x, y, w, h, fill, id + "_bg", C.coolGray); if (bar) sq(s, x, y, w, 0.07, bar, id + "_bar"); return [{ name: id + "_bg", fx: "wipe" }].concat(bar ? [{ name: id + "_bar", fx: "wipe" }] : []); };
const txt = (s, id, t, o) => { s.addText(t, TX(Object.assign({ objectName: id }, o))); return { name: id, fx: "fade" }; };

// ====================================================== 1 COVER
{
  const s = pres.addSlide(); page += 1;
  S.cover(s, { photo, titleText: "Zulfi Train Station", subtitle: "Programme Discussion with Senior Management", meta: "Design, TGA, permits, procurement, construction and testing | Phase 1 and Phase 2 | Baseline BL02" });
  step([{ name: "t:Zulfi Train Station", fx: "fade" }]); step([{ name: "t:Programme Discussion with Senior Management", fx: "fade" }]);
  step([{ name: "t:Design, TGA, permits, procurement, construction and testing | Phase 1 and Phase 2 | Baseline BL02", fx: "fade" }]);
  s.addNotes("Purpose: walk senior management through the baseline programme, what controls the end date, and what we need decided.");
}

// ====================================================== 2 AT A GLANCE
{
  const s = content("Programme at a glance", "26 months from Notice to Proceed, one chain controls the end date");
  const kp = [["26 months", "Contract duration"], ["31 Dec 2028", "Contract completion, zero float"], ["20 Dec 2028", "Taking-Over of all works"], ["597 activities", "Including 52 TGA and permit activities"]];
  const tw = 2.8, gx = 0.183;
  kp.forEach((k, i) => {
    const x = 0.85 + i * (tw + gx), y = 1.9, id = `k${i}`;
    step(card(s, id, x, y, tw, 1.2, C.tint05, i === 1 ? C.yellow : C.blue));
    step([txt(s, id + "v", k[0], { x: x + 0.15, y: y + 0.12, w: tw - 0.3, h: 0.55, fontSize: 22, bold: true, color: C.blue, valign: "middle" }), txt(s, id + "l", k[1], { x: x + 0.15, y: y + 0.72, w: tw - 0.3, h: 0.4, fontSize: 11 })]);
  });
  const ms = [["NTP", "1 Nov 26", "MS-0010"], ["Gate 1", E("DS-0020"), "DS-0020"], ["Gate 2", E("DS-0360"), "DS-0360"], ["Gate 3 and work permit", E("DS-0700") + " | " + E("PR-0120"), "DS-0700"], ["Construction complete", E("MS-0120"), "MS-0120"], ["Taking-Over | Completion", E("MS-0130") + " | " + E("MS-0140"), "MS-0130"]];
  s.addText("Key dates", TX({ x: 0.85, y: 3.35, w: 5, h: 0.3, fontSize: 14, bold: true, color: C.blue, objectName: "kd_h" })); step([{ name: "kd_h", fx: "fade" }]);
  const x0 = 1.0, x1 = 12.3, y0 = 4.2, W = (x1 - x0) / 26;
  sq(s, x0, y0 - 0.04, x1 - x0, 0.08, C.coolGray, "tl"); step([{ name: "tl", fx: "wipe" }]);
  ms.forEach((m, i) => {
    const mm = i === 0 ? 0 : mo(K[m[2]].ef), x = x0 + mm * W, up = i % 2 === 0, id = `m${i}`;
    s.addShape(pres.ShapeType.ellipse, { x: x - 0.1, y: y0 - 0.1, w: 0.2, h: 0.2, fill: { color: i === 5 ? C.red : C.blue }, line: { color: C.white, width: 1.5 }, objectName: id + "d" });
    const bx = Math.min(Math.max(x - 1.05, 0.6), 12.73 - 2.1), by = up ? 3.62 : 4.5;
    s.addText([{ text: m[0], options: { bold: true, fontSize: 11, breakLine: true } }, { text: m[1], options: { fontSize: 10.5, color: C.blue } }], TX({ x: bx, y: by, w: 2.1, h: 0.55, align: "center", valign: "middle", objectName: id + "t" }));
    step([{ name: id + "d", fx: "fade" }, { name: id + "t", fx: "fade" }], 250);
  });
  const msg = [["Phase 1: SAR 65.0 M", "12 items SAR 55.2 M, plus preliminaries and design SAR 9.8 M. Procurement from Month 7."], ["Phase 2: SAR 35.0 M", "4 items: railway track, access road, generator room, FF&E. Procurement from Month 11."], ["What controls the end", "Phase 2 railway track: 245 days of manufacture, no float to completion."]];
  msg.forEach((m, i) => {
    const x = 0.85 + i * 3.97, id = `g${i}`;
    step(card(s, id, x, 5.3, 3.8, 1.15, C.white, i === 2 ? C.red : C.blue));
    step([txt(s, id + "h", m[0], { x: x + 0.15, y: 5.4, w: 3.5, h: 0.28, fontSize: 12.5, bold: true, color: C.blue }), txt(s, id + "t", m[1], { x: x + 0.15, y: 5.7, w: 3.5, h: 0.7, fontSize: 10.5, valign: "top" })]);
  });
  note(s, NOTE + " Phase values are contract billing: Phase 1 includes preliminaries and the design lump sum.", 6.55);
  s.addNotes("The programme is 26 months with zero float to the contract completion date. Phase 1 has 12 BOQ items and Phase 2 has 4; the station is operated after Taking-Over on 20 Dec 2028.");
}

// ====================================================== 3 PHASES
{
  const s = content("Phase 1 and Phase 2", "One design stage, two release waves");
  const lx = 0.85, lw = 2.9, x0 = lx + lw + 0.1, x1 = 12.55, W = (x1 - x0) / 26;
  sq(s, x0, 1.9, x1 - x0, 0.28, C.tint10, "ruler");
  for (let m = 1; m <= 26; m++) s.addText(String(m), TX({ x: x0 + (m - 1) * W, y: 1.9, w: W, h: 0.28, fontSize: 9, align: "center", valign: "middle" }));
  s.addText("Month from NTP", TX({ x: lx, y: 1.9, w: lw, h: 0.28, fontSize: 10, bold: true, color: C.blue, valign: "middle", objectName: "mh" }));
  step([{ name: "ruler", fx: "wipe" }, { name: "mh", fx: "fade" }]);
  const rows = [["Design (both phases)", 2, 11, C.sky, null], ["Procurement", 7, 18, C.midBlue, 1], ["Construction", 12, 20, C.blue, 1], ["Testing and commissioning", 14, 26, C.yellow, 1], ["Procurement", 11, 22, C.midBlue, 2], ["Construction", 12, 24, C.blue, 2], ["Testing and commissioning", 18, 25, C.yellow, 2]];
  let y = 2.28; const rh = 0.3;
  const band = (label, sub, color, id) => { sq(s, lx, y, x1 - lx, 0.3, color, id + "b"); s.addText(label, TX({ x: lx + 0.1, y, w: 2, h: 0.3, fontSize: 11.5, bold: true, color: C.white, valign: "middle", objectName: id + "t" })); s.addText(sub, TX({ x: x0, y, w: x1 - x0 - 0.1, h: 0.3, fontSize: 10, color: C.white, align: "right", valign: "middle", objectName: id + "s" })); step([{ name: id + "b", fx: "wipe" }, { name: id + "t", fx: "fade" }, { name: id + "s", fx: "fade" }]); y += 0.33; };
  const bar = (r, i) => {
    sq(s, lx, y, x1 - lx, rh, i % 2 ? C.white : C.tint05, `r${i}g`);
    s.addText(r[0], TX({ x: lx + 0.2, y, w: lw - 0.2, h: rh, fontSize: 10.5, valign: "middle", objectName: `r${i}l` }));
    const bx = x0 + (r[1] - 1) * W, bw = (r[2] - r[1] + 1) * W;
    sq(s, bx, y + 0.05, bw, rh - 0.1, r[3], `r${i}b`);
    s.addText(`M${r[1]}-${r[2]}`, TX({ x: bx, y: y + 0.05, w: bw, h: rh - 0.1, fontSize: 9, bold: true, align: "center", valign: "middle", color: r[3] === C.yellow || r[3] === C.sky ? C.black : C.white, objectName: `r${i}m` }));
    step([{ name: `r${i}l`, fx: "fade" }, { name: `r${i}b`, fx: "wipe" }, { name: `r${i}m`, fx: "fade" }], 250); y += rh;
  };
  band("Design", "Gate 1 Month 3 | Gate 2 Month 6 | Gate 3 Month 11", C.slate, "b0"); bar(rows[0], 0);
  band("Phase 1", "12 items SAR 55.2 M | SAR 65.0 M with preliminaries and design", C.blue, "b1"); [1, 2, 3].forEach(k => bar(rows[k], k));
  band("Phase 2", "4 items | SAR 35.0 M", C.black, "b2"); [4, 5, 6].forEach(k => bar(rows[k], k));
  const cols = [
    ["Phase 1 items", C.blue, "Main building, IT equipment, substation and SEC, firefighting building, water tank, site works and utilities, parking sheds, fence, gates, signalling and telecom, external works, turnouts.", "Long-lead: substation, signalling, turnouts. Float 114 to 158 days."],
    ["Phase 2 items", C.black, "FF&E, generator room, access road (about 1,700 m), railway track (loop line, 2,500 m).", "Long-lead: railway track (critical), generator room. Track has no float."],
  ];
  cols.forEach((c, i) => {
    const x = 0.85 + i * 5.93, id = `pc${i}`;
    step(card(s, id, x, 5.45, 5.82, 1.05, C.white, c[1]));
    step([txt(s, id + "t", c[2], { x: x + 0.15, y: 5.52, w: 5.5, h: 0.62, fontSize: 10, valign: "top" }), txt(s, id + "l", c[3], { x: x + 0.15, y: 6.14, w: 5.5, h: 0.32, fontSize: 10, bold: true, color: c[1] === C.black ? C.black : C.blue, valign: "top" })]);
  });
  note(s, NOTE + " Programme cost with the design lump sum spread over the items: Phase 1 SAR 63.1 M, Phase 2 SAR 36.9 M (SAR 1.9 M of design moves to Phase 1 billing).", 6.58);
  s.addNotes("Both phases share one design stage and one set of gates. Phase 1 procurement starts in Month 7, 15 days after Gate 2. Phase 2 procurement starts in Month 11, after Gate 3. Construction starts for both in Month 12 after the work permit.");
}

// ====================================================== 4 DESIGN
{
  const s = content("Design programme", "Three SAR gates; every stage is submitted, reviewed and signed off before the next starts");
  const st = [
    ["Gate 1: Concept", "DS-0020", [["Develop", "24 to 40 days"], ["Submit", "3 days"], ["SAR review", "14 days"]], "Design Basis Reports, concept drawings"],
    ["Gate 2: Preliminary", "DS-0360", [["Develop", "36 to 57 days"], ["Submit", "3 days"], ["SAR review", "21 days"]], "Preliminary design, VE, high-level EIA, safety case, BoQ"],
    ["Gate 3: Detailed and IFC", "DS-0700", [["Develop", "up to 109 days"], ["Submit", "3 days"], ["SAR review", "28 days"]], "Coordinated drawings, final specifications, IFC suite, HCIS and Civil Defense approvals"],
  ];
  const w = 3.8, g = 0.175;
  st.forEach((a, i) => {
    const x = 0.85 + i * (w + g), id = `gt${i}`;
    sq(s, x, 1.95, w, 0.85, i === 2 ? C.black : C.blue, id + "h");
    s.addText([{ text: a[0], options: { bold: true, fontSize: 15, breakLine: true } }, { text: "Approved " + E(a[1]), options: { fontSize: 12 } }], TX({ x: x + 0.15, y: 1.95, w: w - 0.3, h: 0.85, color: C.white, valign: "middle", objectName: id + "ht" }));
    step([{ name: id + "h", fx: "wipe" }, { name: id + "ht", fx: "fade" }]);
    sq(s, x, 2.8, w, 2.55, C.white, id + "b", C.coolGray);
    a[2].forEach((r, k) => {
      const yy = 2.95 + k * 0.5;
      sq(s, x + 0.15, yy, 0.12, 0.38, k === 1 ? C.yellow : (k === 0 ? C.blue : C.slate), `${id}c${k}`);
      s.addText(r[0], TX({ x: x + 0.38, y: yy, w: 1.5, h: 0.38, fontSize: 11.5, bold: true, valign: "middle", objectName: `${id}r${k}` }));
      s.addText(r[1], TX({ x: x + 1.9, y: yy, w: w - 2.05, h: 0.38, fontSize: 11.5, color: C.blue, bold: true, align: "right", valign: "middle", objectName: `${id}d${k}` }));
    });
    s.addText("Content: " + a[3], TX({ x: x + 0.15, y: 4.5, w: w - 0.3, h: 0.8, fontSize: 10.5, color: C.slate, valign: "top", objectName: id + "x" }));
    step([{ name: id + "b", fx: "wipe" }, ...[0, 1, 2].flatMap(k => [{ name: `${id}c${k}`, fx: "wipe" }, { name: `${id}r${k}`, fx: "fade" }, { name: `${id}d${k}`, fx: "fade" }]), { name: id + "x", fx: "fade" }], 300);
  });
  step(card(s, "par", 0.85, 5.5, 11.75, 0.95, C.tint05, C.yellow));
  step([txt(s, "pah", "Runs in parallel, with float", { x: 1.0, y: 5.58, w: 4, h: 0.28, fontSize: 12.5, bold: true, color: C.blue }),
        txt(s, "pat", `DEMP, safety and RAM plans approved ${E("TG-2040")}. ICP checks each stage. Safety case reviewed ${E("TG-2220")} (float ${K["TG-2220"].tf} days). Hazard close-out and ICP verification ${E("TG-0430")}. SAR review of 16 packages at once is the main capacity risk.`, { x: 1.0, y: 5.86, w: 11.45, h: 0.55, fontSize: 10.5, valign: "top" })]);
  note(s, NOTE + " Review days are baseline assumptions SAR is asked to confirm.", 6.55);
  s.addNotes("Gate dates come from the critical design chain. Design development for 16 packages runs in parallel; the gate falls when the last package has been reviewed and approved by SAR.");
}

// ====================================================== 5 TGA
{
  const s = content("TGA process in the programme", "Contract clause 18 turned into linked activities, each submission separate from its review");
  const rows = [
    ["ICP appointed", "Independent Competent Person appointed and accepted", "TG-2020", "Contractor submits, SAR / TGA accepts", C.black],
    ["Plans approved", "DEMP, safety plan, RAM plan, change management procedure", "TG-2040", "Contractor submits, SAR approves", C.blue],
    ["Safe by Design", "Concept hazards; preliminary safety case and risk register", "TG-2220", "Contractor submits, SAR reviews, ICP checks", C.blue],
    ["Environment", "High-level EIA, detailed EIA, GAMEP construction permit", "PR-2270", "Contractor submits, SAR then GAMEP", C.midBlue],
    ["Hazard close-out", "Hazards to ALARP; ICP design verification before Gate 3", "TG-0430", "Contractor submits, SAR reviews, ICP verifies", C.blue],
    ["Construction safety", "Safety plan and ICP hold and witness points accepted", "TG-2720", "Contractor submits, SAR / ICP accept", C.slate],
    ["Final verification", "ICP final report; safety assessment submission", "TG-0830", "Contractor submits, ICP reports", C.red],
    ["SAR acceptance", "Safety assessment, readiness review, Taking-Over certificate", "CO-0015", "Contractor submits, SAR reviews and issues", C.red],
  ];
  const H = (t, al = "left") => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: al, valign: "middle" } });
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white, o = (al, e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 10.5, align: al, valign: "middle" }, e);
    const k = K[r[2]];
    return [{ text: r[0], options: o("left", { bold: true, color: C.blue }) }, { text: r[1], options: o("left") }, { text: r[3], options: o("left") }, { text: fd(k.ef), options: o("center", { bold: true }) }, { text: k.tf <= 0 ? "0" : String(k.tf), options: o("center", { bold: true, color: k.tf <= 30 ? C.red : C.black }) }];
  });
  s.addTable([[H("Step"), H("What happens"), H("Who submits and who reviews"), H("Date", "center"), H("Float (d)", "center")], ...body], { x: 0.85, y: 1.9, w: 11.75, colW: [1.9, 4.3, 3.3, 1.2, 1.05], rowH: 0.42, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step([{ name: "tbl", fx: "wipe" }]);
  step(card(s, "tgb", 0.85, 5.95, 11.75, 0.5, C.yellow));
  step([txt(s, "tgbt", "TGA, ICP and HCIS review times are not yet confirmed, so these steps use proposed durations.", { x: 1.0, y: 5.95, w: 11.45, h: 0.5, fontSize: 11.5, bold: true, valign: "middle" })]);
  note(s, "Float is total float in calendar days. Items with float of 30 days or less are shown in red. The TGA guidance documents were not available.", 6.58);
  s.addNotes("The TGA activities sit in WBS 09 of the programme. They run in parallel with design and carry float, except the end-of-project verification steps, which have 1 to 7 days.");
}

// ====================================================== 6 PERMITS
{
  const s = content("Permits and approvals", "The contractor prepares and submits; SAR and the authorities review and approve");
  const rows = [
    ["SAR work permit", "Package 21 d, SAR check 5 d, documents 7 d, technical review 30 d, TTF02 14 d, issue 14 d", "TG-0610", "PR-0120", "SAR Permit Dept.", "H"],
    ["Environmental permit", "Detailed EIA 45 d, GAMEP approval 60 d", "TG-0330", "PR-2270", "GAMEP", "C"],
    ["HCIS design approval", "Package 21 d, HCIS approval 30 d", "TG-0510", "TG-2520", "HCIS", "T"],
    ["Civil Defense design approval", "Submission 3 d, review and approval 45 d", "TG-0530", "PR-0110", "Civil Defense", "B"],
    ["SEC design and power agreement", "Design approval 60 d; permanent power agreement 90 d", "PR-2113", "PR-0165", "SEC", "B"],
    ["Possession, turnout tie-in", "Request package 5 d, SAR booking 30 d", "TG-0660", "PR-0196", "SAR Operations", "H"],
    ["Possession, loop line tie-in", "Request package 5 d, SAR booking 30 d", "TG-0650", "PR-0195", "SAR Operations", "H"],
    ["Operating rules change", "Request 12 d, review 15 d, notice 15 d", "TG-0910", "TG-2925", "SAR Governance", "S"],
  ];
  const H = (t, al = "left") => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 10.5, align: al, valign: "middle" } });
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white, o = (al, e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 10, align: al, valign: "middle" }, e);
    const a = K[r[2]], z = K[r[3]];
    return [{ text: r[0], options: o("left", { bold: true, color: C.blue }) }, { text: r[1], options: o("left") }, { text: fd(a.es), options: o("center") }, { text: fd(z.ef), options: o("center", { bold: true }) }, { text: String(z.tf), options: o("center", { bold: true, color: z.tf <= 30 ? C.red : C.black }) }, { text: r[4], options: o("left") }, { text: r[5], options: o("center", { bold: true }) }];
  });
  s.addTable([[H("Permit or approval"), H("Steps and days"), H("Starts", "center"), H("Approved", "center"), H("Float (d)", "center"), H("Reviewer"), H("Basis", "center")], ...body], { x: 0.85, y: 1.9, w: 11.75, colW: [2.3, 4.15, 0.95, 1.0, 0.8, 1.9, 0.65], rowH: 0.42, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step([{ name: "tbl", fx: "wipe" }]);
  step(card(s, "pw", 0.85, 5.95, 11.75, 0.5, C.tint10));
  step([txt(s, "pwt", `Work permit: submitted ${fd(K["TG-0620"].ef)}, issued ${E("PR-0120")}, about 3 months before construction starts, as the SAR handbook asks. The request goes through SAR as project owner.`, { x: 1.0, y: 5.95, w: 11.45, h: 0.5, fontSize: 11, bold: true, valign: "middle" })]);
  note(s, "Basis: C contract, H SAR Work Permit Handbook V2, S SAR procedure, B baseline assumption, T authority time to be confirmed.", 6.58);
  s.addNotes("Each permit is a submission by the contractor and a separate review by SAR or the authority. Only the loop-line possession booking is close to the critical path, with 6 days of float.");
}

// ====================================================== 7 PROCUREMENT
{
  const s = content("Procurement and long-lead items", "Five packages, SAR 50.5 M; only the railway track has no float");
  const rows = [
    ["Railway Track", "Phase 2", "21.9", "PC-2310", "PC-0470", "PC-0660", 245, "PC-0670", "MS-0110", C.red],
    ["Signalling and Telecom", "Phase 1", "14.9", "PC-2300", "PC-0460", "PC-0640", 245, "PC-0650", "MS-0100", C.blue],
    ["Railway Turnouts", "Phase 1", "9.0", "PC-2320", "PC-0480", "PC-0680", 245, "PC-0690", "MS-0100", C.blue],
    ["Substation and SEC", "Phase 1", "3.7", "PC-2200", "PC-0360", "PC-0600", 180, "PC-0610", "PC-0610", C.blue],
    ["Generator room", "Phase 2", "1.0", "PC-2220", "PC-0380", "PC-0620", 150, "PC-0630", "PC-0630", C.slate],
  ];
  const lx = 0.85, x0 = 5.55, x1 = 10.55, W = (x1 - x0) / 20, xr = 10.7;       // Months 7 to 26 on the axis
  const mx = (iso) => x0 + (mo(iso) - 6) * W;
  sq(s, x0, 1.9, x1 - x0, 0.28, C.tint10, "ruler");
  s.addText("Delivery and float", TX({ x: xr, y: 1.9, w: 1.95, h: 0.28, fontSize: 10, bold: true, color: C.blue, valign: "middle", objectName: "dfh" }));
  for (let m = 7; m <= 26; m++) s.addText(String(m), TX({ x: x0 + (m - 7) * W, y: 1.9, w: W, h: 0.28, fontSize: 9, align: "center", valign: "middle" }));
  [["Package", lx, 2.3], ["Phase", lx + 2.3, 0.7], ["SAR M", lx + 3.0, 0.7]].forEach((h, i) => s.addText(h[0], TX({ x: h[1], y: 1.9, w: h[2], h: 0.28, fontSize: 10, bold: true, color: C.blue, valign: "middle", objectName: "ph" + i })));
  s.addText("Month", TX({ x: x0 - 0.7, y: 1.9, w: 0.65, h: 0.28, fontSize: 10, bold: true, color: C.blue, align: "right", valign: "middle", objectName: "phm" }));
  step([{ name: "ruler", fx: "wipe" }, ...[0, 1, 2].map(i => ({ name: "ph" + i, fx: "fade" })), { name: "phm", fx: "fade" }, { name: "dfh", fx: "fade" }]);
  rows.forEach((r, i) => {
    const y = 2.3 + i * 0.62, id = `lp${i}`, mfg = K[r[5]], dlv = K[r[7]], appr = K[r[3]], po = K[r[4]];
    sq(s, lx, y, x1 - lx, 0.55, i % 2 ? C.white : C.tint05, id + "g");
    s.addText(r[0], TX({ x: lx + 0.08, y, w: 2.2, h: 0.55, fontSize: 11, bold: true, valign: "middle", objectName: id + "n" }));
    s.addText(r[1], TX({ x: lx + 2.3, y, w: 0.7, h: 0.55, fontSize: 10, valign: "middle", objectName: id + "p" }));
    s.addText(r[2], TX({ x: lx + 3.0, y, w: 0.7, h: 0.55, fontSize: 10.5, bold: true, color: C.blue, valign: "middle", objectName: id + "v" }));
    const seg = (a, b, color, nm) => { const xa = mx(a), xb = Math.max(mx(b), xa + 0.05); sq(s, xa, y + 0.13, xb - xa, 0.29, color, nm); return { name: nm, fx: "wipe" }; };
    const els = [{ name: id + "g", fx: "wipe" }, { name: id + "n", fx: "fade" }, { name: id + "p", fx: "fade" }, { name: id + "v", fx: "fade" }];
    els.push(seg(appr.es, po.ef, C.slate, id + "a"));
    els.push(seg(mfg.es, mfg.ef, r[9], id + "m"));
    els.push(seg(dlv.es, dlv.ef, C.yellow, id + "s"));
    s.addText(`${r[6]} d`, TX({ x: mx(mfg.es), y: y + 0.13, w: Math.max(mx(mfg.ef) - mx(mfg.es), 0.5), h: 0.29, fontSize: 9, bold: true, color: C.white, align: "center", valign: "middle", objectName: id + "mt" })); els.push({ name: id + "mt", fx: "fade" });
    s.addText([{ text: `Delivered ${fd(dlv.ef)}`, options: { breakLine: true } }, { text: `Float ${mfg.tf} d`, options: { bold: true } }], TX({ x: xr, y, w: 1.95, h: 0.55, fontSize: 10, color: mfg.tf === 0 ? C.red : C.slate, bold: mfg.tf === 0, valign: "middle", objectName: id + "f" })); els.push({ name: id + "f", fx: "fade" });
    step(els, 350);
  });
  const lg = [["Material approval and PO", C.slate], ["Manufacture", C.blue], ["Shipping and delivery", C.yellow], ["Manufacture, critical", C.red]];
  lg.forEach((l, i) => { const x = 0.85 + i * 2.6; sq(s, x, 5.5, 0.18, 0.18, l[1], `lg${i}`); s.addText(l[0], TX({ x: x + 0.26, y: 5.44, w: 2.3, h: 0.3, fontSize: 10, valign: "middle", objectName: `lg${i}t` })); });
  step(lg.flatMap((l, i) => [{ name: `lg${i}`, fx: "fade" }, { name: `lg${i}t`, fx: "fade" }]));
  step(card(s, "pi", 0.85, 5.85, 11.75, 0.6, C.tint05, C.yellow));
  step([txt(s, "pit", "Phase 1 long-lead packages have 114 to 158 days of float; the railway track chain, ordered after Gate 3, has none. Submitting track material for early approval would create float.", { x: 1.0, y: 5.85, w: 11.45, h: 0.6, fontSize: 11, bold: true, valign: "middle" })]);
  note(s, NOTE + " Per-package manufacture days are the baseline values; supplier quotations confirm them.", 6.58);
  s.addNotes("Long-lead manufacture is 245 days for track, signalling and turnouts, 180 for the substation and 150 for the generator. Phase 1 items are ordered in July 2027 and delivered by early 2028 with float; the track is ordered in November 2027 and delivered 9 Aug 2028.");
}

// ====================================================== 8 CRITICAL PATH
{
  const s = content("Critical path", "The longest path: 35 activities, zero float, from Notice to Proceed to completion");
  const nodes = [
    ["NTP", "1 Nov 26"], ["Gate 1", E("DS-0020")], ["Gate 2", E("DS-0360")], ["Gate 3", E("DS-0700")], ["Track material approved", E("PC-2310")], ["Track order placed", E("PC-0470")], ["Manufacture 245 d", E("PC-0660")], ["Delivered to site", E("PC-0670")],
    ["Track installed", E("CN-1660")], ["Tie-in to main line", E("CN-1670")], ["Signalling integration", E("CN-1680")], ["Integration tests", E("TC-0370")], ["Trial running", E("TC-0460")], ["SAR safety assessment", E("TC-0380")], ["Taking-Over certificate", E("CO-0015")], ["Completion", E("MS-0140")],
  ];
  const per = 8, w = 1.37, g = 0.1;
  nodes.forEach((n, i) => {
    const r = Math.floor(i / per), c = i % per, x = 0.85 + c * (w + g), y = 2.0 + r * 1.55, id = `cp${i}`;
    const col = i < 4 ? C.blue : i < 8 ? C.midBlue : i < 11 ? C.slate : i < 15 ? C.yellow : C.red;
    s.addShape(pres.ShapeType.rect, { x, y, w, h: 1.2, fill: { color: C.white }, line: { color: col, width: 1.5 }, objectName: id + "b" });
    sq(s, x, y, w, 0.08, col, id + "bar");
    s.addText(n[0], TX({ x: x + 0.05, y: y + 0.14, w: w - 0.1, h: 0.62, fontSize: 10.5, bold: true, align: "center", valign: "middle", objectName: id + "t" }));
    s.addText(n[1], TX({ x: x + 0.05, y: y + 0.78, w: w - 0.1, h: 0.36, fontSize: 10.5, bold: true, color: C.blue, align: "center", valign: "middle", objectName: id + "d" }));
    if (c < per - 1 && i < nodes.length - 1) s.addShape(pres.ShapeType.rightArrow, { x: x + w - 0.02, y: y + 0.52, w: g + 0.04, h: 0.16, fill: { color: C.slate }, line: { color: C.slate, width: 0 }, objectName: id + "a" });
    step([{ name: id + "b", fx: "wipe" }, { name: id + "bar", fx: "wipe" }, { name: id + "t", fx: "fade" }, { name: id + "d", fx: "fade" }].concat(c < per - 1 && i < nodes.length - 1 ? [{ name: id + "a", fx: "fade" }] : []), 220);
  });
  s.addText("Closest to the path (float in days)", TX({ x: 0.85, y: 5.15, w: 6, h: 0.3, fontSize: 13, bold: true, color: C.blue, objectName: "nh" })); step([{ name: "nh", fx: "fade" }]);
  const nc = [["Taking-Over application", K["TG-0880"].tf], ["ICP final report", K["TG-0820"].tf], ["Safety assessment submission", K["TG-0830"].tf], ["Loop line possession", K["PR-0195"].tf], ["Readiness review", K["TG-0930"].tf], ["Safety case review", K["TG-2220"].tf]];
  nc.forEach((c, i) => {
    const x = 0.85 + i * 1.97, id = `nc${i}`;
    s.addShape(pres.ShapeType.rect, { x, y: 5.5, w: 1.87, h: 0.85, fill: { color: C.tint05 }, line: { color: C.coolGray, width: 0.75 }, objectName: id + "b" });
    s.addText(String(c[1]), TX({ x, y: 5.52, w: 1.87, h: 0.4, fontSize: 18, bold: true, color: c[1] <= 7 ? C.red : C.blue, align: "center", valign: "middle", objectName: id + "v" }));
    s.addText(c[0], TX({ x: x + 0.05, y: 5.92, w: 1.77, h: 0.4, fontSize: 9.5, align: "center", valign: "top", objectName: id + "l" }));
    step([{ name: id + "b", fx: "wipe" }, { name: id + "v", fx: "fade" }, { name: id + "l", fx: "fade" }], 200);
  });
  note(s, NOTE + " Phase 1 packages and the TGA and permit activities run in parallel with float.", 6.55);
  s.addNotes("The critical path runs through the three design gates, the Phase 2 railway track supply chain, track installation, testing, the SAR safety assessment and the Taking-Over certificate. Everything else has float. The nearest items are at the end of the project.");
}

// ====================================================== 9 RISKS AND DECISIONS
{
  const s = content("Risks and decisions needed", "What can move the date, and what we ask of senior management");
  const risks = [
    ["Notice to Proceed", "Not confirmed. Each month of delay moves completion by a month."],
    ["Railway track supply", "245 days manufacture, no float. A supplier slip is a delay to completion."],
    ["SAR review capacity", "28 days at Gate 3 for 16 packages submitted together."],
    ["Authority times", "TGA, ICP, HCIS, Civil Defense and GAMEP review times are not confirmed."],
    ["Possession and testing", "Loop line possession has 6 days of float; safety assessment is 15 days against about 30 recommended."],
  ];
  const dec = [
    "Confirm the Notice to Proceed date.",
    "Confirm review times with TGA, HCIS, Civil Defense and GAMEP, and when the ICP must be appointed.",
    "Confirm SAR review windows: 14, 21 and 28 days, and the possession windows.",
    "Agree early technical approval of the railway track material, ahead of Gate 3, to create float.",
    "Nominate one SAR focal point for the work permit and permit submissions.",
  ];
  s.addText("What can move the date", TX({ x: 0.85, y: 1.95, w: 6, h: 0.32, fontSize: 15, bold: true, color: C.blue, objectName: "rh" })); step([{ name: "rh", fx: "fade" }]);
  risks.forEach((r, i) => {
    const y = 2.4 + i * 0.8, id = `rk${i}`;
    step(card(s, id, 0.85, y, 5.85, 0.72, i % 2 ? C.white : C.tint05, C.yellow));
    step([txt(s, id + "t", [{ text: r[0] + ": ", options: { bold: true, color: C.blue } }, { text: r[1] }], { x: 1.05, y, w: 5.55, h: 0.72, fontSize: 10.5, valign: "middle" })], 250);
  });
  sq(s, 7.0, 1.95, 5.6, 4.45, C.blue, "dc_bg");
  s.addText("Decisions requested", TX({ x: 7.25, y: 2.05, w: 5.1, h: 0.4, fontSize: 16, bold: true, color: C.white, objectName: "dc_h" }));
  s.addText(dec.map((t, k) => ({ text: t, options: { bullet: { code: "25A0", indent: 16 }, breakLine: k < dec.length - 1, paraSpaceAfter: 10 } })), TX({ x: 7.25, y: 2.55, w: 5.1, h: 3.7, fontSize: 12.5, color: C.white, valign: "top", objectName: "dc_l" }));
  step([{ name: "dc_bg", fx: "wipe" }, { name: "dc_h", fx: "fade" }, { name: "dc_l", fx: "fade" }], 400);
  note(s, NOTE, 6.55);
  s.addNotes("Five decisions: the NTP date, authority review times and ICP timing, SAR review and possession windows, early approval of the railway track material, and a single focal point for permits.");
}

// ====================================================== 10 END
{
  const s = pres.addSlide(); page += 1;
  S.endSlide(s, { text: "Thank You" });
  step([{ name: "t:Thank You", fx: "fade" }]);
}
fs.writeFileSync("anim.json", JSON.stringify(ANIM));
pres.writeFile({ fileName: "stage.pptx" }).then(() => console.log("built " + page));
