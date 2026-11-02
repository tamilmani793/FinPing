import { Field, TextField } from './Fields'
import { ProgressBar, formatINR } from './UI'
import { coverCheck, useAssets, useSaved } from '../lib/planning'

const lakh = v => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} crore` : Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(1)} lakh` : formatINR(Math.round(v)))

// Is your cover enough? Term cover against about ten times your yearly income, and health cover against a target.
export default function CoverCheck() {
  const a = useAssets()
  const [s, save] = useSaved('finping_cover', { multiple: 10, healthTarget: 1000000, income: '' })
  if (!a) return null
  const c = coverCheck(a, s)
  const termPct = c.needTerm > 0 ? Math.min(100, (c.termCover / c.needTerm) * 100) : 0
  const healthPct = s.healthTarget > 0 ? Math.min(100, (c.healthCover / s.healthTarget) * 100) : 0
  return (
    <div className="card" style={{ margin: '0 16px 12px' }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>Is your cover enough?</div>
      <div style={{ fontSize: 11.5, color: 'var(--txt2)', margin: '2px 0 10px' }}>Term cover is judged against {s.multiple} times your yearly income{c.fromPay > 0 && s.income === '' ? ` (${lakh(c.income)} from your last ${c.months} payslips)` : ''}.</div>

      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>Term (life) cover</div>
      <ProgressBar pct={termPct} variant="gradient" />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
        <span>{lakh(c.termCover)} of {lakh(c.needTerm)}</span>
        <b style={{ color: c.needTerm > 0 && c.termGap === 0 ? 'var(--mint-dim)' : 'var(--red)' }}>{c.needTerm <= 0 ? 'Add income' : c.termGap === 0 ? 'Enough' : `Short by ${lakh(c.termGap)}`}</b>
      </div>
      {c.termCover === 0 && c.needTerm > 0 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>No live term policy found. Endowment and money-back plans give little cover for what they cost, so they are not counted.</div>}

      <div style={{ fontSize: 12.5, fontWeight: 700, margin: '12px 0 3px' }}>Health cover</div>
      <ProgressBar pct={healthPct} variant="gradient" />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
        <span>{lakh(c.healthCover)} of {lakh(num(s.healthTarget))}</span>
        <b style={{ color: c.healthGap === 0 ? 'var(--mint-dim)' : 'var(--red)' }}>{c.healthGap === 0 ? 'Enough' : `Short by ${lakh(c.healthGap)}`}</b>
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 3 }}>Many families keep ₹10 lakh or more in a metro, plus a top-up. Set your own target below.</div>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Term cover: times income"><TextField type="number" inputMode="decimal" value={s.multiple} onChange={e => save({ multiple: e.target.value })} /></Field>
        <Field label="Health cover target"><TextField type="number" inputMode="decimal" value={s.healthTarget} onChange={e => save({ healthTarget: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Yearly income" hint={c.fromPay > 0 ? 'Left empty, your payslips are used' : 'No payslips yet: type your yearly income'}><TextField type="number" inputMode="decimal" placeholder={c.fromPay > 0 ? String(Math.round(c.fromPay)) : '0'} value={s.income} onChange={e => save({ income: e.target.value })} /></Field>
      </div>
    </div>
  )
}
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
