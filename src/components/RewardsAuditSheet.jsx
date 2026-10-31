import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { buildAudit } from '../lib/rewardAudit'
import { rewardPill } from '../lib/rewardRules'
import { txnName } from '../lib/txnName'
import { cardTitle } from '../lib/cardCatalog'
import { formatINR } from './UI'
import TxnEditSheet from './TxnEditSheet'

// Rewards Audit: per billing cycle, what the card should have earned (from your rules) against what the bank credited.
const isDateKey = k => /^\d{4}-\d\d-\d\d$/.test(k)
const fmtCycle = k => (/^\d{4}-\d\d-\d\d$/.test(k) ? `Statement of ${format(new Date(k + 'T12:00:00'), 'd MMM yyyy')}` : format(new Date(k + '-01T12:00:00'), 'MMMM yyyy'))
const STATUS = {
  match: { label: '✓ Matches', color: 'var(--mint-dim)', bg: 'var(--mint-bg)' },
  short: { label: '⚠ Bank gave less', color: 'var(--red-dim)', bg: 'var(--red-bg)' },
  over: { label: 'Bank gave more', color: 'var(--gold-dim)', bg: 'var(--gold-bg)' },
  unknown: { label: 'No statement figure yet', color: 'var(--txt2)', bg: 'var(--bg2)' },
  pending: { label: '⏳ Pending', color: 'var(--gold-dim)', bg: 'var(--gold-bg)' },
}
const monthName = k => format(new Date(k + '-01T12:00:00'), 'MMMM yyyy')
const nextMonthName = k => format(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 1, 12), 'MMMM yyyy')
const show = (n, type) => (n == null ? '—' : n < 0 ? '−' + show(-n, type) : type === 'points' ? `${Math.round(n).toLocaleString('en-IN')} pts` : formatINR(n, 2))

