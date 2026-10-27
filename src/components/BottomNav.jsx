import { Home, ArrowLeftRight, CreditCard, PieChart, Settings } from 'lucide-react'
import { useStore } from '../store'

const TABS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'history', label: 'History', Icon: ArrowLeftRight },
  { id: 'cards', label: 'Cards', Icon: CreditCard },
  { id: 'charts', label: 'Charts', Icon: PieChart },
  { id: 'settings', label: 'Settings', Icon: Settings },
]

export default function BottomNav() {
  const { activeTab, setActiveTab } = useStore()
  // Debt / Wealth are opened from Home & Settings; keep Home highlighted for them.
  const current = activeTab === 'debt' || activeTab === 'wealth' ? 'home' : activeTab
  return (
    <nav style={{
      position: 'absolute', left: 14, right: 14,
      bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      height: 60, background: 'var(--bg1)', borderRadius: 30,
      border: '1px solid var(--border)', boxShadow: '0 6px 22px rgba(90,60,20,0.16)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 6px',
      zIndex: 30,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = current === id
        return (
          <div key={id} onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              cursor: 'pointer', height: 48, minWidth: 58, padding: '0 8px', borderRadius: 24,
              background: active ? 'var(--pink-bg)' : 'transparent', transition: 'background 0.15s',
            }}>
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} color={active ? 'var(--pink)' : 'var(--txt2)'} />
            <div style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? 'var(--pink)' : 'var(--txt2)' }}>{label}</div>
          </div>
        )
      })}
    </nav>
  )
}
