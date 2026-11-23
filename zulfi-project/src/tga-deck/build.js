const pptxgen = require("pptxgenjs");
const fs = require("fs");
const T = require("./sar_theme.js");
const L = require("./sar_layouts.js");
const C = T.C;
const b64 = (p, mime) => `${mime};base64,` + fs.readFileSync(p).toString("base64");
const logo = b64("sar-logo.png", "image/png");
const logoWhite = b64("sar-logo-white-ar.png", "image/png");
const photoCover = b64("photo-platform.jpg", "image/jpeg");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "Zulfi Train Station - Approvals, Permits and Workflow to Operation";
pres.author = "Saudi Arabia Railways (SAR)";
const S = L.init(pres, { logo, logoWhite, logoRatio: 420 / 127 });
const F = T.F_EN;
const TX = (o = {}) => Object.assign({ fontFace: F, margin: 0, isTextBox: true, color: C.black }, o);
const ANIM = {};
let page = 0;
function step(list, gap) { if (gap) list[0].gap = gap; (ANIM[page] = ANIM[page] || []).push(list); }
const BC = "Zulfi Train Station | Approvals and Workflow to Operation";
function content(title, sub) { const s = pres.addSlide(); page += 1; S.content(s, { titleText: title, sub, breadcrumb: BC, page }); return s; }
const sq = (s, x, y, w, h, fill, name, line) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: line || fill, width: line ? 0.75 : 0 }, objectName: name });
const NOTE_BASIS = "Basis: C = Contract scope of work, B = baseline programme assumption, S = SAR procedure, T = to be confirmed with the authority.";
const TAGC = { C: C.blue, B: C.slate, S: C.midBlue, T: C.yellow };
function tag(s, t, x, y, id) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w: 0.26, h: 0.22, fill: { color: TAGC[t] }, line: { color: TAGC[t], width: 0 }, rectRadius: 0.05, objectName: id });
  s.addText(t, TX({ x, y, w: 0.26, h: 0.22, align: "center", valign: "middle", fontSize: 9, bold: true, color: t === "T" ? C.black : C.white, objectName: id + "_t" }));
  return [{ name: id, fx: "fade" }, { name: id + "_t", fx: "fade" }];
}
const note = (s, t, y = 6.55) => { s.addText(t, TX({ x: 0.85, y, w: 11.75, h: 0.3, fontSize: 10, color: C.slate, valign: "top", objectName: "note" })); step([{ name: "note", fx: "fade" }]); };

// ============================================================ 1. COVER
{
  const s = pres.addSlide(); page += 1;
  S.cover(s, { photo: photoCover, titleText: "Zulfi Train Station", subtitle: "Approvals, Permits and Workflow to Operation", meta: "TGA requirements (contract clause 18) | design, execution, testing and handover" });
  step([{ name: "t:Zulfi Train Station", fx: "fade" }]);
  step([{ name: "t:Approvals, Permits and Workflow to Operation", fx: "fade" }]);
  step([{ name: "t:TGA requirements (contract clause 18) | design, execution, testing and handover", fx: "fade" }]);
  s.addNotes("This deck shows every approval, permit and review the station needs between Notice to Proceed and operation, how the workflow runs through design, execution and testing, and how many days each step takes.");
}

// ============================================================ 2. ROADMAP
{
  const s = content("Roadmap to operation", "Six stages, each closed by an approval before the next one starts");
  const st = [
    ["1", "Mobilise and plan", "Month 1-2", ["Design and Engineering Management Plan (DEMP)", "Safety and RAM plans", "Independent Competent Person appointed"], "SAR, TGA", C.black],
    ["2", "Design", "Month 2-11", ["Concept, Preliminary, Detailed and IFC", "Interdisciplinary review (IDC/IDR) at every stage", "Gates in Months 3, 6 and 11"], "SAR phase gates", C.blue],
    ["3", "Permits and approvals", "Month 4-12", ["High-level and detailed EIA", "HCIS and Civil Defense design approval", "Utility connections; work permit in Month 12"], "GAMEP, HCIS, Civil Defense, utilities", C.midBlue],
    ["4", "Procurement and FAT", "Month 7-22", ["Material submittals and approvals", "Long-lead manufacture, 150 to 245 days", "Factory Acceptance Tests"], "SAR", C.slate],
    ["5", "Construction", "Month 12-24", ["Method statements and inspections", "Installation progress at 30%, 60%, 100%", "Possession for track tie-in"], "SAR, ICP", C.yellow],
    ["6", "Test, verify, hand over", "Month 14-26", ["Integration tests and safety assessment", "Trial running", "Taking-Over, then operation"], "SAR, TGA, HCIS, Civil Defense", C.red],
  ];
  const w = 1.86, g = 0.118;
  st.forEach((a, i) => {
    const x = 0.85 + i * (w + g), id = `rd${i}`;
    sq(s, x, 1.95, w, 0.78, a[5], `${id}_h`);
    s.addText(a[0] + "  " + a[1], TX({ x: x + 0.1, y: 1.95, w: w - 0.2, h: 0.78, fontSize: 13, bold: true, color: a[5] === C.yellow ? C.black : C.white, valign: "middle", objectName: `${id}_ht` }));
    sq(s, x, 2.73, w, 3.2, C.white, `${id}_b`, C.coolGray);
    s.addText(a[2], TX({ x: x + 0.12, y: 2.82, w: w - 0.24, h: 0.3, fontSize: 13, bold: true, color: C.blue, objectName: `${id}_m` }));
    s.addText(a[3].map((t, k) => ({ text: t, options: { bullet: { code: "25A0", indent: 12 }, breakLine: k < a[3].length - 1, paraSpaceAfter: 6 } })), TX({ x: x + 0.12, y: 3.2, w: w - 0.24, h: 2.1, fontSize: 11, valign: "top", objectName: `${id}_l` }));
    s.addText([{ text: "Approver: ", options: { bold: true, color: C.blue } }, { text: a[4] }], TX({ x: x + 0.12, y: 5.3, w: w - 0.24, h: 0.6, fontSize: 10.5, valign: "top", objectName: `${id}_a` }));
    step([{ name: `${id}_h`, fx: "wipe" }, { name: `${id}_ht`, fx: "fade" }, { name: `${id}_b`, fx: "wipe" }, { name: `${id}_m`, fx: "fade" }, { name: `${id}_l`, fx: "fade" }, { name: `${id}_a`, fx: "fade" }], 350);
  });
  sq(s, 0.85, 6.1, 11.75, 0.42, C.tint10, "rd_ban");
  s.addText("Operation starts after the Taking-Over certificate in Month 26. The operation date itself is set with SAR Operations once the Notice to Proceed date is confirmed.", TX({ x: 1.0, y: 6.1, w: 11.5, h: 0.42, fontSize: 11, bold: true, valign: "middle", objectName: "rd_bt" }));
  step([{ name: "rd_ban", fx: "wipe" }, { name: "rd_bt", fx: "fade" }]);
  s.addNotes("Months count from the Notice to Proceed. Stages overlap: procurement starts while design finishes, and testing starts while construction closes out.");
}

