import type { Fill, Font, Alignment, Borders } from 'exceljs'
import { C } from '../report/brand'

export const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase()
export const solid = (hex: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } })
export const font = (hex: string, size = 10, bold = false): Partial<Font> => ({ name: 'Calibri', size, bold, color: { argb: argb(hex) } })
export const center: Partial<Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
export const left: Partial<Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true }
const thin = { style: 'thin' as const, color: { argb: 'FFD5DDE0' } }
export const box: Partial<Borders> = { left: thin, right: thin, top: thin, bottom: thin }
export const bottomOnly: Partial<Borders> = { bottom: thin }

export const COL = {
  yellow: 'FFF2CC', green: '2E8B57', greenTint: 'EAF7EE', ...C,
} as const

/** A conditional-format fill. Excel reads a dxf pattern fill from bgColor, so it is always set. */
export const cfFill = (hex: string): Fill => ({
  type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) }, bgColor: { argb: argb(hex) },
})
