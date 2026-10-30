import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { startOfMonth, endOfDay, format, addDays, differenceInCalendarDays } from 'date-fns'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { TrendingUp, BarChart3, PieChart as PieIcon } from 'lucide-react'
import { db } from '../db/schema'
import { TopBar, formatINR } from '../components/UI'
import { flowOf, spendOf, isCreditCard } from '../lib/flow'
import PeriodFilter from '../components/PeriodFilter'
import { rangeFor, defaultFilter } from '../lib/dateRange'

const PALETTE = ['#E8466C', '#A855F7', '#F5A524', '#6366F1', '#F97316', '#14B8A6', '#06B6D4', '#84CC16', '#EC4899', '#EAB308', '#8B8B8B']
const MODES = [
  { id: 'area', label: 'Area', Icon: TrendingUp },
  { id: 'bar', label: 'Bar', Icon: BarChart3 },
  { id: 'pie', label: 'Pie', Icon: PieIcon },
]
const tooltipStyle = { background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 10, fontSize: 12, color: 'var(--txt)' }

// [start, end] of the chosen period (the shared filter; an open end falls back to the start of this month / today)
const CHART_PERIODS = ['month', 'lastmonth', 'pick', '7d', '30d', '3m', 'fy', 'pfy', 'custom']
function chartRange(f, now) {
  const [a, b] = rangeFor(f, now)
  const start = a || startOfMonth(now), end = b || endOfDay(now)
  return [start, end < start ? endOfDay(start) : end]
}

// Daily buckets up to ~31 days, weekly beyond that.
function buildBuckets(start, now) {
  const days = differenceInCalendarDays(now, start) + 1
  if (days < 1) return []
  const step = days > 35 ? 7 : 1
  const out = []
  for (let d = start; d <= now; d = addDays(d, step)) {
    out.push({ from: d, to: addDays(d, step), label: format(d, step === 1 ? 'd MMM' : 'd MMM'), spend: 0 })
  }
  return out
}

export default function Charts() {
  const [mode, setMode] = useState('area')
  const [flt, setFlt] = useState(() => defaultFilter())
  const now = new Date()
  const [start, end] = chartRange(flt, now)

  const transactions = useLiveQuery(
    () => db.transactions.filter(t => new Date(t.date) >= start && new Date(t.date) <= end && !t.isExcluded).toArray(),
    [flt.period, +start, +end]
  )
  const txns = transactions || []
  const cardList = useLiveQuery(() => db.creditCards.toArray()) || []
  const cc = new Set(cardList.filter(isCreditCard).map(c => c.id))
  // card refunds, reversals and cashback take money off spending; only credits to accounts are income
  const { spent, income } = flowOf(txns, cardList)
  const net = income - spent

  const buckets = buildBuckets(start, end < now ? end : now)
  const catMap = {}
  for (const t of txns) {
    const amt = spendOf(t, cc)
    if (!amt) continue
    const d = new Date(t.date)
    const b = buckets.find(x => d >= x.from && d < x.to)
    if (b) b.spend += amt
    const c = t.category || 'General'
    catMap[c] = (catMap[c] || 0) + amt
  }
  for (const b of buckets) b.spend = Math.max(0, b.spend)
  const cats = Object.entries(catMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <PeriodFilter value={flt} onChange={setFlt} periods={CHART_PERIODS} title="Show analytics for" showRange />
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
                  <Pie data={cats} dataKey="value" nameKey="name" innerRadius={62} outerRadius={95} paddingAngle={1} stroke="var(--bg1)" strokeWidth={2}>
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
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--txt3)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--txt3)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={fmtTick} />
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
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--txt3)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--txt3)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={fmtTick} />
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
