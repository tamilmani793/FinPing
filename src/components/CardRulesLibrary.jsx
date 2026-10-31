import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { db } from '../db/schema'
import { cardTitle } from '../lib/cardCatalog'
import { bundledPack, rulesFromEntry, suggestEntry } from '../lib/rulesPack'
import { describeRules } from '../lib/rewardRules'

// Profile -> Customise -> Rules -> All card rules: every card in the rules that came with the app, with its rules and details in plain words.
// Read only. To use a card's rules, open that card's own Reward rules and choose "Rules from the app".

const words = k => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
const money = v => (typeof v === 'number' ? v.toLocaleString('en-IN') : v)

// any value from the pack as readable lines: text, numbers, lists and groups of those
function Lines({ value, depth = 0 }) {
  if (value == null || value === '') return null
  if (Array.isArray(value)) {
    return <div>{value.map((v, i) => (typeof v === 'object' ? <div key={i} style={{ marginBottom: 6 }}><Lines value={v} depth={depth + 1} /></div> : <div key={i} style={{ display: 'flex', gap: 6 }}><span>•</span><span>{money(v)}</span></div>))}</div>
  }
  if (typeof value === 'object') {
    return (
      <div>
        {Object.entries(value).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
          <div key={k} style={{ marginBottom: 4 }}>
            {typeof v === 'object' ? <><div style={{ fontWeight: 700, fontSize: 12 }}>{words(k)}</div><div style={{ paddingLeft: depth ? 8 : 10 }}><Lines value={v} depth={depth + 1} /></div></> : <span><b style={{ fontWeight: 700 }}>{words(k)}:</b> {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : money(v)}</span>}
          </div>
        ))}
      </div>
    )
  }
  return <span>{money(value)}</span>
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="label-caps" style={{ color: 'var(--gold-dim)', marginBottom: 6 }}>{title}</div>
      <div className="card" style={{ fontSize: 12.5, lineHeight: 1.5, paddingTop: 10, paddingBottom: 10 }}>{children}</div>
    </div>
  )
}

function Detail({ entry, mine, onBack }) {
  const rules = rulesFromEntry(0, entry)
  const lines = describeRules(rules)
  const accelNotes = (entry.rules?.accelerated || []).filter(a => a.notes)
  const other = entry.rules?.exclusions?.otherSpendTypes
  const exNote = entry.rules?.exclusions?.notes
  const extras = entry.details
  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <Header title={entry.name} onBack={onBack} />
      <div style={{ padding: '0 18px' }}>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-4px 2px 12px' }}>
          {[entry.issuer, entry.network, entry.rewardType === 'points' ? 'Reward points' : 'Cashback'].filter(Boolean).join(' · ')}
          {mine.length > 0 && <div style={{ color: 'var(--gold-dim)', fontWeight: 700, marginTop: 4 }}>Your card: {mine.join(', ')}</div>}
        </div>

        <Section title="Rules">
          {lines.map((l, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}><span>{l.icon}</span><span>{l.text}</span></div>)}
          {rules.pointValue ? <div style={{ marginTop: 6, color: 'var(--txt2)' }}>One point is worth ₹{rules.pointValue}</div> : null}
        </Section>

        {(accelNotes.length > 0 || exNote || (other && other.length > 0)) && (
          <Section title="Conditions">
            {accelNotes.map(a => <div key={a.id} style={{ marginBottom: 6 }}><b>{a.label}</b><div style={{ color: 'var(--txt2)' }}>{a.notes}</div></div>)}
            {other && other.length > 0 && <div style={{ marginBottom: 6 }}><b>Also earns nothing on</b><div style={{ color: 'var(--txt2)' }}>{other.join(', ')}</div></div>}
            {exNote && <div style={{ color: 'var(--txt2)' }}>{exNote}</div>}
          </Section>
        )}

        {entry.benefits?.length > 0 && <Section title="Benefits"><Lines value={entry.benefits} /></Section>}
        {extras && <Section title="Forex, offers, lounges and eligibility"><Lines value={extras} /></Section>}
        {entry.feesAndCharges && <Section title="Fees and charges"><Lines value={entry.feesAndCharges} /></Section>}
        {entry.redemption && <Section title="Redeeming rewards"><Lines value={entry.redemption} /></Section>}

        <Section title="Where this comes from">
          <div>{entry.source || 'Not recorded'}</div>
          <div style={{ color: 'var(--txt2)', marginTop: 4 }}>
            {entry.effectiveFrom ? `Effective from ${entry.effectiveFrom}` : 'Effective date not stated'}{entry.publishedOn ? ` · published ${entry.publishedOn}` : ''}
          </div>
          <div style={{ color: 'var(--txt2)', marginTop: 4 }}>Check against your card's latest terms before relying on it. Rates the app cannot express (tiers, shared caps, day-of-week offers) are written in the conditions above.</div>
        </Section>
      </div>
    </div>
  )
}

function Header({ title, onBack }) {
  return (
    <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg0)' }}>
      <div onClick={onBack} style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={18} /></div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', minWidth: 0 }}>{title}</div>
    </div>
  )
}

export default function CardRulesLibrary({ onBack }) {
  const pack = bundledPack()
  const cards = useLiveQuery(() => db.creditCards.toArray()) || []
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  // which of your cards each entry would be used for
  const mineBy = useMemo(() => {
    const m = {}
    for (const c of cards) {
      if (c.cardType && c.cardType !== 'credit') continue
      const e = suggestEntry(c, pack)
      if (e) (m[e.key] = m[e.key] || []).push(cardTitle(c))
    }
    return m
  }, [cards, pack])

  const needle = q.trim().toLowerCase()
  const list = pack.cards.filter(c => !needle || `${c.name} ${c.issuer} ${c.network || ''}`.toLowerCase().includes(needle))
  const byIssuer = list.reduce((a, c) => { (a[c.issuer] = a[c.issuer] || []).push(c); return a }, {})
  const entry = open && pack.cards.find(c => c.key === open)
  if (entry) return <Detail entry={entry} mine={mineBy[entry.key] || []} onBack={() => setOpen(null)} />

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <Header title="All card rules" onBack={onBack} />
      <div style={{ padding: '0 18px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '0 2px 10px' }}>{pack.cards.length} credit cards with the rules that came with the app. Tap a card to read its rules, fees and offers. Your own cards are marked.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 14, padding: '0 12px', height: 42, marginBottom: 12 }}>
          <Search size={16} color="var(--txt2)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a card or bank" style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--txt)', fontSize: 14, fontFamily: 'inherit', minWidth: 0 }} />
        </div>
        {!list.length && <div className="card" style={{ fontSize: 12.5, color: 'var(--txt2)' }}>No card matches.</div>}
        {Object.entries(byIssuer).map(([issuer, items]) => (
          <div key={issuer} style={{ marginBottom: 14 }}>
            <div className="label-caps" style={{ margin: '0 4px 6px' }}>{issuer}</div>
            <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
              {items.map((c, i) => (
                <div key={c.key} onClick={() => setOpen(c.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{c.rewardType === 'points' ? 'Reward points' : 'Cashback'}{(c.rules?.accelerated || []).length ? ` · ${c.rules.accelerated.length} special rule${c.rules.accelerated.length === 1 ? '' : 's'}` : ''}</div>
                  </div>
                  {mineBy[c.key] && <span className="badge badge-amber">Yours</span>}
                  <ChevronRight size={18} color="var(--txt3)" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
