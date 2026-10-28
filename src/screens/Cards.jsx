import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, CreditCard, FileText, Gift, Pencil } from 'lucide-react'
import StatementImportSheet from '../components/StatementImportSheet'
import { db } from '../db/schema'
import { TopBar, ProgressBar, TxnRow, formatINR, getMerchantIcon } from '../components/UI'
import { useStore } from '../store'
import { groupOf, totalAvailableCredit, recordPayment, removePayment, nextAnniversary } from '../lib/cards'
import { cardStats, rewardStatus, isCardPayment } from '../lib/cardStats'
import { ordinal } from '../lib/cycle'
import { typeLabel, networkLabel, excludedFor } from '../lib/cardCatalog'
import CardEditSheet from '../components/CardEditSheet'
import TxnDetailSheet from '../components/TxnDetailSheet'
import { entityIdFor } from '../lib/relink'

const fmtD = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const fmtS = d => (d ? format(new Date(d), 'd MMM') : '—')
const isCredit = c => !c.cardType || c.cardType === 'credit'
const cardLabel = c => `${c.name}${c.cardLast4 && !c.name.includes('••') ? ` ••${c.cardLast4}` : ''}`

// A bank account's activity also includes what the debit cards linked to it spent.
const txnsFor = (card, cards, byCard) => (card.cardType === 'account'
  ? [...(byCard[card.id] || []), ...cards.filter(c => c.linkedAccountId === card.id).flatMap(c => byCard[c.id] || [])]
  : (byCard[card.id] || []))

const STATUS = {
  paid: { label: 'Paid ✓', badge: 'badge-mint' },
  partial: { label: 'Partly paid', badge: 'badge-amber' },
  pending: { label: 'Payment pending', badge: 'badge-red' },
  none: { label: 'No bill yet', badge: 'badge-grey' },
}

function Row({ k, v, color, bold, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 12.5 }}>
      <span style={{ color: 'var(--txt2)' }}>{k}{sub && <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{sub}</div>}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || 'var(--txt)', textAlign: 'right' }}>{v}</span>
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="section-hdr" style={{ marginBottom: 6 }}>
        <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

// ───────────────────────────── list ─────────────────────────────

function CardTile({ card, txns, onOpen }) {
  const credit = isCredit(card)
  const s = credit ? cardStats(card, txns) : null
  const spentMonth = txns.filter(t => t.type === 'debit' && new Date(t.date) >= startOfMonth(new Date())).reduce((a, t) => a + t.amount, 0)
  const st = s && STATUS[s.status]
  return (
    <div className="card" onClick={onOpen} style={{ marginBottom: 10, cursor: 'pointer', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(145deg,#2D2A28,#1A1918)', color: '#E8D29A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CreditCard size={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cardLabel(card)}</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{[card.bank, networkLabel(card), card.partner].filter(Boolean).join(' · ')}</div>
        </div>
        <ChevronRight size={18} color="var(--txt3)" />
      </div>

      {credit && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0 6px' }}>
            <div>
              <div className="label-caps">Current outstanding</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{formatINR(s.outstanding)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="label-caps">Total amount due</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: s.totalDue > 0 ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{formatINR(s.totalDue)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--txt2)' }}>{s.owing ? (s.dates.dueDate ? `Due ${fmtS(s.dates.dueDate)}` : 'Due date not set') : s.status === 'paid' ? 'Nothing due' : 'No bill yet'}</span>
            <span className={`badge ${st.badge}`}>{st.label}</span>
          </div>
          {s.limit > 0 && (
            <>
              <ProgressBar pct={s.utilPct} variant={s.utilPct >= 70 ? 'red' : s.utilPct >= 40 ? 'amber' : 'mint'} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--txt2)', marginTop: 4 }}>
                <span>{formatINR(s.available)} available</span>
                <span>{card.limitGroup ? 'shared · ' : ''}limit {formatINR(s.limit)}</span>
              </div>
            </>
          )}
        </>
      )}

      {!credit && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12 }}>
          <span className={`badge ${card.cardType === 'unknown' ? 'badge-amber' : 'badge-grey'}`}>{card.cardType === 'unknown' ? 'Choose type' : typeLabel(card)}</span>
          {card.cardType === 'account' && card.accountBalance != null
            ? <span style={{ color: 'var(--txt2)' }}>Balance <b style={{ color: 'var(--txt)' }}>{formatINR(card.accountBalance)}</b></span>
            : <span style={{ color: 'var(--txt2)' }}>Spent this month <b style={{ color: 'var(--txt)' }}>{formatINR(spentMonth)}</b></span>}
        </div>
      )}
    </div>
  )
}

