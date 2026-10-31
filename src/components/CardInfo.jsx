// How a card's details (anything that is not a rule) are shown: forex, fees, how rewards reach the statement, how they are redeemed, offers.
// Used by the card's own Reward rules and by Customise > All card rules.

const words = k => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
const money = v => (typeof v === 'number' ? v.toLocaleString('en-IN') : v)

// any value as readable lines: text, numbers, lists and groups of those
export function Lines({ value, depth = 0 }) {
  if (value == null || value === '') return null
  if (Array.isArray(value)) {
    return <div>{value.map((v, i) => (typeof v === 'object' ? <div key={i} style={{ marginBottom: 6 }}><Lines value={v} depth={depth + 1} /></div> : <div key={i} style={{ display: 'flex', gap: 6 }}><span>•</span><span>{money(v)}</span></div>))}</div>
  }
  if (typeof value === 'object') {
    return (
      <div>
        {Object.entries(value).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
          <div key={k} style={{ marginBottom: 4 }}>
            {typeof v === 'object' ? <><div style={{ fontWeight: 700, fontSize: 12 }}>{words(k)}</div><div style={{ paddingLeft: depth ? 8 : 10 }}><Lines value={v} depth={depth + 1} /></div></> : <span><b style={{ fontWeight: 700 }}>{words(k)}:</b> {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : money(v)}</span>}
          </div>
        ))}
      </div>
    )
  }
  return <span>{money(value)}</span>
}

export function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="label-caps" style={{ color: 'var(--gold-dim)', marginBottom: 6 }}>{title}</div>
      <div className="card" style={{ fontSize: 12.5, lineHeight: 1.5, paddingTop: 10, paddingBottom: 10 }}>{children}</div>
    </div>
  )
}

const NOT_STATED = <span style={{ color: 'var(--txt2)' }}>Not stated in this card's terms</span>

// the forex markup, wherever the data keeps it
export const forexOf = info => {
  const f = info?.details?.forex
  if (f?.markupPercent != null) return { text: `${f.markupPercent}%`, note: [f.note, f.cashbackNote].filter(Boolean).join(' ') }
  const fee = info?.feesAndCharges?.forexMarkup
  return fee ? { text: String(fee), note: info.feesAndCharges.forexMarkupNote || '' } : null
}

// the fee to redeem rewards, wherever the data keeps it
export const redemptionFeeOf = info => {
  const f = info?.feesAndCharges || {}
  return f.rewardsRedemptionFee ?? f.catalogueRedemptionFee ?? f.redemptionFee ?? info?.redemption?.fee ?? null
}

// info: { postedOn, redemption, benefits, feesAndCharges, details }
export function CardInfoSections({ info }) {
  if (!info) return null
  const fx = forexOf(info)
  const fee = redemptionFeeOf(info)
  const { forexMarkup, forexMarkupNote, rewardsRedemptionFee, ...otherFees } = info.feesAndCharges || {}
  const { forex, ...otherDetails } = info.details || {}
  return (
    <>
      <Section title="Forex">
        {fx ? <><div><b>Markup:</b> {fx.text}</div>{fx.note && <div style={{ color: 'var(--txt2)', marginTop: 4 }}>{fx.note}</div>}</> : NOT_STATED}
        {forex?.earnsCashbackOnInternational === false && <div style={{ marginTop: 4 }}>International spends do not earn the card's regular rewards.</div>}
      </Section>
      <Section title="How rewards reach your statement">
        {info.postedOn ? <div>{info.postedOn}</div> : NOT_STATED}
      </Section>
      <Section title="Redeeming rewards">
        <div style={{ marginBottom: 6 }}><b>Redemption fee:</b> {fee != null && fee !== '' ? (typeof fee === 'number' ? '₹' + money(fee) : fee) : NOT_STATED}</div>
        {info.redemption ? <Lines value={info.redemption} /> : <div>{NOT_STATED}</div>}
      </Section>
      {Object.keys(otherFees).length > 0 && <Section title="Fees and charges"><Lines value={otherFees} /></Section>}
      {info.benefits?.length > 0 && <Section title="Benefits"><Lines value={info.benefits} /></Section>}
      {Object.keys(otherDetails).length > 0 && <Section title="Offers, lounges and eligibility"><Lines value={otherDetails} /></Section>}
    </>
  )
}
