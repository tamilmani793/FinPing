import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { Field, TextField, Picker } from '../components/Fields'
import { SubHeader, ProgressBar, formatINR } from '../components/UI'
import { GOAL_TYPES, goalProgress, goalTarget, useAssets } from '../lib/planning'

const typeOf = id => GOAL_TYPES.find(t => t.id === id) || GOAL_TYPES[3]
const ymd = d => (d ? format(new Date(d), 'yyyy-MM-dd') : '')
const monthsText = n => `${Math.floor(n / 12) ? `${Math.floor(n / 12)} yr ` : ''}${n % 12 ? `${n % 12} mo` : ''}`.trim() || 'now'

function GoalForm({ goal, assets, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({
    name: goal?.name || '', type: goal?.type || 'emergency', target: goal?.target ? String(goal.target) : '', months: String(goal?.months || 6),
    targetDate: ymd(goal?.targetDate), monthly: goal?.monthly ? String(goal.monthly) : '', returnPct: String(goal?.returnPct ?? 8), sources: goal?.sources || [],
  })
  const set = p => setF(x => ({ ...x, ...p }))
  const t = typeOf(f.type)
  const toggle = k => set({ sources: f.sources.includes(k) ? f.sources.filter(x => x !== k) : [...f.sources, k] })
  const groups = [...new Set(assets.sources.map(s => s.group))]
  const save = async () => {
    if (f.type !== 'emergency' && !(Number(f.target) > 0)) { showNotification('Enter the target amount', 'error'); return }
    const rec = {
      name: f.name.trim() || t.label, type: f.type, target: f.type === 'emergency' ? null : Number(f.target), months: f.type === 'emergency' ? Number(f.months) || 6 : null,
      targetDate: f.targetDate ? new Date(f.targetDate) : null, monthly: Number(f.monthly) || 0, returnPct: Number(f.returnPct) || 0, sources: f.sources,
    }
    if (goal) await db.goals.update(goal.id, rec); else await db.goals.add({ ...rec, createdAt: new Date() })
    onClose()
  }
  const remove = async () => { if (await askConfirm({ title: `Delete ${goal.name}?`, message: 'The goal is removed. Your assets are not touched.', confirmLabel: 'Delete' })) { await db.goals.delete(goal.id); onClose() } }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{goal ? 'Edit goal' : 'New goal'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Kind of goal" hint={t.hint}><Picker value={f.type} options={GOAL_TYPES.map(x => ({ value: x.id, label: x.label, icon: x.icon }))} onChange={v => set({ type: v })} title="Kind of goal" /></Field>
          <Field label="Name"><TextField placeholder={t.label} value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
          {f.type === 'emergency'
            ? <Field label="Months of expenses to keep" hint="Six months is the usual advice; more if your income is uneven"><TextField type="number" inputMode="numeric" value={f.months} onChange={e => set({ months: e.target.value })} /></Field>
            : <div className="form-grid">
              <Field label="Target amount"><TextField type="number" inputMode="decimal" placeholder="0" value={f.target} onChange={e => set({ target: e.target.value })} /></Field>
              <Field label="By when"><TextField type="date" value={f.targetDate} onChange={e => set({ targetDate: e.target.value })} /></Field>
            </div>}
          <div className="form-grid">
            <Field label="You put in each month"><TextField type="number" inputMode="decimal" placeholder="0" value={f.monthly} onChange={e => set({ monthly: e.target.value })} /></Field>
            <Field label="Expected return a year %"><TextField type="number" inputMode="decimal" value={f.returnPct} onChange={e => set({ returnPct: e.target.value })} /></Field>
          </div>
          <div>
            <div className="label-caps" style={{ marginBottom: 6 }}>Counts towards this goal</div>
            {assets.sources.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Add a bank account balance or an investment first, then tick it here.</div>}
            {groups.map(g => (
              <div key={g} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '4px 0' }}>{g}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {assets.sources.filter(s => s.group === g).map(s => <div key={s.key} className={`chip${f.sources.includes(s.key) ? ' active' : ''}`} onClick={() => toggle(s.key)}>{s.label} · {formatINR(s.value)}</div>)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 50, padding: '0 22px' }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1, height: 50 }} onClick={save}>Save</button>
          </div>
          {goal && <button className="btn-ghost" style={{ height: 44, color: 'var(--red)' }} onClick={remove}>Delete this goal</button>}
        </div>
      </div>
    </div>
  )
}

