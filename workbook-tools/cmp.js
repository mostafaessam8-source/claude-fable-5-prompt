const fs = require("fs"), path = require("path");
const root = process.argv[2];
const XLSX = require(path.join(root, "node_modules/xlsx")), JSZip = require(path.join(root, "node_modules/jszip"));
const I = require(path.join(root, "assets/js/importer.js"));
(async () => {
  const old = await I.parseWorkbook(fs.readFileSync(process.argv[3]), XLSX, JSZip);
  const nw = await I.parseWorkbook(fs.readFileSync(process.argv[4]), XLSX, JSZip);
  const wkOld = await I.parseWorkbook(fs.readFileSync(process.argv[5]), XLSX, JSZip);
  console.log("old:", old.source, "new:", nw.source, "combined:", nw.combined, "extra:", (nw.extra || []).map(e => e.source));
  console.log("weekly report:", nw.report.map(r => r.table + ":" + r.rows + ":" + r.status).join(" "));
  // weekly tables identical?
  for (const t of Object.keys(wkOld.tables)) {
    const a = JSON.stringify(wkOld.tables[t]), b = JSON.stringify(nw.tables[t]);
    if (a !== b) console.log("WEEKLY DIFF", t, (wkOld.tables[t] || []).length, (nw.tables[t] || []).length);
  }
  const plan = nw.extra[0];
  const keyOf = { Spending_Plan: r => r["ID"] + "|" + r["Month"], KPI_Projects_Data: r => r["Code"] === "-" ? "-" + r["KPI Code"] : r["Code"], NSR_Project_Data: r => r["ID"],
    KPI_Summary: r => r["KPI Code"], Delivery_KPI: r => r["Project Code"] };
  for (const t of Object.keys(old.tables)) {
    const A = old.tables[t], B = plan.tables[t] || [];
    console.log("\n==", t, "old rows", A.length, "new rows", B.length);
    if (!keyOf[t]) continue;
    const bm = {}; B.forEach(r => bm[keyOf[t](r)] = r);
    const diffs = {};
    A.forEach(r => {
      const b = bm[keyOf[t](r)];
      if (!b) { diffs["<row missing>"] = (diffs["<row missing>"] || []).concat(keyOf[t](r)); return; }
      Object.keys(r).forEach(k => {
        let x = r[k], y = b[k];
        if (typeof x === "number" && typeof y === "number" ? Math.abs(x - y) > 0.01 : String(x == null ? "" : x).trim() !== String(y == null ? "" : y).trim())
          (diffs[k] = diffs[k] || []).push(keyOf[t](r) + ": " + JSON.stringify(x) + " → " + JSON.stringify(y));
      });
    });
    Object.keys(diffs).forEach(k => console.log("  ", k, diffs[k].length, diffs[k].slice(0, 3).join(" ; ")));
  }
})().catch(e => { console.error(e); process.exit(1); });
