import { useState } from 'react'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { useStore } from '../store'
import { saveCardEdit, groupOf } from '../lib/cards'
import { cycleDates, isStatementPaid, ordinal } from '../lib/cycle'
import { BtnPrimary } from './UI'
import { CARD_TYPES, BANKS, NETWORKS, CARD_NAMES, PARTNERS, variantsFor } from '../lib/cardCatalog'

const dateStr = d => (d ? format(new Date(d), 'yyyy-MM-dd') : '')
const fmt = d => (d ? format(d, 'd MMM yyyy') : '—')
const str = v => (v == null || v === 0 ? '' : String(v))

function Field({ label, children }) {
  return (
    <div>
      <div className="label-caps" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

export default function CardEditSheet({ card, cards, statement, onClose }) {
  const { showNotification } = useStore()
  const members = groupOf(card, cards)
  const others = cards.filter(c => c.id !== card.id)
  const [shared, setShared] = useState(new Set(members.filter(c => c.id !== card.id).map(c => c.id)))
  const [sameStatement, setSameStatement] = useState(false)
  const [form, setForm] = useState({
    name: card.name || '', bank: card.bank || '',
    cardType: card.cardType === 'debit' ? 'debit' : 'credit', network: card.network || '', variant: card.variant || '', partner: card.partner || '',
    creditLimit: str(card.creditLimit), availableCredit: str(card.availableCredit),
    cardLast4: card.cardLast4 || '',
    statementBalance: str(card.statementBalance), pendingDue: str(card.pendingDue ?? card.statementBalance),
    minimumDue: str(card.minimumDue), unbilled: str(card.unbilled), currentBalance: str(card.currentBalance),
    billingCycleDate: card.cycleSet ? str(card.billingCycleDate) : '', paymentDueDays: card.cycleSet ? str(card.paymentDueDays) : '',
    status: isStatementPaid(card) ? 'paid' : 'pending',
    annualFeeDate: dateStr(card.annualFeeDate), interestRate: str(card.interestRate), rewardPoints: str(card.rewardPoints), notes: card.notes || '',
    totalAnnualFee: str(card.totalAnnualFee), feeWaiverThreshold: str(card.feeWaiverThreshold),
  })
  const isCredit = form.cardType === 'credit'
  const [outTouched, setOutTouched] = useState(card.currentBalance > 0 && (card.currentBalance !== (card.pendingDue ?? card.statementBalance ?? 0) + (card.unbilled || 0)))
  const set = k => e => {
    const next = { ...form, [k]: e.target.value }
    if (!outTouched && (k === 'pendingDue' || k === 'unbilled')) {
      const sum = (Number(next.pendingDue) || 0) + (Number(next.unbilled) || 0)
      next.currentBalance = sum ? String(sum) : ''
    }
    if (k === 'currentBalance') setOutTouched(true)
    setForm(next)
  }
  const preview = cycleDates({ cycleSet: Number(form.billingCycleDate) >= 1, billingCycleDate: form.billingCycleDate, paymentDueDays: form.paymentDueDays })
  const num = k => ({ className: 'input', type: 'number', inputMode: 'decimal', value: form[k], onChange: set(k) })

  const toggle = id => {
    const next = new Set(shared)
    next.has(id) ? next.delete(id) : next.add(id)
    setShared(next)
  }

  const save = async () => {
    try {
      await saveCardEdit(card.id, form, { sharedWith: [...shared], sameStatement: sameStatement && shared.size > 0 })
      showNotification('Card updated', 'success')
      onClose()
    } catch (e) { showNotification(e.message, 'error') }
  }

  const remove = async () => {
    if (!window.confirm(`Remove ${card.name}? Its transactions stay in History.`)) return
    await db.creditCards.delete(card.id)
    showNotification('Card removed', 'success')
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Edit card</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {card.cardType === 'unknown' && (
            <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: 'var(--amber-dim)' }}>
              The SMS didn't say whether this is a credit or a debit card. Choose below.
            </div>
          )}
          <Field label="Card type">
            <div style={{ display: 'flex', gap: 8 }}>
              {CARD_TYPES.map(t => (
                <div key={t.id} className={`chip${form.cardType === t.id ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setForm({ ...form, cardType: t.id })}>{t.label}</div>
              ))}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Bank / issuer"><input className="input" list="dl-banks" value={form.bank} onChange={set('bank')} placeholder="HDFC Bank" /></Field>
            <Field label="Card name"><input className="input" list="dl-names" value={form.name} onChange={set('name')} placeholder="Infinia" /></Field>
            <Field label="Network">
              <select className="input" value={form.network} onChange={e => setForm({ ...form, network: e.target.value })}>
                <option value="">Select…</option>
                {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Variant"><input className="input" list="dl-variants" value={form.variant} onChange={set('variant')} placeholder="Signature" /></Field>
            <Field label="Last 4 digits"><input className="input" inputMode="numeric" maxLength={4} value={form.cardLast4} onChange={set('cardLast4')} placeholder="1234" /></Field>
          </div>
          {isCredit && (
            <Field label="Third-party / co-brand partner (optional)">
              <input className="input" list="dl-partners" value={form.partner} onChange={set('partner')} placeholder="Amazon Pay, Swiggy, PhonePe…" />
            </Field>
          )}
          <datalist id="dl-banks">{BANKS.map(b => <option key={b} value={b} />)}</datalist>
          <datalist id="dl-names">{(CARD_NAMES[form.bank] || []).map(n => <option key={n} value={n} />)}</datalist>
          <datalist id="dl-variants">{variantsFor(form.network, form.cardType).map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-partners">{PARTNERS.map(p => <option key={p} value={p} />)}</datalist>

          {isCredit && (
            <>
          <div className="label-caps" style={{ marginTop: 6, color: 'var(--gold-dim)' }}>Credit limit</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Total limit (₹)"><input {...num('creditLimit')} /></Field>
            <Field label="Available credit (₹)"><input {...num('availableCredit')} /></Field>
          </div>

          {others.length > 0 && (
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Shares its limit with</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6 }}>Cards ticked here use one common limit; changing it updates all of them.</div>
              {others.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13 }}>
                  <input type="checkbox" checked={shared.has(c.id)} onChange={() => toggle(c.id)} />
                  {c.name}{c.cardLast4 ? ` ••${c.cardLast4}` : ''}
                </label>
              ))}
            </div>
          )}

          <div className="label-caps" style={{ marginTop: 6, color: 'var(--gold-dim)' }}>Billing cycle</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Statement day of month (1–31)"><input className="input" type="number" inputMode="numeric" min="1" max="31" value={form.billingCycleDate} onChange={set('billingCycleDate')} placeholder="e.g. 5" /></Field>
            <Field label="Payment due, days after statement"><input className="input" type="number" inputMode="numeric" min="0" max="60" value={form.paymentDueDays} onChange={set('paymentDueDays')} placeholder="e.g. 20" /></Field>
          </div>
          {preview.statementDate && (
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: -2 }}>
              Latest statement <b>{fmt(preview.statementDate)}</b> · due <b>{fmt(preview.dueDate)}</b><br />
              Next statement <b>{fmt(preview.nextStatementDate)}</b> · due <b>{fmt(preview.nextDueDate)}</b>
              {Number(form.billingCycleDate) >= 1 ? ` (every month on the ${ordinal(Number(form.billingCycleDate))})` : ''}
            </div>
          )}

          <div className="label-caps" style={{ marginTop: 6, color: 'var(--gold-dim)' }}>Amounts</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Current outstanding (₹)"><input {...num('currentBalance')} /></Field>
            <Field label="Statement amount (₹)"><input {...num('statementBalance')} /></Field>
            <Field label="Pending due (₹)"><input {...num('pendingDue')} /></Field>
            <Field label="Minimum due (₹)"><input {...num('minimumDue')} /></Field>
            <Field label="Unbilled spends (₹)"><input {...num('unbilled')} /></Field>
            <Field label="Reward points"><input {...num('rewardPoints')} /></Field>
          </div>
          <Field label="Statement status">
            <div style={{ display: 'flex', gap: 8 }}>
              {[['pending', 'Pending'], ['paid', 'Paid']].map(([v, l]) => (
                <div key={v} className={`chip${form.status === v ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setForm({ ...form, status: v })}>{l}</div>
              ))}
            </div>
          </Field>
          {shared.size > 0 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--txt2)' }}>
              <input type="checkbox" checked={sameStatement} onChange={e => setSameStatement(e.target.checked)} style={{ marginTop: 2 }} />
              Use these billing-cycle, status and amount details for all cards sharing this limit
            </label>
          )}

          <div className="label-caps" style={{ marginTop: 6, color: 'var(--gold-dim)' }}>Fees</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Annual fee (₹)"><input {...num('totalAnnualFee')} /></Field>
            <Field label="Fee waiver spend (₹)"><input {...num('feeWaiverThreshold')} /></Field>
            <Field label="Annual fee date"><input className="input" type="date" value={form.annualFeeDate} onChange={set('annualFeeDate')} /></Field>
            <Field label="Interest rate (% / month)"><input {...num('interestRate')} /></Field>
          </div>

            </>
          )}

          <Field label="Notes"><textarea className="input" style={{ height: 60, fontSize: 13 }} value={form.notes} onChange={set('notes')} placeholder="Anything to remember about this card" /></Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
            <button className="btn-ghost" style={{ height: 46 }} onClick={onClose}>Cancel</button>
          </div>
          <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={remove}>Remove card</button>
        </div>
      </div>
    </div>
  )
}
