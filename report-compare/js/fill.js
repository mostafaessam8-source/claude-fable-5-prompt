/* Report Compare — the fill handle's brain (Excel's "drag to fill").
 * fillVector(vec, n, copyOnly) → n results for the n cells that follow `vec` (in the direction of the fill):
 *   { src: i, value: null }               copy source cell i (a formula is shifted by the caller)
 *   { src: i, value: { k, v } }           a calculated value: the next number / date / "Item 7" of a series
 * Rules, like Excel's: two or more numbers (dates) with a constant step continue the series; a single number is copied;
 * text that ends in a number is counted up ("PW-104" → "PW-105", "Week 09" → "Week 10"); everything else repeats.
 * Pure logic, no DOM: runs in the browser and in Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fill = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isNum(c) { return !!c && c.k === 'n' && c.f == null; }
  function tail(c) { var m = c && c.k === 's' && c.f == null ? /^([\s\S]*?)(\d+)$/.exec(c.v) : null; return m ? { head: m[1], num: +m[2], width: m[2].length, pad: m[2].charAt(0) === '0' && m[2].length > 1 } : null; }
  function tidy(x) { return parseFloat(x.toPrecision(12)); }
  function constantStep(nums) {
    if (nums.length < 2) return null;
    var step = nums[1] - nums[0];
    for (var i = 2; i < nums.length; i++) if (Math.abs((nums[i] - nums[i - 1]) - step) > 1e-9 * Math.max(1, Math.abs(step))) return null;
    return step;
  }
  function fillVector(vec, n, copyOnly) {
    var out = [], len = vec.length, i;
    if (!len) return out;
    var step = null, kind = null;
    if (!copyOnly) {
      if (vec.every(isNum) && len >= 2) { step = constantStep(vec.map(function (c) { return c.v; })); if (step !== null) kind = 'num'; }
      else if (len === 1 && tail(vec[0])) { kind = 'txt'; step = 1; }
      else if (len >= 2 && vec.every(function (c) { return !!tail(c); })) {
        var t = vec.map(tail), same = t.every(function (x) { return x.head === t[0].head; }), s2 = constantStep(t.map(function (x) { return x.num; }));
        if (same && s2 !== null) { kind = 'txt'; step = s2; }
      }
    }
    for (i = 0; i < n; i++) {
      var src = i % len;
      if (kind === 'num') out.push({ src: src, value: { k: 'n', v: tidy(vec[len - 1].v + step * (i + 1)) } });
      else if (kind === 'txt') {
        var tl = tail(vec[len - 1]), nv = tl.num + step * (i + 1);
        if (nv < 0) out.push({ src: src, value: null });
        else { var ds = String(nv); if (tl.pad) while (ds.length < tl.width) ds = '0' + ds; out.push({ src: src, value: { k: 's', v: tl.head + ds } }); }
      } else out.push({ src: src, value: null });
    }
    return out;
  }
  return { fillVector: fillVector };
});
