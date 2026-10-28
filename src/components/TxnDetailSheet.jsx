import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { formatINR, getMerchantIcon } from './UI'
import TxnEditSheet from './TxnEditSheet'
import { isCardPayment, rewardStatus } from '../lib/cardStats'
import { typeLabel, cardTitle } from '../lib/cardCatalog'
import { entityIdFor } from '../lib/relink'

function Row({ k, v, color }) {
  if (v == null || v === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--txt2)', flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: color || 'var(--txt)', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  )
}

// Read-only details of one transaction, opened by tapping it anywhere in the app. Edit opens the form.
export default function TxnDetailSheet({ txn, onClose }) {
  const { openCard } = useStore()
  const [editing, setEditing] = useState(false)
  const live = useLiveQuery(() => db.transactions.get(txn.id).then(r => r || null), [txn.id]) // null = deleted
  const t = live || txn
  const allCards = useLiveQuery(() => db.creditCards.toArray()) || []
  // Linked directly, or matched by its bank + last-4 tag (same rule the account pages use).
  const cardId = entityIdFor(t, allCards.filter(c => !c.draft))
  const card = allCards.find(c => c.id === cardId) || null

  // Deleted from the edit form: nothing left to show.
  useEffect(() => { if (live === null) onClose() }, [live])

  if (editing) return <TxnEditSheet txn={t} onClose={() => setEditing(false)} />
  if (live === null) return null

  const payment = isCardPayment(t)
  const credit = t.type === 'credit'
  const kind = payment ? 'Card payment' : credit ? 'Income / money in' : 'Expense / money out'
  const paidVia = card
    ? `${cardTitle(card)} · ${typeLabel(card)}`
    : t.accountLast4 ? `${t.bank || 'Bank'} ••${t.accountLast4} (not linked to an account yet)` : null
  const reward = card && (!card.cardType || card.cardType === 'credit') && !payment && t.type === 'debit' ? rewardStatus(card, t) : null

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: credit ? 'var(--mint-bg)' : 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{payment ? '✓' : getMerchantIcon(t.merchant)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{t.merchant || 'Unknown'}</div>
            <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{format(new Date(t.date), 'EEE, d MMM yyyy · h:mm a')}</div>
          </div>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 10px', color: credit ? 'var(--mint-dim)' : 'var(--red-dim)' }}>
          {credit ? '+' : '−'}{formatINR(t.amount, 2)}
        </div>

        <Row k="Type" v={kind} />
        <Row k="Category" v={t.category} />
        <Row k="Paid via" v={paidVia} />
        <Row k="Payment mode" v={t.paymentMode} />
        <Row k="Bank" v={t.bank} />
        <Row k="Account / card no." v={t.accountLast4 ? `••${t.accountLast4}` : null} />
        {reward && <Row k="Card rewards" v={reward.eligible ? 'Earns rewards' : `No rewards · ${reward.reason}`} color={reward.eligible ? 'var(--mint-dim)' : 'var(--red-dim)'} />}
        <Row k="Counted in totals" v={t.isExcluded ? 'No — excluded' : 'Yes'} />
        <Row k="Tags" v={t.tags?.length ? t.tags.join(', ') : null} />
        <Row k="Notes" v={t.notes} />
        <Row k={t.type === 'debit' ? 'Paid to' : 'Received from'} v={t.counterparty} />
        <Row k="UPI ID" v={t.vpa} />
        <Row k="Reference no." v={t.refNo} />
        <Row k="Source" v={t.stmtKey ? 'Corrected from your bank statement' : t.rawSMS ? 'Read from an SMS' : t.parsedBy === 'manual' ? 'Added by you' : 'Imported from an SMS'} />

        {t.bankNarration && (
          <>
            <div className="label-caps" style={{ margin: '12px 0 4px' }}>Bank statement says</div>
            <div className="sms-raw">{t.bankNarration}</div>
          </>
        )}

        {t.rawSMS && (
          <>
            <div className="label-caps" style={{ margin: '12px 0 4px' }}>Original SMS</div>
            <div className="sms-raw">{t.rawSMS}</div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>
          {card && <button className="btn-secondary" style={{ height: 46 }} onClick={() => { openCard(card.id); onClose() }}>Open {card.cardType === 'account' ? 'account' : 'card'}</button>}
          <button className="btn-ghost" style={{ height: 46 }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
