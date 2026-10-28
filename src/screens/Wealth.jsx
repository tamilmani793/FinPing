import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, Divider, LabelCaps, MonoLg, BtnPrimary, BtnSecondary, formatINR, formatDate } from '../components/UI'
import { IndianRupee, TrendingUp, StickyNote } from 'lucide-react'
import { Field, TextField, Picker } from '../components/Fields'
import { useStore } from '../store'
import { parseSMS } from '../lib/smsParser'

const TYPE_ICONS = { MutualFund: '📈', Stock: '📊', PPF: '🏛', NPS: '🏦', Gold: '🪙', FD: '🔐', Other: '💰' }
const TYPE_COLORS = { MutualFund: 'var(--mint)', Stock: 'var(--indigo)', PPF: 'var(--amber)', NPS: '#8B5CF6', Gold: '#D97706', FD: '#06B6D4', Other: 'var(--txt3)' }
const FILTERS = ['#ALL', '#MUTUALFUNDS', '#STOCKS', '#GOLD', '#RETIREMENT']

export default function Wealth() {
  const [activeFilter, setActiveFilter] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [parsed, setParsed] = useState(null)
  const { showNotification } = useStore()

  const [form, setForm] = useState({ name: '', type: 'MutualFund', investedAmount: '', currentValue: '', notes: '' })

  const investments = useLiveQuery(() => db.investments.toArray())

  const filtered = (investments || []).filter(inv => {
    if (activeFilter === 0) return true
    const map = { 1: 'MutualFund', 2: 'Stock', 3: 'Gold', 4: ['PPF', 'NPS'] }
    const target = map[activeFilter]
    return Array.isArray(target) ? target.includes(inv.type) : inv.type === target
  })

  const totalInvested = (investments || []).reduce((s, i) => s + (i.investedAmount || 0), 0)
  const totalCurrent = (investments || []).reduce((s, i) => s + (i.currentValue || 0), 0)
  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(1) : 0
  const totalMonthly = 0

  // Asset allocation for stacked bar
  const allocData = [
    { name: 'MF', value: (investments || []).filter(i => i.type === 'MutualFund').reduce((s, i) => s + i.currentValue, 0) },
    { name: 'Stocks', value: (investments || []).filter(i => i.type === 'Stock').reduce((s, i) => s + i.currentValue, 0) },
    { name: 'Retirement', value: (investments || []).filter(i => ['PPF', 'NPS'].includes(i.type)).reduce((s, i) => s + i.currentValue, 0) },
    { name: 'Gold', value: (investments || []).filter(i => i.type === 'Gold').reduce((s, i) => s + i.currentValue, 0) },
  ]
  const totalAlloc = allocData.reduce((s, a) => s + a.value, 0)

  const smsLogs = useLiveQuery(() => db.smsLog.orderBy('receivedAt').reverse().limit(5).toArray())

  const handleParseSMS = () => {
    const result = parseSMS(smsText)
    if (result && (result.type === 'investment_sip' || result.type === 'investment_fd')) {
      setParsed(result)
    } else {
      showNotification('No investment SMS detected', 'error')
    }
  }

  const handleConfirmInvestment = async () => {
    if (!parsed) return
    await db.investments.add({
      name: parsed.merchant || 'Unknown Fund', type: 'MutualFund',
      investedAmount: parsed.amount || 0, currentValue: parsed.amount || 0,
      units: parsed.units || null, nav: parsed.nav || null,
      startDate: new Date(), source: 'sms', notes: `Folio: ${parsed.folio || 'N/A'}`,
    })
    await db.smsLog.add({ rawText: smsText, sender: '', receivedAt: new Date(), parseStatus: 'parsed', parsedEntityType: 'investment', failReason: null })
    setParsed(null); setSmsText(''); setSmsOpen(false)
    showNotification('Investment recorded!', 'success')
  }

  const handleAddManual = async () => {
    if (!form.name || !form.investedAmount) { showNotification('Name and amount required', 'error'); return }
    await db.investments.add({
      name: form.name, type: form.type,
      investedAmount: parseFloat(form.investedAmount), currentValue: parseFloat(form.currentValue || form.investedAmount),
      units: null, nav: null, startDate: new Date(), source: 'manual', notes: form.notes,
    })
    setForm({ name: '', type: 'MutualFund', investedAmount: '', currentValue: '', notes: '' })
    setAddOpen(false)
    showNotification('Investment added!', 'success')
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar sub="Wealth" />

      <div style={{ padding: '10px 16px 0' }}>
        {/* Header Telemetry */}
        <Card style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <LabelCaps style={{ marginBottom: 2 }}>Telemetry Engine · Wealth Allocation</LabelCaps>
              <MonoLg style={{ fontSize: 22 }}>{formatINR(totalMonthly)} <span style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 400 }}>/ month</span></MonoLg>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge variant="mint">AUTO-TRACK ACTIVE</Badge>
                          </div>
          </div>
          <ProgressBar pct={0} variant="gradient" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10 }}>
            <span style={{ color: 'var(--txt2)' }}>0%</span>
            <span style={{ color: 'var(--mint)' }}>Safe Boundary: 30%+</span>
            <span style={{ color: 'var(--txt2)' }}>100%</span>
          </div>
        </Card>

        {/* Summary Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
          <div className="card-sm" style={{ padding: 10 }}>
            <LabelCaps style={{ marginBottom: 2, fontSize: 9 }}>Invested</LabelCaps>
            <div className="mono-sm">{formatINR(totalInvested)}</div>
          </div>
          <div className="card-sm" style={{ padding: 10 }}>
            <LabelCaps style={{ marginBottom: 2, fontSize: 9 }}>Current</LabelCaps>
            <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(totalCurrent)}</div>
          </div>
          <div className="card-sm" style={{ padding: 10 }}>
            <LabelCaps style={{ marginBottom: 2, fontSize: 9 }}>Returns</LabelCaps>
            <div className="mono-sm" style={{ color: overallReturn > 0 ? 'var(--mint)' : 'var(--red)' }}>+{overallReturn}%</div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="chip-scroll" style={{ padding: '0 0 10px' }}>
          {FILTERS.map((f, i) => (
            <div key={f} className={`chip${activeFilter === i ? ' active' : ''}`} onClick={() => setActiveFilter(i)}>{f}</div>
          ))}
        </div>

        {/* Asset Allocation */}
        <SectionHdr title="Asset Allocation" right={<Badge variant="grey">{allocData.length} Categories</Badge>} />
        <Card style={{ marginBottom: 10 }}>
          {/* Stacked bar */}
          <div style={{ height: 8, borderRadius: 9999, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
            {allocData.map(({ name, value }, i) => {
              const colors = ['var(--mint)', 'var(--indigo)', 'var(--amber)', '#D97706']
              return <div key={name} style={{ width: `${totalAlloc > 0 ? value / totalAlloc * 100 : 25}%`, background: colors[i], height: '100%' }} />
            })}
          </div>
          {allocData.map(({ name, value }, i) => {
            const colors = ['var(--mint)', 'var(--indigo)', 'var(--amber)', '#D97706']
            const pct = totalAlloc > 0 ? Math.round(value / totalAlloc * 100) : 0
            const labels = ['Mutual Funds (SIPs)', 'Direct Stocks / Equities', 'PPF & NPS (Retirement)', 'Sovereign Gold / Digital Gold']
            const subs = ['Automated Monthly', 'Direct Exchange', 'Tax-Shielded', 'Hedge Asset']
            return (
              <div key={name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: colors[i], flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{labels[i]}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{subs[i]}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-sm">{formatINR(value)}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{pct}%</div>
                  </div>
                </div>
                {i < allocData.length - 1 && <Divider />}
              </div>
            )
          })}
        </Card>


        {/* Investment List */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn-primary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={() => setAddOpen(!addOpen)}>+ Add Investment</button>
          <button className="btn-secondary" style={{ height: 36, fontSize: 12 }} onClick={() => setSmsOpen(!smsOpen)}>📲 From SMS</button>
        </div>

        {addOpen && (
          <Card style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>Log an investment</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Fund / stock name"><TextField icon={<TrendingUp size={17} />} placeholder="e.g. Nifty 50 index fund" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Type">
                <Picker value={form.type} options={Object.entries(TYPE_ICONS).map(([t, icon]) => ({ value: t, label: t, icon }))} onChange={v => setForm({ ...form, type: v })} title="Investment type" />
              </Field>
              <div className="form-grid">
                <Field label="Invested"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.investedAmount} onChange={e => setForm({ ...form, investedAmount: e.target.value })} /></Field>
                <Field label="Current value"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.currentValue} onChange={e => setForm({ ...form, currentValue: e.target.value })} /></Field>
              </div>
              <Field label="Notes"><TextField icon={<StickyNote size={17} />} placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => setAddOpen(false)}>Cancel</button>
                <BtnPrimary onClick={handleAddManual} style={{ flex: 1 }}>Save</BtnPrimary>
              </div>
            </div>
          </Card>
        )}

        {smsOpen && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 6 }}>Parse Investment SMS</LabelCaps>
            <textarea className="input" style={{ height: 70, marginBottom: 8, fontSize: 12 }} placeholder="Paste MF SIP / FD / Demat SMS..." value={smsText} onChange={e => { setSmsText(e.target.value); setParsed(null) }} />
            <button className="btn-primary" style={{ width: '100%', height: 36, fontSize: 12, marginBottom: parsed ? 8 : 0 }} onClick={handleParseSMS}>Parse</button>
            {parsed && (
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mint)', marginBottom: 6 }}>SIP Detected: {formatINR(parsed.amount)}</div>
                {parsed.nav && <div style={{ fontSize: 11, color: 'var(--txt2)' }}>NAV: {parsed.nav} · Units: {parsed.units}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button className="btn-primary" style={{ flex: 1, height: 34, fontSize: 12 }} onClick={handleConfirmInvestment}>Confirm</button>
                  <button className="btn-ghost" style={{ height: 34, fontSize: 12 }} onClick={() => setParsed(null)}>Discard</button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Live SMS Parser Feed */}
        <SectionHdr title="Live SMS Parser" right={<Badge variant="indigo">{filtered.filter(i => i.source === 'sms').length} CAPTURED</Badge>} />

        {filtered.map(inv => {
          const returnPct = inv.investedAmount > 0 ? ((inv.currentValue - inv.investedAmount) / inv.investedAmount * 100).toFixed(1) : 0
          const isPositive = parseFloat(returnPct) >= 0
          return (
            <div key={inv.id} style={{ background: 'var(--bg1)', border: '1px solid var(--indigo-border)', borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 18, marginTop: 1 }}>{TYPE_ICONS[inv.type] || '💰'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>
                    {inv.source === 'sms' ? `${inv.startDate ? formatDate(inv.startDate) : ''} · Mutual Fund SIP` : `Manual · ${inv.type}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(inv.currentValue)}</div>
                  <Badge variant={inv.source === 'sms' ? 'indigo' : 'grey'} style={{ fontSize: 9, marginTop: 2 }}>
                    {inv.source === 'sms' ? 'SIP Auto' : 'Manual'}
                  </Badge>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: 'var(--txt2)' }}>Invested: {formatINR(inv.investedAmount)}</span>
                <span style={{ color: isPositive ? 'var(--mint)' : 'var(--red)', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>
                  {isPositive ? '+' : ''}{returnPct}% · {isPositive ? '+' : ''}{formatINR(Math.abs(inv.currentValue - inv.investedAmount))}
                </span>
              </div>
              {inv.notes && <div className="sms-raw" style={{ fontSize: 10 }}>{inv.notes}</div>}
            </div>
          )
        })}

        {!filtered.length && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--txt2)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>No investments tracked yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Paste a SIP/FD SMS or add manually above</div>
          </div>
        )}

        <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => setAddOpen(true)}>
          + Log Outflow Manually
        </button>
      </div>
    </div>
  )
}
