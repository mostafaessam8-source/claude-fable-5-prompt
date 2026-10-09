import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LayoutCard } from '../layout/LayoutCard'
import type { SiteLayout } from '../layout/parse'
import type { CardsImage } from './siteLayouts'

const W = 220, H = 190, GAP = 6

/** All layout cards side by side in one standalone SVG document (pure; testable without a browser). */
export function cardsSvg(layouts: SiteLayout[]) {
  const w = layouts.length * W + Math.max(0, layouts.length - 1) * GAP
  const cards = layouts.map((l, i) => {
    const markup = renderToStaticMarkup(createElement(LayoutCard, { layout: l }))
    // nest it at its slot; drop the responsive style so the explicit size applies
    return markup.replace(/^<svg /, `<svg x="${i * (W + GAP)}" y="0" width="${W}" height="${H}" `).replace(/ style="[^"]*"/, '')
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}"><rect width="${w}" height="${H}" fill="#ffffff"/>${cards.join('')}</svg>`
  return { svg, width: w, height: H }
}

/** Rasterise the cards to a PNG with the browser's canvas (3x for a crisp picture in Excel). */
export async function cardsPng(layouts: SiteLayout[], scale = 3): Promise<CardsImage> {
  const { svg, width, height } = cardsSvg(layouts)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'))
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}
