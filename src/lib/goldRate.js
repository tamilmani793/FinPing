// Physical gold: live rates by city (from goodreturns.in) and the price maths for a coin / bar purchase.

export const GOLD_CITIES = [
  ['chennai', 'Chennai'], ['bangalore', 'Bengaluru'], ['mumbai', 'Mumbai'], ['delhi', 'Delhi'], ['hyderabad', 'Hyderabad'],
  ['kolkata', 'Kolkata'], ['pune', 'Pune'], ['ahmedabad', 'Ahmedabad'], ['jaipur', 'Jaipur'], ['lucknow', 'Lucknow'],
  ['kochi', 'Kochi'], ['kerala', 'Kerala'], ['coimbatore', 'Coimbatore'], ['madurai', 'Madurai'], ['trichy', 'Trichy'],
  ['salem', 'Salem'], ['erode', 'Erode'], ['vellore', 'Vellore'], ['tirupur', 'Tirupur'], ['tirunelveli', 'Tirunelveli'],
  ['thanjavur', 'Thanjavur'], ['hosur', 'Hosur'], ['kanchipuram', 'Kanchipuram'], ['pondicherry', 'Pondicherry'],
  ['mysore', 'Mysuru'], ['mangalore', 'Mangaluru'], ['visakhapatnam', 'Visakhapatnam'], ['vijayawada', 'Vijayawada'],
  ['guntur', 'Guntur'], ['nagpur', 'Nagpur'], ['surat', 'Surat'], ['vadodara', 'Vadodara'], ['indore', 'Indore'],
  ['bhopal', 'Bhopal'], ['chandigarh', 'Chandigarh'], ['patna', 'Patna'], ['bhubaneswar', 'Bhubaneswar'],
  ['guwahati', 'Guwahati'], ['goa', 'Goa'], ['gurgaon', 'Gurugram'], ['noida', 'Noida'], ['ghaziabad', 'Ghaziabad'],
].map(([slug, label]) => ({ value: slug, label }))

const CACHE_KEY = 'finping_gold_rates'
const CACHE_MS = 30 * 60 * 1000

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch { return {} } }

// ₹ per gram for 24K, 22K and 18K in a city, read from the goodreturns.in city page. Cached for 30 minutes; if the
// network fails the last known rate (even if old) is returned, with `stale: true`. Throws only when there is none.
export async function fetchGoldRates(city, { force = false } = {}) {
  const cache = readCache()
  const hit = cache[city]
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return hit
  try {
    const res = await fetch(`https://www.goodreturns.in/gold-rates/${city}.html`)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const html = await res.text()
    const pick = k => {
      const m = new RegExp(`id="${k}K-price"[^>]*>\\s*(?:&#x20b9;|₹)\\s*([\\d,]+(?:\\.\\d+)?)`, 'i').exec(html)
      return m ? parseFloat(m[1].replace(/,/g, '')) : null
    }
    const rates = { k24: pick(24), k22: pick(22), k18: pick(18), at: Date.now(), city, history: parseHistory(html) }
    if (!rates.k24) throw new Error('Rate not found on the page')
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, [city]: rates })) } catch { /* storage full */ }
    return rates
  } catch (e) {
    if (hit) return { ...hit, stale: true }
    throw e
  }
}

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }

// The "last 10 days" table on the page: { 'yyyy-mm-dd': { k24, k22 } }
function parseHistory(html) {
  const out = {}
  const i = html.indexOf('Last 10 Days')
  if (i < 0) return out
  const rows = html.slice(i).split('<tr>').slice(1, 14)
  for (const row of rows) {
    const d = /<td>\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*<\/td>/.exec(row)
    const p = [...row.matchAll(/(?:&#x20b9;|₹)\s*([\d,]+(?:\.\d+)?)/g)].map(m => parseFloat(m[1].replace(/,/g, '')))
    if (d && p.length >= 2 && MONTHS[d[1].toLowerCase()]) out[`${d[3]}-${MONTHS[d[1].toLowerCase()]}-${d[2].padStart(2, '0')}`] = { k24: p[0], k22: p[1] }
  }
  return out
}

// ₹ per gram on a given day (yyyy-mm-dd) for a purity: from the 10-day history, or today's rate if that is today; else 0.
// 18K is not in the history, so it is taken as 75% of 24K.
export function rateOnDate(rates, iso, purity) {
  if (!rates) return 0
  const today = new Date(); const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const day = rates.history?.[iso] || (iso === t ? rates : null)
  if (!day) return 0
  return purity === '22' ? day.k22 : purity === '18' ? Math.round(day.k24 * 0.75) : day.k24
}

export const purityRate =(rates, purity) => (!rates ? 0 : purity === '22' ? rates.k22 : purity === '18' ? rates.k18 : rates.k24) || 0

const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0 }
const r2 = v => Math.round(v * 100) / 100

// Split purchase: grams × rate per gram, plus making charge, plus GST on both (3% by default).
export function splitPrice({ grams, rate, making, gstPct }) {
  const gold = r2(n(grams) * n(rate))
  const mk = r2(n(making))
  const gst = r2((gold + mk) * n(gstPct) / 100)
  return { gold, making: mk, gst, total: r2(gold + mk + gst) }
}

// Coin bought at the seller's MRP: the net price is MRP less cashback.
export function coinPrice({ mrp, cashback }) {
  const m = n(mrp), c = Math.min(n(cashback), m)
  return { mrp: r2(m), cashback: r2(c), net: r2(m - c) }
}
