import { useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronRight } from 'lucide-react'
import { Field, TextField } from '../components/Fields'
import { SubHeader, formatINR } from '../components/UI'
import { askConfirm } from '../lib/confirm'
import { epsProjection } from '../lib/pf'
import { PART_START, RETIRE_BASICS, retirementProjection, useAssets, useSaved } from '../lib/planning'

const crore = v => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} crore` : Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(1)} lakh` : formatINR(Math.round(v)))
const COLORS = { epf: '#0EA5E9', ppf: '#D97706', nps: '#8B5CF6', market: '#2f8f63', other: '#B8924A' }

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
const Line = ({ k, v, bold, color }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13 }}><span style={{ color: 'var(--txt2)' }}>{k}</span><span style={{ fontWeight: bold ? 800 : 600, color }}>{v}</span></div>

// one kind of money (provident fund, PPF, NPS...): its details, then Edit to change the contribution, the yearly rise and the return.
// Nothing changes until you Save; Reset puts back the app's own figures.
function PartSheet({ part, p, save, onClose }) {
  const ppf = part.key === 'ppf'
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ monthly: String(ppf ? part.monthly * 12 : part.monthly), raise: String(part.raise), rate: String(part.rate) })
  const set = x => setF(o => ({ ...o, ...x }))
  const onSave = () => {
    const monthly = Math.round(((Number(f.monthly) || 0) / (ppf ? 12 : 1)) * 100) / 100
    // only what differs from the app's figures is kept, so "changed" means changed
    const mine = {}
    if (part.key !== 'other') { if (monthly !== part.initial.monthly) mine.monthly = monthly; if ((Number(f.raise) || 0) !== part.initial.raise) mine.raise = Number(f.raise) || 0 }
    if ((Number(f.rate) || 0) !== part.initial.rate) mine.rate = Number(f.rate) || 0
    const parts = { ...(p.savedParts || {}) }
    if (Object.keys(mine).length) parts[part.key] = mine; else delete parts[part.key]
    save({ parts })
    onClose()
  }
  const onReset = () => {
    const rest = { ...(p.savedParts || {}) }; delete rest[part.key]
    save({ parts: rest })
    const i = part.initial
    setF({ monthly: String(ppf ? i.monthly * 12 : i.monthly), raise: String(i.raise), rate: String(i.rate) })
    setEditing(false)
  }
  return (
    <Sheet onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: COLORS[part.key] }} />
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>{part.label}</div>
        {!editing && <button className="btn-secondary" style={{ height: 34, padding: '0 16px', fontSize: 12 }} onClick={() => setEditing(true)}>Edit</button>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 10px' }}>{part.note}{part.edited ? ' You have changed some of these figures.' : ''}</div>

      {!editing ? (
        <div className="card">
          <Line k="Worth today" v={formatINR(Math.round(part.now))} />
          <Line k={ppf ? 'You put in a year' : 'You put in a month'} v={part.key === 'other' ? 'Nothing' : formatINR(Math.round(ppf ? part.monthly * 12 : part.monthly))} />
          <Line k="Contribution rises each year" v={`${part.raise}%`} />
          <Line k="Expected return a year" v={`${part.rate}%`} />
          <Line k="Years to go" v={part.years} />
          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          <Line k="You will have put in" v={formatINR(part.putIn)} />
          <Line k="Growth on top" v={formatINR(Math.max(0, part.growth))} color="var(--mint-dim)" />
          <Line k="At retirement" v={crore(part.at)} bold />
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {part.key !== 'other' && <Field label={ppf ? 'You put in a year' : 'You put in a month'} hint={`The app's figure: ${formatINR(Math.round(ppf ? part.initial.monthly * 12 : part.initial.monthly))}`}><TextField type="number" inputMode="decimal" value={f.monthly} onChange={e => set({ monthly: e.target.value })} /></Field>}
          {part.key !== 'other' && <Field label="It rises each year by %" hint={part.key === 'epf' ? 'Your pay rise: the PF follows it' : 'A yearly step-up, for example 5 or 7'}><TextField type="number" inputMode="decimal" value={f.raise} onChange={e => set({ raise: e.target.value })} /></Field>}
          <Field label="Expected return a year %"><TextField type="number" inputMode="decimal" value={f.rate} onChange={e => set({ rate: e.target.value })} /></Field>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {editing
          ? <>
            <button className="btn-ghost" style={{ height: 46 }} onClick={() => { setEditing(false); setF({ monthly: String(ppf ? part.monthly * 12 : part.monthly), raise: String(part.raise), rate: String(part.rate) }) }}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1, height: 46 }} onClick={onSave}>Save and see the projection</button>
          </>
          : <button className="btn-primary" style={{ flex: 1, height: 46 }} onClick={onClose}>Close</button>}
      </div>
      {part.edited && <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 8 }} onClick={onReset}>Reset to the app's figures</button>}
    </Sheet>
  )
}

