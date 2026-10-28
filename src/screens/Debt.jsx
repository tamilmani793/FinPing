import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, format } from 'date-fns'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, Divider, LabelCaps, MonoLg, BtnPrimary, formatINR } from '../components/UI'
import { useStore } from '../store'
import PoliciesView from '../components/PoliciesView'
import { addManualRepayment, recordReceipt, undoRepayment } from '../lib/debtBackup'
import { dailyInterest, splitPayment, lastRepaymentDate } from '../lib/loanMath'
import { projectSchedule, defaultMode, nextEmiAmount, FIXED_TYPES } from '../lib/loanSchedule'
import { parseEmiSchedule } from '../lib/scheduleImport'
import { postDueEmis } from '../lib/emiEngine'

const EMPTY_DEBT = {
  name: '', type: 'PersonalLoan', lender: '', loanAccountNo: '', debitAccountId: '',
  principal: '', currentOutstanding: '', interestRate: '', emiAmount: '', tenureMonths: '',
  nextEmiDate: '', paidCount: '', startDate: '', mode: 'reducing', notes: '',
}
const today = () => format(new Date(), 'yyyy-MM-dd')
const EMPTY_REPAY = { amount: '', principal: '', interest: '', date: today(), notes: '', accountId: '' }
const EMPTY_RECEIPT = { amount: '', date: today(), notes: '', accountId: '' }

// id (kept stable for saved debts) · label shown in the dropdown · icon
const DEBT_TYPES = [
  ['HomeLoan', 'Home loan', '🏠'],
  ['MortgageLoan', 'Mortgage / loan against property', '🏘'],
  ['GoldLoan', 'Gold loan', '🪙'],
  ['CarLoan', 'Car loan', '🚗'],
  ['TwoWheelerLoan', 'Two-wheeler loan', '🏍'],
  ['PersonalLoan', 'Personal loan', '💼'],
  ['EducationLoan', 'Education loan', '🎓'],
  ['BusinessLoan', 'Business loan', '🏢'],
  ['LoanAgainstSecurities', 'Loan against shares / mutual funds', '📈'],
  ['CreditCardEMI', 'Credit card EMI', '💳'],
  ['DebitCardEMI', 'Debit card EMI', '💳'],
  ['ConsumerEMI', 'No-cost / consumer durable EMI', '📱'],
  ['Overdraft', 'Overdraft', '🏦'],
  ['CreditLine', 'Credit line / Buy-now-pay-later', '🧾'],
  ['FriendBorrowed', 'Borrowed from friend / family', '🤝'],
  ['FriendLent', 'Lent to friend / family', '🤲'],
  ['Other', 'Other', '📄'],
]
const DEBT_ICONS = Object.fromEntries(DEBT_TYPES.map(([id, , icon]) => [id, icon]))
const DEBT_LABELS = Object.fromEntries(DEBT_TYPES.map(([id, label]) => [id, label]))

const toDate = s => (s ? new Date(`${s}T12:00:00`) : null)
const fmtD = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const fmtS = d => (d ? format(new Date(d), 'd MMM') : '—')

function Field({ label, children, span }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <LabelCaps style={{ marginBottom: 4 }}>{label}</LabelCaps>
      {children}
    </div>
  )
}

// One line per instalment: date · EMI · interest · principal · balance left
function ScheduleTable({ rows, footer }) {
  const cols = '1.05fr 1fr 0.9fr 1fr 1.2fr'
  const cell = { fontSize: 11, padding: '5px 0', fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, borderBottom: '1px solid var(--border2)' }}>
        {['Date', 'EMI', 'Interest', 'Principal', 'Balance'].map((h, i) => <div key={h} className="label-caps" style={{ ...cell, textAlign: i ? 'right' : 'left', fontSize: 9 }}>{h}</div>)}
      </div>
      {rows.map(r => (
        <div key={r.key} onClick={r.onClick} style={{ display: 'grid', gridTemplateColumns: cols, gap: 4, borderBottom: '1px solid var(--border)', cursor: r.onClick ? 'pointer' : 'default', opacity: r.dim ? 0.75 : 1 }}>
          <div style={cell}>{r.date}{r.tag && <span style={{ display: 'block', fontSize: 9, color: 'var(--txt3)' }}>{r.tag}</span>}</div>
          <div style={{ ...cell, textAlign: 'right', fontWeight: 700, color: r.incoming ? 'var(--mint-dim)' : 'var(--txt)' }}>{r.incoming ? '+' : ''}{formatINR(r.emi)}</div>
          <div style={{ ...cell, textAlign: 'right', color: 'var(--red-dim)' }}>{r.interest ? formatINR(r.interest) : '—'}</div>
          <div style={{ ...cell, textAlign: 'right', color: 'var(--mint-dim)' }}>{r.principal ? formatINR(r.principal) : '—'}</div>
          <div style={{ ...cell, textAlign: 'right' }}>{r.balance != null ? formatINR(r.balance) : '—'}</div>
        </div>
      ))}
      {footer}
    </div>
  )
}

