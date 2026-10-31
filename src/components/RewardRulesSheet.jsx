import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronRight, Pencil, Check, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { getRules, saveRules, deleteRules } from '../lib/rewardTagging'
import { DEFAULT_RULES, describeRules, calculateExpectedReward } from '../lib/rewardRules'
import { getMccMap } from '../lib/mcc'
import { SHOW_MCC } from '../lib/features'
import { cardTitle } from '../lib/cardCatalog'
import { BtnPrimary } from './UI'
import { Field, FormHeading, Segmented, TextField, Picker } from './Fields'
import { useRewardCategories } from './MccMaintainer'
import RulesUpdateSheet from './RulesUpdateSheet'

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
      {SHOW_MCC && (
      <Field label="MCC codes" hint="Comma separated, e.g. 5411, 5499"><TextField value={match.mccsText ?? (match.mccs || []).join(', ')} onChange={e => onChange({ ...match, mccsText: e.target.value, mccs: mccList(e.target.value) })} placeholder="Optional" /></Field>
      )}
      <Field label="Merchant words" hint="Words in the merchant name, e.g. amazon, flipkart"><TextField value={match.merchantsText ?? (match.merchants || []).join(', ')} onChange={e => onChange({ ...match, merchantsText: e.target.value, merchants: list(e.target.value) })} placeholder="Optional" /></Field>
    </div>
  )
}

function SmallSheet({ title, onClose, children }) {
  return (
    <div className="overlay" style={{ zIndex: 45 }} onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
      </div>
    </div>
  )
}

function AccelSheet({ type, rule, categories, onSave, onDelete, onClose }) {
  const [r, setR] = useState(rule)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{rule.label ? 'Edit rule' : 'New rule'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name"><TextField value={r.label} onChange={e => setR({ ...r, label: e.target.value })} placeholder="e.g. 5% on grocery" /></Field>
          <RateFields type={type} rate={r.rate} onChange={rate => setR({ ...r, rate })} label="Rate for this rule" />
          <FormHeading sub="A spend matching any of these earns this rate">Applies to</FormHeading>
          <MatchFields match={r} onChange={m => setR({ ...r, ...m })} categories={categories} />
          <FormHeading sub="Even if the above matches, these get the base rate instead (e.g. Amazon, Flipkart on a grocery rule)">Leave out</FormHeading>
          <div className="form-grid">
            {SHOW_MCC && (
            <Field label="MCC codes"><TextField value={r.excludeMccsText ?? (r.excludeMccs || []).join(', ')} onChange={e => setR({ ...r, excludeMccsText: e.target.value, excludeMccs: mccList(e.target.value) })} placeholder="Optional" /></Field>
            )}
            <Field label="Merchant words"><TextField value={r.excludeMerchantsText ?? (r.excludeMerchants || []).join(', ')} onChange={e => setR({ ...r, excludeMerchantsText: e.target.value, excludeMerchants: list(e.target.value) })} placeholder="Optional" /></Field>
          </div>
          <div className="form-grid">
            <Field label="Min spend (₹)" hint="Below this the base rate applies"><TextField type="number" inputMode="decimal" value={num(r.minSpend)} onChange={e => setR({ ...r, minSpend: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" /></Field>
            <Field label={`Cap per cycle (${type === 'points' ? 'pts' : '₹'})`}><TextField type="number" inputMode="decimal" value={num(r.capPerCycle)} onChange={e => setR({ ...r, capPerCycle: e.target.value === '' ? null : Number(e.target.value) })} placeholder="No cap" /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
            <BtnPrimary onClick={() => onSave({ ...r, label: r.label.trim() || 'New rule' })} style={{ flex: 1 }}>Save rule</BtnPrimary>
          </div>
          {onDelete && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, lineHeight: 1 }} onClick={onDelete}><Trash2 size={15} style={{ flexShrink: 0 }} /><span>Delete this rule</span></button>}
        </div>
      </div>
    </div>
  )
}

// "What would this spend earn?": type a merchant and an amount, see the reward and which rule gave it
function TryIt({ rules }) {
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [mcc, setMcc] = useState('')
  const [map, setMap] = useState({})
  useEffect(() => { getMccMap().then(setMap).catch(() => {}) }, [])
  const amt = Number(amount)
  const r = amt > 0 ? calculateExpectedReward({ amount: amt, type: 'debit', merchant, mcc: mcc || undefined }, rules, undefined, map) : null
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
      <div className="label-caps" style={{ marginBottom: 8 }}>Try a spend</div>
      <div className="form-grid">
        <Field label="Merchant"><TextField value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="e.g. Amazon" /></Field>
        <Field label="Amount (₹)"><TextField type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 1250" /></Field>
      </div>
      {SHOW_MCC && (
      <Field label="Merchant code (optional)" hint="The 4-digit MCC, e.g. 5411 for grocery"><TextField value={mcc} onChange={e => setMcc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Optional" /></Field>
      )}
      {r && (
        <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 700 }}>
          {r.amount > 0 ? 'Earns ' + (r.type === 'points' ? Math.round(r.amount) + ' points' : '₹' + r.amount) : 'Earns nothing'}
          <span style={{ fontWeight: 500, color: 'var(--txt2)' }}> · {r.rule.kind === 'base' || r.rule.kind === 'accelerated' ? r.rule.label : r.reason || r.rule.label}{r.capped && r.reason ? ' (' + r.reason + ')' : ''}</span>
        </div>
      )}
    </div>
  )
}

