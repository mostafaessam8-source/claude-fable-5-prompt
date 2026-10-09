import { addUnits } from '../import/parse'
import type { HoursOrDays, Project } from './types'

export interface SettingsPatch {
  possessionStart?: Date
  duration?: number
  unit?: HoursOrDays
  cutoff?: Date | 'default'
}

/** The one place the possession window and data date are changed. Keeps derived fields in step. */
export function applySettings(project: Project, patch: SettingsPatch): Project {
  const old = project.settings
  const possessionStart = patch.possessionStart ?? old.possessionStart
  const duration = patch.duration ?? old.duration
  const unit = patch.unit ?? old.unit
  const movedStart = possessionStart.getTime() !== old.possessionStart.getTime()

  let cutoff = old.cutoff
  let cutoffDefaulted = old.cutoffDefaulted
  if (patch.cutoff === 'default') { cutoff = possessionStart; cutoffDefaulted = true }
  else if (patch.cutoff) { cutoff = patch.cutoff; cutoffDefaulted = false }
  else if (cutoffDefaulted && movedStart) cutoff = possessionStart

  const followGantt = old.ganttStart.getTime() === old.possessionStart.getTime()
  return {
    ...project,
    settings: {
      ...old, possessionStart, duration, unit, cutoff, cutoffDefaulted,
      possessionEnd: addUnits(possessionStart, duration, unit),
      ganttStart: followGantt ? possessionStart : old.ganttStart,
    },
  }
}
