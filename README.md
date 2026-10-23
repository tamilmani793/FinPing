# FinPing — Personal Finance PWA

A complete, production-ready mobile-first PWA for Indian personal finance. SMS-driven expense tracking, credit card reward & cap management, debt telemetry, and investment tracking — 100% on-device, no backend.

---

## Quick Start

```bash
npm install
npm run dev        # Dev server at http://localhost:5173
npm run build      # Production build
npm run preview    # Preview production build
```

---

## Project Structure

```
src/
├── db/
│   └── schema.js          # Dexie.js IndexedDB schema + seed data
├── lib/
│   ├── smsParser.js       # SMS parser engine (15+ Indian bank patterns)
│   ├── smsParser.test.js  # 7 unit tests for parser
│   └── rewardEngine.js    # Reward & cap calculation engine
├── store/
│   └── index.js           # Zustand global state
├── components/
│   ├── UI.jsx             # Shared UI components
│   └── BottomNav.jsx      # 5-tab navigation
├── screens/
│   ├── Dashboard.jsx      # Home: telemetry, spend allocation, live feeds
│   ├── Cards.jsx          # Credit cards: caps, statements, rewards, analysis
│   ├── Expenses.jsx       # Expenses: category accordion, SMS paste, manual add
│   ├── Debt.jsx           # Debt: EMI tracker, repayment ledger, snowball
│   └── Wealth.jsx         # Investments: SIP tracker, asset allocation
├── App.jsx
└── main.jsx
```

---

## Pre-configured Cards

All 4 of your cards are seeded with exact reward rules:

| Card | Type | Key Rate | Monthly Cap |
|------|------|----------|-------------|
| HDFC Millennia | LTF | 5% on 10 partners | ₹1,000 pts |
| SBI Cashback | Paid ₹999+GST | 5% online | ₹2,000 (post Apr-2026) |
| Swiggy HDFC (Old) | Paid ₹500+GST | 10% Swiggy / 5% Cleartrip | ₹1,500 shared |
| HDFC Pixel Play RuPay | LTF [confirm] | 5% packs / 1% UPI | 500 pts/pack |

---

## SMS Ingestion

**Method A — Share Target (Android)**
1. Install PWA to home screen
2. Open any bank SMS in your SMS app
3. Tap Share → Select "FinPing"
4. Review parsed fields → Confirm

**Method B — Paste SMS**
1. Go to Expenses tab
2. Tap "Paste SMS"
3. Paste the raw SMS text
4. Review parsed preview → Confirm & Save

**Method C — Manual Entry**
Use the "+ Add Manually" button on any screen.

---

## SMS Parser — Supported Patterns

- **Debit transactions**: HDFC, SBI, ICICI, Axis, Kotak, Yes Bank, IDFC, AU, IndusInd, PNB, BOB, Canara
- **Credit/Cashback**: Cashback credits, refunds, reward points
- **Statements**: Bill generated, total due, minimum due, due date
- **Payments received**: Payment confirmation, balance update
- **EMI/Loans**: EMI deduction, outstanding balance
- **Investments**: MF SIP confirmations, FD creation/maturity

Run parser tests:
```bash
node --input-type=module src/lib/smsParser.test.js
```

---

## PWA Features

- ✅ Installable on Android & iOS
- ✅ Fully offline after first load (Workbox cache)
- ✅ Share Target for SMS forwarding (Android)
- ✅ 100% on-device — no server, no API calls
- ✅ IndexedDB persistence (Dexie.js)

---

## Confirm Before Using

| Item | Action |
|------|--------|
| HDFC Pixel Play RuPay LTF status | Check if fee applies post-May 2026 |
| Pixel Play brand packs | Update merchant targets in db/schema.js → card 4 rewardRules |
| Swiggy ₹249 min threshold | Verify in latest HDFC MITC |
| SBI exclusion categories | Confirm Govt/Tax exclusions from Apr-2026 |

---

## Design System — Obsidian Ledger

- **Canvas**: `#090A0F` OLED obsidian
- **Cards**: `#12141C` with `rgba(255,255,255,0.07)` hairline borders
- **Primary**: `#10B981` Emerald Mint (positive flow, confirmations)
- **Secondary**: `#6366F1` Royal Indigo (credit, SMS, active cards)
- **Warning**: `#F59E0B` Amber (due dates, fee cliffs, 70%+ cap usage)
- **Error**: `#EF4444` Crimson (overdue, excluded, budget overruns)
- **Type**: Geist (UI) + JetBrains Mono (amounts, timestamps, SMS)
