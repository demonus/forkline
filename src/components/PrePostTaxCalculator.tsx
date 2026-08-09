import { useMemo, useState } from 'react'
import { formatCurrency } from '../utils/format'

type AmountBasis = 'pre_tax' | 'post_tax'

function isAmountDraft(value: string) {
  return value === '' || /^\d*\.?\d*$/.test(value)
}

function isPercentDraft(value: string) {
  return value === '' || /^\d*\.?\d*$/.test(value)
}

/**
 * Allocate a fixed take-home (post-tax) budget between post-tax and pre-tax buckets.
 * Slider 0 = all post-tax, 1 = all converted to pre-tax via / (1 - taxRate).
 */
export function allocatePrePostTax(params: {
  amount: number
  basis: AmountBasis
  taxRate: number
  slider: number
}) {
  const amount = Number.isFinite(params.amount) ? Math.max(0, params.amount) : 0
  const taxRate = Math.min(0.99, Math.max(0, params.taxRate))
  const slider = Math.min(1, Math.max(0, params.slider))
  const keep = 1 - taxRate

  const postTaxBudget = params.basis === 'post_tax' ? amount : amount * keep
  const postTax = postTaxBudget * (1 - slider)
  const preTax = keep > 0 ? (postTaxBudget * slider) / keep : 0

  return {
    postTaxBudget,
    preTax,
    postTax,
  }
}

export function PrePostTaxCalculator() {
  const [amountText, setAmountText] = useState('2000')
  const [basis, setBasis] = useState<AmountBasis>('post_tax')
  const [taxPercentText, setTaxPercentText] = useState('35')
  const [slider, setSlider] = useState(0)

  const amount = Number(amountText)
  const taxPercent = Number(taxPercentText)
  const taxRate = (Number.isFinite(taxPercent) ? taxPercent : 0) / 100

  const allocation = useMemo(
    () =>
      allocatePrePostTax({
        amount: Number.isFinite(amount) ? amount : 0,
        basis,
        taxRate,
        slider,
      }),
    [amount, basis, taxRate, slider],
  )

  return (
    <div className="planner-tax-calculator">
      <h3>Pre / post-tax split</h3>
      <p className="panel-desc">
        Model how much of a savings budget stays post-tax vs converts to pre-tax (e.g. 401k).
      </p>

      <label>
        Amount
        <input
          type="text"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => {
            const next = e.target.value.trim()
            if (!isAmountDraft(next)) return
            setAmountText(next)
          }}
          placeholder="2000"
        />
      </label>

      <fieldset className="planner-tax-basis">
        <legend>Amount is</legend>
        <div className="planner-tax-basis-options">
          <label>
            <input
              type="radio"
              name="tax-basis"
              checked={basis === 'post_tax'}
              onChange={() => setBasis('post_tax')}
            />
            Post-tax
          </label>
          <label>
            <input
              type="radio"
              name="tax-basis"
              checked={basis === 'pre_tax'}
              onChange={() => setBasis('pre_tax')}
            />
            Pre-tax
          </label>
        </div>
      </fieldset>

      <label>
        Tax rate (%)
        <input
          type="text"
          inputMode="decimal"
          value={taxPercentText}
          onChange={(e) => {
            const next = e.target.value.trim()
            if (!isPercentDraft(next)) return
            setTaxPercentText(next)
          }}
          placeholder="35"
        />
      </label>

      <div className="planner-tax-split-fields">
        <div className="planner-tax-split-value">
          <span className="stat-label">Pre-tax</span>
          <strong>{formatCurrency(allocation.preTax)}</strong>
        </div>
        <div className="planner-tax-split-value">
          <span className="stat-label">Post-tax</span>
          <strong>{formatCurrency(allocation.postTax)}</strong>
        </div>
      </div>

      <label className="planner-tax-slider">
        <span className="planner-tax-slider-ends">
          <span>Pre-tax</span>
          <span>Post-tax</span>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round((1 - slider) * 1000)}
          onChange={(e) => {
            const postShare = Number(e.target.value) / 1000
            setSlider(1 - postShare)
          }}
          aria-label="Allocate between pre-tax and post-tax"
        />
      </label>

      <p className="planner-field-hint">
        Post-tax budget: {formatCurrency(allocation.postTaxBudget)}. Sliding left converts
        take-home dollars into pre-tax contributions at the tax rate.
      </p>
    </div>
  )
}
