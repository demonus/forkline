import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PlanAccount, PlanProjection } from '../api/types'
import { formatCurrency } from '../utils/format'

/** High-contrast palette — hues spaced so neighboring series stay distinct. */
const SERIES_COLORS = [
  '#2563eb', // blue
  '#ea580c', // orange
  '#db2777', // magenta
  '#ca8a04', // gold
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#dc2626', // red
  '#65a30d', // lime
  '#64748b', // slate
  '#c026d3', // fuchsia
]

export function accountSeriesKey(accountId: number) {
  return `account_${accountId}`
}

function colorForSeriesIndex(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

function CurrencyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0)
  return (
    <div className="planner-chart-tooltip">
      <div className="planner-chart-tooltip-label">{label}</div>
      <ul>
        {payload.map((entry) => (
          <li key={entry.name} style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value ?? 0)}
          </li>
        ))}
        <li className="planner-chart-tooltip-total">Total: {formatCurrency(total)}</li>
      </ul>
    </div>
  )
}

function buildChartData(projection: PlanProjection | undefined, accountIds: number[]) {
  const idSet = new Set(accountIds)
  return (projection?.timeline ?? []).map((point) => {
    const row: Record<string, string | number> = { month: point.month }
    for (const account of point.accounts ?? []) {
      if (!idSet.has(account.account_id)) continue
      row[accountSeriesKey(account.account_id)] = Number(account.balance)
    }
    return row
  })
}

function TimelineChart({
  title,
  projection,
  accounts,
  visibleAccountIds,
  colorByAccountId,
  syncId,
}: {
  title: string
  projection: PlanProjection | undefined
  accounts: PlanAccount[]
  visibleAccountIds: number[]
  colorByAccountId: Map<number, string>
  syncId?: string
}) {
  const data = useMemo(
    () => buildChartData(projection, visibleAccountIds),
    [projection, visibleAccountIds],
  )
  const visibleAccounts = useMemo(
    () => accounts.filter((account) => visibleAccountIds.includes(account.id)),
    [accounts, visibleAccountIds],
  )

  return (
    <div className="planner-chart-panel">
      <h3 className="planner-chart-title">{title}</h3>
      {data.length === 0 || visibleAccounts.length === 0 ? (
        <p className="card-empty">No timeline data for the selected accounts.</p>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} syncId={syncId}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-panel-border, #444)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                tickFormatter={(value) => formatCurrency(value)}
                width={84}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Legend />
              {visibleAccounts.map((account) => (
                <Line
                  key={account.id}
                  type="monotone"
                  dataKey={accountSeriesKey(account.id)}
                  name={account.name}
                  stroke={colorByAccountId.get(account.id) ?? colorForSeriesIndex(0)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function PlannerTimelineCharts({
  accounts,
  visibleAccountIds,
  onToggleAccount,
  onShowAll,
  onHideAll,
  currentProjection,
  currentTitle,
  compareProjection,
  compareTitle,
  showCompare,
}: {
  accounts: PlanAccount[]
  visibleAccountIds: number[]
  onToggleAccount: (accountId: number) => void
  onShowAll: () => void
  onHideAll: () => void
  currentProjection: PlanProjection | undefined
  currentTitle: string
  compareProjection?: PlanProjection | undefined
  compareTitle?: string
  showCompare: boolean
}) {
  const visibleSet = useMemo(() => new Set(visibleAccountIds), [visibleAccountIds])
  const colorByAccountId = useMemo(() => {
    const map = new Map<number, string>()
    accounts.forEach((account, index) => {
      map.set(account.id, colorForSeriesIndex(index))
    })
    return map
  }, [accounts])

  return (
    <section className="panel planner-charts">
      <div className="card-header">
        <div>
          <h2 className="panel-title">Account timeline</h2>
          <p className="panel-desc">Projected balance by month. Toggle accounts to show or hide series.</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn linkish" onClick={onShowAll}>
            Show all
          </button>
          <button type="button" className="btn linkish" onClick={onHideAll}>
            Hide all
          </button>
        </div>
      </div>

      <div className="planner-chart-series" role="group" aria-label="Accounts on chart">
        {accounts.map((account) => (
          <label key={account.id} className="planner-chart-series-item">
            <input
              type="checkbox"
              checked={visibleSet.has(account.id)}
              onChange={() => onToggleAccount(account.id)}
            />
            <span
              className="planner-chart-series-swatch"
              style={{ background: colorByAccountId.get(account.id) }}
              aria-hidden="true"
            />
            {account.name}
          </label>
        ))}
        {accounts.length === 0 && <p className="card-empty">No accounts in the current type filter.</p>}
      </div>

      <div className={`planner-charts-grid${showCompare ? ' is-split' : ''}`}>
        <TimelineChart
          title={currentTitle}
          projection={currentProjection}
          accounts={accounts}
          visibleAccountIds={visibleAccountIds}
          colorByAccountId={colorByAccountId}
          syncId={showCompare ? 'planner-branch-compare' : undefined}
        />
        {showCompare && (
          <TimelineChart
            title={compareTitle ?? 'Compare'}
            projection={compareProjection}
            accounts={accounts}
            visibleAccountIds={visibleAccountIds}
            colorByAccountId={colorByAccountId}
            syncId="planner-branch-compare"
          />
        )}
      </div>
    </section>
  )
}
