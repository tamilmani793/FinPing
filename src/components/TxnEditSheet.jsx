import { useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { IndianRupee, Calendar, Store, Wallet, CreditCard } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { cardTitle } from '../lib/cardCatalog'
import { applyTxnToCard } from '../lib/ingestSMS'
import { askConfirm } from '../lib/confirm'
import { merchantKey, saveRule } from '../lib/merchantRules'
import { seedMcc } from '../lib/mcc'
import { SHOW_MCC } from '../lib/features'
import { tagCardRewards, tagAllCards } from '../lib/rewardTagging'
import { txnName } from '../lib/txnName'
import { isOnline, rewardPill } from '../lib/rewardRules'
import { useOptions } from '../lib/options'
import { BtnPrimary } from './UI'
import { Field, Segmented, TextField, Picker } from './Fields'

const MODES = ['UPI', 'Credit Card', 'Debit Card', 'Card', 'Bank', 'NetBanking', 'Cash', 'Wallet', 'Other']
const I = 17

// Fix anything SMS parsing got wrong: direction, mode, category, card, amount...
export default function TxnEditSheet({ txn, onClose }) {
  const { showNotification } = useStore()
  const isNew = txn.id == null // a spend typed in by hand, e.g. one the SMS never showed
  const cards = useLiveQuery(() => db.creditCards.toArray()) || []
  const mccRows = useLiveQuery(async () => { await seedMcc(); return db.mcc_master.orderBy('code').toArray() }) || []
  const categoryList = useOptions('categories')
  const [f, setF] = useState({
    merchant: txn.merchant || '', amount: String(txn.amount ?? ''), date: format(new Date(txn.date), 'yyyy-MM-dd'),
    type: txn.type || 'debit', category: txn.category || 'General', paymentMode: txn.paymentMode || 'Other',
    cardId: txn.cardId ?? '', mcc: txn.mcc != null ? String(txn.mcc) : '', notes: txn.notes || '', isExcluded: !!txn.isExcluded, channel: txn.channel || 'auto',
  })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  // a category that is no longer in the list (old data) stays selectable
  const categories = categoryList.some(c => c.name === f.category) ? categoryList : [{ name: f.category, icon: '💳' }, ...categoryList]
  const modes = MODES.includes(f.paymentMode) ? MODES : [f.paymentMode, ...MODES]

  const save = async () => {
    const amount = Number(f.amount)
    if (!(amount > 0)) { showNotification('Enter a valid amount', 'error'); return }
    const [y, m, d] = f.date.split('-').map(Number)
    const old = new Date(txn.date)
    if (isNew) {
      const card = f.cardId === '' ? null : await db.creditCards.get(Number(f.cardId))
      await db.transactions.add({
        date: new Date(y, m - 1, d, new Date().getHours(), new Date().getMinutes()), amount, type: f.type, merchant: f.merchant.trim() || 'Unknown',
        category: f.category, paymentMode: f.paymentMode, channel: f.channel === 'auto' ? null : f.channel, bank: card?.bank || '', accountLast4: card?.cardLast4 || null, cardId: card ? card.id : null,
        rawSMS: null, parsedBy: 'manual', tags: [], notes: f.notes, isExcluded: f.isExcluded, createdAt: new Date(),
      })
      if (card && !['account', 'unknown'].includes(card.cardType)) await applyTxnToCard(card, f.type, amount)
      showNotification('Transaction added', 'success')
      onClose()
      return
    }
    const next = { merchant: f.merchant.trim() || 'Unknown', amount, type: f.type, category: f.category, paymentMode: f.paymentMode, notes: f.notes, isExcluded: f.isExcluded }
    // only what you actually changed counts as "yours" (and so beats the bank statement)
    const changed = ['merchant', 'amount', 'type', 'category', 'paymentMode', 'notes', 'isExcluded'].filter(k => next[k] !== (txn[k] ?? (k === 'notes' ? '' : txn[k])))
    if (f.date !== format(new Date(txn.date), 'yyyy-MM-dd')) changed.push('date')
    if (String(f.cardId) !== String(txn.cardId ?? '')) changed.push('cardId')
    if (String(f.mcc || '') !== String(txn.mcc ?? '')) changed.push('mcc')
    if (f.channel !== (txn.channel || 'auto')) changed.push('channel')
    const editedFields = [...new Set([...(txn.editedFields || []), ...changed])]
    await db.transactions.update(txn.id, {
      merchant: f.merchant.trim() || 'Unknown', amount, type: f.type, category: f.category, paymentMode: f.paymentMode,
      date: new Date(y, m - 1, d, old.getHours(), old.getMinutes()),
      cardId: f.cardId === '' ? null : Number(f.cardId), mcc: f.mcc === '' ? null : Number(f.mcc), notes: f.notes, isExcluded: f.isExcluded, channel: f.channel === 'auto' ? null : f.channel,
      parsedBy: txn.parsedBy === 'auto' ? 'auto-edited' : txn.parsedBy,
      userEdited: true, editedFields, // your changes win over the bank statement and over any SMS
    })
    // the category changed: offer to fix the same merchant's other transactions (and remember it for new ones)
    if (changed.includes('category')) {
      const name = txnName({ ...txn, merchant: f.merchant })
      const key = merchantKey(name)
      const same = key ? (await db.transactions.toArray()).filter(t => t.id !== txn.id && merchantKey(txnName(t)) === key && t.category !== f.category && !t.kind && !t.isExcluded) : []
      if (key && same.length && await askConfirm({ title: `Use "${f.category}" for all ${name}?`, message: `${same.length} other transaction${same.length === 1 ? '' : 's'} from this merchant are in a different category. Change them too, and use this category for new ones.`, confirmLabel: 'Change all', cancelLabel: 'Only this one', danger: false })) {
        for (const t of same) await db.transactions.update(t.id, { category: f.category, userEdited: true, editedFields: [...new Set([...(t.editedFields || []), 'category'])] })
        saveRule(name, f.category)
        tagAllCards().catch(() => {}) // a new category can change what the card should earn
        showNotification(`${same.length + 1} transactions moved to ${f.category}`, 'success')
        onClose()
        return
      }
    }
    if (txn.cardId != null || f.cardId !== '') tagCardRewards(Number(f.cardId === '' ? txn.cardId : f.cardId)).catch(() => {})
    showNotification('Transaction updated', 'success')
    onClose()
  }

  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this transaction?', message: 'Card and account balances are not changed. A bank statement import will not bring it back.' }))) return
    await db.deletedTxns.add({ stmtKey: txn.stmtKey || null, day: format(new Date(txn.date), 'yyyy-MM-dd'), type: txn.type, amount: txn.amount, cardId: txn.cardId ?? null, deletedAt: new Date() })
    await db.transactions.delete(txn.id)
    showNotification('Transaction deleted', 'success')
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>{isNew ? 'Add transaction' : 'Edit transaction'}</div>
        {txn.rawSMS && <div className="sms-raw" style={{ marginBottom: 14 }}>{txn.rawSMS}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Segmented value={f.type} options={[{ value: 'debit', label: 'Money out' }, { value: 'credit', label: 'Money in' }]} onChange={v => setF({ ...f, type: v })} />
          <Field label="Merchant / description"><TextField icon={<Store size={I} />} value={f.merchant} onChange={set('merchant')} /></Field>
          <div className="form-grid">
            <Field label="Amount"><TextField icon={<IndianRupee size={I} />} type="number" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
            <Field label="Date"><TextField icon={<Calendar size={I} />} type="date" value={f.date} onChange={set('date')} /></Field>
            <Field label="Category">
              <Picker value={f.category} options={categories.map(c => ({ value: c.name, label: c.name, icon: c.icon }))} onChange={v => setF({ ...f, category: v })} title="Category" placeholder="Select" />
            </Field>
            <Field label="Paid via">
              <Picker value={f.paymentMode} options={modes} onChange={v => setF({ ...f, paymentMode: v })} icon={<Wallet size={I} />} title="Paid via" placeholder="Select" />
            </Field>
          </div>
          {txn.expectedReward && f.type === 'debit' && (
            <div className="card-sm" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <div className="label-caps" style={{ marginBottom: 4 }}>Reward on this spend</div>
              {rewardPill(txn.expectedReward)
                ? <div><b>{rewardPill(txn.expectedReward)}</b><div style={{ color: 'var(--txt2)' }}>{txn.expectedReward.rule?.label}{txn.expectedReward.reason ? ` · ${txn.expectedReward.reason}` : ''}</div></div>
                : <div><b>No reward</b><div style={{ color: 'var(--txt2)' }}>{txn.expectedReward.reason || txn.expectedReward.rule?.label}. If this is wrong, check the category and Online or in a shop below; saving works the reward out again.</div></div>}
            </div>
          )}
          {f.type === 'debit' && (
            <Field label="Online or in a shop?" hint={`Some cards pay more online. Automatic counts this as ${isOnline({ ...txn, merchant: f.merchant, paymentMode: f.paymentMode, channel: null }) ? 'online' : 'in a shop'}; set it yourself if the bank counted it the other way.`}>
              <Segmented value={f.channel} options={[{ value: 'auto', label: 'Automatic' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'In shop' }]} onChange={v => setF({ ...f, channel: v })} />
            </Field>
          )}
          {SHOW_MCC && (
          <Field label="MCC (optional)" hint="Lets card reward rules treat this spend the way the bank does">
            <Picker value={String(f.mcc || '')} options={mccRows.map(m => ({ value: String(m.code), label: `${m.code} · ${m.name}`, sub: m.category }))} onChange={v => setF({ ...f, mcc: v })} title="Merchant category code" placeholder="Not set" clearLabel="Not set" />
          </Field>
          )}
          <Field label="Card or account">
            <Picker value={String(f.cardId)} options={cards.map(c => ({ value: String(c.id), label: cardTitle(c) }))}
              onChange={v => setF({ ...f, cardId: v })} icon={<CreditCard size={I} />} title="Card or account" placeholder="None (cash / other)" clearLabel="None (bank account / cash)" />
          </Field>
          <Field label="Notes"><TextField value={f.notes} onChange={set('notes')} placeholder="Optional" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
            <input type="checkbox" checked={f.isExcluded} onChange={e => setF({ ...f, isExcluded: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />
            Exclude from spend totals
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>{isNew ? 'Add' : 'Save changes'}</BtnPrimary>
          </div>
          {!isNew && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Delete transaction</button>}
        </div>
      </div>
    </div>
  )
}
