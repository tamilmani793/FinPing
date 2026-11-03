import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { useOptions } from '../lib/options'
import { listRules, deleteRule, setRuleByKey, merchantKey } from '../lib/merchantRules'
import { MERCHANT_CATEGORY_MAP } from '../lib/smsParser'
import { tagAllCards } from '../lib/rewardTagging'
import { askConfirm } from '../lib/confirm'

// "This merchant always goes in this category": the rules you made (change or delete them, or add one), and the shops the app already knows.
export default function MerchantRulesSheet({ onClose }) {
  const { showNotification } = useStore()
  const cats = useOptions('categories')
  const [rules, setRules] = useState(listRules())
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const [showBuiltIn, setShowBuiltIn] = useState(false)
  const refresh = () => setRules(listRules())

  // existing spends of that merchant follow the rule; the reward tags are worked out again because rewards depend on the category
  const apply = async (key, category) => {
    const n = await db.transactions.filter(t => t.type === 'debit' && t.kind !== 'card_payment' && merchantKey(t.merchant) === key && t.category !== category)
      .modify(t => { t.category = category; t.userEdited = true; t.editedFields = [...new Set([...(t.editedFields || []), 'category'])] }) // counts as your own change
    if (n > 0) tagAllCards().catch(() => {})
    return n
  }
  const change = async (key, category) => {
    setRuleByKey(key, category); refresh()
    const n = await apply(key, category)
    showNotification(n ? `Rule saved · ${n} transaction${n === 1 ? '' : 's'} moved to ${category}` : 'Rule saved', 'success')
  }
  const remove = async key => {
    if (!(await askConfirm({ title: `Forget “${key}”?`, message: 'New transactions from this merchant go back to being categorised automatically. Existing ones are not changed.' }))) return
    deleteRule(key); refresh()
  }
  const add = async () => {
    const key = merchantKey(name)
    if (!key) return showNotification('Enter a merchant name of at least 3 letters', 'error')
    if (!cat) return showNotification('Pick a category', 'error')
    await change(key, cat); setName(''); setCat('')
  }
  const builtIn = Object.entries(MERCHANT_CATEGORY_MAP).filter(([, c]) => c).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Merchant categories</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '4px 0 12px' }}>A merchant on this list always goes in its category, however its name is spelt on the statement. Changing one also moves that merchant's existing spends.</div>

        <div className="label-caps" style={{ marginBottom: 6 }}>Add</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Merchant, e.g. Bundl" value={name} onChange={e => setName(e.target.value)} />
          <select className="input" style={{ flex: 1, minWidth: 0 }} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">Category</option>
            {cats.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
          </select>
          <button className="btn-secondary" style={{ height: 44, padding: '0 14px' }} onClick={add}>Add</button>
        </div>

        <div className="label-caps" style={{ marginBottom: 2 }}>Your rules · {rules.length}</div>
        {rules.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt2)', padding: '8px 0' }}>None yet. Change a transaction's category and choose to apply it to the others, or add one above.</div>}
        {rules.map(r => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.key}</div>
            <select className="input" style={{ width: 150, height: 36, fontSize: 12 }} value={r.category} onChange={e => change(r.key, e.target.value)}>
              {!cats.some(c => c.name === r.category) && <option value={r.category}>{r.category}</option>}
              {cats.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
            <div onClick={() => remove(r.key)} style={{ cursor: 'pointer', padding: 6, color: 'var(--red-dim)' }} role="button" aria-label="Delete rule"><Trash2 size={16} /></div>
          </div>
        ))}

        <div onClick={() => setShowBuiltIn(v => !v)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer', padding: '14px 0 6px' }}>{showBuiltIn ? '▾ Hide' : '▸ Show'} shops the app already knows · {builtIn.length}</div>
        {showBuiltIn && builtIn.map(([k, c]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--border)' }}><span>{k}</span><span style={{ color: 'var(--txt2)' }}>{c}</span></div>
        ))}
        {showBuiltIn && <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 6 }}>Your own rules win over these. To use a different category for one of them, add it above.</div>}

        <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
