import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { differenceInCalendarDays, format } from 'date-fns'
import { ShieldCheck } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { BtnPrimary, formatINR } from './UI'
import { POLICY_TYPES, INSURERS, FREQUENCIES, freqLabel, monthlyEquivalent, isLive, advanceDue, dueState } from '../lib/policies'

const EMPTY = {
  name: '', insurer: '', type: 'Term insurance', policyNo: '', sumAssured: '', premium: '', frequency: 'monthly',
  nextDueDate: '', endDate: '', maturityAmount: '', notes: '',
}
const day = v => (v ? format(new Date(v), 'yyyy-MM-dd') : '')
const fmtD = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')

function Field({ label, children }) {
  return (
    <div>
      <div className="label-caps" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

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
  const policies = useLiveQuery(() => db.policies.toArray()) || []
  const [open, setOpen] = useState(false)
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
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="label-caps" style={{ marginBottom: 8 }}>{editId ? 'Edit policy' : 'Add policy'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Policy name"><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. LIC Jeevan Anand, HDFC Click 2 Protect" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Insurer"><input className="input" list="dl-insurers" value={form.insurer} onChange={set('insurer')} placeholder="LIC" /></Field>
              <Field label="Policy type">
                <select className="input" value={form.type} onChange={set('type')}>{POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              </Field>
              <Field label="Premium (₹)"><input className="input" type="number" inputMode="decimal" value={form.premium} onChange={set('premium')} /></Field>
              <Field label="Paid">
                <select className="input" value={form.frequency} onChange={set('frequency')}>{FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
              </Field>
              <Field label="Next premium due"><input className="input" type="date" value={form.nextDueDate} onChange={set('nextDueDate')} /></Field>
              <Field label="Sum assured (₹)"><input className="input" type="number" inputMode="decimal" value={form.sumAssured} onChange={set('sumAssured')} /></Field>
              <Field label="Policy ends / matures on"><input className="input" type="date" value={form.endDate} onChange={set('endDate')} /></Field>
              <Field label="Maturity amount (₹, if any)"><input className="input" type="number" inputMode="decimal" value={form.maturityAmount} onChange={set('maturityAmount')} /></Field>
            </div>
            <Field label="Policy number (optional)"><input className="input" value={form.policyNo} onChange={set('policyNo')} /></Field>
            <Field label="Notes (optional)"><input className="input" value={form.notes} onChange={set('notes')} /></Field>
            {Number(form.premium) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--txt2)' }}>
                {freqLabel(form.frequency)} premium of {formatINR(Number(form.premium))} counts as <b style={{ color: 'var(--txt)' }}>{formatINR(monthlyEquivalent({ premium: Number(form.premium), frequency: form.frequency }))}</b> a month in Monthly EMI.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <BtnPrimary onClick={save} style={{ flex: 1 }}>{editId ? 'Save changes' : 'Save policy'}</BtnPrimary>
              <button className="btn-ghost" style={{ height: 46 }} onClick={close}>Cancel</button>
            </div>
          </div>
          <datalist id="dl-insurers">{INSURERS.map(i => <option key={i} value={i} />)}</datalist>
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
