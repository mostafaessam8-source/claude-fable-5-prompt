import { addUnits } from '../import/parse'
import type { HoursOrDays, Project } from './types'

export interface SettingsPatch {
  possessionStart?: Date
  duration?: number
  unit?: HoursOrDays
  /** A date, 'default' (= the possession start) or 'now' (live, like =NOW()). */
  cutoff?: Date | 'default' | 'now'
  preparedBy?: string
  reportTitle?: string
  subtitle?: string
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
  let cutoffNow = old.cutoffNow
  if (patch.cutoff === 'default') { cutoff = possessionStart; cutoffDefaulted = true; cutoffNow = false }
  else if (patch.cutoff === 'now') { cutoffNow = true; cutoffDefaulted = false }
  else if (patch.cutoff) { cutoff = patch.cutoff; cutoffDefaulted = false; cutoffNow = false }
  else if (cutoffDefaulted && movedStart) cutoff = possessionStart

  const followGantt = old.ganttStart.getTime() === old.possessionStart.getTime()
  return {
    ...project,
    settings: {
      ...old, possessionStart, duration, unit, cutoff, cutoffDefaulted, cutoffNow,
      preparedBy: patch.preparedBy ?? old.preparedBy, reportTitle: patch.reportTitle ?? old.reportTitle, subtitle: patch.subtitle ?? old.subtitle,
      possessionEnd: addUnits(possessionStart, duration, unit),
      ganttStart: followGantt ? possessionStart : old.ganttStart,
    },
  }
}

/** The current wall-clock time as a floating date (the model keeps local clock readings in UTC fields). */
export function floatingNow(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()))
}

/** What to compute from: with the cut-off set to "now" the data date is the clock; everything else is the project as stored. */
export function effectiveProject(project: Project, now: Date): Project {
  return project.settings.cutoffNow ? { ...project, settings: { ...project.settings, cutoff: now } } : project
}
