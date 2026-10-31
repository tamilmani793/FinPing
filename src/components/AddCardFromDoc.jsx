import { useState } from 'react'
import { FileText } from 'lucide-react'
import { useStore } from '../store'
import { readTermsText, docEntry } from '../lib/termsAssist'
import { allPack, rulesFromEntry, suggestEntry, diffRules, saveCustomCard } from '../lib/rulesPack'
import { describeRules } from '../lib/rewardRules'
import { forexOf, redemptionFeeOf } from './CardInfo'
import { BtnPrimary } from './UI'
import { Field, TextField } from './Fields'

// Customise > All card rules > Add: a card is added only from its terms document. The document is read into the card's rules, forex, fees and how
// rewards are credited and redeemed. If the card is already in the list the sheet shows what the document changes and updates that card;
// otherwise it shows what was read, lets you confirm the name and bank, and saves it. Nothing leaves the phone.

const norm = s => String(s || '').toLowerCase().replace(/credit card|card|bank/g, '').replace(/[^a-z0-9+]+/g, ' ').trim()
const row = { padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.45 }

// the card already in the list that this document is about
function findExisting(entry, pack) {
  const hit = suggestEntry({ bank: entry.issuer, name: entry.name }, pack)
  if (hit) return hit
  return pack.cards.find(c => norm(c.name) && norm(c.name) === norm(entry.name)) || null
}

// differences in the things that are not rules
function infoDiff(old, doc) {
  const out = []
  const cmp = (label, a, b) => { if (b != null && b !== '' && String(a ?? '') !== String(b)) out.push(`${label}: ${a == null || a === '' ? 'not stated' : a} → ${b}`) }
  cmp('Forex markup', forexOf(old)?.text, forexOf(doc)?.text)
  cmp('Redemption fee', redemptionFeeOf(old), redemptionFeeOf(doc))
  const df = doc.feesAndCharges || {}, of = old.feesAndCharges || {}
  cmp('Joining fee', of.joiningFee, df.joiningFee)
  cmp('Annual fee', of.annualFee, df.annualFee)
  cmp('Fuel surcharge', of.fuelSurcharge, df.fuelSurcharge)
  cmp('How rewards are credited', old.postedOn, doc.postedOn)
  return out
}

export default function AddCardFromDoc({ onClose, onSaved }) {
  const { showNotification } = useStore()
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null) // { entry, existing, changes, notes } | { none: true }
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')

  const pick = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const r = docEntry(await readTermsText(await f.arrayBuffer()), f.name)
      if (!r.found) { setRes({ none: true }); return }
      const pack = allPack(), existing = findExisting(r.entry, pack)
      const changes = existing ? [...diffRules(rulesFromEntry(0, existing), rulesFromEntry(0, r.entry)), ...infoDiff(existing, r.entry)] : []
      setName(r.entry.name); setIssuer(r.entry.issuer)
      setRes({ entry: r.entry, existing, changes, notes: r.notes || [] })
    } catch (err) { showNotification(err?.name === 'PasswordException' ? 'That PDF is password protected' : 'Could not read that PDF', 'error') } finally { setBusy(false) }
  }

  const saveNew = () => {
    if (!name.trim()) { showNotification('Enter the card name', 'error'); return }
    const e = res.entry
    const words = norm(name)
    saveCustomCard({ ...e, name: name.trim(), issuer: issuer.trim(), key: 'custom-' + (words.replace(/[^a-z0-9]+/g, '-') || 'card'), match: [words].filter(Boolean) })
    showNotification('Card added', 'success'); onSaved?.(); onClose()
  }
  const update = () => {
    const { existing, entry } = res
    saveCustomCard({
      ...existing, rules: entry.rules, effectiveFrom: entry.effectiveFrom, publishedOn: entry.publishedOn, source: entry.source,
      postedOn: entry.postedOn || existing.postedOn || null,
      redemption: entry.redemption || existing.redemption || null,
      feesAndCharges: { ...(existing.feesAndCharges || {}), ...(entry.feesAndCharges || {}) },
    })
    showNotification(`${existing.name} updated from the document`, 'success'); onSaved?.(); onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Add a card from a document</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 14px' }}>Choose the card's terms and conditions PDF. Nothing leaves this phone.</div>

        {!res && (
          <label style={{ display: 'block' }}>
            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
              <FileText size={22} color="var(--gold-dim)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{busy ? 'Reading the document…' : 'Choose the PDF'}</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)' }}>The rules, forex, fees and how rewards are credited and redeemed are read from it.</div>
              </div>
            </div>
            <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={pick} />
          </label>
        )}

        {res?.none && (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 12 }}>No reward rates could be read from this document, so nothing was added. Try the terms and conditions PDF that lists the cashback or points.</div>
            <button className="btn-ghost" style={{ height: 46, width: '100%' }} onClick={() => setRes(null)}>Choose another file</button>
          </>
        )}

        {res?.existing && (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>This card is already in the list: {res.existing.name}</div>
            <div style={{ margin: '8px 0 12px' }}>
              <div className="label-caps" style={{ marginBottom: 4 }}>What the document changes</div>
              {res.changes.length ? res.changes.map((c, k) => <div key={k} style={row}>{c}</div>) : <div style={row}>Nothing differs from what the app already has.</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ height: 46, flex: 1 }} onClick={onClose}>{res.changes.length ? 'Keep as it is' : 'Close'}</button>
              {res.changes.length > 0 && <BtnPrimary onClick={update} style={{ flex: 1 }}>Update the card</BtnPrimary>}
            </div>
          </>
        )}

        {res?.entry && !res.existing && (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>A new card. Check what was read.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              <Field label="Card name"><TextField value={name} onChange={e => setName(e.target.value)} /></Field>
              <Field label="Bank"><TextField value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="e.g. HDFC Bank" /></Field>
            </div>
            <div className="card" style={{ marginBottom: 12, paddingTop: 6, paddingBottom: 6 }}>
              {describeRules(rulesFromEntry(0, res.entry)).map((l, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12.5, lineHeight: 1.45 }}><span>{l.icon}</span><span>{l.text}</span></div>)}
            </div>
            {res.notes.map((n, k) => <div key={k} style={{ ...row, color: 'var(--amber-dim)', borderTop: 'none' }}>{n}</div>)}
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 12 }}>
              Forex: {res.entry.feesAndCharges?.forexMarkup || 'not found'} · Redemption fee: {res.entry.feesAndCharges?.rewardsRedemptionFee ? 'found' : 'not found'} · Credited: {res.entry.postedOn ? 'found' : 'not found'}. Check against the document.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ height: 46, flex: 1 }} onClick={onClose}>Cancel</button>
              <BtnPrimary onClick={saveNew} style={{ flex: 1 }}>Add card</BtnPrimary>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