export default function Debt() {
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [tab, setTab] = useState({})            // per loan: 'ledger' | 'upcoming'
  const [showAll, setShowAll] = useState({})    // per loan: show the whole upcoming schedule
  const [repayFor, setRepayFor] = useState(null)
  const [repayForm, setRepayForm] = useState(EMPTY_REPAY)
  const [receiveFor, setReceiveFor] = useState(null)
  const [receiveForm, setReceiveForm] = useState(EMPTY_RECEIPT)
  const [editId, setEditId] = useState(null) // set while the form below is editing an existing debt
  const [form, setForm] = useState(EMPTY_DEBT)
  // A bank's own EMI schedule pasted in: { meta, rows, type } once read, { fromDebt: true } when editing a loan that has one
  const [sched, setSched] = useState(null)
  const [paste, setPaste] = useState({ open: false, text: '', dueDay: '5' })
  const { showNotification, debtSegment, setDebtSegment } = useStore()
  const accounts = (useLiveQuery(() => db.creditCards.toArray()) || []).filter(c => c.cardType === 'account' && !c.draft)
  const acctLabel = a => `${a.name}${a.cardLast4 && !a.name.includes('••') ? ` ••${a.cardLast4}` : ''}`

  const debts = useLiveQuery(() => db.debts.toArray())
  const allRepayments = useLiveQuery(() => db.debtRepayments.toArray()) || []
  const lastPaid = debtId => lastRepaymentDate(allRepayments.filter(r => r.debtId === debtId))

  const active = (debts || []).filter(d => d.status === 'active')
  const closed = (debts || []).filter(d => d.status === 'closed')
  const totalOutstanding = active.reduce((s, d) => s + d.currentOutstanding, 0)
  const totalPrincipal = active.reduce((s, d) => s + (d.principal || 0), 0)
  const pctCleared = totalPrincipal > 0 ? Math.round((1 - totalOutstanding / totalPrincipal) * 100) : 0
  const totalEMI = active.filter(d => d.emiAmount > 0).reduce((s, d) => s + nextEmiAmount(d), 0)
  const nextUp = active.filter(d => d.emiAmount > 0 && d.nextEmiDate).sort((a, b) => new Date(a.nextEmiDate) - new Date(b.nextEmiDate))[0]

  const closeForm = () => { setAddOpen(false); setEditId(null); setForm(EMPTY_DEBT); setSched(null); setPaste({ open: false, text: '', dueDay: '5' }) }

  // Reads the pasted bank schedule and fills in everything the bank already told us
  const readSchedule = () => {
    try {
      const p = parseEmiSchedule(paste.text, { dueDay: paste.dueDay })
      const tail = p.meta.loanNo ? p.meta.loanNo.replace(/^0+/, '').slice(-4) : ''
      setSched(p)
      setForm({
        ...form, type: p.type, name: form.name || `${p.type === 'DebitCardEMI' ? 'Debit card EMI' : p.type === 'CreditCardEMI' ? 'Credit card EMI' : p.type === 'HomeLoan' ? 'Home loan' : 'EMI'}${tail ? ` ••${tail}` : ''}`,
        loanAccountNo: p.meta.loanNo || form.loanAccountNo, principal: String(p.meta.principal || p.meta.currentOutstanding), interestRate: p.meta.rate ? String(p.meta.rate) : '',
        tenureMonths: String(p.rows.length), startDate: p.meta.bookedDate ? format(p.meta.bookedDate, 'yyyy-MM-dd') : form.startDate, mode: 'schedule',
        currentOutstanding: String(p.meta.currentOutstanding ?? p.meta.principal), emiAmount: String((p.rows[1] || p.rows[0]).emi),
        nextEmiDate: format(p.rows[0].dueDate, 'yyyy-MM-dd'), paidCount: '0',
      })
      setPaste({ ...paste, open: false })
    } catch (e) { showNotification(e.message, 'error') }
  }
  const setType = type => setForm({ ...form, type, mode: defaultMode(type) })

  const openEdit = d => {
    const day = v => (v ? format(new Date(v), 'yyyy-MM-dd') : '')
    setForm({
      name: d.name || '', type: d.type || 'PersonalLoan', lender: d.lender || '',
      loanAccountNo: d.loanAccountNo || d.accountRef || '', debitAccountId: d.debitAccountId != null ? String(d.debitAccountId) : '',
      principal: String(d.principal ?? ''), currentOutstanding: String(d.currentOutstanding ?? ''),
      interestRate: d.interestRate ? String(d.interestRate) : '', emiAmount: d.emiAmount ? String(d.emiAmount) : '',
      tenureMonths: d.tenureMonths ? String(d.tenureMonths) : '', nextEmiDate: day(d.nextEmiDate), paidCount: d.paidCount ? String(d.paidCount) : '',
      startDate: day(d.startDate), mode: d.mode || defaultMode(d.type), notes: d.notes || '',
    })
    setEditId(d.id)
    setSched(d.schedule?.length ? { fromDebt: true } : null)
    setAddOpen(true)
    document.querySelector('.screen')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // The loan as the form describes it right now (also drives the live preview).
  //   "Still owed now" left blank = a new loan: it starts from the first EMI date and every EMI since is posted for you.
  //   "Still owed now" filled in = a running loan: EMIs are posted from the next EMI date onwards.
  const draft = () => {
    const principal = Number(form.principal) || 0
    const running = !!editId || form.currentOutstanding !== ''
    const first = toDate(form.nextEmiDate)
    return {
      principal, currentOutstanding: form.currentOutstanding === '' ? principal : Number(form.currentOutstanding) || 0,
      interestRate: Number(form.interestRate) || 0, emiAmount: Number(form.emiAmount) || 0, tenureMonths: parseInt(form.tenureMonths) || 0,
      mode: form.mode, nextEmiDate: first, emiDate: first ? first.getDate() : 0, paidCount: running ? (parseInt(form.paidCount) || 0) : 0,
      // A running loan's balance is what is left after the last EMI, so interest counts from the previous EMI date.
      interestFrom: first ? (running ? addMonths(first, -1) : (toDate(form.startDate) || addMonths(first, -1))) : new Date(), running,
    }
  }

  const handleSaveDebt = async () => {
    if (!form.name || !form.principal) { showNotification('Name and loan amount are required', 'error'); return }

    // A bank's own schedule: every instalment is kept exactly as printed, and falls due on the day chosen
    if (sched?.rows && !editId) {
      const rows = sched.rows
      if (form.loanAccountNo.trim() && (debts || []).some(x => x.loanAccountNo === form.loanAccountNo.trim())) { showNotification('A loan with this number is already added', 'error'); return }
      const booked = sched.meta.bookedDate || new Date()
      await db.debts.add({
        name: form.name, type: form.type, lender: form.lender, loanAccountNo: form.loanAccountNo.trim(),
        debitAccountId: form.debitAccountId === '' ? null : Number(form.debitAccountId),
        principal: sched.meta.principal || sched.meta.currentOutstanding, currentOutstanding: sched.meta.currentOutstanding ?? sched.meta.principal, interestRate: sched.meta.rate,
        emiAmount: (rows[1] || rows[0]).emi, tenureMonths: rows.length, mode: 'schedule', schedule: rows,
        emiDate: rows[0].dueDate.getDate(), nextEmiDate: rows[0].dueDate, paidCount: 0, interestFrom: booked, startDate: booked,
        status: 'active', totalPaid: 0, totalInterestPaid: 0, autoEmi: true, notes: form.notes,
      })
      showNotification('Debt added', 'success')
      const n = await postDueEmis()
      if (n > 0) showNotification(`${n} EMI${n === 1 ? '' : 's'} posted to the ledger`, 'success')
      closeForm()
      return
    }
    // a loan that already has a bank schedule: only its labels can be edited here
    if (editId && sched?.fromDebt) {
      await db.debts.update(editId, { name: form.name, lender: form.lender, loanAccountNo: form.loanAccountNo.trim(), debitAccountId: form.debitAccountId === '' ? null : Number(form.debitAccountId), notes: form.notes })
      showNotification('Debt updated', 'success')
      closeForm()
      return
    }
    const d = draft()
    if (!(d.principal > 0) || !(d.currentOutstanding >= 0)) { showNotification('Enter valid amounts', 'error'); return }
    if (d.emiAmount > 0 && !d.nextEmiDate) { showNotification('Enter the first (or next) EMI date so the EMIs can be posted', 'error'); return }
    const fields = {
      name: form.name, type: form.type, lender: form.lender, loanAccountNo: form.loanAccountNo.trim(),
      debitAccountId: form.debitAccountId === '' ? null : Number(form.debitAccountId),
      principal: d.principal, currentOutstanding: d.currentOutstanding, interestRate: d.interestRate, emiAmount: d.emiAmount,
      tenureMonths: d.tenureMonths, mode: d.mode, emiDate: d.emiDate, nextEmiDate: d.emiAmount > 0 ? d.nextEmiDate : null,
      startDate: toDate(form.startDate) || new Date(), notes: form.notes, autoEmi: true,
    }
    if (editId) {
      const before = await db.debts.get(editId)
      // Changing the balance by hand restarts the interest count from the previous EMI date.
      const restart = before && Number(before.currentOutstanding) !== d.currentOutstanding ? { interestFrom: d.interestFrom } : {}
      await db.debts.update(editId, { ...fields, paidCount: d.paidCount, ...restart })
      showNotification('Debt updated', 'success')
    } else {
      await db.debts.add({
        ...fields, paidCount: d.paidCount, interestFrom: d.interestFrom, status: 'active', totalInterestPaid: 0,
        totalPaid: Math.max(0, d.principal - d.currentOutstanding), // paid off before you started tracking
      })
      showNotification('Debt added', 'success')
    }
    const posted = await postDueEmis() // EMIs already due (a loan that started in the past) are posted straight away
    if (posted > 0) showNotification(`${posted} EMI${posted === 1 ? '' : 's'} posted to the ledger`, 'success')
    closeForm()
  }

  const handleDeleteDebt = async d => {
    if (!window.confirm(`Delete "${d.name}" and its payment history? This cannot be undone.`)) return
    await db.debtRepayments.where('debtId').equals(d.id).delete()
    await db.debts.delete(d.id)
    showNotification('Debt deleted', 'success')
  }

  const handleSaveRepay = async () => {
    try {
      await addManualRepayment(repayFor, repayForm)
      showNotification(`Payment of ${formatINR(repayForm.amount)} recorded`, 'success')
      setRepayFor(null); setRepayForm(EMPTY_REPAY)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const handleSaveReceipt = async () => {
    try {
      await recordReceipt(receiveFor, receiveForm)
      showNotification(`Received ${formatINR(receiveForm.amount)} recorded`, 'success')
      setReceiveFor(null); setReceiveForm(EMPTY_RECEIPT)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const handleUndo = async id => {
    await undoRepayment(id)
    showNotification('Entry removed and balances put back', 'success')
  }

  const handleMarkClosed = async id => {
    await db.debts.update(id, { status: 'closed', nextEmiDate: null })
    showNotification('Debt marked as closed', 'success')
  }

  const acctOptions = d => (
    <>
      <option value="">{d.debitAccountId != null && accounts.find(x => x.id === d.debitAccountId) ? `Loan's account (${acctLabel(accounts.find(x => x.id === d.debitAccountId))})` : 'No bank account'}</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}{a.accountBalance != null ? ` · ${formatINR(a.accountBalance)}` : ''}</option>)}
    </>
  )

  // preview of the schedule the form describes
  const preview = (() => {
    const d = draft()
    if (!(d.emiAmount > 0) || !d.nextEmiDate || !(d.currentOutstanding > 0)) return null
    return { d, proj: projectSchedule(d) }
  })()

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar title="Debt" />

      {/* Loans | Insurance policies */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px' }}>
        {[['loans', 'Loans'], ['insurance', 'Insurance']].map(([id, label]) => (
          <div key={id} className={`chip${debtSegment === id ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setDebtSegment(id)}>{label}</div>
        ))}
      </div>
      {debtSegment === 'insurance' && <PoliciesView />}
      {debtSegment !== 'insurance' && (
        <div style={{ padding: '10px 16px 0' }}>
          {/* Header */}
          <Card style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <LabelCaps>Total still owed · {active.length} active</LabelCaps>
            </div>
            <MonoLg style={{ marginBottom: 8 }}>{formatINR(totalOutstanding)}</MonoLg>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>EMI outflow</div>
                <div className="mono-md" style={{ color: 'var(--amber)' }}>{formatINR(totalEMI)}/mo</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Next EMI</div>
                <div className="mono-md" style={{ fontSize: 13 }}>{nextUp ? `${nextUp.name.split(' ')[0]} · ${formatINR(nextEmiAmount(nextUp))} · ${fmtS(nextUp.nextEmiDate)}` : '—'}</div>
              </div>
            </div>
            <Divider />
            <ProgressBar pct={pctCleared} variant="gradient" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, fontSize: 10, color: 'var(--txt2)' }}>
              <span style={{ color: 'var(--mint)' }}>{pctCleared}% principal cleared</span>
            </div>
          </Card>

          <button className="btn-primary" style={{ width: '100%', height: 42, fontSize: 13, marginBottom: 12 }} onClick={() => (addOpen && !editId ? closeForm() : (setEditId(null), setForm(EMPTY_DEBT), setAddOpen(true)))}>+ Add new debt</button>

          {/* Add / edit form */}
          {addOpen && (
            <Card style={{ marginBottom: 10 }}>
              <LabelCaps style={{ marginBottom: 8 }}>{editId ? 'Edit debt' : 'Add new debt'}</LabelCaps>

              {/* A bank's own EMI schedule (debit / credit card EMI): paste it and every instalment is loaded exactly as printed */}
              {!editId && !sched && (
                <div style={{ marginBottom: 10 }}>
                  <button className="btn-secondary" style={{ width: '100%', height: 38, fontSize: 12 }} onClick={() => setPaste({ ...paste, open: !paste.open })}>📋 Paste my bank's EMI schedule</button>
                  {paste.open && (
                    <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 10, marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6 }}>Paste either the card-EMI table (Principal, Interest, Statement Date) or a loan-details page with the Due Date / EMI (Prin.) / EMI (Int.) / Schedule OS table, exactly as your bank shows it.</div>
                      <textarea className="input" style={{ height: 130, fontSize: 11, marginBottom: 8 }} placeholder="0000000000138408252 01 Apr 2026 EMI ON DC 61802.28 16.00 12 26952.28&#10;4783.00 934.00 20 Apr 2026&#10;4847.00 760.00 20 May 2026 …" value={paste.text} onChange={e => setPaste({ ...paste, text: e.target.value })} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <LabelCaps style={{ marginBottom: 4 }}>Payment is due on day … of the month AFTER the statement</LabelCaps>
                          <input className="input" type="number" inputMode="numeric" min="1" max="31" value={paste.dueDay} onChange={e => setPaste({ ...paste, dueDay: e.target.value })} />
                        </div>
                        <BtnPrimary onClick={readSchedule} style={{ height: 46, padding: '0 16px' }}>Read</BtnPrimary>
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 6 }}>Card EMIs only: statement on the 20th and payment on the 5th of the next month, enter 5. A loan-details page already has its due dates, so this is ignored.</div>
                    </div>
                  )}
                </div>
              )}
              {sched?.rows && (
                <div style={{ background: 'var(--mint-bg)', border: '1px solid var(--mint-border)', borderRadius: 12, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: 'var(--txt2)', lineHeight: 1.6 }}>
                  <div style={{ color: 'var(--mint-dim)', fontWeight: 700, marginBottom: 2 }}>Bank schedule loaded · {sched.rows.length} EMIs</div>
                  {sched.meta.format === 'loan-details' ? (
                    <>
                      <div>{formatINR(sched.meta.currentOutstanding)} still owed at {sched.meta.rate}% · due on the {sched.rows[0].dueDate.getDate()}th every month</div>
                      <div>First {sched.printedCount} EMIs are exactly as your lender printed them; the other {sched.estimatedCount} are worked out the same way (monthly interest on the balance).</div>
                      {(sched.notes || []).map((n, i) => <div key={i} style={{ color: 'var(--red-dim)' }}>{n}</div>)}
                    </>
                  ) : (
                    <div>{formatINR(sched.meta.principal)} at {sched.meta.rate}% · statement on the {sched.rows[0].statementDate.getDate()}th, due on the {sched.rows[0].dueDate.getDate()}th of the next month</div>
                  )}
                  <div>First due <b style={{ color: 'var(--txt)' }}>{fmtD(sched.rows[0].dueDate)}</b> · last due <b style={{ color: 'var(--txt)' }}>{fmtD(sched.rows[sched.rows.length - 1].dueDate)}</b></div>
                  <div>EMI <b style={{ color: 'var(--txt)' }}>{formatINR((sched.rows[1] || sched.rows[0]).emi)}</b> a month · total interest <b style={{ color: 'var(--red-dim)' }}>{formatINR(sched.rows.reduce((s, r) => s + r.interest, 0))}</b></div>
                  <div>EMIs already due are posted to the ledger as soon as you save.</div>
                  <div style={{ marginTop: 4 }}><span style={{ color: 'var(--gold-dim)', fontWeight: 700, cursor: 'pointer' }} onClick={() => { setSched(null); setPaste({ ...paste, open: true }) }}>Paste a different schedule</span></div>
                </div>
              )}
              {sched?.fromDebt && <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 10 }}>This loan follows your bank's own EMI schedule, so its amounts and dates are fixed. You can change its name, lender, account number and notes here. To use a different schedule, delete the loan and paste the new one.</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Type" span>
                  <select className="input" value={form.type} onChange={e => setType(e.target.value)}>
                    {DEBT_TYPES.map(([id, label, icon]) => <option key={id} value={id}>{icon} {label}</option>)}
                  </select>
                </Field>
                <Field label="Name" span><input className="input" placeholder="e.g. HDFC Home Loan, Phone EMI" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Lender"><input className="input" value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} /></Field>
                <Field label="Loan account no."><input className="input" value={form.loanAccountNo} onChange={e => setForm({ ...form, loanAccountNo: e.target.value })} /></Field>
                <Field label="EMI debited from" span>
                  <select className="input" value={form.debitAccountId} onChange={e => setForm({ ...form, debitAccountId: e.target.value })}>
                    <option value="">Not set</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{acctLabel(a)}{a.accountBalance != null ? ` · ${formatINR(a.accountBalance)}` : ''}</option>)}
                  </select>
                </Field>
                {/* with a pasted / saved bank schedule these are shown filled in, but locked: the schedule decides them */}
                <fieldset disabled={!!sched} style={{ display: 'contents', border: 0, padding: 0, margin: 0 }}>
                <Field label={FIXED_TYPES.includes(form.type) ? 'Purchase / loan amount (₹)' : 'Loan amount (₹)'}><input className="input" type="number" inputMode="decimal" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} /></Field>
                <Field label="Still owed now (₹)"><input className="input" type="number" inputMode="decimal" placeholder="blank = new loan" value={form.currentOutstanding} onChange={e => setForm({ ...form, currentOutstanding: e.target.value })} /></Field>
                <Field label="Interest % a year"><input className="input" type="number" inputMode="decimal" placeholder={FIXED_TYPES.includes(form.type) ? '0 for no-cost EMI' : ''} value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} /></Field>
                <Field label="EMI amount (₹)"><input className="input" type="number" inputMode="decimal" value={form.emiAmount} onChange={e => setForm({ ...form, emiAmount: e.target.value })} /></Field>
                <Field label="Tenure (months)"><input className="input" type="number" inputMode="numeric" value={form.tenureMonths} onChange={e => setForm({ ...form, tenureMonths: e.target.value })} /></Field>
                <Field label={form.currentOutstanding === '' && !editId ? 'First EMI date' : 'Next EMI date'}><input className="input" type="date" value={form.nextEmiDate} onChange={e => setForm({ ...form, nextEmiDate: e.target.value })} /></Field>
                {(editId || form.currentOutstanding !== '') && (
                  <Field label="EMIs already paid"><input className="input" type="number" inputMode="numeric" value={form.paidCount} onChange={e => setForm({ ...form, paidCount: e.target.value })} /></Field>
                )}
                <Field label="Start / disbursal date"><input className="input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></Field>
                <Field label="How it is paid" span>
                  <select className="input" value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                    <option value="reducing">Reducing-balance loan (interest on what is still owed)</option>
                    <option value="fixed">Fixed EMI schedule (card / purchase EMI)</option>
                    {(sched || form.mode === 'schedule') && <option value="schedule">Your bank's own schedule (pasted)</option>}
                  </select>
                </Field>
                </fieldset>
              </div>

              {!sched && <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '8px 0' }}>
                {form.currentOutstanding === '' && !editId
                  ? 'New loan: EMIs are posted from the first EMI date. If that date is already in the past, every EMI since then is posted for you right away.'
                  : 'Running loan: EMIs are posted from the next EMI date onwards. Leave "Still owed now" blank for a brand-new loan.'}
              </div>}

              {!sched && preview && (
                <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--txt2)', lineHeight: 1.6 }}>
                  {preview.proj.neverEnds
                    ? <div style={{ color: 'var(--red-dim)' }}>This EMI only covers the interest, so the balance would never fall. Check the amount and rate.</div>
                    : (
                      <>
                        <div><b style={{ color: 'var(--txt)' }}>{preview.proj.remaining}</b> EMIs from {fmtS(preview.d.nextEmiDate)}, finishing <b style={{ color: 'var(--txt)' }}>{format(preview.proj.endDate, 'MMM yyyy')}</b></div>
                        <div>Total interest <b style={{ color: 'var(--red-dim)' }}>{formatINR(preview.proj.totalInterest)}</b> · total to pay <b style={{ color: 'var(--txt)' }}>{formatINR(preview.proj.totalToPay)}</b></div>
                        {preview.proj.rows[0] && <div>First EMI: <b style={{ color: 'var(--red-dim)' }}>{formatINR(preview.proj.rows[0].interest)} interest</b> + <b style={{ color: 'var(--mint-dim)' }}>{formatINR(preview.proj.rows[0].principal)} principal</b></div>}
                      </>
                    )}
                </div>
              )}

              <input className="input" placeholder="Notes (optional)" style={{ marginBottom: 8 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <BtnPrimary onClick={handleSaveDebt} style={{ flex: 1, height: 38, fontSize: 13 }}>{editId ? 'Save changes' : 'Save debt'}</BtnPrimary>
                <button className="btn-ghost" style={{ height: 38, fontSize: 12 }} onClick={closeForm}>Cancel</button>
              </div>
            </Card>
          )}

          {/* Active liabilities */}
          <SectionHdr title="Active liabilities" />

          {active.map(d => {
            // Principal paid = what has come off the original principal, however it got there.
            const principalPaid = Math.max(0, (d.principal || 0) - (d.currentOutstanding || 0))
            const paidPct = d.principal > 0 ? Math.min(100, Math.round(principalPaid / d.principal * 100)) : 0
            const isExpanded = expandedId === d.id
            const proj = projectSchedule(d)
            const paid = d.paidCount || 0
            const totalEmis = d.tenureMonths || (paid + proj.remaining)
            const fixed = d.mode === 'fixed' || FIXED_TYPES.includes(d.type)
            const rows = allRepayments.filter(r => r.debtId === d.id).sort((a, b) => new Date(b.date) - new Date(a.date))
            const view = tab[d.id] || 'ledger'
            // instalments already billed on a statement but not yet due (bank schedules only)
            const nowDay = new Date()
            const billed = Array.isArray(d.schedule) ? d.schedule.slice(d.paidCount || 0).filter(r => new Date(r.statementDate) <= nowDay && new Date(r.dueDate) > nowDay) : []
            return (
              <div key={d.id} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--indigo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {DEBT_ICONS[d.type] || '💳'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{[d.lender, (d.loanAccountNo || d.accountRef) && `A/c ${d.loanAccountNo || d.accountRef}`].filter(Boolean).join(' · ') || ' '}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="mono-md">{formatINR(d.currentOutstanding)}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt2)' }}>of {formatINR(d.principal)}</div>
                  </div>
                </div>

                {/* Tags sit under the title row and wrap, so a long list never pushes the amount out of the card */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Badge variant="grey" style={{ fontSize: 9 }}>{DEBT_LABELS[d.type] || d.type}</Badge>
                  {d.interestRate > 0
                    ? <span className="mono-xs" style={{ color: 'var(--txt2)' }}>{d.interestRate}% p.a. · {formatINR(dailyInterest(d), 2)}/day now</span>
                    : <span style={{ fontSize: 10, color: 'var(--txt2)' }}>0% interest</span>}
                </div>

                <LabelCaps style={{ marginBottom: 4 }}>Principal cleared</LabelCaps>
                <ProgressBar pct={paidPct} variant="mint" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: 'var(--mint)' }}>{paidPct}% paid off · {formatINR(principalPaid)} of principal</span>
                </div>

                {d.emiAmount > 0 && d.nextEmiDate && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt2)', lineHeight: 1.6 }}>
                    <div>EMI <b style={{ color: 'var(--txt)' }}>{formatINR(nextEmiAmount(d))}</b> · next due <b style={{ color: 'var(--txt)' }}>{fmtD(d.nextEmiDate)}</b></div>
                    {billed.length > 0 && (
                      <div>
                        Billed on {fmtS(billed[0].statementDate)}, due {fmtS(billed[0].dueDate)}: <b style={{ color: 'var(--red-dim)' }}>{formatINR(billed[0].emi)}</b> ({formatINR(billed[0].principal)} principal + {formatINR(billed[0].interest)} interest)
                      </div>
                    )}
                    {billed.length > 0 && <div>Principal outstanding as your bank shows it: <b style={{ color: 'var(--txt)' }}>{formatINR(d.currentOutstanding - billed.reduce((s, r) => s + r.principal, 0))}</b> <span style={{ color: 'var(--txt3)' }}>(without the billed instalment)</span></div>}
                    <div>
                      <b style={{ color: 'var(--txt)' }}>{paid}</b> of <b style={{ color: 'var(--txt)' }}>{totalEmis}</b> EMIs paid · <b style={{ color: 'var(--txt)' }}>{proj.remaining}</b> to go{proj.endDate ? <> · ends <b style={{ color: 'var(--txt)' }}>{format(proj.endDate, 'MMM yyyy')}</b></> : ''}
                    </div>
                    {fixed && <div>Still to pay in total: <b style={{ color: 'var(--txt)' }}>{formatINR(proj.totalToPay)}</b></div>}
                  </div>
                )}

                {isExpanded && (
                  <>
                    <Divider />
                    {(d.loanAccountNo || d.accountRef || d.debitAccountId != null) && (
                      <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8, lineHeight: 1.6 }}>
                        {(d.loanAccountNo || d.accountRef) && <div>Loan account no.: <b style={{ color: 'var(--txt)' }}>{d.loanAccountNo || d.accountRef}</b></div>}
                        {d.debitAccountId != null && (() => { const a = accounts.find(x => x.id === d.debitAccountId); return a ? <div>EMI debited from: <b style={{ color: 'var(--txt)' }}>{acctLabel(a)}</b>{a.accountBalance != null ? ` · balance ${formatINR(a.accountBalance)}` : ''}</div> : null })()}
                      </div>
                    )}

                    {d.interestRate > 0 && (() => {
                      // Interest runs daily on the outstanding balance; each EMI clears the interest first, the rest is principal.
                      const sp = splitPayment(d, d.emiAmount || 0, new Date(), lastPaid(d.id))
                      const next = proj.rows[0]
                      return (
                        <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--txt2)', lineHeight: 1.6 }}>
                          <div>Interest per day today: <b style={{ color: 'var(--txt)' }}>{formatINR(sp.perDay, 2)}</b> — on the balance still owed ({formatINR(d.currentOutstanding)}, not the original {formatINR(d.principal)}) at {d.interestRate}% a year</div>
                          {next && <div>Next EMI on {fmtS(next.date)}: <b style={{ color: 'var(--red-dim)' }}>{formatINR(next.interest)} interest</b> + <b style={{ color: 'var(--mint-dim)' }}>{formatINR(next.principal)} principal</b>, leaving {formatINR(next.outstandingAfter)}</div>}
                          {d.totalInterestPaid > 0 && <div>Interest paid so far: <b style={{ color: 'var(--txt)' }}>{formatINR(d.totalInterestPaid)}</b>{proj.remaining > 0 && <> · still to come: <b style={{ color: 'var(--red-dim)' }}>{formatINR(proj.totalInterest)}</b></>}</div>}
                        </div>
                      )
                    })()}
                    {d.notes && <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>{d.notes}</div>}

                    {/* Ledger of what was paid, and what is still to come */}
                    <div style={{ display: 'flex', gap: 8, margin: '4px 0 8px' }}>
                      {[['ledger', `Ledger · ${rows.length}`], ['upcoming', `Upcoming · ${proj.remaining}`]].map(([id, label]) => (
                        <div key={id} className={`chip${view === id ? ' active' : ''}`} style={{ flex: 1, textAlign: 'center', padding: '5px 4px' }} onClick={() => setTab({ ...tab, [d.id]: id })}>{label}</div>
                      ))}
                    </div>
                    {view === 'ledger' && (rows.length ? (
                      <ScheduleTable rows={rows.map(r => {
                        const incoming = r.direction === 'in'
                        const manual = r.source !== 'auto'
                        return {
                          key: r.id, date: fmtS(r.date), dim: false, incoming,
                          tag: incoming ? (d.type === 'FriendLent' ? 'received back' : 'received') : r.installmentNo ? `EMI #${r.installmentNo}${r.statementDate ? ` · stmt ${fmtS(r.statementDate)}` : ''}` : manual ? 'extra payment' : '',
                          emi: r.amount, interest: incoming ? 0 : r.interest, principal: incoming ? 0 : r.principal, balance: r.outstandingAfter ?? null,
                          onClick: manual ? () => { if (window.confirm('Remove this entry and put the balance back?')) handleUndo(r.id) } : undefined,
                        }
                      })} footer={<div style={{ fontSize: 10, color: 'var(--txt3)', paddingTop: 6 }}>EMIs post themselves on their due date. Tap an extra payment or received entry to remove it.</div>} />
                    ) : <div style={{ fontSize: 12, color: 'var(--txt2)', padding: '8px 0 12px' }}>Nothing posted yet. The first EMI posts on {fmtD(d.nextEmiDate)}.</div>)}
                    {view === 'upcoming' && (proj.rows.length ? (
                      <ScheduleTable
                        rows={proj.rows.slice(0, showAll[d.id] ? proj.rows.length : 12).map(r => ({ key: r.no, date: fmtS(r.date), tag: `EMI #${r.no}${r.statementDate ? ` · stmt ${fmtS(r.statementDate)}` : ''}${r.final ? ' · last' : ''}`, emi: r.emi, interest: r.interest, principal: r.principal, balance: r.outstandingAfter, dim: true }))}
                        footer={proj.rows.length > 12 && !showAll[d.id] ? <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: 'var(--gold-dim)', fontWeight: 700, cursor: 'pointer' }} onClick={() => setShowAll({ ...showAll, [d.id]: true })}>Show all {proj.rows.length} EMIs</div> : null}
                      />
                    ) : <div style={{ fontSize: 12, color: 'var(--txt2)', padding: '8px 0 12px' }}>{d.emiAmount > 0 ? 'No EMIs left.' : 'Add an EMI amount and date to see the schedule.'}</div>)}

                    {repayFor === d.id && (
                      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                        <LabelCaps style={{ marginBottom: 6 }}>Extra payment · still owed {formatINR(d.currentOutstanding)}</LabelCaps>
                        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>A part-payment or pre-closure on top of the monthly EMI. The whole amount reduces the principal from the date you choose; interest after that date is charged on the lower balance. Regular EMIs post themselves.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <input className="input" type="number" inputMode="decimal" placeholder="Amount paid (₹)" value={repayForm.amount} onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })} />
                          <input className="input" type="date" value={repayForm.date} onChange={e => setRepayForm({ ...repayForm, date: e.target.value })} />
                        </div>
                        {Number(repayForm.amount) > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>
                            Still owed after this: <b style={{ color: 'var(--mint-dim)' }}>{formatINR(Math.max(0, d.currentOutstanding - Number(repayForm.amount)))}</b> · principal reduced by <b style={{ color: 'var(--mint-dim)' }}>{formatINR(Math.min(Number(repayForm.amount), d.currentOutstanding))}</b>, no interest taken out of it.
                          </div>
                        )}
                        <LabelCaps style={{ marginBottom: 4 }}>Debited from</LabelCaps>
                        <select className="input" style={{ marginBottom: 8 }} value={repayForm.accountId} onChange={e => setRepayForm({ ...repayForm, accountId: e.target.value })}>{acctOptions(d)}</select>
                        <input className="input" placeholder="Note (optional)" style={{ marginBottom: 8 }} value={repayForm.notes} onChange={e => setRepayForm({ ...repayForm, notes: e.target.value })} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <BtnPrimary onClick={handleSaveRepay} style={{ flex: 1, height: 36, fontSize: 12 }}>Save payment</BtnPrimary>
                          <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => setRepayFor(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {receiveFor === d.id && (
                      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                        <LabelCaps style={{ marginBottom: 6 }}>{d.type === 'FriendLent' ? 'Amount received back' : 'Amount received from lender'}</LabelCaps>
                        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>
                          {d.type === 'FriendLent' ? 'It lowers what you are still owed and is added to the account it reached.' : 'A disbursal or top-up: it adds to what you owe and to the amount borrowed, and is added to the account it reached.'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <input className="input" type="number" inputMode="decimal" placeholder="Amount received (₹)" value={receiveForm.amount} onChange={e => setReceiveForm({ ...receiveForm, amount: e.target.value })} />
                          <input className="input" type="date" value={receiveForm.date} onChange={e => setReceiveForm({ ...receiveForm, date: e.target.value })} />
                        </div>
                        <LabelCaps style={{ marginBottom: 4 }}>Credited to</LabelCaps>
                        <select className="input" style={{ marginBottom: 8 }} value={receiveForm.accountId} onChange={e => setReceiveForm({ ...receiveForm, accountId: e.target.value })}>{acctOptions(d)}</select>
                        <input className="input" placeholder="Note (optional)" style={{ marginBottom: 8 }} value={receiveForm.notes} onChange={e => setReceiveForm({ ...receiveForm, notes: e.target.value })} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <BtnPrimary onClick={handleSaveReceipt} style={{ flex: 1, height: 36, fontSize: 12 }}>Save received</BtnPrimary>
                          <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => setReceiveFor(null)}>Cancel</button>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button className="btn-secondary" style={{ height: 32, fontSize: 11 }} onClick={() => { setReceiveFor(null); setRepayFor(repayFor === d.id ? null : d.id); setRepayForm({ ...EMPTY_REPAY, amount: '' }) }}>＋ Extra payment</button>
                      <button className="btn-secondary" style={{ height: 32, fontSize: 11 }} onClick={() => { setRepayFor(null); setReceiveFor(receiveFor === d.id ? null : d.id); setReceiveForm(EMPTY_RECEIPT) }}>↓ Amount received</button>
                      <button className="btn-secondary" style={{ height: 32, fontSize: 11 }} onClick={() => openEdit(d)}>✎ Edit debt</button>
                      <button className="btn-ghost" style={{ height: 32, fontSize: 11 }} onClick={() => handleMarkClosed(d.id)}>Mark as closed</button>
                      <button className="btn-ghost" style={{ height: 32, fontSize: 11, gridColumn: '1 / -1', color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={() => handleDeleteDebt(d)}>Delete debt</button>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {!active.length && (
            <Card style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--txt2)', fontSize: 13, marginBottom: 10 }}>
              No debts yet. Add a loan or an EMI purchase with its amount, rate, EMI and first EMI date, and each EMI posts itself on its due date.
            </Card>
          )}

          {closed.length > 0 && (
            <>
              <SectionHdr title={`Closed · ${closed.length}`} />
              {closed.map(d => (
                <Card key={d.id} style={{ marginBottom: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{DEBT_ICONS[d.type] || '💳'} {d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{formatINR(d.principal)} · interest paid {formatINR(d.totalInterestPaid || 0)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn-ghost" style={{ height: 30, fontSize: 11 }} onClick={() => db.debts.update(d.id, { status: 'active' })}>Reopen</button>
                      <button className="btn-ghost" style={{ height: 30, fontSize: 11, color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={() => handleDeleteDebt(d)}>Delete</button>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
