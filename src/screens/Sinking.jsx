import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { Field, TextField, Picker } from '../components/Fields'
import { SubHeader, formatINR } from '../components/UI'
import { sinkingItems, SINKING_CYCLES } from '../lib/sinking'

const dateText = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const ymd = d => (d ? format(new Date(d), 'yyyy-MM-dd') : '')

function ItemForm({ item, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({ name: item?.name || '', amount: item?.amount ? String(item.amount) : '', cycle: item?.cycle || 'm12', nextDue: ymd(item?.nextDue), note: item?.note || '' })
  const set = p => setF(x => ({ ...x, ...p }))
  const save = async () => {
    if (!f.name.trim() || !(Number(f.amount) > 0)) { showNotification('Enter a name and the amount', 'error'); return }
    const rec = { name: f.name.trim(), amount: Number(f.amount), cycle: f.cycle, nextDue: f.nextDue ? new Date(f.nextDue) : null, note: f.note }
    if (item) await db.sinking_items.update(item.id, rec); else await db.sinking_items.add(rec)
    onClose()
  }
  const remove = async () => { if (await askConfirm({ title: `Delete ${item.name}?`, message: 'It is removed from the set-aside list.', confirmLabel: 'Delete' })) { await db.sinking_items.delete(item.id); onClose() } }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{item ? 'Edit yearly cost' : 'Add a yearly cost'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="What is it"><TextField placeholder="e.g. Car service, Property tax" value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Amount each time"><TextField type="number" inputMode="decimal" placeholder="0" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
            <Field label="Comes round"><Picker value={f.cycle} options={SINKING_CYCLES.map(c => ({ value: c.id, label: c.label }))} onChange={v => set({ cycle: v })} title="How often" /></Field>
          </div>
          <Field label="Next due date"><TextField type="date" value={f.nextDue} onChange={e => set({ nextDue: e.target.value })} /></Field>
          <Field label="Note"><TextField placeholder="Optional" value={f.note} onChange={e => set({ note: e.target.value })} /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 50, padding: '0 22px' }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1, height: 50 }} onClick={save}>Save</button>
          </div>
          {item && <button className="btn-ghost" style={{ height: 44, color: 'var(--red)' }} onClick={remove}>Delete</button>}
        </div>
      </div>
    </div>
  )
}

// Yearly costs as a monthly set-aside: insurance premiums and card annual fees come from the app, and you add your own.
export default function Sinking() {
  const data = useLiveQuery(async () => ({ policies: await db.policies.toArray(), cards: await db.creditCards.toArray(), items: await db.sinking_items.toArray() }), [], null)
  const [form, setForm] = useState(undefined) // undefined: closed, null: new, object: editing
  const s = data ? sinkingItems(data) : null
  const own = id => data.items.find(i => 's' + i.id === id)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubHeader title="Yearly costs" sub="Set aside a little every month" right={<span onClick={() => setForm(null)} style={{ color: 'var(--gold-dim)', cursor: 'pointer' }} aria-label="Add yearly cost" title="Add"><Plus size={22} /></span>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 130px' }}>
        {!s && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Loading…</div>}
        {s && (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="label-caps">Set aside every month</div>
              <div style={{ fontSize: 26, fontWeight: 800, margin: '2px 0' }}>{formatINR(Math.ceil(s.monthlyTotal))}</div>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>to cover {formatINR(Math.round(s.yearlyTotal))} of yearly costs. By now you would have {formatINR(s.savedTotal)} put by.</div>
            </div>
            {s.items.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--txt2)', fontSize: 12.5 }}>Nothing yet. Yearly, half-yearly and quarterly insurance premiums and card annual fees show here by themselves. Tap + to add your own, such as a car service.</div>
            )}
            {s.items.map(x => (
              <div key={x.key} onClick={() => x.source === 'own' && setForm(own(x.key))} className="card" style={{ marginBottom: 8, cursor: x.source === 'own' ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{x.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{x.sub}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-sm">{formatINR(Math.ceil(x.monthly))}<span style={{ fontSize: 10, color: 'var(--txt2)' }}> / month</span></div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{formatINR(Math.round(x.perPeriod))} {x.months === 12 ? 'a year' : `every ${x.months} months`}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--txt2)' }}>Due {dateText(x.next)}{x.daysLeft != null ? ` · ${x.daysLeft < 0 ? `${-x.daysLeft} days ago` : x.daysLeft === 0 ? 'today' : `in ${x.daysLeft} days`}` : ''}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border2)', color: 'var(--mint-dim)', fontWeight: 600 }}>{formatINR(x.savedSoFar)} put by</span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 8 }}>"Put by" is what you would have saved if you had set the monthly amount aside since the last bill. Monthly premiums are left out, since they are already a monthly cost.</div>
          </>
        )}
      </div>
      {form !== undefined && <ItemForm item={form} onClose={() => setForm(undefined)} />}
    </div>
  )
}
