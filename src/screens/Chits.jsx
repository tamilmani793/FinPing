import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, format } from 'date-fns'
import { db } from '../db/schema'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { askConfirm } from '../lib/confirm'
import { Field, TextField } from '../components/Fields'
import { SubHeader, Card, LabelCaps, BtnPrimary, formatINR } from '../components/UI'
import { IndianRupee, Clock, Calendar, FileText, Users } from 'lucide-react'

// An auction chit: every month each member pays in, and one member takes the pot. Members who have not taken it yet pay the
// full instalment less the auction dividend, so the amount paid rises month by month towards the full instalment. This
// screen is a plain ledger of money out (paid) and money in (the pot), month by month, with the months left.

const ymd = d => (d ? format(new Date(d), 'yyyy-MM-dd') : '')
const monthDate = (c, n) => addMonths(new Date(c.startDate), n - 1)
const num = v => (v === '' || v == null ? 0 : Number(v) || 0)

// everything worth showing about one chit
function stats(c) {
  const e = c.entries || {}
  const months = Array.from({ length: c.months }, (_, i) => i + 1)
  const paid = months.reduce((t, n) => t + num(e[n]?.paid), 0)
  const received = months.reduce((t, n) => t + num(e[n]?.received), 0)
  const done = months.filter(n => num(e[n]?.paid) > 0).length
  // what you saved through the auction: the full instalment less what you actually paid, for the months you paid
  const dividend = months.reduce((t, n) => t + (num(e[n]?.paid) > 0 ? Math.max(0, num(c.instalment) - num(e[n].paid)) : 0), 0)
  const wonMonth = months.find(n => num(e[n]?.received) > 0) || null
  const today = new Date()
  const current = Math.min(c.months, Math.max(0, months.filter(n => monthDate(c, n) <= today).length))
  return { e, months, paid, received, net: received - paid, done, left: c.months - done, dividend, wonMonth, current }
}

