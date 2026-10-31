import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import presets from '../data/cardRewardPresets.json'
import { db } from '../db/schema'
import { cardTitle } from './cardCatalog'
import { getRules, saveRules } from './rewardTagging'
import { DEFAULT_RULES } from './rewardRules'

// Reward rules travel as a "rules pack": { format: 'finping-reward-rules', revision, cards: [{ key, name, effectiveFrom, publishedOn, source, rules }] }.
// The pack bundled with the app (src/data/cardRewardPresets.json) and a file you import or export use the same shape, so a bank's change is
// a data change: edit the rules in the app, or import a newer pack. Applying a pack never touches transactions, only the rules, and it is
// always kept as a new version so earlier spends are still worked out with the rules that applied then.

export const PACK_FORMAT = 'finping-reward-rules'
export const bundledPack = () => presets

// Cards you added by uploading a document (or corrected from one) are kept on this phone and listed with the bundled ones.
// A saved card with the same key as a bundled one replaces it.
const CUSTOM_KEY = 'finping_custom_cards'
export const customCards = () => { try { const j = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); return Array.isArray(j) ? j : [] } catch { return [] } }
export function saveCustomCard(entry) {
  const list = customCards().filter(c => c.key !== entry.key)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify([...list, entry]))
}
export const isCustomCard = key => customCards().some(c => c.key === key)
export function allPack() {
  const mine = customCards(), keys = new Set(mine.map(c => c.key))
  return { ...presets, cards: [...presets.cards.filter(c => !keys.has(c.key)), ...mine] }
}

// everything about a card that is not a rule: forex, fees, how rewards are credited and redeemed, offers. Kept with the card's rules.
export const buildInfo = entry => ({
  postedOn: entry.postedOn || null, redemption: entry.redemption || null, benefits: entry.benefits || null,
  feesAndCharges: entry.feesAndCharges || null, details: entry.details || null,
})

export function parsePack(text) {
  let j
  try { j = JSON.parse(text) } catch { throw new Error('That is not a rules file.') }
  if (j?.format !== PACK_FORMAT || !Array.isArray(j.cards)) throw new Error('That is not a FinPing rules file.')
  return j
}

// which pack entry is this card? Judged by the card's own name first, and only for the bank that issues the preset:
// an HDFC card is never matched to an SBI or HSBC preset, and a word in the network or variant cannot override what the name says.
const HINTS = [
  ['hdfc-upi-rupay', /hdfc/i, /rupay|upi/i],
  ['hdfc-millennia', /hdfc/i, /millennia/i],
  ['hdfc-swiggy', /hdfc/i, /swiggy/i],
  ['sbi-cashback', /sbi|state bank/i, /cashback/i],
  ['hsbc-live-plus', /hsbc/i, /live\s*\+|live plus/i],
]
export function suggestEntry(card, pack = allPack()) {
  const name = [card?.name, card?.cardName].filter(Boolean).join(' ')
  const bank = [card?.bank, name].filter(Boolean).join(' ')
  const extra = [card?.variant, card?.partner].filter(Boolean).join(' ')
  // the bundled Swiggy rules are for the original card; Ornge and BLCK earn differently, so never guess for them
  if (/swiggy/i.test(name + ' ' + extra) && /ornge|orange|blck|black/i.test(name + ' ' + extra)) return null
  const find = text => HINTS.find(([, b, re]) => b.test(bank) && re.test(text))
  // 1) the name; 2) the variant / co-brand; 3) only a RuPay network on an HDFC card with no other product named
  let hit = find(name) || find(extra)
  if (!hit && /rupay/i.test(card?.network || '') && /hdfc/i.test(bank) && !/millennia|swiggy|regalia|infinia|diners|moneyback|pixel|tata|indianoil|freedom/i.test(name)) hit = HINTS[0]
  if (hit) return pack.cards.find(c => c.key === hit[0]) || null
  return matchByWords(pack, bank, name)
}

// cards added to the pack with `match` words (lowercase words of the card's name): same bank, and the longest matching word wins
const ALIASES = { 'state bank of india': ['sbi', 'state bank'], 'american express': ['amex', 'american express'], 'kotak mahindra bank': ['kotak'] }
const sameBank = (issuer, bank) => {
  const key = String(issuer || '').toLowerCase(), low = bank.toLowerCase()
  return low.includes(key) || low.includes(key.split(' ')[0]) || (ALIASES[key] || []).some(a => low.includes(a))
}
// whole words only: 'ace' must not match 'place', 'neo' must not match 'neon'
const wordIn = (text, word) => (' ' + text.split(/[^a-z0-9+]+/).join(' ') + ' ').includes(' ' + word + ' ')
function matchByWords(pack, bank, name) {
  const low = name.toLowerCase()
  let best = null, bestLen = 0
  for (const c of pack.cards) {
    if (!Array.isArray(c.match) || !sameBank(c.issuer, bank)) continue
    for (const w of c.match) {
      const k = String(w).toLowerCase()
      if (k && wordIn(low, k) && k.length > bestLen) { best = c; bestLen = k.length }
    }
  }
  return best
}

