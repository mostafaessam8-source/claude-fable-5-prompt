/**
 * The SAR protocol's Delay Status Levels (NSR-SWP-01-PM-MD §6) and update frequency (§7), worked out from the tracker.
 *   Green   on plan                          routine tracker update          every 2 hours
 *   Yellow  early warning / variance         corrective action and forecast  every 1 hour
 *   Orange  actual delay / milestone impact  formal Delay Notification       every 1 hour
 *   Red     handback at risk                 Recovery Plan, senior escalation every 30 minutes
 */
import type { LocationResult } from '../engine/schedule'

export type Level = 'Green' | 'Yellow' | 'Orange' | 'Red'
export const LEVELS: Level[] = ['Green', 'Yellow', 'Orange', 'Red']

export const LEVEL_INFO: Record<Level, { label: string; trigger: string; requirement: string; everyMin: number; bg: string; fg: string }> = {
  Green: { label: 'GREEN', trigger: 'On plan', requirement: 'Routine tracker update', everyMin: 120, bg: '#2E9E5B', fg: '#fff' },
  Yellow: { label: 'YELLOW', trigger: 'Early warning / variance', requirement: 'Corrective action and forecast', everyMin: 60, bg: '#F1C232', fg: '#3D3935' },
  Orange: { label: 'ORANGE', trigger: 'Actual delay / milestone impact', requirement: 'Formal Delay Notification and recovery action', everyMin: 60, bg: '#E8801A', fg: '#fff' },
  Red: { label: 'RED', trigger: 'Handback at risk / operational impact', requirement: 'Recovery Plan, senior escalation and frequent updates', everyMin: 30, bg: '#CB2C30', fg: '#fff' },
}

/** The level of one location: the worst thing that is true of it. */
/** `notStarted`: the report time is not past the possession start yet: nothing can have slipped, so a plan that fits the window is Green (even a tight one). */
export function levelOf(l: Pick<LocationResult, 'bufferToHandback' | 'variance' | 'activities'>, notStarted = false): Level {
  if (l.bufferToHandback < 0) return 'Red' // the forecast finish is past the handback
  if (notStarted) return 'Green'
  if (l.variance > 0.1) return 'Orange' // the location forecasts later than planned: an actual delay
  const early = l.bufferToHandback < 2 || l.activities.some((a) => a.carried > 0.1) // some activity is already slipping, though the location finish is not yet moved
  return early ? 'Yellow' : 'Green'
}

/** The worst level of several. */
export function worst(levels: Level[]): Level {
  return levels.reduce<Level>((w, x) => (LEVELS.indexOf(x) > LEVELS.indexOf(w) ? x : w), 'Green')
}

/** When the next status update is due: the last one plus the interval of the current level. */
export function nextUpdate(last: Date | undefined, level: Level): Date | null {
  return last ? new Date(last.getTime() + LEVEL_INFO[level].everyMin * 60_000) : null
}
