import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { startOfMonth, subDays, startOfDay, format, addDays, addMonths, differenceInCalendarDays } from 'date-fns'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { TrendingUp, BarChart3, PieChart as PieIcon } from 'lucide-react'
import { db } from '../db/schema'
import { TopBar, formatINR } from '../components/UI'

const PALETTE = ['#E8466C', '#A855F7', '#F5A524', '#6366F1', '#F97316', '#14B8A6', '#06B6D4', '#84CC16', '#EC4899', '#EAB308', '#8B8B8B']
const MODES = [
  { id: 'area', label: 'Area', Icon: TrendingUp },
  { id: 'bar', label: 'Bar', Icon: BarChart3 },
  { id: 'pie', label: 'Pie', Icon: PieIcon },
]
const PERIODS = ['This Month', '7D', '1M', '3M']
const tooltipStyle = { background: '#fff', border: '1px solid rgba(90,60,20,0.18)', borderRadius: 10, fontSize: 12, color: '#2A2119' }

function rangeFor(i, now) {
  if (i === 0) return startOfMonth(now)
  if (i === 1) return startOfDay(subDays(now, 6))
  if (i === 2) return startOfDay(subDays(now, 29))
  return startOfDay(subDays(now, 89))
}

// Daily buckets up to ~31 days, weekly beyond that.
function buildBuckets(start, now) {
  const days = differenceInCalendarDays(now, start) + 1
  const step = days > 35 ? 7 : 1
  const out = []
  for (let d = start; d <= now; d = addDays(d, step)) {
    out.push({ from: d, to: addDays(d, step), label: format(d, step === 1 ? 'd MMM' : 'd MMM'), spend: 0 })
  }
  return out
}

export default function Charts() {
  const [mode, setMode] = useState('area')
  const [period, setPeriod] = useState(0)
  const now = new Date()
  const start = rangeFor(period, now)

  const transactions = useLiveQuery(
    () => db.transactions.filter(t => new Date(t.date) >= start && !t.isExcluded).toArray(),
    [period]
  )
  const txns = transactions || []
  const income = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0)
  const spent = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0)
  const net = income - spent

  const buckets = buildBuckets(start, now)
  const catMap = {}
  for (const t of txns) {
    if (t.type !== 'debit') continue
    const d = new Date(t.date)
    const b = buckets.find(x => d >= x.from && d < x.to)
    if (b) b.spend += t.amount
    const c = t.category || 'General'
    catMap[c] = (catMap[c] || 0) + t.amount
  }
  const cats = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const colorOf = i => PALETTE[i % PALETTE.length]
  const hasData = txns.length > 0
  const fmtTick = v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 100, background: 'linear-gradient(180deg, #FDEBEC 0%, var(--bg0) 280px)' }}>
      <TopBar title="Analytics" />

      <div style={{ padding: '0 16px' }}>
        {/* Chart type */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
          {MODES.map(({ id, label, Icon }) => (
            <div key={id} className={`pill-chip${mode === id ? ' gold' : ''}`} onClick={() => setMode(id)}>
              <Icon size={14} /> {label}
            </div>
          ))}
        </div>

        {/* Period */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
          {PERIODS.map((p, i) => (
            <div key={p} className={`chip${period === i ? ' active' : ''}`} onClick={() => setPeriod(i)}>{p}</div>
          ))}
        </div>

        {/* Period summary */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Period Summary</div>
          <div className="label-caps">Total Spent</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10 }}>{formatINR(spent, 2)}</div>
          <div style={{ background: net >= 0 ? 'var(--mint-bg)' : 'var(--red-bg)', border: `1px solid ${net >= 0 ? 'var(--mint-border)' : 'var(--red-border)'}`, borderRadius: 12, padding: 10 }}>
            <div className="label-caps">Net {net >= 0 ? 'Savings' : 'Expense'} (Period)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: net >= 0 ? 'var(--mint-dim)' : 'var(--red-dim)' }}>
              {net >= 0 ? '+' : '-'}{formatINR(Math.abs(net), 2)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 2 }}>
              Expenses ({formatINR(spent)}) · Income ({formatINR(income)})
            </div>
          </div>
        </div>

        {/* Main chart */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {mode === 'pie' ? 'Category Distribution (Pie)' : mode === 'bar' ? 'Spend (Bar)' : 'Visual Trend'}
          </div>
          {!hasData ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--txt2)', fontSize: 12 }}>No transactions in this period yet.</div>
          ) : mode === 'pie' ? (
            <div style={{ height: 240, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cats} dataKey="value" nameKey="name" innerRadius={62} outerRadius={95} paddingAngle={1} stroke="#fff" strokeWidth={2}>
                    {cats.map((d, i) => <Cell key={d.name} fill={colorOf(i)} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatINR(v), n]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 10, color: 'var(--txt2)' }}>TOTAL</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{formatINR(spent)}</div>
              </div>
            </div>
          ) : (
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                {mode === 'bar' ? (
                  <BarChart data={buckets} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(90,60,20,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#A89A8B', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#A89A8B', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={fmtTick} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(214,69,93,0.06)' }} formatter={v => [formatINR(v), 'Spent']} />
                    <Bar dataKey="spend" fill="#E8466C" radius={[5, 5, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={buckets} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E8466C" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#E8466C" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(90,60,20,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#A89A8B', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#A89A8B', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={fmtTick} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [formatINR(v), 'Spent']} />
                    <Area type="monotone" dataKey="spend" stroke="#E8466C" strokeWidth={2} fill="url(#trendFill)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Category Breakdown</div>
          {cats.length ? (
            <>
              <div style={{ display: 'flex', height: 22, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                {cats.map((c, i) => <div key={c.name} style={{ width: `${(c.value / spent) * 100}%`, background: colorOf(i) }} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 10px' }}>
                {cats.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: colorOf(i), marginTop: 3, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{((c.value / spent) * 100).toFixed(1)}% • {formatINR(c.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txt2)', fontSize: 12 }}>No spends in this period yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
