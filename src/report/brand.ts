import type { ActivityStatus, LocationStatus } from '../engine/schedule'
import type { BarKind } from './gantt'

export const C = {
  blue: '#00778B', black: '#3D3935', slate: '#768692', sky: '#59CBE8', grey: '#C8C9C7',
  red: '#CB2C30', amber: '#F1B434', pale: '#BFE3EA', tint1: '#F2F8F9', tint2: '#E6F1F4',
  white: '#FFFFFF', darkRed: '#8E1B1F',
} as const

export interface Tone { bg: string; fg: string }
const W = C.white

/** Matched by exact string — never a `NOT STARTED*` wildcard (plain "Not Started" is neutral). */
export function activityTone(s: ActivityStatus): Tone {
  switch (s) {
    case 'Completed':
    case 'Completed - Ahead':
    case 'Completed - On Time': return { bg: C.blue, fg: W }
    case 'Completed - Delayed': return { bg: C.red, fg: W }
    case 'In Progress - On Track': return { bg: C.sky, fg: C.black }
    case 'In Progress - BEHIND': return { bg: C.amber, fg: C.black }
    case 'Not Started': return { bg: C.grey, fg: C.black }
    case 'NOT STARTED - LATE': return { bg: C.red, fg: W }
    default: return { bg: C.black, fg: C.amber } // "! CHECK …"
  }
}

export function locationTone(s: LocationStatus): Tone {
  switch (s) {
    case 'ON TIME': return { bg: C.blue, fg: W }
    case 'AHEAD': return { bg: C.sky, fg: C.black }
    case 'TIGHT': return { bg: C.amber, fg: C.black }
    case 'BEHIND': return { bg: C.red, fg: W }
    case 'AT RISK': return { bg: C.darkRed, fg: W }
    default: return { bg: C.black, fg: C.amber } // CHECK INPUT
  }
}

export const barColour: Record<BarKind, string> = {
  planned: C.grey, 'done-ontime': C.blue, 'done-late': C.red,
  progress: C.sky, behind: C.amber, forecast: C.pale,
}
