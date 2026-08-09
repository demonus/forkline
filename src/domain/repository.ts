import type {
  AccountProjectionDelta,
  BranchNetList,
  CashflowSegment,
  CashflowSegmentCreate,
  PlanAccount,
  PlanAccountCreate,
  PlanBranch,
  PlanCompare,
  PlanProjection,
  SavingsPlan,
  SavingsPlanCreate,
  SavingsPlanSummary,
  ValueOutlook,
  ValueOutlookCreate,
} from '../api/types'
import {
  applyBranchView,
  effectiveCashflows,
  effectiveOutlooks,
  getBranchOrNone,
  getMainBranch,
  mergeBranchIntoMain,
} from './branches'
import { nowISO, todayISODate } from './dates'
import {
  emptyDocument,
  SCHEMA_VERSION,
  type ForklineDocument,
  type StoredAccount,
  type StoredBranch,
  type StoredCashflow,
  type StoredOutlook,
  type StoredPlan,
} from './model'
import { num, q } from './money'
import { projectPlan } from './projection'

const STORAGE_KEY = 'forkline.document.v1'

function cloneDoc(doc: ForklineDocument): ForklineDocument {
  return structuredClone(doc)
}

function loadDocument(): ForklineDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDocument()
    const parsed = JSON.parse(raw) as ForklineDocument
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.plans)) {
      return emptyDocument()
    }
    if (!parsed.nextIds) {
      parsed.nextIds = { plan: 1, branch: 1, account: 1, cashflow: 1, outlook: 1 }
    }
    return parsed
  } catch {
    return emptyDocument()
  }
}

function saveDocument(doc: ForklineDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
}

function touch(plan: StoredPlan): void {
  plan.updated_at = nowISO()
}

