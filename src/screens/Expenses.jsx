import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { endOfMonth } from 'date-fns'
import { IndianRupee, Store, Tag, Wallet, CreditCard, StickyNote } from 'lucide-react'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, TxnRow, LabelCaps, BtnPrimary, formatINR, getMerchantIcon, formatDate } from '../components/UI'
import { Field, FormHeading, TextField, Picker } from '../components/Fields'
import TxnDetailSheet from '../components/TxnDetailSheet'
import { applyTxnToCard } from '../lib/ingestSMS'
import { useOptions, categoryIcon } from '../lib/options'
import { useStore } from '../store'

const FILTERS = ['All', 'Food', 'Shopping', 'Utilities', 'Travel', 'Fuel', 'Excluded']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MODES = ['UPI', 'Card', 'NetBanking', 'Cash', 'Wallet']
const I = 17

export default function Expenses() {
  const [activeFilter, setActiveFilter] = useState(0)
  const [expandedCats, setExpandedCats] = useState(new Set(['Food Delivery']))
  const [showAddForm, setShowAddForm] = useState(false)
  const [editTxn, setEditTxn] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const { showNotification, composeRequest } = useStore()
  const categoryList = useOptions('categories')

  useEffect(() => { if (composeRequest > 0) setShowAddForm(true) }, [composeRequest])

  const [form, setForm] = useState({ merchant: '', amount: '', category: 'General', paymentMode: 'UPI', cardId: '', notes: '', tags: '' })
  const accountList = (useLiveQuery(() => db.creditCards.toArray()) || []).filter(c => !c.draft && c.cardType !== 'unknown')

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
  // inside a category the latest transaction comes first
  for (const list of Object.values(catMap)) list.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
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

  const handleAddManual = async () => {
    if (!form.merchant || !form.amount) return
    const amount = parseFloat(form.amount)
    // "Paid from": a card or bank account, so the spend shows on its page and moves its balance.
    const card = form.cardId ? await db.creditCards.get(Number(form.cardId)) : null
    const cardMode = card ? (card.cardType === 'account' ? 'Bank' : card.cardType === 'debit' ? 'Debit Card' : 'Credit Card') : null
    await db.transactions.add({
      date: new Date(), amount,
      type: 'debit', merchant: form.merchant,
      category: form.category, paymentMode: cardMode || form.paymentMode,
      bank: card?.bank || '', accountLast4: card?.cardLast4 || null, cardId: card ? card.id : null, rawSMS: null,
      parsedBy: 'manual', tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      notes: form.notes, isExcluded: false, createdAt: new Date(),
    })
    if (card) await applyTxnToCard(card, 'debit', amount)
    setForm({ merchant: '', amount: '', category: 'General', paymentMode: 'UPI', cardId: '', notes: '', tags: '' })
    setShowAddForm(false)
    showNotification('Transaction added!', 'success')
  }

  const cardOptions = accountList.map(c => ({
    value: String(c.id), label: c.name + (c.cardLast4 && !c.name.includes('••') ? ` ••${c.cardLast4}` : ''),
    sub: c.cardType === 'account' ? 'bank account' : c.cardType === 'debit' ? 'debit card' : 'credit card',
  }))

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150, position: 'relative' }}>
      <TopBar sub={`Expenses · ${MONTHS[selectedMonth]} ${selectedYear}`} />

      {/* Month Selector */}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)} className="input" style={{ flex: 1, height: 40, borderRadius: 14 }}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} className="input" style={{ width: 96, height: 40, borderRadius: 14 }}>
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

        <div style={{ marginBottom: 10 }}>
          <button className="btn-secondary" style={{ width: '100%', height: 42, fontSize: 13 }} onClick={() => setShowAddForm(!showAddForm)}>{showAddForm ? 'Close' : '+ Add Manually'}</button>
        </div>

        {/* Manual Add Form */}
        {showAddForm && (
          <Card style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Add a transaction</div>
            <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '2px 0 14px' }}>Cash spends and anything the SMS sync missed.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Merchant"><TextField icon={<Store size={I} />} placeholder="Where did you spend?" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} /></Field>
              <div className="form-grid">
                <Field label="Amount"><TextField icon={<IndianRupee size={I} />} type="number" inputMode="decimal" placeholder="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
                <Field label="Category">
                  <Picker value={form.category} options={categoryList.map(c => ({ value: c.name, label: c.name, icon: c.icon }))} onChange={v => setForm({ ...form, category: v })} title="Category" placeholder="Select" />
                </Field>
              </div>
              <FormHeading>Paid from</FormHeading>
              <Field label="Card or account">
                <Picker value={form.cardId} options={cardOptions} onChange={v => setForm({ ...form, cardId: v })} icon={<CreditCard size={I} />} title="Paid from" placeholder="None (cash / other)" clearLabel="None (cash / other)" />
              </Field>
              {!form.cardId && (
                <Field label="Payment mode">
                  <Picker value={form.paymentMode} options={MODES} onChange={v => setForm({ ...form, paymentMode: v })} icon={<Wallet size={I} />} title="Payment mode" />
                </Field>
              )}
              <div className="form-grid">
                <Field label="Tags"><TextField icon={<Tag size={I} />} placeholder="comma separated" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></Field>
                <Field label="Notes"><TextField icon={<StickyNote size={I} />} placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => setShowAddForm(false)}>Cancel</button>
                <BtnPrimary onClick={handleAddManual} style={{ flex: 1 }}>Save</BtnPrimary>
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
                <div style={{ fontSize: 18 }}>{categoryIcon(categoryList, cat)}</div>
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
                  <div style={{ height: 3, background: 'var(--track)', borderRadius: 9999, marginBottom: 8, overflow: 'hidden' }}>
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
            <div style={{ fontSize: 12, marginTop: 4 }}>Add a transaction manually above, or let the SMS sync fill this in</div>
          </div>
        )}
      </div>
      {editTxn && <TxnDetailSheet txn={editTxn} onClose={() => setEditTxn(null)} />}
    </div>
  )
}
