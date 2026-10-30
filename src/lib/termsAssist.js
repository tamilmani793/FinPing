// Checks a bank's terms-and-conditions PDF against a card's reward rules, entirely on the phone. It does NOT rewrite your rules: it reads the PDF
// text, picks out the numbers that matter (rates, caps, minimum spends, MCC codes, how often caps reset) and lists what the PDF says that
// your rules do not, and the other way round. You then change the rules yourself, or import a pack. Wording differs from bank to bank, so
// treat every line as a prompt to look, not as a verdict.

export async function readTermsText(arrayBuffer, password, pdfjs) {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), password: password || undefined, isEvalSupported: false }).promise
  let out = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    let line = '', y = null
    for (const it of tc.items) {
      const yy = Math.round(it.transform[5])
      if (y !== null && Math.abs(yy - y) > 3) { out += line.trim() + '\n'; line = '' }
      line += it.str + ' '
      y = yy
    }
    out += line.trim() + '\n'
  }
  return out
}

const clean = t => String(t).replace(/(\d)\s*(st|nd|rd|th)\b/gi, '$1').replace(/[`]/g, '₹').replace(/\s+/g, ' ')
const toNum = s => Number(String(s).replace(/,/g, ''))
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function publishedDate(text) {
  const m = clean(text).match(/published on\s*(\d{1,2})[\s-]+([A-Za-z]{3,9}|\d{1,2})[\s-]+(\d{4})/i)
  if (!m) return null
  const mon = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
  if (mon < 0) return null
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}

const sameNum = (a, b) => Math.abs(a - b) < 1e-9
const fmt = n => Number(n).toLocaleString('en-IN')

export function checkTerms(rawText, rules) {
  const text = clean(rawText)
  const lines = [], add = (tone, msg) => lines.push({ tone, text: msg })
  const published = publishedDate(rawText)
  const sentences = text.split(/(?<=[.!?])\s+|•|❖|o\s(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 12)
  const reward = sentences.filter(s => /cash\s?back|cash\s?points?|reward|points/i.test(s))
  // sentences about earning (not redeeming, fees, fuel surcharge or lounges)
  const earning = reward.filter(s => !/redeem|redemption|handling|surcharge|lounge|annual fee|joining fee|membership fee/i.test(s))

  // rates: "5% cashback" -> 5 ; the rules hold the same number (cashback %) or points per ₹100
  const pdfRates = new Set()
  for (const s of reward) for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) pdfRates.add(Number(m[1]))
  const myRates = new Set([rules.base, ...(rules.accelerated || []).map(a => a.rate)].filter(Boolean).map(r => (Number(r.per) > 0 ? (Number(r.value) / Number(r.per)) * 100 : 0)))
  for (const r of pdfRates) if (r > 0 && r <= 30 && ![...myRates].some(x => sameNum(x, r))) add('diff', `The PDF mentions ${r}% on rewards, which none of your rates equal.`)
  for (const r of myRates) if (r > 0 && pdfRates.size && ![...pdfRates].some(x => sameNum(x, r))) add('diff', `Your rules have ${Math.round(r * 100) / 100}% but the PDF does not mention it.`)

  // caps: numbers beside "cap / capping / maximum / up to / upto" in reward sentences
  const pdfCaps = new Set()
  for (const s of earning) for (const m of s.matchAll(/(?:cap(?:ping|ped)?|maxim\w+|up\s?to|upto|limit)\D{0,40}?(?:₹|rs\.?|inr)?\s*(\d[\d,]*)(?!\s*%)/gi)) { const n = toNum(m[1]); if (n >= 100 && n <= 100000) pdfCaps.add(n) }
  // "₹1,500 per billing cycle" / "1000 per calendar month" also reads as a cap
  for (const s of earning) for (const m of s.matchAll(/(?:₹|rs\.?|inr)\s*(\d[\d,]*)\s*(?:per|a|\/)\s*(?:billing |statement |calendar )?(?:cycle|month)/gi)) { const n = toNum(m[1]); if (n >= 100 && n <= 100000) pdfCaps.add(n) }
  const myCaps =new Set([rules.capPerCycle, rules.baseCap, ...(rules.accelerated || []).map(a => a.capPerCycle)].filter(v => v != null && v !== '').map(Number))
  for (const c of pdfCaps) if (!myCaps.has(c)) add('diff', `The PDF mentions a cap of ${fmt(c)} that is not in your rules.`)
  for (const c of myCaps) if (pdfCaps.size && !pdfCaps.has(c)) add('diff', `Your rules have a cap of ${fmt(c)} that the PDF does not mention.`)

  // minimum spend
  const mins = [...earning.join(' ').matchAll(/minimum (?:transaction|spend)[^₹\dRr]{0,20}(?:₹|rs\.?)\s*(\d[\d,]*)/gi)].map(m => toNum(m[1]))
  const myMins = new Set([rules.minSpend, ...(rules.accelerated || []).map(a => a.minSpend)].filter(v => Number(v) > 0).map(Number))
  for (const n of new Set(mins)) if (!myMins.has(n)) add('diff', `The PDF mentions a minimum transaction of ₹${fmt(n)} that is not in your rules.`)

  // when caps reset
  const cal = (text.match(/calendar month/gi) || []).length, cyc = (text.match(/billing cycle|statement cycle|billing period|statement period/gi) || []).length
  const says = cal > cyc ? 'calendarMonth' : cyc > cal ? 'billingCycle' : null
  if (says && says !== (rules.capPeriod || 'billingCycle')) add('diff', `The PDF talks mostly about ${says === 'calendarMonth' ? 'calendar months' : 'billing cycles'}, but your caps reset every ${(rules.capPeriod || 'billingCycle') === 'calendarMonth' ? 'calendar month' : 'billing cycle'}.`)

  // MCC codes the PDF lists
  const pdfMccs = new Set()
  for (const m of text.matchAll(/mcc[^.]{0,300}/gi)) {
    for (const c of m[0].matchAll(/(?<![₹\d,.])(?<!rs\.? )\b([1-9]\d{3})\b(?![,.]?\d)/gi)) {
      const n = Number(c[1])
      if (n >= 1990 && n <= 2100) continue // a year, not a code
      pdfMccs.add(c[1])
    }
  }
  const myMccs = new Set([...(rules.exclusions?.mccs || []), ...(rules.accelerated || []).flatMap(a => [...(a.mccs || []), ...(a.excludeMccs || [])])].map(String))
  const missing = [...pdfMccs].filter(c => !myMccs.has(c))
  if (missing.length) add('diff', `MCC codes in the PDF that are not in your rules: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ` and ${missing.length - 40} more` : ''}.`)

  if (!lines.length) add('ok', 'Nothing in the PDF disagrees with these rules (rates, caps, minimum spend, how often caps reset and MCC codes).')
  return { published, lines, found: { rates: [...pdfRates], caps: [...pdfCaps], mccs: [...pdfMccs] } }
}
