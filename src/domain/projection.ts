import type {
  AccountJournal,
  AccountJournalMonth,
  AccountProjection,
  JournalEvent,
  MonthlyAccountBalance,
  MonthlySnapshot,
  PlanProjection,
} from '../api/types'
import type { PlanView } from './branches'
import { iterMonths, monthKey, monthStart, monthsBetween } from './dates'
import { num, q } from './money'
import type { StoredCashflow, StoredOutlook } from './model'

function netAmount(segment: StoredCashflow): number {
  const tax = num(segment.tax_rate)
  return q(num(segment.amount) * (1 - tax))
}

function segmentActive(segment: StoredCashflow, month: string): boolean {
  const start = monthStart(segment.start_date)
  if (month < start) return false
  if (segment.end_date != null && month > monthStart(segment.end_date)) return false
  return true
}

export function monthlyCashflowForSegment(segment: StoredCashflow, month: string): number {
  if (!segmentActive(segment, month)) return 0

  const net = netAmount(segment)
  const start = monthStart(segment.start_date)
  const offset = monthsBetween(start, month)
  const frequency = segment.frequency

  if (frequency === 'once') return offset === 0 ? net : 0
  if (frequency === 'monthly') return net
  if (frequency === 'quarterly') return offset % 3 === 0 ? net : 0
  if (frequency === 'yearly') return offset % 12 === 0 ? net : 0
  if (frequency === 'weekly') return q((net * 52) / 12)
  if (frequency === 'biweekly') return q((net * 26) / 12)
  if (frequency === 'custom') {
    const interval = Math.max(Math.floor(segment.interval_count || 1), 1)
    return offset % interval === 0 ? net : 0
  }
  return 0
}

function activeGrowthOutlook(outlooks: StoredOutlook[], month: string): StoredOutlook | null {
  let active: StoredOutlook | null = null
  for (const outlook of outlooks) {
    if (outlook.outlook_type !== 'growth_rate') continue
    if (monthStart(outlook.effective_date) <= month) {
      if (active == null || outlook.effective_date >= active.effective_date) {
        active = outlook
      }
    }
  }
  if (active == null || active.rate_annual == null) return null
  return active
}

function targetOutlookThisMonth(outlooks: StoredOutlook[], month: string): StoredOutlook | null {
  const matches = outlooks.filter(
    (outlook) =>
      outlook.outlook_type === 'target_value' &&
      monthStart(outlook.effective_date) === month &&
      outlook.target_amount != null,
  )
  if (matches.length === 0) return null
  matches.sort((a, b) => {
    if (a.effective_date !== b.effective_date) {
      return a.effective_date < b.effective_date ? -1 : 1
    }
    return (a.id || 0) - (b.id || 0)
  })
  return matches[matches.length - 1]
}

function cashflowLabel(segment: StoredCashflow): string {
  const description = (segment.description || '').trim()
  return description || 'Cashflow'
}

function growthLabel(outlook: StoredOutlook): string {
  const description = (outlook.description || '').trim()
  if (description) return description
  if (outlook.rate_annual != null) {
    const percent = q(num(outlook.rate_annual) * 100)
    return `Growth (${percent}%)`
  }
  return 'Growth'
}

function targetLabel(outlook: StoredOutlook): string {
  const description = (outlook.description || '').trim()
  return description || 'Target value'
}

interface AccountRun {
  account: PlanView['accounts'][number]
  balance: number
  totalCashflows: number
  started: boolean
  journalMonths: AccountJournalMonth[]
}

