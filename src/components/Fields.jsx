import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

// Form building blocks shared by every form, so all of them look and behave alike.

// A label above a control, with an optional hint underneath.
export function Field({ label, hint, children, span, style }) {
  return (
    <div className="field" style={{ gridColumn: span ? '1 / -1' : undefined, ...style }}>
      {label && <div className="field-label">{label}</div>}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

// A heading that groups related fields ("Credit limit", "Fees"…), with an optional line of explanation
export function FormHeading({ children, sub }) {
  return (
    <>
      <div className="form-heading">{children}</div>
      {sub && <div className="form-sub">{sub}</div>}
    </>
  )
}

// Two or three options side by side as a pill toggle
export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented">
      {options.map(o => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o
        return <div key={opt.value} className={`seg${String(value) === String(opt.value) ? ' on' : ''}`} onClick={() => onChange(opt.value)}>{opt.label}</div>
      })}
    </div>
  )
}

// A text / number / date box with an optional icon on the left and a short unit on the right
export function TextField({ icon, suffix, className = '', ...rest }) {
  return (
    <div className="input-wrap">
      {icon && <span className="input-lead">{icon}</span>}
      <input className={`input${icon ? ' has-lead' : ''} ${className}`} {...rest} />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  )
}

const norm = o => (typeof o === 'string' ? { value: o, label: o } : o)

// A dropdown that opens a bottom sheet with a search box and a tidy list (better than the phone's plain select).
//   options     strings, or { value, label, sub?, icon?, group? }
//   icon        a small icon shown at the left of the closed field
//   allowCustom lets the user type something that is not in the list
export function Picker({ value, options, onChange, placeholder = 'Select…', title, icon, allowCustom = false, disabled, clearLabel }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const opts = useMemo(() => options.map(norm), [options])
  const current = opts.find(o => String(o.value) === String(value))
  const shown = current || (value ? { value, label: String(value) } : null)
  const needle = q.trim().toLowerCase()
  const list = needle ? opts.filter(o => (o.label + ' ' + (o.sub || '') + ' ' + (o.group || '')).toLowerCase().includes(needle)) : opts
  const exact = opts.some(o => o.label.toLowerCase() === needle)
  const close = () => { setOpen(false); setQ('') }
  const pick = v => { onChange(v); close() }

  const groups = []
  for (const o of list) {
    const g = o.group || ''
    let grp = groups.find(x => x.g === g)
    if (!grp) groups.push(grp = { g, items: [] })
    grp.items.push(o)
  }

  return (
    <>
      <div className={`picker${disabled ? ' disabled' : ''}${shown ? '' : ' empty'}`} onClick={() => !disabled && setOpen(true)}>
        {icon && <span className="picker-lead">{icon}</span>}
        <span className="picker-text">{shown ? `${shown.icon ? shown.icon + ' ' : ''}${shown.label}` : placeholder}</span>
        <ChevronDown size={18} className="picker-chevron" />
      </div>
      {open && (
        <div className="overlay" style={{ zIndex: 70 }} onClick={close}>
          <div className="sheet picker-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="picker-head">
              <b>{title || placeholder}</b>
              <div className="picker-close" onClick={close}><X size={16} /></div>
            </div>
            {(opts.length > 6 || allowCustom) && (
              <div className="picker-search">
                <Search size={16} color="var(--txt3)" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={allowCustom ? 'Search, or type your own' : 'Search'}
                  onKeyDown={e => { if (e.key === 'Enter' && allowCustom && needle && !exact) pick(q.trim()) }} />
              </div>
            )}
            <div className="picker-list">
              {clearLabel && !needle && (
                <div className={`opt-row${!value ? ' on' : ''}`} onClick={() => pick('')}><span className="opt-radio" /><span className="opt-label">{clearLabel}</span></div>
              )}
              {allowCustom && needle && !exact && (
                <div className="opt-row" onClick={() => pick(q.trim())}><span className="opt-radio" /><span className="opt-label">Use “{q.trim()}”<span className="opt-sub"> · your own</span></span></div>
              )}
              {groups.map(({ g, items }) => (
                <div key={g}>
                  {g && <div className="opt-group">{g}</div>}
                  {items.map(o => (
                    <div key={o.value} className={`opt-row${String(o.value) === String(value) ? ' on' : ''}`} onClick={() => pick(o.value)}>
                      <span className="opt-radio" />
                      {o.icon && <span className="opt-icon">{o.icon}</span>}
                      <span className="opt-label">{o.label}{o.sub && <span className="opt-sub"> · {o.sub}</span>}</span>
                    </div>
                  ))}
                </div>
              ))}
              {!list.length && !(allowCustom && needle) && <div style={{ padding: '22px 4px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt2)' }}>Nothing matches “{q}”</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
