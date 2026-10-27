import { Plus } from 'lucide-react'
import { useStore } from './store'
import BottomNav from './components/BottomNav'
import { Notification } from './components/UI'
import { useSmsSync, SmsBanner } from './components/SmsSync'
import Home from './screens/Dashboard'
import Cards from './screens/Cards'
import Expenses from './screens/Expenses'
import Charts from './screens/Charts'
import Settings from './screens/Settings'
import Debt from './screens/Debt'
import Wealth from './screens/Wealth'

const SCREENS = { home: Home, history: Expenses, cards: Cards, charts: Charts, settings: Settings, debt: Debt, wealth: Wealth }
const FAB_TABS = ['home', 'history']

export default function App() {
  const { activeTab, notification, requestCompose } = useStore()
  const sms = useSmsSync()
  const ActiveScreen = SCREENS[activeTab] || Home

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--bg0)', overflow: 'hidden' }}>
      <Notification msg={notification?.msg} type={notification?.type} />
      {activeTab === 'home' && <SmsBanner {...sms} />}
      <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 0 }}>
        <ActiveScreen />
      </div>
      {FAB_TABS.includes(activeTab) && (
        <div className="fab" style={{ position: 'absolute', right: 18, bottom: 84 }} onClick={requestCompose} aria-label="Add expense">
          <Plus size={26} strokeWidth={2.4} />
        </div>
      )}
      <BottomNav />
    </div>
  )
}
