// Credit cards sold in India, by issuer. "Name|Partner" marks a co-branded / third-party card.
// This is a starting list for the card-name dropdown; anything missing can be typed in by hand.
export const INDIAN_CARDS = [
  { bank: 'HDFC Bank', brand: 'HDFC', cards: [
    'Infinia', 'Diners Club Black', 'Diners Club Privilege', 'Regalia Gold', 'Regalia', 'Millennia', 'MoneyBack+', 'Freedom',
    'Pixel Play', 'Pixel Go', 'Tata Neu Infinity|Tata Neu', 'Tata Neu Plus|Tata Neu', 'Swiggy|Swiggy', 'IndianOil|IndianOil',
    'Shoppers Stop|Shoppers Stop', 'Marriott Bonvoy|Marriott', 'Harley-Davidson Diners Club', 'Paytm|Paytm', 'RuPay Credit Card',
    'Bharat', 'Platinum Times', 'Titanium Times', 'Business Regalia', 'Business MoneyBack', 'Biz Black', 'Biz Power', 'Diners ClubMiles',
    "Doctor's Regalia", 'Teachers Platinum',
  ] },
  { bank: 'ICICI Bank', brand: 'ICICI', cards: [
    'Amazon Pay|Amazon Pay', 'Sapphiro', 'Rubyx', 'Coral', 'Emeralde Private Metal', 'Platinum Chip', 'HPCL Super Saver|HPCL', 'MakeMyTrip Signature|MakeMyTrip',
    'MakeMyTrip Platinum|MakeMyTrip', 'Adani One Signature|Adani One', 'Manchester United', 'Times Black', 'Instant Platinum', 'Expressions', 'Parakram', 'Ferrari',
  ] },
  { bank: 'State Bank of India', brand: 'SBI', cards: [
    'Cashback', 'SimplyCLICK', 'SimplySAVE', 'Elite', 'Prime', 'Pulse', 'Aurum', 'BPCL|BPCL', 'BPCL Octane|BPCL', 'IRCTC|IRCTC',
    'Air India Signature|Air India', 'Air India Platinum|Air India', 'Club Vistara|Vistara', 'Reliance|Reliance', 'Titan|Titan', 'Apollo|Apollo',
    'Fabindia|Fabindia', 'Paytm|Paytm', 'Paytm Select|Paytm', 'PhonePe Purple|PhonePe', 'PhonePe Black|PhonePe', 'Yatra|Yatra', 'Lifestyle Home Centre|Lifestyle',
    'Miles Elite', 'Miles Prime', "Doctor's", 'Unnati', 'KrisFlyer|Singapore Airlines', 'Etihad Guest|Etihad', 'ORIGIN',
  ] },
  { bank: 'HSBC', brand: 'HSBC', cards: ['Premier', 'Live+', 'Cashback', 'Travel One', 'Platinum', 'Smart Value', 'Visa Platinum', 'Taj|Taj'] },
  { bank: 'Axis Bank', brand: 'Axis', cards: [
    'Magnus', 'Magnus for Burgundy', 'Atlas', 'Reserve', 'Flipkart|Flipkart', 'Ace', 'Airtel|Airtel', 'Neo', 'Select', 'Privilege', 'My Zone', 'Buzz',
    'Freecharge|Freecharge', 'Pride', 'Signature', 'Platinum', 'Miles & More', 'IndianOil|IndianOil', 'Samsung Signature|Samsung', 'Samsung Infinite|Samsung',
    'IndiGo|IndiGo', 'SpiceJet Voyage|SpiceJet', 'Vistara|Vistara', 'Horizon', 'LIC|LIC', 'Rewards', 'Privilege Easy',
  ] },
  { bank: 'Slice', brand: '', cards: ['Slice Super Card', 'Slice Credit Card'] },
  { bank: 'Kotak Bank', brand: 'Kotak', cards: ['811 #DreamDifferent', 'League Platinum', 'Royale Signature', 'Zen Signature', 'Myntra|Myntra', 'Mojo Platinum', 'PVR INOX|PVR INOX', 'White Reserve', 'Privy League', 'Solitaire', 'Essentia Platinum', 'Urbane Platinum'] },
  { bank: 'IDFC First Bank', brand: 'IDFC FIRST', cards: ['Wealth', 'Select', 'Classic', 'Millennia', 'Ashva', 'Mayura', 'WOW!', 'Club Vistara|Vistara', 'Power|Power', 'Hello Cashback'] },
  { bank: 'Yes Bank', brand: 'YES', cards: ['Reserv', 'Marquee', 'Prosperity Rewards Plus', 'Paisasave|Paisabazaar', 'Ace', 'Select', 'First Preferred', 'Wellness Plus', 'FIRST Exclusive', 'BYOC'] },
  { bank: 'IndusInd Bank', brand: 'IndusInd', cards: ['Legend', 'Iconia', 'Pinnacle', 'Platinum Aura Edge', 'Tiger', 'EazyDiner|EazyDiner', 'Celesta', 'Indulge', 'Avios|Avios', 'Nexxt', 'RuPay Platinum'] },
  { bank: 'RBL Bank', brand: 'RBL', cards: ['Shoprite', 'Platinum Maxima', 'Bajaj Finserv SuperCard|Bajaj Finserv', 'Play', 'Edition', 'Insignia', 'Icon', 'Fun+', 'Cookies', 'Titanium Delight', 'IRCTC|IRCTC', 'Paisabazaar|Paisabazaar'] },
  { bank: 'AU Small Finance Bank', brand: 'AU', cards: ['LIT', 'Altura', 'Altura Plus', 'Zenith', 'Zenith+', 'Vetta', 'Ixigo|ixigo', 'SwipeUp', 'Royale'] },
  { bank: 'Standard Chartered', brand: 'Standard Chartered', cards: ['Ultimate', 'Smart', 'Platinum Rewards', 'Manhattan', 'EaseMyTrip|EaseMyTrip', 'Super Value Titanium', 'Priority Visa Infinite', 'DigiSmart', 'Beyond'] },
  { bank: 'American Express', brand: 'Amex', cards: ['Platinum Charge', 'Platinum Travel', 'Platinum Reserve', 'Gold Charge', 'SmartEarn', 'Membership Rewards', 'Centurion'] },
  { bank: 'Federal Bank', brand: 'Federal', cards: ['Signet', 'Celesta', 'Imperio', 'Wishes', 'Scapia|Scapia', 'OneCard|OneCard', 'Edge|Jupiter'] },
  { bank: 'Bank of Baroda', brand: 'BOB', cards: ['Eterna', 'Premier', 'Easy', 'Select', 'Varunah', 'Snapdeal|Snapdeal', 'Easy Shopping'] },
  { bank: 'PNB', brand: 'PNB', cards: ['Platinum', 'Select', 'Millennium', 'Rakshak', 'Global'] },
  { bank: 'Canara Bank', brand: 'Canara', cards: ['Platinum', 'Select', 'Classic', 'Titanium'] },
  { bank: 'Union Bank', brand: 'Union', cards: ['Platinum', 'Select', 'Classic', 'Gold'] },
  { bank: 'IDBI Bank', brand: 'IDBI', cards: ['Royale', 'Euphoria', 'Winnings', 'Imperium'] },
  { bank: 'Citi (now Axis)', brand: 'Citi', cards: ['Prestige', 'Premier Miles', 'Rewards', 'Cash Back', 'IndianOil|IndianOil', 'Simplicity'] },
  { bank: 'Fintech / others', brand: '', cards: ['OneCard|OneCard', 'Jupiter Edge|Jupiter', 'Uni Pay 1/3|Uni', 'KIWI|KIWI', 'Scapia|Scapia', 'Tata Neu|Tata Neu', 'LazyPay|LazyPay'] },
]

export const CARD_BANKS = INDIAN_CARDS.map(b => b.bank)

// "Swiggy|Swiggy" under HDFC -> { key, bank: 'HDFC Bank', label: 'HDFC Swiggy', partner: 'Swiggy' }
export function catalogEntries() {
  const out = []
  for (const b of INDIAN_CARDS) {
    for (const raw of b.cards) {
      const [name, partner = ''] = raw.split('|')
      const label = !b.brand || name.toLowerCase().startsWith(b.brand.toLowerCase()) ? name : `${b.brand} ${name}`
      out.push({ key: `${b.bank}::${raw}`, bank: b.bank, label, partner })
    }
  }
  return out
}

// The catalogue entry a saved card matches, if any (so the dropdown can show it as selected).
export const findCatalogKey = card => catalogEntries().find(e => e.bank === card?.bank && e.label === card?.name)?.key || ''
