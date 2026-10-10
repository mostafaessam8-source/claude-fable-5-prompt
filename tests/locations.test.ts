import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { exportXlsx } from '../src/export'
import { parseWorkbook } from '../src/import/parse'
import { parseLayout } from '../src/layout/parse'
import { addLocation, deleteLocation, duplicateLocation, MAX_LOCATIONS, moveLocation, renameLocation } from '../src/model/locations'
import { readFileSync } from 'node:fs'

const FIXTURE = readFileSync('tests/fixtures/EWR_Phase2_Shutdown03_Progress_Tracker.xlsx')
const load = async () => {
  const project = await parseWorkbook(FIXTURE)
  return { project, layouts: project.locations.map((l) => parseLayout(l.name, l.scope)) }
}

describe('locations', () => {
  it('the workbook list holds as many locations as the fixture can grow to', async () => {
    const e = await load()
    expect(e.project.locations.length).toBeLessThanOrEqual(MAX_LOCATIONS)
  })
  it('rename keeps the other layout facts and the name round-trips', async () => {
    const e = await load()
    const r = renameLocation(e, 0, 'C999  –  KM 1+000')
    expect(r.layouts[0].code).toBe('C999')
    expect(r.layouts[0].chainage).toBe('KM 1+000')
    expect(r.layouts[0].cells).toBe(e.layouts[0].cells)
    expect(r.project.locations[0].name).toBe('C999  –  KM 1+000')
    expect(e.project.locations[0].name).not.toBe('C999  –  KM 1+000') // input untouched
  })
  it('add, duplicate, move, delete keep project and layouts in step', async () => {
    const e = await load()
    const n = e.project.locations.length
    let r = addLocation(e, 'C500  –  KM 5', 0)
    expect(r.project.locationCount).toBe(n + 1)
    expect(r.project.locations[1].name).toBe('C500  –  KM 5')
    expect(r.layouts[1].code).toBe('C500')
    r = duplicateLocation(r, 0, 'C600  –  KM 6')
    expect(r.project.locations[1].activities.length).toBe(e.project.locations[0].activities.length)
    expect(r.layouts.length).toBe(n + 2)
    r = moveLocation(r, 1, 1)
    expect(r.layouts.map((l) => l.code)).toEqual(r.project.locations.map((l) => parseLayout(l.name, l.scope).code))
    r = deleteLocation(r, 1)
    expect(r.project.locations.length).toBe(n + 1)
    expect(computeProject(r.project).locations).toHaveLength(n + 1)
  })
  it('exports and re-imports the edited list', async () => {
    const e = await load()
    let r = renameLocation(e, 0, 'C999  –  KM 1+000')
    r = addLocation(r, 'C500  –  KM 5')
    const back = await parseWorkbook(await exportXlsx(r.project, r.layouts))
    expect(back.locations.map((l) => l.name)).toEqual(r.project.locations.map((l) => l.name))
    expect(back.locations.at(-1)!.activities).toHaveLength(1)
  }, 60000)
})
