import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, Divider, LabelCaps, MonoLg, BtnPrimary, BtnSecondary, formatINR, formatDate } from '../components/UI'
import { ChevronRight, IndianRupee, TrendingUp, StickyNote } from 'lucide-react'
import { Field, TextField, Picker } from '../components/Fields'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { askConfirm } from '../lib/confirm'
import { format } from 'date-fns'
import { ppfYear, ppfHistory, ppfRateFor } from '../lib/ppf'

const TYPE_ICONS = { MutualFund: '📈', Stock: '📊', PPF: '🏛', NPS: '🏦', Gold: '🪙', FD: '🔐', Other: '💰' }
const TYPE_COLORS = { MutualFund: 'var(--mint)', Stock: 'var(--indigo)', PPF: 'var(--amber)', NPS: '#8B5CF6', Gold: '#D97706', FD: '#06B6D4', Other: 'var(--txt3)' }

export default function Wealth() {
  const [addOpen, setAddOpen] = useState(false)
  useBackHandler(addOpen, () => setAddOpen(false))
  const { showNotification } = useStore()
  const [openId, setOpenId] = useState(null)
  const [assetType, setAssetType] = useState(null)
  const [editing, setEditing] = useState(false) // details are read-only until you tap Edit
  const [edEntry, setEdEntry] = useState(null) // the entry being changed
  const [depOpen, setDepOpen] = useState(false) // the quick Add deposit form, without going into Edit
  useEffect(() => { setDepOpen(false); setEdEntry(null) }, [openId])
  const [dep, setDep] = useState({ amount: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [curVal, setCurVal] = useState('')
  useBackHandler(openId != null || assetType != null, () => { setOpenId(null); setAssetType(null) })

  const [form, setForm] = useState({ name: '', type: 'MutualFund', investedAmount: '', currentValue: '', notes: '', last4: '' })

  const investments = useLiveQuery(() => db.investments.toArray())

  const totalInvested = (investments || []).reduce((s, i) => s + (i.investedAmount || 0), 0)
  const totalCurrent = (investments || []).reduce((s, i) => s + (i.currentValue || 0), 0)
  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(1) : 0
  const totalMonthly = 0

  // Asset allocation: one row per kind of asset you hold; tap a row to see its accounts
  const ASSETS = [
    { type: 'Stock', label: 'Equity (direct stocks)', sub: 'Direct exchange', always: true },
    { type: 'MutualFund', label: 'Mutual funds', sub: 'SIPs and funds', always: true },
    { type: 'Gold', label: 'Gold', sub: 'Sovereign / digital gold', always: true },
    { type: 'PPF', label: 'PPF', sub: 'Tax-free, government backed', always: true },
    { type: 'NPS', label: 'NPS', sub: 'Retirement, tax-shielded' },
    { type: 'FD', label: 'Fixed deposits', sub: 'Fixed returns' },
    { type: 'Other', label: 'Other', sub: 'Everything else' },
  ]
  const allocData = ASSETS.map(a => {
    const list = (investments || []).filter(i => i.type === a.type)
    return { ...a, count: list.length, value: list.reduce((s, i) => s + (i.currentValue || 0), 0) }
  }).filter(a => a.always || a.count > 0) // the four main assets always show; the rest only when you hold one
  const totalAlloc = allocData.reduce((s, a) => s + a.value, 0)

  const openInv = (investments || []).find(i => i.id === openId)
  // each deposit is logged as an entry; invested is the sum of entries and the current value rises with each deposit
  const addDeposit = async () => {
    const amount = parseFloat(dep.amount)
    if (!(amount > 0)) { showNotification('Enter the amount', 'error'); return }
    const entries = [...(openInv.entries || (openInv.investedAmount ? [{ date: openInv.startDate || new Date(), amount: openInv.investedAmount, opening: true }] : [])), { date: new Date(dep.date), amount }]
    await db.investments.update(openInv.id, { entries, investedAmount: entries.reduce((a, e) => a + e.amount, 0), currentValue: (openInv.currentValue || 0) + amount })
    setDep({ ...dep, amount: '' })
    setDepOpen(false)
    showNotification('Deposit added', 'success')
  }
  const removeEntry = async idx => {
    const entries = (openInv.entries || []).filter((_, i) => i !== idx)
    const gone = openInv.entries[idx].amount
    await db.investments.update(openInv.id, { entries, investedAmount: entries.reduce((a, e) => a + e.amount, 0), currentValue: Math.max(0, (openInv.currentValue || 0) - gone) })
  }
  // change a logged entry's date or amount; invested follows the entries and the current value moves by the same difference
  const saveEntry = async () => {
    const amount = parseFloat(edEntry.amount)
    if (!(amount > 0)) { showNotification('Enter the amount', 'error'); return }
    const old = openInv.entries[edEntry.idx]
    const entries = openInv.entries.map((e, i) => (i === edEntry.idx ? { ...e, amount, date: new Date(edEntry.date) } : e))
    await db.investments.update(openInv.id, { entries, investedAmount: entries.reduce((a, e) => a + e.amount, 0), currentValue: Math.max(0, (openInv.currentValue || 0) + amount - old.amount) })
    setEdEntry(null)
    showNotification('Entry updated', 'success')
  }
  const saveCurrent = async () => {
    const v = parseFloat(curVal)
    if (!(v >= 0) || curVal === '') { showNotification('Enter the current value', 'error'); return }
    await db.investments.update(openInv.id, { currentValue: v })
    setCurVal('')
    showNotification('Current value updated', 'success')
  }
  const deleteInv = async () => {
    if (!(await askConfirm({ title: 'Delete this investment?', message: `${openInv.name} and its entries will be removed.`, confirmLabel: 'Delete' }))) return
    await db.investments.delete(openInv.id)
    setOpenId(null)
  }

  const handleAddManual = async () => {
    if (!form.name || !form.investedAmount) { showNotification('Name and amount required', 'error'); return }
    await db.investments.add({
      name: form.name, type: form.type,
      investedAmount: parseFloat(form.investedAmount), currentValue: parseFloat(form.currentValue || form.investedAmount),
      units: null, nav: null, startDate: new Date(), source: 'manual', notes: form.notes, last4: form.last4.replace(/\D/g, '').slice(-4) || null,
    })
    setForm({ name: '', type: 'MutualFund', investedAmount: '', currentValue: '', notes: '', last4: '' })
    setAddOpen(false)
    showNotification('Investment added!', 'success')
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar sub="Wealth" />

      <div style={{ padding: '10px 16px 0' }}>
        {/* Header Telemetry */}
        <Card style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <LabelCaps style={{ marginBottom: 2 }}>Telemetry Engine · Wealth Allocation</LabelCaps>
              <MonoLg style={{ fontSize: 22 }}>{formatINR(totalMonthly)} <span style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 400 }}>/ month</span></MonoLg>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge variant="mint">AUTO-TRACK ACTIVE</Badge>
                          </div>
          </div>
          <ProgressBar pct={0} variant="gradient" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10 }}>
            <span style={{ color: 'var(--txt2)' }}>0%</span>
            <span style={{ color: 'var(--mint)' }}>Safe Boundary: 30%+</span>
            <span style={{ color: 'var(--txt2)' }}>100%</span>
          </div>
        </Card>

        {/* Summary Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
          <div className="card-sm" style={{ padding: 10 }}>
            <LabelCaps style={{ marginBottom: 2, fontSize: 9 }}>Invested</LabelCaps>
            <div className="mono-sm">{formatINR(totalInvested)}</div>
          </div>
          <div className="card-sm" style={{ padding: 10 }}>
            <LabelCaps style={{ marginBottom: 2, fontSize: 9 }}>Current</LabelCaps>
            <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(totalCurrent)}</div>
          </div>
          <div className="card-sm" style={{ padding: 10 }}>
            <LabelCaps style={{ marginBottom: 2, fontSize: 9 }}>Returns</LabelCaps>
            <div className="mono-sm" style={{ color: overallReturn > 0 ? 'var(--mint)' : 'var(--red)' }}>+{overallReturn}%</div>
          </div>
        </div>

        {/* Asset Allocation */}
        <SectionHdr title="Asset Allocation" right={<Badge variant="grey">{allocData.length} {allocData.length === 1 ? 'Asset' : 'Assets'}</Badge>} />
        <Card style={{ marginBottom: 10 }}>
          {/* Stacked bar */}
          {allocData.length > 0 && (
            <div style={{ height: 8, borderRadius: 9999, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
              {allocData.map(a => <div key={a.type} style={{ width: `${totalAlloc > 0 ? a.value / totalAlloc * 100 : 0}%`, background: TYPE_COLORS[a.type], height: '100%' }} />)}
            </div>
          )}
          {allocData.map((a, i) => {
            const pct = totalAlloc > 0 ? Math.round(a.value / totalAlloc * 100) : 0
            return (
              <div key={a.type}>
                <div onClick={() => setAssetType(a.type)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[a.type], flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{TYPE_ICONS[a.type]} {a.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{a.count} {a.count === 1 ? 'account' : 'accounts'} · {a.sub}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-sm">{formatINR(a.value)}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{pct}%</div>
                  </div>
                  <ChevronRight size={16} color="var(--txt3)" />
                </div>
                {i < allocData.length - 1 && <Divider />}
              </div>
            )
          })}
        </Card>

        {/* one asset: its accounts and investment details */}
        {assetType && (() => {
          const meta = ASSETS.find(a => a.type === assetType)
          const list = (investments || []).filter(i => i.type === assetType)
          const inv = list.reduce((s, i) => s + (i.investedAmount || 0), 0), cur = list.reduce((s, i) => s + (i.currentValue || 0), 0)
          return (
            <div className="overlay" onClick={() => setAssetType(null)}>
              <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="sheet-handle" />
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{TYPE_ICONS[assetType]} {meta?.label || assetType}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, margin: '12px 0' }}>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Invested</LabelCaps><div className="mono-sm">{formatINR(inv)}</div></div>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Current</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(cur)}</div></div>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Gain</LabelCaps><div className="mono-sm" style={{ color: cur >= inv ? 'var(--mint)' : 'var(--red)' }}>{cur >= inv ? '+' : '−'}{formatINR(Math.abs(cur - inv))}</div></div>
                </div>
                {list.length === 0 && (
                  <div style={{ padding: '14px 0', fontSize: 12.5, color: 'var(--txt2)' }}>
                    Nothing added under {meta?.label || assetType} yet.
                    <button className="btn-primary" style={{ display: 'block', width: '100%', height: 44, marginTop: 10 }} onClick={() => { setAssetType(null); setForm({ ...form, type: assetType }); setAddOpen(true) }}>+ Add {meta?.label || assetType}</button>
                  </div>
                )}
                {list.map(i => {
                  const gain = (i.currentValue || 0) - (i.investedAmount || 0)
                  const pf = i.type === 'PPF' ? ppfYear({ entries: i.entries || [], current: i.currentValue || 0, rate: ppfRateFor(i, ppfHistory(i).slice(-1)[0].fy) }) : null
                  return (
                    <div key={i.id} onClick={() => { setAssetType(null); setOpenId(i.id); setCurVal(''); setEditing(false) }} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{i.name}{i.last4 ? ` ••${i.last4}` : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{i.startDate ? `Since ${formatDate(i.startDate)}` : i.type}{i.source === 'sms' ? ' · from SMS' : ''}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(i.currentValue)}</div>
                          <div style={{ fontSize: 11, color: gain >= 0 ? 'var(--mint-dim)' : 'var(--red)' }}>{gain >= 0 ? '+' : '−'}{formatINR(Math.abs(gain))}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 3 }}>Invested {formatINR(i.investedAmount)}{i.units ? ` · ${i.units} units` : ''}{i.nav ? ` · NAV ${i.nav}` : ''}</div>
                      {pf && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 2 }}>FY {pf.fy}: deposited {formatINR(pf.deposited)}, {formatINR(pf.remaining)} left of ₹1.5 lakh · interest {formatINR(pf.projected)} expected</div>}
                    </div>
                  )
                })}
                <div style={{ fontSize: 10.5, color: 'var(--txt2)', margin: '8px 0' }}>Tap an account to see its details and entries.</div>
                <button className="btn-ghost" style={{ width: '100%', height: 42 }} onClick={() => setAssetType(null)}>Close</button>
              </div>
            </div>
          )
        })()}


        {/* Investment List */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn-primary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={() => setAddOpen(!addOpen)}>+ Add Investment</button>
        </div>

        {addOpen && (
          <div className="overlay" onClick={() => setAddOpen(false)}>
<div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
<div className="sheet-handle" />
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>Log an investment</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Fund / stock name"><TextField icon={<TrendingUp size={17} />} placeholder="e.g. Nifty 50 index fund" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Type">
                <Picker value={form.type} options={Object.entries(TYPE_ICONS).map(([t, icon]) => ({ value: t, label: t, icon }))} onChange={v => setForm({ ...form, type: v })} title="Investment type" />
              </Field>
              <div className="form-grid">
                <Field label="Invested"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.investedAmount} onChange={e => setForm({ ...form, investedAmount: e.target.value })} /></Field>
                <Field label="Current value"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.currentValue} onChange={e => setForm({ ...form, currentValue: e.target.value })} /></Field>
              </div>
              <Field label="Account number, last 4 digits"><TextField icon={<StickyNote size={17} />} inputMode="numeric" maxLength={4} placeholder="Optional, e.g. 1234" value={form.last4} onChange={e => setForm({ ...form, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
              <Field label="Notes"><TextField icon={<StickyNote size={17} />} placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => setAddOpen(false)}>Cancel</button>
                <BtnPrimary onClick={handleAddManual} style={{ flex: 1 }}>Save</BtnPrimary>
              </div>
            </div>
          </div>
          </div>
        )}

        {openInv && (
          <div className="overlay" onClick={() => setOpenId(null)}>
            <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="sheet-handle" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{TYPE_ICONS[openInv.type] || '💰'} {openInv.name}</div>
                <button className={editing ? 'btn-primary' : 'btn-secondary'} style={{ height: 34, padding: '0 16px', fontSize: 12 }} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
              </div>
              {(editing || openInv.last4) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--txt2)', flex: 1 }}>Account number, last 4 digits</span>
                  {editing
                    ? <input className="input" inputMode="numeric" maxLength={4} placeholder="••••" defaultValue={openInv.last4 || ''} key={openInv.id + ':' + (openInv.last4 || '')} style={{ width: 80, height: 34, textAlign: 'right' }}
                        onBlur={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v !== (openInv.last4 || '')) db.investments.update(openInv.id, { last4: v || null }) }} />
                    : <b>••{openInv.last4}</b>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
                <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Invested</LabelCaps><div className="mono-sm">{formatINR(openInv.investedAmount || 0, 2)}</div></div>
                <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Current</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(openInv.currentValue || 0, 2)}</div></div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>Gain {formatINR((openInv.currentValue || 0) - (openInv.investedAmount || 0), 2)}</div>
              {openInv.type === 'PPF' && (() => {
                const rows = ppfHistory(openInv)
                const rate = rows[rows.length - 1].rate
                const y = ppfYear({ entries: openInv.entries || [], current: openInv.currentValue || 0, rate })
                return (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Financial year {y.fy}</div>
                    <ProgressBar pct={Math.min(100, y.deposited / y.limit * 100)} variant="gradient" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                      <span>Deposited {formatINR(y.deposited)} of {formatINR(y.limit)}</span>
                      <b style={{ color: y.over ? 'var(--red)' : 'var(--mint-dim)' }}>{y.over ? `${formatINR(y.over)} over the limit` : `${formatINR(y.remaining)} left`}</b>
                    </div>
                    {y.over > 0 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Deposits above ₹1,50,000 in a year earn no interest and are returned.</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 10 }}>
                      <span style={{ color: 'var(--txt2)' }}>Interest so far (credited on 31 Mar)</span><b>{formatINR(y.soFar)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: 'var(--txt2)' }}>Projected for the year</span><b>{formatINR(y.projected)}</b>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Year by year</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr 1.1fr', gap: 6, fontSize: 10, color: 'var(--txt2)', paddingBottom: 4 }}>
                      <span>Year</span><span style={{ textAlign: 'right' }}>Deposited</span><span style={{ textAlign: 'right' }}>Rate %</span><span style={{ textAlign: 'right' }}>Interest</span>
                    </div>
                    {[...rows].reverse().map(r => (
                      <div key={r.fy} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr 1.1fr', gap: 6, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                        <span>{r.fy}{r.current ? <span style={{ display: 'block', fontSize: 9.5, color: 'var(--txt2)' }}>so far</span> : null}</span>
                        <span style={{ textAlign: 'right' }}>{formatINR(r.deposited)}</span>
                        {!editing ? <span style={{ textAlign: 'right' }}>{r.rate}</span> : <input className="input" type="number" inputMode="decimal" step="0.1" defaultValue={r.rate} key={openInv.id + r.fy + ':' + r.rate} style={{ height: 30, padding: '0 6px', textAlign: 'right', fontSize: 12 }}
                          onBlur={e => { const v = parseFloat(e.target.value); if (v > 0 && v !== r.rate) db.investments.update(openInv.id, { ppfRates: { ...(openInv.ppfRates || {}), [r.fy]: v } }) }} />}
                        {!editing ? <span style={{ textAlign: 'right', color: r.actual ? 'var(--txt)' : 'var(--txt2)' }}>{formatINR(r.interest)}</span> : <input className="input" type="number" inputMode="decimal" defaultValue={r.interest} key={openInv.id + r.fy + ':' + r.interest + r.actual} style={{ height: 30, padding: '0 6px', textAlign: 'right', fontSize: 12, color: r.actual ? 'var(--txt)' : 'var(--txt2)' }}
                          onBlur={e => { const v = parseFloat(e.target.value); if (e.target.value !== '' && v >= 0 && v !== r.interest) db.investments.update(openInv.id, { ppfInterest: { ...(openInv.ppfInterest || {}), [r.fy]: v } }) }} />}
                      </div>
                    ))}
                    <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 4 }}>{editing ? "Change a year's rate, or type the interest from your passbook (it replaces the estimate and is used for the next year's opening balance)." : 'Interest in grey is an estimate. Tap Edit to change a rate or enter the passbook figure.'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 6 }}>An estimate. Interest uses the lowest balance between the 5th and month end, so deposit by the 5th. The government sets the rate each quarter.</div>
                  </div>
                )
              })()}
              {!editing && !depOpen && <button className="btn-primary" style={{ width: '100%', height: 46, marginBottom: 12 }} onClick={() => setDepOpen(true)}>+ Add deposit</button>}
              {(editing || depOpen) && (
                <>
              <LabelCaps style={{ marginBottom: 4 }}>Add a deposit</LabelCaps>
              <div className="form-grid">
                <Field label="Amount"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={dep.amount} onChange={e => setDep({ ...dep, amount: e.target.value })} /></Field>
                <Field label="Date"><TextField type="date" value={dep.date} onChange={e => setDep({ ...dep, date: e.target.value })} /></Field>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {depOpen && !editing && <button className="btn-ghost" style={{ height: 52, padding: '0 18px' }} onClick={() => setDepOpen(false)}>Cancel</button>}
                <BtnPrimary onClick={addDeposit} style={{ flex: 1 }}>Add deposit</BtnPrimary>
              </div>
              {editing && (
                <>
                  <LabelCaps style={{ margin: '16px 0 4px' }}>Update current value (balance from the passbook / app)</LabelCaps>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder={String(openInv.currentValue || 0)} value={curVal} onChange={e => setCurVal(e.target.value)} /></div>
                    <button className="btn-secondary" style={{ height: 52, padding: '0 18px' }} onClick={saveCurrent}>Update</button>
                  </div>
                </>
              )}
                </>
              )}
              {(openInv.entries || []).length > 0 && (
                <>
                  <LabelCaps style={{ margin: '16px 0 4px' }}>Entries</LabelCaps>
                  {openInv.entries.map((e, i) => ({ e, i })).sort((a, b) => new Date(b.e.date) - new Date(a.e.date) || b.i - a.i).map(({ e, i }) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ flex: 1, color: 'var(--txt2)' }}>{formatDate(e.date)}{e.opening ? ' · opening' : ''}</span>
                      <b style={{ marginRight: 12 }}>{formatINR(e.amount, 2)}</b>
                      {editing && <button className="btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 11, marginRight: 6 }} onClick={() => setEdEntry({ idx: i, date: format(new Date(e.date), 'yyyy-MM-dd'), amount: String(e.amount) })}>Edit</button>}
                      {editing && <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 11 }} onClick={() => removeEntry(i)}>Remove</button>}
                    </div>
                  ))}
                  {edEntry && (
                    <div className="card" style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Edit this entry</div>
                      <div className="form-grid">
                        <Field label="Amount"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" value={edEntry.amount} onChange={e => setEdEntry({ ...edEntry, amount: e.target.value })} /></Field>
                        <Field label="Date"><TextField type="date" value={edEntry.date} onChange={e => setEdEntry({ ...edEntry, date: e.target.value })} /></Field>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="btn-ghost" style={{ height: 44 }} onClick={() => setEdEntry(null)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1, height: 44 }} onClick={saveEntry}>Save</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {editing && <button className="btn-ghost" style={{ width: '100%', height: 44, marginTop: 14 }} onClick={deleteInv}>Delete this investment</button>}
              <button className="btn-ghost" style={{ width: '100%', height: 44, marginTop: 6 }} onClick={() => setOpenId(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
