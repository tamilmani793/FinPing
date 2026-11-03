import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { formatINR } from './UI'
import { cycleDates, isStatementPaid } from '../lib/cycle'
import { cardStatements } from '../lib/bills'

const reward = (n, type) => (type === 'points' ? `${Math.round(n).toLocaleString('en-IN')} pts` : formatINR(n, 2))
const d = x => format(new Date(x), 'd MMM yyyy')

function Stat({ label, value, color }) {
  return <div className="card-sm" style={{ padding: 10 }}><div className="label-caps" style={{ fontSize: 9 }}>{label}</div><div className="mono-sm" style={{ color }}>{value}</div></div>
}

// A credit card's bills: this cycle, then past statements, each with the reward its spends earned and the cashback credited.
export default function CardBills({ card, onClose, onOpenCard }) {
  const txns = useLiveQuery(() => db.transactions.where('cardId').equals(card.id).toArray(), [card.id], null)
  const [openKey, setOpenKey] = useState(null)
  const rows = txns ? cardStatements(card, txns) : []
  // what the bank's own statement says about rewards, read when the statement was imported: points by programme (5% select merchants, 1% on the rest...)
  const saved = useLiveQuery(() => db.reward_statements.where('cardId').equals(card.id).toArray(), [card.id], [])
  const byKey = new Map(saved.map(s => [s.cycleKey, s]))
  const stmtOf = r => byKey.get(r.key) || null
  const progLabel = p => { const m = /(\d+(?:\.\d+)?)\s*%/.exec(p.name); return m ? `${m[1]}%` : 'Bonus' }
  const progName = p => String(p.name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  const dates = cycleDates(card)
  const owing = !isStatementPaid(card, dates)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>💳 {card.name || card.bank}</div>
          <button className="btn-secondary" style={{ height: 34, padding: '0 14px', fontSize: 12 }} onClick={onOpenCard}>Open card</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>{card.bank}{card.cardLast4 ? ` · card ending ${card.cardLast4}` : ''}{card.network ? ` · ${card.network}` : ''}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '4px 0 12px' }}>
          {owing ? `Bill ${formatINR(card.pendingDue ?? card.statementBalance ?? 0)} due ${d(dates.dueDate)}${card.minimumDue ? ` · minimum ${formatINR(card.minimumDue)}` : ''}` : `Latest statement paid · next bill ${d(dates.nextStatementDate)}`}
        </div>
        {!txns && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Loading…</div>}
        {txns && rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>No spends found for this card yet.</div>}
        {rows.map((r, i) => (
          <div key={r.key} onClick={() => setOpenKey(openKey === r.key ? null : r.key)} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.open ? 'This cycle (not billed yet)' : `Statement ${d(r.statementDate)}`}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{d(r.from)} to {d(r.to)} · {r.count} spend{r.count === 1 ? '' : 's'}</div>
                {(stmtOf(r)?.programs?.length > 0 || r.credited !== 0) && (
                  <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {/* the same kind of tag for every card: the statement's split by programme (HDFC), and what the bank deposited (SBI and others) */}
                    {(stmtOf(r)?.programs || []).map((p, k) => <span key={k} className="badge badge-mint" style={{ fontSize: 9.5 }}>{progLabel(p)} · {p.points} pts</span>)}
                    {r.credited !== 0 && <span className="badge badge-mint" style={{ fontSize: 9.5 }}>Cashback {formatINR(r.credited, 2)} deposited by bank</span>}
                  </div>
                )}
                {(r.usePct != null || r.change != null) && (
                  <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>
                    {r.usePct != null && <span>{r.usePct < 10 ? r.usePct.toFixed(1) : Math.round(r.usePct)}% of limit used</span>}
                    {r.change != null && <span style={{ marginLeft: 6, fontWeight: 600, color: r.change > 0 ? 'var(--red)' : 'var(--mint-dim)' }}>{r.change > 0 ? '+' : ''}{Math.round(r.change)}% vs last statement</span>}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono-sm">{formatINR(r.spends)}</div>
                {r.earned > 0 && <div style={{ fontSize: 11, color: 'var(--mint-dim)' }}>{reward(r.earned, r.rewardType)} earned</div>}
              </div>
            </div>
            {openKey === r.key && (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Stat label="Spends" value={formatINR(r.spends)} />
                <Stat label={r.rewardType === 'points' ? 'Points earned' : 'Cashback earned'} value={r.earned > 0 ? reward(r.earned, r.rewardType) : 'None found'} color="var(--mint-dim)" />
                {!r.open && <Stat label="Due date" value={d(r.dueDate)} />}
                {!r.open && <Stat label="Paid before next statement" value={r.payments ? `${formatINR(r.payments)}${r.paymentsCount > 1 ? ` (${r.paymentsCount})` : ''}` : 'Nothing found'} />}
                {r.usePct != null && <Stat label="Limit used" value={`${r.usePct < 10 ? r.usePct.toFixed(1) : Math.round(r.usePct)}% of ${formatINR(card.creditLimit)}`} />}
                {r.changeAmount != null && <Stat label="Change from last statement" value={`${r.changeAmount > 0 ? '+' : r.changeAmount < 0 ? '−' : ''}${formatINR(Math.abs(r.changeAmount))}${r.change != null ? ` (${r.change > 0 ? '+' : ''}${Math.round(r.change)}%)` : ''}`} color={r.changeAmount > 0 ? 'var(--red)' : 'var(--mint-dim)'} />}
                {r.refunds > 0 &&<Stat label="Refunds" value={formatINR(r.refunds)} />}
                {stmtOf(r)?.programs?.map((p, k) => <Stat key={'p' + k} label={progName(p)} value={`${p.points} pts`} color="var(--mint-dim)" />)}
                {stmtOf(r)?.earned != null && <Stat label="Points on the statement" value={`+${stmtOf(r).earned}${stmtOf(r).closing != null ? ` · balance ${Number(stmtOf(r).closing).toLocaleString('en-IN')}` : ''}`} />}
                <Stat label="Cashback credited in this cycle" value={r.credited ? formatINR(r.credited, 2) : 'None'} />
              </div>
            )}
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 10 }}>Worked out from this card's transactions and its billing cycle, so spends may differ slightly from the printed statement. "Earned" is the reward the card's rules give for the spends; "credited" is what the bank actually added.</div>
        <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
