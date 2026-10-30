import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { buildAudit } from '../lib/rewardAudit'
import { rewardPill } from '../lib/rewardRules'
import { txnName } from '../lib/txnName'
import { cardTitle } from '../lib/cardCatalog'
import { formatINR } from './UI'

// Rewards Audit: per billing cycle, what the card should have earned (from your rules) against what the bank credited.
const fmtCycle = k => (/^\d{4}-\d\d-\d\d$/.test(k) ? `Statement of ${format(new Date(k + 'T12:00:00'), 'd MMM yyyy')}` : format(new Date(k + '-01T12:00:00'), 'MMMM yyyy'))
const STATUS = {
  match: { label: '✓ Matches', color: 'var(--mint-dim)', bg: 'var(--mint-bg)' },
  short: { label: '⚠ Bank gave less', color: 'var(--red-dim)', bg: 'var(--red-bg)' },
  over: { label: 'Bank gave more', color: 'var(--gold-dim)', bg: 'var(--gold-bg)' },
  unknown: { label: 'No statement figure yet', color: 'var(--txt2)', bg: 'var(--bg2)' },
}
const show = (n, type) => (n == null ? '—' : n < 0 ? '−' + show(-n, type) : type === 'points' ? `${Math.round(n).toLocaleString('en-IN')} pts` : formatINR(n, 2))

export default function RewardsAuditSheet({ card, onClose }) {
  const audit = useLiveQuery(() => buildAudit(card.id), [card.id])
  const [open, setOpen] = useState(null)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Rewards audit</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 12px' }}>{cardTitle(card)} · expected from your rules against what the bank credited</div>
        {!audit && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Working it out…</div>}
        {audit && !audit.rules && <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Set this card's reward rules first (Rewards & fees → Reward rules), then import its statements.</div>}
        {audit?.rules && !audit.rows.length && <div style={{ fontSize: 13, color: 'var(--txt2)' }}>No spends or statements to compare yet. Import the card's statements and the cycles appear here.</div>}
        {audit?.rows.map(r => {
          const st = STATUS[r.status]
          return (
            <div key={r.cycleKey} className="card" style={{ marginBottom: 10 }}>
              <div onClick={() => setOpen(open === r.cycleKey ? null : r.cycleKey)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fmtCycle(r.cycleKey)}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div><div className="label-caps">Expected</div><div style={{ fontWeight: 800 }}>{show(r.expected, r.type)}</div></div>
                  <div><div className="label-caps">Bank gave</div><div style={{ fontWeight: 800 }}>{show(r.actual, r.type)}</div></div>
                  <div><div className="label-caps">Difference</div><div style={{ fontWeight: 800, color: r.diff == null ? 'var(--txt2)' : r.diff < 0 ? 'var(--red-dim)' : r.diff > 0 ? 'var(--gold-dim)' : 'var(--mint-dim)' }}>{r.diff == null ? '—' : `${r.diff > 0 ? '+' : ''}${show(r.diff, r.type)}`}</div></div>
                </div>
                {r.status === 'short' && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 8 }}>The bank credited less than your rules expect. A merchant may have been put in an excluded category, a cap may apply, or your rule may be off. Check the biggest earners below against the statement.</div>}
              </div>
              {open === r.cycleKey && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div className="label-caps" style={{ margin: '8px 0 2px' }}>Biggest expected earners · {r.earning} spend{r.earning === 1 ? '' : 's'} earn something</div>
                  {r.topSpends.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', fontSize: 12 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{format(new Date(t.date), 'd MMM')} · {txnName(t)} · {t.category}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{formatINR(t.amount)} → <b>{rewardPill(t.expectedReward)}</b></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <button className="btn-ghost" style={{ width: '100%', height: 46, marginTop: 4 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
