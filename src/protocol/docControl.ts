import type { Settings } from '../model/types'

/** The SAR document control block of NSR-SWP-01-PM-MD (header: function / department / title, footer: document no. / revision / date). */
export const DOC_DEFAULTS = {
  fn: 'Engineering & Project Unit',
  dept: 'NSR Program',
  title: 'Shutdown Mandatory Requirements, Delay Management & Recovery Protocol',
  docNo: 'NSR-SWP-01-PM-MD',
  rev: '01',
  effective: '20 September 2026',
}
export type DocControl = typeof DOC_DEFAULTS

export function docControl(s: Pick<Settings, 'shutdown'>): DocControl {
  const d = s.shutdown?.doc ?? {}
  return {
    fn: d.fn?.trim() || DOC_DEFAULTS.fn, dept: d.dept?.trim() || DOC_DEFAULTS.dept, title: d.title?.trim() || DOC_DEFAULTS.title,
    docNo: d.docNo?.trim() || DOC_DEFAULTS.docNo, rev: d.rev?.trim() || DOC_DEFAULTS.rev, effective: d.effective?.trim() || DOC_DEFAULTS.effective,
  }
}
