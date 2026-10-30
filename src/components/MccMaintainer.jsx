import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Search, Plus, RotateCcw } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { useOptions } from '../lib/options'
import { seedMcc, setMccCategory, resetMcc, addCustomMcc } from '../lib/mcc'
import { tagAllCards } from '../lib/rewardTagging'
import { BtnPrimary } from './UI'
import { Field, TextField, Picker } from './Fields'

// the categories the reward rules know about, on top of whatever the user has in their own list
export const REWARD_CATEGORIES = ['Wallet Load', 'Government & Tax', 'Education', 'Jewellery & Gold']
export const useRewardCategories = () => {
  const own = useOptions('categories').map(c => c.name)
  return [...new Set([...own, ...REWARD_CATEGORIES])]
}

// Profile -> Customise -> Rules and codes -> MCC categories: the Merchant Category Code dictionary kept on this phone. Map any code to the FinPing category you want;
// reward rules that name an MCC then apply to every spend in that category.
export default function MccMaintainer({ onBack }) {
  const { setActiveTab, showNotification } = useStore()
  const categories = useRewardCategories()
  const rows = useLiveQuery(() => db.mcc_master.orderBy('code').toArray()) || []
  const [q, setQ] = useState('')
  const [only, setOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ code: '', name: '', category: 'General' })
  useEffect(() => { seedMcc().catch(() => {}) }, [])

  const needle = q.trim().toLowerCase()
  const list = rows.filter(r => (!only || r.custom) && (!needle || String(r.code).includes(needle) || r.name.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle)))
  const options = categories.map(c => ({ value: c, label: c }))

  const change = async (r, category) => { await setMccCategory(r.code, category); tagAllCards().catch(() => {}) }
  const add = async () => {
    try { await addCustomMcc(draft); setAdding(false); setDraft({ code: '', name: '', category: 'General' }); showNotification('MCC added', 'success') } catch (e) { showNotification(e.message, 'error') }
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg0)' }}>
        <div onClick={() => (onBack ? onBack() : setActiveTab('profile'))} style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} /></div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', flex: 1 }}>MCC categories</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setAdding(true)}><Plus size={13} style={{ verticalAlign: -2 }} /> Add</span>
      </div>
      <div style={{ padding: '0 18px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '0 2px 10px' }}>
          Merchant Category Codes are how card networks label a shop. Map a code to the FinPing category you want; card reward rules that mention a code then apply to every spend in that category. The list is built into the app and works offline. No transaction text is ever sent anywhere.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 14, padding: '0 12px', height: 42, marginBottom: 8 }}>
          <Search size={16} color="var(--txt2)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a code, name or category" style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--txt)', fontSize: 14 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
          <input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} /> Show only the ones I changed or added
        </label>
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {!list.length && <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--txt2)' }}>{rows.length ? 'No code matches.' : 'Loading the list…'}</div>}
          {list.map((r, i) => (
            <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, width: 46 }}>{r.code}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                {r.custom && <div style={{ fontSize: 10, color: 'var(--gold-dim)' }}>{r.userAdded ? 'added by you' : `edited (was ${r.defaultCategory})`}</div>}
              </div>
              <div style={{ width: 150, flexShrink: 0 }}><Picker value={r.category} options={options} onChange={v => change(r, v)} title={`MCC ${r.code}`} /></div>
              {r.custom && <RotateCcw size={15} color="var(--txt2)" style={{ cursor: 'pointer' }} onClick={async () => { await resetMcc(r.code); tagAllCards().catch(() => {}) }} />}
            </div>
          ))}
        </div>
      </div>
      {adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
            <div className="sheet-handle" />
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Add an MCC</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="MCC (4 digits)"><TextField type="number" inputMode="numeric" value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="e.g. 5411" /></Field>
              <Field label="What it is"><TextField value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Optional" /></Field>
              <Field label="FinPing category"><Picker value={draft.category} options={options} onChange={v => setDraft({ ...draft, category: v })} title="Category" /></Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => setAdding(false)}>Cancel</button>
                <BtnPrimary onClick={add} style={{ flex: 1 }}>Add</BtnPrimary>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
