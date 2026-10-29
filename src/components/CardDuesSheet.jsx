import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { CreditCard, ChevronRight } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { formatINR } from './UI'
import { cardStats } from '../lib/cardStats'

const fmt = d => (d ? format(new Date(d), 'd MMM') : '—')
const STATUS = {
  paid: ['Paid ✓', 'badge-mint'], partial: ['Partly paid', 'badge-amber'], pending: ['Payment pending', 'badge-red'], none: ['No bill yet', 'badge-grey'],
}

// One row per credit card with what is due on the bill and what is owed in total right now.
export function useCardDues() {
  const cards = (useLiveQuery(() => db.creditCards.toArray()) || []).filter(c => !c.draft && (!c.cardType || c.cardType === 'credit'))
  const txns = useLiveQuery(() => db.transactions.filter(t => t.cardId != null).toArray()) || []
  const rows = cards.map(c => ({ card: c, s: cardStats(c, txns.filter(t => t.cardId === c.id)) }))
  // cards that owe something first, soonest due date first
  rows.sort((a, b) => (b.s.owing - a.s.owing) || ((a.s.dates.dueDate || 0) - (b.s.dates.dueDate || 0)))
  return {
    rows,
    totalDue: rows.reduce((s, r) => s + r.s.totalDue, 0),
    outstanding: rows.reduce((s, r) => s + r.s.outstanding, 0),
    owingCount: rows.filter(r => r.s.owing).length,
  }
}

export default function CardDuesSheet({ onClose }) {
  const { openCard, setActiveTab } = useStore()
  const { rows, totalDue, outstanding } = useCardDues()

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800 }}>Card dues</div>
        <div style={{ display: 'flex', gap: 24, margin: '6px 0 14px' }}>
          <div>
            <div className="label-caps">Total amount due</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: totalDue > 0 ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{formatINR(totalDue)}</div>
          </div>
          <div>
            <div className="label-caps">Current outstanding</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{formatINR(outstanding)}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>Total amount due is the billed amount still unpaid. Current outstanding adds the spends made after the statement.</div>

        {rows.map(({ card, s }) => {
          const [label, badge] = STATUS[s.status]
          return (
            <div key={card.id} onClick={() => { openCard(card.id); onClose() }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div className="stat-icon" style={{ width: 36, height: 36, background: 'var(--bg2)', color: 'var(--gold-dim)' }}><CreditCard size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>
                  {s.owing && s.dates.dueDate ? `Due ${fmt(s.dates.dueDate)}` : s.status === 'paid' ? 'Nothing due' : 'No bill yet'} · outstanding {formatINR(s.outstanding)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.totalDue > 0 ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{formatINR(s.totalDue)}</div>
                <span className={`badge ${badge}`} style={{ fontSize: 9 }}>{label}</span>
              </div>
              <ChevronRight size={15} color="var(--txt3)" />
            </div>
          )
        })}
        {!rows.length && <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--txt2)', fontSize: 13 }}>No credit cards yet. Add one under Accounts.</div>}

        <button className="btn-secondary" style={{ width: '100%', height: 40, marginTop: 14 }} onClick={() => { setActiveTab('cards'); onClose() }}>Open Accounts</button>
      </div>
    </div>
  )
}
