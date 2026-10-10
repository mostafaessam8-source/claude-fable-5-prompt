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
