import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths } from 'date-fns'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, CreditCard, FileText, Gift, Landmark, Pencil } from 'lucide-react'
import StatementImportSheet from '../components/StatementImportSheet'
import { db } from '../db/schema'
import { TopBar, ProgressBar, TxnRow, formatINR, getMerchantIcon } from '../components/UI'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { askConfirm } from '../lib/confirm'
import { groupOf, totalAvailableCredit, recordPayment, removePayment, nextAnniversary } from '../lib/cards'
import { cardStats, rewardStatus, isCardPayment, feeWaiverSpend } from '../lib/cardStats'
import { ordinal } from '../lib/cycle'
import { typeLabel, networkLabel, excludedFor, cardTitle } from '../lib/cardCatalog'
import CardEditSheet from '../components/CardEditSheet'
import TxnDetailSheet from '../components/TxnDetailSheet'
import { entityIdFor } from '../lib/relink'
import { txnName } from '../lib/txnName'
import { Segmented, TextField, Picker } from '../components/Fields'
import Sortable from '../components/Sortable'
import TxnEditSheet from '../components/TxnEditSheet'
import { syncCardAmounts } from '../lib/cardSync'
import { tagCardRewards } from '../lib/rewardTagging'
import { rewardPill } from '../lib/rewardRules'
import RewardRulesSheet from '../components/RewardRulesSheet'
import RewardsAuditSheet from '../components/RewardsAuditSheet'
import { isNative, syncInbox } from '../lib/nativeSms'
import { bySortOrder, saveOrder } from '../lib/sortOrder'

const fmtD = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const fmtS = d => (d ? format(new Date(d), 'd MMM') : '—')
const isCredit = c => !c.cardType || c.cardType === 'credit'
// what the card costs each year, shown as a small tag
const feeTag = c => (c.isLTF === false && c.totalAnnualFee > 0 ? `₹${Math.round(c.totalAnnualFee).toLocaleString('en-IN')} / yr` : 'Lifetime free')
const cardLabel = c => cardTitle(c)

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

