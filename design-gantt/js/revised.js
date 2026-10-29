/* Revised Detailed Design Submission Schedule — NSR Mitigation Measures, Phase 2 (18 culverts), issued 26-Oct-2026.
 * Source: Revised_Design_Submission_Schedule_NSR_P2_20261026.pdf. Dates are ISO (YYYY-MM-DD). */
(function (root) {
  var O = 'Open Cut', R = 'To be Re-submitted', U = 'Under SAR Review';
  var GEO = 'Subject to completion of additional requested geotechnical investigation';
  root.REVISED = {
    title: 'Revised Detailed Design Submission Schedule — Phase 2 Culverts (18 No’s)',
    project: 'NSR Mitigation Measures - Phase 2',
    issued: '2026-10-26',
    reviewDays: 15, // SAR review period assumed where the Tracker has no usable Approval Date (the Tracker's own rows use 14–16 days)
    items: [
      { sr: 1, name: 'ZRL 635+825', rev: 'A0', sub: '2026-07-11', method: O, shutdown: 'TBD', status: U },
      { sr: 2, name: 'ZRL 274+361', rev: 'A0', sub: '2026-10-16', method: O, shutdown: 'TBD', status: U },
      { sr: 3, name: 'ZRL 630+086', rev: 'A0', sub: '2026-10-16', method: O, shutdown: 'TBD', status: U },
      { sr: 4, name: 'ZRL 630+571.5', rev: 'A0', sub: '2026-10-16', method: O, shutdown: 'TBD', status: U },
      { sr: 5, name: 'ZRL 322+400', rev: 'A0', sub: '2026-10-19', method: O, shutdown: 'TBD', status: U },
      { sr: 6, name: 'ZRL 4+275', rev: 'B0', sub: '2026-10-20', method: 'Increase Headwall by 0.15 m', shutdown: 'TBD', status: U },
      { sr: 7, name: 'ZRL 3+500', rev: 'B0', sub: '2026-11-06', method: O, shutdown: 'TBD', status: R },
      { sr: 10, name: 'ZRL 322+150', rev: 'B0', sub: '2026-11-06', method: O, shutdown: 'TBD', status: R },
      { sr: 8, name: 'ZRL 317+425', rev: 'B0', sub: '2026-11-13', method: O, shutdown: 'TBD', status: R },
      { sr: 9, name: 'ZRL 317+475', rev: 'B0', sub: '2026-11-13', method: O, shutdown: 'TBD', status: R },
      { sr: 11, name: 'ZRL 323+075', rev: 'B0', sub: '2026-11-20', method: O, shutdown: 'TBD', status: R },
      { sr: 12, name: 'ZRL 323+675', rev: 'B0', sub: '2026-11-20', method: O, shutdown: 'TBD', status: R },
      { sr: 13, name: 'ZRL 441+750', rev: 'B0', sub: '2026-11-27', method: O, shutdown: 'TBD', status: R },
      { sr: 14, name: 'ZRL 622+669.50', rev: 'B0', sub: '2026-11-27', method: O, shutdown: 'TBD', status: R },
      { sr: 15, name: 'ZRL 3+700', rev: 'B0', sub: '2026-12-04', method: O, shutdown: 'TBD', status: R, critical: GEO },
      { sr: 16, name: 'ZRL 3+750', rev: 'B0', sub: '2026-12-04', method: O, shutdown: 'TBD', status: R, critical: GEO },
      { sr: 17, name: 'RHL 197+725', rev: 'B0', sub: '2026-12-11', method: O, shutdown: 'TBD', status: R, critical: GEO },
      { sr: 18, name: 'RHL 191+650', rev: 'B0', sub: '2026-12-11', method: O, shutdown: 'TBD', status: R, critical: GEO }
    ]
  };
})(typeof self !== 'undefined' ? self : this);