function ensureMainBranch(plan: StoredPlan, allocateId: () => number): StoredBranch {
  const main = getMainBranch(plan)
  if (main) return main
  const created: StoredBranch = {
    id: allocateId(),
    plan_id: plan.id,
    name: 'Main',
    is_main: true,
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  plan.branches.push(created)
  return created
}

function getPlanOrThrow(doc: ForklineDocument, planId: number): StoredPlan {
  const plan = doc.plans.find((p) => p.id === planId)
  if (!plan) throw new Error('Plan not found')
  ensureMainBranch(plan, () => doc.nextIds.branch++)
  return plan
}

function resolveBranch(plan: StoredPlan, branchId?: number | null): StoredBranch {
  const branch = getBranchOrNone(plan, branchId)
  if (!branch) throw new Error('Branch not found')
  return branch
}

function getAccountOrThrow(plan: StoredPlan, accountId: number): StoredAccount {
  const account = plan.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('Account not found')
  return account
}

function serializeCashflow(
  item: StoredCashflow,
  source: 'main' | 'override' | 'branch',
  originId: number | null = null,
): CashflowSegment {
  return {
    id: item.id,
    account_id: item.account_id,
    branch_id: item.branch_id,
    origin_id: originId ?? item.origin_id,
    is_suppressed: item.is_suppressed,
    source,
    amount: item.amount,
    tax_rate: item.tax_rate,
    frequency: item.frequency,
    interval_count: item.interval_count,
    start_date: item.start_date,
    end_date: item.end_date,
    mode: item.mode,
    description: item.description,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

function serializeOutlook(
  item: StoredOutlook,
  source: 'main' | 'override' | 'branch',
  originId: number | null = null,
): ValueOutlook {
  return {
    id: item.id,
    account_id: item.account_id,
    branch_id: item.branch_id,
    origin_id: originId ?? item.origin_id,
    is_suppressed: item.is_suppressed,
    source,
    outlook_type: item.outlook_type,
    rate_annual: item.rate_annual,
    target_amount: item.target_amount,
    effective_date: item.effective_date,
    description: item.description,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

function serializePlan(plan: StoredPlan, branch: StoredBranch): SavingsPlan {
  const main = getMainBranch(plan) || branch
  const accounts: PlanAccount[] = plan.accounts
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((account) => ({
      id: account.id,
      plan_id: account.plan_id,
      kind: account.kind,
      name: account.name,
      description: account.description,
      start_balance: account.start_balance,
      start_date: account.start_date,
      currency: account.currency,
      sort_order: account.sort_order,
      cashflows: effectiveCashflows(account, branch, main).map((item) =>
        serializeCashflow(item.segment, item.source, item.origin_id),
      ),
      outlooks: effectiveOutlooks(account, branch, main).map((item) =>
        serializeOutlook(item.outlook, item.source, item.origin_id),
      ),
      created_at: account.created_at,
      updated_at: account.updated_at,
    }))

  return {
    id: plan.id,
    name: plan.name,
    target_date: plan.target_date,
    notes: plan.notes,
    accounts,
    branches: plan.branches.map((b) => ({ ...b })),
    active_branch_id: branch.id,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  }
}

function project(
  plan: StoredPlan,
  branch: StoredBranch,
  includeTimeline: boolean,
  includeJournal = false,
): PlanProjection {
  const viewed = applyBranchView(plan, branch)
  const result = projectPlan(viewed, { includeTimeline, includeJournal })
  result.branch_id = branch.id
  result.branch_name = branch.name
  return result
}

function normalizeCashflowInput(data: CashflowSegmentCreate): Omit<
  StoredCashflow,
  'id' | 'account_id' | 'branch_id' | 'origin_id' | 'is_suppressed' | 'created_at' | 'updated_at'
> {
  const amount = num(data.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('Enter a non-zero cashflow amount (negative for withdrawals).')
  }
  return {
    amount,
    tax_rate: data.tax_rate ?? 0,
    frequency: data.frequency ?? 'monthly',
    interval_count: data.interval_count ?? 1,
    start_date: data.start_date,
    end_date: data.end_date ?? null,
    mode: data.mode ?? 'base',
    description: data.description ?? null,
  }
}

function normalizeOutlookInput(data: ValueOutlookCreate): Omit<
  StoredOutlook,
  'id' | 'account_id' | 'branch_id' | 'origin_id' | 'is_suppressed' | 'created_at' | 'updated_at'
> {
  if (data.outlook_type === 'growth_rate' && data.rate_annual == null) {
    throw new Error('rate_annual is required for growth_rate outlooks')
  }
  if (data.outlook_type === 'target_value' && data.target_amount == null) {
    throw new Error('target_amount is required for target_value outlooks')
  }
  return {
    outlook_type: data.outlook_type,
    rate_annual: data.outlook_type === 'growth_rate' ? (data.rate_annual ?? 0) : null,
    target_amount: data.outlook_type === 'target_value' ? (data.target_amount ?? 0) : null,
    effective_date: data.effective_date,
    description: data.description ?? null,
  }
}

function withDoc<T>(fn: (doc: ForklineDocument) => T): Promise<T> {
  const doc = cloneDoc(loadDocument())
  const result = fn(doc)
  saveDocument(doc)
  return Promise.resolve(result)
}

export function fetchSavingsPlans(): Promise<SavingsPlanSummary[]> {
  const doc = loadDocument()
  const summaries = doc.plans
    .slice()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((plan) => {
      ensureMainBranch(plan, () => doc.nextIds.branch++)
      return {
        id: plan.id,
        name: plan.name,
        target_date: plan.target_date,
        notes: plan.notes,
        account_count: plan.accounts.length,
        branch_count: plan.branches.length,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      }
    })
  saveDocument(doc)
  return Promise.resolve(summaries)
}

export function fetchSavingsPlan(id: number, branchId?: number | null): Promise<SavingsPlan> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, id)
    const branch = resolveBranch(plan, branchId)
    return serializePlan(plan, branch)
  })
}

export function createSavingsPlan(data: SavingsPlanCreate): Promise<SavingsPlan> {
  return withDoc((doc) => {
    const now = nowISO()
    const planId = doc.nextIds.plan++
    const branchId = doc.nextIds.branch++
    const plan: StoredPlan = {
      id: planId,
      name: data.name.trim(),
      target_date: data.target_date,
      notes: data.notes ?? null,
      branches: [
        {
          id: branchId,
          plan_id: planId,
          name: 'Main',
          is_main: true,
          created_at: now,
          updated_at: now,
        },
      ],
      accounts: [],
      created_at: now,
      updated_at: now,
    }
    doc.plans.push(plan)
    return serializePlan(plan, plan.branches[0])
  })
}

export function updateSavingsPlan(
  id: number,
  data: Partial<SavingsPlanCreate>,
  branchId?: number | null,
): Promise<SavingsPlan> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, id)
    if (data.name != null) plan.name = data.name.trim()
    if (data.target_date != null) plan.target_date = data.target_date
    if (data.notes !== undefined) plan.notes = data.notes ?? null
    touch(plan)
    const branch = resolveBranch(plan, branchId)
    return serializePlan(plan, branch)
  })
}

