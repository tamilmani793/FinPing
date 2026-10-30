import { Calendar, Search, Landmark } from 'lucide-react'
import { format } from 'date-fns'
import { Picker, TextField, Segmented } from './Fields'
import { PERIOD_OPTIONS, rangeFor, accountKind } from '../lib/dateRange'
import { cardTitle } from '../lib/cardCatalog'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The same date filter everywhere: a period picker, the extra fields that period needs (custom dates, or a month and year) and, where it
// makes sense, money in / money out. `periods` limits the choices (Charts has no "All time"); `direction` adds the Both / In / Out switch.
export default function PeriodFilter({ value, onChange, periods, title = 'Show transactions from', direction = false, showRange = false, search = false, accounts = null }) {
  const set = patch => onChange({ ...value, ...patch })
  const options = periods ? PERIOD_OPTIONS.filter(p => periods.includes(p.value)) : PERIOD_OPTIONS
  const thisYear = new Date().getFullYear()
  const [a, b] = rangeFor(value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {search && <TextField icon={<Search size={17} />} value={value.q || ''} onChange={e => set({ q: e.target.value })} placeholder="Search name or amount, e.g. Paytm, 2000, >500" aria-label="Search transactions" />}
      {accounts && accounts.length > 0 && (() => {
        const kinds = [['credit', 'All credit cards'], ['debit', 'All debit cards'], ['account', 'All bank accounts']].filter(([k]) => accounts.some(c => accountKind(c) === k))
        const options = [{ value: 'all', label: 'All cards and accounts' }, ...kinds.map(([k, l]) => ({ value: 'type:' + k, label: l })), ...accounts.map(c => ({ value: String(c.id), label: cardTitle(c), sub: accountKind(c) === 'account' ? 'bank account' : accountKind(c) === 'debit' ? 'debit card' : 'credit card' }))]
        return <Picker value={value.acct || 'all'} options={options} onChange={v => set({ acct: v })} title="Cards and accounts" icon={<Landmark size={17} />} />
      })()}
      <Picker value={value.period} options={options} onChange={v => set({ period: v })} title={title} icon={<Calendar size={17} />} />
      {value.period === 'pick' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={value.month} onChange={e => set({ month: +e.target.value })} className="input" style={{ flex: 1, height: 40, borderRadius: 14 }}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={value.year} onChange={e => set({ year: +e.target.value })} className="input" style={{ width: 96, height: 40, borderRadius: 14 }}>
            {Array.from({ length: 8 }, (_, i) => thisYear - 6 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
      {value.period === 'custom' && (
        <div className="form-grid">
          <TextField icon={<Calendar size={17} />} type="date" value={value.from} max={value.to || undefined} onChange={e => set({ from: e.target.value })} placeholder="From" aria-label="From date" />
          <TextField icon={<Calendar size={17} />} type="date" value={value.to} min={value.from || undefined} onChange={e => set({ to: e.target.value })} placeholder="To" aria-label="To date" />
        </div>
      )}
      {direction && <Segmented value={value.dir || 'both'} options={[{ value: 'both', label: 'Both' }, { value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }]} onChange={v => set({ dir: v })} />}
      {showRange && <div style={{ fontSize: 11, color: 'var(--txt2)', padding: '0 4px' }}>{a && b ? `${format(a, 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}` : a ? `From ${format(a, 'd MMM yyyy')}` : b ? `Up to ${format(b, 'd MMM yyyy')}` : 'Everything'}</div>}
    </div>
  )
}
