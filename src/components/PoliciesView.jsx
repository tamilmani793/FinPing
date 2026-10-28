import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { differenceInCalendarDays, format } from 'date-fns'
import { ShieldCheck, IndianRupee, Calendar, Building2, FileText, Hash, StickyNote, Repeat, BadgeCheck } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { BtnPrimary, formatINR } from './UI'
import { Field, Segmented, TextField, Picker } from './Fields'
import { useOptionNames } from '../lib/options'
import { FREQUENCIES, freqLabel, monthlyEquivalent, isLive, advanceDue, dueState } from '../lib/policies'

const EMPTY = {
  name: '', insurer: '', type: 'Term insurance', policyNo: '', sumAssured: '', premium: '', frequency: 'monthly',
  nextDueDate: '', endDate: '', maturityAmount: '', notes: '',
}
const day = v => (v ? format(new Date(v), 'yyyy-MM-dd') : '')
const fmtD = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')

function DueBadge({ policy }) {
  const state = dueState(policy)
  if (state === 'unset') return <span className="badge badge-grey">No due date</span>
  const days = differenceInCalendarDays(new Date(policy.nextDueDate), new Date())
  if (state === 'overdue') return <span className="badge badge-red">Overdue {Math.abs(days)}d</span>
  if (days === 0) return <span className="badge badge-amber">Due today</span>
  if (days <= 7) return <span className="badge badge-amber">Due in {days}d</span>
  return <span className="badge badge-grey">Due {format(new Date(policy.nextDueDate), 'd MMM')}</span>
}

