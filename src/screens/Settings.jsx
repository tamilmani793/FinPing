import { useState } from 'react'
import { ChevronRight, Landmark, TrendingUp, User, ShieldCheck, Smartphone } from 'lucide-react'
import { TopBar, BtnPrimary } from '../components/UI'
import { useStore } from '../store'
import { isNative } from '../lib/nativeSms'
import { getUserName, setUserName } from '../lib/profile'
import { exportBackup, copyBackup, inspectBackup, restoreBackup, lastBackupAt } from '../lib/backup'
import { format } from 'date-fns'
import { relinkTransactions } from '../lib/relink'
import { removeDuplicateTransactions } from '../lib/dedupeCleanup'
import { importDebts } from '../lib/debtBackup'

function Row({ Icon, title, sub, onClick, right }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default' }}>
      <div className="stat-icon" style={{ width: 34, height: 34, background: 'var(--gold-bg)', color: 'var(--gold-dim)' }}><Icon size={18} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right || (onClick && <ChevronRight size={18} color="var(--txt3)" />)}
    </div>
  )
}

export default function Settings() {
  const { setActiveTab, showNotification } = useStore()
  const [name, setName] = useState(getUserName())
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(lastBackupAt())

  const doBackup = async () => {
    setBusy(true)
    try {
      const how = await exportBackup()
      setLast(lastBackupAt())
      showNotification(how === 'shared' ? 'Choose where to keep your backup' : 'Backup file downloaded', 'success')
    } catch (e) {
      // Closing the share sheet without choosing is not an error.
      if (!/cancel|dismiss/i.test(String(e?.message))) showNotification('Backup failed: ' + (e?.message || 'unknown error'), 'error')
    } finally { setBusy(false) }
  }

  const doCopy = async () => {
    try { await copyBackup(); setLast(lastBackupAt()); showNotification('Backup copied to clipboard', 'success') }
    catch (e) { showNotification('Could not copy — use Back up now', 'error') }
  }

  const doRestore = async (text) => {
    try {
      // An older debts-only file (from the Debt screen's former Export) is merged into what is already here.
      let raw = null
      try { raw = JSON.parse(text) } catch (e) { /* inspectBackup reports invalid files */ }
      if (raw && raw.kind === 'debts') {
        if (!window.confirm(`Add ${raw.debts?.length || 0} debts and ${raw.debtRepayments?.length || 0} payments from this older debts backup?\n\nWhat you already have is kept; duplicates are skipped.`)) return
        const { addedDebts, addedRepayments } = await importDebts(text)
        showNotification(`Added ${addedDebts} debt(s) and ${addedRepayments} payment(s)`, 'success')
        return
      }
      const { counts, exportedAt } = inspectBackup(text)
      const n = k => counts[k] || 0
      const msg = `Restore backup from ${exportedAt ? format(new Date(exportedAt), 'd MMM yyyy, h:mm a') : 'unknown date'}?

` +
        `${n('transactions')} transactions, ${n('creditCards')} cards, ${n('debts')} debts, ${n('investments')} investments.

` +
        'This REPLACES everything currently in the app.'
      if (!window.confirm(msg)) return
      setBusy(true)
      await restoreBackup(text)
      showNotification('Backup restored', 'success')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) { showNotification(e.message, 'error') }
    finally { setBusy(false) }
  }

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await doRestore(await file.text())
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 100 }}>
      <TopBar title="Settings" />
      <div style={{ padding: '0 16px' }}>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="label-caps" style={{ marginBottom: 6 }}>Your name</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Shown in the Home greeting" />
            <button className="btn-primary" style={{ height: 46 }} onClick={() => { setUserName(name.trim()); showNotification('Name saved') }}>Save</button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Backup &amp; restore</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '2px 0 10px' }}>
            Your data lives only on this phone, so uninstalling the app erases it. Back up to a file, keep it in Drive or send it to yourself, then restore it after reinstalling.
          </div>
          <div style={{ fontSize: 12, marginBottom: 10 }}>
            Last backup: <b>{last ? format(last, 'd MMM yyyy, h:mm a') : 'never'}</b>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <BtnPrimary onClick={doBackup} style={{ flex: 1 }}>{busy ? 'Working…' : '⬇ Back up now'}</BtnPrimary>
            <button className="btn-ghost" style={{ height: 46 }} onClick={doCopy}>Copy</button>
          </div>
          <div className="label-caps" style={{ marginBottom: 6 }}>Restore</div>
          <input type="file" accept="application/json,.json" onChange={onPickFile} style={{ fontSize: 12, width: '100%', marginBottom: 8 }} />
          <textarea className="input" style={{ height: 70, fontSize: 11, marginBottom: 8 }} placeholder="…or paste backup contents here" value={pasted} onChange={e => setPasted(e.target.value)} />
          <button className="btn-secondary" style={{ width: '100%', height: 38 }} disabled={!pasted.trim() || busy} onClick={() => doRestore(pasted)}>Restore pasted backup</button>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Link transactions</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '2px 0 10px' }}>
            If a spend shows in History but not on its card or bank account page, this ties every unlinked SMS transaction to the right card or account. Balances are not changed.
          </div>
          <button className="btn-secondary" style={{ width: '100%', height: 40 }} onClick={async () => {
            try { const n = await relinkTransactions(); showNotification(n ? `${n} transactions linked` : 'Nothing to link — all transactions are already tied to a card or account', 'success') }
            catch (e) { showNotification('Could not link: ' + e.message, 'error') }
          }}>Link unlinked transactions</button>

          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 16 }}>Duplicates and non-payments</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '2px 0 10px' }}>
            Removes entries that were never real payments (OTPs, failed or declined payments, reminders, "bill generated" notices), merges one payment that several SMS reported, and turns "card bill paid" messages into card payments. Genuine repeats, like several ATM withdrawals of the same amount, are kept. New SMS are checked the same way automatically.
          </div>
          <button className="btn-secondary" style={{ width: '100%', height: 40 }} onClick={async () => {
            try {
              const r = await removeDuplicateTransactions()
              const parts = [r.removed && `${r.removed} not-a-payment removed`, r.merged && `${r.merged} duplicate${r.merged === 1 ? '' : 's'} merged`, r.converted && `${r.converted} card payment${r.converted === 1 ? '' : 's'} fixed`, r.transfers && `${r.transfers} own-account transfer${r.transfers === 1 ? '' : 's'} marked`].filter(Boolean)
              showNotification(parts.length ? parts.join(' · ') : 'Nothing to clean up', 'success')
            } catch (e) { showNotification('Could not clean up: ' + e.message, 'error') }
          }}>Clean up duplicates</button>
        </div>

        <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          <Row Icon={Landmark} title="Debt & Loans" sub="EMIs, loans and repayments" onClick={() => setActiveTab('debt')} />
          <Row Icon={TrendingUp} title="Wealth" sub="Investments, SIPs and net worth" onClick={() => setActiveTab('wealth')} />
        </div>

        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <Row Icon={Smartphone} title="SMS tracking" sub={isNative() ? 'Reads bank SMS on this phone' : 'Available in the Android app; paste SMS in the browser'} right={<span />} />
          <Row Icon={ShieldCheck} title="Privacy" sub="All data stays on your device" right={<span />} />
          <Row Icon={User} title="FinPing" sub="Personal finance tracker" right={<span />} />
        </div>
      </div>
    </div>
  )
}
