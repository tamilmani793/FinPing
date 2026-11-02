import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Lightbulb, Bookmark, Trash2, Play } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { filterTxns, defaultFilter, periodLabel, rangeFor, accountKind } from '../lib/dateRange'
import { runAdvisory, SEVERITY } from '../lib/advisory'
import { txnName } from '../lib/txnName'
import { Segmented } from './Fields'
import PeriodFilter from './PeriodFilter'
import TxnEditSheet from './TxnEditSheet'
import { formatINR } from './UI'

const SEV = {
  high: { color: 'var(--red-dim)', bg: 'var(--red-bg)' },
  medium: { color: 'var(--gold-dim)', bg: 'var(--gold-bg)' },
  low: { color: 'var(--txt2)', bg: 'var(--bg2)' },
}

// Advisory: pick a period and accounts, run the check, and see the fees, interest and hidden costs that left your accounts, why, and how to stop them.
// Lessons you keep are saved on this phone until you delete them.
export default function AdvisorySheet({ onClose }) {
  const { showNotification } = useStore()
  const [tab, setTab] = useState('run')
  const [flt, setFlt] = useState(() => ({ ...defaultFilter(), period: '3m' }))
  const [result, setResult] = useState(null)
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState(null)
  const cards = (useLiveQuery(() => db.creditCards.toArray()) || []).filter(c => !c.draft && c.cardType !== 'unknown')
  const kept = useLiveQuery(() => db.advisory_notes.orderBy('savedAt').reverse().toArray()) || []
  const keptKeys = new Set(kept.map(k => k.key))

  const run = async () => {
    const all = await db.transactions.toArray()
    const list = filterTxns(all, { ...flt, dir: 'both', q: '' }, new Date(), cards)
    const [a, b] = rangeFor(flt)
    setResult({ ...runAdvisory(list, cards), label: periodLabel(flt.period) === 'Custom dates' || flt.period === 'pick' ? `${a ? format(a, 'd MMM yyyy') : '…'} – ${b ? format(b, 'd MMM yyyy') : '…'}` : periodLabel(flt.period), ranAt: Date.now() })
    setOpen(null)
  }

  const keep = async f => {
    const note = { key: f.key, title: f.label, severity: f.severity, why: f.why, tip: f.tip, cost: f.net, count: f.count, period: result?.label || '', savedAt: Date.now() }
    const prior = await db.advisory_notes.where('key').equals(f.key).first()
    if (prior) await db.advisory_notes.update(prior.id, note); else await db.advisory_notes.add(note)
    showNotification('Kept in your lessons', 'success')
  }
  const remove = async n => {
    if (!(await askConfirm({ title: 'Delete this lesson?', message: n.title, confirmLabel: 'Delete', danger: true }))) return
    await db.advisory_notes.delete(n.id)
  }
  const clearAll = async () => {
    if (!(await askConfirm({ title: `Delete all ${kept.length} lessons?`, message: 'They are removed from this phone.', confirmLabel: 'Delete all', danger: true }))) return
    await db.advisory_notes.clear()
  }

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="sheet-handle" />
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Advisory</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '2px 0 12px' }}>Finds fees, interest and hidden costs you paid without choosing them, and how to stop them</div>
          <Segmented value={tab} options={[{ value: 'run', label: 'Check' }, { value: 'kept', label: `Kept (${kept.length})` }]} onChange={setTab} />

          {tab === 'run' && (
            <div style={{ marginTop: 12 }}>
              <PeriodFilter value={flt} onChange={setFlt} accounts={cards} title="Check transactions from" showRange />
              <button className="btn-primary" style={{ width: '100%', height: 48, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={run}><Play size={16} /> Run the check</button>

              {result && (
                <div style={{ marginTop: 14 }}>
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="label-caps">Lost without choosing · {result.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: result.totals.all > 0 ? 'var(--red-dim)' : 'var(--mint-dim)' }}>{formatINR(result.totals.all, 2)}</div>
                    <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>
                      {formatINR(result.totals.actual, 2)} billed by the bank{result.totals.reversed > 0 ? ` (after ${formatINR(result.totals.reversed, 2)} reversed)` : ''} · about {formatINR(result.totals.estimated, 2)} estimated from your spends
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 4 }}>Looked at {result.checked} transaction{result.checked === 1 ? '' : 's'}. Estimates follow common bank rules; check your card's terms.</div>
                  </div>
                  {result.findings.length === 0 && <div style={{ fontSize: 13, color: 'var(--txt2)', padding: '8px 0' }}>Nothing found in this period. No fees, interest or hidden charges showed up. Keep going.</div>}
                  {result.findings.map(f => {
                    const sv = SEV[f.severity]
                    const isKept = keptKeys.has(f.key)
                    return (
                      <div key={f.key} className="card" style={{ marginBottom: 10 }}>
                        <div onClick={() => setOpen(open === f.key ? null : f.key)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{f.label}</div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: sv.bg, color: sv.color, whiteSpace: 'nowrap' }}>{SEVERITY[f.severity]}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: f.net > 0 ? 'var(--red-dim)' : 'var(--txt2)' }}>{f.net > 0 ? formatINR(f.net, 2) : 'No fee seen'}</span>
                            <span style={{ fontSize: 11, color: 'var(--txt2)' }}>{f.count} item{f.count === 1 ? '' : 's'}{f.estimated > 0 && f.actual === 0 ? ' · estimated' : ''}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 6 }}>{f.why}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--mint-bg)', color: 'var(--mint-dim)', fontSize: 12 }}>
                          <Lightbulb size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>How to avoid:</b> {f.tip}</span>
                        </div>
                        {f.notes.map((n, i) => <div key={i} style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 4 }}>• {n}</div>)}
                        <button className={isKept ? 'btn-ghost' : 'btn-secondary'} style={{ width: '100%', height: 40, marginTop: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => keep(f)}>
                          <Bookmark size={15} /> {isKept ? 'Kept · update with this period' : 'Keep this lesson'}
                        </button>
                        {open === f.key && (
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
                            {f.items.map((it, i) => (
                              <div key={i} onClick={() => it.group ? null : setEdit(it.txn)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', fontSize: 12, cursor: it.group ? 'default' : 'pointer', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label || `${format(new Date(it.txn.date), 'd MMM yyyy')} · ${txnName(it.txn)}`}</span>
                                <b style={{ whiteSpace: 'nowrap', color: it.estimate ? 'var(--gold-dim)' : 'var(--red-dim)' }}>{it.estimate ? `≈ ${formatINR(it.cost, 2)}` : formatINR(it.amount, 2)}</b>
                              </div>
                            ))}
                            <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 4 }}>Tap a billed charge to open or edit it.</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'kept' && (
            <div style={{ marginTop: 12 }}>
              {kept.length === 0 && <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Nothing kept yet. Run the check and tap "Keep this lesson" on what you want to remember.</div>}
              {kept.map(n => (
                <div key={n.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{n.title}</div>
                    <button className="btn-ghost" aria-label="Delete lesson" style={{ width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} onClick={() => remove(n)}><Trash2 size={15} color="var(--red-dim)" /></button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 2 }}>Cost {formatINR(n.cost || 0, 2)} · {n.period} · kept {format(new Date(n.savedAt), 'd MMM yyyy')}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 6 }}>{n.why}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--mint-bg)', color: 'var(--mint-dim)', fontSize: 12 }}>
                    <Lightbulb size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span><b>How to avoid:</b> {n.tip}</span>
                  </div>
                </div>
              ))}
              {kept.length > 1 && <button className="btn-ghost" style={{ width: '100%', height: 42, color: 'var(--red-dim)' }} onClick={clearAll}>Delete all lessons</button>}
            </div>
          )}
          <button className="btn-ghost" style={{ width: '100%', height: 46, marginTop: 8 }} onClick={onClose}>Close</button>
        </div>
      </div>
      {edit && <TxnEditSheet txn={edit} onClose={() => { setEdit(null); run() }} />}
    </>
  )
}
