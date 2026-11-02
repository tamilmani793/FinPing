import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db/schema'
import { useOptions } from '../lib/options'
import { SubHeader, ProgressBar, formatINR } from '../components/UI'
import { TextField } from '../components/Fields'
import { bestByCategory, missedRewards, feeWaiverRows } from '../lib/cardAdvisor'

const NOT_SPENDS = ['Salary', 'Cashback', 'Transfer', 'Card Payment', 'Investment', 'Wallet Load', 'ATM Withdrawal']
const name = c => `${c?.name || c?.bank || 'Card'}${c?.cardLast4 ? ` ••${c.cardLast4}` : ''}`
const d = x => format(new Date(x), 'd MMM yyyy')
const money = v => formatINR(v, v < 10 ? 2 : 0)

function Section({ title, sub, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="label-caps" style={{ margin: '0 4px 4px' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--txt2)', margin: '0 4px 8px' }}>{sub}</div>}
      {children}
    </div>
  )
}

// the card that earns most, what it earns on ₹1,000, and the conditions that come with it
function Pick({ e, label }) {
  if (!e?.top) return null
  return (
    <div style={{ marginTop: 3 }}>
      <div style={{ fontSize: 11.5 }}>
        {label && <span style={{ color: 'var(--txt2)' }}>{label} </span>}
        <b style={{ color: 'var(--mint-dim)' }}>{name(e.top.card)}</b>
        <span style={{ color: 'var(--txt2)' }}> · {money(e.top.value)}{e.top.rate ? ` (${e.top.rate})` : ''} on ₹1,000</span>
      </div>
      {e.top.cond && <div style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{e.top.cond}</div>}
    </div>
  )
}

// Use your cards better: the best card for each spend, the reward missed last month, and annual-fee waivers.
export default function CardAdvisor() {
  const data = useLiveQuery(async () => ({
    cards: await db.creditCards.toArray(), rules: await db.card_reward_rules.toArray(), txns: await db.transactions.filter(t => t.cardId != null).toArray(),
  }), [], null)
  const catList = useOptions('categories')
  const categories = catList.map(c => c.name).filter(n => !NOT_SPENDS.includes(n))
  const icons = Object.fromEntries(catList.map(c => [c.name, c.icon]))
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState(null) // the missed-reward group whose transactions are listed

  const cards = data?.cards || []
  const byId = Object.fromEntries(cards.map(c => [c.id, c]))
  const best = data ? bestByCategory(cards, data.rules, categories) : []
  const missed = data ? missedRewards(data.txns, cards, data.rules) : null
  const waivers = data ? feeWaiverRows(cards, data.txns) : []
  const rows = all ? best : best.slice(0, 10)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubHeader title="Card advisor" sub="Get more from the cards you hold" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 130px' }}>
        {!data && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Working it out…</div>}
        {data && (
          <>
            {missed && (
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="label-caps">{format(missed.from, 'MMMM yyyy')} on your cards</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                  <div><div style={{ fontSize: 10, color: 'var(--txt2)' }}>Spent</div><div className="mono-sm">{formatINR(missed.spent)}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--txt2)' }}>Earned</div><div className="mono-sm" style={{ color: 'var(--mint-dim)' }}>{formatINR(missed.earned)}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--txt2)' }}>Missed</div><div className="mono-sm" style={{ color: missed.total > 0 ? 'var(--red)' : 'var(--txt)' }}>{formatINR(missed.total)}</div></div>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--txt2)', marginTop: 6 }}>"Missed" is an estimate: what the best of your cards would have earned on the same spends, ignoring monthly caps.</div>
              </div>
            )}

            <Section title="Best card for each spend" sub="What ₹1,000 earns on each of your cards, by the rules you set up, with the conditions. Spends a card never rewards (fuel, rent, government, EMI, wallet loads) are left out.">
              {best.length === 0 && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)' }}>Add reward rules to your cards (Accounts → a card → Reward rules) to see which one to use.</div>}
              {best.length > 0 && (
                <div className="card rows" style={{ paddingTop: 2, paddingBottom: 2 }}>
                  {rows.map(r => {
                    const same = r.online.top?.card.id === r.shop.top?.card.id && Math.abs((r.online.top?.value || 0) - (r.shop.top?.value || 0)) < 0.01
                    return (
                      <div key={r.category} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{icons[r.category] || '💳'} {r.category}{r.upiOnly && <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--txt2)' }}> · RuPay cards only</span>}</div>
                        {same ? <Pick e={r.online} /> : <><Pick e={r.online} label="Online" /><Pick e={r.shop} label="In a shop" /></>}
                      </div>
                    )
                  })}
                </div>
              )}
              {best.length > 10 && <button className="btn-ghost" style={{ width: '100%', height: 36, fontSize: 12, marginTop: 6 }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${best.length}`}</button>}
            </Section>


            <Section title="Missed last month" sub="Spends that would have earned more on another card. Tap a row to see the transactions.">
              {(!missed || missed.rows.length === 0) && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)' }}>{missed?.count ? 'Nothing worth mentioning: you used the best card for almost every spend.' : 'No card spends last month.'}</div>}
              {missed && missed.rows.length > 0 && (
                <div className="card rows" style={{ paddingTop: 2, paddingBottom: 2 }}>
                  {missed.rows.slice(0, 8).map((r, i) => (
                    <div key={i} onClick={() => setOpen(open === i ? null : i)} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{icons[r.category] || '💳'} {r.category} · {r.count} spend{r.count === 1 ? '' : 's'}, {formatINR(r.spent)}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>Used {name(byId[r.usedId])}. {name(byId[r.betterId])} was better.</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <b style={{ color: 'var(--red)', fontSize: 13 }}>{formatINR(r.missed)}</b>
                          <div style={{ fontSize: 10, color: 'var(--gold-dim)' }}>{open === i ? 'Hide' : 'Show'} transactions</div>
                        </div>
                      </div>
                      {open === i && (
                        <div style={{ marginTop: 8, background: 'var(--bg0)', borderRadius: 10, padding: '4px 10px' }}>
                          {r.txns.map((t, k) => (
                            <div key={t.id ?? k} style={{ padding: '7px 0', borderTop: k ? '1px solid var(--border)' : 'none', fontSize: 11.5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant || 'Transaction'}</b>
                                <b>{formatINR(t.amount, 2)}</b>
                              </div>
                              <div style={{ color: 'var(--txt2)', marginTop: 1 }}>{d(t.date)} · earned {money(t.actual)} on {name(byId[r.usedId])}; {name(byId[r.betterId])} would earn {money(t.best)}, <span style={{ color: 'var(--red)' }}>{formatINR(t.gap, 2)} more</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Annual fee waiver" sub="Spend this card year against the amount that waives the fee">
              {waivers.length === 0 && <div className="card" style={{ fontSize: 12, color: 'var(--txt2)' }}>None of your cards charge an annual fee.</div>}
              {waivers.map(w => (
                <div key={w.card.id} className="card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{name(w.card)}</div>
                    <span style={{ fontSize: 11, color: 'var(--txt2)' }}>Fee {formatINR(w.fee)}</span>
                  </div>
                  {w.threshold > 0 ? (
                    <>
                      <div style={{ margin: '8px 0 4px' }}><ProgressBar pct={Math.min(100, w.spent / w.threshold * 100)} variant="gradient" /></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span>{formatINR(w.spent)} of {formatINR(w.threshold)}</span>
                        <b style={{ color: w.met ? 'var(--mint-dim)' : 'var(--txt)' }}>{w.met ? 'Fee waived' : `${formatINR(w.left)} to go`}</b>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 3 }}>{w.met ? `Card year ends ${d(w.end)}.` : `${w.days} days left (until ${d(w.end)}): about ${formatINR(Math.ceil(w.perMonth))} a month.`}{!w.hasIssueDate ? ' Add the card issue date for the exact year.' : ''}</div>
                    </>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 4 }}>Enter the yearly spend that waives the fee:</div>
                      <TextField type="number" inputMode="decimal" placeholder="e.g. 200000" onBlur={e => { const v = Number(e.target.value); if (v > 0) db.creditCards.update(w.card.id, { feeWaiverThreshold: v }) }} />
                    </div>
                  )}
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
