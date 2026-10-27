import { useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { useStore } from '../store'
import { BtnPrimary } from './UI'

const CATEGORIES = ['Food Delivery', 'E-Commerce', 'Utilities & Bills', 'Transport', 'Health', 'Fuel', 'Rent', 'Grocery', 'Travel Online',
  'Entertainment', 'Insurance', 'EMI', 'Investment', 'UPI Scan & Pay', 'Cashback', 'Salary', 'Transfer', 'General']
const MODES = ['UPI', 'Credit Card', 'Debit Card', 'Card', 'Bank', 'NetBanking', 'Cash', 'Wallet', 'Other']

function Field({ label, children }) {
  return (
    <div>
      <div className="label-caps" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

// Fix anything SMS parsing got wrong: direction, mode, category, card, amount...
export default function TxnEditSheet({ txn, onClose }) {
  const { showNotification } = useStore()
  const cards = useLiveQuery(() => db.creditCards.toArray()) || []
  const [f, setF] = useState({
    merchant: txn.merchant || '', amount: String(txn.amount ?? ''), date: format(new Date(txn.date), 'yyyy-MM-dd'),
    type: txn.type || 'debit', category: txn.category || 'General', paymentMode: txn.paymentMode || 'Other',
    cardId: txn.cardId ?? '', notes: txn.notes || '', isExcluded: !!txn.isExcluded,
  })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const categories = CATEGORIES.includes(f.category) ? CATEGORIES : [f.category, ...CATEGORIES]
  const modes = MODES.includes(f.paymentMode) ? MODES : [f.paymentMode, ...MODES]

  const save = async () => {
    const amount = Number(f.amount)
    if (!(amount > 0)) { showNotification('Enter a valid amount', 'error'); return }
    const [y, m, d] = f.date.split('-').map(Number)
    const old = new Date(txn.date)
    await db.transactions.update(txn.id, {
      merchant: f.merchant.trim() || 'Unknown', amount, type: f.type, category: f.category, paymentMode: f.paymentMode,
      date: new Date(y, m - 1, d, old.getHours(), old.getMinutes()),
      cardId: f.cardId === '' ? null : Number(f.cardId), notes: f.notes, isExcluded: f.isExcluded,
      parsedBy: txn.parsedBy === 'auto' ? 'auto-edited' : txn.parsedBy,
    })
    showNotification('Transaction updated', 'success')
    onClose()
  }

  const remove = async () => {
    if (!window.confirm('Delete this transaction? Card balances are not changed.')) return
    await db.transactions.delete(txn.id)
    showNotification('Transaction deleted', 'success')
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Edit transaction</div>
        {txn.rawSMS && <div className="sms-raw" style={{ marginBottom: 12 }}>{txn.rawSMS}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Type">
            <div style={{ display: 'flex', gap: 8 }}>
              {[['debit', 'Expense (money out)'], ['credit', 'Income / deposit (money in)']].map(([v, l]) => (
                <div key={v} className={`chip${f.type === v ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setF({ ...f, type: v })}>{l}</div>
              ))}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Merchant / description"><input className="input" value={f.merchant} onChange={set('merchant')} /></Field>
            <Field label="Amount (₹)"><input className="input" type="number" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
            <Field label="Date"><input className="input" type="date" value={f.date} onChange={set('date')} /></Field>
            <Field label="Category">
              <select className="input" value={f.category} onChange={set('category')}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </Field>
            <Field label="Paid via">
              <select className="input" value={f.paymentMode} onChange={set('paymentMode')}>{modes.map(m => <option key={m} value={m}>{m}</option>)}</select>
            </Field>
            <Field label="Card">
              <select className="input" value={f.cardId} onChange={set('cardId')}>
                <option value="">None (bank account / cash)</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.cardLast4 && !c.name.includes('••') ? ` ••${c.cardLast4}` : ''}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notes"><input className="input" value={f.notes} onChange={set('notes')} placeholder="Optional" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={f.isExcluded} onChange={e => setF({ ...f, isExcluded: e.target.checked })} />
            Exclude from spend totals
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
            <button className="btn-ghost" style={{ height: 46 }} onClick={onClose}>Cancel</button>
          </div>
          <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={remove}>Delete transaction</button>
        </div>
      </div>
    </div>
  )
}
