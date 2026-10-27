import { useLiveQuery } from 'dexie-react-hooks'
import { startOfMonth, subMonths, format } from 'date-fns'
import { ArrowUpRight, ArrowDownLeft, PiggyBank, Receipt, CreditCard, Landmark, TrendingUp, PieChart } from 'lucide-react'
import { db } from '../db/schema'
import { TopBar, TxnRow, formatINR, getMerchantIcon, formatDate } from '../components/UI'
import { useStore } from '../store'
import { getUserName } from '../lib/profile'

function greeting(now) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function pctChange(cur, prev) {
  if (!prev) return null
  return Math.round(((cur - prev) / prev) * 100)
}

function Delta({ cur, prev, goodWhenUp }) {
  const p = pctChange(cur, prev)
  if (p === null) return null
  const up = p >= 0
  const good = up === goodWhenUp
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: good ? 'var(--mint-dim)' : 'var(--red-dim)' }}>
      {up ? '▲' : '▼'} {Math.abs(p)}%
    </span>
  )
}

function Tile({ Icon, tone, label, value, extra, onClick }) {
  const tones = {
    orange: ['#FCE6D6', '#D9701F'], green: ['#DDF3E7', '#2E9E6B'], blue: ['#E2E8FB', '#4A5FD0'],
    gold: ['#F6EBCF', '#A57C2A'], red: ['#FBDDE0', '#D6455D'],
  }
  const [bg, fg] = tones[tone]
  return (
    <div className="stat-tile" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div className="stat-icon" style={{ background: bg, color: fg }}><Icon size={15} /></div>
        <div className="label-caps">{label}</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ marginTop: 2, minHeight: 14 }}>{extra}</div>
    </div>
  )
}

