import { useState } from 'react'
import { ChevronRight, Landmark, TrendingUp, User, ShieldCheck, Smartphone } from 'lucide-react'
import { TopBar } from '../components/UI'
import { useStore } from '../store'
import { isNative } from '../lib/nativeSms'
import { getUserName, setUserName } from '../lib/profile'

function Row({ Icon, title, sub, onClick, right }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default' }}>
      <div className="stat-icon" style={{ width: 34, height: 34, background: 'var(--gold-bg)', color: 'var(--gold-dim)' }}><Icon size={18} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right || (onClick && <ChevronRight size={18} color="var(--txt3)" />)}
    </div>
  )
}

export default function Settings() {
  const { setActiveTab, showNotification } = useStore()
  const [name, setName] = useState(getUserName())

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 100 }}>
      <TopBar title="Settings" />
      <div style={{ padding: '0 16px' }}>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="label-caps" style={{ marginBottom: 6 }}>Your name</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Shown in the Home greeting" />
            <button className="btn-primary" style={{ height: 46 }} onClick={() => { setUserName(name.trim()); showNotification('Name saved') }}>Save</button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          <Row Icon={Landmark} title="Debt & Loans" sub="EMIs, loans and repayments" onClick={() => setActiveTab('debt')} />
          <Row Icon={TrendingUp} title="Wealth" sub="Investments, SIPs and net worth" onClick={() => setActiveTab('wealth')} />
        </div>

        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <Row Icon={Smartphone} title="SMS tracking" sub={isNative() ? 'Reads bank SMS on this phone' : 'Available in the Android app; paste SMS in the browser'} right={<span />} />
          <Row Icon={ShieldCheck} title="Privacy" sub="All data stays on your device" right={<span />} />
          <Row Icon={User} title="FinPing" sub="Personal finance tracker" right={<span />} />
        </div>
      </div>
    </div>
  )
}
