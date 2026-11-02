import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronUp, Paperclip, Percent, Trash2 } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { buildPf, loadPfInputs, saveSettings, saveRate, parsePassbookPdf, savePassbook, clearPassbooks, parsePastedContributions, WAGE_CEILING } from '../lib/pf'
import { fyLabel, monthLabel } from '../lib/salary'
import { BtnPrimary, SubHeader, formatINR } from './UI'
import { TextField } from './Fields'

// Profile -> Provident fund. Amounts are worked out from your payslips (and an EPF passbook when you add one): you can only change the percentages.

const Stat = ({ k, v, sub, color }) => (
  <div><div className="label-caps">{k}</div><div style={{ fontSize: 17, fontWeight: 800, color }}>{v}</div>{sub && <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{sub}</div>}</div>
)
const Line = ({ k, v, bold, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12.5 }}>
    <span style={{ color: bold ? 'var(--txt)' : 'var(--txt2)', fontWeight: bold ? 700 : 400 }}>{k}</span><span style={{ fontWeight: bold ? 800 : 600, color }}>{v}</span>
  </div>
)

// a percentage you can change; it is saved when you leave the box. `max` keeps it sensible.
function PctField({ label, value, onSave, hint, max = 100, disabled, readOnly }) {
  const [v, setV] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(String(value)) }
  if (readOnly) return <div><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 16, fontWeight: 800 }}>{value}%</div>{hint && <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 3 }}>{hint}</div>}</div>
  const commit = () => { const x = Number(v); if (v === '' || !(x >= 0) || x > max) { setV(String(value)); return } if (x !== value) onSave(x) }
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <TextField icon={<Percent size={16} />} type="number" inputMode="decimal" step="0.01" min="0" max={max} value={v} disabled={disabled} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} aria-label={label} />
      {hint && <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function UploadSheet({ onClose }) {
  const { showNotification } = useStore()
  const [file, setFile] = useState(null)
  const [needPw, setNeedPw] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [pasted, setPasted] = useState('')
  const readPasted = () => { try { setRes(parsePastedContributions(pasted)) } catch (e) { showNotification(e.message, 'error') } }
  const read = async (f = file, password = pw) => {
    setBusy(true)
    try {
      // a passbook is read and applied straight away: its months replace the payslip figures, its balance becomes the starting point
      const p = await parsePassbookPdf(await f.arrayBuffer(), password)
      await savePassbook(p)
      const n = p.contributions.length
      showNotification(`PF updated from the passbook: ${n} month${n === 1 ? '' : 's'}${p.balance ? ' and the balance' : ''}${p.check && !p.check.ok ? '. Its rows do not add up to the closing balance it prints, so check the figures' : ''}`, p.check && !p.check.ok ? undefined : 'success')
      onClose()
      return
    }
    catch (e) { if (e.needPassword) { setFile(f); setNeedPw(true); setPw(''); showNotification(e.message, e.wrong ? 'error' : undefined) } else showNotification(e.message || 'Could not read that file', 'error') }
    setBusy(false)
  }
  const save = async () => { setBusy(true); try { const n = await savePassbook(res); showNotification(`${n} figure${n === 1 ? '' : 's'} saved from the passbook`, 'success'); onClose() } catch (e) { showNotification(e.message || 'Could not save', 'error') } setBusy(false) }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>Add PF statement</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!res && !needPw && (
            <>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Choose your EPF passbook (PDF from the EPFO member portal). It is read on this phone and the file is not kept: only the contributions, interest and closing balance are saved, and they replace the worked-out figures for the same months and years. Your UAN and member ID are not saved.</div>
              <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, cursor: 'pointer' }}>
                <Paperclip size={16} /> {busy ? 'Reading…' : 'Choose EPF passbook (PDF)'}
                <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f, '') }} />
              </label>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Or paste the contribution table from the EPFO member portal (wage month, employee, employer, pension). A month with pension 0 means that employer paid none.</div>
              <textarea className="input" rows={5} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'AUG-2026  ₹4095  ₹2845  ₹1250\nJUL-2026  ₹4095  ₹2845  ₹1250'} style={{ width: '100%', borderRadius: 14, padding: 12, fontSize: 12.5, resize: 'vertical' }} />
              <button className="btn-secondary" style={{ height: 44 }} disabled={!pasted.trim()} onClick={readPasted}>Read pasted table</button>
            </>
          )}
          {needPw && (
            <>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>This PDF is password protected. Enter its password.</div>
              <TextField type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="PDF password" />
              <BtnPrimary onClick={() => read()} >{busy ? 'Opening…' : 'Open'}</BtnPrimary>
            </>
          )}
          {res && (
            <>
              <div className="card">
                <div className="label-caps" style={{ marginBottom: 4 }}>Found in the passbook</div>
                <Line k="Contribution months" v={res.contributions.length ? `${res.contributions.length} (${monthLabel(res.contributions[0].month)} – ${monthLabel(res.contributions[res.contributions.length - 1].month)})` : 'none'} />
                {res.contributions.length > 0 && <Line k="Pension in those months" v={formatINR(res.contributions.reduce((t, c) => t + c.eps, 0), 2)} />}
                <Line k="Yearly interest entries" v={res.interest.length ? res.interest.map(i => fyLabel(i.fy)).join(', ') : 'none'} />
                <Line k="Closing balance" v={res.balance ? `${formatINR(res.balance.ee + res.balance.er, 2)} as on ${res.balance.asOf}` : 'none'} />
                {res.balance?.eps > 0 && <Line k="Pension fund balance" v={formatINR(res.balance.eps, 2)} />}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => { setRes(null); setFile(null) }}>Back</button>
                <BtnPrimary onClick={save} style={{ flex: 1 }}>{busy ? 'Saving…' : 'Save these figures'}</BtnPrimary>
              </div>
            </>
          )}
          {!res && <button className="btn-ghost" style={{ height: 46 }} onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  )
}

