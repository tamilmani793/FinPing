import { useLiveQuery } from 'dexie-react-hooks'
import { startOfMonth, endOfMonth, format, differenceInCalendarDays } from 'date-fns'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, TxnRow, Divider, LabelCaps, MonoLg, formatINR, getMerchantIcon, formatDate } from '../components/UI'
import { useStore } from '../store'

const CATEGORY_COLORS = {
  'Food Delivery': '#10B981', 'E-Commerce': '#6366F1', 'Utilities & Bills': '#F59E0B',
  'Transport': '#8B5CF6', 'Health': '#EC4899', 'Fuel': '#F97316', 'Rent': '#EF4444',
  'Grocery': '#14B8A6', 'Travel Online': '#06B6D4', 'General': '#6B7280',
}

export default function Dashboard() {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const transactions = useLiveQuery(() =>
    db.transactions.filter(t => {
      const d = new Date(t.date)
      return d >= monthStart && d <= monthEnd
    }).toArray()
  , [])

  const cards = useLiveQuery(() => db.creditCards.toArray())
  const debts = useLiveQuery(() => db.debts.where('status').equals('active').toArray())
  const investments = useLiveQuery(() => db.investments.toArray())

  const totalSpent = (transactions || []).filter(t => t.type === 'debit' && !t.isExcluded).reduce((s, t) => s + t.amount, 0)
  const totalCashback = (transactions || []).filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0)
  const totalDebt = (debts || []).reduce((s, d) => s + d.currentOutstanding, 0)
  const totalInvestments = (investments || []).reduce((s, i) => s + i.currentValue, 0)

  // Category breakdown
  const catMap = {}
  for (const t of (transactions || [])) {
    if (t.type === 'debit' && !t.isExcluded) {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount
    }
  }
  const pieData = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  const recent = [...(transactions || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)

  // Due date alerts
  const dueCards = (cards || []).filter(c => c.currentBalance > 0)

  const cap = 90000
  const spentPct = Math.min(100, Math.round(totalSpent / cap * 100))
  const daysLeft = Math.max(0, differenceInCalendarDays(monthEnd, now))
  const burn = Math.round(totalSpent / Math.max(1, now.getDate()))

  const { setActiveTab } = useStore()

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      <TopBar sub="Dashboard" />

      <div style={{ padding: '10px 16px 0' }}>
        {/* Monthly Telemetry */}
        <Card style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <LabelCaps>Monthly Spend Telemetry</LabelCaps>
            <Badge variant="amber">{spentPct}% Consumed · {daysLeft} days left</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <MonoLg>{formatINR(totalSpent)}</MonoLg>
            <span style={{ fontSize: 13, color: 'var(--txt2)' }}>/ ₹90,000 cap</span>
          </div>
          <ProgressBar pct={spentPct} variant="gradient" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
            <span style={{ color: 'var(--mint)' }}>● Burn Rate: {formatINR(burn)}/day</span>
            <span style={{ color: 'var(--txt2)' }}>{formatINR(Math.max(0, cap - totalSpent))} safe to spend</span>
          </div>
          <Divider />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid var(--mint-border)', borderRadius: 8, padding: 10 }}>
              <LabelCaps style={{ marginBottom: 4 }}>Fee Waivers</LabelCaps>
              <div className="mono-md" style={{ color: 'var(--mint)' }}>{formatINR(0)}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)' }}>unlocked</div>
            </div>
            <div style={{ background: 'var(--indigo-bg)', border: '1px solid var(--indigo-border)', borderRadius: 8, padding: 10 }}>
              <LabelCaps style={{ marginBottom: 4 }}>Cashback Accrued</LabelCaps>
              <div className="mono-md" style={{ color: 'var(--indigo-dim)' }}>{formatINR(totalCashback)}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)' }}>this cycle</div>
            </div>
          </div>
        </Card>

        {/* Period Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['This Month', 'Last 30 Days', 'Quarterly'].map((t, i) => (
            <div key={t} style={{ flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: i === 0 ? 'var(--mint-bg)' : 'transparent', color: i === 0 ? 'var(--mint-dim)' : 'var(--txt2)', border: i === 0 ? '1px solid var(--mint-border)' : '1px solid var(--border2)' }}>{t}</div>
          ))}
        </div>

        {/* Spend Allocation with mini chart */}
        <SectionHdr title="Spend Allocation" right={<Badge variant="grey">{pieData.length} DETECTED VERTICALS</Badge>} />
        <Card style={{ marginBottom: 10 }}>
          {pieData.slice(0, 5).map(({ name, value }) => {
            const pct = totalSpent ? Math.round(value / totalSpent * 100) : 0
            const color = CATEGORY_COLORS[name] || '#6B7280'
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13 }}>{name}</div>
                <div className="mono-sm">{formatINR(value)}</div>
                <div style={{ fontSize: 10, background: `${color}20`, color, border: `1px solid ${color}40`, borderRadius: 9999, padding: '1px 6px', fontWeight: 600, marginLeft: 4, minWidth: 34, textAlign: 'center' }}>{pct}%</div>
              </div>
            )
          })}
        </Card>

        {/* Due Date Alerts */}
        {dueCards.length > 0 && (
          <>
            <SectionHdr title="Payment Alerts" right={<Badge variant="red">ACTION NEEDED</Badge>} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {dueCards.map(c => (
                <div key={c.id} style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 8, padding: '6px 10px' }}>
                  <div style={{ fontSize: 11, color: '#FCA5A5', fontWeight: 600 }}>{c.name}</div>
                  <div className="mono-sm" style={{ color: 'var(--red)' }}>{formatINR(c.currentBalance)} due</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Live Parsed Feeds */}
        <SectionHdr title="Live Parsed Feeds" right={<Badge variant="indigo">AUTO-CLASSIFIED</Badge>} />
        <Card style={{ padding: '10px 14px' }}>
          {recent.map(t => (
            <TxnRow
              key={t.id}
              icon={getMerchantIcon(t.merchant)}
              merchant={t.merchant}
              meta={`${t.bank ? t.bank.split(' ')[0] : ''} · ${formatDate(t.date)}`}
              amount={t.amount}
              isCredit={t.type === 'credit'}
              tags={t.tags}
              badge={t.type === 'credit' ? <Badge variant="mint" style={{ fontSize: 9 }}>+Cashback</Badge> : null}
            />
          ))}
          {(!recent.length) && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txt2)', fontSize: 13 }}>No transactions this month yet.<br />Share a bank SMS to get started.</div>
          )}
        </Card>
      </div>
    </div>
  )
}
