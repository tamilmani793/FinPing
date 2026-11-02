import { useState } from 'react'
import { format } from 'date-fns'
import { IndianRupee, Percent } from 'lucide-react'
import { Field, TextField } from './Fields'
import { formatINR } from './UI'
import { prepayWhatIf, isFlexible } from '../lib/prepay'

const monthsText = n => `${Math.floor(n / 12) ? `${Math.floor(n / 12)} yr ` : ''}${n % 12 ? `${n % 12} mo` : ''}`.trim() || '0 mo'

// Prepayment what-if for one loan: nothing is saved, it only shows the effect of paying extra.
// A flexible loan (cash credit, overdraft, flexible repayment) has no fixed EMI, so you say what you pay each month.
export default function PrepaySheet({ debt, onClose }) {
  const flex = isFlexible(debt)
  const [pay, setPay] = useState(debt.emiAmount > 0 ? String(debt.emiAmount) : '')
  const [extra, setExtra] = useState('')
  const [monthly, setMonthly] = useState('')
  const [ret, setRet] = useState('12')
  const e = Math.max(0, Number(extra) || 0), m = Math.max(0, Number(monthly) || 0), p = Math.max(0, Number(pay) || 0)
  const r = prepayWhatIf(debt, { extra: e, monthly: m, returnPct: Number(ret) || 0, pay: p })
  const ready = flex ? p > 0 : r.base.remaining > 0
  const Row = ({ k, v, color, bold }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5 }}><span style={{ color: 'var(--txt2)' }}>{k}</span><span style={{ fontWeight: bold ? 800 : 600, color }}>{v}</span></div>
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={ev => ev.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Prepay what-if</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 12px' }}>{debt.name} · {formatINR(debt.currentOutstanding)} owed at {debt.interestRate || 0}%{flex ? '' : ` · EMI ${formatINR(debt.emiAmount)}`}. Nothing is saved; this only shows the effect.</div>

        {flex && (
          <div style={{ marginBottom: 12 }}>
            <Field label="What you pay each month" hint={`This loan has no fixed EMI. Interest alone is about ${formatINR(r.interestOnly)} a month, so pay more than that to bring it down.`}>
              <TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="e.g. 15000" value={pay} onChange={x => setPay(x.target.value)} />
            </Field>
          </div>
        )}
        {!flex && !ready && <div style={{ fontSize: 12.5, color: 'var(--txt2)' }}>This loan needs an amount still owed before the schedule can be worked out. Edit the debt to add it.</div>}
        {flex && p > 0 && r.base.neverEnds && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10 }}>{formatINR(p)} a month only covers the interest, so the loan never comes down. Pay more than {formatINR(r.interestOnly)}.</div>}

        {ready && !r.base.neverEnds && (
          <>
            <div className="form-grid">
              <Field label="Pay extra once, now"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={extra} onChange={x => setExtra(x.target.value)} /></Field>
              <Field label="Extra every month"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={monthly} onChange={x => setMonthly(x.target.value)} /></Field>
            </div>
            <div className="chip-scroll" style={{ padding: '8px 0' }}>
              {[10000, 25000, 50000, 100000].map(v => <div key={v} className="chip" onClick={() => setExtra(String(v))}>{formatINR(v)}</div>)}
            </div>
            <div className="card" style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{flex ? `Paying ${formatINR(p)} a month` : 'As it is today'}</div>
              <Row k="Months left" v={monthsText(r.base.remaining)} />
              <Row k="Interest still to pay" v={formatINR(r.base.totalInterest)} />
              <Row k="Ends" v={r.base.endDate ? format(new Date(r.base.endDate), 'd MMM yyyy') : '—'} />
            </div>
            {(e > 0 || m > 0) && (
              <>
                <div className="card" style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>If you pay the extra</div>
                  {r.closes ? <div style={{ fontSize: 12.5, color: 'var(--mint-dim)', fontWeight: 700 }}>This clears the loan today.</div> : (
                    <>
                      <Row k="Months left" v={monthsText(r.after.remaining)} />
                      <Row k="Ends" v={r.after.endDate ? format(new Date(r.after.endDate), 'd MMM yyyy') : '—'} />
                    </>
                  )}
                  <Row k="Interest saved" v={formatINR(r.interestSaved)} color="var(--mint-dim)" bold />
                  <Row k="Time saved" v={monthsText(r.monthsCut)} color="var(--mint-dim)" bold />
                </div>
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Or invest the same money</div>
                  <div style={{ maxWidth: 190 }}><Field label="Expected return a year"><TextField icon={<Percent size={16} />} type="number" inputMode="decimal" value={ret} onChange={x => setRet(x.target.value)} /></Field></div>
                  <Row k={`Growth on ${formatINR(r.putIn)} over ${monthsText(r.base.remaining)}`} v={formatINR(r.investGain)} />
                  <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: r.better === 'prepay' ? 'var(--mint-dim)' : 'var(--amber, #D97706)' }}>
                    {r.better === 'prepay' ? `Prepaying saves ${formatINR(r.interestSaved - r.investGain)} more than investing.` : `Investing could earn ${formatINR(r.investGain - r.interestSaved)} more than prepaying.`}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 4 }}>Before tax, and investing carries risk while the interest saved is certain. If the loan rate is higher than what you can safely earn, prepaying usually wins.</div>
                </div>
              </>
            )}
          </>
        )}
        <button className="btn-ghost" style={{ width: '100%', height: 44, marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