// ============================================================ 3. TGA CLAUSE 18
{
  const s = content("TGA requirements: contract clause 18", "What the contract requires and what it means for the programme");
  const cards = [
    ["Management and Control of Change", "Implement the TGA guidance on change management. Every change to approved design or scope is assessed for risk and approved before it is built.",
      "Change requests with a risk assessment are part of the DEMP. SAR's own critical rule-book change process takes 15 + 15 days."],
    ["Independent Competent Person", "Appoint an Independent Competent Person (ICP) for the project.",
      "Appoint at mobilisation, before the first design submission, so design and construction safety are checked independently."],
    ["Safe Design and Construction", "Safe by Design (clause 24): risks identified, assessed and reduced to ALARP at every design stage, with RAM to EN 50126 (clause 25).",
      "Preliminary hazard analysis, safety case and risk register at Preliminary design. Hazards closed to ALARP in Detailed design; residual hazards handed to the asset owner."],
    ["Environmental requirements", "EIA, an Environmental Permit for Construction before works start, and an approved system for wastewater discharge.",
      "High-level EIA at Preliminary design; detailed EIA to GAMEP; permit in hand before the Month 12 work permit."],
  ];
  const w = 2.86, g = 0.1;
  cards.forEach((c, i) => {
    const x = 0.85 + i * (w + g), id = `tg${i}`;
    sq(s, x, 1.95, w, 0.7, C.blue, `${id}_h`);
    s.addText(c[0], TX({ x: x + 0.12, y: 1.95, w: w - 0.24, h: 0.7, fontSize: 13, bold: true, color: C.white, valign: "middle", objectName: `${id}_ht` }));
    sq(s, x, 2.65, w, 3.35, C.white, `${id}_b`, C.coolGray);
    s.addText("Contract", TX({ x: x + 0.14, y: 2.75, w: w - 0.28, h: 0.25, fontSize: 11, bold: true, color: C.blue, objectName: `${id}_k1` }));
    s.addText(c[1], TX({ x: x + 0.14, y: 3.02, w: w - 0.28, h: 1.2, fontSize: 11, valign: "top", objectName: `${id}_c1` }));
    sq(s, x + 0.14, 4.27, w - 0.28, 0.02, C.coolGray, `${id}_ln`);
    s.addText("For the programme", TX({ x: x + 0.14, y: 4.35, w: w - 0.28, h: 0.25, fontSize: 11, bold: true, color: C.blue, objectName: `${id}_k2` }));
    s.addText(c[2], TX({ x: x + 0.14, y: 4.62, w: w - 0.28, h: 1.35, fontSize: 11, valign: "top", objectName: `${id}_c2` }));
    step([{ name: `${id}_h`, fx: "wipe" }, { name: `${id}_ht`, fx: "fade" }, { name: `${id}_b`, fx: "wipe" }, { name: `${id}_k1`, fx: "fade" }, { name: `${id}_c1`, fx: "fade" }, { name: `${id}_ln`, fx: "wipe" }, { name: `${id}_k2`, fx: "fade" }, { name: `${id}_c2`, fx: "fade" }], 350);
  });
  sq(s, 0.85, 6.12, 11.75, 0.5, C.yellow, "tg_ban");
  s.addText("To confirm: the TGA guidance documents set the review times. They were not in the files received, so TGA review days are shown as to be confirmed.", TX({ x: 1.0, y: 6.12, w: 11.5, h: 0.5, fontSize: 11, bold: true, valign: "middle", objectName: "tg_bt" }));
  step([{ name: "tg_ban", fx: "wipe" }, { name: "tg_bt", fx: "fade" }]);
  s.addNotes("Clause 18 lists three TGA guidance topics: Management and Control of Change, Appointment of an Independent Competent Person, and Safe Design and Construction, plus the environmental requirements. The ICP timing is a planning proposal.");
}

