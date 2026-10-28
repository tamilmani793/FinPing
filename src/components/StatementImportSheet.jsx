import { useState } from 'react'
import { format } from 'date-fns'
import { useStore } from '../store'
import { BtnPrimary, formatINR } from './UI'
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
  const [drop, setDrop] = useState({})
  const [setBal, setSetBal] = useState(true)

  const read = async file => {
    setBusy(true)
    try {
      const rows = await readStatement({ file, text })
      const p = await planStatement(account, rows)
      setPlan(p)
      setDrop(Object.fromEntries(p.extras.map(x => [x.txn.id, !x.keep])))
    } catch (e) { showNotification(e.message || 'Could not read that statement', 'error') }
    setBusy(false)
  }

  const run = async () => {
    setBusy(true)
    try {
      const removeIds = plan.extras.filter(x => drop[x.txn.id]).map(x => x.txn.id)
      const r = await applyStatement(account, plan, { removeIds, setBalance: setBal })
      showNotification(`${r.corrected} corrected · ${r.added} added · ${r.removed} removed`, 'success')
      onClose()
    } catch (e) { showNotification(e.message || 'Import failed', 'error'); setBusy(false) }
  }

  const removing = plan ? plan.extras.filter(x => drop[x.txn.id]).length : 0
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Import bank statement</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 12 }}>{account.name} · your statement is treated as the truth. The file is read on this phone and never uploaded.</div>

        {!plan && (
          <>
            <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 42, marginBottom: 10, cursor: 'pointer' }}>
              Choose CSV or Excel (.xlsx) file
              <input type="file" accept=".csv,.xlsx,.txt,.tsv,text/csv" style={{ display: 'none' }} disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) read(f) }} />
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
              <div><b style={{ color: 'var(--mint-dim)' }}>{plan.matched.length}</b> saved entries matched · corrected with the bank's details</div>
              <div><b style={{ color: 'var(--gold-dim)' }}>{plan.toAdd.length}</b> on the statement but missing · will be added</div>
              <div><b style={{ color: 'var(--red-dim)' }}>{plan.extras.length}</b> saved but not on the statement{plan.extras.length ? ' · choose below' : ''}</div>
            </div>

            {plan.extras.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="label-caps" style={{ marginBottom: 6 }}>Not on your statement</div>
                {plan.extras.map(({ txn, keep, duplicateOf }) => (
                  <label key={txn.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border2)', fontSize: 12 }}>
                    <input type="checkbox" checked={!!drop[txn.id]} onChange={e => setDrop({ ...drop, [txn.id]: e.target.checked })} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.merchant}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{fmtD(txn.date)}{duplicateOf ? ' · looks like a duplicate' : ''}{keep ? ' · typed by you / loan entry, kept' : ''}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: txn.type === 'debit' ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{txn.type === 'debit' ? '−' : '+'}{formatINR(txn.amount)}</div>
                  </label>
                ))}
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 4 }}>Ticked entries are removed. Untick any that you know are real.</div>
              </div>
            )}

            {plan.closingBalance != null && (
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
