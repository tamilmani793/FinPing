import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, TxnRow, Divider, LabelCaps, BtnPrimary, BtnSecondary, SmsParsedCard, formatINR, getMerchantIcon, formatDate } from '../components/UI'
import { parseSMS } from '../lib/smsParser'
import TxnEditSheet from '../components/TxnEditSheet'
import { useStore } from '../store'

const CATEGORY_ICONS = {
  'Food Delivery': '🍔', 'E-Commerce': '🛍', 'Utilities & Bills': '⚡',
  'Transport': '🚗', 'Health': '💊', 'Fuel': '⛽', 'Rent': '🏠',
  'Grocery': '🥦', 'Travel Online': '✈️', 'Entertainment': '🎬',
  'Insurance': '🛡', 'EMI': '🏦', 'General': '💳', 'Cashback': '💚',
}

const FILTERS = ['All', 'Food', 'Shopping', 'Utilities', 'Travel', 'Fuel', 'Excluded']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Expenses() {
  const [activeFilter, setActiveFilter] = useState(0)
  const [expandedCats, setExpandedCats] = useState(new Set(['Food Delivery']))
  const [showAddForm, setShowAddForm] = useState(false)
  const [editTxn, setEditTxn] = useState(null)
  const [showPasteSMS, setShowPasteSMS] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const { showNotification, composeRequest } = useStore()

  useEffect(() => { if (composeRequest > 0) setShowPasteSMS(true) }, [composeRequest])

  const [form, setForm] = useState({ merchant: '', amount: '', category: 'General', paymentMode: 'UPI', notes: '', tags: '' })

  const monthStart = new Date(selectedYear, selectedMonth, 1)
  const monthEnd = endOfMonth(monthStart)

  const transactions = useLiveQuery(() =>
    db.transactions.filter(t => {
      const d = new Date(t.date)
      return d >= monthStart && d <= monthEnd
    }).toArray()
  , [selectedMonth, selectedYear])

  const totalSpent = (transactions || []).filter(t => t.type === 'debit' && !t.isExcluded).reduce((s, t) => s + t.amount, 0)
  const totalCredits = (transactions || []).filter(t => t.type === 'credit' && !t.isExcluded).reduce((s, t) => s + t.amount, 0)

  // Group by category
  const catMap = {}
  for (const t of (transactions || [])) {
    if (!catMap[t.category]) catMap[t.category] = []
    catMap[t.category].push(t)
  }
  const cats = Object.entries(catMap).sort((a, b) => b[1].reduce((s, t) => s + t.amount, 0) - a[1].reduce((s, t) => s + t.amount, 0))

  const filterMap = { 1: 'Food Delivery', 2: 'E-Commerce', 3: 'Utilities & Bills', 4: 'Travel Online', 5: 'Fuel', 6: 'excluded' }
  const filteredCats = activeFilter === 0 ? cats : cats.filter(([cat]) => {
    if (activeFilter === 6) return catMap[cat]?.some(t => t.isExcluded)
    return cat === filterMap[activeFilter] || cat.toLowerCase().includes(FILTERS[activeFilter].toLowerCase())
  })

  const toggleCat = (cat) => {
    const next = new Set(expandedCats)
    if (next.has(cat)) next.delete(cat); else next.add(cat)
    setExpandedCats(next)
  }

  const handleParseSMS = () => {
    if (!smsText.trim()) return
    const result = parseSMS(smsText)
    if (result) { setParsed(result) } else { showNotification('Could not parse this SMS — try editing fields manually', 'error') }
  }

  const handleConfirmSMS = async () => {
    if (!parsed) return
    await db.transactions.add({
      date: parsed.receivedAt || new Date(), amount: parsed.amount || 0,
      type: parsed.transactionType || 'debit', merchant: parsed.merchant || 'Unknown',
      category: parsed.category || 'General', paymentMode: parsed.paymentMode || 'UPI',
      bank: parsed.bank || '', cardId: null, rawSMS: parsed.rawText,
      parsedBy: 'auto', tags: [], notes: '', isExcluded: false, createdAt: new Date(),
    })
    setParsed(null); setSmsText(''); setShowPasteSMS(false)
    showNotification('Transaction saved from SMS!', 'success')
  }

  const handleAddManual = async () => {
    if (!form.merchant || !form.amount) return
    await db.transactions.add({
      date: new Date(), amount: parseFloat(form.amount),
      type: 'debit', merchant: form.merchant,
      category: form.category, paymentMode: form.paymentMode,
      bank: '', cardId: null, rawSMS: null,
      parsedBy: 'manual', tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      notes: form.notes, isExcluded: false, createdAt: new Date(),
    })
    setForm({ merchant: '', amount: '', category: 'General', paymentMode: 'UPI', notes: '', tags: '' })
    setShowAddForm(false)
    showNotification('Transaction added!', 'success')
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150, position: 'relative' }}>
      <TopBar sub={`Expenses · ${MONTHS[selectedMonth]} ${selectedYear}`} />

      {/* Month Selector */}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)} className="input" style={{ flex: 1, height: 36 }}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} className="input" style={{ width: 80, height: 36 }}>
          {[2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div style={{ padding: '10px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="card-sm">
          <LabelCaps style={{ marginBottom: 2 }}>Total Spent</LabelCaps>
          <div className="mono-lg" style={{ fontSize: 20 }}>{formatINR(totalSpent)}</div>
        </div>
        <div className="card-sm">
          <LabelCaps style={{ marginBottom: 2 }}>Credits / Refunds</LabelCaps>
          <div className="mono-md" style={{ color: 'var(--mint)' }}>{formatINR(totalCredits)}</div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="chip-scroll" style={{ padding: '10px 16px 4px' }}>
        {FILTERS.map((f, i) => (
          <div key={f} className={`chip${activeFilter === i ? ' active' : ''}`} onClick={() => setActiveFilter(i)}>{f}</div>
        ))}
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        <SectionHdr title="By Category" right={<Badge variant="grey">{cats.length} categories</Badge>} />

        {/* Paste SMS CTA */}
        {!showPasteSMS && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn-secondary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={() => setShowPasteSMS(true)}>📲 Paste SMS</button>
            <button className="btn-secondary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={() => setShowAddForm(!showAddForm)}>+ Add Manually</button>
          </div>
        )}

        {/* SMS Paste Area */}
        {showPasteSMS && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 6 }}>Paste Bank SMS</LabelCaps>
            <textarea className="input" style={{ height: 80, marginBottom: 8, fontSize: 12 }}
              placeholder="Paste your bank SMS here..." value={smsText}
              onChange={e => { setSmsText(e.target.value); setParsed(null) }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <BtnPrimary onClick={handleParseSMS} style={{ flex: 1, height: 36, fontSize: 12 }}>Parse SMS</BtnPrimary>
              <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => { setShowPasteSMS(false); setParsed(null); setSmsText('') }}>Cancel</button>
            </div>
            {parsed && <SmsParsedCard parsed={parsed} onConfirm={handleConfirmSMS} onDiscard={() => { setParsed(null); setSmsText('') }} />}
          </Card>
        )}

        {/* Manual Add Form */}
        {showAddForm && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 8 }}>Add Transaction</LabelCaps>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" placeholder="Merchant name" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} />
              <input className="input" type="number" placeholder="Amount (₹)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {Object.keys(CATEGORY_ICONS).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" value={form.paymentMode} onChange={e => setForm({ ...form, paymentMode: e.target.value })}>
                {['UPI', 'Card', 'NetBanking', 'Cash', 'Wallet'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input className="input" placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
              <input className="input" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <BtnPrimary onClick={handleAddManual} style={{ flex: 1, height: 36, fontSize: 12 }}>Save</BtnPrimary>
                <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </div>
          </Card>
        )}

        {/* Category Accordions */}
        {filteredCats.map(([cat, txns]) => {
          const catTotal = txns.reduce((s, t) => s + (t.type === 'debit' ? t.amount : 0), 0)
          const pct = totalSpent > 0 ? Math.round(catTotal / totalSpent * 100) : 0
          const isExpanded = expandedCats.has(cat)
          const isExcluded = txns.some(t => t.isExcluded)
          return (
            <Card key={cat} style={{ padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: isExpanded ? 6 : 0 }} onClick={() => toggleCat(cat)}>
                <div style={{ fontSize: 18 }}>{CATEGORY_ICONS[cat] || '💳'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{cat}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{txns.length} transaction{txns.length !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono-sm">{formatINR(catTotal)}</div>
                  <Badge variant={isExcluded ? 'red' : 'grey'} style={{ fontSize: 9 }}>{pct}%</Badge>
                </div>
                <div style={{ color: 'var(--txt3)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</div>
              </div>
              {isExpanded && (
                <>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, marginBottom: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: isExcluded ? 'var(--red)' : 'var(--mint)', borderRadius: 9999 }} />
                  </div>
                  {txns.map(t => (
                    <TxnRow
                      key={t.id}
                      icon={getMerchantIcon(t.merchant)}
                      merchant={t.merchant}
                      meta={`${formatDate(t.date)} · ${t.paymentMode}${t.rawSMS ? ' · SMS' : ' · Manual'}`}
                      amount={t.amount}
                      isCredit={t.type === 'credit'}
                      tags={t.tags}
                      onClick={() => setEditTxn(t)}
                      badge={t.isExcluded ? <Badge variant="red" style={{ fontSize: 9 }}>⛔ Excl.</Badge> : null}
                    />
                  ))}
                </>
              )}
            </Card>
          )
        })}

        {(!filteredCats.length) && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt2)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>No transactions yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Paste a bank SMS or add manually above</div>
          </div>
        )}
      </div>
      {editTxn && <TxnEditSheet txn={editTxn} onClose={() => setEditTxn(null)} />}
    </div>
  )
}
