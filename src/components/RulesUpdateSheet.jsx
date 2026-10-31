import { useState } from 'react'
import { FileText, PackageOpen } from 'lucide-react'
import { useStore } from '../store'
import { getRules } from '../lib/rewardTagging'
import { allPack, suggestEntry, rulesFromEntry, applyEntry, diffRules } from '../lib/rulesPack'
import { readTermsText, rulesFromTerms, infoFromTerms } from '../lib/termsAssist'
import { describeRules } from '../lib/rewardRules'
import { cardTitle } from '../lib/cardCatalog'
import { BtnPrimary } from './UI'
import { Field, TextField } from './Fields'

// Keeps a card's reward rules up to date without a new app build: use the rules bundled with the app, or check a bank's
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

export default function RulesUpdateSheet({ card, onClose, onEdit }) {
  const { showNotification } = useStore()
  const [view, setView] = useState('menu') // menu | review | pdf
  const [entries, setEntries] = useState([])
  const [current, setCurrent] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [busy, setBusy] = useState(false)

  const open = async list => { setCurrent(await getRules(card.id)); setEntries(list); setView('review') }

  const useBundled = async () => {
    const pack = allPack(), hit = suggestEntry(card, pack)
    const list = pack.cards.map(c => ({ ...c, _suggested: hit && c.key === hit.key }))
    await open(list)
  }
  // read the document and make its rules the card's rules straight away (the old rules stay as an earlier version)
  const checkPdf = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const text = await readTermsText(await f.arrayBuffer())
      const r = rulesFromTerms(text, card.id)
      if (!r.found) { setPdf({ name: f.name, found: false }); setView('pdf'); return }
      const from = r.published || today()
      await applyEntry(card.id, { key: null, effectiveFrom: from, publishedOn: r.published, source: `Terms document: ${f.name}`, rules: r.rules, ...infoFromTerms(text) })
      setPdf({ name: f.name, found: true, from, notes: r.notes, lines: describeRules(r.rules) }); setView('pdf')
      showNotification('Reward rules updated from the document. Spends are tagged again.', 'success')
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
              <Item icon={FileText} title={busy ? 'Reading the document…' : 'From a document'} sub="Choose the bank's terms PDF. Its rules replace this card's rules automatically." file={checkPdf} accept=".pdf,application/pdf" />
              <Item icon={PackageOpen} title="Rules from the app" sub="The rules that came with the app for your card. You see what changes before they apply." onClick={useBundled} />
            </div>
          )}
          {view === 'review' && <Review card={card} entries={entries} current={current} onDone={onClose} onBack={() => setView('menu')} />}
          {view === 'pdf' && pdf && (
            <>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{pdf.name}</div>
              {pdf.found ? (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>Rules updated from this document, from {pdf.from}</div>
                  <div>
                    {pdf.lines.map((l, k) => <div key={k} style={{ ...row, display: 'flex', gap: 8 }}><span>{l.icon}</span><span>{l.text}</span></div>)}
                    {pdf.notes.map((n, k) => <div key={'n' + k} style={{ ...row, color: 'var(--amber-dim)' }}>{n}</div>)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Only what the document says is kept. Bank wording varies, so check these against the document. Earlier spends keep the earlier rules.</div>
                </>
              ) : (
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>No reward rates could be read from this document, so your rules are unchanged. Try the terms and conditions PDF that lists the cashback or points, or use the rules from the app.</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" style={{ height: 46, flex: 1 }} onClick={() => (pdf.found ? onClose() : setView('menu'))}>{pdf.found ? 'Done' : 'Back'}</button>
                {pdf.found && onEdit && <button className="btn-ghost" style={{ height: 46, flex: 1 }} onClick={onEdit}>Fine-tune</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