// Tap the heading to fold a section away; which ones are folded is remembered on this phone
const FOLD_KEY = 'finping_folded_sections'
const readFolded = () => { try { const v = JSON.parse(localStorage.getItem(FOLD_KEY)); return Array.isArray(v) ? Object.fromEntries(v.map(t => [t, true])) : (v || {}) } catch { return {} } }
function Section({ title, right, children, fold = false }) {
  const [folded, setFolded] = useState(() => { const m = readFolded(); return title in m ? !!m[title] : fold })
  const toggle = () => {
    const next = !folded
    setFolded(next)
    localStorage.setItem(FOLD_KEY, JSON.stringify({ ...readFolded(), [title]: next }))
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="section-hdr" style={{ marginBottom: folded ? 0 : 6 }}>
        <div role="button" tabIndex={0} aria-expanded={!folded} onClick={toggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggle() }} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1, minWidth: 0 }}>
          <ChevronDown size={15} color="var(--gold-dim)" style={{ transform: folded ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
          <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>{title}</div>
        </div>
        {right}
      </div>
      {!folded && children}
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
          <div style={{ fontSize: 11, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><span>{[card.bank, networkLabel(card), card.partner].filter(Boolean).join(' · ')}</span>{credit && <span className={`badge ${card.isLTF === false && card.totalAnnualFee > 0 ? 'badge-amber' : 'badge-mint'}`}>{feeTag(card)}</span>}</div>
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

const reorderPill = (on, toggle) => (
  <button onClick={toggle} style={{ height: 28, padding: '0 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--gold-border)', background: on ? 'var(--gold-grad)' : 'var(--gold-bg)', color: on ? 'var(--on-accent)' : 'var(--gold-dim)' }}>{on ? 'Done' : '⇅ Reorder'}</button>
)

function Portfolio({ cards, byCard, onOpen, onAdd }) {
  const [editing, setEditing] = useState(null) // title of the group being rearranged
  const credit = cards.filter(isCredit)
  const debit = cards.filter(c => c.cardType === 'debit')
  const accounts = cards.filter(c => c.cardType === 'account')
  const unknown = cards.filter(c => c.cardType === 'unknown')
  const stats = credit.map(c => cardStats(c, byCard[c.id] || []))
  // a limit shared by several cards is counted once
  const seenGroups = new Set()
  const totalOut = credit.reduce((sum, c, i) => {
    if (c.limitGroup) { if (seenGroups.has(c.limitGroup)) return sum; seenGroups.add(c.limitGroup) }
    return sum + (c.limitGroup ? (stats[i].bankUsed ?? stats[i].outstanding) : stats[i].outstanding)
  }, 0)
  const totalDue = stats.reduce((s, x) => s + x.totalDue, 0)
  const groups = [['Credit cards', bySortOrder(credit)], ['Debit cards', bySortOrder(debit)], ['Bank accounts', bySortOrder(accounts)], ['Type not set', bySortOrder(unknown)]]

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 2px 8px' }}>
              <div className="label-caps">{title} · {list.length}</div>
              {list.length > 1 && reorderPill(editing === title, () => setEditing(editing === title ? null : title))}
            </div>
            {editing === title && list.length > 1 ? (
              <Sortable items={list} getId={c => c.id} enabled onReorder={items => saveOrder('creditCards', items)}
                renderItem={(c, { handle, dragging }) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg1)', border: '1px solid ' + (dragging ? 'var(--gold)' : 'var(--border)'), borderRadius: 16, padding: '10px 14px', marginBottom: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(145deg,#2D2A28,#1A1918)', color: '#E8D29A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.cardType === 'account' ? <Landmark size={18} /> : <CreditCard size={18} />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cardLabel(c)}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{[c.bank, typeLabel(c)].filter(Boolean).join(' · ')}</div>
                    </div>
                    {handle}
                  </div>
                )} />
            ) : list.map(c => <CardTile key={c.id} card={c} txns={txnsFor(c, cards, byCard)} onOpen={() => onOpen(c.id)} />)}
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
            merchant={txnName(t)}
            meta={`${fmtD(t.date)} · ${t.category}${via ? ` · via ${via.name}` : ''}`}
            amount={t.amount}
            isCredit={t.type === 'credit'}
            onClick={() => setEdit(t)}
            badge={<>{!credit ? null : t.type === 'debit'
              ? (r.eligible
                ? <span className="badge badge-mint" style={{ fontSize: 9 }}>✅ Rewards</span>
                : <span className="badge badge-red" style={{ fontSize: 9 }}>⛔ {r.reason}</span>)
              : <span className="badge badge-indigo" style={{ fontSize: 9 }}>{t.kind === 'card_payment' || t.category === 'Card Payment' ? 'Bill payment' : t.category === 'Cashback' ? 'Cashback' : 'Refund'}</span>}{rewardPill(t.expectedReward) && <span className="badge badge-mint" style={{ fontSize: 9, marginLeft: 4 }}>{rewardPill(t.expectedReward)}</span>}</>}
          />
        )
      })}
      {!sorted.length && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--txt2)', fontSize: 12 }}>{emptyText}</div>}
      {edit && <TxnDetailSheet txn={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

// Transactions of one card or account with a filter: period (7 days, this / last month, 3 months, your own dates)
// and direction (money in, money out or both). The totals under it follow the filter.
const PERIODS = [
  { value: 'all', label: 'All time' }, { value: '7d', label: 'Last 7 days' }, { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' }, { value: '3m', label: 'Last 3 months' }, { value: 'custom', label: 'Custom dates' },
]
function periodRange(period, from, to, now = new Date()) {
  if (period === '7d') return [startOfDay(subDays(now, 6)), endOfDay(now)]
  if (period === 'month') return [startOfMonth(now), endOfDay(now)]
  if (period === 'lastmonth') { const m = subMonths(now, 1); return [startOfMonth(m), endOfMonth(m)] }
  if (period === '3m') return [startOfDay(subMonths(now, 3)), endOfDay(now)]
  if (period === 'custom') return [from ? startOfDay(new Date(from + 'T12:00:00')) : null, to ? endOfDay(new Date(to + 'T12:00:00')) : null]
  return [null, null]
}
export function filterTxns(list, { period, from, to, dir }, now = new Date()) {
  const [a, b] = periodRange(period, from, to, now)
  return list.filter(t => {
    const d = new Date(t.date)
    if (a && d < a) return false
    if (b && d > b) return false
    if (dir === 'in' && t.type !== 'credit') return false
    if (dir === 'out' && t.type !== 'debit') return false
    return true
  })
}
function FilteredTxnList({ card, list, cards, emptyText }) {
  const [f, setF] = useState({ period: 'month', from: '', to: '', dir: 'both' })
  const shown = filterTxns(list, f)
  const money = shown // card bill payments count as money in even though they are left out of spending
  const inn = money.filter(t => t.type === 'credit').reduce((a, t) => a + t.amount, 0)
  const out = money.filter(t => t.type === 'debit').reduce((a, t) => a + t.amount, 0)
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
        <Picker value={f.period} options={PERIODS} onChange={v => setF({ ...f, period: v })} title="Show transactions from" icon={<Calendar size={17} />} />
        {f.period === 'custom' && (
          <div className="form-grid">
            <TextField icon={<Calendar size={17} />} type="date" value={f.from} max={f.to || undefined} onChange={e => setF({ ...f, from: e.target.value })} placeholder="From" aria-label="From date" />
            <TextField icon={<Calendar size={17} />} type="date" value={f.to} min={f.from || undefined} onChange={e => setF({ ...f, to: e.target.value })} placeholder="To" aria-label="To date" />
          </div>
        )}
        <Segmented value={f.dir} options={[{ value: 'both', label: 'Both' }, { value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }]} onChange={v => setF({ ...f, dir: v })} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--txt2)', padding: '0 4px' }}>
          <span>{shown.length} transaction{shown.length === 1 ? '' : 's'}</span>
          <span>{f.dir !== 'out' && <>In <b style={{ color: 'var(--mint-dim)' }}>{formatINR(inn)}</b></>}{f.dir === 'both' && ' · '}{f.dir !== 'in' && <>Out <b style={{ color: 'var(--red-dim)' }}>{formatINR(out)}</b></>}</span>
        </div>
      </div>
      <TxnList card={card} list={shown} cards={cards} emptyText={list.length ? 'No transactions match this filter' : emptyText} />
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
    <Section title="Payment details" fold right={<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setOpen(!open)}>{open ? 'Cancel' : '＋ Record payment'}</span>}>
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
            <div title="Remove" style={{ cursor: 'pointer', color: 'var(--txt3)', padding: 6 }} onClick={async () => { if (!(await askConfirm({ title: 'Remove this payment?', message: 'The card balance goes back up by this amount.', confirmLabel: 'Remove' }))) return; await removePayment(p.id); showNotification('Payment removed', 'success') }}>✕</div>
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
  const [addOpen, setAddOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const { showNotification } = useStore()
  const txns = txnsFor(card, cards, byCard)
  // look through the inbox again for recent bank SMS (those already applied are skipped), now and on request
  const checkSms = async (say = false) => {
    if (!isNative()) { if (say) showNotification('SMS can only be read in the Android app', 'error'); return }
    try { const n = await syncInbox({ rescanDays: 45 }); if (say || n > 0) showNotification(n > 0 ? `${n} SMS added` : 'No new SMS found', n > 0 ? 'success' : undefined) } catch { if (say) showNotification('Could not read SMS', 'error') }
  }
  useEffect(() => { checkSms() }, [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!card.cardType || card.cardType === 'credit') tagCardRewards(card.id).catch(() => {}) }, [card.id, (byCard[card.id] || []).length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!card.cardType || card.cardType === 'credit') syncCardAmounts(card.id).catch(() => {}) }, [card.id, (byCard[card.id] || []).length]) // eslint-disable-line react-hooks/exhaustive-deps
  const credit = isCredit(card)
  const linkedAccount = card.cardType === 'debit' && card.linkedAccountId != null ? cards.find(c => c.id === card.linkedAccountId) : null
  const linkedCards = card.cardType === 'account' ? cards.filter(c => c.linkedAccountId === card.id) : []
  const s = cardStats(card, txns)
  const st = STATUS[s.status]
  const shared = groupOf(card, cards).filter(c => c.id !== card.id)
  const monthStart = startOfMonth(new Date())
  const spends = txns.filter(t => !isCardPayment(t))
  const spentMonth = spends.filter(t => t.type === 'debit' && new Date(t.date) >= monthStart).reduce((a, t) => a + t.amount, 0)
  // cashback earned, less any that was taken back (a "Cashback_Reversal" debit)
  const cb = txns.filter(t => t.category === 'Cashback')
  const cbNet = list => list.reduce((a, t) => a + (t.type === 'credit' ? t.amount : -t.amount), 0)
  const cbMonth = cbNet(cb.filter(t => new Date(t.date) >= monthStart))
  const cbAll = cbNet(cb)
  const cycleLine = s.dates.statementDate ? `monthly on the ${ordinal(Number(card.billingCycleDate))}` : undefined
  const exclusions = excludedFor(card)

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div onClick={onBack} style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={19} /></div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cardTitle(card, { last4: false })}</div>
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
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{cardTitle(card, { last4: false })}</div>
              <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{card.cardType === 'account' ? (card.variant || 'Bank account') : card.bank}{card.cardLast4 ? ` •• ${card.cardLast4}` : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#E8D29A' }}>{networkLabel(card) || typeLabel(card)}</div>
              <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{[networkLabel(card) ? typeLabel(card) : '', card.partner].filter(Boolean).join(' · ')}</div>
              {credit && <div style={{ fontSize: 10, fontWeight: 700, color: card.isLTF === false && card.totalAnnualFee > 0 ? '#F0B15C' : '#7FE0B0', marginTop: 2 }}>{feeTag(card)}</div>}
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
            {/* Bill & dues: what is owed now, and the bill behind it */}
            <Section title="Bill & dues" right={<span className={`badge ${st.badge}`}>{st.label}</span>}>
              <Row k="Total amount due" sub={s.billed > 0 ? `${formatINR(s.billed)} billed − ${formatINR(s.paidThisCycle)} paid${s.billedIsEstimate ? ' · estimated' : ''}` : 'nothing billed yet'} v={formatINR(s.totalDue)} color={s.totalDue > 0 ? 'var(--red-dim)' : 'var(--mint-dim)'} />
              <Row k="+ Spends after the statement" sub={s.dates.statementDate ? `since ${fmtS(s.dates.statementDate)}` : undefined} v={formatINR(s.unbilled)} />
              <div className="divider" />
              <Row k="Current outstanding" sub={s.shared ? 'this card’s own bills and spends' : (s.bankUsed != null ? 'credit limit − available credit' : undefined)} v={formatINR(s.outstanding)} bold />
              {s.shared && s.bankUsed != null && <Row k="Shared limit in use (all cards)" sub="limit − available credit, across every card on this limit" v={formatINR(s.bankUsed)} color="var(--txt2)" />}
              {!s.shared && s.bankUsed != null && Math.abs(s.tracked - s.outstanding) >= 1 && (
                <Row k="Tracked from bills and spends" sub="what the saved bills, payments and spends add up to" v={formatINR(s.tracked)} color="var(--txt2)" />
              )}
              <div className="divider" />
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
            <Section title="Spend details" right={<span style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }}><span onClick={() => checkSms(true)}>↻ Check SMS</span><span onClick={() => setAddOpen(true)}>＋ Add</span></span>}>
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
            <Section title="Rewards & fees" fold right={<Gift size={15} color="var(--pink)" />}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className="btn-secondary" style={{ flex: 1, height: 38, fontSize: 12.5 }} onClick={() => setRulesOpen(true)}>⚙ Reward rules</button>
                <button className="btn-secondary" style={{ flex: 1, height: 38, fontSize: 12.5 }} onClick={() => setAuditOpen(true)}>🔎 Rewards audit</button>
              </div>
              <Row k="Cashback this month" v={formatINR(cbMonth)} color="var(--mint-dim)" />
              <Row k="Cashback all-time" v={formatINR(cbAll)} color="var(--mint-dim)" />
              {card.rewardPoints > 0 && <Row k="Reward points" v={card.rewardPoints.toLocaleString('en-IN')} />}
              <Row k="No rewards on" v={exclusions.length ? exclusions.join(', ') : 'nothing excluded'} />
              <div className="divider" />
              <Row k="Annual fee" sub={!card.isLTF && card.annualFee > 0 ? `${formatINR(card.annualFee)} + 18% GST ${formatINR(card.annualFeeGST || 0)}` : undefined} v={card.isLTF ? 'Lifetime free' : `${formatINR(card.totalAnnualFee || 0)} / yr`} />
              {!card.isLTF && card.feeWaiverThreshold > 0 && (() => {
                const w = feeWaiverSpend(card, txns, new Date(), card.feeWaiverThreshold)
                const left = Math.max(0, card.feeWaiverThreshold - w.spent)
                return (
                  <>
                    <Row k="Fee waiver spend" v={`${formatINR(w.spent)} / ${formatINR(card.feeWaiverThreshold)}`} color={left === 0 ? 'var(--mint-dim)' : undefined}
                      sub={left === 0 ? 'Target reached: the annual fee is waived ✓' : `${formatINR(left)} more to waive the fee · counted since ${fmtD(w.start)}${w.hasIssueDate ? '' : ' (last 12 months: add the issue date for the exact card year)'}`} />
                    <ProgressBar pct={Math.min(100, Math.round(w.spent / card.feeWaiverThreshold * 100))} variant={left === 0 ? 'mint' : 'amber'} />
                    {w.hasIssueDate && <Row k="This card year" v={`${fmtD(w.start)} – ${fmtD(new Date(w.end.getTime() - 86400000))}`} />}
                    {w.years.slice(1).map(y => (
                      <Row key={+y.start} k={`${fmtD(y.start)} – ${fmtD(new Date(y.end.getTime() - 86400000))}`} v={`${formatINR(y.spent)} ${y.met ? '✓ waived' : '✗ not met'}`} color={y.met ? 'var(--mint-dim)' : 'var(--red-dim)'} />
                    ))}
                  </>
                )
              })()}
              {(card.issueDate || card.annualFeeDate) && <Row k="Card issued on" v={fmtD(card.issueDate || card.annualFeeDate)} />}
              {!card.isLTF && (card.issueDate || card.annualFeeDate) && <Row k="Next annual fee" v={fmtD(nextAnniversary(card.issueDate || card.annualFeeDate))} sub="on the card's issue date every year" />}
              {card.interestRate > 0 && <Row k="Interest rate" v={`${card.interestRate}% / month`} />}
              {card.notes && <Row k="Notes" v={card.notes} />}
            </Section>
          </>
        )}

        {!credit && (
          <Section title={card.cardType === 'account' ? 'Account transactions' : 'Transactions'}>
            <FilteredTxnList card={card} list={txns} cards={cards} emptyText="No transactions yet for this card" />
          </Section>
        )}

        {credit && (
          <Section title="All transactions" fold>
            <FilteredTxnList card={card} list={txns} cards={cards} emptyText="No transactions yet for this card" />
          </Section>
        )}
      </div>

      {rulesOpen && <RewardRulesSheet card={card} onClose={() => setRulesOpen(false)} />}
      {auditOpen && <RewardsAuditSheet card={card} onClose={() => setAuditOpen(false)} />}
      {addOpen && <TxnEditSheet txn={{ type: 'debit', date: new Date(), amount: '', merchant: '', category: 'General', paymentMode: card.cardType === 'account' ? 'Bank' : 'Credit Card', cardId: card.id }} onClose={() => setAddOpen(false)} />}
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

  useBackHandler(openId != null, () => setOpenId(null)) // before the early return: hooks keep their order
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
