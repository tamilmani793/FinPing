import { DEFAULT_RULES } from './rewardRules'
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

// ───────── Reading the rules out of the document ─────────
// rulesFromTerms turns a bank's terms PDF into the card's reward rules and REPLACES the current ones with them: the reward type, the rate on
// everything else, one rule per "X% on <spends>" sentence (with its cap and minimum spend), what earns nothing, the card's overall cap and when
// caps reset. Only what the document says is kept. Wording varies between banks, so the result lists exactly what was read and can be edited.

const CATEGORY_WORDS = [
  ['Grocery', /grocer|supermarket|kirana/i], ['Food & Dining', /food delivery|dining|restaurant|swiggy|zomato|eat ?out/i],
  ['Shopping', /e-?commerce|online shopping|online spends?|shopping|amazon|flipkart|myntra/i], ['Utilities & Bills', /utilit|bill pay|electricity|telecom|recharge/i],
  ['Travel', /travel|flight|hotel|airline|irctc|railway|cleartrip|makemytrip/i], ['Entertainment', /entertainment|movie|\bott\b|streaming|bookmyshow|netflix/i],
  ['Fuel', /\bfuel\b|petrol|diesel/i], ['Insurance', /insurance|premium/i], ['Education', /education|school|college|tuition/i], ['Rent', /\brent\b/i],
  ['Wallet Load', /wallet|prepaid card load/i], ['Jewellery & Gold', /jewel|\bgold\b/i], ['Government & Tax', /government|\btax\b|\bgst\b|municipal/i],
  ['Transport', /transport|\bcab\b|\buber\b|\bola\b/i], ['Health', /health|pharmac|medical|hospital/i],
]
const BRANDS = ['swiggy', 'zomato', 'amazon', 'flipkart', 'myntra', 'bigbasket', 'blinkit', 'zepto', 'uber', 'ola', 'bookmyshow', 'netflix', 'cleartrip', 'makemytrip', 'dmart', 'cult.fit', 'nykaa', 'ajio', 'tata 1mg', 'apollo', 'irctc', 'paytm', 'phonepe']
const ALL_OTHER = /all other|every other|other (?:retail |online |offline )?(?:spends?|purchases?|transactions?|categories|merchants?)|(?:on )?all (?:retail |other )?(?:spends?|purchases?|transactions?)|any other|everything else|remaining/i
const NO_REWARD = /(?:\bno\b|\bnot\b|\bnil\b|won't|exclud\w+|except|ineligible)[^.]{0,90}?(?:reward|cash\s?back|points?)|(?:reward|cash\s?back|points?)[^.]{0,80}?(?:not (?:be )?(?:earned|awarded|applicable|eligible|credited|accrued)|excluded|will not)/i
const RS = '(?:₹|rs\\.?|inr)\\s*'

const categoriesIn = s => CATEGORY_WORDS.filter(([, re]) => re.test(s)).map(([c]) => c)
const brandsIn = s => { const low = s.toLowerCase(); return BRANDS.filter(b => new RegExp(`(?<![a-z])${b.replace('.', '\\.')}(?![a-z])`).test(low)) }
function mccsIn(s) {
  const out = new Set()
  if (!/mcc|merchant category/i.test(s)) return []
  for (const c of s.matchAll(/(?<![₹\d,.])\b([1-9]\d{3})\b(?![,.]?\d)/g)) { const n = Number(c[1]); if (!(n >= 1990 && n <= 2100)) out.add(n) }
  return [...out]
}
const capOf = s => {
  const m = s.match(new RegExp(`(?:up\\s?to|max(?:imum)?(?: of)?|cap(?:ped)?(?: at| of)?|limit(?:ed)? (?:of|to)|not exceed(?:ing)?)\\D{0,30}?(?:${RS})?(\\d[\\d,]*)(?!\\s*%)`, 'i'))
  const n = m ? toNum(m[1]) : 0
  return n >= 50 && n <= 1000000 ? n : null
}
const minOf = s => {
  const m = s.match(new RegExp(`minimum (?:transaction|spend|purchase)[^₹\\dRr]{0,25}${RS}(\\d[\\d,]*)`, 'i'))
  return m ? toNum(m[1]) : null
}

// the rates written in a clause: [{ value, per }]; points "4 points per ₹150", cashback "5%"
function ratesIn(clause, points) {
  const out = []
  if (points) {
    for (const m of clause.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:reward\\s*|cash\\s*)?points?\\s*(?:for|per|on|every|/)\\s*(?:every\\s*)?(?:${RS})?(\\d[\\d,]*)`, 'gi'))) out.push({ value: Number(m[1]), per: toNum(m[2]), blockBased: true })
    for (const m of clause.matchAll(new RegExp(`${RS}(\\d[\\d,]*)\\s*(?:spent|spend)?\\s*(?:=|-|:|earns?|gets?)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:reward\\s*|cash\\s*)?points?`, 'gi'))) out.push({ value: Number(m[2]), per: toNum(m[1]), blockBased: true })
  } else {
    for (const m of clause.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) { const v = Number(m[1]); if (v > 0 && v <= 30) out.push({ value: v, per: 100, blockBased: false }) }
  }
  return out
}

export function rulesFromTerms(rawText, cardId) {
  // "Rs. 1,500" would otherwise look like the end of a sentence
  const text = clean(rawText).replace(/\b(?:rs|inr)\.?\s*(?=\d)/gi, '₹')
  const published = publishedDate(rawText)
  const sentences = text.split(/(?<=[.!?])\s+|•|❖|o\s(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 12)
  const reward = sentences.filter(s => /cash\s?back|cash\s?points?|reward|points|value\s?back/i.test(s))
  const earning = reward.filter(s => !/redeem|redemption|handling|surcharge|lounge|annual fee|joining fee|membership fee|renewal|expire|expiry/i.test(s))
  const nPoints = (reward.join(' ').match(/reward points?|cash\s?points?|\bpoints\b/gi) || []).length
  const nCash = (reward.join(' ').match(/cash\s?back/gi) || []).length
  const points = nPoints > nCash
  let base = null, baseCap = null, cardCap = null
  const found = []
  const exclCats = new Set(), exclMerch = new Set(), exclMccs = new Set()

  for (const s of earning) {
    // what earns nothing
    if (NO_REWARD.test(s) && !ratesIn(s, points).length) {
      for (const c of categoriesIn(s)) exclCats.add(c)
      for (const b of brandsIn(s)) exclMerch.add(b)
      for (const m of mccsIn(s)) exclMccs.add(m)
      continue
    }
    const clauses = s.split(/;|,\s*(?=\d+(?:\.\d+)?\s*%)|\band\s+(?=\d+(?:\.\d+)?\s*%)|\bwhile\b|\bwhereas\b/i)
    for (const clause of clauses) {
      const rates = ratesIn(clause, points)
      if (!rates.length) {
        // "total cashback capped at ₹X per statement cycle": the card's overall cap
        const c = capOf(clause)
        if (c && /total|overall|all categories|combined|aggregate|maximum cash|maximum reward/i.test(clause) && cardCap == null) cardCap = c
        continue
      }
      const rate = rates[0], cap = capOf(clause) ?? capOf(s)
      const cats = categoriesIn(clause), brands = brandsIn(clause), mccs = mccsIn(clause)
      if (ALL_OTHER.test(clause) || (!cats.length && !brands.length && !mccs.length)) { if (!base) { base = rate; baseCap = cap } continue }
      const sig = JSON.stringify([rate, cats, brands, mccs])
      if (found.some(r => r.sig === sig)) continue
      const words = [...cats, ...brands.map(b => b.replace(/\b\w/g, c => c.toUpperCase()))]
      found.push({
        sig, id: 'd' + (found.length + 1) + Date.now().toString(36), label: `${points ? `${rate.value} pts per ₹${rate.per}` : `${rate.value}%`} on ${words.slice(0, 3).join(', ') || 'selected spends'}`,
        rate, categories: cats, merchants: brands, mccs, minSpend: minOf(clause) ?? minOf(s) ?? '', capPerCycle: cap ?? null,
      })
    }
  }
  if (!base && !found.length) return { found: false, published }

  const notes = []
  const rules = {
    ...DEFAULT_RULES(cardId), rewardType: points ? 'points' : 'cashback',
    base: base || { value: 0, per: 100, blockBased: false }, baseCap: base ? baseCap : null,
    accelerated: found.map(({ sig, ...r }) => r),
    exclusions: { mccs: [...exclMccs], categories: [...exclCats], merchants: [...exclMerch] },
  }
  if (!base) notes.push('The document does not give a rate for other spends, so they earn nothing until you add one.')
  if (cardCap != null) rules.capPerCycle = cardCap
  const cal = (text.match(/calendar month/gi) || []).length, cyc = (text.match(/billing cycle|statement cycle|billing period|statement period/gi) || []).length
  if (cal !== cyc) rules.capPeriod = cal > cyc ? 'calendarMonth' : 'billingCycle'
  const block = text.match(new RegExp(`multiples? of\\s*${RS}(\\d[\\d,]*)`, 'i'))
  if (block && toNum(block[1]) >= 10) rules.spendBlock = toNum(block[1])
  return { found: true, rules, notes, published }
}