function Portfolio({ cards, byCard, onOpen, onAdd }) {
  const credit = cards.filter(isCredit)
  const debit = cards.filter(c => c.cardType === 'debit')
  const accounts = cards.filter(c => c.cardType === 'account')
  const unknown = cards.filter(c => c.cardType === 'unknown')
  const stats = credit.map(c => cardStats(c, byCard[c.id] || []))
  const totalOut = stats.reduce((s, x) => s + x.outstanding, 0)
  const totalDue = stats.reduce((s, x) => s + x.totalDue, 0)
  const groups = [['Credit cards', credit], ['Debit cards', debit], ['Bank accounts', accounts], ['Type not set', unknown]]

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar title="Accounts" />
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[['credit', 'Credit card'], ['debit', 'Debit card'], ['account', 'Bank account']].map(([t, l]) => (
            <button key={t} className="btn-secondary" style={{ height: 42, fontSize: 12, padding: '0 4px' }} onClick={() => onAdd(t)}>＋ {l}</button>
          ))}
        </div>
        {credit.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div className="stat-tile"><div className="label-caps">Current outstanding</div><div style={{ fontSize: 19, fontWeight: 800 }}>{formatINR(totalOut)}</div><div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{credit.length} credit card{credit.length === 1 ? '' : 's'}</div></div>
              <div className="stat-tile"><div className="label-caps">Total amount due</div><div style={{ fontSize: 19, fontWeight: 800, color: totalDue > 0 ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{formatINR(totalDue)}</div><div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>billed, still unpaid</div></div>
            </div>
            <div className="stat-tile" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="label-caps">Available credit</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(totalAvailableCredit(credit))} <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--txt2)' }}>shared limits once</span></div>
            </div>
          </>
        )}

        {groups.map(([title, list]) => list.length > 0 && (
          <div key={title}>
            <div className="label-caps" style={{ margin: '4px 2px 8px' }}>{title} · {list.length}</div>
            {list.map(c => <CardTile key={c.id} card={c} txns={txnsFor(c, cards, byCard)} onOpen={() => onOpen(c.id)} />)}
          </div>
        ))}

        {!cards.length && (
          <div className="card" style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--txt2)', fontSize: 13 }}>
            No cards or accounts yet. Add one above, or they appear automatically when bank SMS arrive.
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────── detail ─────────────────────────────

function TxnList({ card, list, emptyText, cards = [] }) {
  const [edit, setEdit] = useState(null)
  const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date))
  const credit = isCredit(card)
  return (
    <>
      {sorted.map(t => {
        const r = rewardStatus(card, t)
        const via = t.cardId !== card.id ? cards.find(c => c.id === t.cardId) : null // e.g. a debit card on this account
        return (
          <TxnRow
            key={t.id}
            icon={getMerchantIcon(t.merchant)}
            merchant={t.merchant}
            meta={`${fmtS(t.date)} · ${t.category}${via ? ` · via ${via.name}` : ''}`}
            amount={t.amount}
            isCredit={t.type === 'credit'}
            onClick={() => setEdit(t)}
            badge={!credit ? null : t.type === 'debit'
              ? (r.eligible
                ? <span className="badge badge-mint" style={{ fontSize: 9 }}>✅ Rewards</span>
                : <span className="badge badge-red" style={{ fontSize: 9 }}>⛔ {r.reason}</span>)
              : <span className="badge badge-indigo" style={{ fontSize: 9 }}>Refund / credit</span>}
          />
        )
      })}
      {!sorted.length && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--txt2)', fontSize: 12 }}>{emptyText}</div>}
      {edit && <TxnDetailSheet txn={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function PaymentDetails({ card, s }) {
  const { showNotification } = useStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: '', date: format(new Date(), 'yyyy-MM-dd') })
  const save = async () => {
    try {
      await recordPayment(card.id, form)
      showNotification(`Payment of ${formatINR(form.amount)} recorded`, 'success')
      setOpen(false); setForm({ amount: '', date: format(new Date(), 'yyyy-MM-dd') })
    } catch (e) { showNotification(e.message, 'error') }
  }
  return (
    <Section title="Payment details" right={<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setOpen(!open)}>{open ? 'Cancel' : '＋ Record payment'}</span>}>
      <Row k="Paid this cycle" sub={s.dates.statementDate ? `since ${fmtS(s.dates.statementDate)}` : undefined} v={formatINR(s.paidThisCycle)} color="var(--mint-dim)" bold />
      {open && (
        <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 10, margin: '6px 0 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input className="input" type="number" inputMode="decimal" placeholder="Amount paid (₹)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <button className="btn-primary" style={{ width: '100%', height: 38, fontSize: 13 }} onClick={save}>Save payment</button>
        </div>
      )}
      <div className="divider" />
      {s.payments.map(p => (
        <div key={p.id} className="txn-row">
          <div className="txn-icon" style={{ background: 'var(--mint-bg)', color: 'var(--mint-dim)' }}>✓</div>
          <div className="txn-mid">
            <div className="txn-merchant">Payment received</div>
            <div className="txn-meta">{fmtD(p.date)} · {p.parsedBy === 'manual' ? 'Added by you' : 'From SMS'}</div>
          </div>
          <div className="txn-amt"><div className="amt-credit">{formatINR(p.amount)}</div></div>
          {p.parsedBy === 'manual' && (
            <div title="Remove" style={{ cursor: 'pointer', color: 'var(--txt3)', padding: 6 }} onClick={async () => { await removePayment(p.id); showNotification('Payment removed', 'success') }}>✕</div>
          )}
        </div>
      ))}
      {!s.payments.length && <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--txt2)', fontSize: 12 }}>No payments recorded yet. Payment SMS from your bank are added automatically.</div>}
    </Section>
  )
}

