import { useRef, useState } from 'react'
import { ChevronRight, Landmark, TrendingUp, ShieldCheck, Smartphone, Camera, Trash2, Download, Upload, Sun, Moon, SunMoon, Check, Pencil, X, SlidersHorizontal, Info } from 'lucide-react'
import { format } from 'date-fns'
import { TopBar, BtnPrimary, Avatar } from '../components/UI'
import { useStore } from '../store'
import { isNative } from '../lib/nativeSms'
import { useProfile, setUserName, setProfilePhoto, resizePhoto } from '../lib/profile'
import { PALETTES, MODES, useTheme, setPalette, setMode } from '../lib/theme'
import { exportBackup, inspectBackup, restoreBackup, lastBackupAt } from '../lib/backup'
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

const MODE_ICON = { light: Sun, dark: Moon, system: SunMoon }

export default function Profile() {
  const { setActiveTab, showNotification } = useStore()
  const { name: savedName, photo } = useProfile()
  const { palette, mode } = useTheme()
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
        if (!window.confirm(`Add ${raw.debts?.length || 0} debts and ${raw.debtRepayments?.length || 0} payments from this older debts backup?\n\nWhat you already have is kept; duplicates are skipped.`)) return
        const { addedDebts, addedRepayments } = await importDebts(text)
        showNotification(`Added ${addedDebts} debt(s) and ${addedRepayments} payment(s)`, 'success')
        return
      }
      const { counts, exportedAt } = inspectBackup(text)
      const n = k => counts[k] || 0
      const msg = `Restore backup from ${exportedAt ? format(new Date(exportedAt), 'd MMM yyyy, h:mm a') : 'unknown date'}?\n\n` +
        `${n('transactions')} transactions, ${n('creditCards')} cards, ${n('debts')} debts, ${n('investments')} investments.\n\n` +
        'This REPLACES everything currently in the app.'
      if (!window.confirm(msg)) return
      setBusy(true)
      await restoreBackup(text)
      showNotification('Backup restored', 'success')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) { showNotification(e.message, 'error') }
    finally { setBusy(false) }
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

        {/* picture + name */}
        <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 92, margin: '4px auto 10px' }}>
            <Avatar size={92} fontSize={30} onClick={() => photoInput.current?.click()} />
            <div onClick={() => photoInput.current?.click()} aria-label="Change picture"
              style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', background: 'var(--gold-grad)', color: 'var(--on-accent)', border: '2px solid var(--bg1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Camera size={15} />
            </div>
          </div>
          <input ref={photoInput} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
            <button className="btn-secondary" onClick={() => photoInput.current?.click()}>{photo ? 'Change picture' : 'Upload picture'}</button>
            {photo && <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => { setProfilePhoto(''); showNotification('Picture removed') }}><Trash2 size={13} /> Remove</button>}
          </div>
          <div className="label-caps" style={{ textAlign: 'left', marginBottom: 6 }}>Your name</div>
          {editingName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelName() }} placeholder="Shown in the Home greeting" />
              <button className="btn-primary" style={{ height: 52, width: 52, padding: 0, flexShrink: 0 }} onClick={saveName} aria-label="Save name"><Check size={20} /></button>
              <button className="btn-ghost" style={{ height: 52, width: 52, padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={cancelName} aria-label="Cancel"><X size={18} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 18 }}>
              <div style={{ flex: 1, textAlign: 'left', fontSize: 16, fontWeight: 700, color: savedName ? 'var(--txt)' : 'var(--txt3)' }}>{savedName || 'Add your name'}</div>
              <div onClick={() => { setName(savedName); setEditingName(true) }} aria-label="Edit name" style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--gold-bg)', color: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Pencil size={16} /></div>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: 'var(--txt3)', textAlign: 'left', marginTop: 8 }}>Your picture and name stay on this phone and are only used inside the app.</div>
        </div>

        {/* look and feel */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Appearance</div>
          <div className="label-caps" style={{ marginBottom: 6 }}>Mode</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {MODES.map(([id, label]) => {
              const Icon = MODE_ICON[id], on = mode === id
              return (
                <div key={id} onClick={() => setMode(id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 14, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--gold)' : 'var(--border2)'}`, background: on ? 'var(--gold-bg)' : 'var(--bg1)', color: on ? 'var(--gold-dim)' : 'var(--txt2)' }}>
                  <Icon size={18} />
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
                </div>
              )
            })}
          </div>
          <div className="label-caps" style={{ marginBottom: 6 }}>Colour theme</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(PALETTES).map(([id, p]) => {
              const on = palette === id
              return (
                <div key={id} onClick={() => setPalette(id)} style={{ position: 'relative', padding: '10px 6px 8px', borderRadius: 14, cursor: 'pointer', textAlign: 'center', border: `1.5px solid ${on ? 'var(--gold)' : 'var(--border2)'}`, background: on ? 'var(--gold-bg)' : 'var(--bg1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: p.swatch[0], border: '2px solid var(--bg1)' }} />
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: p.swatch[1], border: '2px solid var(--bg1)', marginLeft: -8 }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: on ? 'var(--gold-dim)' : 'var(--txt)' }}>{p.name}</div>
                  {on && <Check size={13} color="var(--gold-dim)" style={{ position: 'absolute', top: 6, right: 6 }} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          <Row Icon={SlidersHorizontal} title="Dropdown options" sub="Banks, cards, categories, insurers and more" onClick={() => setActiveTab('options')} />
        </div>

        {/* backup */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Backup &amp; restore</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '2px 0 10px' }}>
            Your data lives only on this phone, so uninstalling the app erases it. Save a backup file (to Drive, Files or send it to yourself) and import it again after reinstalling.
          </div>
          <div style={{ fontSize: 12, marginBottom: 10 }}>Last backup: <b>{last ? format(last, 'd MMM yyyy, h:mm a') : 'never'}</b></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <BtnPrimary onClick={doBackup} style={{ flex: 1 }}><Download size={16} /> {busy ? 'Working…' : 'Export backup'}</BtnPrimary>
            <button className="btn-secondary" style={{ flex: 1, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} disabled={busy} onClick={() => restoreInput.current?.click()}><Upload size={16} /> Import backup</button>
          </div>
          <input ref={restoreInput} type="file" accept="application/json,.json" onChange={onPickBackup} style={{ display: 'none' }} />
        </div>

        {/* app settings */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Settings</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '2px 0 10px' }}>
            If a spend shows in History but not on its card or bank account page, link every unlinked SMS transaction to the right card or account. Balances are not changed.
          </div>
          <button className="btn-secondary" style={{ width: '100%', height: 40 }} onClick={async () => {
            try { const n = await relinkTransactions(); showNotification(n ? `${n} transactions linked` : 'Nothing to link — all transactions are already tied to a card or account', 'success') }
            catch (e) { showNotification('Could not link: ' + e.message, 'error') }
          }}>Link unlinked transactions</button>

          <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '14px 0 10px' }}>
            Remove entries that were never real payments (OTPs, failed payments, reminders), merge one payment that several SMS reported, and turn "card bill paid" messages into card payments. Genuine repeats, like several ATM withdrawals of the same amount, are kept.
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
          <Row Icon={Info} title="FinPing" sub={`Version ${__APP_VERSION__}`} right={<span />} />
        </div>
      </div>
    </div>
  )
}