export function deleteSavingsPlan(id: number): Promise<void> {
  return withDoc((doc) => {
    doc.plans = doc.plans.filter((p) => p.id !== id)
  })
}

export function createPlanBranch(planId: number, name: string): Promise<PlanBranch> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Name required')
    if (trimmed.toLowerCase() === 'main') throw new Error("Name 'Main' is reserved")
    if (plan.branches.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A branch with this name already exists')
    }
    const now = nowISO()
    const branch: StoredBranch = {
      id: doc.nextIds.branch++,
      plan_id: planId,
      name: trimmed,
      is_main: false,
      created_at: now,
      updated_at: now,
    }
    plan.branches.push(branch)
    touch(plan)
    return { ...branch }
  })
}

export function updatePlanBranch(planId: number, branchId: number, name: string): Promise<PlanBranch> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (branch.is_main) throw new Error('Cannot rename the main branch')
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Name required')
    if (trimmed.toLowerCase() === 'main') throw new Error("Name 'Main' is reserved")
    if (
      plan.branches.some(
        (b) => b.id !== branchId && b.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      throw new Error('A branch with this name already exists')
    }
    branch.name = trimmed
    branch.updated_at = nowISO()
    touch(plan)
    return { ...branch }
  })
}

export function deletePlanBranch(planId: number, branchId: number): Promise<void> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (branch.is_main) throw new Error('Cannot delete the main branch')
    for (const account of plan.accounts) {
      account.cashflows = account.cashflows.filter((c) => c.branch_id !== branchId)
      account.outlooks = account.outlooks.filter((o) => o.branch_id !== branchId)
    }
    plan.branches = plan.branches.filter((b) => b.id !== branchId)
    touch(plan)
  })
}

export function mergePlanBranch(planId: number, branchId: number): Promise<SavingsPlan> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    mergeBranchIntoMain(plan, branch)
    touch(plan)
    const main = getMainBranch(plan)!
    return serializePlan(plan, main)
  })
}

export function fetchPlanProjection(
  id: number,
  branchId?: number | null,
  includeTimeline = true,
  includeJournal = false,
): Promise<PlanProjection> {
  const doc = loadDocument()
  const plan = getPlanOrThrow(doc, id)
  const branch = resolveBranch(plan, branchId)
  saveDocument(doc)
  return Promise.resolve(project(plan, branch, includeTimeline, includeJournal))
}

