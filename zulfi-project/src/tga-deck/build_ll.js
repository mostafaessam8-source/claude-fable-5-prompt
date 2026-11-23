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
pres.title = "Zulfi Train Station - Long-Lead Items";
pres.author = "Saudi Arabia Railways (SAR)";
const S = L.init(pres, { logo, logoWhite, logoRatio: 420 / 127 });
const F = T.F_EN;
const TX = (o = {}) => Object.assign({ fontFace: F, margin: 0, isTextBox: true, color: C.black }, o);
const ANIM = {};
let page = 0;
function step(list, gap) { if (gap) list[0].gap = gap; (ANIM[page] = ANIM[page] || []).push(list); }
const BC = "Zulfi Train Station | Long-Lead Items";
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


// ============================================================ 1. WHAT AND WHEN
{
  const s = content("Long-lead items", "Five packages worth SAR 50.5 M, half of the contract value, decide the programme");
  const kp = [["5 packages", "Track, signalling, turnouts, substation, generator"], ["SAR 50.5 M", "50.5% of the SAR 99.999 M contract"], ["150 to 245 days", "Manufacture time, before shipping"], ["Month 7 and 11", "Procurement start: Phase 1 and Phase 2"]];
  const tw = 2.8, gx = 0.183;
  kp.forEach((k, i) => {
    const x = 0.85 + i * (tw + gx), y = 1.9, id = `k${i}`;
    sq(s, x, y, tw, 1.2, C.tint05, `${id}_bg`, C.coolGray); sq(s, x, y, tw, 0.07, i === 2 ? C.yellow : C.blue, `${id}_bar`);
    s.addText(k[0], TX({ x: x + 0.15, y: y + 0.13, w: tw - 0.3, h: 0.55, fontSize: 22, bold: true, color: C.blue, valign: "middle", objectName: `${id}_v` }));
    s.addText(k[1], TX({ x: x + 0.15, y: y + 0.72, w: tw - 0.3, h: 0.4, fontSize: 11, valign: "top", objectName: `${id}_l` }));
    step([{ name: `${id}_bg`, fx: "wipe" }, { name: `${id}_bar`, fx: "wipe" }, { name: `${id}_v`, fx: "fade" }, { name: `${id}_l`, fx: "fade" }]);
  });
  const rows = [
    ["Railway Track, loop line 2,500 m", "7.2", "Phase 2", 21.9, "Month 11-22", "Critical path: no float to the contract completion date", C.red],
    ["Signalling and Telecommunication", "6.2", "Phase 1", 14.9, "Month 7-18", "ETCS Level 2 equipment; Factory Acceptance Tests and integration", C.blue],
    ["Railway Turnouts", "7.3", "Phase 1", 9.0, "Month 7-18", "Switches and crossings made to design; tie-in needs a 30-day possession", C.blue],
    ["Substation and SEC works", "4.1", "Phase 1", 3.69, "Month 7-18", "Power for testing; SEC supply agreement takes about 90 days", C.blue],
    ["Generator room", "4.3", "Phase 2", 0.99, "Month 11-22", "Generator set made to order; needed before system testing", C.slate],
  ];
  const cx = [0.85, 3.85, 4.95, 7.75, 9.15], hy = 3.3, ry = 3.62, rh = 0.56;
  [["Package", cx[0], 2.9], ["BOQ", cx[1], 1.0], ["Value, SAR M", cx[2], 2.7], ["Procurement", cx[3], 1.3], ["Why it is long-lead", cx[4], 3.45]].forEach((h, i) => {
    sq(s, h[1], hy, h[2], 0.28, C.blue, `lh${i}`);
    s.addText(h[0], TX({ x: h[1] + 0.08, y: hy, w: h[2] - 0.1, h: 0.28, fontSize: 10.5, bold: true, color: C.white, valign: "middle", objectName: `lh${i}_t` }));
  });
  step([...[0, 1, 2, 3, 4].flatMap(i => [{ name: `lh${i}`, fx: "wipe" }, { name: `lh${i}_t`, fx: "fade" }])]);
  rows.forEach((r, i) => {
    const y = ry + i * rh, id = `r${i}`;
    sq(s, 0.85, y, 11.75, rh - 0.04, i % 2 ? C.white : C.tint05, `${id}_bg`, C.coolGray);
    s.addText(r[0], TX({ x: cx[0] + 0.08, y, w: 2.85, h: rh - 0.04, fontSize: 11.5, bold: true, valign: "middle", objectName: `${id}_n` }));
    s.addText(`${r[1]} | ${r[2]}`, TX({ x: cx[1] + 0.02, y, w: 1.1, h: rh - 0.04, fontSize: 10.5, valign: "middle", objectName: `${id}_p` }));
    const bw = Math.max(r[3] / 21.9 * 2.0, 0.08);
    sq(s, cx[2], y + 0.14, bw, rh - 0.32, r[6], `${id}_b`);
    s.addText(r[3].toFixed(1), TX({ x: cx[2] + bw + 0.08, y, w: 0.6, h: rh - 0.04, fontSize: 11, bold: true, color: C.blue, valign: "middle", objectName: `${id}_v` }));
    s.addText(r[4], TX({ x: cx[3] + 0.05, y, w: 1.3, h: rh - 0.04, fontSize: 10.5, valign: "middle", objectName: `${id}_w` }));
    s.addText(r[5], TX({ x: cx[4] + 0.08, y, w: 3.3, h: rh - 0.04, fontSize: 9.5, valign: "middle", objectName: `${id}_y` }));
    step([{ name: `${id}_bg`, fx: "wipe" }, { name: `${id}_n`, fx: "fade" }, { name: `${id}_p`, fx: "fade" }, { name: `${id}_b`, fx: "wipe" }, { name: `${id}_v`, fx: "fade" }, { name: `${id}_w`, fx: "fade" }, { name: `${id}_y`, fx: "fade" }], 300);
  });
  s.addText("Months count from the Notice to Proceed; the date is not yet confirmed. The 150 to 245 days is the baseline range for the group. Per-package lead times are to be confirmed from supplier quotations. Values from the contract BOQ.", TX({ x: 0.85, y: 6.5, w: 11.75, h: 0.4, fontSize: 10, color: C.slate, valign: "top", objectName: "note" }));
  step([{ name: "note", fx: "fade" }]);
  s.addNotes("Five BOQ items are long-lead: railway track, signalling and telecommunication, turnouts, the substation and SEC works, and the generator room. Together they are SAR 50.479 M, about 50.5% of the contract. Phase 1 procurement starts in Month 7 and Phase 2 in Month 11.");
}

