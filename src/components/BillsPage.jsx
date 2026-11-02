import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { Plus } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { askConfirm } from '../lib/confirm'
import { Field, TextField, Picker } from './Fields'
import CardBills from './CardBills'
import { TopBar, formatINR } from './UI'
import { parseEbTable } from '../lib/ebImport'
import { providerListKey } from '../lib/billProviders'
import { getList, setList, useOptionNames } from '../lib/options'
import { KINDS, CYCLES, kindOf, cycleLabel, advance, usageRows, gasStats, collectBills, BILL_GROUPS, groupOfKind, ymd } from '../lib/bills'

// All bills in one place: credit card statements, insurance premiums, and the electricity, mobile, broadband, gas and other bills you add.
const STATE = {
  overdue: { label: 'Overdue', color: 'var(--red)' },
  soon: { label: 'Due this week', color: 'var(--amber, #D97706)' },
  later: { label: 'Coming up', color: 'var(--txt2)' },
  none: { label: 'No date', color: 'var(--txt2)' },
  paid: { label: 'Paid', color: 'var(--mint-dim)' },
}
const today = () => format(new Date(), 'yyyy-MM-dd')

function dueText(due) {
  if (!due) return ''
  const d = differenceInCalendarDays(new Date(due), new Date(new Date().toDateString()))
  const when = format(new Date(due), 'd MMM yyyy')
  return d < 0 ? `${when} · ${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? `${when} · today` : d === 1 ? `${when} · tomorrow` : d <= 30 ? `${when} · in ${d} days` : when
}

function Sheet({ onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  )
}

// add or edit a bill
function BillForm({ bill, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({
    kind: bill?.kind || 'electricity', name: bill?.name || '', provider: bill?.provider || '', accountNo: bill?.accountNo || bill?.last4 || '',
    startReading: bill?.startReading != null ? String(bill.startReading) : '', nextDue: bill?.nextDue ? ymd(bill.nextDue) : '', cycle: bill?.cycle || 'm1', amount: bill?.amount ? String(bill.amount) : '', notes: bill?.notes || '',
  })
  const set = patch => setF(p => ({ ...p, ...patch }))
  const gas = f.kind === 'gas'
  const listKey = providerListKey(f.kind)
  const providers = useOptionNames(listKey)
  // a provider you type that is not in the list is added to it, so it is there next time
  const pickProvider = v => { set({ provider: v }); if (v && !getList(listKey).some(x => String(x).toLowerCase() === v.toLowerCase())) setList(listKey, [...getList(listKey), v]) }
  const save = async () => {
    const name = f.name.trim() || kindOf(f.kind).label
    const rec = {
      kind: f.kind, name, provider: f.provider.trim(), accountNo: f.accountNo.trim() || null, last4: null,
      nextDue: !gas && f.kind !== 'electricity' && f.nextDue ? new Date(f.nextDue) : null, cycle: gas ? 'once' : f.cycle, startReading: f.kind === 'electricity' && f.startReading !== '' ? Number(f.startReading) : null, amount: f.amount ? Number(f.amount) : null, notes: f.notes, status: 'active',
    }
    if (bill) await db.bills.update(bill.id, rec); else await db.bills.add({ ...rec, createdAt: new Date() })
    showNotification(bill ? 'Bill updated' : 'Bill added', 'success')
    onClose()
  }
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{bill ? 'Edit bill' : 'Add a bill'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Type"><Picker value={f.kind} options={KINDS.map(k => ({ value: k.id, label: k.label, icon: k.icon }))} onChange={v => set({ kind: v })} title="Bill type" /></Field>
        <Field label="Name"><TextField placeholder={f.kind === 'electricity' ? 'e.g. Home electricity' : f.kind === 'mobile' ? 'e.g. Airtel prepaid' : 'e.g. Name of the bill'} value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
        <div className="form-grid">
          <Field label="Provider"><Picker value={f.provider} options={providers} onChange={pickProvider} allowCustom title={f.kind === 'electricity' ? 'Electricity board' : 'Provider'} placeholder={f.kind === 'electricity' ? 'Choose the board' : 'Choose or add'} clearLabel="Not set" /></Field>
          <Field label="Consumer / account number"><TextField placeholder="Optional, any length" value={f.accountNo} onChange={e => set({ accountNo: e.target.value })} /></Field>
        </div>
        {!gas && (
          <div className="form-grid">
            {f.kind !== 'electricity' && <Field label="Next due date"><TextField type="date" value={f.nextDue} onChange={e => set({ nextDue: e.target.value })} /></Field>}
            <Field label="Comes round"><Picker value={f.cycle} options={CYCLES.map(c => ({ value: c.id, label: c.label }))} onChange={v => set({ cycle: v })} title="How often" /></Field>
          </div>
        )}
        {f.kind === 'electricity' && <Field label="Meter reading now (optional)" hint="The next bill's units are worked out from this"><TextField type="number" inputMode="decimal" placeholder="e.g. 12130" value={f.startReading} onChange={e => set({ startReading: e.target.value })} /></Field>}
        <Field label="Usual amount"><TextField type="number" inputMode="decimal" placeholder="Optional" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
        <Field label="Notes"><TextField placeholder="Optional" value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ height: 50, padding: '0 22px' }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 1, height: 50 }} onClick={save}>Save</button>
        </div>
      </div>
    </Sheet>
  )
}

function Stat({ label, value, color }) {
  return <div className="card-sm" style={{ padding: 10 }}><div className="label-caps" style={{ fontSize: 9 }}>{label}</div><div className="mono-sm" style={{ color }}>{value}</div></div>
}

// paste the consumption table from the electricity board's site; each row becomes a logged bill
const EB_SAMPLE = [
  '11/10/2026\t12/10/2026\tNORMAL\t8740\t\t2\t\t500\t1570\t0\t0\t0\t0\t0\t1570\t0\t0\t1570\t 31/10/2026\t1570\tPGIBP2912259179\t 30/10/2026',
  '10/08/2026\t11/08/2026\tNORMAL\t8240\t\t1\t\t489\t1500.7\t0\t0\t0\t0\t0\t1501\t0\t0\t1501\t 31/08/2026\t1501\tPGIBP2891085970\t 15/08/2026',
  '08/06/2026\t08/06/2026\tNORMAL\t7751\t\t1\t\t498\t1674.9\t0\t0\t0\t0\t0\t1675\t0\t0\t1675\t 29/06/2026\t1675\tPGIBP3873469841\t 15/06/2026',
  '13/12/2023\t13/12/2023\tPMC\tPrevious Assessment Amount Billed\t342\t0\t0\t342\t 02/01/2024\t342\tPGIBP1112069687\t 24/12/2023',
  '07/10/2023\t07/10/2023\tNORMAL\t3503\t\t\t\t226\t342\t0\t0\t0\t0\t0\t342\t20.86\t0\t321.14\t 27/10/2023\t321\tPGIBP223357760\t 10/10/2023',
].join('\n')

function EbImport({ bill, existing, onClose }) {
  const { showNotification } = useStore()
  const [text, setText] = useState('')
  const parsed = text.trim() ? parseEbTable(text) : null
  const seen = new Set(existing.map(e => `${ymd(e.date)}|${e.reading ?? ''}`))
  const fresh = parsed ? parsed.rows.filter(r => !seen.has(`${ymd(r.date)}|${r.reading ?? ''}`)) : []
  const run = async () => {
    await db.bill_entries.bulkAdd(fresh.map(r => ({
      billId: bill.id, date: r.date, amount: r.amount, units: r.units, reading: r.reading, dueDate: r.dueDate,
      paid: r.paid, paidOn: r.paid ? r.paidOn || r.date : null, receipt: r.receipt || null, note: r.note || null, source: 'import',
    })))
    showNotification(`${fresh.length} bill${fresh.length === 1 ? '' : 's'} imported`, 'success')
    onClose()
  }
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Import bills</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>Copy the "Consumption Charges and Collection Details" table from the electricity board's site and paste it here. Date becomes the reading date, KWH the meter reading, Consumption the units, Amount To Be Paid the amount, and Collection Date the paid date.</div>
      <textarea className="input" style={{ height: 130, fontSize: 11.5, fontFamily: 'monospace' }} placeholder="Paste the table here" value={text} onChange={e => setText(e.target.value)} />
      <button className="btn-ghost" style={{ height: 32, fontSize: 12, marginTop: 6 }} onClick={() => setText(EB_SAMPLE)}>Fill with sample rows</button>
      {parsed && parsed.rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>No rows found. Copy the whole table, including the dates, and paste it again.</div>}
      {parsed && parsed.rows.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{fresh.length} to import{parsed.rows.length - fresh.length > 0 ? ` · ${parsed.rows.length - fresh.length} already logged` : ''}</div>
          {fresh.slice(0, 6).map((r, i) => (
            <div key={i} style={{ padding: '5px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 11.5 }}>
              <b>{format(r.date, 'd MMM yyyy')}</b> · {r.reading != null ? `reading ${r.reading} · ` : ''}{r.units != null ? `${r.units} units · ` : ''}<b>{formatINR(r.amount)}</b>
              <div style={{ color: 'var(--txt2)' }}>due {r.dueDate ? format(r.dueDate, 'd MMM yyyy') : '—'} · {r.paid ? `paid ${r.paidOn ? format(r.paidOn, 'd MMM yyyy') : ''}` : 'unpaid'}{r.note ? ` · ${r.note}` : ''}</div>
            </div>
          ))}
          {fresh.length > 6 && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 4 }}>and {fresh.length - 6} more</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-ghost" style={{ height: 46 }} onClick={onClose}>Cancel</button>
        <button className="btn-primary" style={{ flex: 1, height: 46 }} disabled={!fresh.length} onClick={run}>Import {fresh.length || ''}</button>
      </div>
    </Sheet>
  )
}

// one bill: read-only details, the log of bills / cylinders, and (after Edit) changes
function BillDetail({ bill, entries, onClose, startOpen }) {
  const { showNotification } = useStore()
  const [editBill, setEditBill] = useState(false) // the bill's own details form
  const [importOpen, setImportOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState(false) // logging and changing entries only after Edit
  const [ed, setEd] = useState(null) // the logged entry being changed
  const [form, setForm] = useState(!!startOpen) // opened from a row's Paid button: the payment form is ready
  const [d, setD] = useState({ date: today(), amount: bill.amount ? String(bill.amount) : '', units: '', unitsManual: false, reading: '', dueDate: '', paidOn: today(), paid: !(bill.kind === 'electricity'), bookedOn: today(), startedOn: '' })
  const kind = kindOf(bill.kind)
  const mine = entries.filter(e => e.billId === bill.id).sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
  const gas = bill.kind === 'gas', elec = bill.kind === 'electricity'
  const use = elec ? usageRows(bill, mine) : null
  const g = gas ? gasStats(mine) : null

  // the meter reading before this one (from the last bill of this connection that has a reading, or the starting reading)
  const prevReading = (() => {
    const before = mine.filter(e => e.reading != null && new Date(e.date) <= new Date(d.date)).sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)[0]
    return before ? before.reading : bill.startReading ?? null
  })()
  const autoUnits = elec && d.reading !== '' && prevReading != null && Number(d.reading) > prevReading ? Math.round((Number(d.reading) - prevReading) * 100) / 100 : null
  const unitsShown = d.unitsManual ? d.units : autoUnits != null ? String(autoUnits) : ''

  const logBill = async () => {
    const amount = Number(d.amount)
    if (elec && d.reading !== '' && prevReading != null && Number(d.reading) < prevReading) { showNotification(`The reading is lower than the last one (${prevReading})`, 'error'); return }
    if (!(amount > 0)) { showNotification('Enter the amount', 'error'); return }
    if (elec && !d.dueDate) { showNotification('Enter the due date printed on this bill', 'error'); return }
    if (elec && unitsShown && !(Number(unitsShown) > 0)) { showNotification('Enter the units used', 'error'); return }
    await db.bill_entries.add({ billId: bill.id, date: new Date(d.date), amount, units: unitsShown ? Number(unitsShown) : null, reading: elec && d.reading !== '' ? Number(d.reading) : null, dueDate: elec ? new Date(d.dueDate) : null, paid: d.paid, paidOn: d.paid ? new Date(d.paidOn || d.date) : null })
    // paying a bill moves the due date to the next one
    if (d.paid && bill.nextDue && !elec) await db.bills.update(bill.id, { nextDue: advance(bill.nextDue, bill.cycle) })
    setD({ ...d, units: '', unitsManual: false, reading: '', dueDate: '' })
    setForm(false)
    showNotification(d.paid ? 'Payment logged' : 'Bill logged. It stays under Bills until you mark it paid', 'success')
  }
  const bookGas = async () => {
    const amount = Number(d.amount) || 0
    await db.bill_entries.add({ billId: bill.id, date: new Date(d.bookedOn), amount, bookedOn: new Date(d.bookedOn), startedOn: d.startedOn ? new Date(d.startedOn) : null, paid: false })
    setForm(false)
    showNotification(d.startedOn ? 'Cylinder logged' : 'Booking logged', 'success')
  }
  const startUsing = id => db.bill_entries.update(id, { startedOn: new Date() }).then(() => showNotification('Started using it today', 'success'))
  const removeEntry = async id => { if (await askConfirm({ title: 'Remove this entry?', message: 'This cannot be undone.', confirmLabel: 'Remove' })) await db.bill_entries.delete(id) }
  const remove = async () => {
    if (!(await askConfirm({ title: `Delete ${bill.name}?`, message: 'Its logged bills are deleted too.', confirmLabel: 'Delete' }))) return
    await db.bill_entries.where('billId').equals(bill.id).delete(); await db.bills.delete(bill.id); onClose()
  }

  const saveEntry = async () => {
    const amount = Number(ed.amount)
    if (!(amount >= 0) || (!gas && !(amount > 0))) { showNotification('Enter the amount', 'error'); return }
    const patch = gas
      ? { date: new Date(ed.bookedOn), bookedOn: new Date(ed.bookedOn), startedOn: ed.startedOn ? new Date(ed.startedOn) : null, amount }
      : { date: new Date(ed.date), amount, units: ed.units !== '' ? Number(ed.units) : null, dueDate: elec && ed.dueDate ? new Date(ed.dueDate) : null, paid: ed.paid, paidOn: ed.paid ? new Date(ed.paidOn || ed.date) : null, reading: elec && ed.reading !== '' ? Number(ed.reading) : null }
    await db.bill_entries.update(ed.id, patch)
    setEd(null)
    showNotification('Entry updated', 'success')
  }
  const startEdit = e => setEd({ id: e.id, date: ymd(e.date), amount: String(e.amount || ''), units: e.units != null ? String(e.units) : '', reading: e.reading != null ? String(e.reading) : '', bookedOn: ymd(e.bookedOn || e.date), startedOn: e.startedOn ? ymd(e.startedOn) : '', dueDate: e.dueDate ? ymd(e.dueDate) : '', paid: e.paid !== false, paidOn: e.paidOn ? ymd(e.paidOn) : today() })

  if (editBill) return <BillForm bill={bill} onClose={() => setEditBill(false)} />
  return (
    <Sheet onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{kind.icon} {bill.name}</div>
        <button className="btn-secondary" style={{ height: 34, padding: '0 16px', fontSize: 12 }} onClick={() => { setEditing(!editing); setForm(false); setEd(null) }}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '4px 0 12px' }}>
        {kind.label}{bill.provider ? ` · ${bill.provider}` : ''}{bill.accountNo || bill.last4 ? ` · ${bill.accountNo || '••' + bill.last4}` : ''}{!gas ? ` · ${cycleLabel(bill.cycle)}` : ''}{bill.nextDue ? ` · next due ${dueText(bill.nextDue)}` : ''}
      </div>

      {elec && use && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Consumption</div>
          {mine.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Tap Edit, then log each bill with its units to see how your use changes.</div>}
          {mine.length > 0 && (
            <>
              {use.rows.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <Stat label="Average a month" value={`${Math.round(use.avgPerMonth)} units`} />
                  <Stat label="Highest bill" value={`${use.highest.units} units`} />
                </div>
              )}
              {(showAll ? mine : mine.slice(0, 12)).map((e, i) => {
                const r = use.rows.find(x => x.id === e.id)
                return (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.9fr 1.1fr', gap: 8, alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    {/* column 1: month and year (bold), then the meter reading, then the paid status */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{format(new Date(e.date), 'MMM yyyy')}</div>
                      <div style={{ color: 'var(--txt2)', marginTop: 2 }}>{e.reading != null ? <>Reading <b style={{ color: 'var(--txt)' }}>{e.reading}</b></> : 'No reading'}</div>
                      <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: e.paid === false ? 'var(--red)' : 'var(--mint-dim)' }}>{e.paid === false ? 'Unpaid' : `Paid${e.paidOn ? ' ' + format(new Date(e.paidOn), 'd MMM yyyy') : ''}`}</div>
                    </div>
                    {/* column 2: units consumed, in the middle */}
                    <div style={{ textAlign: 'center' }}>
                      {e.units ? <div style={{ whiteSpace: 'nowrap' }}><span style={{ fontSize: 17, fontWeight: 800 }}>{e.units}</span> <span style={{ fontSize: 11, color: 'var(--txt2)' }}>units</span></div> :<div style={{ fontSize: 11, color: 'var(--txt2)' }}>no units</div>}
                      {r?.change != null && <div style={{ fontSize: 10.5, fontWeight: 600, color: r.change > 0 ? 'var(--red)' : 'var(--mint-dim)' }}>{r.change > 0 ? '+' : ''}{Math.round(r.change)}%</div>}
                    </div>
                    {/* column 3: amount, rupees per unit, and the due date as a tag */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{formatINR(e.amount)}</div>
                      {r?.rate ? <div style={{ fontSize: 10, color: 'var(--txt2)' }}>₹{r.rate.toFixed(2)}/unit</div> : null}
                      <span style={{ display: 'inline-block', marginTop: 3, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border2)', fontSize: 10.5, color: e.paid === false && e.dueDate ? 'var(--red)' : 'var(--txt2)' }}>Due {e.dueDate ? format(new Date(e.dueDate), 'd MMM yyyy') : '—'}</span>
                    </div>
                  </div>
                )
              })}
              {mine.length > 12 && <button className="btn-ghost" style={{ width: '100%', height: 34, fontSize: 12, marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${mine.length} bills`}</button>}
              <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 6 }}>Change compares units a month with the bill before it. Red means you used more.</div>
            </>
          )}
        </div>
      )}

      {gas && g && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Cylinders</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Stat label="One lasts about" value={g.avgDays ? `${g.avgDays} days` : '—'} />
            <Stat label="In use for" value={g.current ? `${g.daysUsed} days` : '—'} />
          </div>
          {g.waiting && <div style={{ fontSize: 12, marginBottom: 6 }}>Booked {format(new Date(g.waiting.bookedOn), 'd MMM yyyy')} ({differenceInCalendarDays(new Date(), new Date(g.waiting.bookedOn))} days ago), not started yet. <button className="btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 11, marginLeft: 6 }} onClick={() => startUsing(g.waiting.id)}>Started using today</button></div>}
          {g.runsOut && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Expected to run out around {format(g.runsOut, 'd MMM yyyy')}{g.bookBy ? `. Book by ${format(g.bookBy, 'd MMM yyyy')}.` : '.'}</div>}
          {!g.avgDays && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>After you log two cylinders with their start dates, this shows how long one lasts and when to book the next.</div>}
        </div>
      )}

      {editing && <button className="btn-secondary" style={{ width: '100%', height: 40, marginBottom: 8 }} onClick={() => setEditBill(true)}>Edit bill details</button>}
      {editing && elec && <button className="btn-secondary" style={{ width: '100%', height: 40, marginBottom: 8 }} onClick={() => setImportOpen(true)}>Import bills from the electricity board's table</button>}
      {editing && !form && <button className="btn-primary" style={{ width: '100%', height: 46 }} onClick={() => setForm(true)}>{gas ? 'Book / log a cylinder' : bill.nextDue ? 'Mark paid / log a bill' : 'Log a bill'}</button>}
      {form && !gas && (
        <div className="card">
          <div className="form-grid">
            <Field label={elec ? 'Date of reading' : 'Date'}><TextField type="date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></Field>
            <Field label="Amount"><TextField type="number" inputMode="decimal" placeholder="0" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} /></Field>
          </div>
          {elec && <div style={{ marginTop: 10 }}><Field label="Due date"><TextField type="date" value={d.dueDate} onChange={e => setD({ ...d, dueDate: e.target.value })} /></Field></div>}
          {elec && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Meter reading" hint={prevReading != null ? `Last reading ${prevReading}` : 'First reading: type the units yourself'}><TextField type="number" inputMode="decimal" placeholder="e.g. 12450" value={d.reading} onChange={e => setD({ ...d, reading: e.target.value, unitsManual: false })} /></Field>
              <Field label="Units consumed" hint={d.unitsManual ? 'Typed by you' : autoUnits != null ? 'Worked out from the readings' : ''}><TextField type="number" inputMode="decimal" placeholder="e.g. 320" value={unitsShown} onChange={e => setD({ ...d, units: e.target.value, unitsManual: true })} /></Field>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, margin: '10px 0' }}>
            <input type="checkbox" checked={d.paid} onChange={e => setD({ ...d, paid: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />{elec ? 'Already paid' : 'Paid. Move the due date to the next one'}
          </label>
          {d.paid && <div style={{ marginBottom: 10 }}><Field label="Paid on"><TextField type="date" value={d.paidOn} onChange={e => setD({ ...d, paidOn: e.target.value })} /></Field></div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ height: 44 }} onClick={() => setForm(false)}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1, height: 44 }} onClick={logBill}>Save</button>
          </div>
        </div>
      )}
      {form && gas && (
        <div className="card">
          <div className="form-grid">
            <Field label="Booked on"><TextField type="date" value={d.bookedOn} onChange={e => setD({ ...d, bookedOn: e.target.value })} /></Field>
            <Field label="Started using on"><TextField type="date" value={d.startedOn} onChange={e => setD({ ...d, startedOn: e.target.value })} /></Field>
          </div>
          <div style={{ margin: '10px 0' }}><Field label="Amount" hint="Leave the start date empty until the cylinder is delivered and in use"><TextField type="number" inputMode="decimal" placeholder="0" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} /></Field></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ height: 44 }} onClick={() => setForm(false)}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1, height: 44 }} onClick={bookGas}>Save</button>
          </div>
        </div>
      )}

      {mine.length > 0 && (!elec || editing) && (
        <>
          <div className="label-caps" style={{ margin: '16px 0 4px' }}>Logged</div>
          {mine.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {gas ? `Booked ${format(new Date(e.bookedOn || e.date), 'd MMM yyyy')}${e.startedOn ? ` · started ${format(new Date(e.startedOn), 'd MMM yyyy')}` : ' · not started'}` : format(new Date(e.date), 'd MMM yyyy')}
                {e.units ? <span style={{ color: 'var(--txt2)' }}> · {e.units} units</span> : null}
                {e.reading != null ? <span style={{ color: 'var(--txt2)' }}> · reading {e.reading}</span> : null}
                {e.dueDate ? <span style={{ color: 'var(--txt2)' }}> · due {format(new Date(e.dueDate), 'd MMM yyyy')}</span> : null}
                {!gas && e.paid === false ? <span style={{ color: 'var(--red)' }}> · unpaid</span> : null}
              </span>
              <b>{e.amount ? formatINR(e.amount) : ''}</b>
              {!gas && e.paid === false && <button className="btn-secondary" style={{ height: 26, padding: '0 10px', fontSize: 11 }} onClick={() => db.bill_entries.update(e.id, { paid: true, paidOn: new Date() })}>Paid</button>}
              {editing && <button className="btn-secondary" style={{ height: 26, padding: '0 10px', fontSize: 11 }} onClick={() => startEdit(e)}>Edit</button>}
              {editing && <button className="btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => removeEntry(e.id)}>✕</button>}
            </div>
          ))}
          {ed && (
            <div className="card" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Edit this entry</div>
              {gas ? (
                <div className="form-grid">
                  <Field label="Booked on"><TextField type="date" value={ed.bookedOn} onChange={e => setEd({ ...ed, bookedOn: e.target.value })} /></Field>
                  <Field label="Started using on"><TextField type="date" value={ed.startedOn} onChange={e => setEd({ ...ed, startedOn: e.target.value })} /></Field>
                </div>
              ) : (
                <div className="form-grid">
                  <Field label={elec ? 'Date of reading' : 'Date'}><TextField type="date" value={ed.date} onChange={e => setEd({ ...ed, date: e.target.value })} /></Field>
                  {elec && <Field label="Due date"><TextField type="date" value={ed.dueDate} onChange={e => setEd({ ...ed, dueDate: e.target.value })} /></Field>}
                  {elec && <Field label="Meter reading"><TextField type="number" inputMode="decimal" value={ed.reading} onChange={e => setEd({ ...ed, reading: e.target.value })} /></Field>}
                  {elec && <Field label="Units consumed"><TextField type="number" inputMode="decimal" value={ed.units} onChange={e => setEd({ ...ed, units: e.target.value })} /></Field>}
                </div>
              )}
              <div style={{ margin: '10px 0' }}><Field label="Amount"><TextField type="number" inputMode="decimal" value={ed.amount} onChange={e => setEd({ ...ed, amount: e.target.value })} /></Field></div>
              {!gas && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 10 }}><input type="checkbox" checked={ed.paid} onChange={e => setEd({ ...ed, paid: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />Paid</label>}
              {!gas && ed.paid && <div style={{ marginBottom: 10 }}><Field label="Paid on"><TextField type="date" value={ed.paidOn} onChange={e => setEd({ ...ed, paidOn: e.target.value })} /></Field></div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ height: 44 }} onClick={() => setEd(null)}>Cancel</button>
                <button className="btn-primary" style={{ flex: 1, height: 44 }} onClick={saveEntry}>Save</button>
              </div>
            </div>
          )}
        </>
      )}
      {editing && <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 14, color: 'var(--red)' }} onClick={remove}>Delete this bill</button>}
      <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 6 }} onClick={onClose}>Close</button>
      {importOpen && <EbImport bill={bill} existing={mine} onClose={() => setImportOpen(false)} />}
    </Sheet>
  )
}