export function fetchBranchNets(planId: number): Promise<BranchNetList> {
  const doc = loadDocument()
  const plan = getPlanOrThrow(doc, planId)
  const main = getMainBranch(plan)
  if (!main) throw new Error('Main branch missing')
  const mainProj = project(plan, main, false)
  const branches = plan.branches.map((branch) => {
    const proj = branch.is_main ? mainProj : project(plan, branch, false)
    return {
      branch_id: branch.id,
      name: branch.name,
      is_main: branch.is_main,
      net: proj.net,
      delta_vs_main: q(num(proj.net) - num(mainProj.net)),
    }
  })
  branches.sort((a, b) => {
    if (a.is_main !== b.is_main) return a.is_main ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  saveDocument(doc)
  return Promise.resolve({ plan_id: planId, branches })
}

export function fetchPlanCompare(
  planId: number,
  branchId: number,
  baseBranchId?: number | null,
): Promise<PlanCompare> {
  const doc = loadDocument()
  const plan = getPlanOrThrow(doc, planId)
  const branch = resolveBranch(plan, branchId)
  const base = resolveBranch(plan, baseBranchId)
  if (branch.id === base.id) throw new Error('Select two different branches to compare')
  const baseProj = project(plan, base, true)
  const branchProj = project(plan, branch, true)
  const baseById = new Map(baseProj.accounts.map((a) => [a.account_id, a]))
  const accounts: AccountProjectionDelta[] = branchProj.accounts.map((account) => {
    const baseRow = baseById.get(account.account_id)
    const baseEnd = baseRow ? num(baseRow.end_balance) : num(account.start_balance)
    return {
      account_id: account.account_id,
      name: account.name,
      kind: account.kind,
      base_end_balance: baseEnd,
      branch_end_balance: account.end_balance,
      delta: q(num(account.end_balance) - baseEnd),
    }
  })
  saveDocument(doc)
  return Promise.resolve({
    plan_id: planId,
    base: baseProj,
    branch: branchProj,
    net_delta: q(num(branchProj.net) - num(baseProj.net)),
    accounts,
  })
}

export function createPlanAccount(
  planId: number,
  data: PlanAccountCreate,
  branchId?: number | null,
): Promise<PlanAccount> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (!branch.is_main) throw new Error('Accounts can only be added on the main branch')
    const now = nowISO()
    const account: StoredAccount = {
      id: doc.nextIds.account++,
      plan_id: planId,
      kind: data.kind ?? 'savings',
      name: data.name.trim(),
      description: data.description ?? null,
      start_balance: data.start_balance ?? 0,
      start_date: data.start_date || todayISODate(),
      currency: data.currency ?? 'USD',
      sort_order: data.sort_order ?? plan.accounts.length,
      cashflows: [],
      outlooks: [],
      created_at: now,
      updated_at: now,
    }
    plan.accounts.push(account)
    touch(plan)
    const serialized = serializePlan(plan, branch)
    const row = serialized.accounts.find((a) => a.id === account.id)
    if (!row) throw new Error('Account create failed')
    return row
  })
}

export function updatePlanAccount(
  planId: number,
  accountId: number,
  data: Partial<PlanAccountCreate>,
  branchId?: number | null,
): Promise<PlanAccount> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (!branch.is_main) throw new Error('Accounts can only be edited on the main branch')
    const account = getAccountOrThrow(plan, accountId)
    if (data.kind != null) account.kind = data.kind
    if (data.name != null) account.name = data.name.trim()
    if (data.description !== undefined) account.description = data.description ?? null
    if (data.start_balance != null) account.start_balance = data.start_balance
    if (data.start_date != null) account.start_date = data.start_date
    if (data.currency != null) account.currency = data.currency
    if (data.sort_order != null) account.sort_order = data.sort_order
    account.updated_at = nowISO()
    touch(plan)
    const serialized = serializePlan(plan, branch)
    const row = serialized.accounts.find((a) => a.id === accountId)
    if (!row) throw new Error('Account not found')
    return row
  })
}

export function deletePlanAccount(
  planId: number,
  accountId: number,
  branchId?: number | null,
): Promise<void> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (!branch.is_main) throw new Error('Accounts can only be deleted on the main branch')
    plan.accounts = plan.accounts.filter((a) => a.id !== accountId)
    touch(plan)
  })
}

export function createCashflow(
  planId: number,
  accountId: number,
  data: CashflowSegmentCreate,
  branchId?: number | null,
): Promise<CashflowSegment> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    const account = getAccountOrThrow(plan, accountId)
    const fields = normalizeCashflowInput(data)
    const now = nowISO()
    const segment: StoredCashflow = {
      id: doc.nextIds.cashflow++,
      account_id: accountId,
      branch_id: branch.id,
      origin_id: null,
      is_suppressed: false,
      ...fields,
      created_at: now,
      updated_at: now,
    }
    account.cashflows.push(segment)
    touch(plan)
    return serializeCashflow(segment, branch.is_main ? 'main' : 'branch')
  })
}

