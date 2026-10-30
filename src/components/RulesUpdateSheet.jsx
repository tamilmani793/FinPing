import { useState } from 'react'
import { FileText, Upload, Download, PackageOpen } from 'lucide-react'
import { useStore } from '../store'
import { getRules } from '../lib/rewardTagging'
import { bundledPack, parsePack, suggestEntry, rulesFromEntry, applyEntry, exportPack, shareRulesFile, diffRules } from '../lib/rulesPack'
import { readTermsText, checkTerms } from '../lib/termsAssist'
import { cardTitle } from '../lib/cardCatalog'
import { BtnPrimary } from './UI'
import { Field, TextField } from './Fields'

// Keeps a card's reward rules up to date without a new app build: use the rules bundled with the app, import a rules file, or check a bank's
// terms PDF against the rules. Every change is shown first (what differs) and is saved as a new version from a date you choose, so spends
// before that date are still worked out with the old rules. Everything happens on the phone.

const row = { padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.45 }
const today = () => new Date().toISOString().slice(0, 10)

function Review({ card, entries, current, onDone, onBack }) {
  const { showNotification } = useStore()
  const [i, setI] = useState(Math.max(0, entries.findIndex(e => e._suggested)))
  const entry = entries[i]
  const [from, setFrom] = useState(entry.effectiveFrom || today())
  const next = rulesFromEntry(card.id, entry)
  const changes = diffRules(current, next)
  const apply = async () => {
    await applyEntry(card.id, { ...entry, effectiveFrom: from })
    showNotification('Reward rules updated. Spends are tagged again.', 'success'); onDone()
  }
  return (
    <>
      {entries.length > 1 && (
        <Field label="Rules to use for this card">
          <select className="input" value={i} onChange={e => { const k = Number(e.target.value); setI(k); setFrom(entries[k].effectiveFrom || today()) }}>
            {entries.map((e, k) => <option key={e.key + k} value={k}>{e.name}</option>)}
          </select>
        </Field>
      )}
      <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{entry.name}{entry.publishedOn ? ` · published ${entry.publishedOn}` : ''}{entry.source ? ` · ${entry.source}` : ''}</div>
      <div>
        <div className="label-caps" style={{ marginBottom: 4 }}>What changes</div>
        {changes.length ? changes.map((c, k) => <div key={k} style={row}>{c}</div>) : <div style={row}>Nothing differs from your current rules.</div>}
      </div>
      <Field label="Apply from" hint="Spends before this date keep the old rules">
        <TextField type="date" value={from} onChange={e => setFrom(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onBack}>Back</button>
        <BtnPrimary onClick={apply} style={{ flex: 1 }}>Apply as new version</BtnPrimary>
      </div>
    </>
  )
}

export default function RulesUpdateSheet({ card, onClose }) {
  const { showNotification } = useStore()
  const [view, setView] = useState('menu') // menu | review | pdf
  const [entries, setEntries] = useState([])
  const [current, setCurrent] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [busy, setBusy] = useState(false)

  const open = async list => { setCurrent(await getRules(card.id)); setEntries(list); setView('review') }

  const useBundled = async () => {
    const pack = bundledPack(), hit = suggestEntry(card, pack)
    const list = pack.cards.map(c => ({ ...c, _suggested: hit && c.key === hit.key }))
    await open(list)
  }
  const importFile = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try {
      const pack = parsePack(await f.text()), hit = suggestEntry(card, pack)
      await open(pack.cards.map(c => ({ ...c, _suggested: hit && c.key === hit.key })))
    } catch (err) { showNotification(err.message, 'error') }
  }
  const doExport = async () => {
    const pack = await exportPack(card.id, cardTitle(card))
    if (!pack) { showNotification('Save reward rules for this card first', 'error'); return }
    try { await shareRulesFile(pack, 'finping-reward-rules.json') } catch { /* share sheet closed */ }
  }
  const checkPdf = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const rules = await getRules(card.id)
      if (!rules) { showNotification('Save reward rules for this card first', 'error'); return }
      const text = await readTermsText(await f.arrayBuffer())
      setPdf({ name: f.name, ...checkTerms(text, rules) }); setView('pdf')
    } catch (err) { showNotification(err?.name === 'PasswordException' ? 'That PDF is password protected' : 'Could not read that PDF', 'error') } finally { setBusy(false) }
  }

  const Item = ({ icon: Icon, title, sub, onClick, file, accept }) => {
    const body = (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
        <Icon size={20} color="var(--gold-dim)" />
        <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--txt2)' }}>{sub}</div></div>
      </div>
    )
    return file ? <label style={{ display: 'block' }}>{body}<input type="file" accept={accept} style={{ display: 'none' }} onChange={file} /></label> : <div onClick={onClick}>{body}</div>
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Update reward rules</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 12px' }}>{cardTitle(card)} · nothing leaves this phone</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {view === 'menu' && (
            <div>
              <Item icon={PackageOpen} title="Use the rules that came with the app" sub="Millennia, Swiggy, UPI RuPay, SBI Cashback, HSBC Live+. You see what changes first." onClick={useBundled} />
              <Item icon={Upload} title="Import a rules file" sub="A file exported from another phone or sent to you" file={importFile} accept=".json,application/json" />
              <Item icon={FileText} title={busy ? 'Reading the PDF…' : "Check a bank's terms PDF"} sub="Lists what the PDF says that your rules do not" file={checkPdf} accept=".pdf,application/pdf" />
              <Item icon={Download} title="Export these rules" sub="Share this card's rules as a file" onClick={doExport} />
            </div>
          )}
          {view === 'review' && <Review card={card} entries={entries} current={current} onDone={onClose} onBack={() => setView('menu')} />}
          {view === 'pdf' && pdf && (
            <>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{pdf.name}{pdf.published ? ` · published ${pdf.published}` : ''}</div>
              <div>
                {pdf.lines.map((l, k) => <div key={k} style={{ ...row, color: l.tone === 'ok' ? 'var(--green-dim, var(--txt))' : 'var(--txt)' }}>{l.tone === 'diff' ? '• ' : ''}{l.text}</div>)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>This is a prompt to look, not a verdict: bank wording varies. To change a rule, edit it in Reward rules, or import a rules file.</div>
              <button className="btn-ghost" style={{ height: 46 }} onClick={() => setView('menu')}>Back</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