function ChitForm({ chit, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({
    name: chit?.name || '', organiser: chit?.organiser || '', chitValue: chit ? String(chit.chitValue) : '', months: chit ? String(chit.months) : '',
    startDate: chit ? ymd(chit.startDate) : '', instalment: chit?.instalment ? String(chit.instalment) : '',
  })
  const set = p => setF(x => ({ ...x, ...p }))
  const auto = num(f.chitValue) > 0 && num(f.months) > 0 ? Math.round(num(f.chitValue) / num(f.months)) : 0
  const save = async () => {
    if (!f.name.trim() || !(num(f.chitValue) > 0) || !(num(f.months) >= 1) || !f.startDate) { showNotification('Enter the name, chit value, months and the first month', 'error'); return }
    const rec = { name: f.name.trim(), organiser: f.organiser.trim(), chitValue: num(f.chitValue), months: Math.round(num(f.months)), startDate: new Date(f.startDate + 'T12:00:00'), instalment: num(f.instalment) || auto }
    if (chit) await db.chits.update(chit.id, rec); else await db.chits.add({ ...rec, entries: {}, createdAt: new Date() })
    showNotification(chit ? 'Chit updated' : 'Chit added', 'success')
    onClose()
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{chit ? 'Edit chit' : 'Add a chit'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name"><TextField icon={<FileText size={17} />} placeholder="e.g. Sri Lakshmi 5L chit" value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
          <Field label="Chit company / foreman"><TextField icon={<Users size={17} />} placeholder="Optional" value={f.organiser} onChange={e => set({ organiser: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Chit value"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="e.g. 500000" value={f.chitValue} onChange={e => set({ chitValue: e.target.value })} /></Field>
            <Field label="Months (members)"><TextField icon={<Clock size={17} />} type="number" inputMode="numeric" placeholder="e.g. 20" value={f.months} onChange={e => set({ months: e.target.value })} /></Field>
          </div>
          <div className="form-grid">
            <Field label="First month"><TextField icon={<Calendar size={17} />} type="date" value={f.startDate} onChange={e => set({ startDate: e.target.value })} /></Field>
            <Field label="Full monthly amount" hint={auto ? `blank = ${formatINR(auto)} (value ÷ months)` : 'the most you can pay in a month'}><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder={auto ? String(auto) : '0'} value={f.instalment} onChange={e => set({ instalment: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px' }} onClick={onClose}>Cancel</button>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>{chit ? 'Save changes' : 'Add chit'}</BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthForm({ chit, n, onClose }) {
  const { showNotification } = useStore()
  const cur = chit.entries?.[n] || {}
  const [f, setF] = useState({ paid: cur.paid ? String(cur.paid) : '', received: cur.received ? String(cur.received) : '', note: cur.note || '' })
  const set = p => setF(x => ({ ...x, ...p }))
  const save = async () => {
    const entries = { ...(chit.entries || {}) }
    if (num(f.paid) > 0 || num(f.received) > 0 || f.note.trim()) entries[n] = { paid: num(f.paid), received: num(f.received), note: f.note.trim() }
    else delete entries[n]
    await db.chits.update(chit.id, { entries })
    showNotification(`Month ${n} saved`, 'success')
    onClose()
  }
  const dividend = num(f.paid) > 0 ? Math.max(0, num(chit.instalment) - num(f.paid)) : 0
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 18, fontWeight: 800 }}>Month {n} of {chit.months}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 14px' }}>{format(monthDate(chit, n), 'MMMM yyyy')} · full amount {formatINR(chit.instalment)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Paid this month" hint={dividend > 0 ? `${formatINR(dividend)} less than the full amount (auction dividend)` : undefined}>
            <TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={f.paid} onChange={e => set({ paid: e.target.value })} />
          </Field>
          <Field label="Pot received" hint="only in the month you took the chit, after the auction discount">
            <TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={f.received} onChange={e => set({ received: e.target.value })} />
          </Field>
          <Field label="Note"><TextField icon={<FileText size={17} />} placeholder="Optional, e.g. auction bid" value={f.note} onChange={e => set({ note: e.target.value })} /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px' }} onClick={onClose}>Cancel</button>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>Save month</BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Chits() {
  const chits = useLiveQuery(() => db.chits.toArray()) || []
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(null) // null | 'new' | the chit being edited
  const [month, setMonth] = useState(null) // the month number being edited
  useBackHandler(openId != null || form != null || month != null, () => { if (month != null) setMonth(null); else if (form != null) setForm(null); else setOpenId(null) })

  const all = chits.map(c => ({ c, s: stats(c) }))
  const tot = all.reduce((t, { s }) => ({ paid: t.paid + s.paid, received: t.received + s.received }), { paid: 0, received: 0 })
  const open = chits.find(c => c.id === openId)
  const os = open ? stats(open) : null
  const gain = v => (v >= 0 ? 'var(--mint)' : 'var(--red)')
  const remove = async c => {
    if (!(await askConfirm({ title: `Delete ${c.name}?`, message: 'Its month-by-month ledger is deleted too.', confirmLabel: 'Delete' }))) return
    await db.chits.delete(c.id)
    setOpenId(null)
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <SubHeader title="Chit funds" />
      <div style={{ padding: '10px 16px 0' }}>
        {chits.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Paid in</LabelCaps><div className="mono-sm">{formatINR(tot.paid)}</div></div>
            <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Pot received</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(tot.received)}</div></div>
            <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Net</LabelCaps><div className="mono-sm" style={{ color: gain(tot.received - tot.paid) }}>{tot.received - tot.paid >= 0 ? '+' : '−'}{formatINR(Math.abs(tot.received - tot.paid))}</div></div>
          </div>
        )}
        <button className="btn-primary" style={{ width: '100%', height: 42, fontSize: 13, marginBottom: 12 }} onClick={() => setForm('new')}>+ Add a chit</button>

        {all.map(({ c, s }) => (
          <div key={c.id} onClick={() => setOpenId(c.id)} style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{[c.organiser, `${formatINR(c.chitValue)} · ${c.months} months`].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono-md" style={{ fontSize: 14 }}>{s.done}/{c.months}</div>
                <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{s.left} left</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--txt2)', marginTop: 8 }}>
              <span>Paid {formatINR(s.paid)}</span>
              <span>{s.wonMonth ? `Pot taken in month ${s.wonMonth}` : 'Pot not taken yet'}</span>
              <span style={{ color: gain(s.net) }}>Net {s.net >= 0 ? '+' : '−'}{formatINR(Math.abs(s.net))}</span>
            </div>
          </div>
        ))}
        {!chits.length && <Card style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--txt2)', fontSize: 13 }}>No chits yet. Add one with its value and months, then fill in what you pay and receive each month.</Card>}
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpenId(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="sheet-handle" />
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{open.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '2px 0 10px' }}>{[open.organiser, `${formatINR(open.chitValue)} chit`, `${open.months} months from ${format(new Date(open.startDate), 'MMM yyyy')}`, `full amount ${formatINR(open.instalment)}`].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
              <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Paid in</LabelCaps><div className="mono-sm">{formatINR(os.paid)}</div></div>
              <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Pot received</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(os.received)}</div></div>
              <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Net</LabelCaps><div className="mono-sm" style={{ color: gain(os.net) }}>{os.net >= 0 ? '+' : '−'}{formatINR(Math.abs(os.net))}</div></div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 10, lineHeight: 1.6 }}>
              <b style={{ color: 'var(--txt)' }}>{os.done}</b> of {open.months} months paid · <b style={{ color: 'var(--txt)' }}>{os.left}</b> to go
              {os.dividend > 0 && <> · saved through the auction <b style={{ color: 'var(--mint-dim)' }}>{formatINR(os.dividend)}</b></>}
              {os.wonMonth ? <> · pot taken in month <b style={{ color: 'var(--txt)' }}>{os.wonMonth}</b></> : ' · pot not taken yet'}
            </div>
            {(() => {
              const next = os.months.find(n => !(num(os.e[n]?.paid) > 0))
              return next ? <button className="btn-primary" style={{ width: '100%', height: 42, fontSize: 13, marginBottom: 10 }} onClick={() => setMonth(next)}>Log month {next} · {format(monthDate(open, next), 'MMM yyyy')}</button> : null
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.1fr 1fr 1fr 1fr', gap: 4, borderBottom: '1px solid var(--border2)' }}>
              {['No.', 'Month', 'Paid', 'Received', 'Saved'].map((h, i) => <div key={h} className="label-caps" style={{ fontSize: 9, padding: '5px 0', textAlign: i > 1 ? 'right' : 'left' }}>{h}</div>)}
            </div>
            {os.months.map(n => {
              const en = os.e[n] || {}, paid = num(en.paid), got = num(en.received), saved = paid > 0 ? Math.max(0, num(open.instalment) - paid) : 0
              const late = !paid && monthDate(open, n) <= new Date()
              return (
                <div key={n} onClick={() => setMonth(n)} style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.1fr 1fr 1fr 1fr', gap: 4, borderBottom: '1px solid var(--border)', cursor: 'pointer', background: got ? 'var(--mint-bg)' : 'transparent', fontVariantNumeric: 'tabular-nums' }}>
                  <div style={{ fontSize: 11.5, padding: '8px 0', fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 11, padding: '8px 0', color: 'var(--txt2)' }}>{format(monthDate(open, n), 'MMM yy')}{got > 0 && <span style={{ display: 'block', fontSize: 9, color: 'var(--mint-dim)' }}>pot taken</span>}{late && <span style={{ display: 'block', fontSize: 9, color: 'var(--red-dim)' }}>not logged</span>}</div>
                  <div style={{ fontSize: 11.5, padding: '8px 0', textAlign: 'right', fontWeight: paid ? 700 : 400, color: paid ? 'var(--txt)' : 'var(--txt3)' }}>{paid ? formatINR(paid) : '—'}</div>
                  <div style={{ fontSize: 11.5, padding: '8px 0', textAlign: 'right', fontWeight: got ? 700 : 400, color: got ? 'var(--mint-dim)' : 'var(--txt3)' }}>{got ? formatINR(got) : '—'}</div>
                  <div style={{ fontSize: 11, padding: '8px 0', textAlign: 'right', color: saved ? 'var(--mint-dim)' : 'var(--txt3)' }}>{saved ? formatINR(saved) : '—'}</div>
                </div>
              )
            })}
            <div style={{ fontSize: 10.5, color: 'var(--txt3)', margin: '8px 0 12px' }}>Tap any month to enter what you paid, or the pot you received. "Saved" is the full amount less what you paid that month.</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn-secondary" style={{ height: 36, fontSize: 12 }} onClick={() => setForm(open)}>✎ Edit chit</button>
              <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => setOpenId(null)}>Close</button>
              <button className="btn-ghost" style={{ height: 34, fontSize: 11, gridColumn: '1 / -1', color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={() => remove(open)}>Delete chit</button>
            </div>
          </div>
        </div>
      )}

      {form != null && <ChitForm chit={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {month != null && open && <MonthForm chit={open} n={month} onClose={() => setMonth(null)} />}
    </div>
  )
}
