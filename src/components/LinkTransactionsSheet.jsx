import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { relinkTransactions, linkToCard } from '../lib/relink'
import { useStore } from '../store'
import { formatINR } from './UI'

// Link unlinked transactions: lists every SMS transaction that is not tied to a card or account, says what each one is
// (credit card spend, bank account credit...) and where it would go, and links only the ones you tick.
export default function LinkTransactionsSheet({ onClose }) {
  const { showNotification } = useStore()
  const [plan, setPlan] = useState(null)
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(new Set())
  const [target, setTarget] = useState('')
  const cards = useLiveQuery(() => db.creditCards.toArray(), []) || []

  useEffect(() => {
    relinkTransactions({ dryRun: true })
      .then(p => { setPlan(p); setPicked(new Set(p.items.map(i => i.id))) })
      .catch(e => { showNotification('Could not read transactions: ' + e.message, 'error'); onClose() })
  }, [])

  const toggle = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const groups = plan ? [...plan.items.reduce((m, i) => m.set(i.target, [...(m.get(i.target) || []), i]), new Map())] : []
  const toggleGroup = items => setPicked(p => { const n = new Set(p); const all = items.every(i => n.has(i.id)); items.forEach(i => (all ? n.delete(i.id) : n.add(i.id))); return n })
  const allOn = plan && picked.size === plan.items.length
  const newOnes = plan ? [...new Set(plan.items.filter(i => picked.has(i.id) && i.newCard).map(i => i.target))] : []

  const linkManual = async () => {
    if (!target) { showNotification('Choose the card or account first', 'error'); return }
    setBusy(true)
    try {
      const n = await linkToCard([...manual], Number(target))
      const c = cards.find(x => String(x.id) === target)
      showNotification(`${n} transaction${n === 1 ? '' : 's'} linked to ${c?.name || c?.bank}`, 'success')
      onClose()
    } catch (e) { showNotification('Could not link: ' + e.message, 'error'); setBusy(false) }
  }

  const link = async () => {
    setBusy(true)
    try {
      const chosen = plan.items.filter(i => picked.has(i.id))
      const { linked: n, failed } = await relinkTransactions({ ids: chosen.map(i => i.id) })
      const by = {}
      chosen.forEach(i => { by[i.what] = (by[i.what] || 0) + 1 })
      const parts = Object.entries(by).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')
      if (!n) { showNotification(`Could not link ${failed || chosen.length} transaction${(failed || chosen.length) === 1 ? '' : 's'}: no card or account matched their last 4 digits`, 'error'); setBusy(false); return }
      showNotification(`${n} linked: ${parts}${failed ? `. ${failed} could not be matched` : ''}`, failed ? undefined : 'success')
      onClose()
    } catch (e) { showNotification('Could not link: ' + e.message, 'error'); setBusy(false) }
  }

  const box = { width: 18, height: 18, accentColor: 'var(--gold)', flexShrink: 0 }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Link transactions</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 12px' }}>Tick the transactions to tie to their card or account. Balances are not changed.</div>
        {!plan && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Looking for unlinked transactions…</div>}
        {plan && plan.items.length === 0 && !plan.rest?.length && <div style={{ fontSize: 13, color: 'var(--txt2)' }}>{plan.skipped ? `${plan.skipped} unlinked transaction${plan.skipped === 1 ? '' : 's'} found, but none matched a card or account. Add the card or account first (its last 4 digits must match), then try again.` : 'Nothing to link: all transactions are already tied to a card or account.'}</div>}
        {plan && plan.items.length > 0 && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 10px', fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={!!allOn} onChange={() => setPicked(allOn ? new Set() : new Set(plan.items.map(i => i.id)))} style={box} />
              Select all ({plan.items.length}) · {picked.size} ticked
            </label>
            {groups.map(([target, items]) => (
              <div key={target} className="card" style={{ marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
                  <input type="checkbox" checked={items.every(i => picked.has(i.id))} onChange={() => toggleGroup(items)} style={box} />
                  <span style={{ flex: 1, minWidth: 0 }}>{target}{items[0].newCard ? ' · new' : ''}</span>
                  <span style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600 }}>{items.length}</span>
                </label>
                {items.map(i => (
                  <label key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} style={{ ...box, marginTop: 1 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.merchant || 'Transaction'}</span>
                      <span style={{ display: 'block', color: 'var(--txt2)', marginTop: 1 }}>{i.date ? format(new Date(i.date), 'd MMM yyyy') : ''} · {i.what}{i.category ? ` · ${i.category}` : ''}</span>
                    </span>
                    <b style={{ whiteSpace: 'nowrap', color: i.type === 'credit' ? 'var(--mint-dim)' : 'var(--txt)' }}>{i.type === 'credit' ? '+' : '−'}{formatINR(i.amount, 2)}</b>
                  </label>
                ))}
              </div>
            ))}
            {plan.skipped > 0 && <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>{plan.skipped} other unlinked transaction{plan.skipped === 1 ? '' : 's'} could not be matched to any card or account and stay as they are.</div>}
            {newOnes.length > 0 && <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>A new card or account will be created: {newOnes.join(', ')}.</div>}
            <button className="btn-primary" style={{ width: '100%', height: 48 }} disabled={busy || picked.size === 0} onClick={link}>{busy ? 'Linking…' : `Link ${picked.size} transaction${picked.size === 1 ? '' : 's'}`}</button>
          </>
        )}
        {plan && plan.rest?.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>No card or account number in the SMS</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '2px 0 8px' }}>Tick the ones that belong together, choose where they go, then link.</div>
            {plan.rest.map(i => (
              <label key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                <input type="checkbox" checked={manual.has(i.id)} onChange={() => setManual(p => { const n = new Set(p); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n })} style={{ ...box, marginTop: 1 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{i.merchant || 'Transaction'}</span>
                  <span style={{ display: 'block', color: 'var(--txt2)', marginTop: 1 }}>{i.date ? format(new Date(i.date), 'd MMM yyyy') : ''} · {i.sms}</span>
                </span>
                <b style={{ whiteSpace: 'nowrap' }}>{i.type === 'credit' ? '+' : '−'}{formatINR(i.amount, 2)}</b>
              </label>
            ))}
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 10, padding: '0 10px' }}>
              <option value="">Choose card or account…</option>
              {cards.filter(c => !c.draft).map(c => <option key={c.id} value={c.id}>{c.name || c.bank}{c.cardLast4 ? ` ••${c.cardLast4}` : ''} · {c.cardType === 'account' ? 'account' : c.cardType || 'credit'}</option>)}
            </select>
            <button className="btn-primary" style={{ width: '100%', height: 44, marginTop: 8 }} disabled={busy || manual.size === 0 || !target} onClick={linkManual}>Link {manual.size} to chosen</button>
          </div>
        )}
        <button className="btn-ghost" style={{ width: '100%', height: 46, marginTop: 8 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