// the plan itself: ages, inflation and monthly spending
function PlanSheet({ p, a, save, resetBasics, onClose }) {
  const b = p.basics
  const [f, setF] = useState({ age: String(b.age), retireAt: String(b.retireAt), lifeTo: String(b.lifeTo), inflation: String(b.inflation), postReturn: String(b.postReturn), expense: p.savedExpense ?? '' })
  const set = x => setF(o => ({ ...o, ...x }))
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Your plan</div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-grid"><Field label="Your age now"><TextField type="number" inputMode="numeric" value={f.age} onChange={e => set({ age: e.target.value })} /></Field><Field label="Retire at"><TextField type="number" inputMode="numeric" value={f.retireAt} onChange={e => set({ retireAt: e.target.value })} /></Field></div>
        <div className="form-grid"><Field label="Plan until age"><TextField type="number" inputMode="numeric" value={f.lifeTo} onChange={e => set({ lifeTo: e.target.value })} /></Field><Field label="Inflation a year %"><TextField type="number" inputMode="decimal" value={f.inflation} onChange={e => set({ inflation: e.target.value })} /></Field></div>
        <Field label="Monthly spending today" hint={`Left empty, your recent average of ${formatINR(Math.round(a.avgSpend))} is used`}><TextField type="number" inputMode="decimal" placeholder={String(Math.round(a.avgSpend))} value={f.expense} onChange={e => set({ expense: e.target.value })} /></Field>
        <Field label="Return after retiring a year %" hint="What the money earns while you spend it"><TextField type="number" inputMode="decimal" value={f.postReturn} onChange={e => set({ postReturn: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-ghost" style={{ height: 46 }} onClick={onClose}>Cancel</button>
        <button className="btn-primary" style={{ flex: 1, height: 46 }} onClick={() => { save({ age: f.age, retireAt: f.retireAt, lifeTo: f.lifeTo, inflation: f.inflation, postReturn: f.postReturn, expense: f.expense }); onClose() }}>Save and see the projection</button>
      </div>
      <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 8 }} onClick={() => { resetBasics(); onClose() }}>Reset the plan to the starting values ({RETIRE_BASICS.age} to {RETIRE_BASICS.retireAt}, {RETIRE_BASICS.inflation}% inflation)</button>
    </Sheet>
  )
}