// the stored rules for a pack entry (notes and other pack-only text stay out of the database rows)
export function rulesFromEntry(cardId, entry) {
  const r = entry.rules || {}
  return {
    ...DEFAULT_RULES(cardId), ...r, cardId, enabled: true,
    accelerated: (r.accelerated || []).map(a => ({ ...a })),
    exclusions: { mccs: [], categories: [], merchants: [], ...(r.exclusions || {}) },
    effectiveFrom: entry.effectiveFrom || null, publishedOn: entry.publishedOn || null, source: entry.source || null, presetKey: entry.key || null,
    info: buildInfo(entry),
  }
}

export async function applyEntry(cardId, entry) {
  const rules = rulesFromEntry(cardId, entry)
  const old = await getRules(cardId)
  if (old) rules.history = old.history || []
  return saveRules(rules, { asNewVersion: !!old })
}

export async function exportPack(cardId, title = '') {
  const row = await getRules(cardId)
  if (!row) return null
  const { id, cardId: _c, updatedAt, history, presetKey, ...rest } = row
  const { effectiveFrom, publishedOn, source, ...rules } = rest
  return { format: PACK_FORMAT, revision: new Date().toISOString().slice(0, 10), cards: [{ key: presetKey || 'custom', name: title, effectiveFrom, publishedOn, source, rules }] }
}

// ---- what changed between two sets of rules, in plain words (shown before anything is applied) ----
const money = v => (v == null || v === '' ? 'no cap' : v)
const rateText = (r, type) => (type === 'points' ? `${r?.value} pts per ₹${r?.per}` : `${r?.value}%`)
const codes = a => new Set((a || []).map(String))

export function diffRules(oldR, newR) {
  if (!oldR) return ['New rules for this card']
  const out = []
  const t = newR.rewardType
  const chk = (label, a, b) => { if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push(`${label}: ${a == null || a === '' ? 'none' : a} → ${b == null || b === '' ? 'none' : b}`) }
  if (oldR.rewardType !== newR.rewardType) out.push(`Reward type: ${oldR.rewardType} → ${newR.rewardType}`)
  if (rateText(oldR.base, oldR.rewardType) !== rateText(newR.base, t)) out.push(`Base rate: ${rateText(oldR.base, oldR.rewardType)} → ${rateText(newR.base, t)}`)
  chk('Minimum spend', oldR.minSpend || 0, newR.minSpend || 0)
  chk('Card cap', money(oldR.capPerCycle), money(newR.capPerCycle))
  chk('Base rate cap', money(oldR.baseCap), money(newR.baseCap))
  chk('Caps reset', oldR.capPeriod || 'billingCycle', newR.capPeriod || 'billingCycle')
  chk('Earns on blocks of ₹', oldR.spendBlock || 0, newR.spendBlock || 0)
  chk('Rounding', oldR.rounding || 'floor', newR.rounding || 'floor')
  const oa = new Map((oldR.accelerated || []).map(a => [a.label, a])), na = new Map((newR.accelerated || []).map(a => [a.label, a]))
  for (const [k, a] of na) {
    const o = oa.get(k)
    if (!o) { out.push(`New rule: ${k} (${rateText(a.rate, t)}, cap ${money(a.capPerCycle)})`); continue }
    if (rateText(o.rate, oldR.rewardType) !== rateText(a.rate, t)) out.push(`${k}: rate ${rateText(o.rate, oldR.rewardType)} → ${rateText(a.rate, t)}`)
    if ((o.capPerCycle ?? null) !== (a.capPerCycle ?? null)) out.push(`${k}: cap ${money(o.capPerCycle)} → ${money(a.capPerCycle)}`)
    if ((o.minSpend || 0) !== (a.minSpend || 0)) out.push(`${k}: minimum ₹${o.minSpend || 0} → ₹${a.minSpend || 0}`)
    const am = [...codes(a.mccs)].filter(x => !codes(o.mccs).has(x)), rm = [...codes(o.mccs)].filter(x => !codes(a.mccs).has(x))
    if (am.length) out.push(`${k}: MCC added ${am.join(', ')}`)
    if (rm.length) out.push(`${k}: MCC removed ${rm.join(', ')}`)
  }
  for (const k of oa.keys()) if (!na.has(k)) out.push(`Rule removed: ${k}`)
  const ae = [...codes(newR.exclusions?.mccs)].filter(x => !codes(oldR.exclusions?.mccs).has(x)), re = [...codes(oldR.exclusions?.mccs)].filter(x => !codes(newR.exclusions?.mccs).has(x))
  if (ae.length) out.push(`Now excluded: MCC ${ae.join(', ')}`)
  if (re.length) out.push(`No longer excluded: MCC ${re.join(', ')}`)
  return out
}