// ============================================================ 4. WHO APPROVES WHAT
{
  const s = content("Who approves what", "The contractor obtains external approvals; SAR assists with introduction letters");
  const rows = [
    ["SAR Engineering and Projects", "Each design phase and gate, IDC/IDR sign-off, submittals, readiness reviews, Taking-Over", "All stages", "Design basis, drawings, specifications, method statements"],
    ["TGA", "Change control, Independent Competent Person, safe design and construction", "Design to operation", "ICP appointment, safety case, change requests"],
    ["HCIS", "Security and fire design, through an HCIS-approved consultant; works by an HCIS-approved contractor", "Detailed design to installation", "HCIS design approval, contractor approval"],
    ["Civil Defense", "Fire protection and life safety (NFPA / SBC)", "Detailed design, completion", "Fire design package, inspection certificate"],
    ["GAMEP", "Detailed EIA and Environmental Permit for Construction", "Preliminary design to before works", "High-level and detailed EIA"],
    ["SEC, NWC, Municipality", "Power, potable water, sewerage and drainage connections", "Applications early; connect before testing", "Load schedules, applications, agreements"],
    ["Road authority, pipeline and line owners", "Highway junction tie-in; crossings near pipelines and transmission lines (e.g. ARAMCO)", "Detailed design to works", "Junction design, clearance letters"],
  ];
  const H = (t, al = "left") => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: al, valign: "middle" } });
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white;
    const o = (e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 10.5, align: "left", valign: "middle" }, e);
    return [{ text: r[0], options: o({ bold: true, color: C.blue }) }, { text: r[1], options: o() }, { text: r[2], options: o() }, { text: r[3], options: o() }];
  });
  s.addTable([[H("Entity"), H("Approves or reviews"), H("When"), H("Contractor documents")], ...body], { x: 0.85, y: 1.9, w: 11.75, colW: [2.3, 4.3, 2.35, 2.8], rowH: 0.52, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step([{ name: "tbl", fx: "wipe" }]);
  note(s, "Source: Scope of Works clauses 18, 22, 33, 43, 45 and the discipline sections. The road authority for the junction is to be identified by the contractor.", 6.35);
  s.addNotes("The contractor is responsible for obtaining approvals from external stakeholders (clause 22). SAR approval of a submittal does not relieve the contractor of responsibility for errors.");
}

// ============================================================ 5. DESIGN WORKFLOW
{
  const s = content("Design workflow with all disciplines", "Every stage is checked, signed off across disciplines and gated by SAR before the next stage starts");
  const stg = [["Concept", "1a", "0-10%", "Gate 1: Month 3", "14 days review"], ["Preliminary", "2a", "10-30%", "Gate 2: Month 6", "21 days review"], ["Detailed", "3a", "30-80%", "Gate 3: Month 11", "28 days review"], ["IFC", "3b", "80-100%", "Issued with Gate 3", "Final IDC/IDR"]];
  const w = 2.82, g = 0.157;
  stg.forEach((a, i) => {
    const x = 0.85 + i * (w + g), id = `st${i}`;
    sq(s, x, 1.9, w, 0.95, i === 3 ? C.black : C.blue, `${id}_h`);
    s.addText([{ text: a[0], options: { bold: true, fontSize: 16, breakLine: true } }, { text: `SAR stage ${a[1]} | ${a[2]} complete`, options: { fontSize: 10.5 } }], TX({ x: x + 0.15, y: 1.9, w: w - 0.3, h: 0.95, color: C.white, valign: "middle", objectName: `${id}_ht` }));
    sq(s, x, 2.85, w, 0.62, C.tint10, `${id}_g`);
    s.addText([{ text: a[3], options: { bold: true, breakLine: true } }, { text: a[4] }], TX({ x: x + 0.15, y: 2.85, w: w - 0.3, h: 0.62, fontSize: 11, valign: "middle", objectName: `${id}_gt` }));
    step([{ name: `${id}_h`, fx: "wipe" }, { name: `${id}_ht`, fx: "fade" }, { name: `${id}_g`, fx: "wipe" }, { name: `${id}_gt`, fx: "fade" }], 300);
  });
  const flow = ["Internal design check (SAR-025-400-2-028)", "Interdisciplinary check and review (IDC/IDR)", "Submit to SAR", "SAR review and comments (CRS)", "Contractor updates and resubmits", "SAR Phase Gate Review", "Next stage starts"];
  const fw = 1.6, fg = 0.092;
  s.addText("Workflow at every stage", TX({ x: 0.85, y: 3.62, w: 6, h: 0.28, fontSize: 13, bold: true, color: C.blue, objectName: "wf_h" }));
  step([{ name: "wf_h", fx: "fade" }]);
  flow.forEach((t, i) => {
    const x = 0.85 + i * (fw + fg), id = `wf${i}`;
    sq(s, x, 3.95, fw, 0.9, i === 3 || i === 5 ? C.slate : C.white, `${id}_b`, i === 3 || i === 5 ? C.slate : C.blue);
    s.addText(t, TX({ x: x + 0.07, y: 3.95, w: fw - 0.14, h: 0.9, fontSize: 10.5, bold: true, align: "center", valign: "middle", color: i === 3 || i === 5 ? C.white : C.black, objectName: `${id}_t` }));
    step([{ name: `${id}_b`, fx: "wipe" }, { name: `${id}_t`, fx: "fade" }], 250);
  });
  s.addText("Disciplines that sign off together", TX({ x: 0.85, y: 5.0, w: 6, h: 0.28, fontSize: 13, bold: true, color: C.blue, objectName: "dc_h" }));
  step([{ name: "dc_h", fx: "fade" }]);
  const dc = ["Architecture", "Structures", "Geotechnical", "MEP and fire", "Track", "Signalling and Telecom", "Highways", "Utilities", "Hydrology", "Environmental", "Security (HCIS)", "Safety and RAM"];
  dc.forEach((t, i) => {
    const x = 0.85 + (i % 6) * 1.97, y = 5.32 + Math.floor(i / 6) * 0.38, id = `dc${i}`;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 1.87, h: 0.32, fill: { color: C.tint10 }, line: { color: C.tint10, width: 0 }, rectRadius: 0.08, objectName: id });
    s.addText(t, TX({ x, y, w: 1.87, h: 0.32, align: "center", valign: "middle", fontSize: 10.5, objectName: id + "_t" }));
  });
  step(dc.flatMap((t, i) => [{ name: `dc${i}`, fx: "fade" }, { name: `dc${i}_t`, fx: "fade" }]), 120);
  note(s, "Meetings: weekly design progress and coordination, monthly progress and review, constructability workshops from Preliminary design. Review days are baseline assumptions (B).", 6.15);
  s.addNotes("No design stage starts until the previous one has passed the IDC/IDR sign-off and the SAR Engineering Phase Gate Review. The 14, 21 and 28 day review windows are the baseline assumptions SAR is asked to confirm.");
}

