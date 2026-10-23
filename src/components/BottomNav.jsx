import { useStore } from '../store'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'cards', label: 'Cards', icon: '💳' },
  { id: 'expenses', label: 'Expenses', icon: '🧾' },
  { id: 'debt', label: 'Debt', icon: '🏦' },
  { id: 'wealth', label: 'Wealth', icon: '📈' },
]

export default function BottomNav() {
  const { activeTab, setActiveTab } = useStore()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      maxWidth: 480, margin: '0 auto',
      height: 64, background: 'var(--bg1)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      zIndex: 30,
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id
        return (
          <div key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '8px 4px', transition: 'all 0.15s' }}>
            <div style={{ fontSize: 20, filter: active ? 'none' : 'grayscale(80%) opacity(0.5)', transition: 'all 0.15s', transform: active ? 'scale(1.1)' : 'scale(1)' }}>
              {tab.icon}
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: active ? 'var(--mint)' : 'var(--txt3)', letterSpacing: '0.02em', transition: 'color 0.15s' }}>
              {tab.label}
            </div>
            {active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--mint)', marginTop: -2 }} />}
          </div>
        )
      })}
    </nav>
  )
}