function Detail({ card, cards, byCard, onBack }) {
  const [editOpen, setEditOpen] = useState(false)
  const [stmtOpen, setStmtOpen] = useState(false)
  const txns = txnsFor(card, cards, byCard)
  const credit = isCredit(card)
  const linkedAccount = card.cardType === 'debit' && card.linkedAccountId != null ? cards.find(c => c.id === card.linkedAccountId) : null
  const linkedCards = card.cardType === 'account' ? cards.filter(c => c.linkedAccountId === card.id) : []
  const s = cardStats(card, txns)
  const st = STATUS[s.status]
  const shared = groupOf(card, cards).filter(c => c.id !== card.id)
  const monthStart = startOfMonth(new Date())
  const spends = txns.filter(t => !isCardPayment(t))
  const spentMonth = spends.filter(t => t.type === 'debit' && new Date(t.date) >= monthStart).reduce((a, t) => a + t.amount, 0)
  const cb = txns.filter(t => t.type === 'credit' && t.category === 'Cashback')
  const cbMonth = cb.filter(t => new Date(t.date) >= monthStart).reduce((a, t) => a + t.amount, 0)
  const cbAll = cb.reduce((a, t) => a + t.amount, 0)
  const cycleLine = s.dates.statementDate ? `monthly on the ${ordinal(Number(card.billingCycleDate))}` : undefined
  const exclusions = excludedFor(card)

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div onClick={onBack} style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={19} /></div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
        {(card.cardType === 'account' || credit) && <button className="btn-secondary" style={{ height: 34, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setStmtOpen(true)}><FileText size={13} /> Statement</button>}
        <button className="btn-secondary" style={{ height: 34, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setEditOpen(true)}><Pencil size={13} /> Edit</button>
      </div>

      <div style={{ padding: '0 16px' }}>
        {card.cardType === 'unknown' && (
          <div className="card" style={{ marginBottom: 12, padding: '10px 14px', borderColor: 'var(--amber-border)', background: 'var(--amber-bg)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-dim)' }}>Is this a credit card, a debit card or a bank account?</div>
            <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '2px 0 8px' }}>The SMS didn't say. Until you choose, its spends are listed but no balance is tracked.</div>
            <button className="btn-secondary" style={{ height: 34 }} onClick={() => setEditOpen(true)}>Choose card type</button>
          </div>
        )}

        {/* Card */}
        <div className="cc-visual" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(232,210,154,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8D29A' }}><CreditCard size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{card.name}</div>
              <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{card.bank} •• {card.cardLast4}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#E8D29A' }}>{networkLabel(card) || typeLabel(card)}</div>
              <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{[networkLabel(card) ? typeLabel(card) : '', card.partner].filter(Boolean).join(' · ')}</div>
            </div>
          </div>

          {credit ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                <div>
                  <div className="label-caps">Current outstanding</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{formatINR(s.outstanding)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="label-caps">Total amount due</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.totalDue > 0 ? '#FFB4B4' : '#7FE0B0' }}>{formatINR(s.totalDue)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--txt2)', marginBottom: 12 }}>
                <span>{s.owing ? <>Due date <b style={{ color: 'var(--txt)' }}>{s.dates.dueDate ? fmtD(s.dates.dueDate) : '—'}</b></> : s.status === 'paid' ? 'Nothing due — bill paid' : 'No bill to pay yet'}</span>
                <span>{st.label}</span>
              </div>
              {s.limit > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--txt2)', marginBottom: 4 }}>
                    <span className="label-caps">Limit used {s.utilPct}%</span>
                    <span style={{ fontWeight: 700 }}>{formatINR(s.available)} available of {formatINR(s.limit)}</span>
                  </div>
                  <ProgressBar pct={s.utilPct} variant={s.utilPct >= 70 ? 'red' : s.utilPct >= 40 ? 'amber' : 'mint'} />
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Available credit {formatINR(s.available)} · set the limit in Edit</div>
              )}
              {shared.length > 0 && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt2)' }}>Limit shared with {shared.map(c => cardLabel(c)).join(', ')}</div>}
            </>
          ) : (
            <>
              {card.cardType === 'account' && (
                <>
                  <div className="label-caps">Balance (as last reported by the bank)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>{card.accountBalance != null ? formatINR(card.accountBalance) : '—'}</div>
                </>
              )}
              <div className="label-caps">Spent this month</div>
              <div style={{ fontSize: card.cardType === 'account' ? 17 : 24, fontWeight: 800 }}>{formatINR(spentMonth)}</div>
              {linkedAccount && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--txt2)' }}>
                  Spends from <b style={{ color: 'var(--txt)' }}>{linkedAccount.name}</b>
                  {linkedAccount.accountBalance != null ? <> · balance <b style={{ color: 'var(--txt)' }}>{formatINR(linkedAccount.accountBalance)}</b></> : ' · add its balance to track it'}
                </div>
              )}
              {card.cardType === 'debit' && !linkedAccount && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--txt2)' }}>Not linked to a bank account yet. Tap Edit to link one, so spends reduce its balance.</div>
              )}
              {linkedCards.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--txt2)' }}>Debit cards on this account: <b style={{ color: 'var(--txt)' }}>{linkedCards.map(cardLabel).join(', ')}</b></div>
              )}
            </>
          )}
        </div>

        {credit && (
          <>
            {/* Outstanding */}
            <Section title="Outstanding details" right={<span className={`badge ${st.badge}`}>{st.label}</span>}>
              <Row k="Total amount due" sub={s.billed > 0 ? `${formatINR(s.billed)} billed − ${formatINR(s.paidThisCycle)} paid${s.billedIsEstimate ? ' · estimated' : ''}` : 'nothing billed yet'} v={formatINR(s.totalDue)} color={s.totalDue > 0 ? 'var(--red-dim)' : 'var(--mint-dim)'} />
              <Row k="+ Spends after the statement" sub={s.dates.statementDate ? `since ${fmtS(s.dates.statementDate)}` : undefined} v={formatINR(s.unbilled)} />
              <div className="divider" />
              <Row k="Current outstanding" v={formatINR(s.outstanding)} bold />
              {s.bankUsed != null && Math.abs(s.bankUsed - s.outstanding) >= 1 && (
                <Row k="Limit in use per bank" sub="limit − available limit; may include interest, fees or spends the SMS did not show" v={formatINR(s.bankUsed)} color="var(--txt2)" />
              )}
            </Section>

            {/* Billed */}
            <Section title="Billed details">
              <Row k="Statement date" sub={cycleLine} v={s.dates.statementDate ? fmtD(s.dates.statementDate) : 'Not set — tap Edit'} />
              <Row k="Payment due date" sub={s.owing && s.dates.dueDate ? `${card.paymentDueDays} days after statement` : undefined} v={s.owing ? (s.dates.dueDate ? fmtD(s.dates.dueDate) : '—') : s.status === 'paid' ? 'Paid — nothing due' : 'No bill yet'} />
              {s.dates.nextStatementDate && <Row k="Next statement" v={`${fmtD(s.dates.nextStatementDate)} · due ${fmtS(s.dates.nextDueDate)}`} />}
              <div className="divider" />
              <Row k="Billed amount" sub={s.billedIsEstimate ? (s.billed > 0 ? 'estimate, no statement SMS yet' : undefined) : 'from statement'} v={formatINR(s.billed)} bold />
              <Row k="Paid so far" v={`− ${formatINR(s.paidThisCycle)}`} color="var(--mint-dim)" />
              <Row k="Pending due" v={formatINR(s.pendingBilled)} color={s.pendingBilled > 0 ? 'var(--red-dim)' : 'var(--mint-dim)'} bold />
              <Row k="Minimum due" v={formatINR(card.minimumDue || 0)} />
            </Section>

            {/* Spend */}
            <Section title="Spend details">
              <Row k="Unbilled spends" sub={s.dates.statementDate ? `since ${fmtS(s.dates.statementDate)}` : undefined} v={formatINR(s.unbilled)} bold />
              <Row k="Billed in last statement" sub={s.prevStatement ? `${fmtS(s.prevStatement)} – ${fmtS(s.dates.statementDate)}` : undefined} v={formatINR(s.billedSpends)} />
              <Row k="Spent this month" v={formatINR(spentMonth)} />
              <div className="label-caps" style={{ margin: '10px 0 2px' }}>Unbilled · {s.unbilledTxns.length}</div>
              <TxnList card={card} list={s.unbilledTxns} emptyText="No spends since the last statement" />
              {s.dates.statementDate && (
                <>
                  <div className="label-caps" style={{ margin: '12px 0 2px' }}>Billed · {s.billedTxns.length}</div>
                  <TxnList card={card} list={s.billedTxns} emptyText="No spends in the last statement period" />
                </>
              )}
            </Section>

            <PaymentDetails card={card} s={s} />

            {/* Rewards & fees */}
            <Section title="Rewards & fees" right={<Gift size={15} color="var(--pink)" />}>
              <Row k="Cashback this month" v={formatINR(cbMonth)} color="var(--mint-dim)" />
              <Row k="Cashback all-time" v={formatINR(cbAll)} color="var(--mint-dim)" />
              {card.rewardPoints > 0 && <Row k="Reward points" v={card.rewardPoints.toLocaleString('en-IN')} />}
              <Row k="No rewards on" v={exclusions.length ? exclusions.join(', ') : 'nothing excluded'} />
              <div className="divider" />
              <Row k="Annual fee" sub={!card.isLTF && card.annualFee > 0 ? `${formatINR(card.annualFee)} + 18% GST ${formatINR(card.annualFeeGST || 0)}` : undefined} v={card.isLTF ? 'Lifetime free' : `${formatINR(card.totalAnnualFee || 0)} / yr`} />
              {!card.isLTF && card.feeWaiverThreshold > 0 && <Row k="Fee waiver spend" v={`${formatINR(card.totalPaidThisYear || 0)} / ${formatINR(card.feeWaiverThreshold)}`} />}
              {(card.issueDate || card.annualFeeDate) && <Row k="Card issued on" v={fmtD(card.issueDate || card.annualFeeDate)} />}
              {!card.isLTF && (card.issueDate || card.annualFeeDate) && <Row k="Next annual fee" v={fmtD(nextAnniversary(card.issueDate || card.annualFeeDate))} sub="on the card's issue date every year" />}
              {card.interestRate > 0 && <Row k="Interest rate" v={`${card.interestRate}% / month`} />}
              {card.notes && <Row k="Notes" v={card.notes} />}
            </Section>
          </>
        )}

        {!credit && (
          <Section title={card.cardType === 'account' ? 'Account transactions' : 'Transactions'}>
            <TxnList card={card} list={spends} cards={cards} emptyText="No transactions yet for this card" />
          </Section>
        )}
      </div>

      {editOpen && <CardEditSheet card={card} cards={cards} onClose={() => setEditOpen(false)} />}
      {stmtOpen && <StatementImportSheet account={card} onClose={() => setStmtOpen(false)} />}
    </div>
  )
}

