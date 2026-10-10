import type ExcelJS from 'exceljs'
import type { HoursOrDays } from '../model/types'

export const DAY_MS = 86_400_000

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

/** Unwrap formulas (cached result), rich text and hyperlinks to a plain value. */
export function plain(v: ExcelJS.CellValue): unknown {
  if (v == null) return null
  if (v instanceof Date || typeof v !== 'object') return v
  if ('result' in v) return plain(v.result as ExcelJS.CellValue)
  if ('formula' in v || 'sharedFormula' in v) return null // formula never calculated
  if ('richText' in v) return v.richText.map((r) => r.text).join('')
  if ('text' in v) return String(v.text)
  if ('error' in v) return null
  return null
}

export const text = (v: unknown): string => (v == null ? '' : String(v).trim())
export const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

export function num(v: unknown): number | null {
  if (isBlank(v)) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.endsWith('%')) {
      const n = Number(s.slice(0, -1))
      return Number.isFinite(n) ? n / 100 : null
    }
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function date(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  return null
}

/** A time-of-day cell → hours since midnight, to the nearest second (so it survives an Excel round trip). */
export function timeOfDay(v: unknown): number | null {
  if (isBlank(v)) return null
  const secs = (x: number) => Math.round(x) / 3600
  if (v instanceof Date) return secs(((v.getTime() % DAY_MS) + DAY_MS) % DAY_MS / 1000)
  if (typeof v === 'number') return secs((v % 1) * 86400)
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (m) return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)) / 3600
  }
  return null
}

export function addUnits(d: Date, n: number, u: HoursOrDays): Date {
  return new Date(d.getTime() + n * (u === 'days' ? DAY_MS : 3_600_000))
}
