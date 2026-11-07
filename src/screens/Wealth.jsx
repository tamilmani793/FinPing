import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, Divider, LabelCaps, MonoLg, BtnPrimary, BtnSecondary, formatINR, formatDate } from '../components/UI'
import { ChevronRight, IndianRupee, TrendingUp, StickyNote } from 'lucide-react'
import { Field, TextField, Picker, Segmented } from '../components/Fields'
import { searchSchemes, fetchNav } from '../lib/mfNav'
import { GOLD_CITIES, fetchGoldRates, purityRate, rateOnDate, splitPrice, coinPrice } from '../lib/goldRate'
import { useStore } from '../store'
import { useBackHandler } from '../lib/backNav'
import { askConfirm } from '../lib/confirm'
import { format } from 'date-fns'
import { ppfYear, ppfHistory, ppfRateFor, ppfCurrent } from '../lib/ppf'
import { buildPf, loadPfInputs } from '../lib/pf'

const TYPE_ICONS = { EPF: '🏦', MutualFund: '📈', Stock: '📊', PPF: '🏛', NPS: '🏦', Gold: '🪙', FD: '🔐', Other: '💰' }
const TYPE_COLORS = { EPF: '#0EA5E9', MutualFund: 'var(--mint)', Stock: 'var(--indigo)', PPF: 'var(--amber)', NPS: '#8B5CF6', Gold: '#D97706', FD: '#06B6D4', Other: 'var(--txt3)' }

