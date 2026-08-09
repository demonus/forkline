import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  createCashflow,
  createOutlook,
  createPlanAccount,
  createPlanBranch,
  createSavingsPlan,
  deleteCashflow,
  deleteOutlook,
  deletePlanAccount,
  deletePlanBranch,
  deleteSavingsPlan,
  downloadPlan,
  fetchBranchNets,
  fetchPlanCompare,
  fetchPlanProjection,
  fetchSavingsPlan,
  fetchSavingsPlans,
  importPlanFile,
  mergePlanBranch,
  resetCashflowOverride,
  resetOutlookOverride,
  updateCashflow,
  updateOutlook,
  updatePlanAccount,
  updatePlanBranch,
  updateSavingsPlan,
} from '../api'
import type {
  AccountProjection,
  CashflowFrequency,
  CashflowMode,
  CashflowSegment,
  CashflowSegmentCreate,
  PlanAccount,
  PlanAccountCreate,
  PlanAccountKind,
  SavingsPlanCreate,
  ValueOutlook,
  ValueOutlookCreate,
  ValueOutlookType,
} from '../api/types'
import { AccountJournalPanel } from '../components/AccountJournal'
import { PlannerTimelineCharts } from '../components/PlannerTimelineCharts'
import { PrePostTaxCalculator } from '../components/PrePostTaxCalculator'
import { formatCurrency } from '../utils/format'

const SELECTED_PLAN_KEY = 'forkline.selectedPlanId'
const SELECTED_BRANCH_KEY_PREFIX = 'forkline.selectedBranchId.'

function branchStorageKey(planId: number) {
  return `${SELECTED_BRANCH_KEY_PREFIX}${planId}`
}

function readStoredBranchId(planId: number): number | null {
  try {
    const raw = localStorage.getItem(branchStorageKey(planId))
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

function mainBranchId(branches: { id: number; is_main: boolean }[]) {
  return branches.find((b) => b.is_main)?.id ?? null
}

function defaultBranchId(plan: { branches: { id: number; is_main: boolean }[]; active_branch_id: number | null }) {
  const mainId = mainBranchId(plan.branches)
  if (plan.active_branch_id != null && plan.branches.some((b) => b.id === plan.active_branch_id)) {
    return plan.active_branch_id
  }
  return mainId
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

function yearsFromNowISO(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

const KIND_LABELS: Record<PlanAccountKind, string> = {
  savings: 'Savings',
  asset: 'Investment',
  pre_tax: 'Pre-tax',
  expense: 'Expense',
}

const ALL_ACCOUNT_KINDS: PlanAccountKind[] = ['savings', 'asset', 'pre_tax', 'expense']

function defaultKindFilters(): Record<PlanAccountKind, boolean> {
  return {
    savings: true,
    asset: true,
    pre_tax: true,
    expense: true,
  }
}

const FREQUENCY_LABELS: Record<CashflowFrequency, string> = {
  once: 'Once',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Every N months',
}

function emptyPlanForm(): SavingsPlanCreate {
  return {
    name: '',
    target_date: yearsFromNowISO(10),
    notes: '',
  }
}

function emptyAccountForm(): PlanAccountCreate {
  return {
    kind: 'savings',
    name: '',
    description: '',
    start_balance: 0,
    start_date: todayISODate(),
    currency: 'USD',
  }
}

function emptyCashflowForm(): CashflowSegmentCreate {
  return {
    amount: '',
    tax_rate: 0,
    frequency: 'monthly',
    interval_count: 1,
    start_date: todayISODate(),
    end_date: null,
    mode: 'base',
    description: '',
  }
}

function emptyOutlookForm(): ValueOutlookCreate {
  return {
    outlook_type: 'growth_rate',
    rate_annual: 0.07,
    target_amount: null,
    effective_date: todayISODate(),
    description: '',
  }
}

function accountToForm(account: PlanAccount): PlanAccountCreate {
  return {
    kind: account.kind,
    name: account.name,
    description: account.description ?? '',
    start_balance: Number(account.start_balance),
    start_date: account.start_date,
    currency: account.currency,
    sort_order: account.sort_order,
  }
}

function cashflowToForm(segment: CashflowSegment): CashflowSegmentCreate {
  return {
    amount: String(segment.amount),
    tax_rate: Number(segment.tax_rate),
    frequency: segment.frequency,
    interval_count: segment.interval_count,
    start_date: segment.start_date,
    end_date: segment.end_date,
    mode: segment.mode,
    description: segment.description ?? '',
  }
}

function outlookToForm(outlook: ValueOutlook): ValueOutlookCreate {
  return {
    outlook_type: outlook.outlook_type,
    rate_annual: outlook.rate_annual == null ? null : Number(outlook.rate_annual),
    target_amount: outlook.target_amount == null ? null : Number(outlook.target_amount),
    effective_date: outlook.effective_date,
    description: outlook.description ?? '',
  }
}

function isAmountDraft(value: string) {
  return value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)
}

function normalizeCashflowPayload(form: CashflowSegmentCreate): CashflowSegmentCreate {
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('Enter a non-zero cashflow amount (negative for withdrawals).')
  }
  return {
    ...form,
    amount,
    tax_rate: Number(form.tax_rate) || 0,
    interval_count: Number(form.interval_count) || 1,
    end_date: form.end_date || null,
    description: form.description || null,
  }
}

function normalizeOutlookPayload(form: ValueOutlookCreate): ValueOutlookCreate {
  return {
    outlook_type: form.outlook_type,
    rate_annual: form.outlook_type === 'growth_rate' ? Number(form.rate_annual) || 0 : null,
    target_amount: form.outlook_type === 'target_value' ? Number(form.target_amount) || 0 : null,
    effective_date: form.effective_date,
    description: form.description || null,
  }
}

function formatSignedDelta(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) return formatCurrency(0)
  const sign = amount > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(amount))}`
}

function deltaToneClass(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) return 'planner-delta is-even'
  return amount > 0 ? 'planner-delta is-better' : 'planner-delta is-worse'
}

function SignedDelta({
  value,
  suffix,
}: {
  value: string | number
  suffix?: string
}) {
  return (
    <span className={deltaToneClass(value)}>
      {formatSignedDelta(value)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}

function taxPercentLabel(rate: string | number) {
  const value = Number(rate) * 100
  if (!value) return null
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}% tax`
}

function SourceBadge({ source }: { source: 'main' | 'override' | 'branch' }) {
  const label = source === 'main' ? 'main' : source === 'override' ? 'override' : 'branch'
  const className =
    source === 'override' ? 'badge warn' : source === 'branch' ? 'badge ok' : 'badge inactive'
  return <span className={className}>{label}</span>
}

