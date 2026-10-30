import { useOptions, categoryIcon } from '../lib/options'
import { Picker } from './Fields'
import { useRewardCategories } from './MccMaintainer'

// The bar shown while transactions are being selected: how many are ticked and where to move them
// Pinned to the bottom of the screen, just above the menu, so it is always in the same place however long the list is
export default function BulkCategoryBar({ count, onPick, bottom = 84 }) {
  const list = useOptions('categories')
  const all = useRewardCategories()
  return (
    <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom, width: 'calc(100% - 32px)', maxWidth: 448, boxSizing: 'border-box', padding: '10px 12px', background: 'var(--bg1)', border: '1px solid var(--border2)', borderRadius: 16, boxShadow: '0 6px 24px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 60 }}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{count} selected</div>
      {count > 0
        ? <div style={{ width: 190 }}><Picker value="" options={all.map(c => ({ value: c, label: `${categoryIcon(list, c)} ${c}` }))} onChange={onPick} placeholder="Move to category…" title="Move to category" /></div>
        : <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Tick transactions to move</div>}
    </div>
  )
}
