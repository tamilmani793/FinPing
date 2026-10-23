import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, TxnRow, Divider, LabelCaps, MonoLg, MonoMd, BtnPrimary, BtnSecondary, formatINR, getMerchantIcon, formatDate } from '../components/UI'
import { useStore } from '../store'
import { format, startOfMonth, endOfMonth } from 'date-fns'

const TABS = ['Transactions', 'Statement', 'Rewards', 'Analysis']
const REWARD_PERIODS = ['Monthly', 'Quarterly', 'Annual']

export default function Cards() {
  const [activeCard, setActiveCard] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [rewardPeriod, setRewardPeriod] = useState(0)

  const cards = useLiveQuery(() => db.creditCards.toArray())
  const { showNotification } = useStore()

  const card = cards?.[activeCard]

  const ccTxns = useLiveQuery(() => {
    if (!card) return []
    return db.creditCardTransactions.where('cardId').equals(card.id).reverse().sortBy('date')
  }, [card?.id])

  const statements = useLiveQuery(() => {
    if (!card) return []
    return db.creditCardStatements.where('cardId').equals(card.id).reverse().sortBy('statementDate')
  }, [card?.id])

  const allTxns = useLiveQuery(() => {
    if (!card) return []
    return db.transactions.where('cardId').equals(card.id).reverse().sortBy('date')
  }, [card?.id])

  if (!cards) return <div style={{ padding: 20, color: 'var(--txt2)' }}>Loading...</div>

  const totalDue = (cards || []).reduce((s, c) => s + (c.currentBalance || 0), 0)
  const nextDue = (cards || []).filter(c => c.currentBalance > 0).sort((a, b) => a.paymentDueDays - b.paymentDueDays)[0]

  const rewardChartData = []

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 80 }}>
      <TopBar sub="Cards" />

      {/* SMS Listener Banner */}
      <div style={{ margin: '10px 16px 0', background: 'var(--indigo-bg)', border: '1px solid var(--indigo-border)', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 18, marginTop: 1 }}>📡</div>
        <div>
          <LabelCaps style={{ color: 'var(--indigo-dim)', marginBottom: 2 }}>Smart SMS Listener</LabelCaps>
          <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Bank sends "Payment of ₹XX received" → Pending balances instantly reconcile &amp; clear automatically.</div>
        </div>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', flexShrink: 0, marginTop: 4 }} />
      </div>

      {/* Summary Row */}
      <div style={{ margin: '10px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="card-sm">
          <LabelCaps style={{ marginBottom: 3 }}>Total Available Credit</LabelCaps>
          <div className="mono-md" style={{ color: 'var(--mint)' }}>{formatINR((cards || []).reduce((s, c) => s + (c.availableCredit || 0), 0))}</div>
          <div style={{ fontSize: 10, color: 'var(--txt2)' }}>Across {cards?.length || 0} active cards</div>
        </div>
        <div className="card-sm">
          <LabelCaps style={{ marginBottom: 3 }}>Total Due This Month</LabelCaps>
          <div className="mono-md" style={{ color: totalDue > 0 ? 'var(--red)' : 'var(--mint)' }}>{formatINR(totalDue)}</div>
          {nextDue && <div style={{ fontSize: 10, color: 'var(--amber)' }}>Next bill: {nextDue.name}</div>}
        </div>
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        {/* Card Tabs */}
        <SectionHdr title={`Active Credit Cards`} right={<Badge variant="indigo">{cards?.length || 0} Linked</Badge>} />

        {/* Card Scroll selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {(cards || []).map((c, i) => (
            <div key={c.id} onClick={() => { setActiveCard(i); setActiveTab(0) }}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: i === activeCard ? 'var(--mint-bg)' : 'transparent',
                color: i === activeCard ? 'var(--mint-dim)' : 'var(--txt2)',
                border: i === activeCard ? '1px solid var(--mint-border)' : '1px solid var(--border2)' }}>
              {c.name.split(' ')[0]}
            </div>
          ))}
        </div>

        {/* Active Card Visual */}
        {card && (
          <div className="cc-visual" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--txt2)', textTransform: 'uppercase' }}>{card.bank}</div>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 10 }}>{card.name}</div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--txt2)', letterSpacing: '0.15em' }}>•• {card.cardLast4}</div>
            </div>

            {card.currentBalance > 0 ? (
              <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 6, padding: '4px 8px', marginBottom: 8, fontSize: 11, color: '#FCA5A5', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ● Due {formatINR(card.currentBalance)}
              </div>
            ) : (
              <div className="badge badge-mint" style={{ marginBottom: 8 }}>✓ Paid · No balance due</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <LabelCaps style={{ marginBottom: 2 }}>Available Credit</LabelCaps>
                <div className="mono-sm" style={{ color: 'var(--mint)' }}>{formatINR(card.availableCredit)} / {formatINR(card.creditLimit / 100000 * 100000)}</div>
              </div>
              <div>
                <LabelCaps style={{ marginBottom: 2 }}>Annual Fee</LabelCaps>
                <div style={{ fontSize: 12, fontWeight: 600, color: card.isLTF ? 'var(--mint)' : 'var(--amber)' }}>
                  {card.isLTF ? 'Lifetime Free (₹0)' : formatINR(card.totalAnnualFee)}
                </div>
              </div>
            </div>

            {/* Utilisation */}
            <div style={{ fontSize: 10, color: 'var(--txt2)', marginBottom: 4 }}>
              Credit Utilisation: {Math.round((1 - card.availableCredit / card.creditLimit) * 100)}%
            </div>
            <ProgressBar pct={(1 - card.availableCredit / card.creditLimit) * 100} variant="gradient" />

            {!card.isLTF && card.feeWaiverThreshold > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt2)' }}>
                Fee waiver: {formatINR(card.totalPaidThisYear || 0)} / {formatINR(card.feeWaiverThreshold)} spent
              </div>
            )}

            {card.currentBalance > 0 && (
              <button className="btn-primary" style={{ width: '100%', marginTop: 10, height: 40, fontSize: 13 }}
                onClick={() => showNotification('Payment link would open here', 'info')}>
                ⚡ Pay {formatINR(card.currentBalance)} Now
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="tab-bar" style={{ marginLeft: 0, marginRight: 0, marginBottom: 12 }}>
          {TABS.map((t, i) => (
            <div key={t} className={`tab${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>{t}</div>
          ))}
        </div>

        {/* Tab: Transactions */}
        {activeTab === 0 && (
          <Card style={{ padding: '10px 14px', marginBottom: 10 }}>
            <SectionHdr title="Card Transactions" right={<Badge variant="grey">{(allTxns || []).length} total</Badge>} />
            {(allTxns || []).slice(0, 10).map(t => (
              <TxnRow
                key={t.id}
                icon={getMerchantIcon(t.merchant)}
                merchant={t.merchant}
                meta={`${formatDate(t.date)} · ${t.category}`}
                amount={t.amount}
                isCredit={t.type === 'credit'}
                badge={
                  t.type === 'debit' ? (
                    t.isExcluded
                      ? <span className="badge badge-red" style={{ fontSize: 9 }}>⛔ Excl.</span>
                      : <span className="badge badge-mint" style={{ fontSize: 9 }}>✅ Eligible</span>
                  ) : <span className="badge badge-indigo" style={{ fontSize: 9 }}>Cashback</span>
                }
              />
            ))}
            {!(allTxns || []).length && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--txt2)', fontSize: 12 }}>No transactions yet for this card</div>
            )}
          </Card>
        )}

        {/* Tab: Statement */}
        {activeTab === 1 && (
          <Card style={{ padding: '10px 14px', marginBottom: 10 }}>
            <SectionHdr title="Statement History" right={<Badge variant="grey">Oct 2026</Badge>} />
            {card && (
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div><LabelCaps>Statement Due</LabelCaps><div className="mono-md" style={{ color: 'var(--red)' }}>{formatINR(card.statementBalance || 0)}</div></div>
                  <div style={{ textAlign: 'right' }}><LabelCaps>Min Due</LabelCaps><div className="mono-md">{formatINR(card.minimumDue || 0)}</div></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 8 }}>⚠ Due in {card.paymentDueDays} days</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-primary" style={{ flex: 1, height: 36, fontSize: 12 }} onClick={() => showNotification('Marked as paid!', 'success')}>Mark Paid in Full</button>
                  <button className="btn-secondary" style={{ fontSize: 11 }}>Pay Min</button>
                </div>
              </div>
            )}
            <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--txt2)', fontSize: 12 }}>Previous statements will appear here as SMS bills arrive.</div>
          </Card>
        )}

        {/* Tab: Rewards */}
        {activeTab === 2 && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {REWARD_PERIODS.map((p, i) => (
                <div key={p} onClick={() => setRewardPeriod(i)}
                  style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    background: i === rewardPeriod ? 'var(--mint-bg)' : 'transparent',
                    color: i === rewardPeriod ? 'var(--mint-dim)' : 'var(--txt2)',
                    border: i === rewardPeriod ? '1px solid var(--mint-border)' : '1px solid var(--border2)' }}>{p}</div>
              ))}
            </div>

            <Card style={{ marginBottom: 8 }}>
              <LabelCaps style={{ marginBottom: 8 }}>Rewards Earned — Last 6 Months</LabelCaps>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={rewardChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fill: 'var(--txt2)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--txt2)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => `₹${v}`} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="rewards" fill="var(--mint)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Cap utilisation */}
            <Card style={{ marginBottom: 10 }}>
              <LabelCaps style={{ marginBottom: 8 }}>Cap Utilisation — October 2026</LabelCaps>
              {card?.rewardRules?.filter(r => r.cap > 0 && r.capPeriod === 'monthly').map((rule, i) => {
                const used = 0
                const pct = Math.round(used / rule.cap * 100)
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--txt2)' }}>{rule.matchType === 'BASE' ? 'Base rate' : `${rule.targets?.slice(0, 2).join('/')} ${rule.rate * 100}%`} cap</span>
                      <span className="mono-sm" style={{ color: pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--mint)' }}>
                        {formatINR(used)} / {formatINR(rule.cap)}
                      </span>
                    </div>
                    <ProgressBar pct={pct} variant={pct >= 90 ? 'red' : pct >= 70 ? 'amber' : 'mint'} />
                    {pct >= 90 && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>Cap nearly full — overflow earns {(rule.postCapRate || 0) * 100}%</div>}
                  </div>
                )
              })}
            </Card>

            {/* Annual fee vs rewards */}
            <Card style={{ marginBottom: 10 }}>
              <LabelCaps style={{ marginBottom: 8 }}>Annual Economics</LabelCaps>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Total Rewards YTD</div>
                  <div className="mono-md" style={{ color: 'var(--mint)' }}>{formatINR(0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Annual Fee</div>
                  <div className="mono-md" style={{ color: card?.isLTF ? 'var(--mint)' : 'var(--amber)' }}>
                    {card?.isLTF ? '₹0 (LTF)' : formatINR(card?.totalAnnualFee || 0)}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: 'var(--txt2)' }}>Net Benefit</div>
                  <div className="mono-md" style={{ color: 'var(--mint)' }}>{formatINR(0 - (card?.isLTF ? 0 : card?.totalAnnualFee || 0))}</div>
                </div>
              </div>
              {!card?.isLTF && <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 6, fontSize: 11, color: 'var(--amber-dim)' }}>⚠ Spend {formatINR(card?.feeWaiverThreshold - (card?.totalPaidThisYear || 0))} more to waive ₹{card?.totalAnnualFee} fee</div>}
            </Card>
          </>
        )}

        {/* Tab: Analysis */}
        {activeTab === 3 && (
          <Card style={{ marginBottom: 10 }}>
            <LabelCaps style={{ marginBottom: 8 }}>Smart Insights</LabelCaps>
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--txt2)', fontSize: 12 }}>Insights will appear once you have card transactions.</div>
          </Card>
        )}

        <button className="btn-secondary" style={{ width: '100%', marginTop: 4, height: 40 }} onClick={() => showNotification('Card linking via SMS parser coming soon', 'info')}>
          + Link Card via SMS Parser
        </button>
      </div>
    </div>
  )
}
