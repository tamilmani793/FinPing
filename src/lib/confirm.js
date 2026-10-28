import { useStore } from '../store'

// Ask before something is deleted or replaced. Resolves true on the confirm button, false on Cancel / outside tap / back.
//   await askConfirm({ title: 'Delete this policy?', message: 'This cannot be undone.', confirmLabel: 'Delete' })
export const askConfirm = opts => useStore.getState().askConfirm(opts)
