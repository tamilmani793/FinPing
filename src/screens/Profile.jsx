import { useRef, useState } from 'react'
import { ChevronRight, Landmark, TrendingUp, ShieldCheck, Smartphone, Camera, Trash2, Download, Upload, Check, Pencil, X, SlidersHorizontal, Info, Briefcase, Link2, Eraser } from 'lucide-react'
import { format } from 'date-fns'
import { TopBar, BtnPrimary, Avatar } from '../components/UI'
import { useStore } from '../store'
import { isNative } from '../lib/nativeSms'
import { useProfile, setUserName, setProfilePhoto, resizePhoto } from '../lib/profile'
import { ThemeStrip } from '../components/Appearance'
import { exportBackup, inspectBackup, restoreBackup, lastBackupAt } from '../lib/backup'
import { relinkTransactions } from '../lib/relink'
import { removeDuplicateTransactions, describeCleanup } from '../lib/dedupeCleanup'
import { importDebts } from '../lib/debtBackup'
import { askConfirm } from '../lib/confirm'

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

// a titled group on the page
function Group({ title, sub, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="label-caps" style={{ margin: '0 4px 8px' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '-4px 4px 8px' }}>{sub}</div>}
      {children}
    </div>
  )
}

export default function Profile() {
  const { setActiveTab, showNotification } = useStore()
  const { name: savedName, photo } = useProfile()
  const [name, setName] = useState(savedName)
  const [editingName, setEditingName] = useState(false)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(lastBackupAt())
  const photoInput = useRef(null)
  const restoreInput = useRef(null)

  const saveName = () => { setUserName(name.trim()); setEditingName(false); showNotification('Name saved') }
  const cancelName = () => { setName(savedName); setEditingName(false) }

  const onPhoto = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try { setProfilePhoto(await resizePhoto(file)); showNotification('Profile picture updated') }
    catch (err) { showNotification(err.message, 'error') }
  }

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

  const doRestore = async text => {
    try {
      // An older debts-only file (from the Debt screen's former Export) is merged into what is already here.
      let raw = null
      try { raw = JSON.parse(text) } catch (e) { /* inspectBackup reports invalid files */ }
      if (raw && raw.kind === 'debts') {
        if (!(await askConfirm({ title: 'Add debts from this file?', danger: false, confirmLabel: 'Add', message: `Add ${raw.debts?.length || 0} debts and ${raw.debtRepayments?.length || 0} payments from this older debts backup?\n\nWhat you already have is kept; duplicates are skipped.` }))) return
        const { addedDebts, addedRepayments } = await importDebts(text)
        showNotification(`Added ${addedDebts} debt(s) and ${addedRepayments} payment(s)`, 'success')
        return
      }
      const { counts, exportedAt, summary } = inspectBackup(text)
      const n = k => counts[k] || 0
      const msg = `Restore backup from ${exportedAt ? format(new Date(exportedAt), 'd MMM yyyy, h:mm a') : 'unknown date'}?\n\n` +
        `${n('transactions')} transactions, ${n('creditCards')} cards, ${n('debts')} debts, ${n('investments')} investments.\n` +
        (summary.dropdowns.length ? `Dropdown options you edited: ${summary.dropdowns.map(d => `${d.title} (${d.count})`).join(', ')}${summary.renamedCategories ? `; ${summary.renamedCategories} category rename${summary.renamedCategories === 1 ? '' : 's'}` : ''}.\n` : 'Dropdown options: the built-in lists.\n') +
        `Profile: ${summary.name || 'no name'}, ${summary.hasPhoto ? 'with picture' : 'no picture'}${summary.palette ? `, ${summary.palette} theme` : ''}${summary.mode ? `, ${summary.mode} mode` : ''}.\n\n` +
        'This REPLACES everything currently in the app.'
      if (!(await askConfirm({ title: 'Replace everything with this backup?', message: msg, confirmLabel: 'Restore' }))) return
      setBusy(true)
      await restoreBackup(text)
      showNotification('Backup restored', 'success')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) { showNotification(e.message, 'error') }
    finally { setBusy(false) }
  }

  // both tidy-ups first say exactly what they would change, and only do it after you agree
  const line = t => `• ${t.date ? format(new Date(t.date), 'd MMM yy') : ''} · ${t.merchant} · ₹${Number(t.amount || 0).toLocaleString('en-IN')}`
  const list = (rows, fmt, max = 8) => rows.slice(0, max).map(fmt).join('\n') + (rows.length > max ? `
…and ${rows.length - max} more` : '')

  const doRelink = async () => {
    try {
      const plan = await relinkTransactions({ dryRun: true })
      if (!plan.count) { showNotification('Nothing to link: all transactions are already tied to a card or account', 'success'); return }
      const made = [...new Set(plan.items.filter(i => i.newCard).map(i => i.target))]
      const msg = `${plan.count} transaction${plan.count === 1 ? '' : 's'} will be tied to a card or account:

` + list(plan.items, i => `${line(i)} → ${i.target}${i.newCard ? ' (new)' : ''}`) +
        (made.length ? `

New card or account to be created: ${made.join(', ')}.` : '') + '\n\nBalances are not changed.'
      if (!(await askConfirm({ title: 'Link these transactions?', message: msg, confirmLabel: 'Link', danger: false }))) return
      const n = await relinkTransactions()
      showNotification(`${n} transaction${n === 1 ? '' : 's'} linked`, 'success')
    } catch (e) { showNotification('Could not link: ' + e.message, 'error') }
  }
  const doCleanup = async () => {
    try {
      const p = await describeCleanup()
      if (!p.total) { showNotification('Nothing to clean up', 'success'); return }
      const parts = []
      if (p.removed.length) parts.push(`REMOVED, never a payment (${p.removed.length}):
` + list(p.removed, r => `${line(r)}${r.why ? ' · "' + r.why + '…"' : ''}`))
      if (p.converted.length) parts.push(`CARD BILL PAYMENTS, turned into a payment (${p.converted.length}):
` + list(p.converted, r => `${line(r)} → ${r.card}`))
      if (p.merged.length) parts.push(`DUPLICATES, merged into the first copy (${p.merged.length}):
` + list(p.merged, r => line(r)))
      if (p.transfers.length) parts.push(`OWN-ACCOUNT TRANSFERS, marked so they are not counted as spending (${p.transfers.length}):
` + list(p.transfers, r => line(r)))
      if (!(await askConfirm({ title: `Change ${p.total} entr${p.total === 1 ? 'y' : 'ies'}?`, message: parts.join('\n\n') + '\n\nGenuine repeats, like several ATM withdrawals of the same amount, are kept. Lines from a bank statement are never removed.', confirmLabel: 'Clean up', danger: false }))) return
      const r = await removeDuplicateTransactions()
      const done = [r.removed && `${r.removed} not-a-payment removed`, r.merged && `${r.merged} duplicate${r.merged === 1 ? '' : 's'} merged`, r.converted && `${r.converted} card payment${r.converted === 1 ? '' : 's'} fixed`, r.transfers && `${r.transfers} own-account transfer${r.transfers === 1 ? '' : 's'} marked`].filter(Boolean)
      showNotification(done.join(' · ') || 'Nothing to clean up', 'success')
    } catch (e) { showNotification('Could not clean up: ' + e.message, 'error') }
  }

  const onPickBackup = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await doRestore(await file.text())
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 100 }}>
      <TopBar title="Profile" right={<span />} />
      <div style={{ padding: '0 16px' }}>

        {/* you: picture and name side by side */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 68, flexShrink: 0 }}>
              <Avatar size={68} fontSize={24} onClick={() => photoInput.current?.click()} />
              <div onClick={() => photoInput.current?.click()} aria-label="Change picture"
                style={{ position: 'absolute', right: -3, bottom: -3, width: 26, height: 26, borderRadius: '50%', background: 'var(--gold-grad)', color: 'var(--on-accent)', border: '2px solid var(--bg1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Camera size={13} />
              </div>
            </div>
            <input ref={photoInput} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label-caps" style={{ marginBottom: 4 }}>Your name</div>
              {editingName ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelName() }} placeholder="Shown in the Home greeting" style={{ height: 44, minWidth: 0 }} />
                  <button className="btn-primary" style={{ height: 44, width: 44, padding: 0, flexShrink: 0 }} onClick={saveName} aria-label="Save name"><Check size={18} /></button>
                  <button className="btn-ghost" style={{ height: 44, width: 44, padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={cancelName} aria-label="Cancel"><X size={16} /></button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: savedName ? 'var(--txt)' : 'var(--txt3)' }}>{savedName || 'Add your name'}</div>
                  <div onClick={() => { setName(savedName); setEditingName(true) }} aria-label="Edit name" style={{ width: 32, height: 32, borderRadius: 11, background: 'var(--gold-bg)', color: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Pencil size={15} /></div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, fontWeight: 700 }}>
                <span onClick={() => photoInput.current?.click()} style={{ color: 'var(--gold-dim)', cursor: 'pointer' }}>{photo ? 'Change picture' : 'Add picture'}</span>
                {photo && <span onClick={async () => { if (!(await askConfirm({ title: 'Remove your picture?', confirmLabel: 'Remove' }))) return; setProfilePhoto(''); showNotification('Picture removed') }} style={{ color: 'var(--red-dim)', cursor: 'pointer' }}>Remove</span>}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 10 }}>Your picture and name stay on this phone and are only used inside the app.</div>
        </div>

        {/* your data: save it, bring it back */}
        <Group title="Import and export">
          <div className="card">
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>Your data stays on this phone. Last export: <b style={{ color: 'var(--txt)' }}>{last ? format(last, 'd MMM yyyy') : 'never'}</b></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <BtnPrimary onClick={doBackup} style={{ flex: 1, fontSize: 14, whiteSpace: 'nowrap' }}><Download size={16} /> {busy ? 'Working…' : 'Export'}</BtnPrimary>
              <button className="btn-secondary" style={{ flex: 1, height: 52, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }} disabled={busy} onClick={() => restoreInput.current?.click()}><Upload size={16} /> Import</button>
            </div>
            <input ref={restoreInput} type="file" accept="application/json,.json" onChange={onPickBackup} style={{ display: 'none' }} />
          </div>
        </Group>

        {/* make the app yours: how it looks, and the lists, codes and rules it works from */}
        <Group title="Customise">
          <div style={{ marginBottom: 10 }}><ThemeStrip /></div>
          <div className="card rows" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Row Icon={SlidersHorizontal} title="All customise options" sub="Dropdown lists, categories and each card's reward rules" onClick={() => setActiveTab('options')} />
          </div>
        </Group>

        {/* fixing up transactions */}
        <Group title="Tidy up transactions">
          <div className="card rows" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Row Icon={Link2} title="Link unlinked transactions" sub="Tie SMS transactions to their card or account" onClick={doRelink} />
            <Row Icon={Eraser} title="Clean up duplicates" sub="Remove non-payments and merge repeated SMS" onClick={doCleanup} />
          </div>
        </Group>

        {/* the other areas of the app */}
        <Group title="Money">
          <div className="card rows" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Row Icon={Briefcase} title="Salary" sub="Employers, payslips, tax and PF" onClick={() => setActiveTab('salary')} />
            <Row Icon={Landmark} title="Debt &amp; loans" sub="EMIs, loans and repayments" onClick={() => setActiveTab('debt')} />
            <Row Icon={TrendingUp} title="Wealth" sub="Investments, SIPs and net worth" onClick={() => setActiveTab('wealth')} />
          </div>
        </Group>

        <Group title="About">
          <div className="card rows" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Row Icon={Smartphone} title="SMS tracking" sub={isNative() ? 'Reads bank SMS on this phone' : 'Available in the Android app; paste SMS in the browser'} right={<span />} />
            <Row Icon={ShieldCheck} title="Privacy" sub="All data stays on your device" right={<span />} />
            <Row Icon={Info} title="FinPing" sub={`Version ${__APP_VERSION__}${__BUILD_INFO__.run ? ` · build #${__BUILD_INFO__.run}` : ''} · ${format(new Date(__BUILD_INFO__.time), 'd MMM yyyy, h:mm a')} · ${__BUILD_INFO__.commit || 'unknown commit'}${__BUILD_INFO__.dirty ? '+' : ''}${__BUILD_INFO__.branch ? ` · ${__BUILD_INFO__.branch}` : ''}`} right={<span />} />
          </div>
        </Group>
      </div>
    </div>
  )
}
