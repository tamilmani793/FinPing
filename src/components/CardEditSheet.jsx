import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { CreditCard, Landmark, Globe, Hash, IndianRupee, Calendar, Percent, Award, Link2, Gift, User, Sparkles } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { saveCardEdit, groupOf, nextAnniversary } from '../lib/cards'
import { cycleDates, isStatementPaid, ordinal } from '../lib/cycle'
import { BtnPrimary } from './UI'
import { Field, FormHeading, Segmented, TextField, Picker } from './Fields'
import { relinkTransactions } from '../lib/relink'
import { askConfirm } from '../lib/confirm'
import { CARD_TYPES, excludedFor, variantsFor, cardTitle } from '../lib/cardCatalog'
import { useOptions, useOptionNames, isCustomised } from '../lib/options'

const dateStr = d => (d ? format(new Date(d), 'yyyy-MM-dd') : '')
const fmt = d => (d ? format(d, 'd MMM yyyy') : '—')
const str = v => (v == null || v === 0 ? '' : String(v))
const I = 17 // icon size inside fields

export default function CardEditSheet({ card, cards, isNew = false, onClose }) {
  const { showNotification } = useStore()
  const banks = useOptionNames('banks')
  const networks = useOptionNames('networks')
  const partners = useOptionNames('partners')
  const exclusionList = useOptionNames('exclusions')
  const variantList = useOptionNames('variants')
  const creditNames = useOptions('cardNames')
  const debitNames = useOptions('debitCardNames')
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
  const keyOf = c => `${c.bank}::${c.name}`
  const isDebitCard = card.cardType === 'debit'
  const known = (isDebitCard ? debitNames : creditNames).find(c => c.bank === card.bank && c.name === card.name)
  const [form, setForm] = useState({
    name: card.name || '', bank: card.bank || '',
    linkedAccountId: card.linkedAccountId != null ? String(card.linkedAccountId) : '',
    cardType: ['debit', 'account'].includes(card.cardType) ? card.cardType : 'credit', catalogKey: known ? keyOf(known) : (card.name && !card.name.includes('••') ? '__manual' : ''), accountBalance: card.accountBalance == null ? '' : String(card.accountBalance), network: card.network || '', variant: card.variant || '', partner: card.partner || '',
    creditLimit: str(card.creditLimit), availableCredit: str(card.availableCredit),
    cardLast4: card.cardLast4 || '',
    statementBalance: str(card.statementBalance), pendingDue: str(card.pendingDue ?? card.statementBalance),
    minimumDue: str(card.minimumDue), unbilled: str(card.unbilled), currentBalance: str(card.currentBalance),
    billingCycleDate: card.cycleSet ? str(card.billingCycleDate) : '', paymentDueDays: card.cycleSet ? str(card.paymentDueDays) : '',
    status: isStatementPaid(card) ? 'paid' : 'pending',
    excludedCategories: excludedFor(card),
    issueDate: dateStr(card.issueDate || card.annualFeeDate), interestRate: str(card.interestRate), rewardPoints: str(card.rewardPoints), notes: card.notes || '',
    feeType: card.annualFee > 0 || card.totalAnnualFee > 0 || card.isLTF === false ? 'annual' : 'ltf',
    annualFee: str(card.annualFee > 0 ? card.annualFee : card.totalAnnualFee), feeWaiverThreshold: str(card.feeWaiverThreshold),
  })
  const isCredit = form.cardType === 'credit'
  const isDebit = form.cardType === 'debit'
  const cardNames = isDebit ? debitNames : creditNames // what the Card name dropdown offers for this type
  const accounts = cards.filter(c => c.cardType === 'account' && c.id !== card.id)
  const upd = patch => setForm(f => ({ ...f, ...patch }))
  const pickCard = key => {
    const hit = cardNames.find(x => keyOf(x) === key)
    if (hit) upd({ catalogKey: key, name: hit.name, bank: hit.bank, partner: hit.partner || '' })
    else upd({ catalogKey: key })
  }
  const set = k => e => upd({ [k]: e.target.value })
  const preview = cycleDates({ cycleSet: Number(form.billingCycleDate) >= 1, billingCycleDate: form.billingCycleDate, paymentDueDays: form.paymentDueDays })
  const money = k => ({ type: 'number', inputMode: 'decimal', value: form[k], onChange: set(k), placeholder: '0' })
  const rupee = <IndianRupee size={I} />

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
      // A card / account you just added or re-numbered may match spends that were tagged but unlinked.
      await relinkTransactions({ create: false }).catch(() => {})
      showNotification(isNew ? 'Added' : 'Card updated', 'success')
      close(card.id)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const remove = async () => {
    if (!(await askConfirm({ title: `Remove ${cardTitle(card, { last4: false })}?`, message: 'Its transactions stay in History.', confirmLabel: 'Remove' }))) return
    await db.creditCards.delete(card.id)
    // Debit cards that drew on a removed account are no longer linked to anything.
    await db.creditCards.filter(c => c.linkedAccountId === card.id).modify({ linkedAccountId: null })
    showNotification('Removed', 'success')
    onClose()
  }

  const kind = card.cardType === 'account' ? 'bank account' : card.cardType === 'debit' ? 'debit card' : 'credit card'
  const variantOptions = form.cardType === 'account' ? ['Savings', 'Current', 'Salary', 'Joint'] : (isCustomised('variants') ? variantList : variantsFor(form.network, form.cardType))
  const cardOptions = [
    ...cardNames.map(c => ({ value: keyOf(c), label: c.name, sub: c.partner || undefined, group: c.bank })),
    { value: '__manual', label: 'Not in the list — type it myself', group: 'Other' },
  ]
  const accountOptions = accounts.map(a => ({ value: String(a.id), label: cardTitle(a), sub: a.accountBalance != null ? `₹${Number(a.accountBalance).toLocaleString('en-IN')}` : undefined }))

  return (
    <div className="overlay" onClick={() => close()}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{isNew ? `Add ${kind}` : `Edit ${kind}`}</div>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '2px 0 16px' }}>
          {isNew ? 'Enter the last 4 digits so bank SMS for it are matched to this entry automatically.' : 'Everything stays on this phone.'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {card.cardType === 'unknown' && (
            <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 16, padding: '10px 14px', fontSize: 12.5, color: 'var(--amber-dim)' }}>
              The SMS didn't say whether this is a credit card, a debit card or a bank account. Choose below.
            </div>
          )}
          <Segmented value={form.cardType} options={CARD_TYPES.map(t => ({ value: t.id, label: t.label }))} onChange={v => upd(v === form.cardType ? {} : { cardType: v, catalogKey: '' })} />

          {isCredit || isDebit ? (
            <>
              <Field label="Card name">
                <Picker value={form.catalogKey} options={cardOptions} onChange={pickCard} icon={<CreditCard size={I} />} title={isDebit ? 'Choose your debit card' : 'Choose your card'} placeholder={isDebit ? 'Select your debit card' : 'Select your credit card'} />
              </Field>
              {form.catalogKey === '__manual' && (
                <div className="form-grid">
                  <Field label="Bank / issuer"><Picker value={form.bank} options={banks} onChange={v => upd({ bank: v })} allowCustom icon={<Landmark size={I} />} title="Bank" placeholder="HDFC Bank" /></Field>
                  <Field label="Card name"><TextField value={form.name} onChange={set('name')} placeholder={isDebit ? 'e.g. HDFC Millennia Debit' : 'e.g. HDFC Millennia'} icon={<CreditCard size={I} />} /></Field>
                </div>
              )}
              {form.catalogKey && form.catalogKey !== '__manual' && (
                <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-6px 6px 0' }}>{form.name} · {form.bank}{form.partner ? ` · ${form.partner} co-brand` : ''}</div>
              )}
            </>
          ) : (
            <div className="form-grid">
              <Field label="Bank"><Picker value={form.bank} options={banks} onChange={v => upd({ bank: v })} allowCustom icon={<Landmark size={I} />} title="Bank" placeholder="HDFC Bank" /></Field>
              <Field label="Account name"><TextField value={form.name} onChange={set('name')} icon={<CreditCard size={I} />} placeholder="e.g. Savings account (the bank is added in front)" /></Field>
            </div>
          )}

          <div className="form-grid">
            {form.cardType !== 'account' && (
              <Field label="Card network"><Picker value={form.network} options={networks} onChange={v => upd({ network: v })} icon={<Globe size={I} />} title="Card network" placeholder="Select" clearLabel="Not set" /></Field>
            )}
            <Field label={form.cardType === 'account' ? 'Account type' : 'Variant'}>
              <Picker value={form.variant} options={variantOptions} onChange={v => upd({ variant: v })} allowCustom icon={<Award size={I} />} title={form.cardType === 'account' ? 'Account type' : 'Card variant'} placeholder={form.cardType === 'account' ? 'Savings' : 'Optional'} clearLabel="Not set" />
            </Field>
            <Field label={form.cardType === 'account' ? 'Account last 4 digits' : 'Card last 4 digits'}><TextField icon={<Hash size={I} />} inputMode="numeric" maxLength={4} value={form.cardLast4} onChange={set('cardLast4')} placeholder="1234" /></Field>
            {form.cardType === 'account' && <Field label="Balance"><TextField icon={rupee} {...money('accountBalance')} /></Field>}
          </div>
          {isCredit && (
            <Field label="Co-brand partner" hint="Only if the card is issued with Amazon Pay, Swiggy, PhonePe and so on.">
              <Picker value={form.partner} options={partners} onChange={v => upd({ partner: v })} allowCustom icon={<Link2 size={I} />} title="Co-brand partner" placeholder="None" clearLabel="None" />
            </Field>
          )}
          {form.cardType === 'debit' && (
            <Field label="Linked bank account" hint={accounts.length
              ? 'This card spends from that account: each new debit-card spend is taken off its balance (past spends are not changed).'
              : 'No bank account yet. Add one with ＋ Bank account on the Accounts screen, then link it here.'}>
              <Picker value={form.linkedAccountId} options={accountOptions} onChange={v => upd({ linkedAccountId: v })} icon={<Landmark size={I} />} title="Linked bank account" placeholder="Not linked" clearLabel="Not linked" />
            </Field>
          )}

          {isCredit && (
            <>
              <FormHeading sub="Your card limit and how much of it is still free.">Credit limit</FormHeading>
              <div className="form-grid">
                <Field label="Total limit"><TextField icon={rupee} {...money('creditLimit')} /></Field>
                <Field label="Available credit"><TextField icon={rupee} {...money('availableCredit')} /></Field>
              </div>

              {others.length > 0 && (
                <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 18, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Shares its limit with</div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 6 }}>Cards ticked here use one common limit; changing it updates all of them.</div>
                  {others.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13.5 }}>
                      <input type="checkbox" checked={shared.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />
                      {cardTitle(c)}
                    </label>
                  ))}
                </div>
              )}

              <FormHeading sub="Used to work out when the bill is due.">Billing cycle</FormHeading>
              <div className="form-grid">
                <Field label="Statement day (1–31)"><TextField icon={<Calendar size={I} />} type="number" inputMode="numeric" min="1" max="31" value={form.billingCycleDate} onChange={set('billingCycleDate')} placeholder="e.g. 5" /></Field>
                <Field label="Due, days after statement"><TextField icon={<Calendar size={I} />} type="number" inputMode="numeric" min="0" max="60" value={form.paymentDueDays} onChange={set('paymentDueDays')} placeholder="e.g. 20" /></Field>
              </div>
              {preview.statementDate && (
                <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-4px 6px 0', lineHeight: 1.6 }}>
                  Latest statement <b>{fmt(preview.statementDate)}</b> · due <b>{fmt(preview.dueDate)}</b><br />
                  Next statement <b>{fmt(preview.nextStatementDate)}</b> · due <b>{fmt(preview.nextDueDate)}</b>
                  {Number(form.billingCycleDate) >= 1 ? ` (every month on the ${ordinal(Number(form.billingCycleDate))})` : ''}
                </div>
              )}

              <FormHeading>Amounts</FormHeading>
              <div className="form-grid">
                <Field label="Current outstanding"><TextField icon={rupee} {...money('currentBalance')} /></Field>
                <Field label="Statement amount"><TextField icon={rupee} {...money('statementBalance')} /></Field>
                <Field label="Minimum due"><TextField icon={rupee} {...money('minimumDue')} /></Field>
                <Field label="Reward points"><TextField icon={<Gift size={I} />} {...money('rewardPoints')} /></Field>
                <Field label="Unbilled spends" hint="Used only if the statement day is not set." span><TextField icon={rupee} {...money('unbilled')} /></Field>
              </div>
              <Field label="Statement status">
                <Segmented value={form.status} options={[{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]} onChange={v => upd({ status: v })} />
              </Field>
              {shared.size > 0 && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--txt2)' }}>
                  <input type="checkbox" checked={sameStatement} onChange={e => setSameStatement(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--gold)' }} />
                  Use these billing-cycle, status and amount details for all cards sharing this limit
                </label>
              )}

              <FormHeading sub="Spends in ticked categories don't earn cashback or points on this card. Match it to your card's terms.">Reward exclusions</FormHeading>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {exclusionList.map(c => {
                  const on = form.excludedCategories.includes(c)
                  return (
                    <div key={c} className={`chip${on ? ' active' : ''}`} onClick={() => upd({ excludedCategories: on ? form.excludedCategories.filter(x => x !== c) : [...form.excludedCategories, c] })}>
                      {on ? '⛔ ' : ''}{c}
                    </div>
                  )
                })}
              </div>

              <FormHeading>Fees</FormHeading>
              <Segmented value={form.feeType} options={[{ value: 'ltf', label: 'Lifetime free' }, { value: 'annual', label: 'Annual charges' }]} onChange={v => upd({ feeType: v })} />
              {form.feeType === 'ltf' && <div style={{ fontSize: 12.5, color: 'var(--mint-dim)', fontWeight: 600, margin: '-4px 6px 0', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> No joining or annual fee on this card.</div>}
              <div className="form-grid">
                {form.feeType === 'annual' && <>
                  <Field label="Annual fee before GST"><TextField icon={rupee} {...money('annualFee')} /></Field>
                  <Field label="Fee waiver spend"><TextField icon={rupee} {...money('feeWaiverThreshold')} /></Field>
                  <Field label="Card issued on" span><TextField icon={<Calendar size={I} />} type="date" value={form.issueDate} onChange={set('issueDate')} /></Field>
                </>}
                <Field label="Interest rate (% a month)" span={form.feeType === 'ltf'}><TextField icon={<Percent size={I} />} {...money('interestRate')} /></Field>
              </div>
              {form.feeType === 'annual' && form.issueDate && <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-4px 6px 0' }}>The annual fee is charged on this date every year. Next: <b style={{ color: 'var(--txt)' }}>{fmt(nextAnniversary(form.issueDate))}</b></div>}
              {form.feeType === 'annual' && Number(form.annualFee) > 0 && (
                <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-4px 6px 0' }}>
                  ₹{Number(form.annualFee).toLocaleString('en-IN')} + 18% GST ₹{(Number(form.annualFee) * 0.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })} = <b style={{ color: 'var(--txt)' }}>₹{(Number(form.annualFee) * 1.18).toLocaleString('en-IN', { maximumFractionDigits: 2 })} a year</b>
                </div>
              )}
            </>
          )}

          <Field label="Notes"><textarea className="input" style={{ height: 70, fontSize: 14 }} value={form.notes} onChange={set('notes')} placeholder="Anything to remember about this card" /></Field>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => close()}>Cancel</button>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>{isNew ? 'Add' : 'Save changes'}</BtnPrimary>
          </div>
          {!isNew && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Remove</button>}
        </div>
      </div>
    </div>
  )
}
