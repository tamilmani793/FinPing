// Listed share prices (NSE / BSE) from Yahoo Finance's public chart and search endpoints.
//
// Yahoo does not allow browser requests from other sites, so this only works inside the Android app, where Capacitor's native
// HTTP (CapacitorHttp, switched on in capacitor.config.json) makes the call. In a browser the lookup fails and the screen
// asks you to type the price instead. Only the search text and the share symbol are sent; nothing about you.

const CACHE_KEY = 'finping_stock_price'
const CACHE_MS = 10 * 60 * 1000 // Yahoo rate-limits quick repeats, and a 10 minute old price is fine here

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch { return {} } }

// Companies whose name matches, on the NSE or BSE. [{ code: 'RELIANCE.NS', name: 'Reliance Industries Limited (NSE · RELIANCE.NS)' }]
export async function searchStocks(q) {
  const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=12&newsCount=0`)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const j = await res.json()
  return (j.quotes || [])
    .filter(x => x.quoteType === 'EQUITY' && /\.(NS|BO)$/.test(x.symbol || ''))
    .map(x => ({ code: x.symbol, name: `${x.longname || x.shortname || x.symbol} (${x.symbol.endsWith('.NS') ? 'NSE' : 'BSE'} · ${x.symbol})` }))
}

const dmy = ms => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

// Latest price of a share: { nav: price, date: 'dd-mm-yyyy', at, stale? } (the field is called nav so mutual funds and shares share code).
// Falls back to the last known price when the network fails.
export async function fetchPrice(symbol, { force = false } = {}) {
  const cache = readCache()
  const hit = cache[symbol]
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return hit
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const j = await res.json()
    const meta = j?.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)
    if (!(price > 0)) throw new Error('Price not found')
    const out = { nav: price, date: dmy((meta.regularMarketTime || Date.now() / 1000) * 1000), at: Date.now() }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, [symbol]: out })) } catch { /* storage full */ }
    return out
  } catch (e) {
    if (hit) return { ...hit, stale: true }
    throw e
  }
}
