#!/usr/bin/env node
/*
 * Cache-busting: stamps every local CSS/JS link in index.html with ?v=<version>, so browsers
 * (and GitHub Pages' 10-minute cache) fetch the new files after each release.
 *
 *   node tools/stamp-version.js            # version = current date-time
 */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "index.html");
const v = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12); // yyyymmddhhmm
let html = fs.readFileSync(file, "utf8");
html = html.replace(/((?:src|href)="(?:assets|data)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g, `$1?v=${v}"`);
html = html.replace(/window\.SAR_VERSION = "[^"]*"/, `window.SAR_VERSION = "${v}"`);
fs.writeFileSync(file, html);
console.log("index.html stamped with v=" + v);
