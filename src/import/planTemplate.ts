/**
 * The SAR Shutdown Plan template (.xlsx): the one workbook a contractor fills to submit a shutdown plan.
 * Sheets: Project (possession window, shutdown ref, manager, document control), Locations (one row per culvert),
 * Plan (one row per activity: crew, equipment, manpower, predecessors, start / finish, hold point, SAR attendance, actuals),
 * Lists, and the blank protocol forms (Appendix B, C, D). `parsePlanTemplate` reads it back into a project.
 */
import ExcelJS from 'exceljs'
import { computeProject } from '../engine/schedule'
import { composeName, composeScope, KINDS, type CulvertKind, type SiteLayout } from '../layout/parse'
import { lagToKeepStart, linksOf, splitDateTime } from '../links/edit'
import type { ActivityInput, ExtraLink, Project, Rel } from '../model/types'
import { DELAY_CAUSES } from '../protocol/lists'
import { DOC_DEFAULTS } from '../protocol/docControl'
import { LEVELS, LEVEL_INFO } from '../protocol/status'
import { box, center, font, left, solid } from '../export/styles'
import { addForms, addGantt } from './trackerSheets'
import { date, ImportError, isBlank, num, plain, text, addUnits } from './cells'

export const PLAN_MARK = 'SAR SHUTDOWN PLAN TEMPLATE'
const TEAL = '#00778B'
const INK = '#3D3935'
const HOUR = 3_600_000
const SHEETS = { project: 'Project', locations: 'Locations', plan: 'Plan', lists: 'Lists' }

const PLAN_HEAD = ['Location', 'Ref', 'Activity', 'Line', 'Crew / Team', 'Equipment', 'Manpower (nos.)', 'Predecessors', 'Start', 'Finish', 'Duration (h)', 'Hold point / inspection', 'SAR attends (Yes/No)', 'Delay cause', 'Actual start', 'Actual finish', '% complete', 'Remarks']
const PLAN_W = [10, 11, 46, 8, 14, 30, 11, 22, 17, 17, 10, 38, 11, 26, 17, 17, 10, 30]
const LOC_HEAD = ['Code', 'Chainage', 'Type (cell / pipe)', 'Count', 'Length', 'Lines', 'OTMP / TSO', 'Station']
const DT = 'dd-mmm-yyyy hh:mm'

const pad = (n: number) => String(n).padStart(2, '0')

function banner(ws: ExcelJS.Worksheet, title: string, width: number) {
  ws.mergeCells(1, 1, 1, width)
  const c = ws.getCell(1, 1)
  c.value = title
  c.font = font('#FFFFFF', 13, true); c.fill = solid(TEAL); c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 26
}

