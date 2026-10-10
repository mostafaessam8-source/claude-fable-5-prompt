import { embed, DATA_ID, type OfflinePayload } from './offline'

/**
 * Build the single-file offline copy: this deployed page with its script and stylesheet inlined and the project
 * embedded. Only works from the built app (the dev server serves modules that cannot be inlined).
 */
export async function buildOfflineHtml(payload: OfflinePayload): Promise<string> {
  // Already running from a single-file copy (the contractor's): its scripts and styles are inline in this very page, so
  // the page itself, emptied of what React drew and with the data swapped for the current project, is the new file.
  const own = document.getElementById(DATA_ID)
  if (own) {
    const root = document.documentElement.cloneNode(true) as HTMLElement
    root.querySelector('#root')?.replaceChildren()
    root.removeAttribute('style')
    root.querySelector(`#${DATA_ID}`)!.textContent = embed(payload)
    return `<!doctype html>\n${root.outerHTML}`
  }
  if (import.meta.env.DEV) throw new Error('The offline copy can only be made from the built app (the GitHub Pages site), not the dev server.')
  const base = new URL('index.html', document.baseURI)
  const res = await fetch(base, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not read the app's page (${res.status}).`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const safe = (code: string) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')

  for (const el of Array.from(doc.querySelectorAll('script[src]'))) {
    const r = await fetch(new URL(el.getAttribute('src')!, base))
    if (!r.ok) throw new Error(`Could not read ${el.getAttribute('src')} (${r.status}).`)
    const s = doc.createElement('script')
    s.type = el.getAttribute('type') || 'text/javascript'
    s.textContent = safe(await r.text())
    el.replaceWith(s)
  }
  for (const el of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))) {
    const r = await fetch(new URL(el.getAttribute('href')!, base))
    if (!r.ok) throw new Error(`Could not read ${el.getAttribute('href')} (${r.status}).`)
    const st = doc.createElement('style')
    st.textContent = (await r.text()).replace(/<\/style/gi, '<\\/style')
    el.replaceWith(st)
  }
  doc.querySelectorAll('link[rel="modulepreload"], link[rel="icon"]').forEach((e) => e.remove())

  const data = doc.createElement('script')
  data.type = 'application/json'
  data.id = DATA_ID
  data.textContent = embed(payload)
  doc.head.prepend(data)
  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}