export function updateCashflow(
  planId: number,
  accountId: number,
  cashflowId: number,
  data: Partial<CashflowSegmentCreate>,
  branchId?: number | null,
): Promise<CashflowSegment> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    const main = getMainBranch(plan)
    if (!main) throw new Error('Main branch missing')
    const account = getAccountOrThrow(plan, accountId)
    const segment = account.cashflows.find((c) => c.id === cashflowId)
    if (!segment) throw new Error('Cashflow not found')

    const updates: Partial<StoredCashflow> = {}
    if (data.amount !== undefined) updates.amount = num(data.amount)
    if (data.tax_rate !== undefined) updates.tax_rate = data.tax_rate
    if (data.frequency !== undefined) updates.frequency = data.frequency
    if (data.interval_count !== undefined) updates.interval_count = data.interval_count
    if (data.start_date !== undefined) updates.start_date = data.start_date
    if (data.end_date !== undefined) updates.end_date = data.end_date
    if (data.mode !== undefined) updates.mode = data.mode
    if (data.description !== undefined) updates.description = data.description ?? null

    if (!branch.is_main && segment.branch_id === main.id && segment.origin_id == null) {
      let existing = account.cashflows.find(
        (c) => c.branch_id === branch.id && c.origin_id === segment.id && !c.is_suppressed,
      )
      if (!existing) {
        const now = nowISO()
        existing = {
          id: doc.nextIds.cashflow++,
          account_id: accountId,
          branch_id: branch.id,
          origin_id: segment.id,
          is_suppressed: false,
          amount: segment.amount,
          tax_rate: segment.tax_rate,
          frequency: segment.frequency,
          interval_count: segment.interval_count,
          start_date: segment.start_date,
          end_date: segment.end_date,
          mode: segment.mode,
          description: segment.description,
          created_at: now,
          updated_at: now,
        }
        Object.assign(existing, updates)
        account.cashflows.push(existing)
      } else {
        Object.assign(existing, updates)
        existing.updated_at = nowISO()
      }
      touch(plan)
      return serializeCashflow(existing, 'override', segment.id)
    }

    if (segment.branch_id !== branch.id) {
      throw new Error('Cashflow does not belong to the active branch')
    }
    Object.assign(segment, updates)
    if (segment.end_date != null && segment.end_date < segment.start_date) {
      throw new Error('end_date must be on or after start_date')
    }
    segment.updated_at = nowISO()
    touch(plan)
    const source = segment.origin_id ? 'override' : branch.is_main ? 'main' : 'branch'
    return serializeCashflow(segment, source, segment.origin_id)
  })
}

export function deleteCashflow(
  planId: number,
  accountId: number,
  cashflowId: number,
  branchId?: number | null,
): Promise<void> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    const main = getMainBranch(plan)
    if (!main) throw new Error('Main branch missing')
    const account = getAccountOrThrow(plan, accountId)
    const segment = account.cashflows.find((c) => c.id === cashflowId)
    if (!segment) throw new Error('Cashflow not found')

    if (!branch.is_main && segment.branch_id === main.id && segment.origin_id == null) {
      const existing = account.cashflows.find(
        (c) => c.branch_id === branch.id && c.origin_id === segment.id,
      )
      if (!existing) {
        const now = nowISO()
        account.cashflows.push({
          id: doc.nextIds.cashflow++,
          account_id: accountId,
          branch_id: branch.id,
          origin_id: segment.id,
          is_suppressed: true,
          amount: segment.amount,
          tax_rate: segment.tax_rate,
          frequency: segment.frequency,
          interval_count: segment.interval_count,
          start_date: segment.start_date,
          end_date: segment.end_date,
          mode: segment.mode,
          description: segment.description,
          created_at: now,
          updated_at: now,
        })
      } else {
        existing.is_suppressed = true
        existing.updated_at = nowISO()
      }
      touch(plan)
      return
    }

    if (segment.branch_id !== branch.id) {
      throw new Error('Cashflow does not belong to the active branch')
    }
    account.cashflows = account.cashflows.filter((c) => c.id !== cashflowId)
    touch(plan)
  })
}

export function resetCashflowOverride(
  planId: number,
  accountId: number,
  cashflowId: number,
  branchId: number,
): Promise<SavingsPlan> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (branch.is_main) throw new Error('Reset is only for custom branches')
    const account = getAccountOrThrow(plan, accountId)
    const segment = account.cashflows.find((c) => c.id === cashflowId)
    if (!segment || segment.branch_id !== branch.id) throw new Error('Override not found')
    if (segment.origin_id == null) throw new Error('Not an override')
    account.cashflows = account.cashflows.filter((c) => c.id !== cashflowId)
    touch(plan)
    return serializePlan(plan, branch)
  })
}

