import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { useStore } from '../store'
import { saveCardEdit, groupOf } from '../lib/cards'
import { cycleDates, isStatementPaid, ordinal } from '../lib/cycle'
import { BtnPrimary } from './UI'
import { CARD_TYPES, BANKS, NETWORKS, PARTNERS, EXCLUSION_CATEGORIES, excludedFor, variantsFor } from '../lib/cardCatalog'
import { INDIAN_CARDS, catalogEntries, findCatalogKey } from '../lib/indianCards'

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

export default function CardEditSheet({ card, cards, isNew = false, onClose }) {
  const { showNotification } = useStore()
  const savedRef = useRef(false)
  // A new entry starts as a hidden draft; closing without saving throws the draft away.
  const close = id => {
    if (isNew && !savedRef.current) db.creditCards.delete(card.id)
    onClose(id)
  }
  const members = groupOf(card, cards)
  const others = cards.filter(c => c.id !== card.id)
  const [shared, setShared] = useState(new Set(members.filter(c => c.id !== card.id).map(c => c.id)))
  const [sameStatement, setSameStatement] = useState(false)
  const [form, setForm] = useState({
    name: card.name || '', bank: card.bank || '',
    cardType: ['debit', 'account'].includes(card.cardType) ? card.cardType : 'credit', catalogKey: findCatalogKey(card) || (card.name && !card.name.includes('••') ? '__manual' : ''), accountBalance: card.accountBalance == null ? '' : String(card.accountBalance), network: card.network || '', variant: card.variant || '', partner: card.partner || '',
    creditLimit: str(card.creditLimit), availableCredit: str(card.availableCredit),
    cardLast4: card.cardLast4 || '',
    statementBalance: str(card.statementBalance), pendingDue: str(card.pendingDue ?? card.statementBalance),
    minimumDue: str(card.minimumDue), unbilled: str(card.unbilled), currentBalance: str(card.currentBalance),
    billingCycleDate: card.cycleSet ? str(card.billingCycleDate) : '', paymentDueDays: card.cycleSet ? str(card.paymentDueDays) : '',
    status: isStatementPaid(card) ? 'paid' : 'pending',
    excludedCategories: excludedFor(card),
    annualFeeDate: dateStr(card.annualFeeDate), interestRate: str(card.interestRate), rewardPoints: str(card.rewardPoints), notes: card.notes || '',
    annualFee: str(card.annualFee > 0 ? card.annualFee : card.totalAnnualFee), feeWaiverThreshold: str(card.feeWaiverThreshold),
  })
  const isCredit = form.cardType === 'credit'
  const entries = catalogEntries()
  const pickCard = e => {
    const key = e.target.value
    const hit = entries.find(x => x.key === key)
    if (hit) setForm({ ...form, catalogKey: key, name: hit.label, bank: hit.bank, partner: hit.partner || '' })
    else setForm({ ...form, catalogKey: key })
  }
  const set = k => e => setForm({ ...form, [k]: e.target.value })
  const preview = cycleDates({ cycleSet: Number(form.billingCycleDate) >= 1, billingCycleDate: form.billingCycleDate, paymentDueDays: form.paymentDueDays })
  const num = k => ({ className: 'input', type: 'number', inputMode: 'decimal', value: form[k], onChange: set(k) })

  const toggle = id => {
    const next = new Set(shared)
    next.has(id) ? next.delete(id) : next.add(id)
    setShared(next)
  }

  const save = async () => {
    try {
      let data = form
      if (!form.name.trim()) {
        if (form.cardType === 'credit') throw new Error('Choose your card from the list, or type its name')
        data = { ...form, name: `${form.bank || 'Bank'} ${form.cardType === 'account' ? 'account' : 'debit card'}` }
      }
      await saveCardEdit(card.id, data, { sharedWith: [...shared], sameStatement: sameStatement && shared.size > 0 })
      savedRef.current = true
      showNotification(isNew ? 'Added' : 'Card updated', 'success')
      close(card.id)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const remove = async () => {
    if (!window.confirm(`Remove ${card.name}? Its transactions stay in History.`)) return
    await db.creditCards.delete(card.id)
    showNotification('Card removed', 'success')
    onClose()
  }

  return (
    <div className="overlay" onClick={() => close()}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>{isNew ? `Add ${card.cardType === 'account' ? 'bank account' : card.cardType === 'debit' ? 'debit card' : 'credit card'}` : 'Edit'}</div>
        {isNew && <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '-6px 0 12px' }}>Enter the last 4 digits so bank SMS for it are matched to this entry automatically.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {card.cardType === 'unknown' && (
            <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: 'var(--amber-dim)' }}>
              The SMS didn't say whether this is a credit card, a debit card or a bank account. Choose below.
            </div>
          )}
          <Field label="Type">
            <div style={{ display: 'flex', gap: 8 }}>
              {CARD_TYPES.map(t => (
                <div key={t.id} className={`chip${form.cardType === t.id ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center', padding: '6px 4px' }} onClick={() => setForm({ ...form, cardType: t.id })}>{t.label}</div>
              ))}
            </div>
          </Field>

          {isCredit ? (
            <>
              <Field label="Card name">
                <select className="input" value={form.catalogKey} onChange={pickCard}>
                  <option value="">Select your credit card…</option>
                  {INDIAN_CARDS.map(b => (
                    <optgroup key={b.bank} label={b.bank}>
                      {entries.filter(e => e.bank === b.bank).map(e => <option key={e.key} value={e.key}>{e.label}{e.partner ? ` (${e.partner})` : ''}</option>)}
                    </optgroup>
                  ))}
                  <option value="__manual">Not in the list — type it myself</option>
                </select>
              </Field>
              {form.catalogKey === '__manual' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Bank / issuer"><input className="input" list="dl-banks" value={form.bank} onChange={set('bank')} placeholder="HDFC Bank" /></Field>
                  <Field label="Card name"><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. HDFC Millennia" /></Field>
                </div>
              )}
              {form.catalogKey && form.catalogKey !== '__manual' && (
                <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: -4 }}>{form.name} · {form.bank}{form.partner ? ` · ${form.partner} co-brand` : ''}</div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Bank"><input className="input" list="dl-banks" value={form.bank} onChange={set('bank')} placeholder="HDFC Bank" /></Field>
              <Field label={form.cardType === 'account' ? 'Account name' : 'Card name'}><input className="input" value={form.name} onChange={set('name')} placeholder={form.cardType === 'account' ? 'e.g. HDFC Savings' : 'e.g. HDFC Debit Card'} /></Field>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {form.cardType !== 'account' && (
              <Field label="Card network">
                <select className="input" value={form.network} onChange={e => setForm({ ...form, network: e.target.value })}>
                  <option value="">Select…</option>
                  {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            )}
            <Field label={form.cardType === 'account' ? 'Account type' : 'Variant (optional)'}>
              <input className="input" list="dl-variants" value={form.variant} onChange={set('variant')} placeholder={form.cardType === 'account' ? 'Savings / Current / Salary' : 'Signature, Platinum…'} />
            </Field>
            <Field label={form.cardType === 'account' ? 'Account last 4 digits' : 'Card last 4 digits'}><input className="input" inputMode="numeric" maxLength={4} value={form.cardLast4} onChange={set('cardLast4')} placeholder="1234" /></Field>
            {form.cardType === 'account' && <Field label="Balance (₹)"><input {...num('accountBalance')} /></Field>}
          </div>
          {isCredit && (
            <Field label="Third-party / co-brand partner (optional)">
              <input className="input" list="dl-partners" value={form.partner} onChange={set('partner')} placeholder="Amazon Pay, Swiggy, PhonePe…" />
            </Field>
          )}
          <datalist id="dl-banks">{[...new Set([...BANKS, ...INDIAN_CARDS.map(b => b.bank)])].map(b => <option key={b} value={b} />)}</datalist>
          <datalist id="dl-variants">{(form.cardType === 'account' ? ['Savings', 'Current', 'Salary', 'Joint'] : variantsFor(form.network, form.cardType)).map(v => <option key={v} value={v} />)}</datalist>
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
            <Field label="Minimum due (₹)"><input {...num('minimumDue')} /></Field>
            <Field label="Unbilled spends (₹) — used only if statement day is not set"><input {...num('unbilled')} /></Field>
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

          <div className="label-caps" style={{ marginTop: 6, color: 'var(--gold-dim)' }}>Reward exclusions</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: -4 }}>
            Spends in ticked categories don't earn cashback / points on this card. Start from the common list and match it to your card's terms.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXCLUSION_CATEGORIES.map(c => {
              const on = form.excludedCategories.includes(c)
              return (
                <div key={c} className={`chip${on ? ' active' : ''}`} onClick={() => setForm({ ...form, excludedCategories: on ? form.excludedCategories.filter(x => x !== c) : [...form.excludedCategories, c] })}>
                  {on ? '⛔ ' : ''}{c}
                </div>
              )
            })}
          </div>

          <div className="label-caps" style={{ marginTop: 6, color: 'var(--gold-dim)' }}>Fees</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Annual fee before GST (₹)"><input {...num('annualFee')} /></Field>
            <Field label="Fee waiver spend (₹)"><input {...num('feeWaiverThreshold')} /></Field>
            <Field label="Annual fee date"><input className="input" type="date" value={form.annualFeeDate} onChange={set('annualFeeDate')} /></Field>
            <Field label="Interest rate (% / month)"><input {...num('interestRate')} /></Field>
          </div>
          {Number(form.annualFee) > 0 && (
            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
              ₹{Number(form.annualFee).toLocaleString('en-IN')} + 18% GST ₹{(Number(form.annualFee) * 0.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })} = <b style={{ color: 'var(--txt)' }}>₹{(Number(form.annualFee) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })} a year</b>
            </div>
          )}

            </>
          )}

          <Field label="Notes"><textarea className="input" style={{ height: 60, fontSize: 13 }} value={form.notes} onChange={set('notes')} placeholder="Anything to remember about this card" /></Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
            <button className="btn-ghost" style={{ height: 46 }} onClick={() => close()}>Cancel</button>
          </div>
          {!isNew && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={remove}>Remove</button>}
        </div>
      </div>
    </div>
  )
}
