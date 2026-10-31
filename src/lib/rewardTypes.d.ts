// TypeScript interfaces for the rewards engine. The app itself is plain JavaScript (JSX); the same shapes are described with JSDoc in
// rewardRules.js, and this file is the reference for anyone who adds types later. Nothing here is sent anywhere: all of it is
// stored in the phone's IndexedDB.

export type RewardType = 'cashback' | 'points'
export type Rounding = 'floor' | 'round' | 'ceil'

/** "value earned for every `per` rupees". 1% cashback = { value: 1, per: 100 }; 2 points per ₹150 = { value: 2, per: 150, blockBased: true } */
export interface RewardRate {
  value: number
  per: number
  /** true: only complete blocks count (₹299 at 2 per ₹150 earns 2, not 3). false: earns in proportion (cashback percentages). */
  blockBased?: boolean
}

/** What a rule applies to. A transaction matches when ANY list matches. */
export interface RuleMatch {
  /** Merchant category codes, e.g. 5411 */
  mccs?: number[]
  /** FinPing categories, e.g. 'Grocery' */
  categories?: string[]
  /** Words to look for in the merchant name / bank narration, e.g. 'amazon' */
  merchants?: string[]
  /** 'online' or 'offline': the rule only applies to spends of that kind (SBI Cashback pays 5% online). With no other list it needs nothing else. */
  channel?: 'online' | 'offline'
}

export interface AcceleratedRule extends RuleMatch {
  id: string
  label: string
  rate: RewardRate
  /** Smallest single spend that earns this rate (otherwise the base rate applies) */
  minSpend?: number
  /** Most this rule can pay in one billing cycle, in rupees or points */
  capPerCycle?: number | null
}

export interface CardRewardRules {
  id?: number
  cardId: number
  enabled: boolean
  rewardType: RewardType
  base: RewardRate
  /** A single spend below this earns nothing */
  minSpend: number
  /** Most the whole card can pay in one billing cycle */
  capPerCycle: number | null
  rounding: Rounding
  accelerated: AcceleratedRule[]
  exclusions: RuleMatch
  updatedAt?: Date
}

export interface MccEntry {
  /** The 4-digit merchant category code (primary key) */
  code: number
  name: string
  /** The FinPing category this code maps to (the built-in guess, or your own mapping) */
  category: string
  /** true once you changed the category yourself */
  custom?: boolean
  /** the built-in category, kept so a change can be undone */
  defaultCategory?: string
}

export interface ExpectedReward {
  amount: number
  type: RewardType
  rule: { id: string; label: string; kind: 'base' | 'accelerated' | 'excluded' | 'minSpend' | 'none' }
  /** accelerated rate divided by the base rate (1 for the base rate) */
  multiplier: number
  capped: boolean
  reason?: string
  /** the billing cycle the transaction falls in, 'yyyy-MM-dd' of its statement date */
  cycleKey?: string
}

export interface CycleTotals {
  /** reward already earned in this billing cycle by earlier transactions */
  earned: number
  /** the same, per accelerated rule id */
  byRule: Record<string, number>
}

export type CalculateExpectedReward = (
  transaction: { amount: number; type: 'debit' | 'credit'; category?: string; mcc?: number | string; merchant?: string; bankNarration?: string },
  cardRules: CardRewardRules | null | undefined,
  currentCycleTotal?: CycleTotals,
  mccMap?: Record<string, MccEntry>,
) => ExpectedReward

/** Stored per card per billing cycle when a statement is imported */
export interface RewardStatement {
  id?: number
  cardId: number
  /** statement date 'yyyy-MM-dd' */
  cycleKey: string
  /** rewards the bank says were earned in the cycle (points), when the statement says so */
  earned: number | null
  opening: number | null
  closing: number | null
  addedAt: Date
}

/**
 * One card in the bundled rules pack (src/data/cardRewardPresets.json). Only `rules` is used by the engine; the rest is the card's
 * published details, kept next to the rules so they travel together and can be shown or checked later.
 */
export interface PackCard {
  key: string
  name: string
  issuer: string
  network?: string | null
  /** lowercase words of the card's name; the card matches when its bank is `issuer` and its name has one of them */
  match?: string[]
  rewardType: RewardType
  effectiveFrom: string | null
  publishedOn: string | null
  source: string
  rules: Omit<CardRewardRules, 'id' | 'cardId' | 'enabled'> & { capPeriod?: 'billingCycle' | 'calendarMonth'; baseCap?: number | null; spendBlock?: number; pointValue?: number | null }
  /** fees: joining, annual, waiver, finance charge, late fee, forex markup, cash advance... */
  feesAndCharges?: Record<string, string | number>
  details?: {
    bestFor?: string[]
    /** international spends: markup, and whether they still earn cashback */
    forex?: { markupPercent: number; note?: string; earnsCashbackOnInternational?: boolean; cashbackNote?: string }
    welcome?: { name: string; value: number; unit: string; condition: string; limitedTime?: boolean }[]
    lounge?: { domesticPerYear?: number; domesticRule?: string; internationalPerYear?: number; internationalRule?: string }
    eligibility?: { age?: Record<string, string>; minAnnualIncomeINR?: Record<string, number>; resident?: string; cities?: string[] }
    [more: string]: unknown
  }
}
