import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { db } from '../db/schema'
import { TopBar, Card, SectionHdr, Badge, ProgressBar, TxnRow, Divider, LabelCaps, MonoLg, MonoMd, BtnPrimary, BtnSecondary, formatINR, getMerchantIcon, formatDate } from '../components/UI'
import { useStore } from '../store'
import { groupOf } from '../lib/cards'
import CardEditSheet from '../components/CardEditSheet'
import { format, startOfMonth } from 'date-fns'
import { Gift, CreditCard } from 'lucide-react'

const TABS = ['Transactions', 'Statement', 'Rewards', 'Analysis']
const REWARD_PERIODS = ['Monthly', 'Quarterly', 'Annual']

export default function Cards() {
  const [activeCard, setActiveCard] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [rewardPeriod, setRewardPeriod] = useState(0)
  const [editOpen, setEditOpen] = useState(false)

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

  const rewardChartData = []

  const sharedCards = groupOf(card, cards)
  const limit = card?.creditLimit || 0
  const used = limit ? Math.max(0, limit - (card?.availableCredit || 0)) : 0
  const utilPct = limit ? Math.round((used / limit) * 100) : 0
  const stmt = (statements || [])[0]
  const monthStart = startOfMonth(new Date())
  const cashbackTxns = (allTxns || []).filter(t => t.type === 'credit' && t.category === 'Cashback')
  const cbMonth = cashbackTxns.filter(t => new Date(t.date) >= monthStart).reduce((s, t) => s + t.amount, 0)
  const cbAll = cashbackTxns.reduce((s, t) => s + t.amount, 0)
  const fmtD = d => (d ? format(new Date(d), 'd MMM') : '—')
  const spentThisYear = card?.totalPaidThisYear || 0
  const isPaid = stmt ? stmt.isPaid : !(card?.currentBalance > 0)

  const Row = ({ k, v, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--txt2)' }}>{k}</span>
      <span style={{ fontWeight: 600, color: color || 'var(--txt)' }}>{v}</span>
    </div>
  )

  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <TopBar title="Card Portfolio" />

      {/* Card selector chips */}
      <div className="chip-scroll" style={{ paddingTop: 0 }}>
        {cards.map((c, i) => (
          <div key={c.id} className={`chip${i === activeCard ? ' active' : ''}`} onClick={() => { setActiveCard(i); setActiveTab(0) }}>
            {c.name}{c.cardLast4 ? ` ••${c.cardLast4}` : ''}
          </div>
        ))}
        {!cards.length && <div style={{ fontSize: 12, color: 'var(--txt2)' }}>No cards linked yet</div>}
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        {/* Cashback & rewards panel */}
        {card && (
          <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="stat-icon" style={{ background: 'var(--pink-bg)', color: 'var(--pink)' }}><Gift size={15} /></div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>Cashback &amp; Rewards</div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-caps">This month</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(cbMonth)}</div>
              </div>
              <div style={{ textAlign: 'right', marginLeft: 8 }}>
                <div className="label-caps">All-time</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--mint-dim)' }}>{formatINR(cbAll)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Active card */}
        {card && (
          <div className="cc-visual" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(232,210,154,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8D29A' }}><CreditCard size={18} /></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{card.name}</div>
                <div style={{ fontSize: 10, color: 'var(--txt2)' }}>{card.bank} •• {card.cardLast4}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <div className="label-caps">Outstanding</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{formatINR(card.currentBalance || 0)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-caps">Due date</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{stmt ? fmtD(stmt.dueDate) : card.paymentDueDays ? `in ${card.paymentDueDays}d` : '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt2)', marginBottom: 4 }}>
              <span className="label-caps">Utilization</span><span style={{ fontWeight: 700 }}>{utilPct}% of {formatINR(limit)}</span>
            </div>
            <ProgressBar pct={utilPct} variant={utilPct >= 70 ? 'red' : utilPct >= 40 ? 'amber' : 'mint'} />
          </div>
        )}

        {/* Fee structure */}
        {card && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="section-hdr" style={{ marginBottom: 4 }}>
              <div className="label-caps">Fee Structure</div>
              <span className={`badge ${card.isLTF ? 'badge-mint' : 'badge-amber'}`}>{card.isLTF ? 'Lifetime Free' : `${formatINR(card.totalAnnualFee || 0)} / Yr`}</span>
            </div>
            {!card.isLTF && card.feeWaiverThreshold > 0 && (
              <>
                <Row k="Fee waiver spend" v={`${formatINR(spentThisYear)} / ${formatINR(card.feeWaiverThreshold)}`} />
                <ProgressBar pct={(spentThisYear / card.feeWaiverThreshold) * 100} variant="gradient" style={{ marginBottom: 4 }} />
              </>
            )}
            <Row k="Credit limit" v={formatINR(limit)} />
            {sharedCards.length > 1 && (
              <Row k="Shared with" v={sharedCards.filter(c => c.id !== card.id).map(c => `${c.name.split(' ')[0]} ••${c.cardLast4}`).join(', ')} />
            )}
            <Row k="Available credit" v={formatINR(card.availableCredit || 0)} color="var(--mint-dim)" />
          </div>
        )}

        {/* Statement details */}
        {card && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="label-caps" style={{ marginBottom: 4 }}>Statement Details</div>
            <Row k="Statement date" v={fmtD(stmt?.statementDate)} />
            <Row k="Payment due date" v={fmtD(stmt?.dueDate)} />
            <Row k="Status" v={isPaid ? 'Paid ✓' : 'Unpaid'} color={isPaid ? 'var(--mint-dim)' : 'var(--red-dim)'} />
            <Row k="Statement amount" v={formatINR(card.statementBalance || 0)} />
            <Row k="Pending due" v={formatINR(isPaid ? 0 : (card.pendingDue ?? card.statementBalance ?? 0))} color={isPaid ? undefined : 'var(--red-dim)'} />
            <Row k="Minimum due" v={formatINR(card.minimumDue || 0)} />
            <Row k="Pending (unbilled) spends" v={formatINR(card.unbilled || 0)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-secondary" style={{ flex: 1, height: 38 }} onClick={() => setActiveTab(1)}>Details &amp; Limits</button>
              <button className="btn-secondary" style={{ height: 38 }} onClick={() => setEditOpen(true)}>Edit</button>
            </div>
            {card.currentBalance > 0 && (
              <button className="btn-primary" style={{ width: '100%', marginTop: 8, height: 42, fontSize: 13 }}
                onClick={() => showNotification('Payment link would open here', 'info')}>
                Pay {formatINR(card.currentBalance)} Now
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 2px 12px' }}>
          <div className="label-caps">Total Outstanding</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{formatINR(totalDue)}</div>
        </div>

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

      {editOpen && card && <CardEditSheet card={card} cards={cards} statement={stmt} onClose={() => setEditOpen(false)} />}
    </div>
  )
}
