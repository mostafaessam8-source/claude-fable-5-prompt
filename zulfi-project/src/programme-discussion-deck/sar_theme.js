/**
 * sar_theme.js — SAR brand constants and helpers for pptxgenjs builds.
 * Colors and type scale follow the SAR Mini Brand Guidelines V01-2021.
 * Copy next to your build script and `const T = require("./sar_theme.js");`
 */

// ---------- Palette (the ONLY approved values) ----------
const C = {
  // Primary
  blue:        "00778B",   // Pantone 3145 C
  black:       "3D3935",   // Pantone Black 7 C
  // Secondary
  slate:       "768692",   // 7544 C
  sky:         "59CBE8",   // 305 C
  midBlue:     "71B2C9",   // 7458 C
  coolGray:    "C8C9C7",   // Cool Gray 3 C
  // Complementary (presentations, infographics, graphs)
  red:         "CB2C30",   // 711 C
  yellow:      "F1B434",   // 143 C
  // Neutral + approved SAR Blue tints (backgrounds only)
  white:       "FFFFFF",
  tint05:      "F2F8F9",
  tint10:      "E6F1F4",
};

// Status coding for schedule / project reporting
const STATUS = {
  onTrack:   C.blue,
  atRisk:    C.yellow,
  delayed:   C.red,
  complete:  C.slate,
  neutral:   C.coolGray,
};

// Chart series order
const CHART_COLORS = [C.blue, C.midBlue, C.sky, C.slate, C.yellow, C.red];

// ---------- Typography ----------
const F_EN = "Diodrum Arabic";   // Latin + numerals
const F_AR = "29LT Kaff";        // Arabic
const SIZE = { h1: 32, h2: 22, body: 14, small: 11, tiny: 9 };  // pt

// ---------- Layout ----------
const SLIDE = { w: 13.33, h: 7.5 };
const AREA  = { x: 0.72, y: 1.18, r: 12.61, b: 6.9 };   // usable inner content area

// ---------- Helpers ----------

/** Ratio-preserving logo box. Pass the native pixel dims once, get {w,h}. */
function logoBox(nativeW, nativeH, h) {
  return { w: +(h * nativeW / nativeH).toFixed(3), h };
}

/** Minimum clear space around a logo of height h, per the x-height rule. */
function clearSpace(h, lockup /* "mark" | "lockup" */) {
  return lockup === "mark" ? h : +(0.6 * h).toFixed(3);
}

/** Table options with the brand header/border treatment. */
function tableOpts(colW) {
  return {
    colW,
    border: { pt: 0.5, color: C.coolGray },
    fontFace: F_EN,
    fontSize: SIZE.small,
    color: C.black,
    valign: "middle",
  };
}
function headerRow(cells) {
  return cells.map(t => ({
    text: t,
    options: { fill: { color: C.blue }, color: C.white, bold: true, fontFace: F_EN },
  }));
}

/** Arabic text options — RTL, right aligned, brand Arabic face. */
function ar(extra = {}) {
  return Object.assign({ fontFace: F_AR, rtlMode: true, align: "right" }, extra);
}

/** Guard: throw if a build script uses a color outside the palette. */
const ALLOWED = new Set(Object.values(C));
function assertColor(hex) {
  const h = String(hex).replace("#", "").toUpperCase();
  if (!ALLOWED.has(h)) throw new Error(`Non-brand color: ${h} — use a value from sar_theme.C`);
  return h;
}

module.exports = {
  C, STATUS, CHART_COLORS, F_EN, F_AR, SIZE, SLIDE, AREA,
  logoBox, clearSpace, tableOpts, headerRow, ar, assertColor,
};
