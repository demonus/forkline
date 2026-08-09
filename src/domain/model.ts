import type {
  CashflowFrequency,
  CashflowMode,
  PlanAccountKind,
  ValueOutlookType,
} from '../api/types'

/** Raw stored cashflow row (no derived `source`). */
export interface StoredCashflow {
  id: number
  account_id: number
  branch_id: number
  origin_id: number | null
  is_suppressed: boolean
  amount: number
  tax_rate: number
  frequency: CashflowFrequency
  interval_count: number
  start_date: string
  end_date: string | null
  mode: CashflowMode
  description: string | null
  created_at: string
  updated_at: string
}

export interface StoredOutlook {
  id: number
  account_id: number
  branch_id: number
  origin_id: number | null
  is_suppressed: boolean
  outlook_type: ValueOutlookType
  rate_annual: number | null
  target_amount: number | null
  effective_date: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface StoredBranch {
  id: number
  plan_id: number
  name: string
  is_main: boolean
  created_at: string
  updated_at: string
}

export interface StoredAccount {
  id: number
  plan_id: number
  kind: PlanAccountKind
  name: string
  description: string | null
  start_balance: number
  start_date: string
  currency: string
  sort_order: number
  cashflows: StoredCashflow[]
  outlooks: StoredOutlook[]
  created_at: string
  updated_at: string
}

export interface StoredPlan {
  id: number
  name: string
  target_date: string
  notes: string | null
  branches: StoredBranch[]
  accounts: StoredAccount[]
  created_at: string
  updated_at: string
}

export interface ForklineDocument {
  schemaVersion: 1
  plans: StoredPlan[]
  nextIds: {
    plan: number
    branch: number
    account: number
    cashflow: number
    outlook: number
  }
}

export const SCHEMA_VERSION = 1 as const

export function emptyDocument(): ForklineDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    plans: [],
    nextIds: { plan: 1, branch: 1, account: 1, cashflow: 1, outlook: 1 },
  }
}