export function projectPlan(
  plan: PlanView,
  options: { includeTimeline?: boolean; includeJournal?: boolean } = {},
): PlanProjection {
  const includeTimeline = options.includeTimeline ?? true
  const includeJournal = options.includeJournal ?? false
  const accounts = plan.accounts
  const targetMonth = monthStart(plan.target_date)

  if (accounts.length === 0) {
    return {
      plan_id: plan.id,
      branch_id: null,
      branch_name: null,
      target_date: plan.target_date,
      as_of_month: monthKey(targetMonth),
      total_assets: 0,
      total_expenses: 0,
      net: 0,
      accounts: [],
      timeline: [],
      journal: [],
    }
  }

  const earliestStart = accounts.reduce(
    (min, account) => (account.start_date < min ? account.start_date : min),
    accounts[0].start_date,
  )
  const startMonth = monthStart(earliestStart)

  if (targetMonth < startMonth) {
    let totalAssets = 0
    let totalExpenses = 0
    const accountResults: AccountProjection[] = accounts.map((account) => {
      const balance =
        monthStart(account.start_date) <= targetMonth ? num(account.start_balance) : 0
      const isExpense = account.kind === 'expense'
      if (isExpense) totalExpenses += balance
      else totalAssets += balance
      return {
        account_id: account.id,
        name: account.name,
        kind: account.kind,
        start_balance: account.start_balance,
        end_balance: q(balance),
        total_cashflows: 0,
        is_expense: isExpense,
      }
    })
    return {
      plan_id: plan.id,
      branch_id: null,
      branch_name: null,
      target_date: plan.target_date,
      as_of_month: monthKey(targetMonth),
      total_assets: q(totalAssets),
      total_expenses: q(totalExpenses),
      net: q(totalAssets - totalExpenses),
      accounts: accountResults,
      timeline: [],
      journal: [],
    }
  }

  const runs: AccountRun[] = accounts.map((account) => ({
    account,
    balance: 0,
    totalCashflows: 0,
    started: false,
    journalMonths: [],
  }))
  const timeline: MonthlySnapshot[] = []

  for (const month of iterMonths(startMonth, targetMonth)) {
    const monthKeyStr = monthKey(month)
    for (const run of runs) {
      const account = run.account
      const accountStart = monthStart(account.start_date)
      const events: JournalEvent[] = []

      if (!run.started && month >= accountStart) {
        run.balance = num(account.start_balance)
        run.started = true
        if (includeJournal) {
          events.push({
            type: 'opening',
            label: 'Opening balance',
            amount: q(run.balance),
            balance_after: q(run.balance),
          })
        }
      }

      if (!run.started) continue

      const outlooks = account.outlooks
      let monthCashflow = 0
      for (const segment of account.cashflows) {
        const amount = monthlyCashflowForSegment(segment, month)
        if (amount === 0) continue
        const before = run.balance
        run.balance = q(before + amount)
        monthCashflow = q(monthCashflow + amount)
        if (includeJournal) {
          events.push({
            type: 'cashflow',
            label: cashflowLabel(segment),
            amount: q(amount),
            balance_after: q(run.balance),
            cashflow_id: segment.id,
            tax_rate: segment.tax_rate,
          })
        }
      }
      run.totalCashflows = q(run.totalCashflows + monthCashflow)

      const targetOutlook = targetOutlookThisMonth(outlooks, month)
      if (targetOutlook != null && targetOutlook.target_amount != null) {
        const before = run.balance
        run.balance = q(num(targetOutlook.target_amount))
        if (includeJournal) {
          events.push({
            type: 'target_value',
            label: targetLabel(targetOutlook),
            amount: q(run.balance - before),
            balance_after: q(run.balance),
            outlook_id: targetOutlook.id,
          })
        }
      } else {
        const growthOutlook = activeGrowthOutlook(outlooks, month)
        if (growthOutlook != null && growthOutlook.rate_annual != null) {
          const before = run.balance
          const growth = num(growthOutlook.rate_annual)
          run.balance = q(before * (1 + growth / 12))
          const delta = q(run.balance - before)
          if (includeJournal && delta !== 0) {
            events.push({
              type: 'growth',
              label: growthLabel(growthOutlook),
              amount: delta,
              balance_after: q(run.balance),
              outlook_id: growthOutlook.id,
              rate_annual: growthOutlook.rate_annual,
            })
          }
        }
      }

      if (includeJournal && events.length > 0) {
        run.journalMonths.push({ month: monthKeyStr, events })
      }
    }

    if (includeTimeline) {
      let assetTotal = 0
      let expenseTotal = 0
      const monthAccounts: MonthlyAccountBalance[] = []
      for (const run of runs) {
        if (!run.started) continue
        if (run.account.kind === 'expense') expenseTotal += run.balance
        else assetTotal += run.balance
        monthAccounts.push({ account_id: run.account.id, balance: q(run.balance) })
      }
      timeline.push({
        month: monthKeyStr,
        total_assets: q(assetTotal),
        total_expenses: q(expenseTotal),
        net: q(assetTotal - expenseTotal),
        accounts: monthAccounts,
      })
    }
  }

  let totalAssets = 0
  let totalExpenses = 0
  const accountResults: AccountProjection[] = []
  const journal: AccountJournal[] = []
  for (const run of runs) {
    const isExpense = run.account.kind === 'expense'
    const endBalance = q(run.balance)
    accountResults.push({
      account_id: run.account.id,
      name: run.account.name,
      kind: run.account.kind,
      start_balance: run.account.start_balance,
      end_balance: endBalance,
      total_cashflows: q(run.totalCashflows),
      is_expense: isExpense,
    })
    if (includeJournal) {
      journal.push({
        account_id: run.account.id,
        name: run.account.name,
        months: run.journalMonths,
      })
    }
    if (isExpense) totalExpenses += endBalance
    else totalAssets += endBalance
  }

  return {
    plan_id: plan.id,
    branch_id: null,
    branch_name: null,
    target_date: plan.target_date,
    as_of_month: monthKey(targetMonth),
    total_assets: q(totalAssets),
    total_expenses: q(totalExpenses),
    net: q(totalAssets - totalExpenses),
    accounts: accountResults,
    timeline: includeTimeline ? timeline : [],
    journal: includeJournal ? journal : [],
  }
}