export default function Dashboard() {
  const { setActiveTab } = useStore()
  const now = new Date()
  const monthStart = startOfMonth(now)
  const prevStart = startOfMonth(subMonths(now, 1))

  const txnsAll = useLiveQuery(() => db.transactions.filter(t => new Date(t.date) >= prevStart && !t.isExcluded).toArray()) || []
  const cards = useLiveQuery(() => db.creditCards.toArray()) || []
  const investments = useLiveQuery(() => db.investments.toArray()) || []
  const debts = useLiveQuery(() => db.debts.toArray()) || []

  const cur = txnsAll.filter(t => new Date(t.date) >= monthStart)
  const prev = txnsAll.filter(t => new Date(t.date) < monthStart)
  const sum = (arr, type) => arr.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0)

  const expenses = sum(cur, 'debit'), income = sum(cur, 'credit')
  const prevExpenses = sum(prev, 'debit'), prevIncome = sum(prev, 'credit')
  const net = income - expenses
  const savedPct = income > 0 ? Math.max(0, Math.round((net / income) * 100)) : 0
  const spendShare = income > 0 ? Math.min(100, Math.round((expenses / income) * 100)) : expenses > 0 ? 100 : 0

  const bills = cur.filter(t => t.type === 'debit' && t.category === 'Utilities & Bills').reduce((s, t) => s + t.amount, 0)
  const prevBills = prev.filter(t => t.type === 'debit' && t.category === 'Utilities & Bills').reduce((s, t) => s + t.amount, 0)
  const invested = investments.reduce((s, i) => s + (i.investedAmount || 0), 0)
  const cardDue = cards.reduce((s, c) => s + (c.currentBalance || 0), 0)
  const activeDebts = debts.filter(d => d.status !== 'closed')
  const emi = activeDebts.reduce((s, d) => s + (d.emiAmount || 0), 0)

  const recent = [...cur].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6)
  const name = getUserName()
  const mon = format(now, 'MMM').toUpperCase()

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar title="FinPing" />

      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{greeting(now)}{name ? `, ${name}` : ''}</div>

        <div style={{ display: 'flex', gap: 8, margin: '12px 0 10px', overflowX: 'auto' }}>
          <div className="pill-chip" onClick={() => setActiveTab('debt')}><Landmark size={14} color="var(--gold)" /> Debt</div>
          <div className="pill-chip" onClick={() => setActiveTab('wealth')}><TrendingUp size={14} color="var(--gold)" /> Wealth</div>
          <div className="pill-chip" onClick={() => setActiveTab('cards')}><CreditCard size={14} color="var(--gold)" /> Cards</div>
          <div className="pill-chip" onClick={() => setActiveTab('charts')}><PieChart size={14} color="var(--gold)" /> Charts</div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 12 }}>Today is <b style={{ color: 'var(--txt)' }}>{format(now, 'EEE, d MMM')}</b></div>

        {/* Insights */}
        <div className="label-caps" style={{ textAlign: 'center', marginBottom: 10, letterSpacing: '0.12em' }}>Insights</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Tile Icon={ArrowUpRight} tone="orange" label={`${mon} Expenses`} value={formatINR(expenses)} extra={<Delta cur={expenses} prev={prevExpenses} goodWhenUp={false} />} onClick={() => setActiveTab('history')} />
          <Tile Icon={ArrowDownLeft} tone="green" label={`${mon} Income`} value={formatINR(income)} extra={<Delta cur={income} prev={prevIncome} goodWhenUp />} onClick={() => setActiveTab('history')} />
        </div>

        <div className="stat-tile" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="label-caps">Net Cash Flow</div>
            <span className="badge badge-mint">{savedPct}% saved</span>
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 9999, overflow: 'hidden', background: 'var(--mint)', marginBottom: 8 }}>
            <div style={{ width: `${spendShare}%`, background: 'var(--red)' }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: net >= 0 ? 'var(--mint-dim)' : 'var(--red-dim)' }}>
            {net >= 0 ? '+' : '-'}{formatINR(Math.abs(net))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <Tile Icon={PiggyBank} tone="blue" label={`${mon} Invest`} value={formatINR(invested)} onClick={() => setActiveTab('wealth')} />
          <Tile Icon={Receipt} tone="gold" label={`${mon} Bills`} value={formatINR(bills)} extra={<Delta cur={bills} prev={prevBills} goodWhenUp={false} />} />
          <Tile Icon={CreditCard} tone="red" label="Card Dues" value={formatINR(cardDue)} extra={<span style={{ fontSize: 10, color: 'var(--txt2)' }}>{cards.length} card{cards.length === 1 ? '' : 's'}</span>} onClick={() => setActiveTab('cards')} />
          <Tile Icon={Landmark} tone="orange" label="Monthly EMI" value={formatINR(emi)} extra={<span style={{ fontSize: 10, color: 'var(--txt2)' }}>{activeDebts.length} active</span>} onClick={() => setActiveTab('debt')} />
        </div>

        {/* Accounts & cards */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-hdr">
            <div className="section-title">Accounts &amp; Wallets</div>
            <div style={{ fontSize: 12, color: 'var(--gold-dim)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setActiveTab('cards')}>View all</div>
          </div>
          {cards.length ? cards.slice(0, 4).map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div className="stat-icon" style={{ width: 34, height: 34, background: 'var(--bg2)', color: 'var(--gold-dim)' }}><CreditCard size={17} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{c.bank} •• {c.cardLast4}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.currentBalance > 0 ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{formatINR(c.currentBalance || 0)}</div>
                <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{c.currentBalance > 0 ? 'due' : 'no dues'}</div>
              </div>
            </div>
          )) : (
            <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--txt2)', fontSize: 12 }}>No cards yet — they appear once bank SMS are synced.</div>
          )}
        </div>

        {/* Recent */}
        <div className="section-hdr"><div className="section-title">Recent Transactions</div></div>
        <div className="card" style={{ padding: '4px 14px' }}>
          {recent.map(t => (
            <TxnRow
              key={t.id}
              icon={getMerchantIcon(t.merchant)}
              merchant={t.merchant}
              meta={`${t.bank ? t.bank.split(' ')[0] : ''}${t.accountLast4 ? ` ••${t.accountLast4}` : ''} · ${formatDate(t.date)}`}
              amount={t.amount}
              isCredit={t.type === 'credit'}
              tags={t.tags}
            />
          ))}
          {!recent.length && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txt2)', fontSize: 13 }}>No transactions this month yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