export function createOutlook(
  planId: number,
  accountId: number,
  data: ValueOutlookCreate,
  branchId?: number | null,
): Promise<ValueOutlook> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    const account = getAccountOrThrow(plan, accountId)
    const fields = normalizeOutlookInput(data)
    const now = nowISO()
    const outlook: StoredOutlook = {
      id: doc.nextIds.outlook++,
      account_id: accountId,
      branch_id: branch.id,
      origin_id: null,
      is_suppressed: false,
      ...fields,
      created_at: now,
      updated_at: now,
    }
    account.outlooks.push(outlook)
    touch(plan)
    return serializeOutlook(outlook, branch.is_main ? 'main' : 'branch')
  })
}

export function updateOutlook(
  planId: number,
  accountId: number,
  outlookId: number,
  data: Partial<ValueOutlookCreate>,
  branchId?: number | null,
): Promise<ValueOutlook> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    const main = getMainBranch(plan)
    if (!main) throw new Error('Main branch missing')
    const account = getAccountOrThrow(plan, accountId)
    const outlook = account.outlooks.find((o) => o.id === outlookId)
    if (!outlook) throw new Error('Outlook not found')

    const updates: Partial<StoredOutlook> = {}
    if (data.outlook_type !== undefined) updates.outlook_type = data.outlook_type
    if (data.rate_annual !== undefined) updates.rate_annual = data.rate_annual
    if (data.target_amount !== undefined) updates.target_amount = data.target_amount
    if (data.effective_date !== undefined) updates.effective_date = data.effective_date
    if (data.description !== undefined) updates.description = data.description ?? null

    if (!branch.is_main && outlook.branch_id === main.id && outlook.origin_id == null) {
      let existing = account.outlooks.find(
        (o) => o.branch_id === branch.id && o.origin_id === outlook.id && !o.is_suppressed,
      )
      if (!existing) {
        const now = nowISO()
        existing = {
          id: doc.nextIds.outlook++,
          account_id: accountId,
          branch_id: branch.id,
          origin_id: outlook.id,
          is_suppressed: false,
          outlook_type: outlook.outlook_type,
          rate_annual: outlook.rate_annual,
          target_amount: outlook.target_amount,
          effective_date: outlook.effective_date,
          description: outlook.description,
          created_at: now,
          updated_at: now,
        }
        Object.assign(existing, updates)
        account.outlooks.push(existing)
      } else {
        Object.assign(existing, updates)
        existing.updated_at = nowISO()
      }
      touch(plan)
      return serializeOutlook(existing, 'override', outlook.id)
    }

    if (outlook.branch_id !== branch.id) {
      throw new Error('Outlook does not belong to the active branch')
    }
    Object.assign(outlook, updates)
    outlook.updated_at = nowISO()
    touch(plan)
    const source = outlook.origin_id ? 'override' : branch.is_main ? 'main' : 'branch'
    return serializeOutlook(outlook, source, outlook.origin_id)
  })
}

export function deleteOutlook(
  planId: number,
  accountId: number,
  outlookId: number,
  branchId?: number | null,
): Promise<void> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    const main = getMainBranch(plan)
    if (!main) throw new Error('Main branch missing')
    const account = getAccountOrThrow(plan, accountId)
    const outlook = account.outlooks.find((o) => o.id === outlookId)
    if (!outlook) throw new Error('Outlook not found')

    if (!branch.is_main && outlook.branch_id === main.id && outlook.origin_id == null) {
      const existing = account.outlooks.find(
        (o) => o.branch_id === branch.id && o.origin_id === outlook.id,
      )
      if (!existing) {
        const now = nowISO()
        account.outlooks.push({
          id: doc.nextIds.outlook++,
          account_id: accountId,
          branch_id: branch.id,
          origin_id: outlook.id,
          is_suppressed: true,
          outlook_type: outlook.outlook_type,
          rate_annual: outlook.rate_annual,
          target_amount: outlook.target_amount,
          effective_date: outlook.effective_date,
          description: outlook.description,
          created_at: now,
          updated_at: now,
        })
      } else {
        existing.is_suppressed = true
        existing.updated_at = nowISO()
      }
      touch(plan)
      return
    }

    if (outlook.branch_id !== branch.id) {
      throw new Error('Outlook does not belong to the active branch')
    }
    account.outlooks = account.outlooks.filter((o) => o.id !== outlookId)
    touch(plan)
  })
}

