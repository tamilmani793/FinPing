import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ChevronLeft, Pencil, Briefcase, Calendar, Paperclip, ChevronRight } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { db } from '../db/schema'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { parsePayslipPdf } from '../lib/payslipParser'
import { BtnPrimary, formatINR } from './UI'
import { Field, TextField, Picker } from './Fields'
import { monthLabel, componentsOf, detailOf, titleHistory, saveEmployer, deleteJob, deleteRecord, importMonths, parseDoj, profileSummary, filterPayslips, payTotals, payChartData, currentFyYear, fyStartYear, fyLabel } from '../lib/salary'

// Profile -> Salary. Nothing here is typed in by hand: you add a payslip (or a pay register with many months), it is read on this phone,
// and the payslips, employer dates and title / level changes follow from what the documents say. The PDF itself is NOT kept.

const I = 17
const fmtDate = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')

function Sheet({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── employer: just a name and from / to ──
function EmployerSheet({ job, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({ id: job?.id, employer: job?.employer || '', joinDate: job?.joinDate || '', endDate: job?.endDate || '' })
  const save = async () => {
    if (!f.employer.trim()) { showNotification('Enter the employer name', 'error'); return }
    await saveEmployer(f); onClose()
  }
  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this employer?', message: 'Its payslips are deleted too. Bank transactions are not changed.' }))) return
    await deleteJob(job.id); onClose()
  }
  return (
    <Sheet title={job ? 'Edit employer' : 'Add employer'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Employer"><TextField icon={<Briefcase size={I} />} value={f.employer} onChange={e => setF({ ...f, employer: e.target.value })} placeholder="Company name" /></Field>
        <div className="form-grid">
          <Field label="From"><TextField icon={<Calendar size={I} />} type="date" value={f.joinDate} onChange={e => setF({ ...f, joinDate: e.target.value })} /></Field>
          <Field label="To" hint="Empty = current"><TextField icon={<Calendar size={I} />} type="date" value={f.endDate} onChange={e => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
          <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
        </div>
        {job && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Delete employer</button>}
      </div>
    </Sheet>
  )
}

// ── one payslip, exactly as it was: profile details, earnings, deductions, net pay. Read only; it can be deleted. ──
function Row({ k, sub, v, bold, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--txt2)' }}>{k}{sub && <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{sub}</div>}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || 'var(--txt)', textAlign: 'right', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
}
function Block({ title, children }) { return <div style={{ marginBottom: 12 }}><div className="label-caps" style={{ color: 'var(--gold-dim)', marginBottom: 4 }}>{title}</div>{children}</div> }
const Line = ({ k, v, bold, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12.5, borderTop: bold ? '1px solid var(--border)' : 'none', marginTop: bold ? 4 : 0 }}>
    <span style={{ color: bold ? 'var(--txt)' : 'var(--txt2)', fontWeight: bold ? 700 : 400 }}>{k}</span><span style={{ fontWeight: bold ? 800 : 600, color, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
  </div>
)

function PayslipView({ rec, job, onClose }) {
  const c = componentsOf(rec)
  const earn = Object.entries(c.earnings), ded = Object.entries(c.deductions)
  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this payslip?', message: monthLabel(rec.month) + ' is removed. To bring it back, add the document again.' }))) return
    await deleteRecord(rec.id); onClose()
  }
  return (
    <Sheet title={`Payslip · ${monthLabel(rec.month)}`} onClose={onClose}>
      {job && <div style={{ fontSize: 12, color: 'var(--txt2)', margin: '-6px 0 10px' }}>{job.employer}</div>}
      {(() => {
        const rows = rec.profile?.length ? rec.profile : profileSummary(rec, job)
        return (
          <Block title="Profile details">
            {rows.map(p => <Line key={p.label} k={p.label} v={p.value} />)}
            {!rec.profile?.length && <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '4px 0' }}>{rows.length ? 'This payslip was saved before every detail was kept, so only some are shown. Add its document again to fill in the rest.' : 'No profile details were saved for this payslip. Add its document again to fill them in.'}</div>}
          </Block>
        )
      })()}
      <Block title="Earnings">
        {earn.map(([k, v]) => <Line key={k} k={k} v={formatINR(v, 2)} />)}
        <Line k="Gross earnings" v={formatINR(rec.gross, 2)} bold />
      </Block>
      <Block title="Deductions">
        {ded.map(([k, v]) => <Line key={k} k={k} v={formatINR(v, 2)} color="var(--red-dim)" />)}
        <Line k="Total deductions" v={formatINR(Math.max(0, rec.gross - rec.net), 2)} bold color="var(--red-dim)" />
      </Block>
      <div style={{ background: 'var(--mint-bg)', border: '1px solid var(--mint-border)', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="label-caps">Net pay</div>{rec.creditedOn && <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Credited {fmtDate(rec.creditedOn)}</div>}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(rec.net, 2)}</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-ghost" style={{ flex: 1, height: 48 }} onClick={onClose}>Close</button>
        <button className="btn-ghost" style={{ flex: 1, height: 48, color: 'var(--red-dim)', borderColor: 'var(--red-border)' }} onClick={remove}>Delete</button>
      </div>
    </Sheet>
  )
}

// ── add a payslip document: one month, or a pay register with many months. It is read, checked and saved; the file is not kept. ──
function AddDocumentSheet({ jobs, recs, onClose }) {
  const { showNotification } = useStore()
  const [file, setFile] = useState(null)
  const [needPw, setNeedPw] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [jobId, setJobId] = useState('new')
  const [employer, setEmployer] = useState('')
  const [sel, setSel] = useState({})

  const digits = s => String(s || '').replace(/\D/g, '')
  const idOfJob = j => digits(detailOf(recs.filter(r => r.jobId === j.id).sort((a, b) => b.month.localeCompare(a.month))[0], 'employeeId'))

  const read = async (f = file, password = pw) => {
    setBusy(true)
    try {
      const r = await parsePayslipPdf(await f.arrayBuffer(), password)
      setParsed(r); setFile(f); setNeedPw(false)
      const same = jobs.find(j => idOfJob(j) && idOfJob(j) === digits(r.employee.employeeId))
      setJobId(same ? String(same.id) : jobs.length === 1 ? String(jobs[0].id) : 'new')
      setEmployer(r.employer || (jobs.length ? '' : 'My employer'))
      setSel(Object.fromEntries(r.months.map(m => [m.month, !m.problems.length])))
    } catch (e) {
      if (e.needPassword) { setFile(f); setNeedPw(true); setPw(''); showNotification(e.message, e.wrong ? 'error' : undefined) } else showNotification(e.message || 'Could not read that file', 'error')
    }
    setBusy(false)
  }

  const job = jobId === 'new' ? null : jobs.find(j => j.id === Number(jobId))
  const existing = new Set(recs.filter(r => job && r.jobId === job.id).map(r => r.month))
  const picked = parsed ? parsed.months.filter(m => sel[m.month]) : []
  const mismatch = job && idOfJob(job) && digits(parsed?.employee.employeeId) && idOfJob(job) !== digits(parsed.employee.employeeId)

  const run = async () => {
    if (!picked.length) { showNotification('Tick at least one month', 'error'); return }
    if (jobId === 'new' && !employer.trim()) { showNotification('Enter the employer name', 'error'); return }
    if (mismatch && !(await askConfirm({ title: 'Different employee?', message: 'This document is for employee ' + parsed.employee.employeeId + ', not the one on the saved ' + job.employer + ' payslips. Add it anyway?', confirmLabel: 'Add anyway', danger: false }))) return
    setBusy(true)
    try {
      let id
      if (jobId === 'new') id = await saveEmployer({ employer, joinDate: parseDoj(parsed.employee.doj) })
      else { id = job.id; if (!job.joinDate && parseDoj(parsed.employee.doj)) await db.salaryJobs.update(id, { joinDate: parseDoj(parsed.employee.doj) }) }
      const r = await importMonths(id, picked, parsed.kind)
      showNotification(r.added + ' payslip' + (r.added === 1 ? '' : 's') + ' added' + (r.updated ? ', ' + r.updated + ' updated' : ''), 'success')
      onClose()
    } catch (err) { showNotification(err.message || 'Could not save', 'error') }
    setBusy(false)
  }

  return (
    <Sheet title="Add payslip document" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!parsed && !needPw && (
          <>
            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Choose a payslip PDF for one month, or a pay register with many months. It is read on this phone and the file is not kept: only the figures are saved.</div>
            <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, cursor: 'pointer' }}>
              <Paperclip size={16} /> {busy ? 'Reading…' : 'Choose payslip or pay register (PDF)'}
              <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f, '') }} />
            </label>
          </>
        )}
        {needPw && (
          <>
            <div style={{ fontSize: 12 }}>🔒 <b>{file?.name}</b> is password-protected. The password is used only on this phone to open the file and is forgotten right after.</div>
            <input className="input" type="password" autoFocus placeholder="PDF password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && pw) read() }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => { setNeedPw(false); setFile(null) }}>Back</button>
              <BtnPrimary onClick={() => read()} style={{ flex: 1 }}>{busy ? 'Opening…' : 'Open'}</BtnPrimary>
            </div>
          </>
        )}
        {parsed && (
          <>
            <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '10px 12px', fontSize: 12, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700 }}>{parsed.kind === 'register' ? 'Pay register · ' + parsed.months.length + ' months' : 'Payslip · ' + monthLabel(parsed.months[0].month)}</div>
              <div style={{ color: 'var(--txt2)' }}>{[parsed.employee.name, parsed.employee.employeeId && 'ID ' + parsed.employee.employeeId, parsed.employer || parsed.employee.entity, parsed.employee.location].filter(Boolean).join(' · ')}</div>
              <div style={{ color: parsed.check.ok ? 'var(--mint-dim)' : 'var(--red-dim)', marginTop: 4 }}>{parsed.check.ok ? '✓ Read completely: ' + parsed.check.notes.join('; ') : '⚠ ' + parsed.check.problems.join('; ')}</div>
            </div>
            <Field label="Employer">
              <Picker value={jobId} options={[...jobs.map(j => ({ value: String(j.id), label: j.employer })), { value: 'new', label: '＋ A new employer' }]} onChange={setJobId} title="Add to" />
            </Field>
            {jobId === 'new' && <Field label="Employer name"><TextField icon={<Briefcase size={I} />} value={employer} onChange={e => setEmployer(e.target.value)} placeholder="Company name" /></Field>}
            {mismatch && <div style={{ fontSize: 11.5, color: 'var(--red-dim)' }}>⚠ This document's employee ID ({parsed.employee.employeeId}) is not the one on the saved {job.employer} payslips.</div>}
            <div>
              <div className="label-caps" style={{ marginBottom: 4 }}>Months found · tick the ones to save</div>
              {parsed.months.map(m => (
                <label key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                  <input type="checkbox" checked={!!sel[m.month]} onChange={e => setSel({ ...sel, [m.month]: e.target.checked })} />
                  <span style={{ flex: 1, minWidth: 0 }}><b>{monthLabel(m.month)}</b> <span style={{ color: 'var(--txt2)' }}>· gross {formatINR(m.gross)}{existing.has(m.month) ? ' · replaces the saved one' : ''}</span>{m.problems.length > 0 && <span style={{ color: 'var(--red-dim)' }}> · {m.problems.join('; ')}</span>}</span>
                  <b style={{ color: 'var(--mint-dim)' }}>{formatINR(m.net)}</b>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => { setParsed(null); setFile(null) }}>Back</button>
              <BtnPrimary onClick={run} style={{ flex: 1 }}>{busy ? 'Saving…' : 'Save ' + picked.length + ' payslip' + (picked.length === 1 ? '' : 's')}</BtnPrimary>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ── the page ──
export default function SalaryPage() {
  const { setActiveTab } = useStore()
  const jobs = useLiveQuery(() => db.salaryJobs.toArray()) || []
  const recs = useLiveQuery(() => db.salaryRecords.toArray()) || []
  const [sheet, setSheet] = useState(null)
  const [flt, setFlt] = useState({ period: 'fy:' + currentFyYear(), from: '', to: '', jobId: 'all' })

  const byMonth = [...recs].sort((a, b) => b.month.localeCompare(a.month))
  const shown = filterPayslips(recs, flt)
  const totals = payTotals(shown)
  const years = [...new Set([currentFyYear(), ...recs.map(r => fyStartYear(r.month))])].sort((a, b) => b - a)
  const periodOptions = [...years.map(y => ({ value: 'fy:' + y, label: fyLabel(y) + (y === currentFyYear() ? ' (current)' : '') })), { value: 'all', label: 'All months' }, { value: 'last3', label: 'Last 3 months' }, { value: 'last6', label: 'Last 6 months' }, { value: 'last12', label: 'Last 12 months' }, { value: 'custom', label: 'Custom range' }]
  const current = jobs.find(j => !j.endDate) || [...jobs].sort((a, b) => String(b.joinDate).localeCompare(String(a.joinDate)))[0]
  const last = byMonth.find(r => !current || r.jobId === current.id) || byMonth[0]
  const jobOf = r => jobs.find(j => j.id === r.jobId)
  const who = r => ({ name: detailOf(r, 'name'), id: detailOf(r, 'employeeId'), title: detailOf(r, 'designation'), level: detailOf(r, 'level'), loc: detailOf(r, 'location'), dept: detailOf(r, 'department') })
  const me = last ? who(last) : null
  // newest employer first (latest 'from' date on top); one with no date goes last
  const sortedJobs = [...jobs].sort((a, b) => String(b.joinDate || '').localeCompare(String(a.joinDate || '')) || b.id - a.id)

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg0)' }}>
        <div onClick={() => setActiveTab('profile')} style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} /></div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', flex: 1 }}>Salary</div>
      </div>

      <div style={{ padding: '0 18px' }}>
        {/* 1. the current employee and the last month's salary */}
        <div className="card" style={{ marginBottom: 14 }}>
          {current || last ? (
            <>
              <div className="label-caps">{current ? current.employer : jobOf(last)?.employer}{current?.endDate ? ' (former)' : ''}</div>
              {me && (me.name || me.id) && <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{[me.name, me.id && 'ID ' + me.id].filter(Boolean).join(' · ')}</div>}
              {me && [me.title, me.level && 'Level ' + me.level, me.dept, me.loc].filter(Boolean).length > 0 && <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{[me.title, me.level && 'Level ' + me.level, me.dept, me.loc].filter(Boolean).join(' · ')}</div>}
              {last && (
                <div onClick={() => setSheet({ type: 'view', rec: last })} style={{ marginTop: 10, background: 'var(--mint-bg)', border: '1px solid var(--mint-border)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div className="label-caps">Last salary · {monthLabel(last.month)}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(last.net)}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{last.creditedOn ? 'Credited ' + fmtDate(last.creditedOn) + ' · ' : ''}Gross {formatINR(last.gross)} · Tax {formatINR(last.tds)} · PF {formatINR(last.pf)}</div>
                  </div>
                  <ChevronRight size={18} color="var(--txt3)" />
                </div>
              )}
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Add a payslip document and your employer, employee details and salary appear here.</div>}
        </div>

        {/* 2. employers: add, update, delete; title and level changes come from the payslips */}
        <div className="section-hdr" style={{ marginBottom: 6 }}>
          <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>Employers</div>
        </div>
        {!jobs.length && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14 }}>No employer yet. Attach a payslip and the employer is created from it.</div>}
        {sortedJobs.map(j => {
          const changes = titleHistory(recs.filter(r => r.jobId === j.id))
          return (
            <div key={j.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{j.employer}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{fmtDate(j.joinDate)} → {j.endDate ? fmtDate(j.endDate) : 'present'}</div>
                </div>
                <Pencil size={15} color="var(--txt2)" style={{ cursor: 'pointer' }} onClick={() => setSheet({ type: 'employer', job: j })} />
              </div>
              {changes.map(c => (
                <div key={c.kind + c.month} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--txt2)' }}>{c.kind === 'level' ? 'Level' : 'Title'} · from {monthLabel(c.month)}</span>
                  <b>{c.from} → {c.to}</b>
                </div>
              ))}
            </div>
          )
        })}

        {/* 3. payslips: filter, the records, then the consolidated details with a chart */}
        <div className="section-hdr" style={{ margin: '14px 0 6px' }}>
          <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>Payslips{byMonth.length ? ' · ' + (shown.length === byMonth.length ? byMonth.length : shown.length + ' of ' + byMonth.length) : ''}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setSheet({ type: 'add' })} aria-label="Attach payslip" title="Attach payslip"><Paperclip size={16} style={{ verticalAlign: -3 }} /></span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <Picker value={flt.period} options={periodOptions} onChange={v => setFlt({ ...flt, period: v })} title="Show payslips for" icon={<Calendar size={I} />} />
          {flt.period === 'custom' && (
            <div className="form-grid">
              <TextField icon={<Calendar size={I} />} type="month" value={flt.from} max={flt.to || undefined} onChange={e => setFlt({ ...flt, from: e.target.value })} aria-label="From month" />
              <TextField icon={<Calendar size={I} />} type="month" value={flt.to} min={flt.from || undefined} onChange={e => setFlt({ ...flt, to: e.target.value })} aria-label="To month" />
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          {!byMonth.length && <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--txt2)' }}>No payslips yet. Add a payslip PDF, or a pay register with many months, and every month is listed here.</div>}
          {byMonth.length > 0 && !shown.length && <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--txt2)' }}>No payslips in this period. Choose another financial year above.</div>}
          {shown.map((r, i) => (
            <div key={r.id} onClick={() => setSheet({ type: 'view', rec: r })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{monthLabel(r.month)}{jobs.length > 1 && <span style={{ fontWeight: 400, color: 'var(--txt2)', fontSize: 11 }}> · {jobOf(r)?.employer}</span>}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{r.creditedOn ? 'Credited ' + fmtDate(r.creditedOn) : 'Credit date —'} · Tax {formatINR(r.tds)} · PF {formatINR(r.pf)}</div>
              </div>
              <div style={{ fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(r.net)}</div>
              <ChevronRight size={16} color="var(--txt3)" />
            </div>
          ))}
        </div>

        {shown.length > 0 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="label-caps" style={{ color: 'var(--gold-dim)', marginBottom: 4 }}>Pay collected · {periodOptions.find(p => p.value === flt.period)?.label || ''}</div>
            <Row k="Gross earned" sub={totals.months + ' payslip' + (totals.months === 1 ? '' : 's') + (totals.bonus > 0 ? ' · includes bonus / variable pay ' + formatINR(totals.bonus) : '')} v={formatINR(totals.gross)} />
            <Row k="− Income tax (TDS)" v={formatINR(totals.tds)} color="var(--red-dim)" />
            <Row k="− Provident fund" v={formatINR(totals.pf)} />
            {totals.profTax > 0 && <Row k="− Professional tax" v={formatINR(totals.profTax)} />}
            {totals.other > 0 && <Row k="− Other deductions" v={formatINR(totals.other)} />}
            <div className="divider" />
            <Row k="Take-home" sub={'average ' + formatINR(totals.avgNet) + ' a month'} v={formatINR(totals.net)} bold color="var(--mint-dim)" />
            <div className="divider" style={{ marginBottom: 10 }} />
            <div style={{ width: '100%', height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={payChartData(shown)} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--txt2)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--txt2)' }} axisLine={false} tickLine={false} tickFormatter={v => (v >= 100000 ? (v / 100000).toFixed(v % 100000 ? 1 : 0) + 'L' : v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                  <Tooltip contentStyle={{ background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 10, fontSize: 12, color: 'var(--txt)' }} formatter={(v, name) => [formatINR(v), name]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="net" name="Take-home" stackId="p" fill="var(--mint)" />
                  <Bar dataKey="tds" name="Income tax" stackId="p" fill="var(--red)" />
                  <Bar dataKey="pf" name="PF" stackId="p" fill="var(--gold)" />
                  <Bar dataKey="other" name="Other deductions" stackId="p" fill="var(--txt3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {sheet?.type === 'employer' && <EmployerSheet job={sheet.job} onClose={() => setSheet(null)} />}
      {sheet?.type === 'view' && <PayslipView rec={sheet.rec} job={jobOf(sheet.rec)} onClose={() => setSheet(null)} />}
      {sheet?.type === 'add' && <AddDocumentSheet jobs={jobs} recs={recs} onClose={() => setSheet(null)} />}
    </div>
  )
}