// ============================================================ 2. WORKFLOW AND ACTIONS
{
  const s = content("Protecting the long-lead schedule", "From technical submittal to installation, with the actions that keep the dates");
  const st = [
    ["1", "Technical submittal", "Datasheets, drawings, test plans", "Contractor"],
    ["2", "SAR approval", "Tracked separately from the submittal", "SAR"],
    ["3", "Purchase order", "Placed as soon as approval is given", "Contractor"],
    ["4", "Manufacture", "150 to 245 days", "Supplier"],
    ["5", "Factory Acceptance Test", "Witnessed before shipping", "SAR, contractor"],
    ["6", "Shipping and delivery", "Customs, transport, site storage", "Supplier"],
    ["7", "Installation and testing", "Track, signalling and power", "Contractor"],
  ];
  const w = 1.6, g = 0.092;
  st.forEach((a, i) => {
    const x = 0.85 + i * (w + g), id = `fl${i}`;
    sq(s, x, 1.95, w, 1.9, i === 3 ? C.yellow : C.white, `${id}_b`, i === 3 ? C.yellow : C.blue); sq(s, x, 1.95, w, 0.07, i === 3 ? C.black : C.blue, `${id}_bar`);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.1, y: 2.13, w: 0.38, h: 0.38, fill: { color: C.blue }, line: { color: C.blue, width: 0 }, objectName: `${id}_c` });
    s.addText(a[0], TX({ x: x + 0.1, y: 2.13, w: 0.38, h: 0.38, align: "center", valign: "middle", fontSize: 12, bold: true, color: C.white, objectName: `${id}_n` }));
    s.addText(a[1], TX({ x: x + 0.08, y: 2.58, w: w - 0.16, h: 0.55, fontSize: 11.5, bold: true, valign: "middle", objectName: `${id}_t` }));
    s.addText(a[2], TX({ x: x + 0.08, y: 3.14, w: w - 0.16, h: 0.45, fontSize: 10, valign: "top", objectName: `${id}_d` }));
    s.addText(a[3], TX({ x: x + 0.08, y: 3.52, w: w - 0.16, h: 0.28, fontSize: 10, bold: true, color: i === 3 ? C.black : C.blue, objectName: `${id}_o` }));
    step([{ name: `${id}_b`, fx: "wipe" }, { name: `${id}_bar`, fx: "wipe" }, { name: `${id}_c`, fx: "fade" }, { name: `${id}_n`, fx: "fade" }, { name: `${id}_t`, fx: "fade" }, { name: `${id}_d`, fx: "fade" }, { name: `${id}_o`, fx: "fade" }], 300);
  });
  const cols = [
    ["Actions that protect the dates", C.blue, ["Prepare technical submittals during Detailed design so approval is ready on the order date", "Order each package as soon as SAR approves it, without waiting for the other packages", "Book Factory Acceptance Test and witness dates with SAR early", "Track every package monthly in a long-lead tracker and report it to SAR", "Plan shipping, customs and site storage before the order is placed", "Align turnout delivery with the 30-day possession booking"]],
    ["What puts the dates at risk", C.red, ["Notice to Proceed delay: procurement starts later by the same time", "SAR approval time on the technical submittals", "Supplier slip: railway track has no float to the contract completion date", "Late delivery against the Month 12 construction start", "Shipping and customs delay on rail and signalling equipment", "Late possession for the tie-in to the main line"]],
  ];
  cols.forEach((c, i) => {
    const x = 0.85 + i * 5.93, id = `cl${i}`;
    sq(s, x, 4.05, 5.82, 0.42, c[1], `${id}_h`);
    s.addText(c[0], TX({ x: x + 0.15, y: 4.05, w: 5.5, h: 0.42, fontSize: 13, bold: true, color: C.white, valign: "middle", objectName: `${id}_ht` }));
    sq(s, x, 4.47, 5.82, 2.0, C.white, `${id}_b`, C.coolGray);
    s.addText(c[2].map((t, k) => ({ text: t, options: { bullet: { code: "25A0", indent: 12 }, breakLine: k < c[2].length - 1, paraSpaceAfter: 3 } })), TX({ x: x + 0.15, y: 4.52, w: 5.5, h: 1.9, fontSize: 10.5, valign: "top", objectName: `${id}_l` }));
    step([{ name: `${id}_h`, fx: "wipe" }, { name: `${id}_ht`, fx: "fade" }, { name: `${id}_b`, fx: "wipe" }, { name: `${id}_l`, fx: "fade" }], 350);
  });
  s.addNotes("The long-lead workflow starts with the technical submittal, which SAR approves before the purchase order. Manufacture takes 150 to 245 days for the group. Actions on the left reduce the risk on the right; the main exposure is railway track, which has no float to the contract completion date.");
}

fs.writeFileSync("anim.json", JSON.stringify(ANIM));
pres.writeFile({ fileName: "stage_ll.pptx" }).then(() => console.log("built " + page));
