import type { StoredAccount, StoredBranch, StoredCashflow, StoredOutlook, StoredPlan } from './model'

export type SourceKind = 'main' | 'override' | 'branch'

export interface EffectiveCashflow {
  segment: StoredCashflow
  source: SourceKind
  origin_id: number | null
}

export interface EffectiveOutlook {
  outlook: StoredOutlook
  source: SourceKind
  origin_id: number | null
}

export function getMainBranch(plan: StoredPlan): StoredBranch | null {
  return plan.branches.find((b) => b.is_main) ?? null
}

export function getBranchOrNone(plan: StoredPlan, branchId: number | null | undefined): StoredBranch | null {
  if (branchId == null) return getMainBranch(plan)
  return plan.branches.find((b) => b.id === branchId) ?? null
}

function mainItems<T extends { branch_id: number; origin_id: number | null }>(
  items: T[],
  mainId: number,
): T[] {
  return items.filter((item) => item.branch_id === mainId && item.origin_id == null)
}

function branchItems<T extends { branch_id: number }>(items: T[], branchId: number): T[] {
  return items.filter((item) => item.branch_id === branchId)
}

export function effectiveCashflows(
  account: StoredAccount,
  branch: StoredBranch,
  main: StoredBranch,
): EffectiveCashflow[] {
  const all = account.cashflows
  if (branch.is_main) {
    return mainItems(all, main.id)
      .filter((item) => !item.is_suppressed)
      .map((item) => ({ segment: item, source: 'main' as const, origin_id: null }))
  }

  const mains = mainItems(all, main.id)
  const rows = branchItems(all, branch.id)
  const suppressed = new Set(
    rows.filter((row) => row.is_suppressed && row.origin_id).map((row) => row.origin_id!),
  )
  const overrides = new Map(
    rows
      .filter((row) => row.origin_id && !row.is_suppressed)
      .map((row) => [row.origin_id!, row] as const),
  )
  const branchOnly = rows.filter((row) => row.origin_id == null && !row.is_suppressed)

  const result: EffectiveCashflow[] = []
  for (const item of mains) {
    if (suppressed.has(item.id)) continue
    const override = overrides.get(item.id)
    if (override) {
      result.push({ segment: override, source: 'override', origin_id: item.id })
    } else {
      result.push({ segment: item, source: 'main', origin_id: null })
    }
  }
  for (const item of branchOnly) {
    result.push({ segment: item, source: 'branch', origin_id: null })
  }
  return result
}

export function effectiveOutlooks(
  account: StoredAccount,
  branch: StoredBranch,
  main: StoredBranch,
): EffectiveOutlook[] {
  const all = account.outlooks
  if (branch.is_main) {
    return mainItems(all, main.id)
      .filter((item) => !item.is_suppressed)
      .map((item) => ({ outlook: item, source: 'main' as const, origin_id: null }))
  }

  const mains = mainItems(all, main.id)
  const rows = branchItems(all, branch.id)
  const suppressed = new Set(
    rows.filter((row) => row.is_suppressed && row.origin_id).map((row) => row.origin_id!),
  )
  const overrides = new Map(
    rows
      .filter((row) => row.origin_id && !row.is_suppressed)
      .map((row) => [row.origin_id!, row] as const),
  )
  const branchOnly = rows.filter((row) => row.origin_id == null && !row.is_suppressed)

  const result: EffectiveOutlook[] = []
  for (const item of mains) {
    if (suppressed.has(item.id)) continue
    const override = overrides.get(item.id)
    if (override) {
      result.push({ outlook: override, source: 'override', origin_id: item.id })
    } else {
      result.push({ outlook: item, source: 'main', origin_id: null })
    }
  }
  for (const item of branchOnly) {
    result.push({ outlook: item, source: 'branch', origin_id: null })
  }
  return result
}

export interface PlanViewAccount {
  id: number
  kind: StoredAccount['kind']
  name: string
  description: string | null
  start_balance: number
  start_date: string
  currency: string
  sort_order: number
  cashflows: StoredCashflow[]
  outlooks: StoredOutlook[]
}

export interface PlanView {
  id: number
  name: string
  target_date: string
  notes: string | null
  accounts: PlanViewAccount[]
}

export function applyBranchView(plan: StoredPlan, branch: StoredBranch): PlanView {
  const main = getMainBranch(plan)
  if (!main) {
    return {
      id: plan.id,
      name: plan.name,
      target_date: plan.target_date,
      notes: plan.notes,
      accounts: plan.accounts.map((account) => ({
        ...account,
        cashflows: [...account.cashflows],
        outlooks: [...account.outlooks],
      })),
    }
  }

  return {
    id: plan.id,
    name: plan.name,
    target_date: plan.target_date,
    notes: plan.notes,
    accounts: plan.accounts.map((account) => ({
      id: account.id,
      kind: account.kind,
      name: account.name,
      description: account.description,
      start_balance: account.start_balance,
      start_date: account.start_date,
      currency: account.currency,
      sort_order: account.sort_order,
      cashflows: effectiveCashflows(account, branch, main).map((item) => item.segment),
      outlooks: effectiveOutlooks(account, branch, main).map((item) => item.outlook),
    })),
  }
}

export function mergeBranchIntoMain(plan: StoredPlan, branch: StoredBranch): void {
  const main = getMainBranch(plan)
  if (!main) throw new Error('Main branch missing')
  if (branch.is_main) throw new Error('Cannot merge the main branch into itself')
  if (branch.plan_id !== plan.id) throw new Error('Branch does not belong to this plan')

  for (const account of plan.accounts) {
    const branchCashflows = account.cashflows.filter((row) => row.branch_id === branch.id)
    for (const row of [...branchCashflows]) {
      if (row.is_suppressed && row.origin_id) {
        account.cashflows = account.cashflows.filter(
          (c) => c.id !== row.id && !(c.id === row.origin_id && c.branch_id === main.id),
        )
      } else if (row.origin_id) {
        const origin = account.cashflows.find((c) => c.id === row.origin_id && c.branch_id === main.id)
        if (origin) {
          origin.amount = row.amount
          origin.tax_rate = row.tax_rate
          origin.frequency = row.frequency
          origin.interval_count = row.interval_count
          origin.start_date = row.start_date
          origin.end_date = row.end_date
          origin.mode = row.mode
          origin.description = row.description
        }
        account.cashflows = account.cashflows.filter((c) => c.id !== row.id)
      } else {
        row.branch_id = main.id
        row.origin_id = null
        row.is_suppressed = false
      }
    }

    const branchOutlooks = account.outlooks.filter((row) => row.branch_id === branch.id)
    for (const row of [...branchOutlooks]) {
      if (row.is_suppressed && row.origin_id) {
        account.outlooks = account.outlooks.filter(
          (o) => o.id !== row.id && !(o.id === row.origin_id && o.branch_id === main.id),
        )
      } else if (row.origin_id) {
        const origin = account.outlooks.find((o) => o.id === row.origin_id && o.branch_id === main.id)
        if (origin) {
          origin.outlook_type = row.outlook_type
          origin.rate_annual = row.rate_annual
          origin.target_amount = row.target_amount
          origin.effective_date = row.effective_date
          origin.description = row.description
        }
        account.outlooks = account.outlooks.filter((o) => o.id !== row.id)
      } else {
        row.branch_id = main.id
        row.origin_id = null
        row.is_suppressed = false
      }
    }
  }
}
