import { useStore } from './store'
import BottomNav from './components/BottomNav'
import { Notification } from './components/UI'
import Dashboard from './screens/Dashboard'
import Cards from './screens/Cards'
import Expenses from './screens/Expenses'
import Debt from './screens/Debt'
import Wealth from './screens/Wealth'

export default function App() {
  const { activeTab, notification } = useStore()

  const screens = {
    dashboard: Dashboard,
    cards: Cards,
    expenses: Expenses,
    debt: Debt,
    wealth: Wealth,
  }

  const ActiveScreen = screens[activeTab] || Dashboard

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--bg0)', overflow: 'hidden' }}>
      <Notification msg={notification?.msg} type={notification?.type} />
      <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 64 }}>
        <ActiveScreen />
      </div>
      <BottomNav />
    </div>
  )
}