// ============================================================ 6. GATE CONTENT
{
  const s = content("What each design gate must contain", "Documents and approvals needed to pass each gate");
  const cols = [
    ["Gate 1: Concept", "Month 3 | 14 days review", ["Design Basis Reports for all disciplines", "Concept drawings and rough cost estimate", "Review of supplied data and correlation surveys", "DEMP, safety plan, RAM plan and ICP in place"], C.blue],
    ["Gate 2: Preliminary", "Month 6 | 21 days review", ["Preliminary design reports and drawings", "Value engineering proposals", "High-level EIA", "Preliminary hazard analysis, safety case, risk register", "Site, geotechnical and utility survey results", "Stakeholder and permitting consultations; BoQ"], C.midBlue],
    ["Gate 3: Detailed and IFC", "Month 11 | 28 days review", ["Coordinated detailed drawings from survey data", "Final specifications and materials for SAR approval", "Hazards closed to ALARP; residual hazards handed over", "RAM prediction reports", "HCIS and Civil Defense approvals submitted", "Final IDC/IDR and the IFC suite for signature"], C.black],
  ];
  const w = 3.8, g = 0.175;
  cols.forEach((c, i) => {
    const x = 0.85 + i * (w + g), id = `gc${i}`;
    sq(s, x, 1.95, w, 0.85, c[3], `${id}_h`);
    s.addText([{ text: c[0], options: { bold: true, fontSize: 16, breakLine: true } }, { text: c[1], options: { fontSize: 11 } }], TX({ x: x + 0.15, y: 1.95, w: w - 0.3, h: 0.85, color: C.white, valign: "middle", objectName: `${id}_ht` }));
    sq(s, x, 2.8, w, 3.4, C.white, `${id}_b`, C.coolGray);
    s.addText(c[2].map((t, k) => ({ text: t, options: { bullet: { code: "25A0", indent: 14 }, breakLine: k < c[2].length - 1, paraSpaceAfter: 8 } })), TX({ x: x + 0.15, y: 2.92, w: w - 0.3, h: 3.2, fontSize: 12, valign: "top", objectName: `${id}_l` }));
    step([{ name: `${id}_h`, fx: "wipe" }, { name: `${id}_ht`, fx: "fade" }, { name: `${id}_b`, fx: "wipe" }, { name: `${id}_l`, fx: "fade" }], 350);
  });
  note(s, "Source: Scope of Works clauses 20 to 37 (documents, C). Gate months and review days are baseline assumptions (B). Work permit follows Gate 3 by 14 days (Month 12).", 6.35);
  s.addNotes("Documents come from the design phase sections of the scope of work. The Preliminary stage carries the safety case and high-level EIA, which feed the TGA safe-design requirement and the GAMEP permit.");
}

