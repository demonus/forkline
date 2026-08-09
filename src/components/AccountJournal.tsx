import { useEffect, useMemo, useState } from 'react'
import type { AccountJournal, JournalEvent, JournalEventType, PlanProjection } from '../api/types'
import { formatCurrency } from '../utils/format'

const TYPE_LABELS: Record<JournalEventType, string> = {
  opening: 'opening',
  cashflow: 'cashflow',
  growth: 'outlook',
  target_value: 'outlook',
}

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 10

type JournalMonthRow = {
  accountId: number
  accountName: string
  month: string
  events: JournalEvent[]
}

type MonthPageGroup = {
  month: string
  accounts: JournalMonthRow[]
}

function formatSignedAmount(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) return formatCurrency(0)
  const sign = amount > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(amount))}`
}

function amountClass(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) return 'planner-delta is-even'
  return amount > 0 ? 'planner-delta is-better' : 'planner-delta is-worse'
}

function eventLine(event: JournalEvent, index: number) {
  const typeLabel = TYPE_LABELS[event.type]
  return (
    <li key={`${event.type}-${index}`}>
      <span className="planner-journal-event-type">{typeLabel}</span>{' '}
      <span className="planner-journal-event-label">“{event.label}”</span>:{' '}
      <span className={amountClass(event.amount)}>{formatSignedAmount(event.amount)}</span>
      . Balance: <strong>{formatCurrency(event.balance_after)}</strong>
    </li>
  )
}

function monthHasNonGrowth(month: AccountJournal['months'][number]) {
  return month.events.some((event) => event.type !== 'growth')
}

function monthInPeriod(month: string, start: string, end: string) {
  if (start && month < start) return false
  if (end && month > end) return false
  return true
}

function monthEndingBalance(row: JournalMonthRow) {
  const last = row.events[row.events.length - 1]
  return Number(last?.balance_after ?? 0)
}

function monthGroupTotal(
  group: MonthPageGroup,
  activeAccountIds: number[],
  timelineBalanceByMonth: Map<string, Map<number, number>>,
) {
  const balances = new Map<number, number>()
  const monthBalances = timelineBalanceByMonth.get(group.month)

  for (const accountId of activeAccountIds) {
    const fromTimeline = monthBalances?.get(accountId)
    if (fromTimeline != null && Number.isFinite(fromTimeline)) {
      balances.set(accountId, fromTimeline)
    }
  }

  for (const account of group.accounts) {
    balances.set(account.accountId, monthEndingBalance(account))
  }

  let total = 0
  for (const value of balances.values()) total += value
  return total
}

function JournalPager({
  safePage,
  totalPages,
  monthCount,
  rangeLabel,
  onPageChange,
  showRange = true,
}: {
  safePage: number
  totalPages: number
  monthCount: number
  rangeLabel: string
  onPageChange: (page: number) => void
  showRange?: boolean
}) {
  return (
    <div className="planner-journal-pager">
      <div className="pagination planner-journal-pagination">
        <button
          type="button"
          className="btn secondary"
          disabled={safePage <= 0}
          onClick={() => onPageChange(Math.max(0, safePage - 1))}
        >
          Previous
        </button>
        <label className="planner-journal-page-select">
          <span className="planner-journal-page-label">Page</span>
          <select
            value={safePage}
            disabled={monthCount === 0}
            onChange={(e) => onPageChange(Number(e.target.value))}
            aria-label="Jump to page"
          >
            {Array.from({ length: totalPages }, (_, index) => (
              <option key={index} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
          <span className="planner-journal-page-total">of {totalPages}</span>
        </label>
        {showRange && <span className="planner-journal-page-range">{rangeLabel}</span>}
        <button
          type="button"
          className="btn secondary"
          disabled={safePage >= totalPages - 1 || monthCount === 0}
          onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function AccountJournalPanel({
  projection,
  accountIds,
  isLoading,
  error,
}: {
  projection: PlanProjection | undefined
  accountIds: number[]
  isLoading?: boolean
  error?: string | null
}) {
  const accountIdKey = accountIds.join(',')

  const journals = useMemo(() => {
    const idSet = new Set(accountIds)
    return (projection?.journal ?? []).filter((entry) => idSet.has(entry.account_id))
    // accountIdKey captures accountIds contents without depending on a new array identity each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection?.journal, accountIdKey])

  const journalIdKey = journals.map((entry) => entry.account_id).join(',')

  const [expanded, setExpanded] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Record<number, boolean>>({})
  const [includeGrowthOnlyMonths, setIncludeGrowthOnlyMonths] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setSelectedAccountIds((prev) => {
      const next: Record<number, boolean> = {}
      for (const entry of journals) {
        next[entry.account_id] = prev[entry.account_id] ?? true
      }
      return next
    })
  }, [journalIdKey, journals])

  const activeAccountIds = useMemo(() => {
    return journals
      .filter((entry) => selectedAccountIds[entry.account_id] !== false)
      .map((entry) => entry.account_id)
  }, [journals, selectedAccountIds])

  const selectedAccountKey = activeAccountIds.join(',')

  const allSelected =
    journals.length > 0 && journals.every((entry) => selectedAccountIds[entry.account_id] !== false)
  const noneSelected = activeAccountIds.length === 0

  const monthRows = useMemo(() => {
    const idSet = new Set(activeAccountIds)
    const rows: JournalMonthRow[] = []
    for (const entry of journals) {
      if (!idSet.has(entry.account_id)) continue
      for (const month of entry.months) {
        if (!includeGrowthOnlyMonths && !monthHasNonGrowth(month)) continue
        if (!monthInPeriod(month.month, periodStart, periodEnd)) continue
        rows.push({
          accountId: entry.account_id,
          accountName: entry.name,
          month: month.month,
          events: month.events,
        })
      }
    }

    rows.sort((a, b) => {
      if (a.month !== b.month) return a.month.localeCompare(b.month)
      return a.accountName.localeCompare(b.accountName)
    })
    return rows
  }, [journals, activeAccountIds, includeGrowthOnlyMonths, periodStart, periodEnd])

  // Paginate by calendar month so every selected account with that month appears together.
  const calendarMonths = useMemo(() => {
    const months: string[] = []
    const seen = new Set<string>()
    for (const row of monthRows) {
      if (seen.has(row.month)) continue
      seen.add(row.month)
      months.push(row.month)
    }
    return months
  }, [monthRows])

  const totalPages = Math.max(1, Math.ceil(calendarMonths.length / pageSize) || 1)
  const safePage = Math.min(page, totalPages - 1)

  const pageMonthGroups = useMemo(() => {
    const start = safePage * pageSize
    const pageMonths = new Set(calendarMonths.slice(start, start + pageSize))
    const groups: MonthPageGroup[] = []
    const indexByMonth = new Map<string, number>()

    for (const row of monthRows) {
      if (!pageMonths.has(row.month)) continue
      let groupIndex = indexByMonth.get(row.month)
      if (groupIndex == null) {
        groupIndex = groups.length
        indexByMonth.set(row.month, groupIndex)
        groups.push({ month: row.month, accounts: [] })
      }
      groups[groupIndex].accounts.push(row)
    }

    return groups
  }, [monthRows, calendarMonths, safePage, pageSize])

  const timelineBalanceByMonth = useMemo(() => {
    const byMonth = new Map<string, Map<number, number>>()
    for (const point of projection?.timeline ?? []) {
      const balances = new Map<number, number>()
      for (const account of point.accounts ?? []) {
        balances.set(account.account_id, Number(account.balance))
      }
      byMonth.set(point.month, balances)
    }
    return byMonth
  }, [projection?.timeline])

  useEffect(() => {
    setPage(0)
  }, [selectedAccountKey, includeGrowthOnlyMonths, periodStart, periodEnd, pageSize])

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const rangeLabel =
    calendarMonths.length === 0
      ? '0 months'
      : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, calendarMonths.length)} of ${calendarMonths.length} months`

  const setAllAccounts = (checked: boolean) => {
    const next: Record<number, boolean> = {}
    for (const entry of journals) next[entry.account_id] = checked
    setSelectedAccountIds(next)
  }

  return (
    <section className={`panel planner-journal${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="planner-journal-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <div>
          <h2 className="panel-title">Account journal</h2>
          <p className="panel-desc">
            Month-by-month how opening balances, cashflows, outlooks, and growth update each account.
          </p>
        </div>
        <span className="planner-journal-toggle-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <>
          <div className="planner-journal-account-filters" role="group" aria-label="Accounts">
            <div className="planner-journal-account-filter-actions">
              <button type="button" className="btn linkish" onClick={() => setAllAccounts(true)}>
                Show all
              </button>
              <button type="button" className="btn linkish" onClick={() => setAllAccounts(false)}>
                Hide all
              </button>
            </div>
            <div className="planner-journal-account-checks">
              {journals.map((entry) => (
                <label key={entry.account_id} className="planner-kind-filter">
                  <input
                    type="checkbox"
                    checked={selectedAccountIds[entry.account_id] !== false}
                    onChange={(e) => {
                      setSelectedAccountIds((prev) => ({
                        ...prev,
                        [entry.account_id]: e.target.checked,
                      }))
                    }}
                  />
                  {entry.name}
                </label>
              ))}
              {journals.length === 0 && (
                <span className="muted">No accounts in the current type filter.</span>
              )}
            </div>
          </div>

          <div className="planner-journal-controls">
            <label>
              From
              <input
                type="month"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="month"
                value={periodEnd}
                min={periodStart || undefined}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </label>
            <label>
              Months per page
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className="planner-kind-filter">
              <input
                type="checkbox"
                checked={includeGrowthOnlyMonths}
                onChange={(e) => setIncludeGrowthOnlyMonths(e.target.checked)}
              />
              Include growth-only months
            </label>
            {(periodStart || periodEnd) && (
              <button
                type="button"
                className="btn linkish"
                onClick={() => {
                  setPeriodStart('')
                  setPeriodEnd('')
                }}
              >
                Clear period
              </button>
            )}
          </div>

          <JournalPager
            safePage={safePage}
            totalPages={totalPages}
            monthCount={calendarMonths.length}
            rangeLabel={rangeLabel}
            onPageChange={setPage}
          />

          {isLoading && <p className="card-empty">Loading journal…</p>}
          {error && <p className="card-empty">{error}</p>}
          {!isLoading && !error && noneSelected && (
            <p className="card-empty">Select at least one account to show journal months.</p>
          )}
          {!isLoading && !error && !noneSelected && calendarMonths.length === 0 && (
            <p className="card-empty">
              No journal months for the current filters. Widen the date period, enable growth-only
              months, or adjust account types.
            </p>
          )}

          <div className="planner-journal-accounts">
            {pageMonthGroups.map((group) => {
              const total = monthGroupTotal(group, activeAccountIds, timelineBalanceByMonth)
              return (
                <article key={group.month} className="planner-journal-month-group">
                  <h3>{group.month}</h3>
                  <div className="planner-journal-months">
                    {group.accounts.map((account) => (
                      <div
                        key={`${account.accountId}-${account.month}`}
                        className="planner-journal-month"
                      >
                        <h4>{account.accountName}</h4>
                        <ul className="planner-journal-events">{account.events.map(eventLine)}</ul>
                      </div>
                    ))}
                  </div>
                  <p className="planner-journal-month-total">
                    Total balance: <strong>{formatCurrency(total)}</strong>
                  </p>
                </article>
              )
            })}
          </div>

          {calendarMonths.length > pageSize && (
            <JournalPager
              safePage={safePage}
              totalPages={totalPages}
              monthCount={calendarMonths.length}
              rangeLabel={rangeLabel}
              onPageChange={setPage}
              showRange={false}
            />
          )}

          {!allSelected && activeAccountIds.length > 0 && (
            <p className="planner-field-hint">
              Showing {activeAccountIds.length} of {journals.length} accounts.
            </p>
          )}
        </>
      )}
    </section>
  )
}