function readStoredPlanId(): number | null {
  try {
    const raw = localStorage.getItem(SELECTED_PLAN_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export function PlannerPage() {
  const queryClient = useQueryClient()
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(() => readStoredPlanId())
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)
  const [planForm, setPlanForm] = useState(emptyPlanForm)
  const [planMetaDraft, setPlanMetaDraft] = useState<SavingsPlanCreate | null>(null)
  const [accountForm, setAccountForm] = useState(emptyAccountForm)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null)
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [accountEditForm, setAccountEditForm] = useState<PlanAccountCreate | null>(null)
  const [cashflowForms, setCashflowForms] = useState<Record<number, CashflowSegmentCreate>>({})
  const [outlookForms, setOutlookForms] = useState<Record<number, ValueOutlookCreate>>({})
  const [editingCashflowId, setEditingCashflowId] = useState<number | null>(null)
  const [cashflowEditForm, setCashflowEditForm] = useState<CashflowSegmentCreate | null>(null)
  const [editingOutlookId, setEditingOutlookId] = useState<number | null>(null)
  const [outlookEditForm, setOutlookEditForm] = useState<ValueOutlookCreate | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kindFilters, setKindFilters] = useState<Record<PlanAccountKind, boolean>>(defaultKindFilters)
  const [compareBaseBranchId, setCompareBaseBranchId] = useState<number | null>(null)
  const [chartAccountEnabled, setChartAccountEnabled] = useState<Record<number, boolean>>({})

  const plansQuery = useQuery({
    queryKey: ['savings-plans'],
    queryFn: fetchSavingsPlans,
  })

  useEffect(() => {
    if (selectedPlanId != null) {
      try {
        localStorage.setItem(SELECTED_PLAN_KEY, String(selectedPlanId))
      } catch {
        // ignore
      }
      return
    }
    const stored = readStoredPlanId()
    const plans = plansQuery.data ?? []
    if (stored && plans.some((p) => p.id === stored)) {
      setSelectedPlanId(stored)
      return
    }
    if (plans[0]) setSelectedPlanId(plans[0].id)
  }, [plansQuery.data, selectedPlanId])

  useEffect(() => {
    if (selectedPlanId == null) {
      setSelectedBranchId(null)
      return
    }
    setSelectedBranchId(readStoredBranchId(selectedPlanId))
  }, [selectedPlanId])

  useEffect(() => {
    if (selectedPlanId != null && selectedBranchId != null) {
      try {
        localStorage.setItem(branchStorageKey(selectedPlanId), String(selectedBranchId))
      } catch {
        // ignore
      }
    }
  }, [selectedPlanId, selectedBranchId])

  const planQuery = useQuery({
    queryKey: ['savings-plan', selectedPlanId, selectedBranchId],
    queryFn: () => fetchSavingsPlan(selectedPlanId!, selectedBranchId),
    enabled: selectedPlanId != null,
  })

  const projectionQuery = useQuery({
    queryKey: ['savings-plan-projection', selectedPlanId, selectedBranchId],
    queryFn: () => fetchPlanProjection(selectedPlanId!, selectedBranchId, true, true),
    enabled: selectedPlanId != null && selectedBranchId != null,
  })

  const plan = planQuery.data
  const mainId = plan ? mainBranchId(plan.branches) : null
  const isOnMain = mainId != null && selectedBranchId === mainId

  // Keep compare base valid when branches change; never auto-enable compare.
  useEffect(() => {
    if (selectedBranchId == null || !plan) {
      setCompareBaseBranchId(null)
      return
    }
    setCompareBaseBranchId((current) => {
      if (current == null) return null
      if (current === selectedBranchId) return null
      if (!plan.branches.some((b) => b.id === current)) return null
      return current
    })
  }, [selectedBranchId, plan])

  const branchNetsQuery = useQuery({
    queryKey: ['savings-plan-branch-nets', selectedPlanId],
    queryFn: () => fetchBranchNets(selectedPlanId!),
    enabled: selectedPlanId != null,
  })

  const canCompare =
    selectedPlanId != null &&
    selectedBranchId != null &&
    compareBaseBranchId != null &&
    selectedBranchId !== compareBaseBranchId

  const compareQuery = useQuery({
    queryKey: [
      'savings-plan-compare',
      selectedPlanId,
      selectedBranchId,
      compareBaseBranchId,
    ],
    queryFn: () =>
      fetchPlanCompare(selectedPlanId!, selectedBranchId!, compareBaseBranchId),
    enabled: canCompare,
  })

  useEffect(() => {
    if (!plan) return
    const fallbackId = defaultBranchId(plan)
    if (selectedBranchId == null) {
      setSelectedBranchId(fallbackId)
      return
    }
    if (!plan.branches.some((b) => b.id === selectedBranchId)) {
      setSelectedBranchId(fallbackId)
    }
  }, [plan, selectedBranchId])

  const sortedBranches = useMemo(() => {
    const branches = plan?.branches ?? []
    return [...branches].sort((a, b) => {
      if (a.is_main) return -1
      if (b.is_main) return 1
      return a.name.localeCompare(b.name)
    })
  }, [plan?.branches])

  const branchNetById = useMemo(() => {
    const map = new Map<number, { net: number; deltaVsMain: number }>()
    for (const row of branchNetsQuery.data?.branches ?? []) {
      map.set(row.branch_id, {
        net: Number(row.net),
        deltaVsMain: Number(row.delta_vs_main),
      })
    }
    return map
  }, [branchNetsQuery.data])

  const compareBaseOptions = useMemo(() => {
    return sortedBranches.filter((branch) => branch.id !== selectedBranchId)
  }, [sortedBranches, selectedBranchId])

  const compareBaseName = useMemo(() => {
    const branch = sortedBranches.find((b) => b.id === compareBaseBranchId)
    if (!branch) return 'base'
    return branch.is_main ? 'Main' : branch.name
  }, [sortedBranches, compareBaseBranchId])

  const branchOptionLabel = (branch: { id: number; name: string; is_main: boolean }) => {
    return branch.is_main ? 'Main' : branch.name
  }

  const selectedVsMainDelta = useMemo(() => {
    if (selectedBranchId == null || isOnMain) return null
    const delta = branchNetById.get(selectedBranchId)?.deltaVsMain
    return delta != null && Number.isFinite(delta) ? delta : null
  }, [selectedBranchId, isOnMain, branchNetById])

  const invalidatePlan = async (planId: number, _branchId?: number | null) => {
    const tasks = [
      queryClient.invalidateQueries({ queryKey: ['savings-plans'] }),
      queryClient.invalidateQueries({ queryKey: ['savings-plan', planId] }),
      queryClient.invalidateQueries({ queryKey: ['savings-plan-projection', planId] }),
      queryClient.invalidateQueries({ queryKey: ['savings-plan-compare', planId] }),
      queryClient.invalidateQueries({ queryKey: ['savings-plan-branch-nets', planId] }),
    ]
    await Promise.all(tasks)
  }

  const selectPlan = (planId: number | null) => {
    setSelectedPlanId(planId)
    setSelectedBranchId(planId != null ? readStoredBranchId(planId) : null)
    setCompareBaseBranchId(null)
    setPlanMetaDraft(null)
    setShowAccountForm(false)
    setEditingAccountId(null)
    setAccountEditForm(null)
    setEditingCashflowId(null)
    setCashflowEditForm(null)
    setEditingOutlookId(null)
    setOutlookEditForm(null)
    setError(null)
    setStatusMessage(null)
  }

  const markSaved = (message: string) => {
    setError(null)
    setStatusMessage(message)
  }

  const createPlanMutation = useMutation({
    mutationFn: createSavingsPlan,
    onSuccess: async (plan) => {
      setPlanForm(emptyPlanForm())
      selectPlan(plan.id)
      await invalidatePlan(plan.id, mainBranchId(plan.branches))
      markSaved('Plan saved.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const updatePlanMutation = useMutation({
    mutationFn: (data: Partial<SavingsPlanCreate>) =>
      updateSavingsPlan(selectedPlanId!, data, selectedBranchId),
    onSuccess: async () => {
      setPlanMetaDraft(null)
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Plan details updated.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const deletePlanMutation = useMutation({
    mutationFn: () => deleteSavingsPlan(selectedPlanId!),
    onSuccess: async () => {
      const remaining = (plansQuery.data ?? []).filter((p) => p.id !== selectedPlanId)
      selectPlan(remaining[0]?.id ?? null)
      await queryClient.invalidateQueries({ queryKey: ['savings-plans'] })
      markSaved('Plan deleted.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const createAccountMutation = useMutation({
    mutationFn: (data: PlanAccountCreate) =>
      createPlanAccount(selectedPlanId!, data, selectedBranchId),
    onSuccess: async (account) => {
      setAccountForm(emptyAccountForm())
      setShowAccountForm(false)
      setExpandedAccountId(account.id)
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Account saved.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateAccountMutation = useMutation({
    mutationFn: ({
      accountId,
      data,
    }: {
      accountId: number
      data: Partial<PlanAccountCreate>
    }) => updatePlanAccount(selectedPlanId!, accountId, data, selectedBranchId),
    onSuccess: async () => {
      setEditingAccountId(null)
      setAccountEditForm(null)
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Account updated.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: number) =>
      deletePlanAccount(selectedPlanId!, accountId, selectedBranchId),
    onSuccess: async () => {
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Account deleted.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const createCashflowMutation = useMutation({
    mutationFn: ({ accountId, data }: { accountId: number; data: CashflowSegmentCreate }) =>
      createCashflow(selectedPlanId!, accountId, data, selectedBranchId),
    onSuccess: async (_result, vars) => {
      setCashflowForms((prev) => ({ ...prev, [vars.accountId]: emptyCashflowForm() }))
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Cashflow saved.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateCashflowMutation = useMutation({
    mutationFn: ({
      accountId,
      cashflowId,
      data,
    }: {
      accountId: number
      cashflowId: number
      data: CashflowSegmentCreate
    }) => updateCashflow(selectedPlanId!, accountId, cashflowId, data, selectedBranchId),
    onSuccess: async () => {
      setEditingCashflowId(null)
      setCashflowEditForm(null)
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Cashflow updated.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteCashflowMutation = useMutation({
    mutationFn: ({ accountId, cashflowId }: { accountId: number; cashflowId: number }) =>
      deleteCashflow(selectedPlanId!, accountId, cashflowId, selectedBranchId),
    onSuccess: async () => {
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Cashflow removed.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const resetCashflowMutation = useMutation({
    mutationFn: ({ accountId, cashflowId }: { accountId: number; cashflowId: number }) =>
      resetCashflowOverride(selectedPlanId!, accountId, cashflowId, selectedBranchId!),
    onSuccess: async () => {
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Cashflow reset to main.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const createOutlookMutation = useMutation({
    mutationFn: ({ accountId, data }: { accountId: number; data: ValueOutlookCreate }) =>
      createOutlook(selectedPlanId!, accountId, data, selectedBranchId),
    onSuccess: async (_result, vars) => {
      setOutlookForms((prev) => ({ ...prev, [vars.accountId]: emptyOutlookForm() }))
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Outlook saved.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateOutlookMutation = useMutation({
    mutationFn: ({
      accountId,
      outlookId,
      data,
    }: {
      accountId: number
      outlookId: number
      data: ValueOutlookCreate
    }) => updateOutlook(selectedPlanId!, accountId, outlookId, data, selectedBranchId),
    onSuccess: async () => {
      setEditingOutlookId(null)
      setOutlookEditForm(null)
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Outlook updated.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteOutlookMutation = useMutation({
    mutationFn: ({ accountId, outlookId }: { accountId: number; outlookId: number }) =>
      deleteOutlook(selectedPlanId!, accountId, outlookId, selectedBranchId),
    onSuccess: async () => {
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Outlook removed.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const resetOutlookMutation = useMutation({
    mutationFn: ({ accountId, outlookId }: { accountId: number; outlookId: number }) =>
      resetOutlookOverride(selectedPlanId!, accountId, outlookId, selectedBranchId!),
    onSuccess: async () => {
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Outlook reset to main.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const createBranchMutation = useMutation({
    mutationFn: (name: string) => createPlanBranch(selectedPlanId!, name),
    onSuccess: async (branch) => {
      setSelectedBranchId(branch.id)
      await invalidatePlan(selectedPlanId!, branch.id)
      markSaved('Branch created.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const renameBranchMutation = useMutation({
    mutationFn: ({ branchId, name }: { branchId: number; name: string }) =>
      updatePlanBranch(selectedPlanId!, branchId, name),
    onSuccess: async () => {
      await invalidatePlan(selectedPlanId!, selectedBranchId)
      markSaved('Branch renamed.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteBranchMutation = useMutation({
    mutationFn: (branchId: number) => deletePlanBranch(selectedPlanId!, branchId),
    onSuccess: async () => {
      const nextMainId = plan ? mainBranchId(plan.branches) : null
      setSelectedBranchId(nextMainId)
      setCompareBaseBranchId(null)
      await invalidatePlan(selectedPlanId!, nextMainId)
      markSaved('Branch deleted.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const mergeBranchMutation = useMutation({
    mutationFn: (branchId: number) => mergePlanBranch(selectedPlanId!, branchId),
    onSuccess: async () => {
      const nextMainId = plan ? mainBranchId(plan.branches) : null
      setSelectedBranchId(nextMainId)
      setCompareBaseBranchId(null)
      await invalidatePlan(selectedPlanId!, nextMainId)
      markSaved('Branch merged into main.')
    },
    onError: (err: Error) => setError(err.message),
  })

  const projection = projectionQuery.data

  const projectionByAccount = useMemo(() => {
    const map = new Map<number, AccountProjection>()
    for (const row of projection?.accounts ?? []) map.set(row.account_id, row)
    return map
  }, [projection])

  const filteredAccounts = useMemo(() => {
    return (plan?.accounts ?? []).filter((account) => kindFilters[account.kind])
  }, [plan?.accounts, kindFilters])

  const filteredStats = useMemo(() => {
    let assets = 0
    let expenses = 0
    for (const row of projection?.accounts ?? []) {
      if (!kindFilters[row.kind]) continue
      if (row.is_expense) expenses += Number(row.end_balance)
      else assets += Number(row.end_balance)
    }
    return { assets, expenses, net: assets - expenses }
  }, [projection?.accounts, kindFilters])

  const filteredCompareAccounts = useMemo(() => {
    return (compareQuery.data?.accounts ?? []).filter((row) => kindFilters[row.kind])
  }, [compareQuery.data?.accounts, kindFilters])

  const filteredCompareNetDelta = useMemo(() => {
    return filteredCompareAccounts.reduce((sum, row) => sum + Number(row.delta), 0)
  }, [filteredCompareAccounts])

  useEffect(() => {
    setChartAccountEnabled((prev) => {
      const next = { ...prev }
      for (const account of filteredAccounts) {
        if (next[account.id] === undefined) next[account.id] = true
      }
      return next
    })
  }, [filteredAccounts])

  const chartVisibleAccountIds = useMemo(() => {
    return filteredAccounts
      .filter((account) => chartAccountEnabled[account.id] !== false)
      .map((account) => account.id)
  }, [filteredAccounts, chartAccountEnabled])

  const currentBranchTitle = useMemo(() => {
    const branch = sortedBranches.find((b) => b.id === selectedBranchId)
    if (!branch) return 'Current branch'
    return branch.is_main ? 'Main' : branch.name
  }, [sortedBranches, selectedBranchId])

  const getCashflowForm = (accountId: number) => cashflowForms[accountId] ?? emptyCashflowForm()
  const getOutlookForm = (accountId: number) => outlookForms[accountId] ?? emptyOutlookForm()

  const toggleKindFilter = (kind: PlanAccountKind) => {
    setKindFilters((prev) => ({ ...prev, [kind]: !prev[kind] }))
  }

  const toggleChartAccount = (accountId: number) => {
    setChartAccountEnabled((prev) => ({
      ...prev,
      [accountId]: !(prev[accountId] !== false),
    }))
  }

  const accountTypeFilter = (
    <div className="planner-kind-filters" role="group" aria-label="Filter by account type">
      {ALL_ACCOUNT_KINDS.map((kind) => (
        <label key={kind} className="planner-kind-filter">
          <input
            type="checkbox"
            checked={kindFilters[kind]}
            onChange={() => toggleKindFilter(kind)}
          />
          {KIND_LABELS[kind]}
        </label>
      ))}
    </div>
  )

  return (
    <div className="planner-page">
      <div className="page-header">
        <div>
          <h1>Forkline</h1>
          <p className="page-subtitle">
            Plan savings scenarios locally. Edits autosave in this browser; download a JSON file to
            back up or move a plan.
          </p>
        </div>
        <div className="page-header-actions">
          <label className="btn secondary">
            Open plan…
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const text = await file.text()
                  const imported = await importPlanFile(text)
                  selectPlan(imported.id)
                  await queryClient.invalidateQueries({ queryKey: ['savings-plans'] })
                  await invalidatePlan(imported.id)
                  markSaved(`Opened “${imported.name}”.`)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to open plan file')
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            disabled={selectedPlanId == null}
            onClick={() => {
              if (selectedPlanId == null) return
              try {
                downloadPlan(selectedPlanId)
                markSaved('Plan downloaded.')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Download failed')
              }
            }}
          >
            Download JSON
          </button>
        </div>
      </div>

      {error && <div className="status-box danger">{error}</div>}
      {statusMessage && !error && <div className="status-box success">{statusMessage}</div>}

      <div className="planner-layout">
        <aside className="panel planner-sidebar">
          <div className="card-header">
            <h2 className="panel-title">Your plans</h2>
          </div>
          <p className="panel-desc">Saved in this browser. Download to back up.</p>
          <ul className="planner-plan-list">
            {(plansQuery.data ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={selectedPlanId === item.id ? 'active' : ''}
                  onClick={() => selectPlan(item.id)}
                >
                  <span className="planner-plan-name">{item.name}</span>
                  <span className="planner-plan-meta">
                    {item.target_date} · {item.account_count} accounts
                  </span>
                </button>
              </li>
            ))}
            {!plansQuery.isLoading && (plansQuery.data ?? []).length === 0 && (
              <li className="card-empty">No saved plans yet.</li>
            )}
          </ul>

          <form
            className="planner-create-plan"
            onSubmit={(e) => {
              e.preventDefault()
              if (!planForm.name.trim()) return
              createPlanMutation.mutate({
                name: planForm.name.trim(),
                target_date: planForm.target_date,
                notes: planForm.notes || null,
              })
            }}
          >
            <h3>New plan</h3>
            <label>
              Name
              <input
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                required
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                value={planForm.target_date}
                onChange={(e) => setPlanForm({ ...planForm, target_date: e.target.value })}
                required
              />
            </label>
            <button type="submit" className="btn primary" disabled={createPlanMutation.isPending}>
              Save new plan
            </button>
          </form>

          <PrePostTaxCalculator />
        </aside>

        <div className="planner-main">
          {!selectedPlanId && <div className="panel card-empty">Create or select a plan to edit.</div>}

          {selectedPlanId && (planQuery.isLoading || selectedBranchId == null) && (
            <div className="panel">Loading plan…</div>
          )}

          {plan && selectedBranchId != null && (
            <>
              <section className="panel planner-summary">
                <div className="card-header">
                  <div>
                    <h2 className="panel-title">{plan.name}</h2>
                    <p className="panel-desc">Target {plan.target_date}</p>
                  </div>
                  <div className="page-header-actions">
                    {isOnMain && (
                      <>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            if (planMetaDraft) {
                              setPlanMetaDraft(null)
                              return
                            }
                            setPlanMetaDraft({
                              name: plan.name,
                              target_date: plan.target_date,
                              notes: plan.notes,
                            })
                          }}
                        >
                          {planMetaDraft ? 'Cancel' : 'Edit plan'}
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => {
                            if (window.confirm(`Delete plan "${plan.name}"?`)) {
                              deletePlanMutation.mutate()
                            }
                          }}
                        >
                          Delete plan
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="planner-branch-toolbar">
                  <label>
                    Branch
                    <select
                      value={selectedBranchId ?? ''}
                      onChange={(e) => {
                        const id = Number(e.target.value)
                        if (Number.isFinite(id)) setSelectedBranchId(id)
                      }}
                    >
                      {sortedBranches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branchOptionLabel(branch)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedVsMainDelta != null && (
                    <span
                      className={`planner-branch-delta ${deltaToneClass(selectedVsMainDelta)}`}
                      title="Net at target vs Main"
                    >
                      <SignedDelta value={selectedVsMainDelta} suffix="vs Main" />
                    </span>
                  )}
                  {compareBaseOptions.length > 0 && (
                    <>
                      <label>
                        Compare against
                        <select
                          value={compareBaseBranchId ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (!raw) {
                              setCompareBaseBranchId(null)
                              return
                            }
                            const id = Number(raw)
                            if (Number.isFinite(id)) setCompareBaseBranchId(id)
                          }}
                        >
                          <option value="">None</option>
                          {compareBaseOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.is_main ? 'Main' : branch.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {compareBaseBranchId != null && (
                        <button
                          type="button"
                          className="btn secondary planner-branch-swap"
                          aria-label="Swap current branch and compare target"
                          title="Swap branches"
                          disabled={selectedBranchId == null}
                          onClick={() => {
                            const current = selectedBranchId
                            const base = compareBaseBranchId
                            if (current == null || base == null) return
                            setSelectedBranchId(base)
                            setCompareBaseBranchId(current)
                          }}
                        >
                          ⇄ Swap
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={createBranchMutation.isPending}
                    onClick={() => {
                      const name = window.prompt('Branch name')
                      if (!name?.trim()) return
                      createBranchMutation.mutate(name.trim())
                    }}
                  >
                    Create branch
                  </button>
                  {!isOnMain && selectedBranchId != null && (
                    <>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={renameBranchMutation.isPending}
                        onClick={() => {
                          const current =
                            sortedBranches.find((b) => b.id === selectedBranchId)?.name ?? ''
                          const name = window.prompt('Rename branch', current)
                          if (!name?.trim() || name.trim() === current) return
                          renameBranchMutation.mutate({
                            branchId: selectedBranchId,
                            name: name.trim(),
                          })
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={mergeBranchMutation.isPending}
                        onClick={() => {
                          const branchName =
                            sortedBranches.find((b) => b.id === selectedBranchId)?.name ?? 'branch'
                          if (
                            window.confirm(`Merge "${branchName}" into Main? This cannot be undone.`)
                          ) {
                            mergeBranchMutation.mutate(selectedBranchId)
                          }
                        }}
                      >
                        Merge into main
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={deleteBranchMutation.isPending}
                        onClick={() => {
                          const branchName =
                            sortedBranches.find((b) => b.id === selectedBranchId)?.name ?? 'branch'
                          if (window.confirm(`Delete branch "${branchName}"?`)) {
                            deleteBranchMutation.mutate(selectedBranchId)
                          }
                        }}
                      >
                        Delete branch
                      </button>
                    </>
                  )}
                </div>

                {planMetaDraft && isOnMain && (
                  <form
                    className="form-grid planner-meta-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      updatePlanMutation.mutate({
                        name: planMetaDraft.name.trim(),
                        target_date: planMetaDraft.target_date,
                        notes: planMetaDraft.notes || null,
                      })
                    }}
                  >
                    <label>
                      Name
                      <input
                        value={planMetaDraft.name}
                        onChange={(e) =>
                          setPlanMetaDraft({ ...planMetaDraft, name: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Target date
                      <input
                        type="date"
                        value={planMetaDraft.target_date}
                        onChange={(e) =>
                          setPlanMetaDraft({ ...planMetaDraft, target_date: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="full-width">
                      Notes
                      <input
                        value={planMetaDraft.notes ?? ''}
                        onChange={(e) =>
                          setPlanMetaDraft({ ...planMetaDraft, notes: e.target.value })
                        }
                      />
                    </label>
                    <button type="submit" className="btn primary" disabled={updatePlanMutation.isPending}>
                      Save plan details
                    </button>
                  </form>
                )}

                <div className="planner-stats">
                  <div className="stat-card">
                    <span className="stat-label">Holdings</span>
                    <strong>{formatCurrency(filteredStats.assets)}</strong>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Expenses</span>
                    <strong>{formatCurrency(filteredStats.expenses)}</strong>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Net at target</span>
                    <strong>{formatCurrency(filteredStats.net)}</strong>
                  </div>
                  {canCompare && compareQuery.data && (
                    <div className="stat-card">
                      <span className="stat-label">Δ vs {compareBaseName}</span>
                      <strong className={deltaToneClass(filteredCompareNetDelta)}>
                        {formatSignedDelta(filteredCompareNetDelta)}
                      </strong>
                    </div>
                  )}
                </div>

                {accountTypeFilter}
              </section>

              {plan && (
                <PlannerTimelineCharts
                  accounts={filteredAccounts}
                  visibleAccountIds={chartVisibleAccountIds}
                  onToggleAccount={toggleChartAccount}
                  onShowAll={() => {
                    setChartAccountEnabled((prev) => {
                      const next = { ...prev }
                      for (const account of filteredAccounts) next[account.id] = true
                      return next
                    })
                  }}
                  onHideAll={() => {
                    setChartAccountEnabled((prev) => {
                      const next = { ...prev }
                      for (const account of filteredAccounts) next[account.id] = false
                      return next
                    })
                  }}
                  currentProjection={projection}
                  currentTitle={currentBranchTitle}
                  showCompare={canCompare && !!compareQuery.data}
                  compareProjection={compareQuery.data?.base}
                  compareTitle={compareBaseName}
                />
              )}

              {canCompare && (
                <section className="panel planner-compare">
                  <div className="card-header">
                    <h2 className="panel-title">Compare vs {compareBaseName}</h2>
                    {compareQuery.data && (
                      <p className="panel-desc">
                        Net delta at target:{' '}
                        <SignedDelta value={filteredCompareNetDelta} />
                      </p>
                    )}
                  </div>
                  {compareQuery.isLoading && <p className="card-empty">Loading comparison…</p>}
                  {compareQuery.isError && (
                    <p className="card-empty">
                      Could not compare:{' '}
                      {compareQuery.error instanceof Error
                        ? compareQuery.error.message
                        : 'Unknown error'}
                    </p>
                  )}
                  {compareQuery.data && (
                    <ul className="planner-item-list">
                      {filteredCompareAccounts.map((row) => (
                        <li key={row.account_id} className="planner-item-row">
                          <div>
                            <strong>{row.name}</strong>
                            <div className="planner-item-meta">
                              {compareBaseName} {formatCurrency(row.base_end_balance)} · Current{' '}
                              {formatCurrency(row.branch_end_balance)} · Delta{' '}
                              <SignedDelta value={row.delta} />
                            </div>
                          </div>
                        </li>
                      ))}
                      {filteredCompareAccounts.length === 0 && (
                        <li className="card-empty">No accounts match the selected types.</li>
                      )}
                    </ul>
                  )}
                </section>
              )}

              <section className="panel">
                <div className="card-header">
                  <h2 className="panel-title">Accounts</h2>
                  {isOnMain ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setShowAccountForm((v) => !v)}
                    >
                      {showAccountForm ? 'Cancel' : 'Add account'}
                    </button>
                  ) : (
                    <p className="panel-desc">Accounts are shared from Main</p>
                  )}
                </div>

                {showAccountForm && isOnMain && (
                  <AccountFieldsForm
                    form={accountForm}
                    onChange={setAccountForm}
                    submitLabel="Save account"
                    pending={createAccountMutation.isPending}
                    onSubmit={() => {
                      if (!accountForm.name.trim()) return
                      createAccountMutation.mutate({
                        ...accountForm,
                        name: accountForm.name.trim(),
                        description: accountForm.description || null,
                        start_balance: Number(accountForm.start_balance) || 0,
                      })
                    }}
                  />
                )}

                <div className="planner-accounts">
                  {filteredAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      accountsReadOnly={!isOnMain}
                      expanded={expandedAccountId === account.id}
                      projected={projectionByAccount.get(account.id)}
                      onToggle={() => {
                        setExpandedAccountId((id) => (id === account.id ? null : account.id))
                        setEditingAccountId(null)
                        setAccountEditForm(null)
                        setEditingCashflowId(null)
                        setCashflowEditForm(null)
                        setEditingOutlookId(null)
                        setOutlookEditForm(null)
                      }}
                      editingAccount={editingAccountId === account.id}
                      accountEditForm={accountEditForm}
                      onStartEditAccount={() => {
                        setExpandedAccountId(account.id)
                        setEditingAccountId(account.id)
                        setAccountEditForm(accountToForm(account))
                      }}
                      onCancelEditAccount={() => {
                        setEditingAccountId(null)
                        setAccountEditForm(null)
                      }}
                      onAccountEditChange={setAccountEditForm}
                      onSaveAccount={() => {
                        if (!accountEditForm?.name.trim()) return
                        updateAccountMutation.mutate({
                          accountId: account.id,
                          data: {
                            ...accountEditForm,
                            name: accountEditForm.name.trim(),
                            description: accountEditForm.description || null,
                            start_balance: Number(accountEditForm.start_balance) || 0,
                          },
                        })
                      }}
                      savingAccount={updateAccountMutation.isPending}
                      onDelete={() => {
                        if (window.confirm(`Delete account "${account.name}"?`)) {
                          deleteAccountMutation.mutate(account.id)
                        }
                      }}
                      cashflowForm={getCashflowForm(account.id)}
                      onCashflowChange={(form) => {
                        setCashflowForms((prev) => ({ ...prev, [account.id]: form }))
                      }}
                      onAddCashflow={() => {
                        try {
                          createCashflowMutation.mutate({
                            accountId: account.id,
                            data: normalizeCashflowPayload(getCashflowForm(account.id)),
                          })
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        }
                      }}
                      editingCashflowId={editingCashflowId}
                      cashflowEditForm={cashflowEditForm}
                      onStartEditCashflow={(segment) => {
                        setEditingCashflowId(segment.id)
                        setCashflowEditForm(cashflowToForm(segment))
                        setEditingOutlookId(null)
                        setOutlookEditForm(null)
                      }}
                      onCancelEditCashflow={() => {
                        setEditingCashflowId(null)
                        setCashflowEditForm(null)
                      }}
                      onCashflowEditChange={setCashflowEditForm}
                      onSaveCashflow={() => {
                        if (!cashflowEditForm || editingCashflowId == null) return
                        try {
                          updateCashflowMutation.mutate({
                            accountId: account.id,
                            cashflowId: editingCashflowId,
                            data: normalizeCashflowPayload(cashflowEditForm),
                          })
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        }
                      }}
                      savingCashflow={updateCashflowMutation.isPending}
                      onDeleteCashflow={(cashflowId) => {
                        deleteCashflowMutation.mutate({ accountId: account.id, cashflowId })
                      }}
                      onResetCashflow={(cashflowId) => {
                        resetCashflowMutation.mutate({ accountId: account.id, cashflowId })
                      }}
                      resettingCashflow={resetCashflowMutation.isPending}
                      outlookForm={getOutlookForm(account.id)}
                      onOutlookChange={(form) => {
                        setOutlookForms((prev) => ({ ...prev, [account.id]: form }))
                      }}
                      onAddOutlook={() => {
                        createOutlookMutation.mutate({
                          accountId: account.id,
                          data: normalizeOutlookPayload(getOutlookForm(account.id)),
                        })
                      }}
                      editingOutlookId={editingOutlookId}
                      outlookEditForm={outlookEditForm}
                      onStartEditOutlook={(outlook) => {
                        setEditingOutlookId(outlook.id)
                        setOutlookEditForm(outlookToForm(outlook))
                        setEditingCashflowId(null)
                        setCashflowEditForm(null)
                      }}
                      onCancelEditOutlook={() => {
                        setEditingOutlookId(null)
                        setOutlookEditForm(null)
                      }}
                      onOutlookEditChange={setOutlookEditForm}
                      onSaveOutlook={() => {
                        if (!outlookEditForm || editingOutlookId == null) return
                        updateOutlookMutation.mutate({
                          accountId: account.id,
                          outlookId: editingOutlookId,
                          data: normalizeOutlookPayload(outlookEditForm),
                        })
                      }}
                      savingOutlook={updateOutlookMutation.isPending}
                      onDeleteOutlook={(outlookId) => {
                        deleteOutlookMutation.mutate({ accountId: account.id, outlookId })
                      }}
                      onResetOutlook={(outlookId) => {
                        resetOutlookMutation.mutate({ accountId: account.id, outlookId })
                      }}
                      resettingOutlook={resetOutlookMutation.isPending}
                    />
                  ))}
                  {plan.accounts.length === 0 && (
                    <p className="card-empty">Add savings, assets, pre-tax, or expense accounts.</p>
                  )}
                  {plan.accounts.length > 0 && filteredAccounts.length === 0 && (
                    <p className="card-empty">No accounts match the selected types.</p>
                  )}
                </div>
              </section>

              <AccountJournalPanel
                projection={projection}
                accountIds={filteredAccounts.map((account) => account.id)}
                isLoading={projectionQuery.isLoading}
                error={
                  projectionQuery.isError
                    ? projectionQuery.error instanceof Error
                      ? projectionQuery.error.message
                      : 'Could not load journal'
                    : null
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AccountFieldsForm({
  form,
  onChange,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
}: {
  form: PlanAccountCreate
  onChange: (form: PlanAccountCreate) => void
  onSubmit: () => void
  submitLabel: string
  pending?: boolean
  onCancel?: () => void
}) {
  return (
    <form
      className="form-grid planner-account-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label>
        Kind
        <select
          value={form.kind}
          onChange={(e) => onChange({ ...form, kind: e.target.value as PlanAccountKind })}
        >
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          required
        />
      </label>
      <label>
        Start balance
        <input
          type="number"
          step="0.01"
          value={form.start_balance ?? 0}
          onChange={(e) => onChange({ ...form, start_balance: Number(e.target.value) })}
        />
      </label>
      <label>
        Start date
        <input
          type="date"
          value={form.start_date}
          onChange={(e) => onChange({ ...form, start_date: e.target.value })}
        />
      </label>
      <label className="full-width">
        Description
        <input
          value={form.description ?? ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </label>
      <div className="planner-form-actions">
        <button type="submit" className="btn primary" disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function CashflowFieldsForm({
  form,
  onChange,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
}: {
  form: CashflowSegmentCreate
  onChange: (form: CashflowSegmentCreate) => void
  onSubmit: () => void
  submitLabel: string
  pending?: boolean
  onCancel?: () => void
}) {
  return (
    <form
      className="form-grid planner-inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label>
        Amount
        <input
          type="text"
          inputMode="decimal"
          value={form.amount === undefined || form.amount === null ? '' : String(form.amount)}
          onChange={(e) => {
            const next = e.target.value.trim()
            if (!isAmountDraft(next)) return
            onChange({ ...form, amount: next })
          }}
          placeholder="-30000"
          required
        />
        <span className="planner-field-hint">Use a negative amount for withdrawals (e.g. -30000).</span>
      </label>
      <label>
        Tax rate
        <input
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={form.tax_rate ?? 0}
          onChange={(e) => onChange({ ...form, tax_rate: Number(e.target.value) })}
          placeholder="0.35"
        />
      </label>
      <label>
        Frequency
        <select
          value={form.frequency}
          onChange={(e) =>
            onChange({ ...form, frequency: e.target.value as CashflowFrequency })
          }
        >
          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mode
        <select
          value={form.mode}
          onChange={(e) => onChange({ ...form, mode: e.target.value as CashflowMode })}
        >
          <option value="base">Base</option>
          <option value="overlay">Overlay (extra)</option>
        </select>
      </label>
      <label>
        Start
        <input
          type="date"
          value={form.start_date}
          onChange={(e) => onChange({ ...form, start_date: e.target.value })}
          required
        />
      </label>
      <label>
        End (optional)
        <input
          type="date"
          value={form.end_date ?? ''}
          onChange={(e) => onChange({ ...form, end_date: e.target.value || null })}
        />
      </label>
      {form.frequency === 'custom' && (
        <label>
          Every N months
          <input
            type="number"
            min="1"
            value={form.interval_count ?? 1}
            onChange={(e) =>
              onChange({ ...form, interval_count: Number(e.target.value) || 1 })
            }
          />
        </label>
      )}
      <label className="full-width">
        Description
        <input
          value={form.description ?? ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </label>
      <div className="planner-form-actions">
        <button type="submit" className="btn primary" disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function OutlookFieldsForm({
  form,
  onChange,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
}: {
  form: ValueOutlookCreate
  onChange: (form: ValueOutlookCreate) => void
  onSubmit: () => void
  submitLabel: string
  pending?: boolean
  onCancel?: () => void
}) {
  return (
    <form
      className="form-grid planner-inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label>
        Type
        <select
          value={form.outlook_type}
          onChange={(e) =>
            onChange({ ...form, outlook_type: e.target.value as ValueOutlookType })
          }
        >
          <option value="growth_rate">Growth rate</option>
          <option value="target_value">Target value</option>
        </select>
      </label>
      {form.outlook_type === 'growth_rate' ? (
        <label>
          Annual rate
          <input
            type="number"
            step="0.01"
            value={form.rate_annual ?? 0}
            onChange={(e) => onChange({ ...form, rate_annual: Number(e.target.value) })}
            placeholder="0.10"
          />
        </label>
      ) : (
        <label>
          Target amount
          <input
            type="number"
            step="0.01"
            value={form.target_amount ?? 0}
            onChange={(e) => onChange({ ...form, target_amount: Number(e.target.value) })}
          />
        </label>
      )}
      <label>
        Effective date
        <input
          type="date"
          value={form.effective_date}
          onChange={(e) => onChange({ ...form, effective_date: e.target.value })}
          required
        />
      </label>
      <label className="full-width">
        Description
        <input
          value={form.description ?? ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </label>
      <div className="planner-form-actions">
        <button type="submit" className="btn primary" disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function AccountCard({
  account,
  accountsReadOnly,
  expanded,
  projected,
  onToggle,
  editingAccount,
  accountEditForm,
  onStartEditAccount,
  onCancelEditAccount,
  onAccountEditChange,
  onSaveAccount,
  savingAccount,
  onDelete,
  cashflowForm,
  onCashflowChange,
  onAddCashflow,
  editingCashflowId,
  cashflowEditForm,
  onStartEditCashflow,
  onCancelEditCashflow,
  onCashflowEditChange,
  onSaveCashflow,
  savingCashflow,
  onDeleteCashflow,
  onResetCashflow,
  resettingCashflow,
  outlookForm,
  onOutlookChange,
  onAddOutlook,
  editingOutlookId,
  outlookEditForm,
  onStartEditOutlook,
  onCancelEditOutlook,
  onOutlookEditChange,
  onSaveOutlook,
  savingOutlook,
  onDeleteOutlook,
  onResetOutlook,
  resettingOutlook,
}: {
  account: PlanAccount
  accountsReadOnly?: boolean
  expanded: boolean
  projected?: { end_balance: string | number; total_cashflows: string | number }
  onToggle: () => void
  editingAccount: boolean
  accountEditForm: PlanAccountCreate | null
  onStartEditAccount: () => void
  onCancelEditAccount: () => void
  onAccountEditChange: (form: PlanAccountCreate | null) => void
  onSaveAccount: () => void
  savingAccount?: boolean
  onDelete: () => void
  cashflowForm: CashflowSegmentCreate
  onCashflowChange: (form: CashflowSegmentCreate) => void
  onAddCashflow: () => void
  editingCashflowId: number | null
  cashflowEditForm: CashflowSegmentCreate | null
  onStartEditCashflow: (segment: CashflowSegment) => void
  onCancelEditCashflow: () => void
  onCashflowEditChange: (form: CashflowSegmentCreate | null) => void
  onSaveCashflow: () => void
  savingCashflow?: boolean
  onDeleteCashflow: (id: number) => void
  onResetCashflow: (id: number) => void
  resettingCashflow?: boolean
  outlookForm: ValueOutlookCreate
  onOutlookChange: (form: ValueOutlookCreate) => void
  onAddOutlook: () => void
  editingOutlookId: number | null
  outlookEditForm: ValueOutlookCreate | null
  onStartEditOutlook: (outlook: ValueOutlook) => void
  onCancelEditOutlook: () => void
  onOutlookEditChange: (form: ValueOutlookCreate | null) => void
  onSaveOutlook: () => void
  savingOutlook?: boolean
  onDeleteOutlook: (id: number) => void
  onResetOutlook: (id: number) => void
  resettingOutlook?: boolean
}) {
  return (
    <div className={`planner-account ${expanded ? 'is-expanded' : ''}`}>
      <div className="planner-account-header">
        <button type="button" className="planner-account-toggle" onClick={onToggle}>
          <span className="planner-account-kind">{KIND_LABELS[account.kind]}</span>
          <span className="planner-account-name">{account.name}</span>
          <span className="planner-account-balance">
            {formatCurrency(projected?.end_balance ?? account.start_balance)}
          </span>
        </button>
        {!accountsReadOnly && (
          <button type="button" className="btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>

      {expanded && (
        <div className="planner-account-body">
          <div className="planner-subsection">
            <div className="card-header">
              <h3>Account details</h3>
              {!accountsReadOnly && !editingAccount && (
                <button type="button" className="btn linkish" onClick={onStartEditAccount}>
                  Edit
                </button>
              )}
            </div>
            {editingAccount && accountEditForm ? (
              <AccountFieldsForm
                form={accountEditForm}
                onChange={(form) => onAccountEditChange(form)}
                onSubmit={onSaveAccount}
                submitLabel="Save account"
                pending={savingAccount}
                onCancel={onCancelEditAccount}
              />
            ) : (
              <>
                {account.description && <p className="panel-desc">{account.description}</p>}
                <p className="panel-desc">
                  Start {formatCurrency(account.start_balance)} on {account.start_date}
                  {projected ? ` · Cashflows ${formatCurrency(projected.total_cashflows)}` : ''}
                </p>
              </>
            )}
          </div>

          <div className="planner-subsection">
            <h3>Cashflows</h3>
            <ul className="planner-item-list">
              {account.cashflows.map((cf) => (
                <li key={cf.id} className="planner-item-block">
                  {editingCashflowId === cf.id && cashflowEditForm ? (
                    <CashflowFieldsForm
                      form={cashflowEditForm}
                      onChange={(form) => onCashflowEditChange(form)}
                      onSubmit={onSaveCashflow}
                      submitLabel="Save cashflow"
                      pending={savingCashflow}
                      onCancel={onCancelEditCashflow}
                    />
                  ) : (
                    <div className="planner-item-row">
                      <div>
                        <strong>{formatCurrency(cf.amount)}</strong> {FREQUENCY_LABELS[cf.frequency]}
                        {' '}
                        <SourceBadge source={cf.source} />
                        {Number(cf.amount) < 0 ? ' · withdrawal' : ''}
                        {cf.mode === 'overlay' ? ' · overlay' : ''}
                        {taxPercentLabel(cf.tax_rate) ? ` · ${taxPercentLabel(cf.tax_rate)}` : ''}
                        <div className="planner-item-meta">
                          {cf.start_date}
                          {cf.end_date ? ` → ${cf.end_date}` : ' → open'}
                          {cf.description ? ` · ${cf.description}` : ''}
                        </div>
                      </div>
                      <div className="planner-item-actions">
                        <button
                          type="button"
                          className="btn linkish"
                          onClick={() => onStartEditCashflow(cf)}
                        >
                          Edit
                        </button>
                        {cf.source === 'override' && (
                          <button
                            type="button"
                            className="btn linkish"
                            disabled={resettingCashflow}
                            onClick={() => onResetCashflow(cf.id)}
                          >
                            Reset to main
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn linkish"
                          onClick={() => onDeleteCashflow(cf.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {account.cashflows.length === 0 && (
                <li className="card-empty">No cashflows yet.</li>
              )}
            </ul>

            <CashflowFieldsForm
              form={cashflowForm}
              onChange={onCashflowChange}
              onSubmit={onAddCashflow}
              submitLabel="Add cashflow"
            />
          </div>

          <div className="planner-subsection">
            <h3>Value outlooks</h3>
            <ul className="planner-item-list">
              {account.outlooks.map((outlook) => (
                <li key={outlook.id} className="planner-item-block">
                  {editingOutlookId === outlook.id && outlookEditForm ? (
                    <OutlookFieldsForm
                      form={outlookEditForm}
                      onChange={(form) => onOutlookEditChange(form)}
                      onSubmit={onSaveOutlook}
                      submitLabel="Save outlook"
                      pending={savingOutlook}
                      onCancel={onCancelEditOutlook}
                    />
                  ) : (
                    <div className="planner-item-row">
                      <div>
                        <strong>
                          {outlook.outlook_type === 'growth_rate'
                            ? `${(Number(outlook.rate_annual) * 100).toFixed(1)}% / year`
                            : formatCurrency(outlook.target_amount ?? 0)}
                        </strong>
                        {' '}
                        <SourceBadge source={outlook.source} />
                        <div className="planner-item-meta">
                          from {outlook.effective_date}
                          {outlook.description ? ` · ${outlook.description}` : ''}
                        </div>
                      </div>
                      <div className="planner-item-actions">
                        <button
                          type="button"
                          className="btn linkish"
                          onClick={() => onStartEditOutlook(outlook)}
                        >
                          Edit
                        </button>
                        {outlook.source === 'override' && (
                          <button
                            type="button"
                            className="btn linkish"
                            disabled={resettingOutlook}
                            onClick={() => onResetOutlook(outlook.id)}
                          >
                            Reset to main
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn linkish"
                          onClick={() => onDeleteOutlook(outlook.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {account.outlooks.length === 0 && (
                <li className="card-empty">No outlooks yet.</li>
              )}
            </ul>

            <OutlookFieldsForm
              form={outlookForm}
              onChange={onOutlookChange}
              onSubmit={onAddOutlook}
              submitLabel="Add outlook"
            />
          </div>
        </div>
      )}
    </div>
  )
}