// ============================================================ 7. PERMITS TIMELINE
{
  const s = content("Permits and approvals on the timeline", "Months from Notice to Proceed");
  const rows = [
    ["ICP appointment, DEMP, safety and RAM plans", 1, 2, "B", C.black],
    ["Design stages and SAR gates (M3, M6, M11)", 2, 11, "B", C.blue],
    ["High-level EIA (Preliminary design)", 4, 6, "C", C.midBlue],
    ["Detailed EIA, GAMEP; Environmental Permit for Construction", 7, 11, "C", C.midBlue],
    ["HCIS design approval", 7, 11, "B", C.midBlue],
    ["Civil Defense design approval", 7, 11, "B", C.midBlue],
    ["Utility applications and agreements (SEC 90 days)", 4, 13, "B", C.slate],
    ["Work permit after Gate 3 (14 days)", 12, 12, "B", C.yellow],
    ["Possession booking for track tie-in (30 days)", 20, 21, "B", C.yellow],
    ["Safety assessment (15 days) and trial running", 24, 26, "B", C.red],
    ["Taking-Over certificate (11 days)", 26, 26, "B", C.red],
  ];
  const lx = 0.85, lw = 4.6, x0 = lx + lw + 0.1, x1 = 12.55, W = (x1 - x0) / 26, ry0 = 2.3, rh = 0.36;
  sq(s, x0, 1.95, x1 - x0, 0.28, C.tint10, "ruler");
  for (let m = 1; m <= 26; m++) s.addText(String(m), TX({ x: x0 + (m - 1) * W, y: 1.95, w: W, h: 0.28, fontSize: 9, align: "center", valign: "middle" }));
  s.addText("Activity", TX({ x: lx + 0.35, y: 1.95, w: 3, h: 0.28, fontSize: 10, bold: true, color: C.blue, valign: "middle", objectName: "act_h" }));
  step([{ name: "ruler", fx: "wipe" }, { name: "act_h", fx: "fade" }]);
  rows.forEach((r, i) => {
    const y = ry0 + i * rh, id = `pm${i}`;
    if (i % 2 === 0) sq(s, lx, y, x1 - lx, rh, C.tint05, `${id}_bg`);
    const tg = tag(s, r[3], lx + 0.05, y + 0.07, `${id}_tg`);
    s.addText(r[0], TX({ x: lx + 0.4, y, w: lw - 0.4, h: rh, fontSize: 10.5, valign: "middle", objectName: `${id}_l` }));
    const bx = x0 + (r[1] - 1) * W, bw = (r[2] - r[1] + 1) * W;
    sq(s, bx, y + 0.07, bw, rh - 0.14, r[4], `${id}_b`);
    step([...tg, { name: `${id}_l`, fx: "fade" }, { name: `${id}_b`, fx: "wipe" }], 300);
  });
  [["Gate 1", 3], ["Gate 2", 6], ["Gate 3", 11]].forEach((f, i) => {
    s.addShape(pres.ShapeType.line, { x: x0 + f[1] * W, y: 2.23, w: 0, h: rows.length * rh + 0.07, line: { color: C.slate, width: 1, dashType: "dash" }, objectName: `gl${i}` });
  });
  step([{ name: "gl0", fx: "wipe" }, { name: "gl1", fx: "wipe" }, { name: "gl2", fx: "wipe" }]);
  note(s, NOTE_BASIS + " HCIS, Civil Defense and utility durations are not stated in the scope, so the bars show the planning window, not an authority review time.", 6.45);
  s.addNotes("Bars show when each approval has to be in hand. HCIS and Civil Defense approvals are planned inside the Detailed design stage so the IFC suite can be signed in Month 11. The authority review times are to be confirmed.");
}

// ============================================================ 8. EXECUTION WORKFLOW
{
  const s = content("Execution workflow", "From work permit to installation complete, with SAR hold points");
  const st = [
    ["1", "Work permit", "Issued 14 days after Gate 3, Month 12", "Requires: IFC approved, Environmental Permit, HCIS approval"],
    ["2", "Material submittal and approval", "Submittal and approval tracked separately", "Datasheets, samples, test certificates, shop drawings"],
    ["3", "Method statements and plans", "Approved before the work starts", "Method statement, lift plan, ITP, access plan"],
    ["4", "Inspection requests and hold points", "SAR and ICP witness the critical checks", "Inspection request, checklist, NCR if rejected"],
    ["5", "Installation progress checks", "30%, 60% and 100% of installation (S&T)", "Progress report, interface and integration records"],
    ["6", "Factory Acceptance Test", "Before equipment is shipped", "FAT procedure and signed FAT report"],
    ["7", "Possession for track tie-in", "Booked 30 days ahead with SAR Operations", "Possession request, readiness review, shutdown plan"],
    ["8", "Red-line drawings", "Pre as-built before final acceptance", "Red-line markups, correlation survey differences"],
  ];
  const w = 2.82, g = 0.157, h = 2.05;
  st.forEach((a, i) => {
    const x = 0.85 + (i % 4) * (w + g), y = 1.95 + Math.floor(i / 4) * (h + 0.18), id = `ex${i}`;
    sq(s, x, y, w, h, C.tint05, `${id}_b`, C.coolGray); sq(s, x, y, w, 0.07, i === 6 ? C.yellow : C.blue, `${id}_bar`);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.14, y: y + 0.2, w: 0.42, h: 0.42, fill: { color: C.blue }, line: { color: C.blue, width: 0 }, objectName: `${id}_c` });
    s.addText(a[0], TX({ x: x + 0.14, y: y + 0.2, w: 0.42, h: 0.42, align: "center", valign: "middle", fontSize: 13, bold: true, color: C.white, objectName: `${id}_n` }));
    s.addText(a[1], TX({ x: x + 0.68, y: y + 0.15, w: w - 0.8, h: 0.52, fontSize: 13, bold: true, color: C.blue, valign: "middle", objectName: `${id}_t` }));
    s.addText(a[2], TX({ x: x + 0.14, y: y + 0.78, w: w - 0.28, h: 0.5, fontSize: 11, bold: true, valign: "top", objectName: `${id}_d` }));
    s.addText(a[3], TX({ x: x + 0.14, y: y + 1.3, w: w - 0.28, h: 0.7, fontSize: 10.5, color: C.slate, valign: "top", objectName: `${id}_x` }));
    step([{ name: `${id}_b`, fx: "wipe" }, { name: `${id}_bar`, fx: "wipe" }, { name: `${id}_c`, fx: "fade" }, { name: `${id}_n`, fx: "fade" }, { name: `${id}_t`, fx: "fade" }, { name: `${id}_d`, fx: "fade" }, { name: `${id}_x`, fx: "fade" }], 300);
  });
  note(s, "Source: Scope of Works clauses 22, 28 and the signalling section (C); work permit and possession days are baseline assumptions (B). SAR approval of a submittal does not relieve the contractor of responsibility.", 6.35);
  s.addNotes("Execution is gated by SAR and the ICP. Submittal and approval are separate activities in the baseline so the contractor's preparation time is not confused with SAR's review time.");
}

