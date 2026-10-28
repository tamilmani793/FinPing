import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Lock, RotateCcw, X, Check } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { askConfirm } from '../lib/confirm'
import Sortable, { ReorderToggle } from './Sortable'
import { Field, TextField, Picker, Segmented } from './Fields'
import {
  OPTION_LISTS, LOCKED_CATEGORIES, useOptions, useOptionNames, setList, resetList, isCustomised,
  addCategory, renameCategory, removeCategory, debtTypeId, getList,
} from '../lib/options'

// Profile -> Dropdown options: every list that feeds a dropdown, editable on this phone.

const CARD_LISTS = ['cardNames', 'debitCardNames']
const POLICY_LIST = 'policyNames'
const EMOJI = ['🍔', '🛍', '⚡', '🚗', '💊', '⛽', '🏠', '🥦', '✈️', '🎬', '🛡', '🏦', '📈', '📲', '💼', '🎓', '🎁', '🐾', '🧾', '💳']

function ListPage({ listKey, onClose }) {
  const meta = OPTION_LISTS[listKey]
  const items = useOptions(listKey)
  const banks = useOptionNames('banks')
  const partners = useOptionNames('partners')
  const insurers = useOptionNames('insurers')
  const policyTypes = useOptionNames('policyTypes')
  const { showNotification } = useStore()
  const rich = meta.kind === 'rich'
  const emptyDraft = { idx: null, name: '', icon: '', bank: '', partner: '', insurer: '', type: '', cover: '' }
  const [draft, setDraft] = useState(null) // null = closed
  const [q, setQ] = useState('')
  const [reorder, setReorder] = useState(false)
  const canReorder = items.length > 1 && items.length <= 80 // the long built-in card lists are searched, not sorted

  const nameOf = it => (typeof it === 'string' ? it : listKey === 'debtTypes' ? it.label : it.name)
  const iconOf = it => (typeof it === 'string' ? '' : it.icon || '')
  const locked = it => listKey === 'categories' && LOCKED_CATEGORIES.includes(it.name)
  const shown = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !q.trim() || (nameOf(it) + (it.bank || '')).toLowerCase().includes(q.trim().toLowerCase()))

  const startEdit = (it, idx) => {
    if (locked(it)) return showNotification(`“${it.name}” is used by the app and cannot be changed`, 'error')
    setDraft({ idx, name: nameOf(it), icon: iconOf(it), bank: it.bank || '', partner: it.partner || '', insurer: it.insurer || '', type: it.type || '', cover: it.cover || '' })
  }

  const save = async () => {
    const name = draft.name.trim()
    try {
      if (!name) throw new Error('Enter a name')
      if (draft.idx == null && items.some(it => nameOf(it).toLowerCase() === name.toLowerCase() && (!CARD_LISTS.includes(listKey) || it.bank === draft.bank))) throw new Error(`“${name}” is already in the list`)
      if (listKey === 'categories') {
        if (draft.idx == null) addCategory(name, draft.icon)
        else {
          const old = items[draft.idx]
          await renameCategory(old.name, name)
          if (draft.icon && draft.icon !== old.icon) setList('categories', getList('categories').map(c => (c.name === name ? { ...c, icon: draft.icon } : c)))
        }
      } else if (listKey === 'debtTypes') {
        const next = [...items]
        if (draft.idx == null) next.push({ id: debtTypeId(name, items), label: name, icon: draft.icon || '📄' })
        else next[draft.idx] = { ...next[draft.idx], label: name, icon: draft.icon || next[draft.idx].icon }
        setList(listKey, next)
      } else if (listKey === POLICY_LIST) {
        if (!draft.insurer.trim()) throw new Error('Choose the insurer')
        if (!draft.type) throw new Error('Choose the policy type')
        const entry = { name, insurer: draft.insurer.trim(), type: draft.type, ...(draft.type === 'Vehicle insurance' ? { cover: draft.cover || 'Comprehensive' } : {}) }
        setList(listKey, draft.idx == null ? [...items, entry] : items.map((it, i) => (i === draft.idx ? entry : it)))
      } else if (CARD_LISTS.includes(listKey)) {
        if (!draft.bank.trim()) throw new Error('Choose the bank')
        const entry = { bank: draft.bank.trim(), name, partner: draft.partner || '' }
        setList(listKey, draft.idx == null ? [...items, entry] : items.map((it, i) => (i === draft.idx ? entry : it)))
      } else {
        setList(listKey, draft.idx == null ? [...items, name] : items.map((it, i) => (i === draft.idx ? name : it)))
      }
      setDraft(null)
    } catch (e) { showNotification(e.message, 'error') }
  }

  const remove = async (it, idx) => {
    try {
      if (locked(it)) throw new Error(`“${it.name}” is used by the app and cannot be removed`)
      if (listKey === 'categories') {
        const n = await db.transactions.where('category').equals(it.name).count()
        if (!(await askConfirm({ title: `Remove “${it.name}”?`, confirmLabel: 'Remove', message: n ? `${n} transaction${n === 1 ? '' : 's'} will move to General.` : 'It is taken out of the dropdown lists.' }))) return
        await removeCategory(it.name)
        return
      }
      if (listKey === 'debtTypes') {
        const n = await db.debts.where('type').equals(it.id).count().catch(() => db.debts.filter(d => d.type === it.id).count())
        if (n) throw new Error(`${n} debt${n === 1 ? ' uses' : 's use'} “${it.label}”, so it cannot be removed`)
      }
      if (!(await askConfirm({ title: `Remove “${nameOf(it)}”?`, message: `It is taken out of ${meta.title.toLowerCase()}.`, confirmLabel: 'Remove' }))) return
      setList(listKey, items.filter((_, i) => i !== idx))
    } catch (e) { showNotification(e.message, 'error') }
  }

  const reset = async () => {
    if (!(await askConfirm({ title: `Reset ${meta.title}?`, confirmLabel: 'Reset', message: `The built-in list comes back and your changes to it are lost${listKey === 'categories' ? ' (transactions keep the names they have now)' : ''}.` }))) return
    resetList(listKey)
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <PageHeader title={meta.title} icon={meta.icon} onBack={onClose} />
      <div style={{ padding: '0 18px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '0 2px 14px' }}>{meta.hint}</div>

        {draft && (
          <div className="overlay" style={{ zIndex: 60 }} onClick={() => setDraft(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
          <div className="sheet-handle" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{draft.idx == null ? `Add to ${meta.title.toLowerCase()}` : `Edit ${meta.title.toLowerCase()}`}</div>
            {CARD_LISTS.includes(listKey) && (
              <Field label="Bank"><Picker value={draft.bank} options={banks} onChange={v => setDraft({ ...draft, bank: v })} allowCustom title="Bank" placeholder="Choose the bank" /></Field>
            )}
            <Field label={CARD_LISTS.includes(listKey) ? 'Card name' : 'Name'}>
              <TextField autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save() }} placeholder={listKey === 'categories' ? 'e.g. Pets' : 'Type a name'} />
            </Field>
            {listKey === POLICY_LIST && (
              <>
                <Field label="Insurer"><Picker value={draft.insurer} options={insurers} onChange={v => setDraft({ ...draft, insurer: v })} allowCustom title="Insurer" placeholder="Choose the insurer" /></Field>
                <Field label="Policy type"><Picker value={draft.type} options={policyTypes} onChange={v => setDraft({ ...draft, type: v })} title="Policy type" placeholder="Choose the type" /></Field>
                {draft.type === 'Vehicle insurance' && <Field label="Cover"><Segmented value={draft.cover || 'Comprehensive'} options={['Comprehensive', 'Third party']} onChange={v => setDraft({ ...draft, cover: v })} /></Field>}
              </>
            )}
            {CARD_LISTS.includes(listKey) && (
              <Field label="Co-brand partner (optional)"><Picker value={draft.partner} options={partners} onChange={v => setDraft({ ...draft, partner: v })} allowCustom title="Co-brand partner" placeholder="None" clearLabel="None" /></Field>
            )}
            {rich && !CARD_LISTS.includes(listKey) && listKey !== POLICY_LIST && (
              <Field label="Icon">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EMOJI.map(e => <span key={e} onClick={() => setDraft({ ...draft, icon: e })} style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, cursor: 'pointer', background: draft.icon === e ? 'var(--gold-bg)' : 'var(--bg2)', border: `1.5px solid ${draft.icon === e ? 'var(--gold)' : 'transparent'}` }}>{e}</span>)}
                </div>
              </Field>
            )}
            {listKey === 'categories' && draft.idx != null && <div style={{ fontSize: 11.5, color: 'var(--txt3)' }}>Renaming changes the category on every transaction that has it.</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ height: 46, padding: '0 18px' }} onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1, height: 46 }} onClick={save}><Check size={16} /> {draft.idx == null ? 'Add' : 'Save'}</button>
            </div>
          </div>
          </div>
          </div>
        )}
        {(
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn-primary" style={{ flex: 1, height: 46 }} onClick={() => setDraft({ ...emptyDraft })}><Plus size={17} /> Add new</button>
            {canReorder && <ReorderToggle on={reorder} onClick={() => { setReorder(v => !v); setQ('') }} />}
            {isCustomised(listKey) && <button className="btn-secondary" style={{ height: 46, display: 'flex', alignItems: 'center', gap: 6 }} onClick={reset}><RotateCcw size={14} /> Reset</button>}
          </div>
        )}

        {items.length > 8 && !draft && (
          <div className="picker-search"><Search size={16} color="var(--txt3)" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${items.length} items`} /></div>
        )}

        <div className="picker-list">
          {reorder && canReorder ? (
            <Sortable items={items.map((it, idx) => ({ it, idx }))} getId={x => x.idx + ':' + nameOf(x.it)} enabled onReorder={list => setList(listKey, list.map(x => x.it))}
              renderItem={({ it }, { handle, dragging }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '4px 0', background: 'var(--bg1)', border: '1px solid ' + (dragging ? 'var(--gold)' : 'var(--border)'), borderRadius: 14 }}>
                  {rich && !CARD_LISTS.includes(listKey) && listKey !== POLICY_LIST && <span style={{ fontSize: 19, width: 26, textAlign: 'center' }}>{iconOf(it)}</span>}
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(it)}</div>
                  {handle}
                </div>
              )} />
          ) : shown.map(({ it, idx }) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 6px', borderBottom: '1px solid var(--border)' }}>
              {rich && !CARD_LISTS.includes(listKey) && listKey !== POLICY_LIST && <span style={{ fontSize: 19, width: 26, textAlign: 'center' }}>{iconOf(it)}</span>}
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => startEdit(it, idx)}>
                <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(it)}</div>
                {listKey === POLICY_LIST && <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{it.insurer} · {it.type}{it.cover ? ` · ${it.cover}` : ''}</div>}
                {CARD_LISTS.includes(listKey) && <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{it.bank}{it.partner ? ` · ${it.partner}` : ''}</div>}
              </div>
              {locked(it)
                ? <Lock size={15} color="var(--txt3)" />
                : <>
                    <span onClick={() => startEdit(it, idx)} style={{ padding: 6, cursor: 'pointer', color: 'var(--txt2)' }}><Pencil size={16} /></span>
                    <span onClick={() => remove(it, idx)} style={{ padding: 6, cursor: 'pointer', color: 'var(--red-dim)' }}><Trash2 size={16} /></span>
                  </>}
            </div>
          ))}
          {!shown.length && <div style={{ padding: '24px 4px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt2)' }}>{items.length ? `Nothing matches “${q}”` : 'The list is empty. Add your first item above.'}</div>}
        </div>
      </div>
    </div>
  )
}

function PageHeader({ title, icon, onBack }) {
  return (
    <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <div onClick={onBack} style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} /></div>
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{icon ? icon + ' ' : ''}{title}</div>
    </div>
  )
}

// Profile -> Dropdown options: the page that lists every editable list; tapping one opens its own page.
export default function OptionsPage() {
  const { setActiveTab } = useStore()
  const [open, setOpen] = useState(null)
  useBackHandler(!!open, () => setOpen(null))
  if (open) return <ListPage listKey={open} onClose={() => setOpen(null)} />
  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <PageHeader title="Dropdown options" onBack={() => setActiveTab('profile')} />
      <div style={{ padding: '0 18px' }}>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', margin: '0 2px 12px' }}>Choose a list to add, rename or remove its choices. Everything stays on this phone and is included in your backup.</div>
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {Object.entries(OPTION_LISTS).map(([key, m], i) => <OptionRow key={key} listKey={key} meta={m} first={i === 0} onOpen={() => setOpen(key)} />)}
        </div>
      </div>
    </div>
  )
}

function OptionRow({ listKey, meta, onOpen, first }) {
  const items = useOptions(listKey)
  return (
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: first ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
      <div className="stat-icon" style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--gold-bg)', fontSize: 17 }}>{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{meta.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{items.length} item{items.length === 1 ? '' : 's'}{isCustomised(listKey) ? ' · edited' : ''}</div>
      </div>
      <ChevronRight size={18} color="var(--txt3)" />
    </div>
  )
}
