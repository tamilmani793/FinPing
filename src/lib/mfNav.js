// Mutual fund NAVs from api.mfapi.in (the AMFI daily NAV data, with CORS enabled so the app can call it directly).

const CACHE_KEY = 'finping_mf_nav'
const CACHE_MS = 3 * 60 * 60 * 1000 // NAVs change once a day, so 3 hours is plenty

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch { return {} } }

// Schemes whose name contains every word typed. [{ code, name }]
export async function searchSchemes(q) {
  const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q.trim())}`)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const list = await res.json()
  return (Array.isArray(list) ? list : []).slice(0, 40).map(s => ({ code: s.schemeCode, name: s.schemeName }))
}

// Latest NAV of a scheme: { nav, date: 'dd-mm-yyyy', at, stale? }. Falls back to the last known NAV when offline.
export async function fetchNav(code, { force = false } = {}) {
  const cache = readCache()
  const hit = cache[code]
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return hit
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${code}/latest`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const j = await res.json()
    const d = j?.data?.[0]
    const nav = parseFloat(d?.nav)
    if (!(nav > 0)) throw new Error('NAV not found')
    const out = { nav, date: d.date, at: Date.now() }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, [code]: out })) } catch { /* storage full */ }
    return out
  } catch (e) {
    if (hit) return { ...hit, stale: true }
    throw e
  }
}
