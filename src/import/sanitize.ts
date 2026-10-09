import JSZip from 'jszip'

/**
 * exceljs cannot read workbooks whose drawings/comments are written without the
 * `xdr:` prefix and with absolute relationship targets (openpyxl style): it throws
 * inside `reconcile`. We only read the `Data Input` cells, so drop the sheet
 * relationships, drawings and comments before handing the file to exceljs.
 */
export async function stripUnreadableParts(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(data)
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/(drawings|comments)\//.test(name) || /^xl\/worksheets\/_rels\//.test(name)) {
      zip.remove(name)
    }
  }
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue
    const xml = await zip.file(name)!.async('string')
    zip.file(name, xml.replace(/<(drawing|legacyDrawing)\b[^>]*\/>/g, ''))
  }
  const ct = zip.file('[Content_Types].xml')
  if (ct) {
    const xml = await ct.async('string')
    zip.file(
      '[Content_Types].xml',
      xml.replace(/<Override\b[^>]*\/(drawings|comments)\/[^>]*\/>/g, ''),
    )
  }
  return zip.generateAsync({ type: 'uint8array' })
}