// Retirement projection: a short summary, then each kind of money as a row. Tap a row for its details, Edit it, Save, and see the projection change.
export default function Retirement() {
  const a = useAssets()
  const [saved, save, resetAll] = useSaved('finping_retire2', {})
  const [open, setOpen] = useState(null) // a part key, or 'plan'
  const p = a ? retirementProjection(saved, a) : null
  if (p) { p.savedParts = saved.parts; p.savedExpense = saved.expense }
  const epsRows = a?.pf && p ? epsProjection(a.pf, p.basics.age) : null
  const part = p && p.parts.find(x => x.key === open)
  const resetBasics = () => save({ age: undefined, retireAt: undefined, lifeTo: undefined, inflation: undefined, postReturn: undefined, expense: undefined })
  const confirmResetAll = async () => { if (await askConfirm({ title: 'Reset everything?', message: 'Your changes on this page are removed and the figures go back to what the app works out from your data.', confirmLabel: 'Reset' })) resetAll() }
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubHeader title="Retirement" sub="Projection to the age you pick" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 130px' }}>
        {!p && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Working it out…</div>}
        {p && (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="label-caps">At {p.basics.retireAt}, you could have</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{crore(p.corpus)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '2px 0 8px' }}>You will need about <b style={{ color: 'var(--txt)' }}>{crore(p.need)}</b> to spend {formatINR(Math.round(p.expense))} a month in today's money, to age {p.basics.lifeTo}.</div>
              {p.eps && <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '0 0 8px' }}>This already counts your EPS pension of <b style={{ color: 'var(--txt)' }}>{formatINR(p.eps.pension)}</b> a month from {p.eps.startAge}, which is worth about {crore(p.epsPV)} at {p.basics.retireAt}.</div>}
              {p.gap > 0
                ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Short by {crore(p.gap)}. About {formatINR(Math.ceil(p.extraMonthly))} more a month into funds would close it.</div>
                : <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mint-dim)' }}>On track, with {crore(-p.gap)} to spare.</div>}
              <div style={{ height: 120, marginTop: 10 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={p.curve} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="age" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Tooltip formatter={v => crore(v)} labelFormatter={l => `Age ${l}`} />
                    <Area type="monotone" dataKey="corpus" stroke="#B8924A" fill="#E8D29A" fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" onClick={() => setOpen('plan')} style={{ marginBottom: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Your plan</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Age {p.basics.age} · retire at {p.basics.retireAt} · to {p.basics.lifeTo} · inflation {p.basics.inflation}%</div>
              </div>
              <ChevronRight size={18} color="var(--txt3)" />
            </div>

            {p.eps && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="label-caps">EPS pension (monthly, for life)</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(p.eps.pension)} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)' }}>a month from age {p.eps.startAge}</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '2px 0 8px' }}>The pension stays the same in rupees, so it buys less as prices rise.</div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                  <Line k="Service so far" v={`${Math.floor(p.eps.serviceMonths / 12)} yr ${p.eps.serviceMonths % 12} mo (from ${p.eps.since})`} />
                  <Line k={`Service at ${p.basics.retireAt}`} v={`${p.eps.years} years`} />
                  <Line k="Pension wage (held at the ₹15,000 ceiling)" v={formatINR(Math.round(p.eps.salary))} />
                  <Line k="Goes into EPS each month" v={formatINR(Math.round(p.eps.monthlyEps))} />
                  <Line k="Wage × service ÷ 70" v={formatINR(Math.round(p.eps.salary * p.eps.years / 70))} />
                  {p.eps.adj !== 1 && <Line k={`Starting at ${p.eps.startAge} instead of 58`} v={`${p.eps.adj > 1 ? '+' : ''}${Math.round((p.eps.adj - 1) * 100)}%`} />}
                  <Line k="Pension each month" v={formatINR(p.eps.pension)} bold color="var(--mint-dim)" />
                  <Line k="EPS balance by then" v={crore(p.eps.balance)} />
                  <Line k={`Worth at ${p.basics.retireAt} (to age ${p.basics.lifeTo})`} v={crore(p.epsPV)} />
                </div>
                {epsRows && epsRows.rows.length > 0 && <>
                  <div className="label-caps" style={{ margin: '8px 0 2px' }}>If you start it at another age</div>
                  {epsRows.rows.map(r => <Line key={r.age} k={`At ${r.age} · ${r.years} yr service`} v={r.pension ? `${formatINR(r.pension)} a month` : 'no pension'} />)}
                </>}
                <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 6 }}>A pension needs 10 years of service. Starting before 58 cuts it 4% for each year; after 58, up to 60, adds 4% a year. It assumes you keep working and the ceiling stays. Service with an earlier employer that paid no pension is not counted. An estimate; EPFO decides the amount.</div>
              </div>
            )}

            <div className="label-caps" style={{ margin: '0 4px 6px' }}>Where it comes from · tap one for details</div>
            <div className="card rows" style={{ paddingTop: 2, paddingBottom: 2, marginBottom: 14 }}>
              {p.parts.map(x => (
                <div key={x.key} onClick={() => setOpen(x.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[x.key], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{x.label}{x.edited && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--gold-dim)', fontWeight: 700 }}>CHANGED</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{formatINR(Math.round(x.now))} today · {x.rate}% a year</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-sm">{crore(x.at)}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{p.corpus > 0 ? Math.round(x.at / p.corpus * 100) : 0}% of the total</div>
                  </div>
                  <ChevronRight size={16} color="var(--txt3)" />
                </div>
              ))}
            </div>

            {p.edited && <button className="btn-ghost" style={{ width: '100%', height: 42, marginBottom: 10 }} onClick={confirmResetAll}>Reset everything to the app's figures</button>}
            <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>An estimate, not advice. It assumes steady returns and contributions until you retire, spending that rises with inflation, and the money growing at the "after retiring" rate while you spend it. Real returns vary year to year.</div>
          </>
        )}
      </div>
      {part && <PartSheet key={part.key} part={part} p={p} save={save} onClose={() => setOpen(null)} />}
      {open === 'plan' && p && <PlanSheet p={p} a={a} save={save} resetBasics={resetBasics} onClose={() => setOpen(null)} />}
    </div>
  )
}
