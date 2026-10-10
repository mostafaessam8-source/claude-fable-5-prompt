let ctx: CanvasRenderingContext2D | null | undefined

/** Width in px of `text` in the given CSS font (a canvas measurement; a character estimate where there is no canvas). */
export function textWidth(text: string, font: string, fallbackPx = 7): number {
  if (ctx === undefined) {
    try { ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d') } catch { ctx = null }
  }
  if (!ctx) return text.length * fallbackPx
  ctx.font = font
  return ctx.measureText(text).width
}
