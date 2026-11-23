/**
 * sar_layouts.js — SAR official-template layouts built on the diagonal "track" motif.
 * Requires sar_theme.js in the same folder. All geometry is for LAYOUT_WIDE (13.33x7.5").
 *
 * init(pres, assets) -> layout API
 *   assets = { logo, logoWhite, logoRatio, photos: {name: b64} }  (b64 = "image/png;base64,....")
 */
const T = require("./sar_theme.js");
const C = T.C;

function init(pres, A) {
  const R = A.logoRatio || 3.5;               // native w/h of the lock-up
  const box = (h) => ({ w: +(h * R).toFixed(3), h });

  /** Diagonal wedge used to cut a photo or lay a band. corner = TL|TR|BL|BR (filled corner) */
  function wedge(slide, { x, y, w, h, corner = "TL", color = C.white, transparency }) {
    const flip = { BL: {}, BR: { flipH: true }, TL: { flipV: true }, TR: { flipH: true, flipV: true } }[corner];
    const fill = transparency == null ? { color } : { color, transparency };
    slide.addShape(pres.ShapeType.rtTriangle, Object.assign({ x, y, w, h, fill, line: { color, width: 0 } }, flip));
  }

  /**
   * Diagonal band whose angle exactly matches a photo cut: two parallel wedges.
   * axis "x" for a vertical-ish cut, "y" for a horizontal-ish cut.
   */
  function diagBand(slide, { x, y, w, h, corner = "TR", thickness = 0.28, axis = "x", band = C.blue, bg = C.white }) {
    const dx = axis === "x" ? (corner.includes("R") ? -thickness : thickness) : 0;
    const dy = axis === "y" ? (corner.includes("T") ? thickness : -thickness) : 0;
    wedge(slide, { x: x + dx, y: y + dy, w, h, corner, color: band });
    wedge(slide, { x, y, w, h, corner, color: bg });
  }

  /** One slanted track stripe. lean = "right" | "left" (direction the top edge leans). */
  function stripe(slide, { x, y, w, h, color = C.blue, lean = "right", transparency }) {
    const fill = transparency == null ? { color } : { color, transparency };
    slide.addShape(pres.ShapeType.parallelogram,
      Object.assign({ x, y, w, h, fill, line: { color, width: 0 } }, lean === "left" ? { flipH: true } : {}));
  }

  /** The converging two-stripe track motif (cover band, end slide). */
  function trackMotif(slide, { cx = 6.665, y, h, color = C.white, gap = 1.5, w = 0.75, transparency }) {
    stripe(slide, { x: cx - gap / 2 - w, y, w, h, color, lean: "right", transparency });
    stripe(slide, { x: cx + gap / 2, y, w, h, color, lean: "left", transparency });
  }

  /** Standard chrome for every content slide: logo, breadcrumb, page no., baseline rule. */
  function chrome(slide, { breadcrumb = "", page = null, onDark = false } = {}) {
    const lg = box(0.30);
    slide.addImage({ data: onDark ? (A.logoWhite || A.logo) : A.logo, x: 0.45, y: 0.30, w: lg.w, h: lg.h });
    if (breadcrumb) slide.addText(breadcrumb, {
      x: 7.4, y: 0.30, w: 5.5, h: 0.25, align: "right", fontSize: T.SIZE.tiny,
      color: onDark ? C.white : C.slate, fontFace: T.F_EN, margin: 0,
    });
    if (page != null) slide.addText(String(page), {
      x: 12.4, y: 0.58, w: 0.5, h: 0.25, align: "right", fontSize: T.SIZE.tiny,
      color: onDark ? C.white : C.slate, fontFace: T.F_EN, margin: 0,
    });
    if (!onDark) {
      slide.addShape(pres.ShapeType.line, { x: 0.45, y: 6.95, w: 12.43, h: 0, line: { color: C.blue, width: 1 } });
      slide.addShape(pres.ShapeType.ellipse, { x: 12.6, y: 6.83, w: 0.24, h: 0.24,
        fill: { color: C.white }, line: { color: C.blue, width: 1 } });
    }
  }

  /** Slide title with the small diagonal accent to its left. */
  function title(slide, text, sub) {
    stripe(slide, { x: 0.45, y: 0.92, w: 0.20, h: 0.52, color: C.blue });
    slide.addText(text, { x: 0.85, y: 0.88, w: 9.5, h: 0.5, fontSize: T.SIZE.h2, bold: true,
      color: C.blue, fontFace: T.F_EN, margin: 0, valign: "middle" });
    if (sub) slide.addText(sub, { x: 0.85, y: 1.34, w: 9.5, h: 0.3, fontSize: T.SIZE.small,
      color: C.slate, fontFace: T.F_EN, margin: 0 });
  }

  // ---------- Slide layouts ----------

  /** Cover: white field, centered logo + title, diagonal photo band across the bottom. */
  function cover(slide, { photo, titleText, subtitle, meta }) {
    const lg = box(0.62);
    if (photo) {
      slide.addImage({ data: photo, x: 0, y: 3.30, w: 13.33, h: 4.20, sizing: { type: "cover", w: 13.33, h: 4.20 } });
      slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 3.32, fill: { color: C.white }, line: { color: C.white, width: 0 } });
      diagBand(slide, { x: 0, y: 3.30, w: 13.33, h: 1.25, corner: "TL", axis: "y", thickness: 0.16 });
      trackMotif(slide, { y: 3.95, h: 3.55, color: C.white, gap: 8.2, w: 0.55, transparency: 25 });
    } else {
      trackMotif(slide, { y: 3.60, h: 3.90, color: C.blue, gap: 8.2, w: 0.55 });
    }
    slide.addImage({ data: A.logo, x: (13.33 - lg.w) / 2, y: 0.55, w: lg.w, h: lg.h });
    slide.addText(titleText, { x: 1.4, y: 1.55, w: 10.5, h: 0.75, align: "center",
      fontSize: T.SIZE.h1, bold: true, color: C.blue, fontFace: T.F_EN, margin: 0 });
    if (subtitle) slide.addText(subtitle, { x: 1.4, y: 2.32, w: 10.5, h: 0.4, align: "center",
      fontSize: T.SIZE.h2, color: C.slate, fontFace: T.F_EN, margin: 0 });
    if (meta) slide.addText(meta, { x: 1.4, y: 2.80, w: 10.5, h: 0.3, align: "center",
      fontSize: T.SIZE.small, color: C.black, fontFace: T.F_EN, margin: 0 });
    slide.addText("SAR.COM.SA", { x: 9.6, y: 6.95, w: 3.3, h: 0.3, align: "right",
      fontSize: T.SIZE.tiny, color: C.white, bold: true, fontFace: T.F_EN, margin: 0 });
  }

  /** Section divider: photo (or solid) with a diagonal SAR Blue field carrying the title. */
  function sectionDivider(slide, { photo, kicker, titleText, page }) {
    if (photo) slide.addImage({ data: photo, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: "cover", w: 13.33, h: 7.5 } });
    else slide.background = { color: C.midBlue };
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 5.6, h: 7.5, fill: { color: C.blue } });
    wedge(slide, { x: 5.6, y: 0, w: 2.6, h: 7.5, corner: "BL", color: C.blue });
    stripe(slide, { x: 7.35, y: 0, w: 0.5, h: 7.5, color: C.sky, lean: "left", transparency: 25 });
    chrome(slide, { page, onDark: true });
    if (kicker) slide.addText(kicker, { x: 0.85, y: 2.55, w: 4.4, h: 0.3, fontSize: T.SIZE.small,
      color: C.white, charSpacing: 2, fontFace: T.F_EN, margin: 0 });
    slide.addText(titleText, { x: 0.85, y: 2.95, w: 4.5, h: 1.6, fontSize: 28, bold: true,
      color: C.white, fontFace: T.F_EN, margin: 0 });
    slide.addText("SAR.COM.SA", { x: 0.85, y: 6.85, w: 3, h: 0.3, fontSize: T.SIZE.tiny,
      color: C.white, fontFace: T.F_EN, margin: 0 });
  }

  /** Split: photo panel on the left with a diagonal edge, text on the right. */
  function splitPhoto(slide, { photo, titleText, sub, body, breadcrumb, page }) {
    chrome(slide, { breadcrumb, page });
    slide.addImage({ data: photo, x: 0, y: 1.75, w: 6.3, h: 4.95, sizing: { type: "cover", w: 6.3, h: 4.95 } });
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 6.70, w: 6.6, h: 0.20, fill: { color: C.white }, line: { color: C.white, width: 0 } });
    diagBand(slide, { x: 5.00, y: 1.75, w: 1.65, h: 4.95, corner: "TR", axis: "x", thickness: 0.26 });
    title(slide, titleText, sub);
    const items = (Array.isArray(body) ? body : [body]).map(b => ({
      text: typeof b === "string" ? b : b.text,
      options: { bullet: { code: "25A0", indent: 18 }, breakLine: true, paraSpaceAfter: 8 },
    }));
    slide.addText(items, { x: 6.85, y: 1.95, w: 5.7, h: 4.6, fontSize: T.SIZE.body, color: C.black,
      fontFace: T.F_EN, lineSpacingMultiple: 1.25, margin: 0 });
  }

  /** Plain content slide — table, chart or text goes in AREA. */
  function content(slide, { titleText, sub, breadcrumb, page }) {
    chrome(slide, { breadcrumb, page });
    title(slide, titleText, sub);
    return { x: 0.85, y: 1.85, w: 11.75, h: 4.85 };
  }

  /** Row of KPI / topic tiles, each with a diagonal colored head. */
  function tiles(slide, items) {
    const n = items.length, gap = 0.28, w = (11.75 - gap * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = 0.85 + i * (w + gap), col = it.color || C.blue;
      slide.addShape(pres.ShapeType.rect, { x, y: 2.0, w, h: 2.9, fill: { color: C.white },
        line: { color: C.coolGray, width: 0.75 } });
      slide.addShape(pres.ShapeType.rect, { x, y: 2.0, w, h: 0.95, fill: { color: col }, line: { color: col, width: 0 } });
      wedge(slide, { x: x + w - 0.9, y: 2.0, w: 0.9, h: 0.95, corner: "BR", color: C.white, transparency: 82 });
      slide.addText(it.value, { x: x + 0.15, y: 2.05, w: w - 0.3, h: 0.85, fontSize: 24, bold: true,
        color: C.white, fontFace: T.F_EN, valign: "middle", margin: 0 });
      slide.addText(it.label, { x: x + 0.15, y: 3.05, w: w - 0.3, h: 0.4, fontSize: T.SIZE.body, bold: true,
        color: C.blue, fontFace: T.F_EN, margin: 0 });
      slide.addText(it.note || "", { x: x + 0.15, y: 3.48, w: w - 0.3, h: 1.3, fontSize: T.SIZE.small,
        color: C.black, fontFace: T.F_EN, margin: 0 });
    });
  }

  /** Closing slide: SAR Blue field with the white track motif. */
  function endSlide(slide, { text = "Thank You" } = {}) {
    slide.background = { color: C.blue };
    trackMotif(slide, { y: 3.55, h: 3.95, color: C.white, gap: 3.6, w: 1.0 });
    const lg = box(0.55);
    slide.addImage({ data: A.logoWhite || A.logo, x: (13.33 - lg.w) / 2, y: 4.55, w: lg.w, h: lg.h });
    slide.addText(text, { x: 0, y: 2.15, w: 13.33, h: 0.9, align: "center", fontSize: T.SIZE.h1 + 4,
      bold: true, color: C.white, fontFace: T.F_EN, margin: 0 });
    slide.addText("SAR.COM.SA", { x: 0, y: 6.75, w: 13.33, h: 0.3, align: "center",
      fontSize: T.SIZE.tiny, color: C.white, fontFace: T.F_EN, margin: 0 });
  }

  return { wedge, diagBand, stripe, trackMotif, chrome, title, cover, sectionDivider, splitPhoto, content, tiles, endSlide, box };
}

module.exports = { init };
