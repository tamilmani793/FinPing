import { SubHeader } from '../components/UI'
import PoliciesView from '../components/PoliciesView'

// Insurance policies on a page of their own, like Debt & loans: add a policy, mark a premium paid, edit or delete.
export default function Insurance() {
  return (
    <div className="screen active" style={{ overflowY: 'auto', paddingBottom: 150 }}>
      <SubHeader title="Insurance" />
      <PoliciesView />
    </div>
  )
}