export function resetOutlookOverride(
  planId: number,
  accountId: number,
  outlookId: number,
  branchId: number,
): Promise<SavingsPlan> {
  return withDoc((doc) => {
    const plan = getPlanOrThrow(doc, planId)
    const branch = resolveBranch(plan, branchId)
    if (branch.is_main) throw new Error('Reset is only for custom branches')
    const account = getAccountOrThrow(plan, accountId)
    const outlook = account.outlooks.find((o) => o.id === outlookId)
    if (!outlook || outlook.branch_id !== branch.id) throw new Error('Override not found')
    if (outlook.origin_id == null) throw new Error('Not an override')
    account.outlooks = account.outlooks.filter((o) => o.id !== outlookId)
    touch(plan)
    return serializePlan(plan, branch)
  })
}

/** Export a single plan as a portable JSON document. */
export function exportPlanFile(planId: number): {
  filename: string
  json: string
} {
  const doc = loadDocument()
  const plan = getPlanOrThrow(doc, planId)
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    plan: structuredClone(plan),
  }
  const safeName = plan.name.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'plan'
  return {
    filename: `${safeName}.forkline.json`,
    json: JSON.stringify(payload, null, 2),
  }
}

/** Import a plan file into local storage (new IDs). */
export async function importPlanFile(raw: string): Promise<SavingsPlan> {
  const parsed = JSON.parse(raw) as {
    schemaVersion?: number
    plan?: StoredPlan
  }
  if (!parsed?.plan || typeof parsed.plan !== 'object') {
    throw new Error('Invalid Forkline plan file')
  }
  if (parsed.schemaVersion != null && parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${parsed.schemaVersion}`)
  }

  return withDoc((doc) => {
    const incoming = structuredClone(parsed.plan!)
    const idMap = {
      plan: new Map<number, number>(),
      branch: new Map<number, number>(),
      account: new Map<number, number>(),
      cashflow: new Map<number, number>(),
      outlook: new Map<number, number>(),
    }

    const newPlanId = doc.nextIds.plan++
    idMap.plan.set(incoming.id, newPlanId)

    const branches: StoredBranch[] = incoming.branches.map((branch) => {
      const newId = doc.nextIds.branch++
      idMap.branch.set(branch.id, newId)
      return {
        ...branch,
        id: newId,
        plan_id: newPlanId,
      }
    })

    if (!branches.some((b) => b.is_main)) {
      branches.push({
        id: doc.nextIds.branch++,
        plan_id: newPlanId,
        name: 'Main',
        is_main: true,
        created_at: nowISO(),
        updated_at: nowISO(),
      })
    }

    const accounts: StoredAccount[] = incoming.accounts.map((account) => {
      const newAccountId = doc.nextIds.account++
      idMap.account.set(account.id, newAccountId)

      // First pass: assign new cashflow/outlook IDs
      for (const cf of account.cashflows) {
        idMap.cashflow.set(cf.id, doc.nextIds.cashflow++)
      }
      for (const ol of account.outlooks) {
        idMap.outlook.set(ol.id, doc.nextIds.outlook++)
      }

      return {
        ...account,
        id: newAccountId,
        plan_id: newPlanId,
        cashflows: account.cashflows.map((cf) => ({
          ...cf,
          id: idMap.cashflow.get(cf.id)!,
          account_id: newAccountId,
          branch_id: idMap.branch.get(cf.branch_id) ?? branches.find((b) => b.is_main)!.id,
          origin_id: cf.origin_id != null ? (idMap.cashflow.get(cf.origin_id) ?? null) : null,
        })),
        outlooks: account.outlooks.map((ol) => ({
          ...ol,
          id: idMap.outlook.get(ol.id)!,
          account_id: newAccountId,
          branch_id: idMap.branch.get(ol.branch_id) ?? branches.find((b) => b.is_main)!.id,
          origin_id: ol.origin_id != null ? (idMap.outlook.get(ol.origin_id) ?? null) : null,
        })),
      }
    })

    const plan: StoredPlan = {
      ...incoming,
      id: newPlanId,
      name: incoming.name,
      branches,
      accounts,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    doc.plans.push(plan)
    const main = getMainBranch(plan)!
    return serializePlan(plan, main)
  })
}

export function downloadPlan(planId: number): void {
  const { filename, json } = exportPlanFile(planId)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
