import { useState } from 'react'
import { format } from 'date-fns'
import { useStore } from '../store'
import { BtnPrimary, formatINR } from './UI'
import { cardTitle } from '../lib/cardCatalog'
import { readStatement } from '../lib/statement'
import { planStatement, applyStatement } from '../lib/statementImport'

const fmtD = d => format(new Date(d), 'd MMM yyyy')

// Import a bank statement (CSV / Excel / pasted) for one account. The statement is treated as the truth:
// saved entries are corrected from it, missing ones added and SMS duplicates / echoes removed.
export default function StatementImportSheet({ account, onClose }) {
  const { showNotification } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState(null)
  const [setBal, setSetBal] = useState(true)
  const [updBill, setUpdBill] = useState(true)

  const [file, setFile] = useState(null)       // a chosen file waiting for its password
  const [needPw, setNeedPw] = useState(false)
  const [pw, setPw] = useState('')

  const read = async (f = file, password = pw) => {
    setBusy(true)
    try {
      const rows = await readStatement({ file: f, text, password })
      const p = await planStatement(account, rows)
      setPlan(p)
      setFile(null); setNeedPw(false); setPw('') // the password is not kept
    } catch (e) {
      if (e.needPassword) { setFile(f); setNeedPw(true); setPw(''); showNotification(e.message, e.wrong ? 'error' : undefined) }
      else showNotification(e.message || 'Could not read that statement', 'error')
    }
    setBusy(false)
  }

  const run = async () => {
    setBusy(true)
    try {
      // the statement replaces everything saved for its dates: whatever it does not show is removed
      const removeIds = plan.extras.map(x => x.txn.id)
      const r = await applyStatement(account, plan, { removeIds, setBalance: setBal, updateBill: updBill })
      showNotification(`${r.corrected} corrected · ${r.added} added · ${r.removed} removed`, 'success')
      onClose()
    } catch (e) { showNotification(e.message || 'Import failed', 'error'); setBusy(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Import bank statement</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 12 }}>{cardTitle(account, { last4: false })}{account.cardLast4 ? ` ••${account.cardLast4}` : ''} · your {account.cardType === 'account' ? 'statement' : 'card statement (spends are debits; payments and refunds are credits)'} is treated as the truth. The file is read on this phone and never uploaded.</div>

        {!plan && needPw && (
          <>
            <div style={{ fontSize: 12, marginBottom: 8 }}>🔒 <b>{file?.name}</b> is password-protected. The password is used only on this device to open the file and is forgotten right after.</div>
            <input className="input" type="password" autoFocus placeholder="PDF password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && pw) read() }} style={{ marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setNeedPw(false); setFile(null); setPw('') }}>Back</button>
              <BtnPrimary onClick={() => read()} style={{ flex: 2 }}>{busy ? 'Opening…' : 'Open'}</BtnPrimary>
            </div>
          </>
        )}

        {!plan && !needPw && (
          <>
            <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 42, marginBottom: 10, cursor: 'pointer' }}>
              Choose PDF, CSV or Excel file
              <input type="file" accept=".pdf,.csv,.xlsx,.xls,.txt,.tsv,application/pdf,text/csv,application/vnd.ms-excel" style={{ display: 'none' }} disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f, '') }} />
            </label>
            <div style={{ fontSize: 11, color: 'var(--txt2)', textAlign: 'center', margin: '6px 0' }}>or paste the rows (with the header line)</div>
            <textarea className="input" style={{ height: 120, fontSize: 11, marginBottom: 10 }} placeholder="Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance" value={text} onChange={e => setText(e.target.value)} />
            <BtnPrimary onClick={() => read(null)} style={{ width: '100%' }}>{busy ? 'Reading…' : 'Read statement'}</BtnPrimary>
          </>
        )}

        {plan && (
          <>
            <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '10px 12px', fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{fmtD(plan.from)} → {fmtD(plan.to)}</div>
              <div style={{ color: 'var(--txt2)', fontSize: 11.5, marginBottom: 6 }}>
                Read <b style={{ color: 'var(--txt)' }}>{plan.total}</b> lines{plan.unnamed > 0 ? `, ${plan.unnamed} without a readable name` : ', every one with a name'}. First lines:
                {plan.sample.map((r, i) => <div key={i} style={{ display: 'flex', gap: 8, marginTop: 2 }}><span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--txt)' }}>{fmtD(r.date)} · {r.merchant}</span><b style={{ color: r.type === 'debit' ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{r.type === 'debit' ? '−' : '+'}{formatINR(r.amount)}</b></div>)}
              </div>
              {plan.check && (
                <div style={{ margin: '4px 0 8px', padding: '6px 8px', borderRadius: 8, fontSize: 11.5, background: plan.check.ok ? 'var(--mint-bg)' : 'var(--red-bg)', color: plan.check.ok ? 'var(--mint-dim)' : 'var(--red-dim)' }}>
                  {plan.check.ok
                    ? <>✓ Every line was read: {plan.check.summary ? 'counts and totals agree with the statement’s own summary' : ''}{plan.check.summary && plan.check.balanceLines ? ' and ' : ''}{plan.check.balanceLines ? 'the running balance adds up on all ' + plan.check.balanceLines + ' lines' : ''}.</>
                    : <>⚠ This file was not read completely: {plan.check.problems.join('; ')}. Importing it will not match your bank.</>}
                </div>
              )}
              <div><b style={{ color: 'var(--mint-dim)' }}>{plan.matched.length}</b> saved entries matched · corrected with the bank's details</div>
              <div><b style={{ color: 'var(--gold-dim)' }}>{plan.toAdd.length}</b> on the statement but missing · will be added</div>
              {plan.skipped?.length > 0 && <div><b style={{ color: 'var(--txt)' }}>{plan.skipped.length}</b> line{plan.skipped.length === 1 ? '' : 's'} you deleted earlier stay deleted</div>}
              <div style={{ color: 'var(--txt2)', fontSize: 11 }}>Everything saved for these dates is replaced by the statement. Entries on other dates are left as they are.</div>
            </div>

            {plan.cardSummary && (!account.cardType || account.cardType === 'credit') && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, marginBottom: 12 }}>
                <input type="checkbox" checked={updBill} onChange={e => setUpdBill(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Update this card's bill from the statement: total due <b>{formatINR(plan.cardSummary.totalDue)}</b>{plan.cardSummary.minDue != null ? `, minimum ${formatINR(plan.cardSummary.minDue)}` : ''}{plan.cardSummary.dueDate ? `, due ${fmtD(plan.cardSummary.dueDate)}` : ''}, statement of {fmtD(plan.cardSummary.statementDate)}{plan.cardSummary.rewardPoints != null ? `, ${plan.cardSummary.rewardPoints} reward points` : ''}{plan.cardSummary.creditLimit ? `, limit ${formatINR(plan.cardSummary.creditLimit)} (available ${formatINR(plan.cardSummary.availableCredit)})` : ''}</span>
              </label>
            )}

            {plan.closingBalance != null && account.cardType === 'account' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 12 }}>
                <input type="checkbox" checked={setBal} onChange={e => setSetBal(e.target.checked)} />
                Set the account balance to the statement's {formatINR(plan.closingBalance)}
              </label>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPlan(null)}>Back</button>
              <BtnPrimary onClick={run} style={{ flex: 2 }}>{busy ? 'Importing…' : 'Import'}</BtnPrimary>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