// Saves a rules pack as a file: the share sheet on Android, a normal download in the browser
export async function shareRulesFile(pack, name = 'finping-reward-rules.json') {
  const json = JSON.stringify(pack, null, 2)
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'FinPing reward rules', files: [uri], dialogTitle: 'Save the reward rules file' })
    return 'shared'
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

// Gives every credit card in your accounts that matches a bundled card its reward rules, unless it already has some or you removed them on purpose.
// Returns the names of the cards that got rules.
export async function autoApplyPresets() {
  const added = []
  for (const card of await db.creditCards.toArray()) {
    if (card.draft || card.rewardRulesOptOut || (card.cardType && card.cardType !== 'credit')) continue
    const entry = suggestEntry(card)
    const had = await getRules(card.id)
    if (had) {
      // rules a bundled preset gave this card earlier, from a wrong match (a RuPay card that got Millennia): swap them for the right ones
      if (!entry || !had.presetKey || had.presetKey === entry.key) continue
      await db.card_reward_rules.delete(had.id)
      await applyEntry(card.id, entry)
      added.push(cardTitle(card))
      continue
    }
    if (!entry) continue
    await applyEntry(card.id, entry)
    added.push(cardTitle(card))
  }
  return added
}

// Rules saved from a bundled card before it knew about online / in-shop spends: give them the channel, once. Only the channel is added.
export async function syncChannelRules() {
  let n = 0
  const pack = allPack()
  for (const row of await db.card_reward_rules.toArray()) {
    const entry = pack.cards.find(c => c.key === row.presetKey)
    if (!entry) continue
    let changed = false
    const accelerated = (row.accelerated || []).map(a => {
      const own = (entry.rules?.accelerated || []).find(x => x.id === a.id)
      if (own?.channel && !a.channel) { changed = true; return { ...a, channel: own.channel, notes: own.notes || a.notes } }
      return a
    })
    // the period the bank adds spends up over (SBI Cashback: the calendar month)
    const capPeriod = entry.rules?.capPeriod && row.capPeriod !== entry.rules.capPeriod && row.presetKey === 'sbi-cashback' ? entry.rules.capPeriod : null
    if (changed || capPeriod) { await db.card_reward_rules.update(row.id, { accelerated, ...(capPeriod ? { capPeriod } : {}) }); n++ }
  }
  return n
}

// Settlement: SBI Cashback adds spends up per statement cycle (cap per cycle), HSBC Live+ credits up to 45 days after the statement, and the Swiggy card's 10% also covers Bundl Technologies / Instamart lines. Rules saved
// from an earlier bundle get those fields once; nothing else on them is touched.
export async function syncSettlementRules() {
  let n = 0
  const pack = allPack()
  for (const row of await db.card_reward_rules.toArray()) {
    if (!['sbi-cashback', 'hsbc-live-plus', 'hdfc-swiggy'].includes(row.presetKey)) continue
    const entry = pack.cards.find(c => c.key === row.presetKey)
    if (!entry?.rules) continue
    const want = { capPeriod: entry.rules.capPeriod, capPerCycle: entry.rules.capPerCycle, baseCap: entry.rules.baseCap, creditLagDays: entry.rules.creditLagDays }
    const patch = {}
    for (const [k, v] of Object.entries(want)) if (v !== undefined && JSON.stringify(row[k] ?? null) !== JSON.stringify(v)) patch[k] = v
    if (row.presetKey === 'hdfc-swiggy') {
      // Swiggy's own company name (Bundl Technologies) and Instamart lines earn the 10% on the Swiggy app
      const own = (entry.rules.accelerated || []).find(x => x.id === 'swiggy-10')
      const accelerated = (row.accelerated || []).map(a => (a.id === 'swiggy-10' && own ? { ...a, merchants: [...new Set([...(a.merchants || []), ...(own.merchants || [])])] } : a))
      if (JSON.stringify(accelerated) !== JSON.stringify(row.accelerated || [])) patch.accelerated = accelerated
    }
    if (row.presetKey === 'sbi-cashback') {
      const accelerated = (row.accelerated || []).map(a => { const own = (entry.rules.accelerated || []).find(x => x.id === a.id); return own && own.capPerCycle !== a.capPerCycle ? { ...a, capPerCycle: own.capPerCycle } : a })
      if (JSON.stringify(accelerated) !== JSON.stringify(row.accelerated || [])) patch.accelerated = accelerated
    }
    if (Object.keys(patch).length) { await db.card_reward_rules.update(row.id, patch); n++ }
  }
  return n
}