// ============================================================ 9. TESTING AND VERIFICATION
{
  const s = content("Testing, verification and handover workflow", "Nothing enters operation without the sign-off of every authority");
  const st = [
    ["Factory Acceptance Tests", "Equipment accepted before delivery", C.blue],
    ["Installation complete", "100% installation, inspections closed", C.blue],
    ["System tests", "Station, power, fire, security, IT", C.blue],
    ["Integration tests", "S&T with ETCS Level 2, telecom, track, power", C.blue],
    ["Safety assessment and ICP verification", "15 days in the baseline; about 30 days recommended", C.red],
    ["Trial running", "Operation without passengers", C.slate],
    ["Readiness review", "SAR Operations accepts staff, rules, procedures", C.slate],
    ["Taking-Over certificate", "11 days for SAR to review and issue", C.black],
  ];
  const w = 2.82, g = 0.157, h = 1.55;
  st.forEach((a, i) => {
    const x = 0.85 + (i % 4) * (w + g), y = 1.95 + Math.floor(i / 4) * (h + 0.2), id = `ts${i}`;
    sq(s, x, y, w, h, C.white, `${id}_b`, C.coolGray); sq(s, x, y, 0.09, h, a[2], `${id}_bar`);
    s.addText(String(i + 1), TX({ x: x + 0.22, y: y + 0.1, w: 0.5, h: 0.4, fontSize: 20, bold: true, color: a[2], valign: "middle", objectName: `${id}_n` }));
    s.addText(a[0], TX({ x: x + 0.75, y: y + 0.08, w: w - 0.9, h: 0.5, fontSize: 13, bold: true, valign: "middle", objectName: `${id}_t` }));
    s.addText(a[1], TX({ x: x + 0.22, y: y + 0.7, w: w - 0.4, h: 0.8, fontSize: 11.5, valign: "top", objectName: `${id}_d` }));
    step([{ name: `${id}_b`, fx: "wipe" }, { name: `${id}_bar`, fx: "wipe" }, { name: `${id}_n`, fx: "fade" }, { name: `${id}_t`, fx: "fade" }, { name: `${id}_d`, fx: "fade" }], 300);
  });
  sq(s, 0.85, 5.4, 11.75, 0.95, C.tint10, "ap_bg");
  s.addText([{ text: "Approvals needed before operation: ", options: { bold: true, color: C.blue } }, { text: "SAR (Taking-Over and handover certificates), TGA and the Independent Competent Person (safety), HCIS (security systems), Civil Defense (fire inspection certificate), SEC / NWC / Municipality (permanent connections), GAMEP (environmental compliance). Testing runs from Month 14 to Month 26 in Phase 1 and Month 18 to Month 25 in Phase 2." }],
    TX({ x: 1.0, y: 5.4, w: 11.45, h: 0.95, fontSize: 11.5, valign: "middle", objectName: "ap_t" }));
  step([{ name: "ap_bg", fx: "wipe" }, { name: "ap_t", fx: "fade" }]);
  note(s, "Sources: scope of works signalling and IT sections (C); safety assessment and Taking-Over days from the baseline (B). Trial-running duration and operational readiness criteria are to be confirmed with SAR Operations (T).", 6.45);
  s.addNotes("The 15-day safety assessment is a baseline value; about 30 days is recommended after trial running. If SAR operating rules need changing for the new loop line, the critical change process takes 15 plus 15 days.");
}

