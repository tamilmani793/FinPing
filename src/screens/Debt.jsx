import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, TxnRow, Divider, LabelCaps, MonoLg, MonoMd, BtnPrimary, BtnSecondary, formatINR, formatDate } from '../components/UI'
import { useStore } from '../store'
import { parseSMS } from '../lib/smsParser'

const DEBT_ICONS = { HomeLoan: '🏠', CarLoan: '🚗', PersonalLoan: '💼', FriendBorrowed: '🤝', FriendLent: '🤲', CreditLine: '💳' }

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
  const { showNotification } = useStore()

  const [form, setForm] = useState({
    name: '', type: 'PersonalLoan', lender: '', principal: '',
    currentOutstanding: '', interestRate: '', emiAmount: '', emiDate: '',
    notes: ''
  })

  const debts = useLiveQuery(() => db.debts.toArray())
  const repayments = useLiveQuery(() => db.debtRepayments.orderBy('date').reverse().limit(20).toArray())

  const active = (debts || []).filter(d => d.status === 'active')
  const totalOutstanding = active.reduce((s, d) => s + d.currentOutstanding, 0)
  const totalPrincipal = active.reduce((s, d) => s + (d.principal || 0), 0)
  const pctCleared = totalPrincipal > 0 ? Math.round((1 - totalOutstanding / totalPrincipal) * 100) : 0
  const totalEMI = active.filter(d => d.emiAmount > 0).reduce((s, d) => s + d.emiAmount, 0)

  const handleAddDebt = async () => {
    if (!form.name || !form.principal) { showNotification('Name and principal amount required', 'error'); return }
    await db.debts.add({
      name: form.name, type: form.type, lender: form.lender,
      principal: parseFloat(form.principal), currentOutstanding: parseFloat(form.currentOutstanding || form.principal),
      interestRate: parseFloat(form.interestRate || 0), emiAmount: parseFloat(form.emiAmount || 0),
      emiDate: parseInt(form.emiDate || 0), startDate: new Date(),
      totalPaid: 0, totalInterestPaid: 0, status: 'active', notes: form.notes,
    })
    setForm({ name: '', type: 'PersonalLoan', lender: '', principal: '', currentOutstanding: '', interestRate: '', emiAmount: '', emiDate: '', notes: '' })
    setAddOpen(false)
    showNotification('Debt added!', 'success')
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

  const handleMarkClosed = async (id) => {
    await db.debts.update(id, { status: 'closed' })
    showNotification('Debt marked as closed!', 'success')
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      <TopBar sub="Debt" />

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
          <button className="btn-primary" style={{ height: 40, fontSize: 12 }} onClick={() => setAddOpen(!addOpen)}>+ Add New Debt</button>
          <button className="btn-secondary" style={{ height: 40, fontSize: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => setMatchSMSOpen(!matchSMSOpen)}>📲 Match SMS Repay</button>
        </div>

        {/* Add Debt Form */}
        {addOpen && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 8 }}>Add New Debt</LabelCaps>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" placeholder="Debt name (e.g. HDFC Home Loan)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {Object.keys(DEBT_ICONS).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input" placeholder="Lender name" value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="input" type="number" placeholder="Principal (₹)" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
                <input className="input" type="number" placeholder="Outstanding (₹)" value={form.currentOutstanding} onChange={e => setForm({ ...form, currentOutstanding: e.target.value })} />
                <input className="input" type="number" placeholder="Interest rate %" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} />
                <input className="input" type="number" placeholder="EMI amount (₹)" value={form.emiAmount} onChange={e => setForm({ ...form, emiAmount: e.target.value })} />
              </div>
              <input className="input" type="number" placeholder="EMI date (day of month, e.g. 5)" value={form.emiDate} onChange={e => setForm({ ...form, emiDate: e.target.value })} />
              <input className="input" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <BtnPrimary onClick={handleAddDebt} style={{ flex: 1, height: 36, fontSize: 12 }}>Save Debt</BtnPrimary>
                <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => setAddOpen(false)}>Cancel</button>
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
          const paidPct = Math.round((d.totalPaid || 0) / d.principal * 100)
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
                <span style={{ color: 'var(--mint)' }}>{paidPct}% Paid off</span>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button className="btn-secondary" style={{ height: 32, fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => showNotification('Repayment form would open here')}>↺ Update Repay</button>
                    <button className="btn-secondary" style={{ height: 32, fontSize: 11, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setSmsText(''); setMatchSMSOpen(true) }}>📲 Link SMS Debit</button>
                    <button className="btn-ghost" style={{ height: 32, fontSize: 11, gridColumn: '1 / -1' }} onClick={() => handleMarkClosed(d.id)}>Mark as Closed</button>
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
                  <div className="txn-merchant">{debt?.name || 'Unknown Debt'} EMI</div>
                  <div className="txn-meta">{formatDate(r.date)} · <span style={{ color: r.source === 'sms' ? 'var(--mint)' : 'var(--txt2)' }}>{r.source === 'sms' ? 'Verified by SMS' : 'Manual Entry'}</span></div>
                </div>
                <div className="txn-amt">
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>-{formatINR(r.amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{r.source === 'sms' ? 'AUTO-DEBIT' : 'MANUAL'}</div>
                </div>
              </div>
            )
          })}
          {!(repayments || []).length && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--txt2)', fontSize: 12 }}>No repayments recorded yet. Paste an EMI SMS above to start tracking.</div>
          )}
        </Card>

      </div>
    </div>
  )
}
