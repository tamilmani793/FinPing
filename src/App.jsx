import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { relinkTransactions } from './lib/relink'
import { removeDuplicateTransactions } from './lib/dedupeCleanup'
import { recategoriseWalletLoads, recategoriseAtm, recategoriseGuesses } from './lib/recategorise'
import { migrateSimpleCategories } from './lib/categoryMigrate'
import { tagAllCards } from './lib/rewardTagging'
import { autoApplyPresets, syncChannelRules, syncSettlementRules } from './lib/rulesPack'
import { postDueEmis } from './lib/emiEngine'
import { useStore } from './store'
import { initBackNav, exitApp } from './lib/backNav'
import BottomNav from './components/BottomNav'
import { Notification } from './components/UI'
import { useSmsSync } from './components/SmsSync'
import Home from './screens/Dashboard'
import Cards from './screens/Cards'
import Expenses from './screens/Expenses'
import Charts from './screens/Charts'
import Profile from './screens/Profile'
import OptionsPage from './components/OptionsManager'
import SalaryPage from './components/SalaryPage'
import Debt from './screens/Debt'
import Wealth from './screens/Wealth'

const SCREENS = { home: Home, history: Expenses, cards: Cards, charts: Charts, profile: Profile, settings: Profile, options: OptionsPage, salary: SalaryPage, debt: Debt, wealth: Wealth }
const FAB_TABS = ['home', 'history']

export default function App() {
  const { activeTab, notification, requestCompose, showNotification } = useStore()
  const sms = useSmsSync()
  const { exitPrompt, setExitPrompt, confirmReq, answerConfirm } = useStore()
  useEffect(() => initBackNav(), [])
  // The header pill and the Home permission card read the sync state from the store.
  useEffect(() => { useStore.setState({ smsSync: { state: sms.state, enable: sms.enable } }) }, [sms.state])

  // Post every EMI that has fallen due (no SMS involved) when the app opens and whenever it comes back to the front.
  useEffect(() => {
    const run = () => postDueEmis().then(n => { if (n > 0) showNotification(`${n} EMI${n === 1 ? '' : 's'} posted to your loans`, 'success') }).catch(() => {})
    run()
    const onShow = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  // Tie transactions to the cards / accounts they belong to. The first run also creates the cards and
  // accounts that older transactions point to; every later launch only links to the ones that exist
  // (so something you deleted does not come back).
  useEffect(() => {
    const first = !localStorage.getItem('finping_relink_v1')
    relinkTransactions({ create: first })
      .then(async n => {
        if (first) localStorage.setItem('finping_relink_v1', '1')
        if (n > 0) showNotification(`${n} transactions linked to your cards and accounts`, 'success')
        // Cards in your accounts that match a bundled card get its reward rules (not again if you removed them yourself)
        const given = await autoApplyPresets()
        if (given.length) showNotification(`Reward rules added for ${given.join(', ')}`, 'success')
        // Once after this update: the category list was simplified, so saved transactions, rules and mappings take the new names
        if (!localStorage.getItem('finping_simplecats_v1')) {
          await migrateSimpleCategories()
          localStorage.setItem('finping_simplecats_v1', '1')
        }
        // Once after this update: wallet loads that were filed under another category
        if (!localStorage.getItem('finping_walletload_v1')) {
          const w = await recategoriseWalletLoads()
          localStorage.setItem('finping_walletload_v1', '1')
          if (w > 0) showNotification(`${w} wallet load${w === 1 ? '' : 's'} moved to the Wallet Load category`, 'success')
        }
        // Once after this update: SBI Cashback's online rate needs to know which spends are online
        if (!localStorage.getItem('finping_channel_v2')) {
          if (await syncChannelRules() > 0) tagAllCards().catch(() => {})
          localStorage.setItem('finping_channel_v2', '1')
        }
        // Once: SBI Cashback per statement cycle, HSBC Live+ credit lag; the reward tags follow
        if (!localStorage.getItem('finping_settlement_v2')) {
          if (await syncSettlementRules() > 0) tagAllCards().catch(() => {})
          localStorage.setItem('finping_settlement_v2', '1')
        }
        // Once after this update: categories guessed from loose words in the SMS are guessed again with the corrected rules
        if (!localStorage.getItem('finping_catguess_v1')) {
          const g = await recategoriseGuesses()
          localStorage.setItem('finping_catguess_v1', '1')
          if (g > 0) showNotification(`${g} transaction${g === 1 ? '' : 's'} moved to a better category`, 'success')
        }
        // Once after this update: cash withdrawals (names with ATM) get the ATM Withdrawal category
        if (!localStorage.getItem('finping_atm_v1')) {
          const a = await recategoriseAtm()
          localStorage.setItem('finping_atm_v1', '1')
          if (a > 0) showNotification(`${a} ATM withdrawal${a === 1 ? '' : 's'} moved to the ATM Withdrawal category`, 'success')
        }
        // Once after this update: expected rewards were tagged without the percentage; work them out again so every spend shows it
        if (!localStorage.getItem('finping_rewardtag_v2')) { await tagAllCards(); localStorage.setItem('finping_rewardtag_v2', '1') }
        // Once after this update: clear out entries that were never payments or were saved twice.
        if (!localStorage.getItem('finping_cleanup_v2')) {
          const r = await removeDuplicateTransactions()
          localStorage.setItem('finping_cleanup_v2', '1')
          const total = r.removed + r.merged + r.converted
          if (total > 0) showNotification(`Tidied ${total} entries: ${r.removed} not payments, ${r.merged} duplicates, ${r.converted} card payments fixed`, 'success')
        }
      })
      .catch(() => {})
  }, [])
  const ActiveScreen = SCREENS[activeTab] || Home

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--bg0)', overflow: 'hidden' }}>
      <Notification msg={notification?.msg} type={notification?.type} />
      <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 0 }}>
        <ActiveScreen />
      </div>
      {FAB_TABS.includes(activeTab) && (
        <div className="fab" style={{ position: 'absolute', right: 18, bottom: 84 }} onClick={requestCompose} aria-label="Add expense">
          <Plus size={26} strokeWidth={2.4} />
        </div>
      )}
      <BottomNav />
      {confirmReq && (
        <div className="overlay" style={{ zIndex: 90, alignItems: 'center', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)' }} onClick={() => answerConfirm(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 340, maxHeight: '100%', display: 'flex', flexDirection: 'column', padding: 22, borderRadius: 26 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', flexShrink: 0 }}>{confirmReq.title}</div>
            {confirmReq.message && <div style={{ fontSize: 13, color: 'var(--txt2)', margin: '6px 0 0', lineHeight: 1.5, whiteSpace: 'pre-line', overflowY: 'auto', minHeight: 0, overflowWrap: 'anywhere' }}>{confirmReq.message}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
              <button className="btn-ghost" style={{ flex: 1, height: 48, fontSize: 14 }} onClick={() => answerConfirm(false)}>{confirmReq.cancelLabel || 'Cancel'}</button>
              <button className="btn-primary" style={{ flex: 1, height: 48, ...(confirmReq.danger ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red)', boxShadow: 'none' } : {}) }} onClick={() => answerConfirm(true)}>{confirmReq.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
      {exitPrompt && (
        <div className="overlay" style={{ zIndex: 80, alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setExitPrompt(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 340, padding: 22, borderRadius: 26 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Leave FinPing?</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', margin: '6px 0 18px' }}>Your data stays safe on this phone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1, height: 48, fontSize: 14 }} onClick={() => setExitPrompt(false)}>Stay</button>
              <button className="btn-primary" style={{ flex: 1, height: 48 }} onClick={exitApp}>Exit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