export default function PoliciesView() {
  const { showNotification } = useStore()
  const insurers = useOptionNames('insurers')
  const policyTypes = useOptionNames('policyTypes')
  const policies = useLiveQuery(() => db.policies.toArray()) || []
  const [open, setOpen] = useState(false)
  useBackHandler(open, () => setOpen(false))
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  const live = policies.filter(p => isLive(p))
  const perMonth = live.reduce((s, p) => s + monthlyEquivalent(p), 0)
  const cover = live.reduce((s, p) => s + (p.sumAssured || 0), 0)

  const close = () => { setOpen(false); setEditId(null); setForm(EMPTY) }
  const edit = p => {
    setForm({
      name: p.name || '', insurer: p.insurer || '', type: p.type || 'Other', policyNo: p.policyNo || '',
      sumAssured: p.sumAssured ? String(p.sumAssured) : '', premium: String(p.premium ?? ''), frequency: p.frequency || 'monthly',
      nextDueDate: day(p.nextDueDate), endDate: day(p.endDate), maturityAmount: p.maturityAmount ? String(p.maturityAmount) : '', notes: p.notes || '',
    })
    setEditId(p.id); setOpen(true)
    document.querySelector('.screen')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    const premium = parseFloat(form.premium)
    if (!form.name.trim()) { showNotification('Give the policy a name', 'error'); return }
    if (!(premium > 0)) { showNotification('Enter the premium amount', 'error'); return }
    const fields = {
      name: form.name.trim(), insurer: form.insurer.trim(), type: form.type, policyNo: form.policyNo.trim(),
      sumAssured: parseFloat(form.sumAssured) || 0, premium, frequency: form.frequency,
      nextDueDate: form.nextDueDate ? new Date(form.nextDueDate) : null, endDate: form.endDate ? new Date(form.endDate) : null,
      maturityAmount: parseFloat(form.maturityAmount) || 0, notes: form.notes,
    }
    if (editId) await db.policies.update(editId, fields)
    else await db.policies.add({ ...fields, status: 'active', createdAt: new Date() })
    showNotification(editId ? 'Policy updated' : 'Policy added', 'success')
    close()
  }

  const markPaid = async p => {
    const base = p.nextDueDate || new Date()
    await db.policies.update(p.id, { nextDueDate: advanceDue(base, p.frequency), lastPaidOn: new Date() })
    showNotification(`Premium marked paid · next due ${fmtD(advanceDue(base, p.frequency))}`, 'success')
  }

  const remove = async p => {
    if (!window.confirm(`Delete "${p.name}"?`)) return
    await db.policies.delete(p.id)
    showNotification('Policy deleted', 'success')
  }

  return (
    <div style={{ padding: '0 16px' }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <ShieldCheck size={16} color="var(--gold-dim)" />
          <div className="label-caps">Insurance premiums · {live.length} active</div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{formatINR(perMonth)}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt2)' }}> / month</span></div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 2 }}>
          Total cover {formatINR(cover)}. Yearly and quarterly premiums are spread across the months. This amount is part of Home → Monthly EMI.
        </div>
      </div>

      <button className="btn-primary" style={{ width: '100%', height: 42, marginBottom: 12 }} onClick={() => (open && !editId ? close() : (setEditId(null), setForm(EMPTY), setOpen(true)))}>＋ Add policy</button>

      {open && (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>{editId ? 'Edit policy' : 'Add a policy'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Policy name"><TextField icon={<ShieldCheck size={17} />} value={form.name} onChange={set('name')} placeholder="e.g. LIC Jeevan Anand" /></Field>
            <div className="form-grid">
              <Field label="Insurer"><Picker value={form.insurer} options={insurers} onChange={v => setForm({ ...form, insurer: v })} allowCustom icon={<Building2 size={17} />} title="Insurer" placeholder="LIC" clearLabel="Not set" /></Field>
              <Field label="Policy type"><Picker value={form.type} options={policyTypes} onChange={v => setForm({ ...form, type: v })} icon={<FileText size={17} />} title="Policy type" /></Field>
            </div>
            <Field label="Premium paid"><Segmented value={form.frequency} options={FREQUENCIES.map(f => ({ value: f.id, label: f.label }))} onChange={v => setForm({ ...form, frequency: v })} /></Field>
            <div className="form-grid">
              <Field label="Premium"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" value={form.premium} onChange={set('premium')} placeholder="0" /></Field>
              <Field label="Next premium due"><TextField icon={<Calendar size={17} />} type="date" value={form.nextDueDate} onChange={set('nextDueDate')} /></Field>
              <Field label="Sum assured"><TextField icon={<BadgeCheck size={17} />} type="number" inputMode="decimal" value={form.sumAssured} onChange={set('sumAssured')} placeholder="0" /></Field>
              <Field label="Ends / matures on"><TextField icon={<Calendar size={17} />} type="date" value={form.endDate} onChange={set('endDate')} /></Field>
              <Field label="Maturity amount" span hint="Only if the policy pays out at the end."><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" value={form.maturityAmount} onChange={set('maturityAmount')} placeholder="0" /></Field>
            </div>
            <div className="form-grid">
              <Field label="Policy number"><TextField icon={<Hash size={17} />} value={form.policyNo} onChange={set('policyNo')} placeholder="Optional" /></Field>
              <Field label="Notes"><TextField icon={<StickyNote size={17} />} value={form.notes} onChange={set('notes')} placeholder="Optional" /></Field>
            </div>
            {Number(form.premium) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-4px 6px 0' }}>
                {freqLabel(form.frequency)} premium of {formatINR(Number(form.premium))} counts as <b style={{ color: 'var(--txt)' }}>{formatINR(monthlyEquivalent({ premium: Number(form.premium), frequency: form.frequency }))}</b> a month in Monthly EMI.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={close}>Cancel</button>
              <BtnPrimary onClick={save} style={{ flex: 1 }}>{editId ? 'Save changes' : 'Save policy'}</BtnPrimary>
            </div>
          </div>
        </div>
      )}

      {policies.map(p => {
        const liveNow = isLive(p)
        return (
          <div key={p.id} className="card" style={{ marginBottom: 10, opacity: liveNow ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--indigo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ShieldCheck size={19} color="var(--indigo-dim)" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{[p.insurer, p.type, p.policyNo && `#${p.policyNo}`].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{formatINR(p.premium)}</div>
                <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{freqLabel(p.frequency)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 6px', fontSize: 11, color: 'var(--txt2)' }}>
              <span>{p.sumAssured ? `Cover ${formatINR(p.sumAssured)}` : 'Cover not set'}{p.endDate ? ` · till ${fmtD(p.endDate)}` : ''}{p.maturityAmount ? ` · maturity ${formatINR(p.maturityAmount)}` : ''}</span>
              {liveNow ? <DueBadge policy={p} /> : <span className="badge badge-grey">Ended</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 6 }}>
              <button className="btn-secondary" style={{ height: 34, fontSize: 11 }} onClick={() => markPaid(p)} disabled={!liveNow}>✓ Mark paid</button>
              <button className="btn-secondary" style={{ height: 34, fontSize: 11 }} onClick={() => edit(p)}>✎ Edit</button>
              <button className="btn-ghost" style={{ height: 34, fontSize: 11, color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={() => remove(p)}>Delete</button>
            </div>
          </div>
        )
      })}

      {!policies.length && !open && (
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--txt2)', fontSize: 13 }}>
          No policies yet. Add your LIC, term, health or vehicle policies to see their premiums in Monthly EMI.
        </div>
      )}
    </div>
  )
}