export default function BillsPage() {
  const { setActiveTab, openCard, showNotification } = useStore()
  const data = useLiveQuery(async () => ({
    bills: await db.bills.toArray(), entries: await db.bill_entries.toArray(),
    cards: await db.creditCards.toArray(), policies: await db.policies.toArray(),
  }), [], null)
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [payNow, setPayNow] = useState(false)
  const [cardId, setCardId] = useState(null)
  useBackHandler(adding || openId != null || cardId != null, () => { setAdding(false); setOpenId(null); setPayNow(false); setCardId(null) })

  const items = data ? collectBills(data) : []
  const groupsHere = BILL_GROUPS.filter(g => items.some(i => groupOfKind(i.kind) === g.id))
  const shown = items.filter(i => filter === 'all' || groupOfKind(i.kind) === filter)
  const overdue = items.filter(i => i.state === 'overdue')
  const soon = items.filter(i => ['overdue', 'soon', 'later'].includes(i.state) && i.due && differenceInCalendarDays(new Date(i.due), new Date()) <= 30)
  const total = list => list.reduce((s, i) => s + (i.amount || 0), 0)
  const open = data?.bills.find(b => b.id === openId)

  const tap = i => i.source === 'card' ? setCardId(i.card.id) : i.source === 'policy' ? setActiveTab('insurance') : (setPayNow(false), setOpenId(i.bill.id))
  const groups = [['overdue', 'Overdue'], ['soon', 'Due this week'], ['later', 'Coming up'], ['none', 'No date set'], ['paid', 'Paid']]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Bills" right={<span onClick={() => setAdding(true)} style={{ color: 'var(--gold-dim)', cursor: 'pointer' }} aria-label="Add bill" title="Add bill"><Plus size={22} /></span>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 130px' }}>
        {!data && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Loading…</div>}
        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <Stat label={`Overdue (${overdue.length})`} value={formatINR(total(overdue))} color={overdue.length ? 'var(--red)' : undefined} />
              <Stat label="Due in 30 days" value={formatINR(total(soon))} />
            </div>
            {groupsHere.length > 1 && (
              <div className="chip-scroll" style={{ padding: '0 0 10px' }}>
                <div className={`chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</div>
                {groupsHere.map(g => <div key={g.id} className={`chip${filter === g.id ? ' active' : ''}`} onClick={() => setFilter(g.id)}>{g.icon} {g.label}</div>)}
              </div>
            )}
            {shown.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--txt2)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>No bills yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to add electricity, mobile, broadband or gas. Credit cards and insurance appear here by themselves.</div>
              </div>
            )}
            {groups.map(([st, title]) => {
              const list = shown.filter(i => i.state === st)
              if (!list.length) return null
              return (
                <div key={st} style={{ marginBottom: 12 }}>
                  <div className="label-caps" style={{ margin: '6px 0 4px', color: STATE[st].color }}>{title}</div>
                  <div className="card rows" style={{ paddingTop: 2, paddingBottom: 2 }}>
                    {list.map(i => (
                      <div key={i.key} onClick={() => tap(i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <div style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{kindOf(i.kind).icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{i.sub}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {i.amount != null && st !== 'paid' && <div className="mono-sm">{formatINR(i.amount)}</div>}
                          {i.due && <div style={{ fontSize: 11, color: STATE[st].color }}>{dueText(i.due)}</div>}
                        </div>
                        {i.source === 'bill' && i.kind !== 'gas' && (i.due || i.entryId) && (
                          <button className="btn-secondary" style={{ height: 30, padding: '0 12px', fontSize: 11.5 }} onClick={e => { e.stopPropagation(); if (i.entryId) { db.bill_entries.update(i.entryId, { paid: true, paidOn: new Date() }); showNotification('Marked paid', 'success') } else { setPayNow(true); setOpenId(i.bill.id) } }}>Paid</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 8 }}>Credit card bills come from your card statements (import a statement or let the SMS update them). Tap a card or insurance row to open it.</div>
          </>
        )}
      </div>
      {cardId != null && data?.cards.find(c => c.id === cardId) && <CardBills card={data.cards.find(c => c.id === cardId)} onClose={() => setCardId(null)} onOpenCard={() => { const id = cardId; setCardId(null); openCard(id) }} />}
      {adding && <BillForm onClose={() => setAdding(false)} />}
      {open && data && <BillDetail key={open.id + ':' + payNow} bill={open} entries={data.entries} startOpen={payNow} onClose={() => { setOpenId(null); setPayNow(false) }} />}
    </div>
  )
}
