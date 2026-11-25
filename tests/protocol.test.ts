import { describe, expect, it } from 'vitest'
import { computeProject } from '../src/engine/schedule'
import { levelOf, nextUpdate, worst } from '../src/protocol/status'
import { at, project } from './helpers'

describe('protocol status levels', () => {
  it('green on plan, yellow when tight, orange when late, red when the handback is at risk', () => {
    const g = computeProject(project([{ durationH: 10 }], { cutoff: at(0) })).locations[0]
    expect(levelOf(g)).toBe('Green')
    const y = computeProject(project([{ durationH: 47 }], { cutoff: at(0) })).locations[0] // 1 h of buffer
    expect(levelOf(y)).toBe('Yellow')
    const o = computeProject(project([{ durationH: 10 }, { durationH: 10, pred: 1 }], { cutoff: at(15) })).locations[0] // nothing started: late, forecast moves
    expect(['Orange', 'Red']).toContain(levelOf(o))
    const r = computeProject(project([{ durationH: 40 }], { cutoff: at(20) })).locations[0] // forecast 60 h in a 48 h window
    expect(levelOf(r)).toBe('Red')
  })
  it('before the possession starts a plan that fits the window is green, however tight', () => {
    const tight = computeProject(project([{ durationH: 47 }], { cutoff: at(0) })).locations[0]
    expect(levelOf(tight)).toBe('Yellow')
    expect(levelOf(tight, true)).toBe('Green')
    const over = computeProject(project([{ durationH: 50 }], { cutoff: at(0) })).locations[0] // the plan itself overruns the window
    expect(levelOf(over, true)).toBe('Red')
  })
  it('worst of several and the next update interval', () => {
    expect(worst(['Green', 'Orange', 'Yellow'])).toBe('Orange')
    const last = new Date(Date.UTC(2026, 11, 4, 10, 0))
    expect(nextUpdate(last, 'Green')!.getUTCHours()).toBe(12)
    expect(nextUpdate(last, 'Yellow')!.getUTCHours()).toBe(11)
    expect(nextUpdate(last, 'Red')!.getUTCMinutes()).toBe(30)
    expect(nextUpdate(undefined, 'Red')).toBeNull()
  })
})
