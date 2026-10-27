import { format } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { useStore } from '../store'
import { SyncPill } from './SmsSync'

export function TopBar({ title, sub, right }) {
  const { activeTab, setActiveTab, smsSync } = useStore()
  const isSub = activeTab === 'wealth' || activeTab === 'charts'
  return (
    <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg0)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isSub ? (
          <div onClick={() => setActiveTab('home')} style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={18} />
          </div>
        ) : (
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="FinPing" style={{ width: 30, height: 30, borderRadius: 9 }} />
        )}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{title || sub || 'FinPing'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {right || <><SyncPill state={smsSync.state} /><Avatar /></>}
      </div>
    </div>
  )
}

export function SMSPill() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--mint-bg)', border: '1px solid var(--mint-border)', borderRadius: 9999, padding: '3px 8px', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: 'var(--mint-dim)', fontWeight: 600, letterSpacing: '0.06em' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--mint)' }} />
      LOCAL ONLY
    </div>
  )
}

export function Avatar({ initials = 'TS' }) {
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--gold-bg)', border: '1.5px solid var(--gold-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--gold-dim)' }}>{initials}</div>
  )
}

export function Card({ children, style, onClick }) {
  return (
    <div className="card" style={style} onClick={onClick}>{children}</div>
  )
}

export function SectionHdr({ title, right }) {
  return (
    <div className="section-hdr">
      <div className="section-title">{title}</div>
      {right}
    </div>
  )
}

export function Badge({ children, variant = 'grey', style }) {
  return <span className={`badge badge-${variant}`} style={style}>{children}</span>
}

export function ProgressBar({ pct, variant = 'mint', style }) {
  return (
    <div className="progress-track" style={style}>
      <div className={`progress-fill fill-${variant}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

export function Divider() {
  return <div className="divider" />
}

export function LabelCaps({ children, style }) {
  return <div className="label-caps" style={style}>{children}</div>
}

export function MonoLg({ children, style }) {
  return <div className="mono-lg" style={style}>{children}</div>
}

export function MonoMd({ children, style }) {
  return <div className="mono-md" style={style}>{children}</div>
}

export function TxnRow({ icon, merchant, meta, amount, isCredit, badge, tags, onClick }) {
  return (
    <div className="txn-row" onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <div className="txn-icon" style={{ background: isCredit ? 'var(--mint-bg)' : 'var(--bg2)' }}>
        {icon || '💳'}
      </div>
      <div className="txn-mid">
        <div className="txn-merchant">
          {merchant}
          {tags?.map(t => <span key={t} className="badge badge-grey" style={{ marginLeft: 4, fontSize: 9 }}>{t}</span>)}
        </div>
        <div className="txn-meta">{meta}</div>
      </div>
      <div className="txn-amt">
        <div className={isCredit ? 'amt-credit' : 'amt-debit'}>
          {isCredit ? '+' : '−'}₹{Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </div>
        {badge}
      </div>
    </div>
  )
}

export function Chip({ label, active, onClick }) {
  return (
    <div className={`chip${active ? ' active' : ''}`} onClick={onClick}>{label}</div>
  )
}

export function BtnPrimary({ children, onClick, style, fullWidth }) {
  return (
    <button className="btn-primary" onClick={onClick} style={{ width: fullWidth ? '100%' : 'auto', ...style }}>{children}</button>
  )
}

export function BtnSecondary({ children, onClick, style }) {
  return (
    <button className="btn-secondary" onClick={onClick} style={style}>{children}</button>
  )
}

export function SmsParsedCard({ parsed, onConfirm, onDiscard }) {
  if (!parsed) return null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--indigo-border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div className="label-caps" style={{ color: 'var(--indigo-dim)', marginBottom: 6 }}>Parsed SMS Preview</div>
      <div className="sms-raw" style={{ marginBottom: 8 }}>{parsed.rawText}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {parsed.merchant && parsed.merchant !== 'Unknown' && <span className="parsed-chip">Merchant: {parsed.merchant}</span>}
        {parsed.amount && <span className="parsed-chip">₹{parsed.amount.toLocaleString('en-IN')}</span>}
        {parsed.cardLast4 && <span className="parsed-chip">Card ••{parsed.cardLast4}</span>}
        {parsed.category && <span className="parsed-chip">{parsed.category}</span>}
        {parsed.paymentMode && <span className="parsed-chip">{parsed.paymentMode}</span>}
        <span className="parsed-chip" style={{ color: 'var(--amber-dim)', borderColor: 'var(--amber-border)' }}>{Math.round((parsed.confidence || 0.8) * 100)}% confidence</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={onConfirm}>✓ Confirm &amp; Save</button>
        <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={onDiscard}>Discard</button>
      </div>
    </div>
  )
}

export function Notification({ msg, type }) {
  if (!msg) return null
  const color = type === 'success' ? 'var(--mint)' : type === 'error' ? 'var(--red)' : 'var(--amber)'
  return (
    <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg1)', border: `1px solid ${color}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, color, zIndex: 99, boxShadow: '0 8px 24px rgba(90,60,20,0.2)', whiteSpace: 'nowrap' }}>
      {msg}
    </div>
  )
}

export const MERCHANT_ICONS = {
  swiggy: '🍕', zomato: '🍜', uber: '🚗', ola: '🚕', amazon: '📦', flipkart: '🛍',
  myntra: '👗', netflix: '🎬', spotify: '🎵', hpcl: '⛽', irctc: '🚆', cleartrip: '✈️',
  bigbasket: '🥦', blinkit: '🟡', zepto: '⚡', dmart: '🛒', jio: '📡', airtel: '📶',
  lic: '🛡', apollo: '💊', default: '💳',
}

export function getMerchantIcon(merchant = '') {
  const lower = merchant.toLowerCase()
  for (const [key, icon] of Object.entries(MERCHANT_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return MERCHANT_ICONS.default
}

export function formatINR(amount, decimals = 0) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function formatDate(date) {
  return format(new Date(date), 'd MMM')
}
