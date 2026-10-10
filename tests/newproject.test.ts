import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { exportXlsx } from '../src/export'
import { parseWorkbook } from '../src/import/parse'
import { addActivity } from '../src/links/edit'
import { addLocation } from '../src/model/locations'
import { createProject } from '../src/model/newProject'

describe('a new project from scratch', () => {
  const make = () => createProject({ projectName: 'DEMO', possessionStart: new Date(Date.UTC(2026, 10, 6, 0, 0)), duration: 2, unit: 'days', code: 'C100', chainage: 'KM 1+000', kind: 'pipe', count: 2 })
  it('computes, with the window and the first location', () => {
    const { project, layouts } = make()
    expect(project.settings.possessionEnd).toEqual(new Date(Date.UTC(2026, 10, 8, 0, 0)))
    expect(project.locations[0].name).toBe('C100  –  KM 1+000')
    expect(layouts[0]).toMatchObject({ code: 'C100', kind: 'pipe', cells: 2 })
    const r = computeProject(project)
    expect(r.locations[0].activities).toHaveLength(1)
    expect(r.locations[0].activities[0].plannedFinishH).toBe(1)
  })
  it('grows like any project and survives an Excel round trip', async () => {
    let e = make()
    e = { ...e, project: addActivity(e.project, 0, 'Excavate', 4).project }
    e = addLocation(e, 'C200  –  KM 2')
    const back = await parseWorkbook(await exportXlsx(e.project, e.layouts))
    expect(back.locations.map((l) => l.name)).toEqual(e.project.locations.map((l) => l.name))
    expect(back.locations[0].activities.map((a) => a.name)).toEqual(['New activity', 'Excavate'])
    expect(back.settings.projectName).toBe('DEMO')
  }, 60000)
})

describe('cut-off: manual or now', () => {
  it('"now" makes the data date the clock without touching the stored project', async () => {
    const { applySettings, effectiveProject, floatingNow } = await import('../src/model/settings')
    const { project } = createProject({ projectName: 'P', possessionStart: new Date(Date.UTC(2026, 10, 6)), duration: 48, unit: 'hours', code: 'C1' })
    const live = applySettings(project, { cutoff: 'now', preparedBy: 'M. Essam' })
    expect(live.settings).toMatchObject({ cutoffNow: true, preparedBy: 'M. Essam' })
    const t = floatingNow(new Date(2026, 10, 6, 13, 30))
    expect(effectiveProject(live, t).settings.cutoff).toEqual(new Date(Date.UTC(2026, 10, 6, 13, 30)))
    expect(live.settings.cutoff).toEqual(project.settings.cutoff) // stored value unchanged
    expect(computeProject(effectiveProject(live, t)).locations[0].activities[0].status).toMatch(/LATE|Completed|Progress|Not Started/)
    const manual = applySettings(live, { cutoff: new Date(Date.UTC(2026, 10, 7)) })
    expect(manual.settings.cutoffNow).toBe(false)
    expect(effectiveProject(manual, t)).toBe(manual)
  })
  it('exports =NOW() for a live cut-off and the date for a manual one', async () => {
    const { applySettings } = await import('../src/model/settings')
    const { project, layouts } = createProject({ projectName: 'P', possessionStart: new Date(Date.UTC(2026, 10, 6)), duration: 48, unit: 'hours', code: 'C1' })
    const ExcelJS = (await import('exceljs')).default
    const read = async (p: typeof project) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await exportXlsx(p, layouts)) as never); return wb.getWorksheet('Data Input')!.getCell('M5').value as { formula?: string } | Date }
    expect((await read(applySettings(project, { cutoff: 'now' }))) as { formula: string }).toMatchObject({ formula: 'NOW()' })
    expect(await read(applySettings(project, { cutoff: new Date(Date.UTC(2026, 10, 7)) }))).toEqual(new Date(Date.UTC(2026, 10, 7)))
  }, 60000)
})
