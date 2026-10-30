// "This merchant always goes in this category": remembered when you change a transaction's category and agree to apply it to the
// others. New SMS and statement lines for that merchant then use it too. Kept on this phone (and in the backup file).
export const RULES_KEY = 'finping_merchant_rules'

// the same shop reads differently on every statement ("SWIGGY INSTAMARTBANGALORE", "Swiggy Instamart Bengaluru"): compare letters only,
// and drop a trailing city
const CITY = /(bengaluru|bangalore|banglore|mumbai|navi mumbai|new delhi|delhi|chennai|gurgaon|gurugram|noida|hyderabad|pune|kolkata|kanchipuram|coimbatore|tiruvallur|ahmedabad|jaipur|in)$/
export const merchantKey = name => {
  let k = String(name || '').toLowerCase().replace(/[^a-z]/g, '')
  for (let i = 0; i < 2; i++) k = k.replace(CITY, '')
  return k.length >= 3 ? k : ''
}

const read = () => { try { return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(RULES_KEY)) || '{}') || {} } catch { return {} } }

export const ruleFor = merchant => { const k = merchantKey(merchant); return k ? (read()[k] || null) : null }

export function saveRule(merchant, category) {
  const k = merchantKey(merchant)
  if (!k || typeof localStorage === 'undefined') return
  localStorage.setItem(RULES_KEY, JSON.stringify({ ...read(), [k]: category }))
}