// ───────────────────────────── screen ─────────────────────────────

export default function Accounts() {
  const [openId, setOpenId] = useState(null)
  const [newId, setNewId] = useState(null)
  const cards = useLiveQuery(() => db.creditCards.toArray())
  const allTxns = useLiveQuery(() => db.transactions.toArray())
  const { openCardId, clearOpenCard } = useStore()

  // Another screen asked for a particular card / account (Home list, a transaction's detail).
  useEffect(() => {
    if (openCardId != null) { setOpenId(openCardId); clearOpenCard() }
  }, [openCardId])

  if (!cards || !allTxns) return <div style={{ padding: 20, color: 'var(--txt2)' }}>Loading...</div>

  const visible = cards.filter(c => !c.draft)
  // A transaction counts for a card / account when it is linked to it, or is tagged with that
  // account's bank + last 4 digits (older entries that were never formally linked).
  const byCard = {}
  for (const t of allTxns) {
    const id = entityIdFor(t, visible)
    if (id != null) (byCard[id] ||= []).push(t)
  }
  const card = visible.find(c => c.id === openId)
  const draft = cards.find(c => c.id === newId)

  // Adds a hidden draft entry of the chosen type and opens the form for it.
  const addNew = async type => {
    const id = await db.creditCards.add({
      name: '', bank: '', cardLast4: '', cardType: type, draft: true, network: '', variant: '', partner: '',
      creditLimit: 0, availableCredit: 0, currentBalance: 0, statementBalance: 0, minimumDue: 0, isLTF: true,
      rewardRules: [{ id: 'BASE', matchType: 'BASE', targets: [], rate: 0.01, cap: 0, capPeriod: 'uncapped' }],
    })
    setNewId(id)
  }

  return (
    <>
      {card
        ? <Detail card={card} cards={visible} byCard={byCard} onBack={() => setOpenId(null)} />
        : <Portfolio cards={visible} byCard={byCard} onOpen={setOpenId} onAdd={addNew} />}
      {draft && <CardEditSheet isNew card={draft} cards={visible} onClose={id => { setNewId(null); if (id) setOpenId(id) }} />}
    </>
  )
}