export default function RewardsAuditSheet({ card, onClose }) {
  const audit = useLiveQuery(() => buildAudit(card.id), [card.id])
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState(null) // a spend or credit tapped in a cycle: opens the usual edit sheet
  return (
    <>
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Rewards audit</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 12px' }}>{cardTitle(card)} · expected from your rules against what the bank credited</div>
        {!audit && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Working it out…</div>}
        {audit && !audit.rules && <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Set this card's reward rules first (Rewards & fees → Reward rules), then import its statements.</div>}
        {audit?.mode === 'wallet' && <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '-4px 0 10px' }}>Points are earned over each calendar month (1st to the last day, caps reset monthly) and added to your points wallet in the first week of the next month. They are not credited to the statement balance. You redeem them later as a cashback credit.</div>}
        {audit?.mode === 'statement' && !audit.monthly && <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '-4px 0 10px' }}>Cashback is added up over each statement cycle (the day after the previous statement to this statement date, caps reset every cycle) and credited to the card as a cash credit on the next statement. Each cycle's expected credit is compared with that credit.</div>}
        {audit?.mode === 'statement' && audit.monthly && <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '-4px 0 10px' }}>This card adds up spends from the 1st to the last day of each month, and the bank credits the cashback in the first days of the next month. Each month's expected cashback is compared with that credit.</div>}
        {audit?.wallet && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="label-caps" style={{ marginBottom: 6 }}>Points wallet</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
              <span>In the wallet <b>{audit.wallet.closing == null ? '—' : show(audit.wallet.closing, 'points')}</b>{audit.wallet.closingAt ? <span style={{ color: 'var(--txt2)' }}> (statement of {format(new Date(audit.wallet.closingAt + 'T12:00:00'), 'd MMM yyyy')})</span> : null}</span>
              <span>Pending to be added <b>{show(audit.wallet.pending, 'points')}</b>{audit.wallet.pendingMonths.length ? <span style={{ color: 'var(--txt2)' }}> ({audit.wallet.pendingMonths.slice().reverse().map(monthName).join(', ')})</span> : null}</span>
              <span>Redeemed so far <b>{formatINR(audit.wallet.redeemedRupees, 2)}</b> in {audit.wallet.redeemedCount} redemption{audit.wallet.redeemedCount === 1 ? '' : 's'}</span>
              <span>Redemption fee and GST <b>{formatINR(audit.wallet.fees + audit.wallet.taxes, 2)}</b></span>
            </div>
            {audit.wallet.closing != null && audit.wallet.perPoint > 0 && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 6 }}>The wallet is worth about {formatINR(audit.wallet.closing * audit.wallet.perPoint, 2)} when redeemed (₹{audit.wallet.perPoint} a point, less the redemption fee). Redeem when it suits you; each redemption shows as a cashback credit and is listed under the month it happened.</div>}
          </div>
        )}
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
                <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 2 }}>{r.mode === 'wallet' ? `Spends 1st–last day of ${isDateKey(r.cycleKey) ? 'the cycle' : monthName(r.cycleKey)} · to the points wallet${isDateKey(r.cycleKey) ? '' : ` in the first week of ${nextMonthName(r.cycleKey)}`}` : `${isDateKey(r.cycleKey) ? 'Spends in this statement cycle' : 'Spends in the month'} · statement credit by ${r.settleBy ? format(r.settleBy, 'd MMM yyyy') : 'the next statement'}`}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div><div className="label-caps">{r.mode === 'wallet' ? 'Expected points' : 'Expected credit'}</div><div style={{ fontWeight: 800 }}>{show(r.expected, r.type)}</div></div>
                  <div><div className="label-caps">{r.mode === 'wallet' ? 'Added to wallet' : 'Credited'}</div><div style={{ fontWeight: 800 }}>{show(r.actual, r.type)}</div></div>
                  <div><div className="label-caps">Difference</div><div style={{ fontWeight: 800, color: r.diff == null ? 'var(--txt2)' : r.diff < 0 ? 'var(--red-dim)' : r.diff > 0 ? 'var(--gold-dim)' : 'var(--mint-dim)' }}>{r.diff == null ? '—' : `${r.diff > 0 ? '+' : ''}${show(r.diff, r.type)}`}</div></div>
                </div>
                {r.status === 'pending' && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 8 }}>{r.mode === 'wallet' ? `These points are still to come: the bank adds them to your wallet in the first week of ${nextMonthName(r.cycleKey)}. Nothing is wrong yet.` : 'The cashback for this cycle is not due yet. It should appear as a credit on the next statement.'}</div>}
                {r.status === 'short' && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 8 }}>The bank credited less than your rules expect. A merchant may have been put in an excluded category, a cap may apply, or your rule may be off. Check the biggest earners below against the statement.</div>}
              </div>
              {open === r.cycleKey && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
                  {r.statement && (
                    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div className="label-caps" style={{ marginBottom: 4 }}>Points on the statement</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 12 }}>
                        {r.statement.opening != null && <span>Opening <b>{show(r.statement.opening, 'points')}</b></span>}
                        {r.statement.earned != null && <span>Earned <b>{show(r.statement.earned, 'points')}</b></span>}
                        {r.statement.disbursed != null && <span>Redeemed <b>{show(r.statement.disbursed, 'points')}</b></span>}
                        {r.statement.lapsed != null && <span>Adjusted / lapsed <b>{show(r.statement.lapsed, 'points')}</b></span>}
                        {r.statement.closing != null && <span>Closing <b>{show(r.statement.closing, 'points')}</b></span>}
                      </div>
                      {(r.statement.programs || []).length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div className="label-caps" style={{ marginBottom: 2 }}>Where the points came from</div>
                          {r.statement.programs.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '2px 0' }}><span>{p.name}</span><b>{show(p.points, 'points')}</b></div>)}
                        </div>
                      )}
                    </div>
                  )}
                  {r.redeemed != null && <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>Redeemed as cashback in this cycle <b>{formatINR(r.redeemed, 2)}</b></div>}
                  <div className="label-caps" style={{ margin: '8px 0 2px' }}>Biggest expected earners · {r.earning} spend{r.earning === 1 ? '' : 's'} earn something</div>
                  {r.topSpends.map(t => (
                    <div key={t.id} onClick={() => setEdit(t)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', fontSize: 12, cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{format(new Date(t.date), 'd MMM')} · {txnName(t)} · {t.category}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{formatINR(t.amount)} → <b>{rewardPill(t.expectedReward)}</b></span>
                    </div>
                  ))}
                  {r.credits?.length > 0 && (
                    <>
                      <div className="label-caps" style={{ margin: '10px 0 2px' }}>Credited by the bank</div>
                      {r.credits.map(t => (
                        <div key={t.id} onClick={() => setEdit(t)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', fontSize: 12, cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{format(new Date(t.date), 'd MMM yyyy')} · {txnName(t)}</span>
                          <b style={{ whiteSpace: 'nowrap' }}>{t.type === 'credit' ? '+' : '−'}{formatINR(t.amount, 2)}</b>
                        </div>
                      ))}
                    </>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 6 }}>Tap a row to edit it. The audit works itself out again after you save.</div>
                </div>
              )}
            </div>
          )
        })}
        <button className="btn-ghost" style={{ width: '100%', height: 46, marginTop: 4 }} onClick={onClose}>Close</button>
      </div>
    </div>
    {edit && <TxnEditSheet txn={edit} onClose={() => setEdit(null)} />}
    </>
  )
}
