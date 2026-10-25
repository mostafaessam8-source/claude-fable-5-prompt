/* P6 Web – extra coloured icons for the Tools / Enterprise / Admin menus. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const B = '#2f6fc4', LB = '#a9cdf2', G = '#3e9b3e', LG = '#9ad99a', R = '#d03a2f', Y = '#f1c232', DY = '#b98a12', GR = '#8d939c', LGR = '#dfe3e8', DK = '#2b3340', O = '#ef8a24', W = '#fff', PU = '#7a55c4';
  const key = (c = Y) => `<circle cx="8" cy="9" r="4.5" fill="${c}" stroke="${DY}" stroke-width="1.1"/><circle cx="8" cy="9" r="1.5" fill="${W}"/><path d="M11 12l9 8M16 17l2-2M18 19l2-2" stroke="${DY}" stroke-width="2" stroke-linecap="round"/>`;
  const person = (c = B) => `<circle cx="12" cy="8" r="4" fill="#f2c9a0" stroke="#a9763f" stroke-width=".8"/><path d="M4.5 21c0-5 3.2-7.5 7.5-7.5s7.5 2.5 7.5 7.5z" fill="${c}" stroke="${DK}" stroke-width=".8"/>`;
  const page = `<path d="M5 3h9l5 5v13H5z" fill="${W}" stroke="${GR}" stroke-width="1.2"/>`;
  const clock = `<circle cx="9" cy="9" r="7" fill="${W}" stroke="${R}" stroke-width="2"/><path d="M9 5v4.5l3 2" fill="none" stroke="${DK}" stroke-width="1.5"/>`;
  const tick = `<path d="M13 16l3.5 3.5L22 12" fill="none" stroke="${G}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const globe = `<circle cx="12" cy="12" r="9.5" fill="${B}" stroke="${DK}" stroke-width=".8"/><path d="M6 8c3-3 6 0 5 3s-4 2-3 6M14 6c3 1 5 3 5 6-2 0-4-1-4 2" fill="${G}" stroke="${G}"/>`;
  const grid = (c = B) => `<rect x="3" y="4" width="18" height="16" fill="${W}" stroke="${c}" stroke-width="1.3"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16" stroke="${c}" stroke-width="1"/><rect x="3" y="4" width="18" height="5" fill="${c}"/>`;
  P6.addIcons({
    mi_levelres: `<rect x="3" y="14" width="4" height="7" fill="${B}"/><rect x="9" y="8" width="4" height="13" fill="${B}"/><rect x="15" y="11" width="4" height="10" fill="${B}"/><path d="M2 12h20" stroke="${R}" stroke-width="2"/>${clock}`.replace(clock, ''),
    applyact: `${page}${clock.replace('r="7"', 'r="6"')}${tick}`.replace(clock.replace('r="7"', 'r="6"'), ''),
    recalc: `<ellipse cx="9" cy="17" rx="6" ry="3" fill="${Y}" stroke="${DY}"/><ellipse cx="9" cy="13" rx="6" ry="3" fill="${Y}" stroke="${DY}"/><ellipse cx="9" cy="9" rx="6" ry="3" fill="${Y}" stroke="${DY}"/><path d="M14 18a6 6 0 0 0 7-7" fill="none" stroke="${G}" stroke-width="2.4"/><path d="M21 7v6h-6z" fill="${G}"/>`,
    summarize: `<rect x="3" y="3" width="18" height="18" fill="${W}" stroke="${GR}"/><text x="7" y="18" font-size="16" font-weight="700" fill="${B}" font-family="Arial">Σ</text>`,
    storeperiod: `<rect x="4" y="3" width="16" height="18" fill="${W}" stroke="${GR}"/><path d="M7 8h10M7 12h10M7 16h6" stroke="${B}" stroke-width="1.4"/><path d="M15 17l2 2 4-5" fill="none" stroke="${G}" stroke-width="2"/>`,
    disreorg: `<rect x="3" y="4" width="18" height="16" fill="${LGR}" stroke="${GR}"/><rect x="5" y="7" width="8" height="3" fill="${B}"/><rect x="5" y="12" width="12" height="3" fill="${B}"/>`,
    gchange: globe,
    visualizer: `<rect x="3" y="4" width="18" height="16" fill="${W}" stroke="${GR}"/><rect x="5" y="7" width="6" height="4" fill="${R}"/><rect x="13" y="7" width="6" height="4" fill="${B}"/><rect x="5" y="13" width="6" height="4" fill="${G}"/><rect x="13" y="13" width="6" height="4" fill="${Y}"/>`,
    reportwiz: `<path d="M5 3h10l4 4v14H5z" fill="${W}" stroke="${GR}"/><path d="M8 9h7M8 12h7" stroke="${GR}"/><path d="M4 21l9-9" stroke="${Y}" stroke-width="2.4"/><path d="M13 5v3M11.5 6.5h3" stroke="${O}" stroke-width="1.6"/>`,
    checker: `<path d="M3 8h7l2 2h9v10H3z" fill="${Y}" stroke="${DY}"/>${tick}`,
    publish: `<rect x="3" y="9" width="12" height="11" fill="${LB}" stroke="${B}"/><circle cx="16" cy="8" r="6" fill="${G}" stroke="${DK}" stroke-width=".8"/><path d="M10 8h12M16 2c-3 4-3 8 0 12M16 2c3 4 3 8 0 12" fill="none" stroke="${W}" stroke-width=".9"/>`,
    topdown: `<rect x="3" y="3" width="18" height="4" fill="${B}"/><rect x="6" y="9" width="15" height="4" fill="${LB}" stroke="${B}"/><rect x="9" y="15" width="12" height="4" fill="${LB}" stroke="${B}"/><path d="M2 12v8" stroke="${R}" stroke-width="2"/>`,
    eps: `<rect x="3" y="3" width="9" height="6" fill="${Y}" stroke="${DY}"/><rect x="12" y="10" width="9" height="5" fill="${LB}" stroke="${B}"/><rect x="12" y="17" width="9" height="5" fill="${LB}" stroke="${B}"/><path d="M7 9v10h5M7 12h5" fill="none" stroke="${GR}"/>`,
    tracking: `<rect x="3" y="3" width="18" height="18" fill="${W}" stroke="${GR}"/><path d="M5 17l4-5 3 3 5-8" fill="none" stroke="${R}" stroke-width="2"/><path d="M5 19h14" stroke="${B}" stroke-width="2"/>`,
    portfolios: `<rect x="3" y="8" width="18" height="12" rx="2" fill="#8a6a45" stroke="${DK}" stroke-width=".8"/><path d="M8 8V5.5h8V8" fill="none" stroke="${DK}" stroke-width="1.4"/>`,
    obs: `<g transform="translate(-2 0) scale(.8)">${person(B)}</g><path d="M15 12v5M12 17h8M12 17v3M20 17v3" stroke="${DK}" stroke-width="1.3" fill="none"/>`,
    rescodes: `<g transform="translate(-2 -1) scale(.8)">${person(B)}</g><g transform="translate(9 9) scale(.6)">${key()}</g>`,
    projcodes: `${page}<g transform="translate(8 9) scale(.6)">${key()}</g>`,
    actcodes: `<rect x="3" y="4" width="14" height="5" fill="${G}" stroke="${DK}" stroke-width=".7"/><g transform="translate(5 6) scale(.8)">${key()}</g>`,
    rolecodes: `<g transform="translate(-2 -1) scale(.8)">${person(G)}</g><g transform="translate(9 9) scale(.6)">${key()}</g>`,
    asgcodes: `<g transform="translate(-2 -1) scale(.8)">${person(O)}</g><g transform="translate(9 9) scale(.6)">${key()}</g>`,
    udfico: `<rect x="3" y="4" width="18" height="16" fill="${W}" stroke="${GR}"/><path d="M5 9h14M5 14h14" stroke="${B}"/><text x="6" y="19" font-size="9" font-weight="700" fill="${R}" font-family="Arial">UDF</text>`.replace('y="19"', 'y="12.5"'),
    storedimg: `<rect x="3" y="4" width="18" height="16" fill="${LB}" stroke="${B}"/><path d="M3 18l6-7 4 4 3-3 5 6z" fill="${G}"/><circle cx="16" cy="9" r="2" fill="${Y}"/>`,
    calendars2: `<rect x="3" y="5" width="18" height="16" fill="${W}" stroke="${B}" stroke-width="1.2"/><rect x="3" y="5" width="18" height="4" fill="${B}"/><path d="M8 3v4M16 3v4" stroke="${DK}" stroke-width="1.6"/><path d="M6 12h3M11 12h3M16 12h2M6 16h3M11 16h3" stroke="${GR}" stroke-width="1.6"/>`,
    shifts: `<g transform="translate(-3 -1) scale(.8)">${person(B)}</g><circle cx="16" cy="16" r="6" fill="${W}" stroke="${B}" stroke-width="1.4"/><path d="M16 12v4l2 1" fill="none" stroke="${B}" stroke-width="1.4"/>`,
    steptpl: `<rect x="4" y="3" width="16" height="18" fill="${W}" stroke="${GR}"/><path d="M7 7l1.5 1.5L11 6M7 12l1.5 1.5L11 11M7 17l1.5 1.5L11 16M13 7.5h5M13 12.5h5M13 17.5h5" fill="none" stroke="${G}" stroke-width="1.4"/>`,
    funding: `<circle cx="9" cy="9" r="6" fill="${Y}" stroke="${DY}"/><circle cx="14" cy="15" r="6" fill="${Y}" stroke="${DY}"/><text x="12" y="19" font-size="9" font-weight="700" fill="${DK}" font-family="Arial">$</text>`,
    curves: `<path d="M3 20h18M3 20V4" stroke="${DK}" stroke-width="1.4" fill="none"/><path d="M4 18c4 0 5-12 8-12s4 12 8 12" fill="none" stroke="${B}" stroke-width="2.2"/>`,
    extapps: `<rect x="3" y="5" width="18" height="14" fill="${W}" stroke="${GR}"/><path d="M3 9h18" stroke="${GR}"/><path d="M11 17l6-6M13 11h4v4" fill="none" stroke="${B}" stroke-width="2"/>`,
    adminprefs: `<circle cx="12" cy="12" r="9" fill="${G}" stroke="${DK}" stroke-width=".8"/><circle cx="12" cy="12" r="3" fill="${W}"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="${DK}" stroke-width="2"/>`,
    admincat: `<circle cx="12" cy="12" r="9.5" fill="${B}" stroke="${DK}" stroke-width=".8"/><path d="M6 9c3-3 7-1 6 2s-4 3-3 6" fill="${G}" stroke="${G}"/><circle cx="17" cy="17" r="5" fill="${Y}" stroke="${DY}"/>`,
    currency: `<circle cx="9" cy="9" r="6" fill="${Y}" stroke="${DY}"/><circle cx="15" cy="15" r="6" fill="${LG}" stroke="${G}"/><text x="12.5" y="19" font-size="9" font-weight="700" fill="${DK}" font-family="Arial">$</text>`,
    finperiod: `<rect x="3" y="4" width="18" height="17" fill="${W}" stroke="${B}"/><rect x="3" y="4" width="18" height="4" fill="${Y}"/><path d="M6 12h12M6 16h12M9 8v13M15 8v13" stroke="${GR}"/>`,
    actdetails: `<path d="M5 3h9l5 5v13H5z" fill="${W}" stroke="${B}" stroke-width="1.2"/><path d="M8 11h8M8 14h8M8 17h5" stroke="${GR}"/><circle cx="16" cy="17" r="4" fill="${LB}" stroke="${DK}" stroke-width="1.3"/>`,
    barsico2: `<rect x="3" y="5" width="12" height="4" fill="${B}" stroke="${DK}" stroke-width=".6"/><rect x="7" y="11" width="14" height="4" fill="${G}" stroke="${DK}" stroke-width=".6"/><rect x="3" y="17" width="10" height="4" fill="${Y}" stroke="${DK}" stroke-width=".6"/>`
  });
})(window);
