import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { ChevronLeft, Plus, Pencil, Briefcase, IndianRupee, Calendar, Hash, FileText, RefreshCw, Paperclip, Trash2, File as FileIcon, Image as ImageIcon } from 'lucide-react'
import { db } from '../db/schema'
import { useStore } from '../store'
import { askConfirm } from '../lib/confirm'
import { DOC_KINDS, MAX_DOC_BYTES, fmtSize, guessMonth, addDocs, deleteDoc, listDocs, openDoc } from '../lib/salaryDocs'
import { ordinal } from '../lib/cycle'
import { BtnPrimary, formatINR } from './UI'
import { Field, FormHeading, TextField, Picker } from './Fields'
import {
  REVISION_KINDS, fySummary, fyLabel, monthLabel, takeHome, isLate, saveJob, deleteJob, saveRevision, saveRecord, deleteRecord, relinkAll,
} from '../lib/salary'

const I = 17
const money = (form, set, k) => ({ type: 'number', inputMode: 'decimal', value: form[k] ?? '', onChange: e => set({ ...form, [k]: e.target.value }), placeholder: '0' })
const fmtDate = d => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const thisMonth = () => format(new Date(), 'yyyy-MM')

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

function JobSheet({ job, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({ id: job?.id, employer: job?.employer || '', joinDate: job?.joinDate || '', endDate: job?.endDate || '', ctc: job?.ctc ? String(job.ctc) : '', salaryDay: job?.salaryDay ? String(job.salaryDay) : '', notes: job?.notes || '' })
  const set = v => setF(v)
  const save = async () => {
    if (!f.employer.trim()) { showNotification('Enter the employer name', 'error'); return }
    await saveJob(f); showNotification('Employer saved', 'success'); onClose()
  }
  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this employer?', message: 'Its payslips and CTC history are deleted too. Bank transactions are not changed.' }))) return
    await deleteJob(job.id); onClose()
  }
  return (
    <Sheet title={job ? 'Edit employer' : 'Add employer'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Employer"><TextField icon={<Briefcase size={I} />} value={f.employer} onChange={e => set({ ...f, employer: e.target.value })} placeholder="Company name" /></Field>
        <div className="form-grid">
          <Field label="Joined on"><TextField icon={<Calendar size={I} />} type="date" value={f.joinDate} onChange={e => set({ ...f, joinDate: e.target.value })} /></Field>
          <Field label="Left on" hint="Leave empty if current"><TextField icon={<Calendar size={I} />} type="date" value={f.endDate} onChange={e => set({ ...f, endDate: e.target.value })} /></Field>
          <Field label="CTC per year"><TextField icon={<IndianRupee size={I} />} {...money(f, set, 'ctc')} /></Field>
          <Field label="Usual pay day" hint="Day of the month"><TextField icon={<Hash size={I} />} type="number" inputMode="numeric" value={f.salaryDay} onChange={e => set({ ...f, salaryDay: e.target.value })} placeholder="e.g. 1" /></Field>
        </div>
        <Field label="Notes"><TextField icon={<FileText size={I} />} value={f.notes} onChange={e => set({ ...f, notes: e.target.value })} placeholder="Optional" /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
          <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
        </div>
        {job && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Delete employer</button>}
      </div>
    </Sheet>
  )
}

function RevisionSheet({ job, rev, onClose }) {
  const { showNotification } = useStore()
  const [f, setF] = useState({ id: rev?.id, jobId: job.id, date: rev?.date || format(new Date(), 'yyyy-MM-dd'), kind: rev?.kind || 'hike', ctc: rev?.ctc ? String(rev.ctc) : '', note: rev?.note || '' })
  const save = async () => {
    if (!f.date) { showNotification('Pick the date', 'error'); return }
    await saveRevision(f); showNotification('Saved', 'success'); onClose()
  }
  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this entry?' }))) return
    await db.salaryRevisions.delete(rev.id); onClose()
  }
  return (
    <Sheet title={rev ? 'Edit CTC change' : `CTC change · ${job.employer}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid">
          <Field label="Date"><TextField icon={<Calendar size={I} />} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Type"><Picker value={f.kind} options={REVISION_KINDS} onChange={v => setF({ ...f, kind: v })} title="Type" /></Field>
        </div>
        <Field label={f.kind === 'bonus' ? 'Bonus amount' : 'New CTC per year'}><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'ctc')} /></Field>
        <Field label="Note"><TextField icon={<FileText size={I} />} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Optional" /></Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
          <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
        </div>
        {rev && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Delete</button>}
      </div>
    </Sheet>
  )
}

function RecordSheet({ rec, jobs, onClose }) {
  const { showNotification } = useStore()
  const first = jobs.find(j => !j.endDate) || jobs[0]
  const [f, setF] = useState({
    id: rec?.id, jobId: rec?.jobId ?? first?.id ?? null, month: rec?.month || thisMonth(), gross: rec?.gross || '', basic: rec?.basic || '', hra: rec?.hra || '', allowances: rec?.allowances || '', bonus: rec?.bonus || '',
    pf: rec?.pf || '', profTax: rec?.profTax || '', tds: rec?.tds || '', otherDed: rec?.otherDed || '', net: rec?.net || '', notes: rec?.notes || '',
  })
  const calc = Number(f.gross) > 0 ? takeHome(f) : 0
  const off = Number(f.net) > 0 && calc > 0 && Math.abs(Number(f.net) - calc) > 1
  const save = async () => {
    if (f.jobId == null) { showNotification('Add an employer first', 'error'); return }
    if (!(Number(f.net) > 0 || Number(f.gross) > 0)) { showNotification('Enter the net salary (or the gross)', 'error'); return }
    try { await saveRecord(f); showNotification('Payslip saved', 'success'); onClose() } catch (e) { showNotification(e.message, 'error') }
  }
  const remove = async () => {
    if (!(await askConfirm({ title: 'Delete this payslip?', message: 'The bank transaction is not changed.' }))) return
    await deleteRecord(rec.id); onClose()
  }
  return (
    <Sheet title={rec ? `Payslip · ${monthLabel(rec.month)}` : 'Add payslip'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-grid">
          <Field label="Month"><TextField icon={<Calendar size={I} />} type="month" value={f.month} onChange={e => setF({ ...f, month: e.target.value })} /></Field>
          {jobs.length > 1 && <Field label="Employer"><Picker value={String(f.jobId)} options={jobs.map(j => ({ value: String(j.id), label: j.employer }))} onChange={v => setF({ ...f, jobId: Number(v) })} title="Employer" /></Field>}
        </div>
        <FormHeading sub="From the payslip">Earnings</FormHeading>
        <div className="form-grid">
          <Field label="Gross"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'gross')} /></Field>
          <Field label="Basic"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'basic')} /></Field>
          <Field label="HRA"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'hra')} /></Field>
          <Field label="Allowances"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'allowances')} /></Field>
          <Field label="Bonus / incentive"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'bonus')} /></Field>
        </div>
        <FormHeading>Deductions</FormHeading>
        <div className="form-grid">
          <Field label="PF (yours)"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'pf')} /></Field>
          <Field label="Professional tax"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'profTax')} /></Field>
          <Field label="Income tax (TDS)"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'tds')} /></Field>
          <Field label="Other deductions"><TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'otherDed')} /></Field>
        </div>
        <Field label="Net salary credited" hint={calc > 0 ? `Payslip works out to ${formatINR(calc, 2)}${off ? ' — differs from what you entered' : ''}` : 'What reached your bank'}>
          <TextField icon={<IndianRupee size={I} />} {...money(f, setF, 'net')} />
        </Field>
        <Field label="Notes"><TextField icon={<FileText size={I} />} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Optional" /></Field>
        {f.month && <RecordFiles month={f.month} jobId={f.jobId} jobs={jobs} />}
        <div style={{ fontSize: 11, color: 'var(--txt2)' }}>On saving, the app looks for this salary in your bank account's credits and ticks it off.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
          <BtnPrimary onClick={save} style={{ flex: 1 }}>Save</BtnPrimary>
        </div>
        {rec && <button className="btn-ghost" style={{ color: 'var(--red-dim)', borderColor: 'var(--red-border)', height: 46 }} onClick={remove}>Delete payslip</button>}
      </div>
    </Sheet>
  )
}

// the files saved for a payslip month, an employer or everything, with open and delete
function DocRows({ docs, jobs, onChanged }) {
  const { showNotification } = useStore()
  if (!docs.length) return null
  return docs.map((d, i) => (
    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
      <div onClick={async () => { try { await openDoc(d.id) } catch (e) { showNotification(e.message, 'error') } }} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--gold-bg)', flexShrink: 0 }}>{String(d.mime).startsWith('image/') ? <ImageIcon size={16} /> : <FileIcon size={16} />}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{DOC_KINDS.find(k => k.value === d.kind)?.label || d.kind}{d.month ? ` · ${monthLabel(d.month)}` : ''}{jobs.find(j => j.id === d.jobId) ? ` · ${jobs.find(j => j.id === d.jobId).employer}` : ''} · {fmtSize(d.size)}</div>
        </div>
      </div>
      <Trash2 size={16} color="var(--red-dim)" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={async () => {
        if (!(await askConfirm({ title: 'Delete this file?', message: d.name + ' is removed from this phone. The original is not touched.' }))) return
        await deleteDoc(d.id); onChanged?.()
      }} />
    </div>
  ))
}

function UploadSheet({ jobs, preset = {}, onClose }) {
  const { showNotification } = useStore()
  const [files, setFiles] = useState([])
  const [f, setF] = useState({ kind: preset.kind || 'payslip', jobId: preset.jobId ?? (jobs.find(j => !j.endDate) || jobs[0])?.id ?? null, month: preset.month || '', note: '' })
  const [busy, setBusy] = useState(false)
  const pick = e => {
    const list = [...(e.target.files || [])]; e.target.value = ''
    setFiles(list)
    const guess = list.length === 1 ? guessMonth(list[0].name) : ''
    if (guess && !f.month) setF(x => ({ ...x, month: guess }))
  }
  const save = async () => {
    if (!files.length) { showNotification('Choose a file first', 'error'); return }
    setBusy(true)
    try {
      const r = await addDocs(files, f)
      if (r.skipped.length) showNotification(r.skipped.map(s => s.name + ': ' + s.why).join('; '), r.added ? undefined : 'error')
      if (r.added) { showNotification(r.added + ' file' + (r.added === 1 ? '' : 's') + ' saved on this phone', 'success'); onClose() }
    } catch (e) { showNotification(e.message || 'Could not save', 'error') }
    setBusy(false)
  }
  return (
    <Sheet title="Upload document" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, cursor: 'pointer' }}>
          <Paperclip size={16} /> {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen` : 'Choose PDF, image or Word file'}
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.txt,application/pdf,image/*" style={{ display: 'none' }} onChange={pick} />
        </label>
        {files.map(x => <div key={x.name + x.size} style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{x.name} · {fmtSize(x.size)}{x.size > MAX_DOC_BYTES ? ' · too large' : ''}</div>)}
        <div className="form-grid">
          <Field label="Type"><Picker value={f.kind} options={DOC_KINDS} onChange={v => setF({ ...f, kind: v })} title="Document type" /></Field>
          {jobs.length > 0 && <Field label="Employer"><Picker value={f.jobId == null ? '' : String(f.jobId)} options={jobs.map(j => ({ value: String(j.id), label: j.employer }))} onChange={v => setF({ ...f, jobId: v === '' ? null : Number(v) })} title="Employer" clearLabel="Not linked" /></Field>}
          {f.kind === 'payslip' && <Field label="Payslip month" hint="Worked out from the file name when possible"><TextField icon={<Calendar size={I} />} type="month" value={f.month} onChange={e => setF({ ...f, month: e.target.value })} /></Field>}
        </div>
        <Field label="Note"><TextField icon={<FileText size={I} />} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Optional" /></Field>
        <div style={{ fontSize: 11, color: 'var(--txt2)' }}>The file is stored only on this phone (and in your backup file). Up to {fmtSize(MAX_DOC_BYTES)} each.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={onClose}>Cancel</button>
          <BtnPrimary onClick={save} style={{ flex: 1 }}>{busy ? 'Saving…' : 'Save'}</BtnPrimary>
        </div>
      </div>
    </Sheet>
  )
}

function RecordFiles({ month, jobId, jobs }) {
  const docs = useLiveQuery(async () => (await listDocs()).filter(d => d.kind === 'payslip' && d.month === month && (jobId == null || d.jobId == null || d.jobId === jobId)), [month, jobId]) || []
  const [up, setUp] = useState(false)
  return (
    <div>
      <FormHeading>Payslip file</FormHeading>
      <DocRows docs={docs} jobs={jobs} />
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setUp(true)}>＋ Attach the payslip PDF or photo</div>
      {up && <UploadSheet jobs={jobs} preset={{ kind: 'payslip', jobId, month }} onClose={() => setUp(false)} />}
    </div>
  )
}

function BankBadge({ rec, job }) {
  if (rec.bankState === 'matched') return <span className="badge badge-mint" style={{ fontSize: 9 }}>✓ In bank</span>
  if (rec.bankState === 'short') return <span className="badge badge-amber" style={{ fontSize: 9 }}>⚠ Short {formatINR(rec.bankShort)}</span>
  if (isLate(rec, job)) return <span className="badge badge-red" style={{ fontSize: 9 }}>⏳ Not credited</span>
  return <span className="badge badge-grey" style={{ fontSize: 9 }}>Not in bank yet</span>
}

export default function SalaryPage() {
  const { setActiveTab, showNotification } = useStore()
  const jobs = useLiveQuery(() => db.salaryJobs.toArray()) || []
  const revs = useLiveQuery(() => db.salaryRevisions.toArray()) || []
  const recs = useLiveQuery(() => db.salaryRecords.toArray()) || []
  const docs = useLiveQuery(() => listDocs()) || []
  const [sheet, setSheet] = useState(null)
  const docCount = m => docs.filter(d => d.kind === 'payslip' && d.month === m).length
  const byMonth = [...recs].sort((a, b) => b.month.localeCompare(a.month))
  const current = jobs.find(j => !j.endDate) || jobs[0]
  const last = byMonth[0]
  const jobOf = r => jobs.find(j => j.id === r.jobId)
  const fy = fySummary(recs)

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 110 }}>
      <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg0)' }}>
        <div onClick={() => setActiveTab('profile')} style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} /></div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Salary</div>
      </div>

      <div style={{ padding: '0 18px' }}>
        {/* at a glance */}
        <div className="card" style={{ marginBottom: 14 }}>
          {current ? (
            <>
              <div className="label-caps">{current.employer}{current.endDate ? ' (former)' : ''}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{current.ctc ? formatINR(current.ctc) : '—'}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)' }}> CTC / yr</span></div>
                  {current.ctc > 0 && <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{formatINR(Math.round(current.ctc / 12))} a month before deductions</div>}
                </div>
                {last && <div style={{ textAlign: 'right' }}><div className="label-caps">Last take-home · {monthLabel(last.month)}</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(last.net)}</div><BankBadge rec={last} job={jobOf(last)} /></div>}
              </div>
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--txt2)' }}>Add your employer and payslips to keep every salary detail in one place.</div>}
        </div>

        {/* employers and CTC */}
        <div className="section-hdr" style={{ marginBottom: 6 }}>
          <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>Employers and CTC</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setSheet({ type: 'job' })}><Plus size={13} style={{ verticalAlign: -2 }} /> Add</span>
        </div>
        {!jobs.length && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14 }}>No employer yet. Tap Add to start.</div>}
        {jobs.map(j => {
          const list = revs.filter(r => r.jobId === j.id).sort((a, b) => String(b.date).localeCompare(String(a.date)))
          return (
            <div key={j.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{j.employer}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{fmtDate(j.joinDate)} → {j.endDate ? fmtDate(j.endDate) : 'present'}{j.salaryDay ? ` · paid on the ${ordinal(j.salaryDay)}` : ''}</div>
                </div>
                <Pencil size={15} color="var(--txt2)" style={{ cursor: 'pointer' }} onClick={() => setSheet({ type: 'job', job: j })} />
              </div>
              {list.map(r => (
                <div key={r.id} onClick={() => setSheet({ type: 'rev', job: j, rev: r })} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12, cursor: 'pointer' }}>
                  <span style={{ color: 'var(--txt2)' }}>{fmtDate(r.date)} · {REVISION_KINDS.find(k => k.value === r.kind)?.label || r.kind}{r.note ? ` · ${r.note}` : ''}</span>
                  <b>{r.ctc ? formatINR(r.ctc) : ''}</b>
                </div>
              ))}
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setSheet({ type: 'rev', job: j })}>＋ Hike, bonus or CTC change</div>
            </div>
          )
        })}

        {/* payslips */}
        <div className="section-hdr" style={{ margin: '14px 0 6px' }}>
          <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>Payslips</div>
          <span style={{ display: 'flex', gap: 14, fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }}>
            {recs.length > 0 && <span onClick={async () => { const r = await relinkAll(); showNotification(`${r.matched} in bank · ${r.short} short · ${r.none} not found`, 'success') }}><RefreshCw size={12} style={{ verticalAlign: -1 }} /> Check bank</span>}
            <span onClick={() => (jobs.length ? setSheet({ type: 'rec' }) : showNotification('Add an employer first', 'error'))}><Plus size={13} style={{ verticalAlign: -2 }} /> Add</span>
          </span>
        </div>
        <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          {!byMonth.length && <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--txt2)' }}>No payslips yet.</div>}
          {byMonth.map((r, i) => (
            <div key={r.id} onClick={() => setSheet({ type: 'rec', rec: r })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel(r.month)}{docCount(r.month) > 0 && <Paperclip size={12} color="var(--txt2)" style={{ marginLeft: 6, verticalAlign: -1 }} />}</div>
                <div style={{ fontSize: 11, color: 'var(--txt2)' }}>{r.gross ? `Gross ${formatINR(r.gross)} · ` : ''}{r.tds ? `TDS ${formatINR(r.tds)} · ` : ''}{r.pf ? `PF ${formatINR(r.pf)}` : ''}{r.creditedOn ? ` · credited ${fmtDate(r.creditedOn)}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(r.net)}</div>
                <BankBadge rec={r} job={jobOf(r)} />
              </div>
            </div>
          ))}
        </div>

        {/* documents */}
        <div className="section-hdr" style={{ margin: '14px 0 6px' }}>
          <div className="label-caps" style={{ color: 'var(--gold-dim)' }}>Documents{docs.length ? ` · ${docs.length} · ${fmtSize(docs.reduce((a, d) => a + (d.size || 0), 0))}` : ''}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-dim)', cursor: 'pointer' }} onClick={() => setSheet({ type: 'doc' })}><Plus size={13} style={{ verticalAlign: -2 }} /> Upload</span>
        </div>
        <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          {!docs.length && <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--txt2)' }}>Keep your offer letter, appointment letter, hike letters, payslips and Form 16 here. They stay on this phone, are included in your backup, and are never uploaded.</div>}
          <DocRows docs={[...docs].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))} jobs={jobs} />
        </div>

        {/* yearly tax and PF */}
        {fy.length > 0 && (
          <>
            <div className="label-caps" style={{ color: 'var(--gold-dim)', margin: '0 0 6px' }}>Tax and PF by financial year</div>
            {fy.map(s => (
              <div key={s.year} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: 14 }}>{fyLabel(s.year)}</b><span style={{ fontSize: 11, color: 'var(--txt2)' }}>{s.months} payslip{s.months === 1 ? '' : 's'}</span></div>
                {[['Gross earned', s.gross], s.bonus ? ['of which bonus / incentive', s.bonus] : null, ['Income tax (TDS)', s.tds], ['PF (yours)', s.pf], ['Professional tax', s.profTax], s.otherDed ? ['Other deductions', s.otherDed] : null, ['Take-home', s.net]].filter(Boolean).map(([k, v], i, arr) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12.5, borderTop: i === 0 ? '1px solid var(--border)' : 'none', marginTop: i === 0 ? 8 : 0, fontWeight: i === arr.length - 1 ? 800 : 500 }}>
                    <span style={{ color: 'var(--txt2)' }}>{k}</span><span>{formatINR(v)}</span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {sheet?.type === 'job' && <JobSheet job={sheet.job} onClose={() => setSheet(null)} />}
      {sheet?.type === 'rev' && <RevisionSheet job={sheet.job} rev={sheet.rev} onClose={() => setSheet(null)} />}
      {sheet?.type === 'rec' && <RecordSheet rec={sheet.rec} jobs={jobs} onClose={() => setSheet(null)} />}
      {sheet?.type === 'doc' && <UploadSheet jobs={jobs} onClose={() => setSheet(null)} />}
    </div>
  )
}
