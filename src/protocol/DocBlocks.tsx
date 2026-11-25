import { SAR_LOGO_RATIO, SAR_LOGO_URL } from '../brand/logo'
import type { DocControl } from './docControl'

const TEAL = '#00778B'

/** The SAR document header: function / department / title on the left, the logo on the right (as in NSR-SWP-01-PM-MD). */
export function DocHeader({ doc, logoH = 26, size = 8 }: { doc: DocControl; logoH?: number; size?: number }) {
  return (
    <div style={{ background: '#fff', padding: '4px 10px 5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px dashed #C8C9C7' }}>
      <div style={{ fontSize: size, color: '#3D3935', lineHeight: 1.35 }}>
        <div><b>Function:</b> {doc.fn}<span style={{ marginLeft: 22 }}><b>Department:</b> {doc.dept}</span></div>
        <div><b>Document Title:</b> {doc.title}</div>
      </div>
      <img src={SAR_LOGO_URL} alt="SAR - Saudi Arabia Railways" style={{ height: logoH, width: logoH * SAR_LOGO_RATIO, display: 'block', flex: 'none' }} />
    </div>
  )
}

/** The SAR document footer bar: document no. / revision / effective date / page. Sits at the bottom of a (position: relative) page. */
export function DocFooter({ doc, page, size = 7 }: { doc: DocControl; page: number; size?: number }) {
  const cell = (label: string, value: string, w: string) => (
    <div style={{ flex: w, minWidth: 0 }}>
      <div style={{ background: TEAL, color: '#fff', fontWeight: 700, padding: '0 6px', fontSize: size }}>{label}</div>
      <div style={{ padding: '0 6px', fontSize: size + 0.5, color: '#3D3935', borderBottom: `2px solid ${TEAL}` }}>{value}</div>
    </div>
  )
  return (
    <div style={{ position: 'absolute', left: 9, right: 9, bottom: 5, display: 'flex', gap: 2 }}>
      {cell('Document No.', doc.docNo, '3')}{cell('Rev. No.', doc.rev, '1')}{cell('Effective Date', doc.effective, '3')}{cell('Page', String(page), '1')}
    </div>
  )
}
