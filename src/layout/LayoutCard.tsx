import { C } from '../report/brand'
import type { SiteLayout } from './parse'

/** Schematic of one location (brief §5): fence, north arrow, track, work zone, cells, flow. */
export function LayoutCard({ layout }: { layout: SiteLayout }) {
  const W = 220, H = 190, TITLE = 22, CAP = 24
  const n = layout.cells && layout.cells > 0 ? Math.min(layout.cells, 8) : 0
  const zoneX = 34, zoneW = 152, zoneY = 52, zoneH = 92
  const gap = 4
  const cellW = n ? (zoneW - 12 - gap * (n - 1)) / n : 0
  const title = [layout.code, layout.chainage].filter(Boolean).join('  -  ')
  const left = layout.cells != null ? `${layout.cells} CELL${layout.cells === 1 ? '' : 'S'}` : 'CELLS: -'
  const right = [layout.otmp, layout.station].filter(Boolean).join(' – ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: C.tint1 }} role="img"
      aria-label={`Layout ${layout.code}`} fontFamily="Calibri, Inter, sans-serif">
      <rect width={W} height={H} fill={C.tint1} stroke={C.grey} />
      <rect width={W} height={TITLE} fill={C.blue} />
      <text x={8} y={15} fill="#fff" fontSize={11} fontWeight={700}>{title}</text>

      {/* fence lines */}
      <line x1={6} x2={W - 6} y1={TITLE + 8} y2={TITLE + 8} stroke={C.slate} strokeWidth={1} strokeDasharray="5 3" />
      <line x1={6} x2={W - 6} y1={H - CAP - 8} y2={H - CAP - 8} stroke={C.slate} strokeWidth={1} strokeDasharray="5 3" />

      {/* north arrow */}
      <g transform={`translate(${W - 18}, ${TITLE + 30})`}>
        <polygon points="0,-12 5,4 0,1 -5,4" fill={C.black} />
        <text y={14} textAnchor="middle" fontSize={8} fontWeight={700} fill={C.black}>N</text>
      </g>

      {/* ballasted track band with two rails */}
      <rect x={0} y={78} width={W} height={32} fill={C.grey} />
      <line x1={0} x2={W} y1={86} y2={86} stroke={C.black} strokeWidth={2} />
      <line x1={0} x2={W} y1={102} y2={102} stroke={C.black} strokeWidth={2} />
      {Array.from({ length: 22 }, (_, i) => (
        <line key={i} x1={5 + i * 10} x2={5 + i * 10} y1={84} y2={104} stroke={C.slate} strokeWidth={1} />
      ))}

      {/* red dashed work / excavation zone */}
      <rect x={zoneX} y={zoneY} width={zoneW} height={zoneH} fill="none" stroke={C.red} strokeWidth={1.5} strokeDasharray="6 3" />

      {/* one teal box per cell */}
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={zoneX + 6 + i * (cellW + gap)} y={zoneY + 10} width={cellW} height={zoneH - 20} fill={C.blue} fillOpacity={0.88} stroke="#fff" />
          <text x={zoneX + 6 + i * (cellW + gap) + cellW / 2} y={zoneY + zoneH / 2 + 3} textAnchor="middle" fill="#fff" fontSize={n > 4 ? 6.5 : 8} fontWeight={700}>
            CELL {i + 1}
          </text>
        </g>
      ))}

      {/* flow arrow */}
      <g stroke={C.black} fill={C.black}>
        <line x1={60} x2={152} y1={H - CAP - 22} y2={H - CAP - 22} strokeWidth={1.5} />
        <polygon points={`158,${H - CAP - 22} 150,${H - CAP - 26} 150,${H - CAP - 18}`} />
      </g>
      <text x={106} y={H - CAP - 26} textAnchor="middle" fontSize={7} fontWeight={700} fill={C.black}>FLOW</text>

      {/* caption bar */}
      <rect y={H - CAP} width={W} height={CAP} fill={C.black} />
      <text x={8} y={H - 8} fill="#fff" fontSize={10} fontWeight={700}>{left}</text>
      <text x={W - 8} y={H - 8} fill="#fff" fontSize={10} fontWeight={700} textAnchor="end">{right}</text>
    </svg>
  )
}

export function LayoutCards({ layouts }: { layouts: SiteLayout[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      {layouts.map((l, i) => <div key={i} style={{ flex: '1 1 0', minWidth: 0 }}><LayoutCard layout={l} /></div>)}
    </div>
  )
}
