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
      const r = await applyStatement(account, plan, { removeIds, setBalance: setBal })
      showNotification(`${r.corrected} corrected · ${r.added} added · ${r.removed} removed`, 'success')
      onClose()
    } catch (e) { showNotification(e.message || 'Import failed', 'error'); setBusy(false) }
  }

  const removing = plan ? plan.extras.length : 0
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
              <div><b style={{ color: 'var(--mint-dim)' }}>{plan.matched.length}</b> saved entries matched · corrected with the bank's details</div>
              <div><b style={{ color: 'var(--gold-dim)' }}>{plan.toAdd.length}</b> on the statement but missing · will be added</div>
              {plan.skipped?.length > 0 && <div><b style={{ color: 'var(--txt)' }}>{plan.skipped.length}</b> line{plan.skipped.length === 1 ? '' : 's'} you deleted earlier stay deleted</div>}
              <div><b style={{ color: 'var(--red-dim)' }}>{plan.extras.length}</b> saved for these dates but not on the statement · will be removed</div>
              <div style={{ color: 'var(--txt2)', fontSize: 11 }}>Entries on other dates are left as they are.</div>
            </div>

            {plan.extras.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="label-caps" style={{ marginBottom: 6 }}>Removed · not on your statement</div>
                {plan.extras.map(({ txn, keep, duplicateOf }) => (
                  <div key={txn.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border2)', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.merchant}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{fmtD(txn.date)}{duplicateOf ? ' · looks like a duplicate' : ''}{keep ? ' · typed by you / loan entry' : ''}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: txn.type === 'debit' ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{txn.type === 'debit' ? '−' : '+'}{formatINR(txn.amount)}</div>
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 4 }}>The statement replaces everything saved for its dates, so the totals match the bank's. Other dates are not touched.</div>
              </div>
            )}

            {plan.closingBalance != null && account.cardType === 'account' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 12 }}>
                <input type="checkbox" checked={setBal} onChange={e => setSetBal(e.target.checked)} />
                Set the account balance to the statement's {formatINR(plan.closingBalance)}
              </label>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPlan(null)}>Back</button>
              <BtnPrimary onClick={run} style={{ flex: 2 }}>{busy ? 'Importing…' : `Import · remove ${removing}`}</BtnPrimary>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