export default function RewardRulesSheet({ card, onClose }) {
  const { showNotification } = useStore()
  const categories = useRewardCategories()
  const [rules, setRules] = useState(null)
  const [edit, setEdit] = useState(null) // { index, rule }
  const [had, setHad] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [manage, setManage] = useState(false) // false: the rules read as text; true: the list, tap a row to change it
  const [rateEdit, setRateEdit] = useState(false) // the rate for all other spends
  const [exclEdit, setExclEdit] = useState(false) // what earns nothing
  const [editing, setEditing] = useState(false) // limits & settings form
  const [changedFrom, setChangedFrom] = useState('') // the date a bank's change applies from; saves a new version instead of overwriting
  const load = () => getRules(card.id).then(r => { setHad(!!r); setRules(r || DEFAULT_RULES(card.id)) })
  useEffect(() => { load(); setEditing(false); setManage(false) }, [card.id])
  if (!rules) return null
  const type = rules.rewardType
  const set = patch => setRules(r => ({ ...r, ...patch }))
  const changeType = v => set(v === 'points' ? { rewardType: v, base: { value: 1, per: 100, blockBased: true } } : { rewardType: v, base: { value: 1, per: 100, blockBased: false } })

  const cleaned = r => ({ ...r, accelerated: r.accelerated.map(({ mccsText, merchantsText, excludeMccsText, excludeMerchantsText, ...a }) => a), exclusions: (({ mccsText, merchantsText, ...e }) => e)(r.exclusions) })
  // every change to a rule is saved straight away
  const persist = async next => {
    setRules(next)
    await saveRules(cleaned(next)); setHad(true)
    showNotification('Rules saved. Spends are tagged again.', 'success')
  }
  const changeAccel = accelerated => persist({ ...rules, accelerated })
  const save = async () => {
    const clean = cleaned(rules)
    if (changedFrom) clean.effectiveFrom = changedFrom
    await saveRules(clean, { asNewVersion: !!changedFrom && had }); setHad(true); setChangedFrom(''); setEditing(false); load()
    showNotification('Reward rules saved. Spends are tagged again.', 'success')
  }
  const remove = async () => {
    if (!(await askConfirm({ title: 'Remove these reward rules?', message: 'The expected-reward tags on this card are cleared. Transactions are not changed.' }))) return
    await deleteRules(card.id); onClose()
  }
  const setUpMyself = async () => { await saveRules(cleaned(rules)); setHad(true); setManage(true) }
  const rateText = r => (type === 'points' ? `${r.value} pts per ₹${r.per}` : `${r.value}%`)
  const newRule = () => ({ id: 'r' + Date.now().toString(36), label: '', rate: type === 'points' ? { value: 2, per: 100, blockBased: true } : { value: 5, per: 100, blockBased: false }, categories: [], mccs: [], merchants: [], minSpend: '', capPerCycle: null })
  const exclText = [...(rules.exclusions?.categories || []), ...(rules.exclusions?.merchants || []), ...(rules.exclusions?.mccs || []).map(m => 'MCC ' + m)].join(', ') || 'nothing excluded'

  const Icon = ({ I, label, onClick }) => <div className="picker-close" style={{ width: 36, height: 36 }} role="button" aria-label={label} title={label} onClick={onClick}><I size={17} /></div>
  const Row = ({ title, sub, onClick, first }) => (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: first ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{sub}</div>
      </div>
      <ChevronRight size={18} color="var(--txt3)" />
    </div>
  )

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{editing ? 'Limits & settings' : 'Reward rules'}</div>
          {had && !editing && (
            <div style={{ display: 'flex', gap: 8 }}>
              {manage ? (
                <>
                  <Icon I={Plus} label="Add rule" onClick={() => setEdit({ index: -1, rule: newRule() })} />
                  <Icon I={Check} label="Done" onClick={() => setManage(false)} />
                </>
              ) : (
                <>
                  <Icon I={RefreshCw} label="Update rules" onClick={() => setUpdateOpen(true)} />
                  <Icon I={Pencil} label="Edit rules" onClick={() => setManage(true)} />
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 14px' }}>{cardTitle(card)} · worked out on this phone from your own rules</div>

        {!had && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 12 }}>No reward rules for this card yet. Start with the rules that came with the app, or add your own.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ height: 46, flex: 1 }} onClick={setUpMyself}>Add my own</button>
              <BtnPrimary onClick={() => setUpdateOpen(true)} style={{ flex: 1 }}>Use app rules</BtnPrimary>
            </div>
          </div>
        )}

        {had && !manage && !editing && (
          <>
            <div className="card" style={{ marginBottom: 14, paddingTop: 6, paddingBottom: 6 }}>
              {describeRules(rules).map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13, lineHeight: 1.45 }}><span>{l.icon}</span><span>{l.text}</span></div>
              ))}
            </div>
            <TryIt rules={rules} />
          </>
        )}

        {had && manage && !editing && (
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {rules.accelerated.map((a, i) => (
              <Row key={a.id} first={i === 0} title={a.label} onClick={() => setEdit({ index: i, rule: a })}
                sub={`${rateText(a.rate)} · ${[...(a.categories || []), ...(a.mccs || []).map(m => 'MCC ' + m), ...(a.merchants || [])].join(', ') || 'nothing selected'}${a.capPerCycle ? ` · cap ${a.capPerCycle}` : ''}`} />
            ))}
            <Row first={!rules.accelerated.length} title="All other spends" sub={rateText(rules.base)} onClick={() => setRateEdit(true)} />
            <Row title="No reward on" sub={exclText} onClick={() => setExclEdit(true)} />
            <Row title="Limits & settings" sub="Caps, minimum spend, rounding, when the bank changed its terms" onClick={() => setEditing(true)} />
          </div>
        )}
        {had && manage && !editing && (
          <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46, width: '100%', marginTop: 14 }} onClick={remove}>Remove reward rules</button>
        )}

        {editing && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
            <input type="checkbox" checked={rules.enabled !== false} onChange={e => set({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} /> Work out expected rewards for this card
          </label>
          <Segmented value={type} options={[{ value: 'cashback', label: 'Cashback (₹)' }, { value: 'points', label: 'Reward points' }]} onChange={changeType} />
          <div className="form-grid">
            <Field label="Min spend (₹)" hint="Smaller spends earn nothing"><TextField type="number" inputMode="decimal" value={num(rules.minSpend)} onChange={e => set({ minSpend: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="0" /></Field>
            <Field label={`Card cap per cycle (${type === 'points' ? 'pts' : '₹'})`}><TextField type="number" inputMode="decimal" value={num(rules.capPerCycle)} onChange={e => set({ capPerCycle: e.target.value === '' ? null : Number(e.target.value) })} placeholder="No cap" /></Field>
          </div>
          <Field label="Rounding"><Picker value={rules.rounding || 'floor'} options={ROUNDING} onChange={v => set({ rounding: v })} title="Rounding" /></Field>
          <div className="form-grid">
            <Field label={`Other-spends cap (${type === 'points' ? 'pts' : '₹'})`} hint="If the rate on all other spends has its own cap"><TextField type="number" inputMode="decimal" value={num(rules.baseCap)} onChange={e => set({ baseCap: e.target.value === '' ? null : Number(e.target.value) })} placeholder="No cap" /></Field>
            <Field label="Earns on blocks of (₹)" hint="e.g. 100: ₹1,250 earns on ₹1,200"><TextField type="number" inputMode="decimal" value={num(rules.spendBlock)} onChange={e => set({ spendBlock: e.target.value === '' ? 0 : Number(e.target.value) })} placeholder="Any amount" /></Field>
          </div>
          {type === 'points' && (
            <Field label="Value of one point (₹)" hint="Shows the reward as a % on each spend, e.g. 1 for Millennia, 0.25 for UPI RuPay"><TextField type="number" inputMode="decimal" value={num(rules.pointValue)} onChange={e => set({ pointValue: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 1" /></Field>
          )}
          <Field label="Caps reset every"><Segmented value={rules.capPeriod || 'billingCycle'} options={[{ value: 'billingCycle', label: 'Billing cycle' }, { value: 'calendarMonth', label: 'Calendar month' }]} onChange={v => set({ capPeriod: v })} /></Field>
          <div>
            <FormHeading sub="Leave empty to simply correct these rules. Set a date when the bank changed its terms: earlier spends keep the old rules.">Bank changed its terms?</FormHeading>
            <Field label="New rules apply from"><TextField type="date" value={changedFrom} onChange={e => setChangedFrom(e.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => { setEditing(false); load() }}>Cancel</button>
            <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
          </div>
        </div>}
      </div>
      {updateOpen && <RulesUpdateSheet card={card} onClose={() => { setUpdateOpen(false); load() }} onEdit={() => { setUpdateOpen(false); load(); setManage(true) }} />}
      {rateEdit && <SmallSheet title="All other spends" onClose={() => setRateEdit(false)}><RateFields type={type} rate={rules.base} onChange={base => setRules(r => ({ ...r, base }))} label="Rate on spends no other rule covers" /><BtnPrimary onClick={() => { setRateEdit(false); persist(rules) }} fullWidth>Save</BtnPrimary></SmallSheet>}
      {exclEdit && <SmallSheet title="No reward on" onClose={() => setExclEdit(false)}><MatchFields match={rules.exclusions || {}} onChange={exclusions => setRules(r => ({ ...r, exclusions }))} categories={categories} /><BtnPrimary onClick={() => { setExclEdit(false); persist(rules) }} fullWidth>Save</BtnPrimary></SmallSheet>}
      {edit && <AccelSheet type={type} rule={edit.rule} categories={categories} onClose={() => setEdit(null)} onDelete={edit.index >= 0 ? () => { changeAccel(rules.accelerated.filter((_, k) => k !== edit.index)); setEdit(null) } : null} onSave={r => { changeAccel(edit.index < 0 ? [...rules.accelerated, r] : rules.accelerated.map((a, i) => (i === edit.index ? r : a))); setEdit(null) }} />}
    </div>
  )
}
