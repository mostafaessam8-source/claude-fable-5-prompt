/* P6 Web – small coloured icon set in the style of Primavera P6's toolbars. */
(function (g) {
  'use strict';
  const P6 = g.P6;
  const B = '#2f6fc4', LB = '#a9cdf2', G = '#3e9b3e', LG = '#9ad99a', R = '#d03a2f', Y = '#f1c232', DY = '#b98a12', GR = '#8d939c', LGR = '#dfe3e8', DK = '#2b3340', O = '#ef8a24', W = '#fff', PU = '#7a55c4';
  const page = (x = 5, y = 3, w = 14, h = 18) => `<path d="M${x} ${y}h${w - 5}l5 5v${h - 5}H${x}z" fill="${W}" stroke="${GR}" stroke-width="1.2"/><path d="M${x + w - 5} ${y}v5h5" fill="${LGR}" stroke="${GR}" stroke-width="1"/>`;
  const folder = (c = Y, d = DY) => `<path d="M2.5 6.5h7l2 2.2h10v10.8h-19z" fill="${c}" stroke="${d}" stroke-width="1.1"/><path d="M2.5 10.5h19v9h-19z" fill="${c}" stroke="${d}" stroke-width="1.1" opacity=".9"/>`;
  const plus = (cx, cy, c = G) => `<circle cx="${cx}" cy="${cy}" r="4.6" fill="${c}"/><path d="M${cx - 2.6} ${cy}h5.2M${cx} ${cy - 2.6}v5.2" stroke="${W}" stroke-width="1.8"/>`;
  const person = (c = B) => `<circle cx="12" cy="8" r="4" fill="#f2c9a0" stroke="#a9763f" stroke-width=".8"/><path d="M4.5 21c0-5 3.2-7.5 7.5-7.5s7.5 2.5 7.5 7.5z" fill="${c}" stroke="${DK}" stroke-width=".8"/>`;
  const bar = (x, y, w, c = G) => `<rect x="${x}" y="${y}" width="${w}" height="4.5" rx="1" fill="${c}" stroke="${DK}" stroke-opacity=".6" stroke-width=".8"/>`;
  const mag = (extra = '') => `<circle cx="10" cy="10" r="6" fill="${LB}" fill-opacity=".6" stroke="${DK}" stroke-width="1.6"/><path d="M14.5 14.5l6 6" stroke="${DK}" stroke-width="2.4" stroke-linecap="round"/>${extra}`;
  const arrowC = (flip, c = B) => `<path d="M${flip ? 21 : 3} 9h-9a0 0 0 0 0 0 0" fill="none"/><path d="M${flip ? 20 : 4} 14a8 8 0 0 ${flip ? 0 : 1} ${flip ? -14 : 14} -2" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/><path d="M${flip ? 20.5 : 3.5} 4v7h${flip ? -7 : 7}z" fill="${c}"/>`;
  const I = {
    print: `<rect x="6" y="3" width="12" height="6" fill="${W}" stroke="${GR}"/><rect x="3" y="9" width="18" height="8" rx="1.5" fill="${GR}" stroke="${DK}" stroke-width=".8"/><rect x="6" y="14" width="12" height="7" fill="${W}" stroke="${GR}"/><circle cx="18" cy="11.5" r="1" fill="${G}"/>`,
    preview: `${page(4, 2, 13, 17)}<circle cx="15" cy="15" r="5" fill="${LB}" fill-opacity=".7" stroke="${DK}" stroke-width="1.5"/><path d="M18.8 18.8l3.5 3.5" stroke="${DK}" stroke-width="2.2" stroke-linecap="round"/>`,
    pagesetup: `${page(4, 2, 14, 19)}<path d="M8 9h7M8 12h7M8 15h4" stroke="${GR}" stroke-width="1.2"/><circle cx="17" cy="17" r="4" fill="${Y}" stroke="${DY}"/><circle cx="17" cy="17" r="1.3" fill="${W}"/>`,
    printsetup: `<rect x="6" y="3" width="12" height="6" fill="${W}" stroke="${GR}"/><rect x="3" y="9" width="18" height="8" rx="1.5" fill="${GR}" stroke="${DK}" stroke-width=".8"/><rect x="6" y="14" width="12" height="7" fill="${W}" stroke="${GR}"/><circle cx="19" cy="19" r="3.5" fill="${Y}" stroke="${DY}"/>`,
    newproj: `${folder()}${plus(18, 18)}`,
    open: `<path d="M2.5 7h7l2 2.2h9.5v10.3h-18.5z" fill="${DY}"/><path d="M2.5 19.5l3-8.5h17.5l-3 8.5z" fill="${Y}" stroke="${DY}" stroke-width="1.1"/>`,
    closeall: `${folder(LGR, GR)}<path d="M13 13l7 7M20 13l-7 7" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/>`,
    import: `${page(5, 3, 14, 18)}<path d="M12 6v8M8.5 11l3.5 4 3.5-4" fill="none" stroke="${B}" stroke-width="2.6" stroke-linecap="round"/><path d="M8 19h8" stroke="${B}" stroke-width="2.4"/>`,
    export: `${page(5, 3, 14, 18)}<path d="M12 16V8M8.5 11l3.5-4 3.5 4" fill="none" stroke="${B}" stroke-width="2.6" stroke-linecap="round"/><path d="M8 19h8" stroke="${B}" stroke-width="2.4"/>`,
    send: `<rect x="2.5" y="5" width="19" height="14" rx="1.5" fill="${W}" stroke="${GR}" stroke-width="1.2"/><path d="M3 6l9 7 9-7" fill="none" stroke="${B}" stroke-width="1.8"/>`,
    portfolio: `<rect x="3" y="8" width="18" height="12" rx="2" fill="#8a6a45" stroke="${DK}" stroke-width=".8"/><path d="M8 8V5.5h8V8" fill="none" stroke="${DK}" stroke-width="1.4"/><path d="M3 13h18" stroke="${DK}" stroke-opacity=".6"/>`,
    commit: `<path d="M4 3h13l3 3v15H4z" fill="${B}" stroke="${DK}" stroke-width=".9"/><rect x="7" y="3" width="9" height="6" fill="${LGR}"/><rect x="7" y="13" width="10" height="8" fill="${W}"/><path d="M15 17l2 2 4-5" fill="none" stroke="${G}" stroke-width="2.4" stroke-linecap="round"/>`,
    refresh: `<path d="M19 12a7 7 0 0 1-12 5" fill="none" stroke="${G}" stroke-width="2.8" stroke-linecap="round"/><path d="M5 12a7 7 0 0 1 12-5" fill="none" stroke="${G}" stroke-width="2.8" stroke-linecap="round"/><path d="M19.5 3v6h-6z" fill="${G}"/><path d="M4.5 21v-6h6z" fill="${G}"/>`,
    recent: `${folder()}<circle cx="17" cy="17" r="5" fill="${W}" stroke="${B}" stroke-width="1.6"/><path d="M17 14v3.2l2 1.2" fill="none" stroke="${B}" stroke-width="1.5"/>`,
    exit: `<path d="M4 3h9v18H4z" fill="${DY}" stroke="${DK}" stroke-width=".9"/><path d="M13 12h8M18 8l4 4-4 4" fill="none" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/>`,
    save: `<path d="M4 3h13l3 3v15H4z" fill="${B}" stroke="${DK}" stroke-width=".9"/><rect x="7" y="3" width="9" height="6" fill="${LGR}"/><rect x="7" y="13" width="10" height="8" fill="${W}"/>`,
    undo: arrowC(0), redo: arrowC(1),
    add: `${bar(2, 10, 17, G)}${plus(18, 6)}`,
    mile: `<path d="M12 2.5l8 9.5-8 9.5-8-9.5z" fill="${B}" stroke="${DK}" stroke-width="1"/>`,
    wbs: `${folder()}<rect x="13" y="12" width="8" height="3" fill="${W}" stroke="${GR}"/><rect x="13" y="17" width="8" height="3" fill="${W}" stroke="${GR}"/>`,
    wbsadd: `${folder()}${plus(18, 18)}`,
    del: `<path d="M5 5l14 14M19 5L5 19" stroke="${R}" stroke-width="4" stroke-linecap="round"/>`,
    copy: `${page(3, 2, 12, 16)}<path d="M9 8h9l3 3v11H9z" fill="${W}" stroke="${B}" stroke-width="1.3"/>`,
    cut: `<path d="M7 3l9 12M17 3L8 15" stroke="${GR}" stroke-width="2" stroke-linecap="round"/><circle cx="7" cy="18" r="3.2" fill="none" stroke="${R}" stroke-width="2.2"/><circle cx="17" cy="18" r="3.2" fill="none" stroke="${R}" stroke-width="2.2"/>`,
    paste: `<rect x="3" y="4" width="13" height="17" rx="1.5" fill="#d9b27a" stroke="${DK}" stroke-width=".9"/><rect x="6" y="2" width="7" height="4" rx="1" fill="${GR}"/><path d="M10 9h9l3 3v10H10z" fill="${W}" stroke="${B}" stroke-width="1.3"/>`,
    indent: `<path d="M3 5h18M11 10h10M11 15h10M3 20h18" stroke="${DK}" stroke-width="1.8"/><path d="M3 9l5 3.5L3 16z" fill="${B}"/>`,
    outdent: `<path d="M3 5h18M11 10h10M11 15h10M3 20h18" stroke="${DK}" stroke-width="1.8"/><path d="M8 9l-5 3.5L8 16z" fill="${B}"/>`,
    link: `<rect x="2" y="9" width="10" height="6" rx="3" fill="none" stroke="${G}" stroke-width="2.6"/><rect x="12" y="9" width="10" height="6" rx="3" fill="none" stroke="${G}" stroke-width="2.6"/>`,
    unlink: `<rect x="2" y="8" width="9" height="6" rx="3" fill="none" stroke="${GR}" stroke-width="2.6"/><rect x="13" y="10" width="9" height="6" rx="3" fill="none" stroke="${GR}" stroke-width="2.6"/><path d="M4 21L20 3" stroke="${R}" stroke-width="2.4"/>`,
    calc: `<rect x="4" y="2" width="16" height="20" rx="2" fill="#c8ced6" stroke="${DK}" stroke-width=".9"/><rect x="6.5" y="4.5" width="11" height="5" fill="#b9e6b0" stroke="${DK}" stroke-width=".6"/><g fill="${DK}"><circle cx="8" cy="13" r="1.2"/><circle cx="12" cy="13" r="1.2"/><circle cx="16" cy="13" r="1.2"/><circle cx="8" cy="17" r="1.2"/><circle cx="12" cy="17" r="1.2"/><circle cx="16" cy="17" r="1.2" fill="${R}"/></g>`,
    update: `<circle cx="10" cy="12" r="7.5" fill="${W}" stroke="${GR}" stroke-width="1.2"/><path d="M10 7v5l3.5 2" fill="none" stroke="${DK}" stroke-width="1.6"/><path d="M15 21a8 8 0 0 0 7-8" fill="none" stroke="${G}" stroke-width="2.6" stroke-linecap="round"/><path d="M23 9l-1 6-5-3z" fill="${G}"/>`,
    baseline: `${folder(LB, B)}<path d="M13 4v10M13 4h8l-2 3 2 3h-8" fill="${R}" stroke="${R}" stroke-width="1.4"/>`,
    spot: `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="${Y}" stroke="${DY}" stroke-width="1.1"/>`,
    report: `<rect x="3" y="3" width="18" height="18" fill="${W}" stroke="${GR}" stroke-width="1.2"/><rect x="6" y="12" width="3.2" height="6" fill="${B}"/><rect x="10.5" y="8" width="3.2" height="10" fill="${R}"/><rect x="15" y="10" width="3.2" height="8" fill="${G}"/>`,
    calendar: `<rect x="3" y="4" width="18" height="17" rx="1.5" fill="${W}" stroke="${GR}" stroke-width="1.2"/><rect x="3" y="4" width="18" height="5" fill="${R}"/><path d="M8 2v4M16 2v4" stroke="${DK}" stroke-width="1.6"/><g fill="${B}"><rect x="6" y="11" width="3" height="3"/><rect x="10.5" y="11" width="3" height="3"/><rect x="15" y="11" width="3" height="3"/><rect x="6" y="15.5" width="3" height="3"/><rect x="10.5" y="15.5" width="3" height="3"/></g>`,
    resources: person(), people: `${person(B)}<g transform="translate(5 3) scale(.7)">${person(G)}</g>`,
    columns: `<rect x="2.5" y="4" width="19" height="16" fill="${W}" stroke="${GR}" stroke-width="1.2"/><rect x="2.5" y="4" width="19" height="4" fill="${B}"/><path d="M9 4v16M15.5 4v16M2.5 12h19" stroke="${GR}"/>`,
    filter: `<path d="M3 4h18l-7 8.5V20l-4-2v-5.5z" fill="${B}" stroke="${DK}" stroke-width=".9"/>`,
    zin: `${mag()}<path d="M7 10h6M10 7v6" stroke="${DK}" stroke-width="1.8"/>`, zout: `${mag()}<path d="M7 10h6" stroke="${DK}" stroke-width="1.8"/>`,
    fit: `${mag()}<rect x="7" y="7" width="6" height="6" fill="none" stroke="${DK}" stroke-width="1.4"/>`,
    today: `<rect x="3" y="4" width="18" height="17" rx="1.5" fill="${W}" stroke="${GR}" stroke-width="1.2"/><rect x="3" y="4" width="18" height="5" fill="${B}"/><circle cx="12" cy="15" r="3.4" fill="${R}"/>`,
    critical: `${bar(2, 9, 20, R)}<path d="M5 18h14" stroke="${R}" stroke-width="2"/>`,
    table: `<rect x="2.5" y="4" width="19" height="16" fill="${W}" stroke="${B}" stroke-width="1.4"/><rect x="2.5" y="4" width="19" height="4" fill="${LB}" stroke="${B}"/><path d="M2.5 12h19M2.5 16h19M9 4v16" stroke="${B}"/>`,
    gantt: `<rect x="2.5" y="4" width="19" height="16" fill="${W}" stroke="${GR}" stroke-width="1.2"/><rect x="4" y="6.5" width="8" height="3" fill="${B}"/><rect x="8" y="11" width="9" height="3" fill="${G}"/><rect x="12" y="15.5" width="8" height="3" fill="${R}"/>`,
    ganttTable: `<rect x="2.5" y="4" width="19" height="16" fill="${W}" stroke="${B}" stroke-width="1.4"/><path d="M10 4v16M2.5 8h19" stroke="${B}"/><rect x="11.5" y="10" width="5" height="2.5" fill="${G}"/><rect x="14" y="14.5" width="6" height="2.5" fill="${R}"/><path d="M4 11h4M4 15h4" stroke="${GR}"/>`,
    network: `<rect x="2" y="3" width="8" height="5" fill="${LB}" stroke="${B}"/><rect x="14" y="10" width="8" height="5" fill="${LG}" stroke="${G}"/><rect x="2" y="16" width="8" height="5" fill="${LB}" stroke="${B}"/><path d="M10 5.5h2v7h2M10 18.5h2v-6" fill="none" stroke="${DK}"/>`,
    trace: `<path d="M3 17l5-6 4 3 8-9" fill="none" stroke="${B}" stroke-width="2.2"/><path d="M20 5l-.5 5-4-3z" fill="${B}"/><circle cx="3.5" cy="17" r="2" fill="${G}"/>`,
    details: `${page(4, 2, 15, 20)}<path d="M7 9h9M7 12h9M7 15h6" stroke="${B}" stroke-width="1.4"/>`,
    activities: `${bar(2, 9, 18, G)}`, assign: `${bar(2, 7, 16, G)}<circle cx="18" cy="16" r="3" fill="none" stroke="${Y}" stroke-width="2"/><path d="M15 18l-5 3" stroke="${Y}" stroke-width="2"/>`,
    notebook: `<rect x="5" y="2" width="14" height="19" rx="1.5" fill="${LB}" stroke="${B}" stroke-width="1.2"/><path d="M8 7h8M8 10h8M8 13h8M8 16h5" stroke="${B}"/><path d="M3 5h3M3 9h3M3 13h3M3 17h3" stroke="${GR}" stroke-width="1.6"/>`,
    steps: `<g fill="none" stroke="${DK}" stroke-width="1"><rect x="3" y="3.5" width="5" height="5" fill="${W}"/><rect x="3" y="10" width="5" height="5" fill="${W}"/><rect x="3" y="16.5" width="5" height="5" fill="${W}"/></g><path d="M4 6l1.2 1.3L7.4 4.5" fill="none" stroke="${G}" stroke-width="1.6"/><path d="M10.5 6h10M10.5 12.5h10M10.5 19h10" stroke="${DK}" stroke-width="1.6"/>`,
    feedback: `<path d="M3 4h18v12H11l-5 4v-4H3z" fill="${Y}" stroke="${DY}" stroke-width="1.1"/><path d="M7 8h10M7 11h7" stroke="${DK}" stroke-width="1.3"/>`,
    docs: `${page(5, 2, 14, 20)}<path d="M8 10h8M8 13h8M8 16h5" stroke="${GR}"/><path d="M14 5l3 3" stroke="${R}" stroke-width="1.4"/>`,
    expenses: `<circle cx="12" cy="12" r="9" fill="${Y}" stroke="${DY}" stroke-width="1.2"/><path d="M14.5 8.5c-.6-1-1.6-1.4-2.6-1.4-1.6 0-2.7.9-2.7 2s1 1.7 2.8 2.1c1.8.4 2.8 1 2.8 2.2s-1.1 2.1-2.9 2.1c-1.2 0-2.3-.5-2.9-1.6M12 5.5v13" fill="none" stroke="${DK}" stroke-width="1.5"/>`,
    summary: `<rect x="3" y="3" width="18" height="18" fill="${W}" stroke="${GR}" stroke-width="1.2"/><path d="M6 8h12M6 12h12M6 16h8" stroke="${B}" stroke-width="1.6"/><rect x="15" y="14" width="4" height="5" fill="${G}"/>`,
    rel: `<rect x="2" y="3" width="8" height="5" rx="1" fill="${LB}" stroke="${B}"/><rect x="14" y="16" width="8" height="5" rx="1" fill="${LG}" stroke="${G}"/><path d="M6 8v5h8m0 0l-3-3m3 3l-3 3" fill="none" stroke="${DK}" stroke-width="1.4"/><path d="M14 16.5V13" stroke="${DK}"/>`,
    pred: `<rect x="2" y="3" width="8" height="5" rx="1" fill="${LB}" stroke="${B}"/><rect x="12" y="14" width="10" height="6" rx="1" fill="${LG}" stroke="${G}"/><path d="M6 8v9h6" fill="none" stroke="${DK}" stroke-width="1.4"/><path d="M9.5 14.5L12 17l-2.5 2.5z" fill="${DK}"/>`,
    succ: `<rect x="2" y="4" width="10" height="6" rx="1" fill="${LG}" stroke="${G}"/><rect x="14" y="15" width="8" height="5" rx="1" fill="${LB}" stroke="${B}"/><path d="M7 10v6.5h7" fill="none" stroke="${DK}" stroke-width="1.4"/><path d="M12 14l2.5 2.5L12 19z" fill="${DK}"/>`,
    codes: `<path d="M3 12.5V4h8.5l9 9-8.5 8.5z" fill="${Y}" stroke="${DY}" stroke-width="1.1"/><circle cx="7.5" cy="8" r="1.7" fill="${W}" stroke="${DY}"/>`,
    risk: `<path d="M12 2.5l9 5v9l-9 5-9-5v-9z" fill="${LB}" stroke="${B}" stroke-width="1.2"/><path d="M12 12.5l9-5M12 12.5v9M12 12.5l-9-5" stroke="${B}"/><path d="M12 6l5 2.8" stroke="${W}"/>`,
    issue: `<circle cx="12" cy="12" r="9.5" fill="${W}" stroke="${R}" stroke-width="2.4"/><path d="M12 6.5v7" stroke="${R}" stroke-width="2.8"/><circle cx="12" cy="17" r="1.6" fill="${R}"/>`,
    discuss: `<path d="M3 4h13v9H9l-4 3.5V13H3z" fill="${LB}" stroke="${B}" stroke-width="1.1"/><path d="M12 10h9v8h-2v3l-4-3h-3z" fill="${LG}" stroke="${G}" stroke-width="1.1"/>`,
    udf: `<rect x="3" y="3" width="18" height="18" fill="${W}" stroke="${GR}" stroke-width="1.2"/><path d="M6 8h12M6 12h8" stroke="${GR}"/><path d="M13 21l1-4 7-7 3 3-7 7z" fill="${Y}" stroke="${DY}" stroke-width="1"/>`,
    general: `${page(4, 2, 15, 20)}<path d="M7 9h9M7 12h9M7 15h9" stroke="${GR}"/>`,
    status: `<circle cx="12" cy="12" r="9" fill="${W}" stroke="${B}" stroke-width="1.6"/><path d="M12 12V5.5A6.5 6.5 0 0 1 18.5 12z" fill="${B}"/>`,
    gear: `<circle cx="12" cy="12" r="3.2" fill="${W}" stroke="${DK}" stroke-width="1.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" stroke="${GR}" stroke-width="2.8"/>`,
    help: `<circle cx="12" cy="12" r="9.5" fill="${Y}" stroke="${DY}" stroke-width="1.2"/><path d="M9 9.5a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.2-1.6 2.5" fill="none" stroke="${DK}" stroke-width="2"/><circle cx="12" cy="17.5" r="1.3" fill="${DK}"/>`,
    wbstree: `<rect x="8" y="2" width="8" height="5" fill="${Y}" stroke="${DY}"/><rect x="2" y="17" width="8" height="5" fill="${LB}" stroke="${B}"/><rect x="14" y="17" width="8" height="5" fill="${LB}" stroke="${B}"/><path d="M12 7v5M6 17v-5h12v5" fill="none" stroke="${DK}"/>`,
    track: `<rect x="2" y="9" width="20" height="6" fill="#f3e6b5" stroke="${DY}"/><path d="M6 9v3M10 9v4M14 9v3M18 9v4" stroke="${DK}"/>`,
    level: `<rect x="3" y="3" width="8" height="8" fill="${R}"/><rect x="13" y="3" width="8" height="8" fill="${G}"/><rect x="3" y="13" width="8" height="8" fill="${G}"/><rect x="13" y="13" width="8" height="8" fill="${LG}"/>`,
    flagfolder: `${folder(LGR, GR)}<path d="M15 3v10M15 3h6l-1.5 2.5L21 8h-6" fill="${R}" stroke="${R}" stroke-width="1.2"/>`,
    projects: folder(LGR, GR), hand: `<path d="M8 21c-2-3-3-5-4-7l2-1 2 2V6.5a1.5 1.5 0 0 1 3 0V11h1V5a1.5 1.5 0 0 1 3 0v6h1V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2 7-5 7z" fill="#f5d6b0" stroke="#a9763f" stroke-width="1"/>`,
    pagenum: page(), prefs: `<rect x="3" y="4" width="18" height="16" rx="2" fill="${LGR}" stroke="${GR}"/><path d="M6 9h12M6 12h12M6 15h12" stroke="${B}" stroke-width="2"/><circle cx="10" cy="9" r="1.8" fill="${W}" stroke="${B}"/><circle cx="15" cy="12" r="1.8" fill="${W}" stroke="${B}"/><circle cx="9" cy="15" r="1.8" fill="${W}" stroke="${B}"/>`,
    sort: `<path d="M6 4v14M3 15l3 4 3-4" fill="none" stroke="${B}" stroke-width="2"/><path d="M14 6h7M14 11h5M14 16h3" stroke="${DK}" stroke-width="1.8"/>`,
    layout: `<rect x="3" y="4" width="18" height="16" fill="${W}" stroke="${GR}" stroke-width="1.2"/><rect x="3" y="4" width="8" height="16" fill="${LB}" stroke="${B}"/><rect x="11" y="4" width="10" height="5" fill="${LG}" stroke="${G}"/>`,
    bars: `<rect x="2" y="5" width="12" height="4" fill="${G}"/><rect x="8" y="11" width="13" height="4" fill="${B}"/><rect x="4" y="17" width="10" height="4" fill="${R}"/>`
  };
  P6.icon = (name, cls) => `<svg class="pi${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;
  P6.hasIcon = (n) => !!I[n];
})(window);
