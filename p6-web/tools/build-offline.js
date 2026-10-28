#!/usr/bin/env node
/* Builds ONE self-contained HTML file (CSS + all scripts inlined, no network needed) named with the version:
   node tools/build-offline.js [outDir] [commit]   ->  <outDir>/P6-Web-v<VERSION>-offline.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.resolve(process.argv[2] || path.join(root, 'offline'));
let commit = process.argv[3] || process.env.GITHUB_SHA || '';
if (!commit) { try { commit = require('child_process').execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { commit = 'dev'; } }
commit = commit.slice(0, 7);
const ver = (/VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(root, 'js/version.js'), 'utf8')) || [])[1];
if (!ver) throw new Error('VERSION not found in js/version.js');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, h) => '<style>\n' + fs.readFileSync(path.join(root, h), 'utf8') + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, s) => {
  let js = fs.readFileSync(path.join(root, s), 'utf8');
  if (s === 'js/version.js') js = js.replace("P6.COMMIT = 'dev'", `P6.COMMIT = '${commit}'`).replace('P6.OFFLINE = false', 'P6.OFFLINE = true');
  return '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('unresolved external reference');
html = html.replace('<head>', `<head>\n<!-- P6 Web – Schedule Studio v${ver} (${commit}) – offline single-file build -->`);
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `P6-Web-v${ver}-offline.html`);
fs.writeFileSync(file, html);
console.log(`${file}  (${(html.length / 1024).toFixed(0)} KB)  v${ver} ${commit}`);
