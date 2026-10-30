import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { getRules, saveRules, deleteRules } from '../lib/rewardTagging'
import { DEFAULT_RULES } from '../lib/rewardRules'
import { cardTitle } from '../lib/cardCatalog'
import { BtnPrimary } from './UI'
import { Field, FormHeading, Segmented, TextField, Picker } from './Fields'
import { useRewardCategories } from './MccMaintainer'

// The card's reward rules (table card_reward_rules): reward type, base rate, accelerated categories / MCCs / merchants,
// exclusions, minimum spend, cycle caps and rounding. Saving re-tags every spend on the card with the reward it should earn.

const ROUNDING = [{ value: 'floor', label: 'Round down (banks usually do)' }, { value: 'round', label: 'Round to nearest' }, { value: 'ceil', label: 'Round up' }]
const list = s => String(s || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean)
const mccList = s => list(s).map(Number).filter(n => Number.isInteger(n) && n > 0)
const num = v => (v === '' || v == null ? '' : String(v))

// a rate as the user thinks of it: cashback "% of spend", points "N points per ₹M"
function RateFields({ type, rate, onChange, label }) {
  const pct = type === 'cashback'
  const set = patch => onChange({ ...rate, ...patch })
  return (
    <div>
      <div className="label-caps" style={{ marginBottom: 6 }}>{label}</div>
      {pct ? (
        <div className="form-grid">
          <Field label="Cashback %"><TextField type="number" inputMode="decimal" value={num(rate.value)} onChange={e => set({ value: e.target.value === '' ? '' : Number(e.target.value), per: 100, blockBased: false })} placeholder="e.g. 5" /></Field>
        </div>
      ) : (
        <>
          <div className="form-grid">
            <Field label="Points"><TextField type="number" inputMode="decimal" value={num(rate.value)} onChange={e => set({ value: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="e.g. 2" /></Field>
            <Field label="for every ₹"><TextField type="number" inputMode="decimal" value={num(rate.per)} onChange={e => set({ per: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="e.g. 150" /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 6 }}>
            <input type="checkbox" checked={rate.blockBased !== false} onChange={e => set({ blockBased: e.target.checked })} /> Only complete blocks earn (₹299 at 2 per ₹150 gives 2, not 3)
          </label>
        </>
      )}
    </div>
  )
}

function Chips({ all, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {all.map(c => {
        const on = (value || []).includes(c)
        return <div key={c} className={`chip${on ? ' active' : ''}`} onClick={() => onChange(on ? value.filter(x => x !== c) : [...(value || []), c])}>{c}</div>
      })}
    </div>
  )
}

// a "where does it apply" block: categories, MCC codes and merchant words
function MatchFields({ match, onChange, categories }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Field label="Categories"><Chips all={categories} value={match.categories} onChange={v => onChange({ ...match, categories: v })} /></Field>
      <Field label="MCC codes" hint="Comma separated, e.g. 5411, 5499"><TextField value={match.mccsText ?? (match.mccs || []).join(', ')} onChange={e => onChange({ ...match, mccsText: e.target.value, mccs: mccList(e.target.value) })} placeholder="Optional" /></Field>
      <Field label="Merchant words" hint="Words in the merchant name, e.g. amazon, flipkart"><TextField value={match.merchantsText ?? (match.merchants || []).join(', ')} onChange={e => onChange({ ...match, merchantsText: e.target.value, merchants: list(e.target.value) })} placeholder="Optional" /></Field>
    </div>
  )
}

function AccelSheet({ type, rule, categories, onSave, onClose }) {
  const [r, setR] = useState(rule)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{rule.label ? 'Edit rule' : 'Accelerated rule'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name"><TextField value={r.label} onChange={e => setR({ ...r, label: e.target.value })} placeholder="e.g. 5% on grocery" /></Field>
          <RateFields type={type} rate={r.rate} onChange={rate => setR({ ...r, rate })} label="Rate for this rule" />
          <FormHeading sub="A spend matching any of these earns this rate">Applies to</FormHeading>
          <MatchFields match={r} onChange={m => setR({ ...r, ...m })} categories={categories} />
          <div className="form-grid">
            <Field label="Min spend (₹)" hint="Below this the base rate applies"><TextField type="number" inputMode="decimal" value={num(r.minSpend)} onChange={e => setR({ ...r, minSpend: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" /></Field>
            <Field label={`Cap per cycle (${type === 'points' ? 'pts' : '₹'})`}><TextField type="number" inputMode="decimal" value={num(r.capPerCycle)} onChange={e => setR({ ...r, capPerCycle: e.target.value === '' ? null : Number(e.target.value) })} placeholder="No cap" /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
            <BtnPrimary onClick={() => onSave({ ...r, label: r.label.trim() || 'Accelerated rule' })} style={{ flex: 1 }}>Save rule</BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RewardRulesSheet({ card, onClose }) {
  const { showNotification } = useStore()
  const categories = useRewardCategories()
  const [rules, setRules] = useState(null)
  const [edit, setEdit] = useState(null) // { index, rule }
  const [had, setHad] = useState(false)
  useEffect(() => { getRules(card.id).then(r => { setHad(!!r); setRules(r || DEFAULT_RULES(card.id)) }) }, [card.id])
  if (!rules) return null
  const type = rules.rewardType
  const set = patch => setRules(r => ({ ...r, ...patch }))
  const changeType = v => set(v === 'points' ? { rewardType: v, base: { value: 1, per: 100, blockBased: true } } : { rewardType: v, base: { value: 1, per: 100, blockBased: false } })

  const save = async () => {
    const clean = { ...rules, accelerated: rules.accelerated.map(({ mccsText, merchantsText, ...a }) => a), exclusions: (({ mccsText, merchantsText, ...e }) => e)(rules.exclusions) }
    if (!(Number(clean.base.value) >= 0) || !(Number(clean.base.per) > 0)) { showNotification('Enter the base rate', 'error'); return }
    await saveRules(clean); showNotification('Reward rules saved. Spends are tagged again.', 'success'); onClose()
  }
  const remove = async () => {
    if (!(await askConfirm({ title: 'Remove these reward rules?', message: 'The expected-reward tags on this card are cleared. Transactions are not changed.' }))) return
    await deleteRules(card.id); onClose()
  }
  const newRule = () => ({ id: 'r' + Date.now().toString(36), label: '', rate: type === 'points' ? { value: 2, per: 100, blockBased: true } : { value: 5, per: 100, blockBased: false }, categories: [], mccs: [], merchants: [], minSpend: '', capPerCycle: null })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Reward rules</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 14px' }}>{cardTitle(card)} · worked out on this phone from your own rules</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
            <input type="checkbox" checked={rules.enabled !== false} onChange={e => set({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} /> Work out expected rewards for this card
          </label>
          <Segmented value={type} options={[{ value: 'cashback', label: 'Cashback (₹)' }, { value: 'points', label: 'Reward points' }]} onChange={changeType} />
          <RateFields type={type} rate={rules.base} onChange={base => set({ base })} label="Base rate on all spends" />

          <div className="form-grid">
            <Field label="Min spend (₹)" hint="Smaller spends earn nothing"><TextField type="number" inputMode="decimal" value={num(rules.minSpend)} onChange={e => set({ minSpend: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0" /></Field>
            <Field label={`Card cap per cycle (${type === 'points' ? 'pts' : '₹'})`}><TextField type="number" inputMode="decimal" value={num(rules.capPerCycle)} onChange={e => set({ capPerCycle: e.target.value === '' ? null : Number(e.target.value) })} placeholder="No cap" /></Field>
          </div>
          <Field label="Rounding"><Picker value={rules.rounding || 'floor'} options={ROUNDING} onChange={v => set({ rounding: v })} title="Rounding" /></Field>

          <div>
            <div className="section-hdr" style={{ marginBottom: 6 }}>
              <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>Accelerated rewards</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setEdit({ index: -1, rule: newRule() })}><Plus size={13} style={{ verticalAlign: -2 }} /> Add</span>
            </div>
            {!rules.accelerated.length && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>None yet, e.g. 5% on grocery or on Amazon and Flipkart.</div>}
            {rules.accelerated.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{type === 'points' ? `${a.rate.value} pts per ₹${a.rate.per}` : `${a.rate.value}%`} · {[...(a.categories || []), ...(a.mccs || []).map(m => 'MCC ' + m), ...(a.merchants || [])].join(', ') || 'nothing selected'}{a.capPerCycle ? ` · cap ${a.capPerCycle}` : ''}</div>
                </div>
                <Pencil size={15} color="var(--txt2)" style={{ cursor: 'pointer' }} onClick={() => setEdit({ index: i, rule: a })} />
                <Trash2 size={15} color="var(--red-dim)" style={{ cursor: 'pointer' }} onClick={() => set({ accelerated: rules.accelerated.filter((_, k) => k !== i) })} />
              </div>
            ))}
          </div>

          <div>
            <FormHeading sub="These spends earn nothing (fuel, rent, wallet load, government...)">Exclusions</FormHeading>
            <MatchFields match={rules.exclusions || {}} onChange={exclusions => set({ exclusions })} categories={categories} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>Save rules</BtnPrimary>
          </div>
          {had && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Remove reward rules</button>}
        </div>
      </div>
      {edit && <AccelSheet type={type} rule={edit.rule} categories={categories} onClose={() => setEdit(null)} onSave={r => { set({ accelerated: edit.index < 0 ? [...rules.accelerated, r] : rules.accelerated.map((a, i) => (i === edit.index ? r : a)) }); setEdit(null) }} />}
    </div>
  )
}
