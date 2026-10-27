import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, TxnRow, Divider, LabelCaps, MonoLg, MonoMd, BtnPrimary, BtnSecondary, formatINR, formatDate } from '../components/UI'
import { useStore } from '../store'
import { parseSMS } from '../lib/smsParser'
import PoliciesView from '../components/PoliciesView'
import { exportDebtsToFile, buildDebtBackup, importDebts, addManualRepayment, undoRepayment } from '../lib/debtBackup'

const EMPTY_DEBT = {
  name: '', type: 'PersonalLoan', lender: '', principal: '', currentOutstanding: '',
  interestRate: '', emiAmount: '', emiDate: '', startDate: '', endDate: '', notes: '',
}
const EMPTY_REPAY = { amount: '', principal: '', interest: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' }

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

const MONTHS_LEFT = (d) => {
  if (!d.endDate) return '∞'
  const months = Math.round((new Date(d.endDate) - new Date()) / (1000 * 60 * 60 * 24 * 30))
  return `${months} mos`
}

export default function Debt() {
  const [addOpen, setAddOpen] = useState(false)
  const [matchSMSOpen, setMatchSMSOpen] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [repayFor, setRepayFor] = useState(null)
  const [repayForm, setRepayForm] = useState(EMPTY_REPAY)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const { showNotification, debtSegment, setDebtSegment } = useStore()

  const [editId, setEditId] = useState(null) // set while the form below is editing an existing debt
  const [form, setForm] = useState(EMPTY_DEBT)

  const debts = useLiveQuery(() => db.debts.toArray())
  const repayments = useLiveQuery(() => db.debtRepayments.orderBy('date').reverse().limit(20).toArray())

  const active = (debts || []).filter(d => d.status === 'active')
  const totalOutstanding = active.reduce((s, d) => s + d.currentOutstanding, 0)
  const totalPrincipal = active.reduce((s, d) => s + (d.principal || 0), 0)
  const pctCleared = totalPrincipal > 0 ? Math.round((1 - totalOutstanding / totalPrincipal) * 100) : 0
  const totalEMI = active.filter(d => d.emiAmount > 0).reduce((s, d) => s + d.emiAmount, 0)

  const closeForm = () => { setAddOpen(false); setEditId(null); setForm(EMPTY_DEBT) }

  const openEdit = d => {
    const day = v => (v ? format(new Date(v), 'yyyy-MM-dd') : '')
    setForm({
      name: d.name || '', type: d.type || 'PersonalLoan', lender: d.lender || '',
      principal: String(d.principal ?? ''), currentOutstanding: String(d.currentOutstanding ?? ''),
      interestRate: d.interestRate ? String(d.interestRate) : '', emiAmount: d.emiAmount ? String(d.emiAmount) : '',
      emiDate: d.emiDate ? String(d.emiDate) : '', startDate: day(d.startDate), endDate: day(d.endDate), notes: d.notes || '',
    })
    setEditId(d.id)
    setAddOpen(true)
    document.querySelector('.screen')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSaveDebt = async () => {
    if (!form.name || !form.principal) { showNotification('Name and principal amount required', 'error'); return }
    const principal = parseFloat(form.principal)
    const outstanding = form.currentOutstanding === '' ? principal : parseFloat(form.currentOutstanding)
    if (!(principal > 0) || !(outstanding >= 0)) { showNotification('Enter valid amounts', 'error'); return }
    const fields = {
      name: form.name, type: form.type, lender: form.lender, principal, currentOutstanding: outstanding,
      interestRate: parseFloat(form.interestRate || 0), emiAmount: parseFloat(form.emiAmount || 0), emiDate: parseInt(form.emiDate || 0),
      startDate: form.startDate ? new Date(form.startDate) : new Date(), endDate: form.endDate ? new Date(form.endDate) : null, notes: form.notes,
    }
    if (editId) {
      await db.debts.update(editId, fields)
      showNotification('Debt updated', 'success')
    } else {
      // Anything already paid off before you started tracking counts as principal paid.
      await db.debts.add({ ...fields, totalPaid: Math.max(0, principal - outstanding), totalInterestPaid: 0, status: 'active' })
      showNotification('Debt added!', 'success')
    }
    closeForm()
  }

  const handleDeleteDebt = async d => {
    if (!window.confirm(`Delete "${d.name}" and its payment history? This cannot be undone.`)) return
    await db.debtRepayments.where('debtId').equals(d.id).delete()
    await db.debts.delete(d.id)
    showNotification('Debt deleted', 'success')
  }

  const handleMatchSMS = () => {
    if (!smsText.trim()) return
    const result = parseSMS(smsText)
    if (result && result.type === 'emi') { setParsed(result) }
    else { showNotification('No EMI detected in this SMS', 'error') }
  }

  const handleLinkRepayment = async (debtId) => {
    if (!parsed) return
    await db.debtRepayments.add({
      debtId, date: new Date(), amount: parsed.amount || 0,
      principal: parsed.amount || 0, interest: 0, source: 'sms', rawSMS: parsed.rawText, notes: '',
    })
    const debt = await db.debts.get(debtId)
    if (debt) await db.debts.update(debtId, { currentOutstanding: Math.max(0, debt.currentOutstanding - (parsed.amount || 0)), totalPaid: (debt.totalPaid || 0) + (parsed.amount || 0) })
    setParsed(null); setSmsText(''); setMatchSMSOpen(false)
    showNotification(`Repayment of ${formatINR(parsed.amount)} linked!`, 'success')
  }

  const handleSaveRepay = async () => {
    try {
      await addManualRepayment(repayFor, repayForm)
      showNotification(`Repayment of ${formatINR(repayForm.amount)} recorded`, 'success')
      setRepayFor(null); setRepayForm(EMPTY_REPAY)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const handleUndo = async (id) => {
    await undoRepayment(id)
    showNotification('Repayment removed and principal restored', 'success')
  }

  const handleExport = async () => {
    try { showNotification(`Saved ${await exportDebtsToFile()}`, 'success') }
    catch (e) { showNotification('Export failed', 'error') }
  }

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(await buildDebtBackup()); showNotification('Backup copied to clipboard', 'success') }
    catch (e) { showNotification('Could not copy — use Export file', 'error') }
  }

  const runImport = async (text) => {
    try {
      const { addedDebts, addedRepayments } = await importDebts(text)
      showNotification(`Imported ${addedDebts} debt(s), ${addedRepayments} repayment(s)`, 'success')
      setImportText(''); setImportOpen(false)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await runImport(await file.text())
  }

  const handleMarkClosed = async (id) => {
    await db.debts.update(id, { status: 'closed' })
    showNotification('Debt marked as closed!', 'success')
  }

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
        <>

      <div style={{ padding: '10px 16px 0' }}>
        {/* Header Telemetry */}
        <Card style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <LabelCaps>Total Repayment Telemetry · {active.length} Active</LabelCaps>
            <Badge variant="indigo">HYBRID</Badge>
          </div>
          <MonoLg style={{ marginBottom: 8 }}>{formatINR(totalOutstanding)}</MonoLg>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--txt2)' }}>EMI Outflow</div>
              <div className="mono-md" style={{ color: 'var(--amber)' }}>{formatINR(totalEMI)}/mo</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Next Repayment</div>
              <div className="mono-md" style={{ color: 'var(--red)', fontSize: 13 }}>
                {active.find(d => d.emiAmount > 0)?.name?.split(' ')[0]} · {formatINR(active.find(d => d.emiAmount > 0)?.emiAmount || 0)}
              </div>
            </div>
          </div>
          <Divider />
          <ProgressBar pct={pctCleared} variant="gradient" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, fontSize: 10, color: 'var(--txt2)' }}>
            <span style={{ color: 'var(--mint)' }}>{pctCleared}% Principal Cleared</span>
          </div>
        </Card>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <button className="btn-primary" style={{ height: 40, fontSize: 12 }} onClick={() => (addOpen && !editId ? closeForm() : (setEditId(null), setForm(EMPTY_DEBT), setAddOpen(true)))}>+ Add New Debt</button>
          <button className="btn-secondary" style={{ height: 40, fontSize: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => setMatchSMSOpen(!matchSMSOpen)}>📲 Match SMS Repay</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <button className="btn-ghost" style={{ height: 36 }} onClick={handleExport}>⬇ Export</button>
          <button className="btn-ghost" style={{ height: 36 }} onClick={() => setImportOpen(!importOpen)}>⬆ Import</button>
        </div>

        {importOpen && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 6 }}>Import debts</LabelCaps>
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>
              Choose a FinPing debt backup (.json), or paste its contents. Debts and repayments already here are skipped.
            </div>
            <input type="file" accept="application/json,.json" onChange={handleImportFile} style={{ fontSize: 12, marginBottom: 8, width: '100%' }} />
            <textarea className="input" style={{ height: 80, marginBottom: 8, fontSize: 11 }} placeholder="…or paste backup JSON here" value={importText} onChange={e => setImportText(e.target.value)} />
            <div style={{ display: 'flex', gap: 6 }}>
              <BtnPrimary onClick={() => runImport(importText)} style={{ flex: 1, height: 36, fontSize: 12 }}>Import pasted JSON</BtnPrimary>
              <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={handleCopy}>Copy backup</button>
            </div>
          </Card>
        )}

        {/* Add Debt Form */}
        {addOpen && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 8 }}>{editId ? 'Edit debt' : 'Add New Debt'}</LabelCaps>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" placeholder="Debt name (e.g. HDFC Home Loan)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {DEBT_TYPES.map(([id, label, icon]) => <option key={id} value={id}>{icon} {label}</option>)}
              </select>
              <input className="input" placeholder="Lender name" value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="input" type="number" placeholder="Principal (₹)" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
                <input className="input" type="number" placeholder="Outstanding (₹)" value={form.currentOutstanding} onChange={e => setForm({ ...form, currentOutstanding: e.target.value })} />
                <input className="input" type="number" placeholder="Interest rate %" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} />
                <input className="input" type="number" placeholder="EMI amount (₹)" value={form.emiAmount} onChange={e => setForm({ ...form, emiAmount: e.target.value })} />
              </div>
              <input className="input" type="number" placeholder="EMI date (day of month, e.g. 5)" value={form.emiDate} onChange={e => setForm({ ...form, emiDate: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><LabelCaps style={{ marginBottom: 4 }}>Start date</LabelCaps><input className="input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
                <div><LabelCaps style={{ marginBottom: 4 }}>End date</LabelCaps><input className="input" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
              </div>
              {Number(form.principal) > 0 && form.currentOutstanding !== '' && (
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>
                  Principal paid so far: <b style={{ color: 'var(--mint-dim)' }}>{formatINR(Math.max(0, Number(form.principal) - Number(form.currentOutstanding)))}</b> ({Math.max(0, Math.min(100, Math.round((1 - Number(form.currentOutstanding) / Number(form.principal)) * 100)))}%)
                </div>
              )}
              <input className="input" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <BtnPrimary onClick={handleSaveDebt} style={{ flex: 1, height: 36, fontSize: 12 }}>{editId ? 'Save changes' : 'Save Debt'}</BtnPrimary>
                <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={closeForm}>Cancel</button>
              </div>
            </div>
          </Card>
        )}

        {/* SMS Match */}
        {matchSMSOpen && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 6 }}>Match SMS to Debt</LabelCaps>
            <textarea className="input" style={{ height: 70, marginBottom: 8, fontSize: 12 }}
              placeholder="Paste an EMI deduction SMS..." value={smsText}
              onChange={e => { setSmsText(e.target.value); setParsed(null) }} />
            <button className="btn-primary" style={{ width: '100%', height: 36, fontSize: 12, marginBottom: 8 }} onClick={handleMatchSMS}>Parse EMI SMS</button>
            {parsed && (
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--mint)' }}>EMI Detected: {formatINR(parsed.amount)}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>Link to which debt?</div>
                {active.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12 }}>{d.name}</div>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleLinkRepayment(d.id)}>Link</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Active Liabilities */}
        <SectionHdr title="Active Liabilities" right={<Badge variant="indigo">HYBRID TELEMETRY</Badge>} />

        {active.map(d => {
          // Principal paid = what has come off the original principal, however it got there.
          const principalPaid = Math.max(0, (d.principal || 0) - (d.currentOutstanding || 0))
          const paidPct = d.principal > 0 ? Math.min(100, Math.round(principalPaid / d.principal * 100)) : 0
          const isExpanded = expandedId === d.id
          return (
            <div key={d.id} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : d.id)}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--indigo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {DEBT_ICONS[d.type] || '💳'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div>
                    {d.accountRef && <span className="mono-xs" style={{ color: 'var(--txt2)' }}>{d.accountRef}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                    <Badge variant="grey" style={{ fontSize: 9 }}>{DEBT_LABELS[d.type] || d.type}</Badge>
                    {d.emiAmount > 0 && <Badge variant="mint" style={{ fontSize: 9 }}>SMS Auto-Tracked</Badge>}
                    {d.interestRate > 0 && <span className="mono-xs" style={{ color: 'var(--txt2)' }}>{d.interestRate}% p.a.</span>}
                    {d.interestRate === 0 && <span style={{ fontSize: 10, color: 'var(--txt2)' }}>0% Interest</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono-md">{formatINR(d.currentOutstanding)}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt2)' }}>of {formatINR(d.principal)}</div>
                </div>
              </div>

              <LabelCaps style={{ marginBottom: 4 }}>Principal Cleared</LabelCaps>
              <ProgressBar pct={paidPct} variant="mint" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
                <span style={{ color: 'var(--mint)' }}>{paidPct}% paid off · {formatINR(principalPaid)} of principal</span>
                {d.emiDate > 0 && <span style={{ color: 'var(--txt2)' }}>EMI due {d.emiDate}th</span>}
              </div>

              {isExpanded && (
                <>
                  <Divider />
                  {d.emiAmount > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>
                      EMI: <strong style={{ color: 'var(--txt)' }}>{formatINR(d.emiAmount)}</strong> due {d.emiDate}th of every month
                    </div>
                  )}
                  {d.notes && <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>{d.notes}</div>}
                  {repayFor === d.id && (
                    <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                      <LabelCaps style={{ marginBottom: 6 }}>Add payment · outstanding {formatINR(d.currentOutstanding)}</LabelCaps>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input className="input" type="number" inputMode="decimal" placeholder="Amount paid (₹)" value={repayForm.amount} onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })} />
                        <input className="input" type="date" value={repayForm.date} onChange={e => setRepayForm({ ...repayForm, date: e.target.value })} />
                        <input className="input" type="number" inputMode="decimal" placeholder="Principal (₹) — blank = all" value={repayForm.principal} onChange={e => setRepayForm({ ...repayForm, principal: e.target.value })} />
                        <input className="input" type="number" inputMode="decimal" placeholder="Interest (₹)" value={repayForm.interest} onChange={e => setRepayForm({ ...repayForm, interest: e.target.value })} />
                      </div>
                      <input className="input" placeholder="Note (optional)" style={{ marginBottom: 8 }} value={repayForm.notes} onChange={e => setRepayForm({ ...repayForm, notes: e.target.value })} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <BtnPrimary onClick={handleSaveRepay} style={{ flex: 1, height: 36, fontSize: 12 }}>Save payment</BtnPrimary>
                        <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => setRepayFor(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button className="btn-secondary" style={{ height: 32, fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setRepayFor(repayFor === d.id ? null : d.id); setRepayForm({ ...EMPTY_REPAY, amount: d.emiAmount > 0 ? String(d.emiAmount) : '' }) }}>＋ Add Payment</button>
                    <button className="btn-secondary" style={{ height: 32, fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setSmsText(''); setMatchSMSOpen(true) }}>📲 Link SMS Debit</button>
                    <button className="btn-secondary" style={{ height: 32, fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => openEdit(d)}>✎ Edit debt</button>
                    <button className="btn-ghost" style={{ height: 32, fontSize: 11 }} onClick={() => handleMarkClosed(d.id)}>Mark as Closed</button>
                    <button className="btn-ghost" style={{ height: 32, fontSize: 11, gridColumn: '1 / -1', color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={() => handleDeleteDebt(d)}>Delete debt</button>
                  </div>
                </>
              )}
            </div>
          )
        })}

        {/* Repayment Ledger */}
        <SectionHdr title="Repayment Ledger" right={<span style={{ fontSize: 11, color: 'var(--indigo-dim)', cursor: 'pointer' }}>View All ({(repayments || []).length})</span>} />
        <Card style={{ padding: '10px 14px', marginBottom: 10 }}>
          {(repayments || []).slice(0, 5).map(r => {
            const debt = (debts || []).find(d => d.id === r.debtId)
            return (
              <div key={r.id} className="txn-row">
                <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${r.source === 'sms' ? 'var(--mint)' : 'var(--txt3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: r.source === 'sms' ? 'var(--mint)' : 'var(--txt3)', flexShrink: 0 }}>
                  {r.source === 'sms' ? '✓' : '✎'}
                </div>
                <div className="txn-mid">
                  <div className="txn-merchant">{debt?.name || 'Unknown Debt'} payment</div>
                  <div className="txn-meta">{formatDate(r.date)} · <span style={{ color: r.source === 'sms' ? 'var(--mint)' : 'var(--txt2)' }}>{r.source === 'sms' ? 'Verified by SMS' : 'Manual Entry'}</span></div>
                </div>
                <div className="txn-amt">
                  <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>-{formatINR(r.amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{r.interest > 0 ? `Principal ${formatINR(r.principal)}` : r.source === 'sms' ? 'AUTO-DEBIT' : 'MANUAL'}</div>
                </div>
                {r.source !== 'sms' && (
                  <div onClick={() => handleUndo(r.id)} title="Remove and restore principal" style={{ marginLeft: 8, cursor: 'pointer', color: 'var(--txt3)', fontSize: 14, padding: 4 }}>✕</div>
                )}
              </div>
            )
          })}
          {!(repayments || []).length && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--txt2)', fontSize: 12 }}>No repayments recorded yet. Paste an EMI SMS above to start tracking.</div>
          )}
        </Card>

      </div>
        </>
      )}
    </div>
  )
}
