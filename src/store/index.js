import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // Navigation
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Floating "+" button: bumps a counter the History screen listens to
  composeRequest: 0,
  requestCompose: () => set(s => ({ activeTab: 'history', composeRequest: s.composeRequest + 1 })),

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
  openCard: (id) => set({ activeTab: 'cards', openCardId: id }),
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
