import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, format, startOfDay } from 'date-fns'
import { Landmark, ShieldCheck, ChevronRight } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { formatINR } from './UI'
import { isLive, monthlyEquivalent, freqLabel } from '../lib/policies'
import { splitPayment, lastRepaymentDate } from '../lib/loanMath'

const fmt = d => (d ? format(new Date(d), 'd MMM') : '—')

// Next date a monthly EMI falls on ("5" -> the coming 5th).
function nextEmiDate(day, now = new Date()) {
  if (!(day >= 1)) return null
  const today = startOfDay(now)
  const pick = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  let d = pick(today.getFullYear(), today.getMonth())
  if (d < today) { const n = addMonths(today, 1); d = pick(n.getFullYear(), n.getMonth()) }
  return d
}

// Every payment that makes up the Home "Monthly EMI" total, with its amount and next due date.
export function useMonthlyEmi() {
  const debts = useLiveQuery(() => db.debts.toArray()) || []
  const policies = useLiveQuery(() => db.policies.toArray()) || []
  const loans = debts.filter(d => d.status !== 'closed' && d.emiAmount > 0)
  const live = policies.filter(p => isLive(p) && p.premium > 0)
  const loanTotal = loans.reduce((s, d) => s + d.emiAmount, 0)
  const policyTotal = live.reduce((s, p) => s + monthlyEquivalent(p), 0)
  return { loans, policies: live, loanTotal, policyTotal, total: loanTotal + policyTotal }
}

function Group({ title, total, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>{title}</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{total}</div>
      </div>
      {children}
    </div>
  )
}

function Item({ icon, title, sub, amount, amountSub, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
      <div className="stat-icon" style={{ width: 34, height: 34, background: 'var(--bg2)', color: 'var(--gold-dim)' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{amount}</div>
        {amountSub && <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{amountSub}</div>}
      </div>
      <ChevronRight size={15} color="var(--txt3)" />
    </div>
  )
}

export default function EmiSheet({ onClose }) {
  const { setActiveTab, setDebtSegment } = useStore()
  const { loans, policies, loanTotal, policyTotal, total } = useMonthlyEmi()
  const repayments = useLiveQuery(() => db.debtRepayments.toArray()) || []
  const go = seg => { setDebtSegment(seg); setActiveTab('debt'); onClose() }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 17, fontWeight: 800 }}>Monthly EMI</div>
        <div style={{ fontSize: 26, fontWeight: 800, margin: '2px 0 2px' }}>{formatINR(total)}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt2)' }}> / month</span></div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 14 }}>Loan EMIs plus insurance premiums. A yearly or quarterly premium is spread over the months.</div>

        <Group title={`Loans · ${loans.length}`} total={`${formatINR(loanTotal)} / mo`}>
          {loans.map(d => {
            // The EMI is interest (daily, on the balance) + principal; only the principal lowers what is left.
            const due = nextEmiDate(d.emiDate)
            const sp = d.interestRate > 0 ? splitPayment(d, d.emiAmount, due || new Date(), lastRepaymentDate(repayments.filter(r => r.debtId === d.id))) : null
            return (
              <Item key={d.id} icon={<Landmark size={17} />} onClick={() => go('loans')}
                title={d.name}
                sub={sp
                  ? <>{[d.lender, due ? `next ${fmt(due)}` : null].filter(Boolean).join(' · ')}<br /><span style={{ color: 'var(--red-dim)' }}>{formatINR(sp.interest)} interest</span> + <span style={{ color: 'var(--mint-dim)' }}>{formatINR(sp.principal)} principal</span></>
                  : `${[d.lender, d.emiDate ? `EMI on the ${d.emiDate}th` : null].filter(Boolean).join(' · ')}${due ? ` · next ${fmt(due)}` : ''}`}
                amount={formatINR(d.emiAmount)} amountSub={`${formatINR(d.currentOutstanding)} left`} />
            )
          })}
          {!loans.length && <div style={{ fontSize: 12, color: 'var(--txt2)', padding: '8px 0' }}>No loans with an EMI. Add one on the Debt screen.</div>}
        </Group>

        <Group title={`Insurance premiums · ${policies.length}`} total={`${formatINR(policyTotal)} / mo`}>
          {policies.map(p => (
            <Item key={p.id} icon={<ShieldCheck size={17} />} onClick={() => go('insurance')}
              title={p.name}
              sub={`${[p.insurer, freqLabel(p.frequency)].filter(Boolean).join(' · ')}${p.nextDueDate ? ` · next ${fmt(p.nextDueDate)}` : ''}`}
              amount={formatINR(monthlyEquivalent(p))} amountSub={p.frequency === 'monthly' ? 'per month' : `${formatINR(p.premium)} ${freqLabel(p.frequency).toLowerCase()}`} />
          ))}
          {!policies.length && <div style={{ fontSize: 12, color: 'var(--txt2)', padding: '8px 0' }}>No insurance policies yet. Add them under Debt → Insurance.</div>}
        </Group>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, fontSize: 14, fontWeight: 800 }}>
          <span>Total per month</span><span>{formatINR(total)}</span>
        </div>
      </div>
    </div>
  )
}
