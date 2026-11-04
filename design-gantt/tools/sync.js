/* node design-gantt/tools/sync.js <downloaded.xlsx> <output.xlsx>
 * Turns the workbook downloaded from the online (SharePoint) tracker into tracker-latest/…LATEST_Gantt.xlsx:
 * the Tracker sheet exactly as it is online, plus a freshly generated live Gantt sheet. Fails loudly (non-zero exit) if the
 * download is not a tracker workbook, so a sign-in page can never overwrite the latest file. */
'use strict';
const fs = require('fs');
const path = require('path');
const JSZip = require('../vendor/jszip.min.js');
const M = require('../js/model.js');
const X = require('../js/xlsxgantt.js');

(async () => {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) throw new Error('usage: sync.js <downloaded.xlsx> <output.xlsx>');
  const buf = fs.readFileSync(src);
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('The download is not an Excel file (no zip header). The online link is probably not "Anyone with the link can view".');
  const zip = await JSZip.loadAsync(buf);
  const model = await M.readWorkbook(zip); // throws a clear error if this is not the Design Submission Tracker
  if (!model.projects.length) throw new Error('No project rows were read from the Tracker sheet.');
  const res = await X.build(zip, model, { scale: 'week', sourceName: path.basename(out) });
  fs.writeFileSync(out, res.bytes);
  console.log('synced: ' + model.projects.length + ' projects, ' + model.stats.elements + ' elements, ' + res.bytes.length + ' bytes');
})().catch((e) => { console.error('SYNC FAILED: ' + (e && e.message ? e.message : e)); process.exit(1); });