// ============================================================ 10. CRITICAL PATH
{
  const s = content("Critical path to operation", "No float: any delay moves the contract completion date");
  const nodes = [
    ["NTP", "Month 1", C.black], ["Gate 1", "Month 3", C.blue], ["Gate 2", "Month 6", C.blue], ["Gate 3", "Month 11", C.blue], ["Work permit", "Month 12", C.yellow],
    ["Track and turnout long-lead supply", "150 to 245 days", C.slate], ["Construction complete", "Month 24", C.blue], ["Safety assessment and trial running", "Month 25", C.red], ["Taking-Over", "Month 26", C.red], ["Operation", "After handover", C.black],
  ];
  const w = 1.13, g = 0.052;
  nodes.forEach((n, i) => {
    const x = 0.85 + i * (w + g), id = `cp${i}`;
    s.addShape(pres.ShapeType.rect, { x, y: 2.1, w, h: 1.45, fill: { color: C.white }, line: { color: n[2], width: 1.5 }, objectName: `${id}_b` });
    sq(s, x, 2.1, w, 0.08, n[2], `${id}_bar`);
    s.addText(n[0], TX({ x: x + 0.05, y: 2.22, w: w - 0.1, h: 0.75, fontSize: 11, bold: true, align: "center", valign: "middle", objectName: `${id}_t` }));
    s.addText(n[1], TX({ x: x + 0.05, y: 2.98, w: w - 0.1, h: 0.5, fontSize: 10.5, color: C.blue, bold: true, align: "center", valign: "middle", objectName: `${id}_m` }));
    step([{ name: `${id}_b`, fx: "wipe" }, { name: `${id}_bar`, fx: "wipe" }, { name: `${id}_t`, fx: "fade" }, { name: `${id}_m`, fx: "fade" }], 300);
  });
  s.addText("Where time can be lost", TX({ x: 0.85, y: 3.85, w: 6, h: 0.3, fontSize: 14, bold: true, color: C.blue, objectName: "wl_h" }));
  step([{ name: "wl_h", fx: "fade" }]);
  const risks = [
    ["Notice to Proceed date", "Not confirmed. Each month of delay moves completion by a month."],
    ["SAR design reviews", "28 days at Gate 3 for 16 packages submitted together."],
    ["Authority approvals", "HCIS, Civil Defense, GAMEP and utility review times are not yet confirmed."],
    ["Long-lead supply", "Track, turnouts, signalling and substation need 150 to 245 days to manufacture."],
    ["Possession and safety assessment", "30 days booking for track tie-in; 15 days for the safety assessment, about 30 recommended."],
    ["Taking-Over", "11 days in the baseline; the last step before operation."],
  ];
  risks.forEach((r, i) => {
    const x = 0.85 + (i % 2) * 5.93, y = 4.22 + Math.floor(i / 2) * 0.72, id = `rk${i}`;
    sq(s, x, y, 5.82, 0.64, i % 2 ? C.white : C.tint05, `${id}_b`, C.coolGray); sq(s, x, y, 0.07, 0.64, C.yellow, `${id}_bar`);
    s.addText([{ text: r[0] + ": ", options: { bold: true, color: C.blue } }, { text: r[1] }], TX({ x: x + 0.2, y, w: 5.5, h: 0.64, fontSize: 11, valign: "middle", objectName: `${id}_t` }));
    step([{ name: `${id}_b`, fx: "wipe" }, { name: `${id}_bar`, fx: "wipe" }, { name: `${id}_t`, fx: "fade" }], 250);
  });
  s.addNotes("The critical path runs through the railway track in Phase 2: Gate 3, procurement and manufacture, installation, then testing, safety assessment and Taking-Over in Month 26.");
}

// ============================================================ 11. DAYS AT A GLANCE
{
  const s = content("Time required at a glance", "Days for each review, permit and approval");
  const rows = [
    ["Concept design review by SAR", "14", "SAR Engineering", "B"],
    ["Preliminary design review by SAR", "21", "SAR Engineering", "B"],
    ["Detailed and IFC design review by SAR", "28", "SAR Engineering", "B"],
    ["Work permit after Gate 3", "14", "SAR", "B"],
    ["SEC permanent power supply agreement", "90 (120 if needed)", "SEC", "B"],
    ["Possession booking for track tie-in", "30", "SAR Operations", "B"],
    ["Safety assessment", "15 (about 30 recommended)", "SAR Safety, ICP", "B"],
    ["Taking-Over certificate review and issue", "11", "SAR", "B"],
    ["Operating-rule change, if the loop line needs one (15 + 15)", "30", "SAR Governance, RBWG", "S"],
    ["SAR functional audit of a project function, planned audit notice", "42 minimum", "SAR SRGC", "S"],
    ["TGA reviews and Independent Competent Person verification", "TBC", "TGA, ICP", "T"],
    ["HCIS, Civil Defense, GAMEP, NWC, Municipality, road authority", "TBC", "Each authority", "T"],
  ];
  const H = (t, al = "left") => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: al, valign: "middle" } });
  const body = rows.map((r, i) => {
    const f = r[3] === "T" ? "FDF3D9" : i % 2 ? C.tint05 : C.white;
    const o = (al, e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 11, align: al, valign: "middle" }, e);
    return [{ text: r[0], options: o("left") }, { text: r[1], options: o("center", { bold: true, color: C.blue }) }, { text: r[2], options: o("left") }, { text: r[3], options: o("center", { bold: true }) }];
  });
  s.addTable([[H("Activity"), H("Days", "center"), H("Owner"), H("Basis", "center")], ...body], { x: 0.85, y: 1.9, w: 11.75, colW: [6.2, 2.1, 2.55, 0.9], rowH: 0.32, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step([{ name: "tbl", fx: "wipe" }]);
  note(s, NOTE_BASIS + " Amber rows are open points.", 6.6);
  s.addNotes("Days are calendar days. The B rows come from our baseline programme and are assumptions SAR is asked to confirm; S rows are from SAR procedures SAR-012-200-02-001 and SAR-012-600-3-001; T rows need the authority's own review time.");
}

// ============================================================ 12. DOCUMENTS
{
  const s = content("Required documents by stage", "What the contractor submits, and who approves it");
  const rows = [
    ["Mobilise and plan", "DEMP, safety management plan, RAM plan, document control procedure, ICP appointment, risk register", "SAR, TGA"],
    ["Design", "Design Basis Reports, drawings and calculations, value engineering proposals, hazard analysis and safety case, high-level EIA, RAM prediction reports, meeting terms of reference and minutes, IDC/IDR sheets", "SAR (phase gates), ICP"],
    ["Permits", "Detailed EIA, HCIS design approval, Civil Defense approval, utility applications and agreements, junction approval, work permit and possession requests", "GAMEP, HCIS, Civil Defense, utilities, SAR"],
    ["Execution", "Material submittals, shop and fabrication drawings, method statements, lift plans, ITPs, inspection requests, FAT procedures and reports, NCRs, red-line drawings", "SAR, ICP"],
    ["Test and handover", "Test procedures and reports, safety assessment, trial running report, as-built drawings, O&M manuals with spare parts list, Taking-Over and handover certificates", "SAR, TGA, HCIS, Civil Defense"],
  ];
  const H = (t) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.blue }, fontFace: F, fontSize: 11, align: "left", valign: "middle" } });
  const body = rows.map((r, i) => {
    const f = i % 2 ? C.tint05 : C.white;
    const o = (e = {}) => Object.assign({ fill: { color: f }, color: C.black, fontFace: F, fontSize: 11, align: "left", valign: "middle" }, e);
    return [{ text: r[0], options: o({ bold: true, color: C.blue }) }, { text: r[1], options: o() }, { text: r[2], options: o() }];
  });
  s.addTable([[H("Stage"), H("Documents and forms"), H("Approved by")], ...body], { x: 0.85, y: 1.9, w: 11.75, colW: [1.9, 7.3, 2.55], rowH: 0.68, border: { pt: 0.5, color: C.coolGray }, objectName: "tbl" });
  step([{ name: "tbl", fx: "wipe" }]);
  note(s, "Source: Scope of Works clauses 20, 22, 24, 25, 34 to 37, 45 and the signalling deliverables list (C).", 6.55);
  s.addNotes("Clause 22 also requires SAR approval of documents and drawings before execution, as-built drawings to SAR standards, and O&M manuals with a spare parts list. The operating-rule change forms SAR-012-200-4-001 and 4-003 apply only if the new station needs an operating rule change.");
}

