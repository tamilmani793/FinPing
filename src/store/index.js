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

  // Cards
  selectedCardId: null,
  selectedCardTab: 'transactions',
  setSelectedCardId: (id) => set({ selectedCardId: id }),
  setSelectedCardTab: (tab) => set({ selectedCardTab: tab }),

  // Debt
  debtFormOpen: false,
  setDebtFormOpen: (open) => set({ debtFormOpen: open }),

  // Notification
  notification: null,
  showNotification: (msg, type = 'success') => {
    set({ notification: { msg, type } })
    setTimeout(() => set({ notification: null }), 3000)
  },
}))