export default function Wealth() {
  const [addOpen, setAddOpen] = useState(false)
  useBackHandler(addOpen, () => setAddOpen(false))
  const { showNotification, setActiveTab } = useStore()
  const pfData = useLiveQuery(async () => buildPf(await loadPfInputs()), [], null) // the EPF balance for the allocation
  const [openId, setOpenId] = useState(null)
  const [assetType, setAssetType] = useState(null)
  const [ledgerOpen, setLedgerOpen] = useState(false) // physical gold: every coin bought, like a ledger
  const [editing, setEditing] = useState(false) // details are read-only until you tap Edit
  const [edEntry, setEdEntry] = useState(null) // the entry being changed
  const [depOpen, setDepOpen] = useState(false) // the quick Add deposit form, without going into Edit
  useEffect(() => { setDepOpen(false); setEdEntry(null) }, [openId])
  const [dep, setDep] = useState({ amount: '', units: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [curVal, setCurVal] = useState('')
  useBackHandler(openId != null || assetType != null || ledgerOpen, () => { if (openId != null) setOpenId(null); else if (ledgerOpen) setLedgerOpen(false); else setAssetType(null) })

  const EMPTY_FORM = { name: '', type: 'MutualFund', investedAmount: '', currentValue: '', notes: '', last4: '' }
  const EMPTY_GOLD = { physical: true, date: format(new Date(), 'yyyy-MM-dd'), mode: 'split', city: localStorage.getItem('finping_gold_city') || 'chennai', purity: '24', grams: '', rate: '', gstPct: '3', making: '', mrp: '', cashback: '' }
  const [form, setForm] = useState(EMPTY_FORM)
  const [gold, setGold] = useState(EMPTY_GOLD)
  const [liveRates, setLiveRates] = useState(null) // goodreturns rates for the city picked in the form
  const [rateErr, setRateErr] = useState('')
  const physicalForm = form.type === 'Gold' && gold.physical

  // mutual fund with a live NAV: pick the scheme by name, enter units, and the value follows the NAV
  const EMPTY_MF = { track: true, q: '', results: [], code: null, schemeName: '', units: '', nav: null, navDate: '', busy: false, err: '' }
  const [mf, setMf] = useState(EMPTY_MF)
  const mfForm = form.type === 'MutualFund' && mf.track
  useEffect(() => {
    if (!addOpen || !mfForm || mf.code || mf.q.trim().length < 3) { if (mf.results.length && mf.q.trim().length < 3) setMf(m => ({ ...m, results: [], err: '' })); return }
    let live = true
    setMf(m => ({ ...m, busy: true, err: '' }))
    const t = setTimeout(() => {
      searchSchemes(mf.q).then(r => { if (live) setMf(m => ({ ...m, results: r, busy: false, err: r.length ? '' : 'No scheme found. Try fewer words.' })) })
        .catch(() => { if (live) setMf(m => ({ ...m, busy: false, err: "Couldn't reach the NAV service. Turn off live NAV to type the value yourself." })) })
    }, 400)
    return () => { live = false; clearTimeout(t) }
  }, [addOpen, mfForm, mf.q, mf.code])
  const pickScheme = async s => {
    setMf(m => ({ ...m, code: s.code, schemeName: s.name, results: [], busy: true, err: '' }))
    try { const r = await fetchNav(s.code); setMf(m => ({ ...m, nav: r.nav, navDate: r.date, busy: false })) }
    catch { setMf(m => ({ ...m, busy: false, err: "Couldn't fetch the NAV for this scheme." })) }
  }
  useEffect(() => { if (!addOpen) setMf(EMPTY_MF) }, [addOpen])

  // the live rate for the chosen city, whenever the physical gold form is showing
  useEffect(() => {
    if (!addOpen || !physicalForm) return
    let live = true
    setRateErr(''); setLiveRates(null)
    fetchGoldRates(gold.city).then(r => { if (live) setLiveRates(r) }).catch(() => { if (live) setRateErr("Couldn't fetch today's rate. Type the rate yourself.") })
    return () => { live = false }
  }, [addOpen, physicalForm, gold.city])
  // pre-fill the purchase rate with today's rate while it is still untouched
  const [rateTouched, setRateTouched] = useState(false)
  const dayRate = liveRates ? rateOnDate(liveRates, gold.date, gold.purity) : 0 // the rate on the buying date (last 10 days only)
  useEffect(() => { if (!rateTouched && liveRates) setGold(g => ({ ...g, rate: dayRate ? String(dayRate) : '' })) }, [liveRates, gold.purity, gold.date, rateTouched, dayRate])
  useEffect(() => { if (!addOpen) setRateTouched(false) }, [addOpen])

  // a PPF account's current value is worked out (deposits plus the interest credited so far), not typed in
  const rawInvestments = useLiveQuery(() => db.investments.toArray())
  const allInvestments = rawInvestments && rawInvestments.map(i => (i.type === 'PPF' ? { ...i, currentValue: ppfCurrent(i) } : i))
  const investments = allInvestments && allInvestments.filter(i => !i.excluded) // coins turned into jewellery are not counted
  const jewellery = (allInvestments || []).filter(i => i.excluded)

  // tracked mutual funds are worth units × the latest NAV
  const mfKey = (rawInvestments || []).filter(i => i.mfCode && !i.excluded).map(i => `${i.id}:${i.mfCode}:${i.units}`).join('|')
  useEffect(() => {
    const funds = (rawInvestments || []).filter(i => i.mfCode && !i.excluded)
    if (!funds.length) return
    let live = true
    ;(async () => {
      for (const f of funds) {
        try {
          const r = await fetchNav(f.mfCode)
          if (!live) return
          const value = Math.round(f.units * r.nav * 100) / 100
          if (value > 0 && (value !== f.currentValue || f.nav !== r.nav || f.navDate !== r.date)) await db.investments.update(f.id, { currentValue: value, nav: r.nav, navDate: r.date })
        } catch { /* offline: keep the last value */ }
      }
    })()
    return () => { live = false }
  }, [mfKey])

  // physical gold is worth grams × today's rate in its city: refresh each city once when the screen opens
  const goldKey = (rawInvestments || []).filter(i => i.physicalGold && !i.excluded).map(i => `${i.id}:${i.city}:${i.purity}:${i.grams}`).join('|')
  useEffect(() => {
    const coins = (rawInvestments || []).filter(i => i.physicalGold && !i.excluded)
    if (!coins.length) return
    let live = true
    ;(async () => {
      for (const city of [...new Set(coins.map(c => c.city))]) {
        try {
          const r = await fetchGoldRates(city)
          if (!live) return
          for (const c of coins.filter(x => x.city === city)) {
            const value = Math.round(c.grams * purityRate(r, c.purity) * 100) / 100
            if (value > 0 && (value !== c.currentValue || c.rateAt !== r.at)) await db.investments.update(c.id, { currentValue: value, liveRate: purityRate(r, c.purity), rateAt: r.at })
          }
        } catch { /* offline: keep the last value */ }
      }
    })()
    return () => { live = false }
  }, [goldKey])

  const gainColor = g => (g >= 0 ? 'var(--mint)' : 'var(--red)')
  const sgn = g => (g >= 0 ? '+' : '−')
  // "+₹1,200 · +4.3%" for an invested / current pair; nothing when the invested amount is not known (EPF)
  const gainText = (inv, cur) => (inv > 0 ? `${sgn(cur - inv)}${formatINR(Math.abs(cur - inv))} · ${sgn(cur - inv)}${Math.abs((cur - inv) / inv * 100).toFixed(1)}%` : '')

  // Asset allocation, grouped: Retirement (PPF, EPF, NPS), Market (equity, mutual funds) and Safe (gold, deposits, other).
  // The main assets always show; the rest only when you hold one. EPF is worked out on the Provident fund page, which it opens.
  const GROUPS = ['Retirement', 'Market', 'Safe']
  const ASSETS = [
    { type: 'PPF', group: 'Retirement', label: 'PPF', sub: 'Tax-free, government backed', always: true },
    { type: 'EPF', group: 'Retirement', label: 'Provident fund (EPF)', sub: 'From payslips and passbook · opens the PF page', always: true, link: 'pf' },
    { type: 'NPS', group: 'Retirement', label: 'NPS', sub: 'Retirement, tax-shielded' },
    { type: 'Stock', group: 'Market', label: 'Equity (direct stocks)', sub: 'Direct exchange', always: true },
    { type: 'MutualFund', group: 'Market', label: 'Mutual funds', sub: 'SIPs and funds', always: true },
    { type: 'Gold', group: 'Safe', label: 'Gold', sub: 'Sovereign / digital gold', always: true },
    { type: 'FD', group: 'Safe', label: 'Fixed deposits', sub: 'Fixed returns' },
    { type: 'Other', group: 'Safe', label: 'Other', sub: 'Everything else' },
  ]
  const allocData = ASSETS.map(a => {
    if (a.type === 'EPF') return { ...a, count: pfData ? 1 : 0, value: pfData?.epfBalance || 0, invested: pfData && !pfData.empty ? (pfData.split?.eeContrib || 0) + (pfData.split?.erContrib || 0) : 0 }
    const list = (investments || []).filter(i => i.type === a.type)
    return { ...a, count: list.length, value: list.reduce((s, i) => s + (i.currentValue || 0), 0), invested: list.reduce((s, i) => s + (i.investedAmount || 0), 0) }
  }).filter(a => a.always || a.count > 0)
  // the provident fund is not counted as an investment unless you untick the box (remembered on this phone)
  const [excludePf, setExcludePf] = useState(() => localStorage.getItem('finping_exclude_pf') !== '0')
  const toggleExcludePf = v => { setExcludePf(v); try { localStorage.setItem('finping_exclude_pf', v ? '1' : '0') } catch { /* ignore */ } }
  const counted = a => !(excludePf && a.type === 'EPF')
  const totalAlloc = allocData.filter(counted).reduce((s, a) => s + a.value, 0)

  // tapping an asset: one account goes straight to its details, several show the list first.
  // Gold's accounts are "Physical gold" (all coins together, opened as a ledger) and each digital / SGB holding.
  const openAsset = a => {
    if (a.link) { setActiveTab(a.link); return }
    const list = (investments || []).filter(i => i.type === a.type)
    const accts = a.type === 'Gold' ? [...(list.some(i => i.physicalGold) ? ['physical'] : []), ...list.filter(i => !i.physicalGold)] : list
    if (accts.length === 1) { if (accts[0] === 'physical') setLedgerOpen(true); else { setOpenId(accts[0].id); setCurVal(''); setEditing(false) } return }
    setAssetType(a.type)
  }
  const openInv = (allInvestments || []).find(i => i.id === openId)
  // each deposit is logged as an entry; invested is the sum of entries and the current value rises with each deposit
  const addDeposit = async () => {
    const amount = parseFloat(dep.amount)
    if (!(amount > 0)) { showNotification('Enter the amount', 'error'); return }
    const addUnits = parseFloat(dep.units)
    if (openInv.mfCode && !(addUnits > 0)) { showNotification('Enter the units you got', 'error'); return }
    const entries = [...(openInv.entries || (openInv.investedAmount ? [{ date: openInv.startDate || new Date(), amount: openInv.investedAmount, opening: true }] : [])), { date: new Date(dep.date), amount }]
    await db.investments.update(openInv.id, { entries, investedAmount: entries.reduce((a, e) => a + e.amount, 0), ...(openInv.mfCode ? { units: Math.round(((openInv.units || 0) + addUnits) * 1e4) / 1e4, currentValue: Math.round(((openInv.units || 0) + addUnits) * (openInv.nav || 0) * 100) / 100 } : { currentValue: (openInv.currentValue || 0) + amount }) })
    setDep({ ...dep, amount: '', units: '' })
    setDepOpen(false)
    showNotification('Deposit added', 'success')
  }
  const removeEntry = async idx => {
    const entries = (openInv.entries || []).filter((_, i) => i !== idx)
    const gone = openInv.entries[idx].amount
    await db.investments.update(openInv.id, { entries, investedAmount: entries.reduce((a, e) => a + e.amount, 0), currentValue: Math.max(0, (openInv.currentValue || 0) - gone) })
  }
  // change a logged entry's date or amount; invested follows the entries and the current value moves by the same difference
  const saveEntry = async () => {
    const amount = parseFloat(edEntry.amount)
    if (!(amount > 0)) { showNotification('Enter the amount', 'error'); return }
    const old = openInv.entries[edEntry.idx]
    const entries = openInv.entries.map((e, i) => (i === edEntry.idx ? { ...e, amount, date: new Date(edEntry.date) } : e))
    await db.investments.update(openInv.id, { entries, investedAmount: entries.reduce((a, e) => a + e.amount, 0), currentValue: Math.max(0, (openInv.currentValue || 0) + amount - old.amount) })
    setEdEntry(null)
    showNotification('Entry updated', 'success')
  }
  const saveCurrent = async () => {
    const v = parseFloat(curVal)
    if (!(v >= 0) || curVal === '') { showNotification('Enter the current value', 'error'); return }
    await db.investments.update(openInv.id, { currentValue: v })
    setCurVal('')
    showNotification('Current value updated', 'success')
  }
  // a coin melted into jewellery stays on record but leaves the investment totals; it can be brought back
  const toggleJewellery = async () => {
    if (!openInv.excluded && !(await askConfirm({ title: 'Converted to jewellery?', message: `${openInv.name} will no longer count in your investments, allocation or goals. You can include it again any time.`, confirmLabel: 'Exclude' }))) return
    await db.investments.update(openInv.id, openInv.excluded ? { excluded: false, excludedAt: null } : { excluded: true, excludedAt: new Date() })
    showNotification(openInv.excluded ? 'Counted as an investment again' : 'Excluded from investments', 'success')
  }
  const deleteInv = async () => {
    if (!(await askConfirm({ title: 'Delete this investment?', message: `${openInv.name} and its entries will be removed.`, confirmLabel: 'Delete' }))) return
    await db.investments.delete(openInv.id)
    setOpenId(null)
  }

  // price paid for the coin, split into its parts (or MRP less cashback)
  const goldCalc = gold.mode === 'split'
    ? splitPrice({ grams: gold.grams, rate: gold.rate, making: gold.making, gstPct: gold.gstPct })
    : coinPrice({ mrp: gold.mrp, cashback: gold.cashback })
  const goldPaid = gold.mode === 'split' ? goldCalc.total : goldCalc.net
  const goldNow = liveRates ? Math.round(parseFloat(gold.grams || 0) * purityRate(liveRates, gold.purity) * 100) / 100 : 0

  const addPhysicalGold = async () => {
    const grams = parseFloat(gold.grams)
    if (!(grams > 0)) { showNotification('Enter the weight in grams', 'error'); return }
    if (!(goldPaid > 0)) { showNotification(gold.mode === 'split' ? 'Enter the rate per gram' : 'Enter the MRP', 'error'); return }
    const city = GOLD_CITIES.find(c => c.value === gold.city)?.label || gold.city
    try { localStorage.setItem('finping_gold_city', gold.city) } catch { /* ignore */ }
    if (!gold.date) { showNotification('Pick the buying date', 'error'); return }
    await db.investments.add({
      name: form.name || `${grams} g ${gold.purity}K gold coin`, buyDate: gold.date, rateOnBuyDate: dayRate || null, type: 'Gold', physicalGold: true,
      goldMode: gold.mode, grams, purity: gold.purity, city: gold.city, cityLabel: city,
      buyRate: gold.mode === 'split' ? parseFloat(gold.rate) : null, gstPct: gold.mode === 'split' ? parseFloat(gold.gstPct) || 0 : null,
      goldValue: gold.mode === 'split' ? goldCalc.gold : null, making: gold.mode === 'split' ? goldCalc.making : null, gst: gold.mode === 'split' ? goldCalc.gst : null,
      mrp: gold.mode === 'coin' ? goldCalc.mrp : null, cashback: gold.mode === 'coin' ? goldCalc.cashback : null,
      investedAmount: goldPaid, currentValue: goldNow || goldPaid, liveRate: liveRates ? purityRate(liveRates, gold.purity) : null, rateAt: liveRates?.at || null,
      units: null, nav: null, startDate: new Date(gold.date + 'T00:00:00'), entries: [{ date: new Date(gold.date + 'T00:00:00'), amount: goldPaid, opening: true }], source: 'manual', notes: form.notes, last4: null,
    })
    setForm(EMPTY_FORM); setGold(EMPTY_GOLD)
    setAddOpen(false)
    showNotification('Gold added!', 'success')
  }

  const addTrackedFund = async () => {
    const units = parseFloat(mf.units), invested = parseFloat(form.investedAmount)
    if (!mf.code) { showNotification('Search and pick the scheme', 'error'); return }
    if (!(units > 0) || !(invested > 0)) { showNotification('Units and invested amount required', 'error'); return }
    if (!mf.nav) { showNotification('NAV not loaded yet', 'error'); return }
    await db.investments.add({
      name: form.name || mf.schemeName, type: 'MutualFund', mfCode: mf.code, units, nav: mf.nav, navDate: mf.navDate,
      investedAmount: invested, currentValue: Math.round(units * mf.nav * 100) / 100,
      startDate: new Date(), entries: [{ date: new Date(), amount: invested, opening: true }], source: 'manual', notes: form.notes, last4: null,
    })
    setForm(EMPTY_FORM); setMf(EMPTY_MF)
    setAddOpen(false)
    showNotification('Mutual fund added!', 'success')
  }

  const handleAddManual = async () => {
    if (physicalForm) return addPhysicalGold()
    if (mfForm) return addTrackedFund()
    if (!form.name || !form.investedAmount) { showNotification('Name and amount required', 'error'); return }
    await db.investments.add({
      name: form.name, type: form.type,
      investedAmount: parseFloat(form.investedAmount), currentValue: parseFloat(form.currentValue || form.investedAmount),
      units: null, nav: null, startDate: new Date(), source: 'manual', notes: form.notes, last4: form.last4.replace(/\D/g, '').slice(-4) || null,
    })
    setForm({ name: '', type: 'MutualFund', investedAmount: '', currentValue: '', notes: '', last4: '' })
    setAddOpen(false)
    showNotification('Investment added!', 'success')
  }

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar sub="Wealth" />

      <div style={{ padding: '10px 16px 0' }}>
        {/* what you have invested, by asset */}
        {(() => {
          const slices = allocData.filter(counted).filter(x => x.invested > 0)
          const total = slices.reduce((t, x) => t + x.invested, 0)
          return (
            <Card style={{ marginBottom: 10 }}>
              <LabelCaps style={{ marginBottom: 6 }}>Invested by asset</LabelCaps>
              {total === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--txt2)', padding: '8px 0' }}>Nothing invested yet. Add an investment to see it here.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 130, height: 130, position: 'relative', flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={slices} dataKey="invested" nameKey="label" innerRadius={40} outerRadius={62} paddingAngle={slices.length > 1 ? 2 : 0} stroke="none">
                          {slices.map(x => <Cell key={x.type} fill={TYPE_COLORS[x.type]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [formatINR(v), n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: 9, color: 'var(--txt2)' }}>Invested</div>
                      <div className="mono-sm" style={{ fontSize: 12 }}>{formatINR(total)}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {slices.map(x => (
                      <div key={x.type} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[x.type], flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.label}</span>
                        <span className="mono-sm" style={{ fontSize: 11.5 }}>{formatINR(x.invested)}</span>
                        <span style={{ width: 30, textAlign: 'right', fontSize: 10.5, color: 'var(--txt2)' }}>{Math.round(x.invested / total * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )
        })()}

        <div onClick={() => toggleExcludePf(!excludePf)} role="switch" aria-checked={excludePf} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px', padding: '2px 2px', cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' }}>
          <span>Exclude PF from investments</span>
          <span style={{ width: 32, height: 18, borderRadius: 9999, background: excludePf ? 'var(--gold)' : 'var(--border)', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: excludePf ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
          </span>
        </div>

        {/* Asset Allocation */}
        <SectionHdr title="Asset Allocation" right={<Badge variant="grey">{allocData.filter(counted).length} {allocData.filter(counted).length === 1 ? 'Asset' : 'Assets'}</Badge>} />
        <Card style={{ marginBottom: 10 }}>
          {/* Stacked bar */}
          {allocData.length > 0 && (
            <div style={{ height: 8, borderRadius: 9999, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
              {allocData.filter(counted).map(a => <div key={a.type} style={{ width: `${totalAlloc > 0 ? a.value / totalAlloc * 100 : 0}%`, background: TYPE_COLORS[a.type], height: '100%' }} />)}
            </div>
          )}
          {GROUPS.map(g => {
            const rows = allocData.filter(a => a.group === g && counted(a))
            if (!rows.length) return null
            return (
              <div key={g} style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0 2px' }}>
                  <span className="label-caps" style={{ fontSize: 10 }}>{g}</span>
                </div>
                {rows.map((a, i) => {
                  const pct = totalAlloc > 0 && counted(a) ? Math.round(a.value / totalAlloc * 100) : 0
                  return (
                    <div key={a.type}>
                      <div onClick={() => openAsset(a)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLORS[a.type], flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{TYPE_ICONS[a.type]} {a.label}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{a.link ? a.sub : `${a.count} ${a.count === 1 ? 'account' : 'accounts'} · ${a.sub}`}</div>
                          {a.invested > 0 && <div style={{ fontSize: 10, color: 'var(--txt2)', marginTop: 1 }}>Invested {formatINR(a.invested)}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono-sm">{formatINR(a.value)}</div>
                          {a.invested > 0 && <div style={{ fontSize: 10, color: gainColor(a.value - a.invested) }}>{gainText(a.invested, a.value)}</div>}
                          <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{pct}% of total</div>
                        </div>
                        <ChevronRight size={16} color="var(--txt3)" />
                      </div>
                      {i < rows.length - 1 && <Divider />}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </Card>

        {/* one asset: its accounts and investment details */}
        {assetType && (() => {
          const meta = ASSETS.find(a => a.type === assetType)
          const list = (investments || []).filter(i => i.type === assetType)
          const inv = list.reduce((s, i) => s + (i.investedAmount || 0), 0), cur = list.reduce((s, i) => s + (i.currentValue || 0), 0)
          return (
            <div className="overlay" onClick={() => setAssetType(null)}>
              <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="sheet-handle" />
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{TYPE_ICONS[assetType]} {meta?.label || assetType}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, margin: '12px 0' }}>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Invested</LabelCaps><div className="mono-sm">{formatINR(inv)}</div></div>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Current</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(cur)}</div></div>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Gain</LabelCaps><div className="mono-sm" style={{ color: cur >= inv ? 'var(--mint)' : 'var(--red)' }}>{cur >= inv ? '+' : '−'}{formatINR(Math.abs(cur - inv))}{inv > 0 ? <span style={{ display: 'block', fontSize: 10 }}>{((cur - inv) / inv * 100).toFixed(1)}%</span> : null}</div></div>
                </div>
                {list.length === 0 && (
                  <div style={{ padding: '14px 0', fontSize: 12.5, color: 'var(--txt2)' }}>
                    Nothing added under {meta?.label || assetType} yet.
                    <button className="btn-primary" style={{ display: 'block', width: '100%', height: 44, marginTop: 10 }} onClick={() => { setAssetType(null); setForm({ ...form, type: assetType }); setAddOpen(true) }}>+ Add {meta?.label || assetType}</button>
                  </div>
                )}
                {assetType === 'Gold' && list.some(i => i.physicalGold) && (() => {
                  const coins = list.filter(i => i.physicalGold)
                  const inv = coins.reduce((t, c) => t + (c.investedAmount || 0), 0), cur = coins.reduce((t, c) => t + (c.currentValue || 0), 0)
                  return (
                    <div onClick={() => setLedgerOpen(true)} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>🪙 Physical gold</div>
                          <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{coins.length} {coins.length === 1 ? 'coin' : 'coins'} · {Math.round(coins.reduce((t, c) => t + (c.grams || 0), 0) * 1000) / 1000} g</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(cur)}</div>
                          <div style={{ fontSize: 11, color: gainColor(cur - inv) }}>{gainText(inv, cur)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 3 }}>Invested {formatINR(inv)}</div>
                    </div>
                  )
                })()}
                {(assetType === 'Gold' ? list.filter(i => !i.physicalGold) : list).map(i => {
                  const gain = (i.currentValue || 0) - (i.investedAmount || 0)
                  const pf = i.type === 'PPF' ? ppfYear({ entries: i.entries || [], current: i.currentValue || 0, rate: ppfRateFor(i, ppfHistory(i).slice(-1)[0].fy) }) : null
                  return (
                    <div key={i.id} onClick={() => { setOpenId(i.id); setCurVal(''); setEditing(false) }} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{i.name}{i.last4 ? ` ••${i.last4}` : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{i.startDate ? `Since ${formatDate(i.startDate)}` : i.type}{i.source === 'sms' ? ' · from SMS' : ''}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(i.currentValue)}</div>
                          <div style={{ fontSize: 11, color: gain >= 0 ? 'var(--mint-dim)' : 'var(--red)' }}>{gain >= 0 ? '+' : '−'}{formatINR(Math.abs(gain))}{i.investedAmount > 0 ? ` · ${(gain / i.investedAmount * 100).toFixed(1)}%` : ''}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 3 }}>Invested {formatINR(i.investedAmount)}{i.units ? ` · ${i.units} units` : ''}{i.nav ? ` · NAV ${i.nav}` : ''}</div>
                      {pf && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 2 }}>FY {pf.fy}: deposited {formatINR(pf.deposited)}, {formatINR(pf.remaining)} left of ₹1.5 lakh · interest {formatINR(pf.projected)} expected</div>}
                    </div>
                  )
                })}
                {assetType === 'Gold' && jewellery.length > 0 && (
                  <>
                    <LabelCaps style={{ margin: '14px 0 2px' }}>Converted to jewellery (not counted)</LabelCaps>
                    {jewellery.map(i => (
                      <div key={i.id} onClick={() => { setOpenId(i.id); setCurVal(''); setEditing(false) }} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', cursor: 'pointer', display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--txt2)' }}>
                        <span style={{ flex: 1 }}>💍 {i.name}</span><span>{formatINR(i.investedAmount)} paid</span>
                      </div>
                    ))}
                  </>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--txt2)', margin: '8px 0' }}>Tap an account to see its details and entries.</div>
                <button className="btn-ghost" style={{ width: '100%', height: 42 }} onClick={() => setAssetType(null)}>Close</button>
              </div>
            </div>
          )
        })()}


        {/* physical gold: a ledger of every coin bought */}
        {ledgerOpen && (() => {
          const all = (allInvestments || []).filter(i => i.physicalGold).sort((a, b) => new Date(a.buyDate || a.startDate) - new Date(b.buyDate || b.startDate))
          const coins = all.filter(c => !c.excluded), jew = all.filter(c => c.excluded)
          const inv = coins.reduce((t, c) => t + (c.investedAmount || 0), 0), cur = coins.reduce((t, c) => t + (c.currentValue || 0), 0)
          const grams = Math.round(coins.reduce((t, c) => t + (c.grams || 0), 0) * 1000) / 1000
          const pctOf = c => (c.investedAmount > 0 ? ((c.currentValue - c.investedAmount) / c.investedAmount * 100) : 0)
          const row = (c, dim) => (
            <div key={c.id} onClick={() => { setOpenId(c.id); setCurVal(''); setEditing(false) }} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', cursor: 'pointer', opacity: dim ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(c.buyDate || c.startDate)} · {c.grams} g {c.purity}K</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 1 }}>{c.name} · {c.cityLabel}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(c.currentValue)}</div>
                  <div style={{ fontSize: 11, color: gainColor(c.currentValue - c.investedAmount) }}>{sgn(c.currentValue - c.investedAmount)}{Math.abs(pctOf(c)).toFixed(1)}%</div>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 4, lineHeight: 1.5 }}>
                {c.goldMode === 'coin'
                  ? `MRP ${formatINR(c.mrp)} − cashback ${formatINR(c.cashback)} = ${formatINR(c.investedAmount)}`
                  : `Gold ${formatINR(c.goldValue)}${c.buyRate ? ` (₹${c.buyRate.toLocaleString('en-IN')}/g)` : ''} + making ${formatINR(c.making)} + GST ${formatINR(c.gst)} = ${formatINR(c.investedAmount)}`}
                {c.rateOnBuyDate ? ` · rate that day ₹${c.rateOnBuyDate.toLocaleString('en-IN')}/g` : ''}
                {dim ? ' · converted to jewellery' : ''}
              </div>
            </div>
          )
          return (
            <div className="overlay" onClick={() => setLedgerOpen(false)}>
              <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="sheet-handle" />
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>🪙 Physical gold</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, margin: '12px 0' }}>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Invested</LabelCaps><div className="mono-sm">{formatINR(inv)}</div></div>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Current</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(cur)}</div></div>
                  <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Gain</LabelCaps><div className="mono-sm" style={{ color: gainColor(cur - inv) }}>{sgn(cur - inv)}{formatINR(Math.abs(cur - inv))}{inv > 0 ? <span style={{ display: 'block', fontSize: 10 }}>{sgn(cur - inv)}{Math.abs((cur - inv) / inv * 100).toFixed(1)}%</span> : null}</div></div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 6 }}>{coins.length} {coins.length === 1 ? 'coin' : 'coins'} · {grams} g in total</div>
                {coins.map(c => row(c, false))}
                {jew.length > 0 && <LabelCaps style={{ margin: '14px 0 2px' }}>Converted to jewellery (not counted)</LabelCaps>}
                {jew.map(c => row(c, true))}
                <div style={{ fontSize: 10.5, color: 'var(--txt2)', margin: '8px 0' }}>Tap a coin for its details. Current value is the rate for its city today, without GST and making charges.</div>
                <button className="btn-primary" style={{ width: '100%', height: 44, marginBottom: 6 }} onClick={() => { setLedgerOpen(false); setForm({ ...form, type: 'Gold' }); setGold({ ...gold, physical: true }); setAddOpen(true) }}>+ Add a coin</button>
                <button className="btn-ghost" style={{ width: '100%', height: 42 }} onClick={() => setLedgerOpen(false)}>Close</button>
              </div>
            </div>
          )
        })()}

        {/* Investment List */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn-primary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={() => setAddOpen(!addOpen)}>+ Add Investment</button>
        </div>

        {addOpen && (
          <div className="overlay" onClick={() => setAddOpen(false)}>
<div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28 }}>
<div className="sheet-handle" />
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>Log an investment</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label={physicalForm || (mfForm && mf.code) ? 'Name (optional)' : mfForm ? 'Search fund by name' : 'Fund / stock name'}><TextField icon={<TrendingUp size={17} />} placeholder={physicalForm ? 'e.g. 8 g Tanishq coin' : mfForm && !mf.code ? 'e.g. parag parikh flexi' : mfForm ? mf.schemeName : 'e.g. Nifty 50 index fund'} value={mfForm && !mf.code ? mf.q : form.name} onChange={e => (mfForm && !mf.code ? setMf({ ...mf, q: e.target.value }) : setForm({ ...form, name: e.target.value }))} /></Field>
              {form.type === 'MutualFund' && (
                <Segmented value={mf.track ? 'live' : 'manual'} options={[{ value: 'live', label: '📈 Live NAV' }, { value: 'manual', label: 'Type the value' }]} onChange={v => setMf({ ...EMPTY_MF, track: v === 'live' })} />
              )}
              {mfForm && !mf.code && (mf.busy || mf.err || mf.results.length > 0) && (
                <div className="card" style={{ padding: 0, maxHeight: 220, overflowY: 'auto', fontSize: 12.5 }}>
                  {mf.busy && <div style={{ padding: 12, color: 'var(--txt2)' }}>Searching…</div>}
                  {mf.err && <div style={{ padding: 12, color: 'var(--red)' }}>{mf.err}</div>}
                  {mf.results.map(r => <div key={r.code} onClick={() => pickScheme(r)} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>{r.name}</div>)}
                </div>
              )}
              <Field label="Type">
                <Picker value={form.type} options={Object.entries(TYPE_ICONS).map(([t, icon]) => ({ value: t, label: t, icon }))} onChange={v => setForm({ ...form, type: v })} title="Investment type" />
              </Field>
              {form.type === 'Gold' && (
                <Segmented value={gold.physical ? 'physical' : 'other'} options={[{ value: 'physical', label: '🪙 Physical gold / coin' }, { value: 'other', label: 'Digital / SGB' }]} onChange={v => setGold({ ...gold, physical: v === 'physical' })} />
              )}
              {physicalForm ? (
                <>
                  <Segmented value={gold.mode} options={[{ value: 'split', label: 'Split: rate + GST + making' }, { value: 'coin', label: 'Coin: MRP − cashback' }]} onChange={v => setGold({ ...gold, mode: v })} />
                  <Field label="Location (for today's gold rate)" hint={liveRates ? `Today in ${GOLD_CITIES.find(c => c.value === gold.city)?.label}: 24K ₹${liveRates.k24?.toLocaleString('en-IN')} · 22K ₹${liveRates.k22?.toLocaleString('en-IN')} per gram${liveRates.stale ? ' (last known)' : ''} · goodreturns.in` : (rateErr || 'Fetching today’s rate…')}>
                    <Picker value={gold.city} options={GOLD_CITIES} onChange={v => { setGold({ ...gold, city: v }); setRateTouched(false) }} title="Gold rate location" />
                  </Field>
                  <div className="form-grid">
                    <Field label="Weight (grams)"><TextField type="number" inputMode="decimal" placeholder="e.g. 8" value={gold.grams} onChange={e => setGold({ ...gold, grams: e.target.value })} /></Field>
                    <Field label="Purity">
                      <Segmented value={gold.purity} options={[{ value: '24', label: '24K' }, { value: '22', label: '22K' }, { value: '18', label: '18K' }]} onChange={v => setGold({ ...gold, purity: v })} />
                    </Field>
                  </div>
                  <Field label="Buying date" hint={!liveRates ? '' : dayRate ? `Gold rate on that day (${gold.purity}K): ₹${dayRate.toLocaleString('en-IN')}/g · goodreturns.in` : 'goodreturns keeps only the last 10 days. For an older date, type the rate you paid.'}>
                    <TextField type="date" value={gold.date} onChange={e => { setRateTouched(false); setGold({ ...gold, date: e.target.value }) }} />
                  </Field>
                  {gold.mode === 'split' ? (
                    <>
                      <div className="form-grid">
                        <Field label="Rate per gram (on buying date)"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={gold.rate} onChange={e => { setRateTouched(true); setGold({ ...gold, rate: e.target.value }) }} /></Field>
                        <Field label="Making charge (total)"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0 if none" value={gold.making} onChange={e => setGold({ ...gold, making: e.target.value })} /></Field>
                      </div>
                      <Field label="GST %" hint="3% on gold and making charges is usual"><TextField type="number" inputMode="decimal" value={gold.gstPct} onChange={e => setGold({ ...gold, gstPct: e.target.value })} /></Field>
                    </>
                  ) : (
                    <div className="form-grid">
                      <Field label="MRP"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={gold.mrp} onChange={e => setGold({ ...gold, mrp: e.target.value })} /></Field>
                      <Field label="Cashback"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0 if none" value={gold.cashback} onChange={e => setGold({ ...gold, cashback: e.target.value })} /></Field>
                    </div>
                  )}
                  <div className="card" style={{ fontSize: 12.5 }}>
                    {gold.mode === 'coin' && dayRate > 0 && parseFloat(gold.grams) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--txt2)' }}>Gold value on buying date ({gold.grams} g × ₹{dayRate.toLocaleString('en-IN')})</span><span>{formatINR(parseFloat(gold.grams) * dayRate, 2)}</span></div>
                    )}
                    {(gold.mode === 'split'
                      ? [['Gold value', goldCalc.gold], ['Making charge', goldCalc.making], [`GST (${gold.gstPct || 0}%)`, goldCalc.gst]]
                      : [['MRP', goldCalc.mrp], ['Cashback', -goldCalc.cashback]]
                    ).map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--txt2)' }}>{l}</span><span>{v < 0 ? '−' : ''}{formatINR(Math.abs(v), 2)}</span></div>)}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 3px', marginTop: 4, borderTop: '1px solid var(--border)', fontWeight: 700 }}><span>{gold.mode === 'split' ? 'Total paid' : 'Net price'}</span><span>{formatINR(goldPaid, 2)}</span></div>
                    {goldNow > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--mint-dim)' }}><span>Worth today (excl. GST &amp; making)</span><b>{formatINR(goldNow, 2)}</b></div>}
                  </div>
                </>
              ) : mfForm ? (
                mf.code ? (
                  <>
                    <div className="card" style={{ fontSize: 12.5 }}>
                      <div style={{ fontWeight: 700 }}>{mf.schemeName}</div>
                      <div style={{ color: 'var(--txt2)', marginTop: 4 }}>{mf.nav ? `NAV ₹${mf.nav} · ${mf.navDate} · AMFI via mfapi.in` : mf.busy ? 'Fetching NAV…' : mf.err}</div>
                      <button className="btn-ghost" style={{ height: 30, padding: '0 12px', fontSize: 11, marginTop: 6 }} onClick={() => setMf({ ...EMPTY_MF })}>Change scheme</button>
                    </div>
                    <div className="form-grid">
                      <Field label="Units held"><TextField type="number" inputMode="decimal" placeholder="e.g. 125.432" value={mf.units} onChange={e => setMf({ ...mf, units: e.target.value })} /></Field>
                      <Field label="Invested"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.investedAmount} onChange={e => setForm({ ...form, investedAmount: e.target.value })} /></Field>
                    </div>
                    {mf.nav > 0 && parseFloat(mf.units) > 0 && <div className="card" style={{ fontSize: 12.5, color: 'var(--mint-dim)' }}>Worth today: <b>{formatINR(parseFloat(mf.units) * mf.nav, 2)}</b> · updates by itself when you open Wealth</div>}
                  </>
                ) : <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Type at least 3 letters of the fund's name, then pick the exact plan (Direct or Regular, Growth).</div>
              ) : (
                <>
                  <div className="form-grid">
                    <Field label="Invested"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.investedAmount} onChange={e => setForm({ ...form, investedAmount: e.target.value })} /></Field>
                    <Field label="Current value"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={form.currentValue} onChange={e => setForm({ ...form, currentValue: e.target.value })} /></Field>
                  </div>
                  <Field label="Account number, last 4 digits"><TextField icon={<StickyNote size={17} />} inputMode="numeric" maxLength={4} placeholder="Optional, e.g. 1234" value={form.last4} onChange={e => setForm({ ...form, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
                </>
              )}
              <Field label="Notes"><TextField icon={<StickyNote size={17} />} placeholder="Optional" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 14 }} onClick={() => setAddOpen(false)}>Cancel</button>
                <BtnPrimary onClick={handleAddManual} style={{ flex: 1 }}>Save</BtnPrimary>
              </div>
            </div>
          </div>
          </div>
        )}

        {openInv && (
          <div className="overlay" onClick={() => setOpenId(null)}>
            <div className="sheet" onClick={e => e.stopPropagation()} style={{ paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="sheet-handle" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{TYPE_ICONS[openInv.type] || '💰'} {openInv.name}</div>
                <button className={editing ? 'btn-primary' : 'btn-secondary'} style={{ height: 34, padding: '0 16px', fontSize: 12 }} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
              </div>
              {(editing || openInv.last4) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--txt2)', flex: 1 }}>Account number, last 4 digits</span>
                  {editing
                    ? <input className="input" inputMode="numeric" maxLength={4} placeholder="••••" defaultValue={openInv.last4 || ''} key={openInv.id + ':' + (openInv.last4 || '')} style={{ width: 80, height: 34, textAlign: 'right' }}
                        onBlur={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v !== (openInv.last4 || '')) db.investments.update(openInv.id, { last4: v || null }) }} />
                    : <b>••{openInv.last4}</b>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
                <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Invested</LabelCaps><div className="mono-sm">{formatINR(openInv.investedAmount || 0, 2)}</div></div>
                <div className="card-sm" style={{ padding: 10 }}><LabelCaps style={{ fontSize: 9 }}>Current</LabelCaps><div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(openInv.currentValue || 0, 2)}</div></div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>{openInv.type === 'PPF' ? 'Interest earned' : 'Gain'} <b style={{ color: (openInv.currentValue || 0) >= (openInv.investedAmount || 0) ? 'var(--mint-dim)' : 'var(--red)' }}>{formatINR((openInv.currentValue || 0) - (openInv.investedAmount || 0), 2)}</b>{openInv.investedAmount > 0 ? ` · ${(((openInv.currentValue || 0) - openInv.investedAmount) / openInv.investedAmount * 100).toFixed(1)}% of invested` : ''}{openInv.type === 'PPF' ? ' · current = deposits + interest credited up to 31 March' : ''}</div>
              {openInv.type === 'PPF' && (() => {
                const rows = ppfHistory(openInv)
                const rate = rows[rows.length - 1].rate
                const y = ppfYear({ entries: openInv.entries || [], current: openInv.currentValue || 0, rate })
                return (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Financial year {y.fy}</div>
                    <ProgressBar pct={Math.min(100, y.deposited / y.limit * 100)} variant="gradient" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                      <span>Deposited {formatINR(y.deposited)} of {formatINR(y.limit)}</span>
                      <b style={{ color: y.over ? 'var(--red)' : 'var(--mint-dim)' }}>{y.over ? `${formatINR(y.over)} over the limit` : `${formatINR(y.remaining)} left`}</b>
                    </div>
                    {y.over > 0 && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Deposits above ₹1,50,000 in a year earn no interest and are returned.</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 10 }}>
                      <span style={{ color: 'var(--txt2)' }}>Interest so far (credited on 31 Mar)</span><b>{formatINR(y.soFar)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: 'var(--txt2)' }}>Projected for the year</span><b>{formatINR(y.projected)}</b>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Year by year</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr 1.1fr', gap: 6, fontSize: 10, color: 'var(--txt2)', paddingBottom: 4 }}>
                      <span>Year</span><span style={{ textAlign: 'right' }}>Deposited</span><span style={{ textAlign: 'right' }}>Rate %</span><span style={{ textAlign: 'right' }}>Interest</span>
                    </div>
                    {[...rows].reverse().map(r => (
                      <div key={r.fy} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr 1.1fr', gap: 6, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                        <span>{r.fy}{r.current ? <span style={{ display: 'block', fontSize: 9.5, color: 'var(--txt2)' }}>so far</span> : null}</span>
                        <span style={{ textAlign: 'right' }}>{formatINR(r.deposited)}</span>
                        {!editing ? <span style={{ textAlign: 'right' }}>{r.rate}</span> : <input className="input" type="number" inputMode="decimal" step="0.1" defaultValue={r.rate} key={openInv.id + r.fy + ':' + r.rate} style={{ height: 30, padding: '0 6px', textAlign: 'right', fontSize: 12 }}
                          onBlur={e => { const v = parseFloat(e.target.value); if (v > 0 && v !== r.rate) db.investments.update(openInv.id, { ppfRates: { ...(openInv.ppfRates || {}), [r.fy]: v } }) }} />}
                        {!editing ? <span style={{ textAlign: 'right', color: r.actual ? 'var(--txt)' : 'var(--txt2)' }}>{formatINR(r.interest)}{r.pct != null && <span style={{ display: 'block', fontSize: 10, color: 'var(--txt2)' }}>{r.pct.toFixed(2)}% of balance</span>}</span> : <input className="input" type="number" inputMode="decimal" defaultValue={r.interest} key={openInv.id + r.fy + ':' + r.interest + r.actual} style={{ height: 30, padding: '0 6px', textAlign: 'right', fontSize: 12, color: r.actual ? 'var(--txt)' : 'var(--txt2)' }}
                          onBlur={e => { const v = parseFloat(e.target.value); if (e.target.value !== '' && v >= 0 && v !== r.interest) db.investments.update(openInv.id, { ppfInterest: { ...(openInv.ppfInterest || {}), [r.fy]: v } }) }} />}
                      </div>
                    ))}
                    <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 4 }}>{editing ? "Change a year's rate, or type the interest from your passbook (it replaces the estimate and is used for the next year's opening balance)." : 'Interest in grey is an estimate. Tap Edit to change a rate or enter the passbook figure.'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 6 }}>An estimate. Interest uses the lowest balance between the 5th and month end, so deposit by the 5th. The government sets the rate each quarter.</div>
                  </div>
                )
              })()}
              {openInv.physicalGold && (
                <div className="card" style={{ marginBottom: 12, fontSize: 12.5 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{openInv.grams} g · {openInv.purity}K · {openInv.cityLabel}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 6 }}>Bought {formatDate(openInv.buyDate || openInv.startDate)}{openInv.rateOnBuyDate ? ` · gold rate that day ₹${openInv.rateOnBuyDate.toLocaleString('en-IN')}/g` : ''}</div>
                  {openInv.excluded && <div style={{ fontSize: 11.5, color: 'var(--amber, #D97706)', marginBottom: 6 }}>Converted to jewellery · not counted in your investments</div>}
                  {(openInv.goldMode === 'coin'
                    ? [['MRP', openInv.mrp], ['Cashback', -(openInv.cashback || 0)]]
                    : [[`Gold value (₹${(openInv.buyRate || 0).toLocaleString('en-IN')}/g)`, openInv.goldValue], ['Making charge', openInv.making], [`GST (${openInv.gstPct || 0}%)`, openInv.gst]]
                  ).map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: 'var(--txt2)' }}>{l}</span><span>{v < 0 ? '−' : ''}{formatINR(Math.abs(v || 0), 2)}</span></div>)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 3px', marginTop: 4, borderTop: '1px solid var(--border)', fontWeight: 700 }}><span>{openInv.goldMode === 'coin' ? 'Net price' : 'Total paid'}</span><span>{formatINR(openInv.investedAmount, 2)}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 6 }}>Current = {openInv.grams} g × today's {openInv.purity}K rate{openInv.liveRate ? ` (₹${openInv.liveRate.toLocaleString('en-IN')}/g, ${openInv.cityLabel}, goodreturns.in)` : ''}. GST and making charges are not recovered on resale.</div>
                </div>
              )}
              {openInv.mfCode && <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 12 }}>{openInv.units} units × NAV ₹{openInv.nav}{openInv.navDate ? ` (${openInv.navDate})` : ''} · refreshes when you open Wealth</div>}
              {!openInv.physicalGold && !editing && !depOpen && <button className="btn-primary" style={{ width: '100%', height: 46, marginBottom: 12 }} onClick={() => setDepOpen(true)}>+ Add deposit</button>}
              {!openInv.physicalGold && (editing || depOpen) && (
                <>
              <LabelCaps style={{ marginBottom: 4 }}>Add a deposit</LabelCaps>
              <div className="form-grid">
                <Field label="Amount"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder="0" value={dep.amount} onChange={e => setDep({ ...dep, amount: e.target.value })} /></Field>
                <Field label="Date"><TextField type="date" value={dep.date} onChange={e => setDep({ ...dep, date: e.target.value })} /></Field>
                {openInv.mfCode && <Field label="Units bought"><TextField type="number" inputMode="decimal" placeholder="e.g. 12.345" value={dep.units} onChange={e => setDep({ ...dep, units: e.target.value })} /></Field>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {depOpen && !editing && <button className="btn-ghost" style={{ height: 52, padding: '0 18px' }} onClick={() => setDepOpen(false)}>Cancel</button>}
                <BtnPrimary onClick={addDeposit} style={{ flex: 1 }}>Add deposit</BtnPrimary>
              </div>
              {editing && openInv.type !== 'PPF' && !openInv.mfCode && (
                <>
                  <LabelCaps style={{ margin: '16px 0 4px' }}>Update current value (balance from the passbook / app)</LabelCaps>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" placeholder={String(openInv.currentValue || 0)} value={curVal} onChange={e => setCurVal(e.target.value)} /></div>
                    <button className="btn-secondary" style={{ height: 52, padding: '0 18px' }} onClick={saveCurrent}>Update</button>
                  </div>
                </>
              )}
                </>
              )}
              {(openInv.entries || []).length > 0 && (
                <>
                  <LabelCaps style={{ margin: '16px 0 4px' }}>Entries</LabelCaps>
                  {openInv.entries.map((e, i) => ({ e, i })).sort((a, b) => new Date(b.e.date) - new Date(a.e.date) || b.i - a.i).map(({ e, i }) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ flex: 1, color: 'var(--txt2)' }}>{formatDate(e.date)}{e.opening ? ' · opening' : ''}</span>
                      <b style={{ marginRight: 12 }}>{formatINR(e.amount, 2)}</b>
                      {editing && <button className="btn-secondary" style={{ height: 28, padding: '0 10px', fontSize: 11, marginRight: 6 }} onClick={() => setEdEntry({ idx: i, date: format(new Date(e.date), 'yyyy-MM-dd'), amount: String(e.amount) })}>Edit</button>}
                      {editing && <button className="btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 11 }} onClick={() => removeEntry(i)}>Remove</button>}
                    </div>
                  ))}
                  {edEntry && (
                    <div className="card" style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Edit this entry</div>
                      <div className="form-grid">
                        <Field label="Amount"><TextField icon={<IndianRupee size={17} />} type="number" inputMode="decimal" value={edEntry.amount} onChange={e => setEdEntry({ ...edEntry, amount: e.target.value })} /></Field>
                        <Field label="Date"><TextField type="date" value={edEntry.date} onChange={e => setEdEntry({ ...edEntry, date: e.target.value })} /></Field>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="btn-ghost" style={{ height: 44 }} onClick={() => setEdEntry(null)}>Cancel</button>
                        <button className="btn-primary" style={{ flex: 1, height: 44 }} onClick={saveEntry}>Save</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {openInv.physicalGold && <button className="btn-secondary" style={{ width: '100%', height: 44, marginTop: 14 }} onClick={toggleJewellery}>{openInv.excluded ? 'Count as investment again' : '💍 Converted to jewellery: exclude from investments'}</button>}
              {editing && <button className="btn-ghost" style={{ width: '100%', height: 44, marginTop: 14 }} onClick={deleteInv}>Delete this investment</button>}
              <button className="btn-ghost" style={{ width: '100%', height: 44, marginTop: 6 }} onClick={() => setOpenId(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
