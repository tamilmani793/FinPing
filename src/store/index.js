import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // Navigation
  activeTab: 'home',
  // the tabs you came from, so the back button returns to them
  tabStack: [],
  setActiveTab: (tab) => set(s => (tab === s.activeTab ? {} : { activeTab: tab, tabStack: [...s.tabStack, s.activeTab].slice(-20) })),
  goBackTab: () => set(s => (s.tabStack.length ? { activeTab: s.tabStack[s.tabStack.length - 1], tabStack: s.tabStack.slice(0, -1) } : {})),
  // "Leave the app?" question shown by the back button on Home
  // a question waiting for Delete / Cancel (see lib/confirm.js)
  confirmReq: null,
  askConfirm: (opts) => new Promise(resolve => set({ confirmReq: { danger: true, confirmLabel: 'Delete', ...opts, resolve } })),
  answerConfirm: (ok) => set(s => { s.confirmReq?.resolve(!!ok); return { confirmReq: null } }),
  exitPrompt: false,
  setExitPrompt: (v) => set({ exitPrompt: v }),

  // Floating "+" button: bumps a counter the History screen listens to
  composeRequest: 0,
  requestCompose: () => set(s => ({ activeTab: 'history', tabStack: s.activeTab === 'history' ? s.tabStack : [...s.tabStack, s.activeTab].slice(-20), composeRequest: s.composeRequest + 1 })),

  // SMS Sheet
  smsSheetOpen: false,
  parsedSMS: null,
  setSmsSheetOpen: (open) => set({ smsSheetOpen: open }),
  setParsedSMS: (data) => set({ parsedSMS: data }),

  // Filters
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth(),
  setSelectedYear: (y) => set({ selectedYear: y }),
  setSelectedMonth: (m) => set({ selectedMonth: m }),

  // Accounts screen: open a particular card / account (from Home, a transaction detail...)
  openCardId: null,
  openCard: (id) => set(s => ({ activeTab: 'cards', openCardId: id, tabStack: s.activeTab === 'cards' ? s.tabStack : [...s.tabStack, s.activeTab].slice(-20) })),
  clearOpenCard: () => set({ openCardId: null }),

  // Cards
  selectedCardId: null,
  selectedCardTab: 'transactions',
  setSelectedCardId: (id) => set({ selectedCardId: id }),
  setSelectedCardTab: (tab) => set({ selectedCardTab: tab }),

  // Debt
  // Debt screen shows loans or insurance policies
  debtSegment: 'loans',
  setDebtSegment: (seg) => set({ debtSegment: seg }),
  debtFormOpen: false,
  setDebtFormOpen: (open) => set({ debtFormOpen: open }),

  // SMS sync status, shown as a small pill in every header
  smsSync: { state: 'checking', enable: null },

  // Notification
  notification: null,
  showNotification: (msg, type = 'success') => {
    set({ notification: { msg, type } })
    setTimeout(() => set({ notification: null }), 3000)
  },
}))
