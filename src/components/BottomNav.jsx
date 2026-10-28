import { Home, ArrowLeftRight, Wallet, Landmark, User } from 'lucide-react'
import { useProfile } from '../lib/profile'
import { useStore } from '../store'

const TABS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'history', label: 'History', Icon: ArrowLeftRight },
  { id: 'cards', label: 'Accounts', Icon: Wallet },
  { id: 'debt', label: 'Debt', Icon: Landmark },
  { id: 'profile', label: 'Profile', Icon: User },
]

export default function BottomNav() {
  const { activeTab, setActiveTab } = useStore()
  const { photo } = useProfile()
  // Wealth and Charts are opened from Home; keep Home highlighted for them.
  const current = activeTab === 'wealth' || activeTab === 'charts' ? 'home' : activeTab
  return (
    <nav style={{
      position: 'absolute', left: 14, right: 14,
      bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      height: 60, background: 'var(--bg1)', borderRadius: 30,
      border: '1px solid var(--border)', boxShadow: 'var(--nav-shadow)',
      display: 'flex', alignItems: 'center', padding: '0 4px',
      zIndex: 30,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = current === id
        return (
          <div key={id} onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              cursor: 'pointer', height: 48, flex: 1, minWidth: 0, margin: '0 1px', padding: '0 2px', borderRadius: 24,
              background: active ? 'var(--pink-bg)' : 'transparent', transition: 'background 0.15s',
            }}>
            {id === 'profile' && photo
              ? <img src={photo} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: active ? '2px solid var(--pink)' : '1.5px solid var(--border2)' }} />
              : <Icon size={20} strokeWidth={active ? 2.4 : 1.8} color={active ? 'var(--pink)' : 'var(--txt2)'} />}
            <div style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? 'var(--pink)' : 'var(--txt2)' }}>{label}</div>
          </div>
        )
      })}
    </nav>
  )
}
