export type PlanAccountKind = 'savings' | 'asset' | 'pre_tax' | 'expense'
export type CashflowFrequency =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom'
export type CashflowMode = 'base' | 'overlay'
export type ValueOutlookType = 'growth_rate' | 'target_value'

export interface PlanBranch {
  id: number
  plan_id: number
  name: string
  is_main: boolean
  created_at: string
  updated_at: string
}

export interface CashflowSegment {
  id: number
  account_id: number
  branch_id: number
  origin_id: number | null
  is_suppressed: boolean
  source: 'main' | 'override' | 'branch'
  amount: string | number
  tax_rate: string | number
  frequency: CashflowFrequency
  interval_count: number
  start_date: string
  end_date: string | null
  mode: CashflowMode
  description: string | null
  created_at: string
  updated_at: string
}

export interface CashflowSegmentCreate {
  /** May be a string while the user is typing (e.g. "-" or "-30"). */
  amount: number | string
  tax_rate?: number
  frequency?: CashflowFrequency
  interval_count?: number
  start_date: string
  end_date?: string | null
  mode?: CashflowMode
  description?: string | null
}

export interface ValueOutlook {
  id: number
  account_id: number
  branch_id: number
  origin_id: number | null
  is_suppressed: boolean
  source: 'main' | 'override' | 'branch'
  outlook_type: ValueOutlookType
  rate_annual: string | number | null
  target_amount: string | number | null
  effective_date: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface ValueOutlookCreate {
  outlook_type: ValueOutlookType
  rate_annual?: number | null
  target_amount?: number | null
  effective_date: string
  description?: string | null
}

export interface PlanAccount {
  id: number
  plan_id: number
  kind: PlanAccountKind
  name: string
  description: string | null
  start_balance: string | number
  start_date: string
  currency: string
  sort_order: number
  cashflows: CashflowSegment[]
  outlooks: ValueOutlook[]
  created_at: string
  updated_at: string
}

export interface PlanAccountCreate {
  kind?: PlanAccountKind
  name: string
  description?: string | null
  start_balance?: number
  start_date: string
  currency?: string
  sort_order?: number
}

export interface SavingsPlanSummary {
  id: number
  name: string
  target_date: string
  notes: string | null
  account_count: number
  branch_count: number
  created_at: string
  updated_at: string
}

export interface SavingsPlan {
  id: number
  name: string
  target_date: string
  notes: string | null
  accounts: PlanAccount[]
  branches: PlanBranch[]
  active_branch_id: number | null
  created_at: string
  updated_at: string
}

export interface SavingsPlanCreate {
  name: string
  target_date: string
  notes?: string | null
}

export interface AccountProjection {
  account_id: number
  name: string
  kind: PlanAccountKind
  start_balance: string | number
  end_balance: string | number
  total_cashflows: string | number
  is_expense: boolean
}

export type JournalEventType = 'opening' | 'cashflow' | 'growth' | 'target_value'

export interface JournalEvent {
  type: JournalEventType
  label: string
  amount: string | number
  balance_after: string | number
  cashflow_id?: number | null
  outlook_id?: number | null
  rate_annual?: string | number | null
  tax_rate?: string | number | null
}

export interface AccountJournalMonth {
  month: string
  events: JournalEvent[]
}

export interface AccountJournal {
  account_id: number
  name: string
  months: AccountJournalMonth[]
}

export interface MonthlyAccountBalance {
  account_id: number
  balance: string | number
}

export interface MonthlySnapshot {
  month: string
  total_assets: string | number
  total_expenses: string | number
  net: string | number
  accounts: MonthlyAccountBalance[]
}

export interface PlanProjection {
  plan_id: number
  branch_id: number | null
  branch_name: string | null
  target_date: string
  as_of_month: string
  total_assets: string | number
  total_expenses: string | number
  net: string | number
  accounts: AccountProjection[]
  timeline: MonthlySnapshot[]
  journal?: AccountJournal[]
}

export interface AccountProjectionDelta {
  account_id: number
  name: string
  kind: PlanAccountKind
  base_end_balance: string | number
  branch_end_balance: string | number
  delta: string | number
}

export interface PlanCompare {
  plan_id: number
  base: PlanProjection
  branch: PlanProjection
  net_delta: string | number
  accounts: AccountProjectionDelta[]
}

export interface BranchNetSummary {
  branch_id: number
  name: string
  is_main: boolean
  net: string | number
  delta_vs_main: string | number
}

export interface BranchNetList {
  plan_id: number
  branches: BranchNetSummary[]
}