/** The template, empty (a worked example of two rows) or filled from a project. */
export async function buildPlanTemplate(project?: Project, layouts?: SiteLayout[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SAR Possession Tracker'
  const st = project?.settings

  // ---- Project ----
  const pj = wb.addWorksheet(SHEETS.project, { views: [{ showGridLines: false }] })
  pj.columns = [{ width: 36 }, { width: 62 }, { width: 70 }]
  banner(pj, PLAN_MARK, 3)
  pj.mergeCells('A2:C2')
  pj.getCell('A2').value = 'Fill the yellow cells. Locations → one row per culvert; Plan → one row per activity (Predecessors: REF, REF+type, e.g. C290-03  or  C290-05SS+1 ; dates are authoritative). Do not rename the sheets or the column headings.'
  pj.getCell('A2').font = font(INK, 9); pj.getCell('A2').alignment = { wrapText: true, vertical: 'top' }; pj.getRow(2).height = 40
  const d0 = st?.possessionStart ?? new Date(Date.UTC(2026, 11, 4, 0, 0))
  const kv: [string, ExcelJS.CellValue, string?][] = [
    ['Project name', st?.projectName ?? 'EWR CULVERTS REPLACEMENT PHASE 2'],
    ['Report title', st?.reportTitle ?? 'POSSESSION PROGRESS REPORT - PLANNED vs ACTUAL'],
    ['Subtitle', st?.subtitle ?? 'Culvert Replacement – Shutdown'],
    ['Prepared by', st?.preparedBy ?? ''],
    ['Shutdown Ref', st?.shutdown?.ref ?? ''],
    ['Contractor Responsible Manager', st?.shutdown?.manager ?? ''],
    ['Possession start', d0, DT],
    ['Possession end', st?.possessionEnd ?? addUnits(d0, 48, 'hours'), DT],
    ['Report cut-off (blank = possession start)', st && !st.cutoffDefaulted ? st.cutoff : null, DT],
    ['Function', st?.shutdown?.doc?.fn ?? DOC_DEFAULTS.fn],
    ['Department', st?.shutdown?.doc?.dept ?? DOC_DEFAULTS.dept],
    ['Document title', st?.shutdown?.doc?.title ?? DOC_DEFAULTS.title],
    ['Document no.', st?.shutdown?.doc?.docNo ?? DOC_DEFAULTS.docNo],
    ['Revision no.', st?.shutdown?.doc?.rev ?? DOC_DEFAULTS.rev],
    ['Effective date', st?.shutdown?.doc?.effective ?? DOC_DEFAULTS.effective],
  ]
  kv.forEach(([k, v, nf], i) => {
    const r = 4 + i
    const a = pj.getCell(r, 1), b = pj.getCell(r, 2)
    a.value = k; a.font = font(INK, 10, true); a.fill = solid('#F2F8F9'); a.border = box
    b.value = v; b.fill = solid('#FFF2CC'); b.border = box; b.alignment = left
    if (nf) b.numFmt = nf
  })

  pj.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  // ---- Locations ----
  const ls = wb.addWorksheet(SHEETS.locations, { views: [{ state: 'frozen', ySplit: 1 }] })
  ls.columns = LOC_HEAD.map((h, i) => ({ header: h, width: [10, 14, 16, 8, 10, 28, 22, 18][i] }))
  const lay: SiteLayout[] = layouts ?? [
    { code: 'C290', chainage: 'KM 338+866', cells: 1, kind: 'cell', length: '23 m', lines: 'Main Line 1 & Main Line 3', otmp: 'TSO', station: 'Station 29' },
    { code: 'C291', chainage: 'KM 339+790', cells: 3, kind: 'cell', length: '21 m', lines: 'Main Line 1 & Main Line 3', otmp: 'TSO', station: 'Station 29' },
  ]
  lay.forEach((l) => ls.addRow([l.code, l.chainage, l.kind, l.cells, l.length, l.lines, l.otmp, l.station]))
  ls.getRow(1).eachCell((c) => { c.fill = solid(TEAL); c.font = font('#FFFFFF', 10, true); c.alignment = center; c.border = box })
  for (let r = 2; r <= Math.max(lay.length + 1, 12); r++) for (let c = 1; c <= 8; c++) { const x = ls.getCell(r, c); x.fill = solid('#FFF2CC'); x.border = box }
  for (let r = 2; r <= 60; r++) ls.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: ['"cell,pipe"'] }

  ls.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  // ---- Plan ----
  const pl = wb.addWorksheet(SHEETS.plan, { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] })
  pl.columns = PLAN_HEAD.map((h, i) => ({ header: h, width: PLAN_W[i] }))
  pl.getRow(1).eachCell((c) => { c.fill = solid(TEAL); c.font = font('#FFFFFF', 10, true); c.alignment = center; c.border = box })
  pl.getRow(1).height = 32
  const out: (ExcelJS.CellValue)[][] = []
  if (project) {
    const res = computeProject(project)
    project.locations.forEach((loc, li) => {
      const code = lay[li]?.code || `L${li + 1}`
      const ref = (a: ActivityInput) => `${code}-${pad(a.no)}`
      loc.activities.forEach((a, k) => {
        const r = res.locations[li].activities[k]
        const preds = linksOf(a).map((l) => `${code}-${pad(l.pred)}${l.rel === 'FS' && !l.lagH ? '' : `${l.rel}${l.lagH ? `${l.lagH > 0 ? '+' : ''}${Math.round(l.lagH * 100) / 100}` : ''}`}`).join(', ')
        const as = a.actualStartDate ? new Date(a.actualStartDate.getTime() + (a.actualStartTime ?? 0) * HOUR) : null
        const af = a.actualFinishDate ? new Date(a.actualFinishDate.getTime() + (a.actualFinishTime ?? 0) * HOUR) : null
        out.push([code, ref(a), a.name, '', a.crew ?? '', a.equipment ?? '', a.manpower ?? null, preds, r.plannedStart, r.plannedFinish, a.durationH, a.holdPoint ?? '', a.sarAttend ? 'Yes' : '', a.delayCause ?? '', as, af, a.pct, a.remarks])
      })
    })
  } else {
    const t = (h: number) => addUnits(d0, h, 'hours')
    out.push(['C290', 'C290-01', 'Track removal & evacuation of panels', 'Line 1', 'Track 1', 'Forklift 16 ton / Loader / Compactor', null, '', t(1), t(2), 1, '', '', '', null, null, null, ''])
    out.push(['C290', 'C290-02', 'Ballast removal', '', 'OTC', '', null, 'C290-01', t(2), t(4), 2, 'HP-1 Excavation to formation level', 'Yes', '', null, null, null, ''])
  }
  out.forEach((row) => pl.addRow(row))
  const lastRow = Math.max(out.length + 1, 301)
  for (let r = 2; r <= lastRow; r++) {
    for (let c = 1; c <= PLAN_HEAD.length; c++) { const x = pl.getCell(r, c); x.border = box; if (r > out.length + 1 || true) x.fill = solid(r % 2 ? '#FFFFFF' : '#FFFBEF') }
    for (const c of [9, 10, 15, 16]) pl.getCell(r, c).numFmt = DT
    pl.getCell(r, 17).numFmt = '0%'
  }
  for (let r = 2; r <= lastRow; r++) {
    pl.getCell(r, 13).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] }
    pl.getCell(r, 14).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${DELAY_CAUSES.length + 1}`] }
  }
  pl.autoFilter = { from: 'A1', to: { row: 1, column: PLAN_HEAD.length } }
  pl.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', printArea: `A1:${String.fromCharCode(64 + PLAN_HEAD.length)}${(project ? project.locations.reduce((n, l) => n + l.activities.length, 0) : 40) + 1}` }

  // ---- the live sheets: Gantt (plan vs actual / forecast) and the protocol forms, all driven by formulas ----
  const acts = Math.max(150, (project ? project.locations.reduce((n, l) => n + l.activities.length, 0) : 0) + 30)
  const hours = Math.min(168, Math.max(24, Math.ceil(project ? (project.settings.unit === 'days' ? project.settings.duration * 24 : project.settings.duration) : 48)))
  const used = project ? project.locations.reduce((n, l) => n + l.activities.length, 0) : 40
  const starts = project ? project.locations.reduce<number[]>((a, _l, i) => [...a, i === 0 ? 0 : a[i - 1] + project.locations[i - 1].activities.length], []) : []
  const g = addGantt(wb, { hours, acts, used, starts })
  addForms(wb, g, acts, { ref: project ? `${lay[0]?.code || 'L1'}-01` : 'C290-01', code: lay[0]?.code ?? 'C290' })
  wb.calcProperties = { fullCalcOnLoad: true }
  // ---- Lists ----
  const li = wb.addWorksheet(SHEETS.lists)
  li.getCell('A1').value = 'Delay cause'; li.getCell('A1').font = font(INK, 10, true)
  DELAY_CAUSES.forEach((c, i) => { li.getCell(i + 2, 1).value = c })
  li.getColumn(1).width = 40
  li.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  li.getCell('C1').value = 'Status level'; li.getCell('C1').font = font(INK, 10, true)
  LEVELS.forEach((l, i) => { const c = li.getCell(i + 2, 3); c.value = LEVEL_INFO[l].label; c.fill = solid(LEVEL_INFO[l].bg); c.font = font(LEVEL_INFO[l].fg, 10, true) })

  return new Uint8Array(await wb.xlsx.writeBuffer())
}

/** Is this workbook the SAR plan template? (Its Project sheet carries the mark.) */
export async function isPlanTemplate(data: ArrayBuffer | Uint8Array): Promise<boolean> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(data as ArrayBuffer)
    return text(plain(wb.getWorksheet(SHEETS.project)?.getCell('A1').value ?? null)) === PLAN_MARK
  } catch { return false }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
function toDate(v: unknown): Date | null {
  const d = date(v)
  if (d) return d
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400) * 1000)
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
  }
  return null
}

const TOKEN = /^(.*?)(?:(FS|SS|FF|SF)([+-]\d+(?:\.\d+)?)?)?$/i

/** Read a filled SAR plan template into a project (locations, activities, links, hold points, actuals) and its site layouts. */
export async function parsePlanTemplate(data: ArrayBuffer | Uint8Array): Promise<{ project: Project; layouts: SiteLayout[] }> {
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(data as ArrayBuffer) } catch { throw new ImportError('This is not the SAR Shutdown Plan template (the file could not be read).') }
  const pj = wb.getWorksheet(SHEETS.project), ls = wb.getWorksheet(SHEETS.locations), pl = wb.getWorksheet(SHEETS.plan)
  if (!pj || !ls || !pl || text(plain(pj.getCell('A1').value)) !== PLAN_MARK) throw new ImportError('This is not the SAR Shutdown Plan template (sheets Project, Locations and Plan are needed).')
  const warnings: string[] = []

  // Project sheet: label in column A, value in column B
  const kv = new Map<string, unknown>()
  pj.eachRow((row) => { const k = norm(text(plain(row.getCell(1).value))); if (k) kv.set(k, plain(row.getCell(2).value)) })
  const get = (k: string) => kv.get(norm(k))
  const start = toDate(get('Possession start'))
  const end = toDate(get('Possession end'))
  if (!start || !end || end <= start) throw new ImportError('Project sheet: "Possession start" and "Possession end" must be dates with the end after the start.')
  const duration = Math.round(((end.getTime() - start.getTime()) / HOUR) * 100) / 100
  const cutoff = toDate(get('Report cut-off (blank = possession start)'))
  const name = text(get('Project name')) || 'Shutdown'

  // Locations
  const layouts: SiteLayout[] = []
  ls.eachRow((row, r) => {
    if (r === 1) return
    const code = text(plain(row.getCell(1).value))
    if (!code) return
    const kind = norm(text(plain(row.getCell(3).value))) as CulvertKind
    layouts.push({ code, chainage: text(plain(row.getCell(2).value)), kind: KINDS.includes(kind) ? kind : 'cell', cells: num(plain(row.getCell(4).value)), length: text(plain(row.getCell(5).value)), lines: text(plain(row.getCell(6).value)), otmp: text(plain(row.getCell(7).value)), station: text(plain(row.getCell(8).value)) })
  })
  if (!layouts.length) throw new ImportError('Locations sheet: add at least one culvert (a row with its Code).')
  const byCode = new Map(layouts.map((l, i) => [norm(l.code), i]))

  // Plan rows → activities per location
  const head = new Map<string, number>()
  pl.getRow(1).eachCell((c, i) => head.set(norm(text(plain(c.value))), i))
  const col = (k: string) => head.get(norm(k)) ?? 0
  const need = ['Location', 'Activity', 'Start']
  for (const k of need) if (!col(k)) throw new ImportError(`Plan sheet: the column "${k}" is missing.`)
  interface PlanRow { r: number; loc: string; ref: string; name: string; line: string; crew: string; equipment: string; manpower: number | null; preds: string; start: Date | null; finish: Date | null; dur: number | null; hold: string; sar: string; cause: string; as: Date | null; af: Date | null; pct: number | null; remarks: string }
  const rows: PlanRow[] = []
  pl.eachRow((row, r) => {
    if (r === 1) return
    const g = (k: string) => (col(k) ? plain(row.getCell(col(k)).value) : null)
    if (isBlank(g('Location')) && isBlank(g('Activity'))) return
    rows.push({ r, loc: text(g('Location')), ref: text(g('Ref')), name: text(g('Activity')), line: text(g('Line')), crew: text(g('Crew / Team')), equipment: text(g('Equipment')), manpower: num(g('Manpower (nos.)')), preds: text(g('Predecessors')),
      start: toDate(g('Start')), finish: toDate(g('Finish')), dur: num(g('Duration (h)')), hold: text(g('Hold point / inspection')), sar: norm(text(g('SAR attends (Yes/No)'))), cause: text(g('Delay cause')),
      as: toDate(g('Actual start')), af: toDate(g('Actual finish')), pct: num(g('% complete')), remarks: text(g('Remarks')) })
  })

  const hoursOf = (d: Date) => Math.round(((d.getTime() - start.getTime()) / HOUR) * 60) / 60
  const locations = layouts.map((l) => ({ name: composeName(l), scope: composeScope(l), activities: [] as ActivityInput[] }))
  const timing = layouts.map(() => new Map<number, { startH: number; finishH: number }>()) // planned times by activity number, per location
  const refNo = layouts.map(() => new Map<string, number>()) // a Ref → its activity number, per location
  for (const row of rows) {
    const li = byCode.get(norm(row.loc))
    if (li == null) { warnings.push(`Plan row ${row.r}: the location "${row.loc}" is not in the Locations sheet — skipped.`); continue }
    const acts = locations[li].activities
    const no = acts.length + 1
    const s = row.start, f = row.finish
    let dur = f && s ? Math.round(((f.getTime() - s.getTime()) / HOUR) * 60) / 60 : row.dur
    if (dur != null && dur <= 0) dur = null
    if (!s) warnings.push(`Plan row ${row.r}: no Start date — the activity starts at the possession start.`)
    const startH = s ? hoursOf(s) : 0
    const durH = dur ?? 0
    const links: ExtraLink[] = []
    for (const tokenRaw of row.preds.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
      const m = tokenRaw.match(TOKEN)
      const key = norm(m?.[1] ?? tokenRaw)
      const pNo = refNo[li].get(key) ?? (/^\d+$/.test(key) ? Number(key) : 0)
      const pt = pNo >= 1 && pNo < no ? timing[li].get(pNo) : undefined
      if (!pt || !pNo) { warnings.push(`Plan row ${row.r}: predecessor "${tokenRaw}" is not an earlier activity of the same location — ignored.`); continue }
      const rel = ((m?.[2] ?? 'FS').toUpperCase()) as Rel
      const explicit = m?.[3] != null ? Number(m[3]) : null
      // the planned start is authoritative: the lag is whatever makes this link give it (unless the lag is written and there is no Start)
      const lag = explicit != null && !s ? explicit : lagToKeepStart(startH, rel, { startH: pt.startH, finishH: pt.finishH }, durH)
      links.push({ pred: pNo, rel, lagH: lag })
    }
    const a: ActivityInput = {
      no, sourceRow: row.r,
      name: [row.name, row.line && row.line !== '-' ? `(${String(row.line).toLowerCase()})` : ''].filter(Boolean).join(' '),
      durationH: dur, pred: links[0]?.pred ?? 0, rel: links[0]?.rel ?? 'FS', lagH: links[0]?.lagH ?? (links.length ? 0 : startH),
      more: links.length > 1 ? links.slice(1) : undefined,
      actualStartDate: null, actualStartTime: null, actualFinishDate: null, actualFinishTime: null, pct: null, remarks: row.remarks,
      crew: row.crew || undefined, equipment: row.equipment && row.equipment !== '-' ? (row.equipment) : undefined, manpower: row.manpower ?? undefined,
      holdPoint: row.hold && row.hold !== '-' ? (row.hold) : undefined, sarAttend: row.sar === 'yes' || row.sar === 'y' || row.sar === 'true' ? true : undefined, delayCause: row.cause || undefined,
    }
    if (a.crew === '-') a.crew = undefined
    const as = row.as, af = row.af
    if (as) { const x = splitDateTime(as); a.actualStartDate = x.date; a.actualStartTime = x.time }
    if (af) { const x = splitDateTime(af); a.actualFinishDate = x.date; a.actualFinishTime = x.time }
    const pc = row.pct
    if (pc != null) a.pct = pc > 1 ? pc / 100 : pc
    acts.push(a)
    timing[li].set(no, { startH, finishH: startH + durH })
    if (row.ref) refNo[li].set(norm(row.ref), no)
  }

  const project: Project = {
    settings: {
      projectName: name, reportTitle: text(get('Report title')) || name, subtitle: text(get('Subtitle')), preparedBy: text(get('Prepared by')),
      cutoff: cutoff ?? start, cutoffDefaulted: !cutoff, possessionStart: start, duration, unit: 'hours', possessionEnd: addUnits(start, duration, 'hours'),
      ganttStart: start, ganttSpan: duration, ganttSpanUnit: 'hours',
      shutdown: {
        ref: text(get('Shutdown Ref')) || undefined, manager: text(get('Contractor Responsible Manager')) || undefined,
        doc: { fn: text(get('Function')) || undefined, dept: text(get('Department')) || undefined, title: text(get('Document title')) || undefined, docNo: text(get('Document no.')) || undefined, rev: text(get('Revision no.')) || undefined, effective: text(get('Effective date')) || undefined },
      },
    },
    locationCount: locations.length, activityRowsPerLocation: Math.max(1, ...locations.map((l) => l.activities.length)),
    locations, warnings,
  }
  if (!locations.some((l) => l.activities.length)) throw new ImportError('Plan sheet: no activities found (each row needs its Location code and Activity).')
  return { project, layouts }
}