// Goals: an emergency fund, a down payment, a retirement corpus... each drawing on the assets you tick, with where it is heading.
export default function Goals() {
  const { setActiveTab } = useStore()
  const goals = useLiveQuery(() => db.goals.toArray(), [], null)
  const assets = useAssets()
  const [form, setForm] = useState(undefined) // undefined: closed, null: new, object: editing
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubHeader title="Goals" sub="What you are saving for" right={<span onClick={() => assets && setForm(null)} style={{ color: 'var(--gold-dim)', cursor: 'pointer' }} aria-label="Add goal" title="Add goal"><Plus size={22} /></span>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 130px' }}>
        {(!goals || !assets) && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Loading…</div>}
        {goals && assets && (
          <>
            {goals.length === 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Start with an emergency fund</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '4px 0 10px' }}>Six months of your expenses (about {formatINR(Math.round(assets.avgSpend * 6))} at your recent spending), kept in an account you can reach.</div>
                <button className="btn-primary" style={{ width: '100%', height: 44 }} onClick={() => setForm(null)}>Add a goal</button>
              </div>
            )}
            {goals.map(g => {
              const p = goalProgress(g, assets), t = typeOf(g.type)
              return (
                <div key={g.id} className="card" onClick={() => setForm(g)} style={{ marginBottom: 10, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 22 }}>{t.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{t.label}{g.targetDate ? ` · by ${format(new Date(g.targetDate), 'd MMM yyyy')}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: p.onTrack ? 'var(--mint-bg, #e6f4ec)' : '#fdecea', color: p.onTrack ? 'var(--mint-dim)' : 'var(--red)' }}>{p.onTrack ? (p.months == null ? 'Reached' : 'On track') : 'Short'}</span>
                  </div>
                  <div style={{ margin: '10px 0 4px' }}><ProgressBar pct={p.pct} variant="gradient" /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span><b>{formatINR(p.current)}</b> of {formatINR(p.target)}</span><b>{Math.round(p.pct)}%</b>
                  </div>
                  {g.type === 'emergency' && p.coveredMonths != null && <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginTop: 4 }}>Covers {p.coveredMonths.toFixed(1)} months of expenses (you spend about {formatINR(Math.round(assets.avgSpend))} a month). Target {g.months || 6} months.</div>}
                  {p.months != null && (
                    <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginTop: 4 }}>
                      {p.months === 0 ? 'The date has arrived.' : `${monthsText(p.months)} to go. At ${g.returnPct ?? 8}% a year you would have about ${formatINR(Math.round(p.projected))}`}
                      {p.months > 0 && p.needMonthly != null && (p.onTrack ? '. You are putting in enough.' : `. To reach it, put in about ${formatINR(Math.ceil(p.needMonthly))} a month${p.monthly ? ` (you put ${formatINR(p.monthly)})` : ''}.`)}
                    </div>
                  )}
                  {!(g.sources || []).length && <div style={{ fontSize: 11, color: 'var(--amber, #D97706)', marginTop: 4 }}>Tap to choose the accounts and investments that count.</div>}
                </div>
              )
            })}
            <div className="card" onClick={() => setActiveTab('retirement')} style={{ cursor: 'pointer', marginTop: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🌴 Retirement projection</div>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>See what your EPF, PPF, NPS and funds could grow to by the age you pick, and what you need.</div>
            </div>
          </>
        )}
      </div>
      {form !== undefined && assets && <GoalForm goal={form} assets={assets} onClose={() => setForm(undefined)} />}
    </div>
  )
}