// ============================================================ 13. NEXT STEPS
{
  const s = content("Next steps and open points", "What to start now and what SAR is asked to confirm");
  s.addText("Start at Notice to Proceed", TX({ x: 0.85, y: 1.95, w: 5.7, h: 0.32, fontSize: 15, bold: true, color: C.blue, objectName: "ns_h" }));
  step([{ name: "ns_h", fx: "fade" }]);
  const ns = ["Appoint the Independent Competent Person", "Submit the DEMP, safety and RAM plans", "Agree IDC/IDR terms of reference and gate dates with SAR", "Open the authority files: GAMEP, HCIS, Civil Defense, SEC, NWC, Municipality", "Request the TGA guidance review times", "Book the geotechnical and survey campaigns"];
  ns.forEach((t, i) => {
    const y = 2.4 + i * 0.66, id = `ns${i}`;
    s.addShape(pres.ShapeType.ellipse, { x: 0.85, y: y + 0.07, w: 0.4, h: 0.4, fill: { color: C.blue }, line: { color: C.blue, width: 0 }, objectName: `${id}_c` });
    s.addText(String(i + 1), TX({ x: 0.85, y: y + 0.07, w: 0.4, h: 0.4, align: "center", valign: "middle", fontSize: 12, bold: true, color: C.white, objectName: `${id}_n` }));
    s.addText(t, TX({ x: 1.4, y, w: 5.2, h: 0.55, fontSize: 12.5, valign: "middle", objectName: `${id}_t` }));
    step([{ name: `${id}_c`, fx: "fade" }, { name: `${id}_n`, fx: "fade" }, { name: `${id}_t`, fx: "fade" }], 250);
  });
  sq(s, 6.95, 1.95, 5.65, 4.1, C.tint05, "op_bg", C.coolGray); sq(s, 6.95, 1.95, 5.65, 0.5, C.yellow, "op_hd");
  s.addText("SAR to confirm", TX({ x: 7.15, y: 1.95, w: 5.2, h: 0.5, fontSize: 15, bold: true, valign: "middle", objectName: "op_ht" }));
  const op = ["Review times of TGA and of the Independent Competent Person", "HCIS and Civil Defense review times", "Whether the ICP must be in place before the first design submission", "Design review windows: 14, 21 and 28 days", "Possession windows and safety assessment duration", "Trial-running duration and operational readiness criteria", "Notice to Proceed date"];
  s.addText(op.map((t, k) => ({ text: t, options: { bullet: { code: "25A0", indent: 14 }, breakLine: k < op.length - 1, paraSpaceAfter: 8 } })), TX({ x: 7.15, y: 2.65, w: 5.25, h: 3.3, fontSize: 13, valign: "top", objectName: "op_l" }));
  step([{ name: "op_bg", fx: "wipe" }, { name: "op_hd", fx: "wipe" }, { name: "op_ht", fx: "fade" }, { name: "op_l", fx: "fade" }], 350);
  s.addNotes("These open points turn the T and B items in the previous slides into confirmed days. Once confirmed, the baseline programme is updated in one revision.");
}

// ============================================================ 14. END
{
  const s = pres.addSlide(); page += 1;
  S.endSlide(s, { text: "Thank You" });
  step([{ name: "t:Thank You", fx: "fade" }]);
}

fs.writeFileSync("anim.json", JSON.stringify(ANIM));
pres.writeFile({ fileName: "stage.pptx" }).then(() => console.log("built " + page));
