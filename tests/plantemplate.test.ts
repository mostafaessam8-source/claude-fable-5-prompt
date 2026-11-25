import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { parseWorkbook } from '../src/import/parse'
import { buildPlanTemplate, isPlanTemplate, parsePlanTemplate } from '../src/import/planTemplate'
import { parseLayout } from '../src/layout/parse'
import { addLink } from '../src/links/edit'
import { patchActivity } from '../src/links/edit'

const FIXTURE = readFileSync('tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx')

describe('SAR plan template', () => {
  it('the blank template is recognised and its example reads back', async () => {
    const x = await buildPlanTemplate()
    expect(await isPlanTemplate(x)).toBe(true)
    const { project, layouts } = await parsePlanTemplate(x)
    expect(layouts.map((l) => l.code)).toEqual(['C290', 'C291'])
    const r = computeProject(project).locations[0].activities
    expect(r.map((a) => [a.plannedStartH, a.plannedFinishH])).toEqual([[1, 2], [2, 4]])
    expect(project.locations[0].activities[1].pred).toBe(1)
    expect(project.locations[0].activities[1].holdPoint).toMatch(/HP-1/)
    expect(project.locations[0].activities[1].sarAttend).toBe(true)
  }, 60000)
  it('a project survives the trip through the template: dates, several links, shutdown details, actuals', async () => {
    const base = await parseWorkbook(FIXTURE)
    let p = addLink(base, 0, 5, { pred: 2, rel: 'SS', lagH: 0 }, 3)
    p = patchActivity(p, 0, 3, { crew: 'Track 1', equipment: 'Loader', manpower: 12, holdPoint: 'HP-2 Levels', sarAttend: true, delayCause: 'Weather', actualStartDate: new Date(Date.UTC(2026, 9, 16)), actualStartTime: 3, pct: 0.4, remarks: 'note' })
    p = { ...p, settings: { ...p.settings, shutdown: { ref: 'SD-03', manager: 'A. Manager' } } }
    const layouts = p.locations.map((l) => parseLayout(l.name, l.scope))
    const bytes = await buildPlanTemplate(p, layouts)
    const zip = await (await import('jszip')).default.loadAsync(bytes)
    const gantt = await zip.file('xl/worksheets/sheet4.xml')!.async('string')
    expect((gantt.match(/<brk /g) ?? []).length).toBe(p.locations.length - 1) // one culvert per printed page
    const back = await parsePlanTemplate(bytes)
    const a = computeProject(p), b = computeProject(back.project)
    expect(b.locations.length).toBe(a.locations.length)
    for (let i = 0; i < a.locations.length; i++) {
      expect(b.locations[i].activities.map((x) => [x.plannedStartH, x.plannedFinishH])).toEqual(a.locations[i].activities.map((x) => [x.plannedStartH, x.plannedFinishH]))
      expect(b.locations[i].activities.map((x) => x.name)).toEqual(a.locations[i].activities.map((x) => x.name))
    }
    const t = back.project.locations[0].activities[2]
    expect([t.crew, t.equipment, t.manpower, t.holdPoint, t.sarAttend, t.delayCause, t.pct, t.remarks]).toEqual(['Track 1', 'Loader', 12, 'HP-2 Levels', true, 'Weather', 0.4, 'note'])
    expect(t.actualStartTime).toBe(3)
    expect(back.project.locations[0].activities[4].more?.length).toBe(1) // the second relationship came back
    expect(back.project.settings.shutdown).toMatchObject({ ref: 'SD-03', manager: 'A. Manager' })
    expect(back.project.settings.possessionStart.getTime()).toBe(p.settings.possessionStart.getTime())
  }, 120000)
  it('the tracker workbook has the live sheets in order, with formulas', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await buildPlanTemplate()) as unknown as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Project', 'Locations', 'Plan', 'Gantt', 'Status Update', 'Delay Notification', 'Recovery Plan', 'Lists'])
    const f = (ws: string, a: string) => (wb.getWorksheet(ws)!.getCell(a).value as { formula?: string }).formula
    expect(f('Gantt', 'C4')).toMatch(/NOW\(\)/)
    expect(f('Gantt', 'G17')).toMatch(/Plan!/) // row 7 is the culvert's header block, its first activity starts under it
    expect(f('Status Update', 'B9')).toMatch(/SUMPRODUCT/)
    expect(wb.getWorksheet('Delay Notification')!.getCell('B6').value).toBe('C290-01')
    for (const w of wb.worksheets) expect(w.pageSetup.paperSize).toBe(9) // every sheet prints on A4
    expect(wb.getWorksheet('Gantt')!.pageSetup.fitToWidth).toBe(1)
  }, 60000)
  it('refuses other workbooks', async () => {
    expect(await isPlanTemplate(FIXTURE)).toBe(false)
    await expect(parsePlanTemplate(FIXTURE)).rejects.toThrow(/not the SAR Shutdown Plan template/)
  }, 60000)
})
