import { useState } from 'react'
import { Briefcase, ChevronLeft, ChevronRight, Landmark, Lightbulb, PieChart, PiggyBank, Receipt, ShieldCheck, TrendingUp } from 'lucide-react'
import { useStore } from '../store'
import AdvisorySheet from '../components/AdvisorySheet'

// Everything about money in one place, in four groups: what comes in, what goes out, what grows, and what to learn from it.
function Row({ Icon, title, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
      <div className="stat-icon" style={{ width: 34, height: 34, background: 'var(--gold-bg)', color: 'var(--gold-dim)' }}><Icon size={18} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 1 }}>{sub}</div>}
      </div>
      <ChevronRight size={18} color="var(--txt3)" />
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="label-caps" style={{ margin: '0 4px 8px' }}>{title}</div>
      <div className="card rows" style={{ paddingTop: 4, paddingBottom: 4 }}>{children}</div>
    </div>
  )
}

export default function MoneyHub() {
  const { goBackTab, setActiveTab } = useStore()
  const [advisory, setAdvisory] = useState(false)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 10px' }}>
        <div onClick={goBackTab} style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} /></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Money</div><div style={{ fontSize: 12, color: 'var(--txt2)' }}>Income, bills, loans, savings and insights</div></div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 130px' }}>
        <Group title="Earn">
          <Row Icon={Briefcase} title="Salary" sub="Employers, payslips, tax and Form 16" onClick={() => setActiveTab('salary')} />
          <Row Icon={PiggyBank} title="Provident fund" sub="PF and pension split, yearly interest and passbook" onClick={() => setActiveTab('pf')} />
        </Group>
        <Group title="Pay">
          <Row Icon={Receipt} title="Bills" sub="Cards, electricity, mobile, broadband and gas" onClick={() => setActiveTab('bills')} />
          <Row Icon={Landmark} title="Debt & loans" sub="EMIs, loans and repayments" onClick={() => setActiveTab('debt')} />
          <Row Icon={ShieldCheck} title="Insurance" sub="Policies, premiums and due dates" onClick={() => setActiveTab('insurance')} />
        </Group>
        <Group title="Grow">
          <Row Icon={TrendingUp} title="Wealth" sub="Retirement, market and safe assets, and net worth" onClick={() => setActiveTab('wealth')} />
        </Group>
        <Group title="Insights">
          <Row Icon={PieChart} title="Charts" sub="Where your money went, month by month" onClick={() => setActiveTab('charts')} />
          <Row Icon={Lightbulb} title="Advisory" sub="Find hidden fees, interest and wallet-load or fuel charges" onClick={() => setAdvisory(true)} />
        </Group>
      </div>
      {advisory && <AdvisorySheet onClose={() => setAdvisory(false)} />}
    </div>
  )
}