export default function PfPage() {
  const { showNotification } = useStore()
  const inputs = useLiveQuery(async () => loadPfInputs(), [], null)
  useLiveQuery(() => db.pf_statements.count()) // refresh when passbook figures change
  const [open, setOpen] = useState(null)
  const [editing, setEditing] = useState(false) // percentages and rates are read-only until you tap Edit
  const [upload, setUpload] = useState(false)
  const pf = inputs ? buildPf(inputs) : null
  const saved = inputs?.statements.length || 0
  const jobs = inputs ? [...inputs.jobs].sort((a, b) => String(b.joinDate).localeCompare(String(a.joinDate))) : []
  const setPct = (job, patch) => {
    const cur = inputs.byJob[job.id]
    if ({ ...cur, ...patch }.pensionPct > { ...cur, ...patch }.employerPct) { showNotification('The pension share cannot be more than the employer contribution', 'error'); return }
    saveSettings(job.id, patch, cur)
  }
  const clear = async () => {
    if (!(await askConfirm({ title: 'Remove passbook figures?', message: `${saved} saved figure${saved === 1 ? '' : 's'} are removed and the PF goes back to being worked out from your payslips.`, confirmLabel: 'Remove', danger: true }))) return
    await clearPassbooks()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubHeader title="Provident fund" sub="PF and pension, worked out from your payslips" right={<>
        <button className={editing ? 'btn-primary' : 'btn-secondary'} style={{ height: 34, padding: '0 16px', fontSize: 12 }} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        <span onClick={() => setUpload(true)} style={{ color: 'var(--gold-dim)', cursor: 'pointer' }} aria-label="Add PF statement" title="Add PF statement"><Paperclip size={20} /></span>
      </>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 24px' }}>
        {!inputs && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Working it out…</div>}

        {pf && !pf.empty && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="label-caps">PF balance (EPF)</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--mint-dim)' }}>{formatINR(pf.epfBalance, 2)}</div>
            <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 8 }}>{pf.estimated ? `Counted from ${monthLabel(pf.months[0].month)}. Add your EPF passbook for the exact balance including earlier years.` : `From your passbook balance of ${pf.balanceFrom.asOf}, plus the months since`}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Stat k="Your share" v={formatINR(pf.eeBalance, 2)} />
              <Stat k="Employer share" v={formatINR(pf.erBalance, 2)} />
              <Stat k="Interest earned" v={formatINR(pf.split.interest, 2)} color="var(--gold-dim)" sub="all years so far" />
              <Stat k="Interest so far this year" v={formatINR(pf.accrued, 2)} sub={pf.accruedFy != null ? `credited 31 Mar ${pf.accruedFy + 1}` : ''} />
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div className="label-caps" style={{ marginBottom: 2 }}>How the PF balance adds up</div>
              <Line k="You put in" v={formatINR(pf.split.eeContrib, 2)} />
              <Line k="Employer put in (PF part)" v={formatINR(pf.split.erContrib, 2)} />
              <Line k="Interest earned" v={formatINR(pf.split.interest, 2)} bold color="var(--gold-dim)" />
              <Line k="  on your share / employer share" v={`${formatINR(pf.split.interestEe, 2)} / ${formatINR(pf.split.interestEr, 2)}`} />
              <Line k="PF balance" v={formatINR(pf.epfBalance, 2)} bold />
              {pf.split.since && <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 4 }}>Contributions are counted from {monthLabel(pf.split.since)} (your first payslip or passbook month). Anything earlier shows up under interest, since the balance includes it.</div>}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div className="label-caps">Pension fund (EPS)</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{formatINR(pf.pensionBalance, 2)}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)' }}>The employer's pension part. It earns no interest; it pays a monthly pension after 10 years of service.</div>
            </div>
          </div>
        )}
        {pf?.empty && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>No PF found yet. Add payslips under Salary (the PF deducted on each is used) or add your EPF passbook with the paperclip above.</div>}

        <div className="label-caps" style={{ color: 'var(--gold-dim)', margin: '4px 0 2px' }}>Contribution split · per employer</div>
        <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 6 }}>Employers differ: some pay a pension share, some put the whole employer contribution into PF (set the pension to 0). Only percentages can be changed; the rupee amounts come from your payslips and passbook.</div>
        {inputs && !jobs.length && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>Add an employer and payslips under Salary to set its PF split.</div>}
        {jobs.map(job => {
          const s = inputs.byJob[job.id]
          const erPf = Math.max(0, +(s.employerPct - s.pensionPct).toFixed(2))
          const recent = inputs.records.filter(r => r.jobId === job.id && r.pf > 0).sort((a, b) => b.month.localeCompare(a.month))[0]
          const m = recent && pf?.months?.find(x => x.month === recent.month)
          return (
            <div key={job.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{job.employer}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 10 }}>{job.joinDate ? monthLabel(job.joinDate.slice(0, 7)) : '—'} → {job.endDate ? monthLabel(job.endDate.slice(0, 7)) : 'present'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PctField readOnly={!editing} label="You contribute (%)" value={s.employeePct} onSave={v => setPct(job, { employeePct: v })} hint="of PF wages" />
                <PctField readOnly={!editing} label="Employer contributes (%)" value={s.employerPct} onSave={v => setPct(job, { employerPct: v })} hint="of PF wages" />
                <PctField readOnly={!editing} label="Of that, to pension (%)" value={s.pensionPct} onSave={v => setPct(job, { pensionPct: v })} hint={s.pensionPct === 0 ? 'no pension from this employer' : 'usually 8.33'} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Rest goes into PF (%)</div>
                  <div style={{ height: 48, borderRadius: 14, background: 'var(--bg2)', display: 'flex', alignItems: 'center', padding: '0 14px', fontWeight: 700 }}>{erPf}%</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 3 }}>{s.employerPct}% − {s.pensionPct}%</div>
                </div>
              </div>
              {s.pensionPct > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12.5 }}>
                  <input type="checkbox" disabled={!editing} checked={s.pensionCap} onChange={e => saveSettings(job.id, { pensionCap: e.target.checked }, s)} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />
                  <span>Pension is worked out on wages up to {formatINR(WAGE_CEILING)} only (the EPFO ceiling, at most ₹1,250 a month)</span>
                </label>
              )}
              {m && <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginTop: 10 }}>{monthLabel(m.month)}: you {formatINR(m.ee, 2)} → PF. Employer {formatINR(m.er + m.eps, 2)}: {formatINR(m.eps, 2)} → pension, {formatINR(m.er, 2)} → PF{m.source === 'statement' ? ' (from your passbook)' : ''}.</div>}
            </div>
          )
        })}

        {pf && !pf.empty && (
          <>
            <div className="label-caps" style={{ color: 'var(--gold-dim)', margin: '4px 0 6px' }}>Year by year · interest credited</div>
            {pf.sections.map(sec => {
              const credited = sec.credited
              const isOpen = open === sec.fy
              return (
                <div key={sec.fy} className="card" style={{ marginBottom: 10 }}>
                  <div onClick={() => setOpen(isOpen ? null : sec.fy)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{fyLabel(sec.fy)}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{credited ? `Interest ${formatINR(credited.total, 2)}${credited.source === 'statement' ? ' (passbook)' : ' (worked out)'}` : sec.accrued > 0 ? `Interest so far ${formatINR(sec.accrued, 2)}, credited on year end` : sec.inBalance ? 'Interest is already in the passbook balance' : 'No interest yet'}</div>
                    </div>
                    {isOpen ? <ChevronUp size={18} color="var(--txt3)" /> : <ChevronDown size={18} color="var(--txt3)" />}
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ maxWidth: 200, marginBottom: 8 }}>
                        <PctField readOnly={!editing} label="Interest rate for the year (%)" value={sec.rate} max={20} onSave={v => saveRate(sec.fy, v)} hint={sec.customRate ? 'your rate' : 'EPFO declared rate (default)'} />
                      </div>
                      {sec.customRate && editing && <button className="btn-ghost" style={{ height: 34, fontSize: 12, marginBottom: 8 }} onClick={() => saveRate(sec.fy, '')}>Use the default rate</button>}
                      <Line k="Your PF contributions" v={formatINR(sec.ee, 2)} />
                      <Line k="Employer's PF part" v={formatINR(sec.er, 2)} />
                      <Line k="Employer's pension part" v={formatINR(sec.eps, 2)} />
                      {credited && <Line k="Interest credited" v={formatINR(credited.total, 2)} bold color="var(--gold-dim)" />}
                      {credited && <Line k="  on your share / employer share" v={`${formatINR(credited.ee, 2)} / ${formatINR(credited.er, 2)}`} />}
                      {(sec.openingEpf > 0 || sec.closingEpf > 0) && <Line k="PF balance at the end" v={formatINR(sec.closingEpf, 2)} bold />}
                      <div className="label-caps" style={{ margin: '10px 0 2px' }}>Months</div>
                      {sec.months.slice().reverse().map(m => (
                        <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', fontSize: 12, borderTop: '1px solid var(--border)' }}>
                          <span>{monthLabel(m.month)}{m.source === 'statement' && <span style={{ color: 'var(--mint-dim)' }}> · passbook</span>}</span>
                          <span style={{ color: 'var(--txt2)' }}>You {formatINR(m.ee)} · Employer {formatINR(m.er)} · Pension {formatINR(m.eps)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {saved > 0 && editing && (
          <button className="btn-ghost" style={{ width: '100%', height: 42, marginTop: 4, color: 'var(--red-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={clear}><Trash2 size={15} /> Remove {saved} passbook figure{saved === 1 ? '' : 's'}</button>
        )}
      </div>
      {upload && <UploadSheet onClose={() => setUpload(false)} />}
    </div>
  )
}
