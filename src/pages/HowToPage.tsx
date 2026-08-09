import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="doc-example" aria-label={title}>
      <h3 className="doc-example-title">{title}</h3>
      {children}
    </aside>
  )
}

export function HowToPage() {
  return (
    <div className="doc-page">
      <div className="page-header">
        <div>
          <h1>How to use Forkline</h1>
          <p className="page-subtitle">
            A walkthrough from your first plan to branches, compare, and JSON backup — with a running
            example along the way.
          </p>
        </div>
      </div>

      <nav className="panel doc-toc" aria-label="On this page">
        <h2 className="panel-title">On this page</h2>
        <ol className="doc-toc-list">
          <li>
            <a href="#create-plan">Create a plan</a>
          </li>
          <li>
            <a href="#accounts">Add accounts</a>
          </li>
          <li>
            <a href="#cashflows">Cashflows &amp; tax</a>
          </li>
          <li>
            <a href="#outlooks">Growth &amp; target outlooks</a>
          </li>
          <li>
            <a href="#read-results">Read the projection</a>
          </li>
          <li>
            <a href="#branches">Scenario branches</a>
          </li>
          <li>
            <a href="#files">Download, open &amp; local save</a>
          </li>
          <li>
            <a href="#tips">Tips</a>
          </li>
        </ol>
      </nav>

      <section className="panel doc-section" id="create-plan">
        <h2 className="panel-title">1. Create a plan</h2>
        <p>
          In the sidebar, use <strong>New plan</strong>. Give it a clear name and a{' '}
          <strong>target date</strong> — the last month Forkline will project. You can change the
          name, date, and notes later on Main.
        </p>
        <Example title="Example — “House down payment”">
          <ul className="doc-list">
            <li>
              Name: <code>House down payment</code>
            </li>
            <li>
              Target date: <code>2030-06-01</code>
            </li>
            <li>
              Notes: <code>20% on a $500k home ≈ $100k</code>
            </li>
          </ul>
          <p className="doc-example-note">
            Forkline will project through June 2030. Pick a date that matches your decision point,
            not necessarily “retirement forever.”
          </p>
        </Example>
      </section>

      <section className="panel doc-section" id="accounts">
        <h2 className="panel-title">2. Add accounts</h2>
        <p>
          Accounts can only be created and edited on the <strong>Main</strong> branch. Choose a
          type:
        </p>
        <ul className="doc-list">
          <li>
            <strong>Savings</strong> — cash or high-yield cash.
          </li>
          <li>
            <strong>Investment</strong> — taxable brokerage or similar.
          </li>
          <li>
            <strong>Pre-tax</strong> — 401(k) / IRA-style buckets where contributions may be modeled
            with a tax rate.
          </li>
          <li>
            <strong>Expense</strong> — planned outflows (e.g. “wedding budget”). They grow or receive
            cashflows like other accounts, but subtract from plan net.
          </li>
        </ul>
        <p>
          Set <strong>start balance</strong>, <strong>start date</strong>, and currency. The start
          date is when the opening balance appears in the journal.
        </p>
        <Example title="Example accounts">
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Start</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>HYSA</td>
                  <td>Savings</td>
                  <td>2026-01-01</td>
                  <td>$12,000</td>
                </tr>
                <tr>
                  <td>Brokerage</td>
                  <td>Investment</td>
                  <td>2026-01-01</td>
                  <td>$8,000</td>
                </tr>
                <tr>
                  <td>401(k)</td>
                  <td>Pre-tax</td>
                  <td>2026-01-01</td>
                  <td>$40,000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Example>
      </section>

      <section className="panel doc-section" id="cashflows">
        <h2 className="panel-title">3. Cashflows &amp; tax</h2>
        <p>
          Expand an account and add cashflows. Positive amounts are contributions; use a negative
          amount for withdrawals. Frequency can be once, weekly, biweekly, monthly, quarterly,
          yearly, or every N months.
        </p>
        <p>
          Optional <strong>tax rate</strong> (0–100%) reduces the credited amount:{' '}
          <code>net = amount × (1 − tax_rate)</code>. Use this when an amount is pre-tax and you want
          the account to reflect what actually lands after withholding.
        </p>
        <Example title="Example cashflows">
          <ul className="doc-list">
            <li>
              HYSA: <code>+$800</code> monthly starting 2026-01-01 (0% tax) — after-tax transfer from
              checking.
            </li>
            <li>
              401(k): <code>+$1,500</code> monthly with <code>32%</code> tax rate → about{' '}
              <code>$1,020</code> credited each month (employer match can be a second cashflow at 0%
              tax).
            </li>
            <li>
              Brokerage: <code>−$5,000</code> once on 2028-09-01 — planned wedding gift withdrawn
              from investments.
            </li>
          </ul>
          <p className="doc-example-note">
            The Pre / post-tax split helper in the planner estimates how to allocate a take-home
            budget between taxable savings and pre-tax contributions — it does not create cashflows
            by itself.
          </p>
        </Example>
      </section>

      <section className="panel doc-section" id="outlooks">
        <h2 className="panel-title">4. Growth &amp; target outlooks</h2>
        <p>Outlooks control valuation after cashflows in a month:</p>
        <ul className="doc-list">
          <li>
            <strong>Growth rate</strong> — annual rate applied as monthly compound{' '}
            <code>balance × (1 + rate/12)</code>. The latest growth outlook whose effective date is
            on or before the month is the active one.
          </li>
          <li>
            <strong>Target value</strong> — on the effective month, set the balance to the target
            amount (no growth that month). Useful for “sell house”, “vest RSUs ≈ $Y”, or resetting a
            model.
          </li>
        </ul>
        <Example title="Example outlooks">
          <ul className="doc-list">
            <li>
              HYSA growth <code>4%</code> from 2026-01-01.
            </li>
            <li>
              Brokerage growth <code>7%</code> from 2026-01-01; optionally add a second growth
              outlook at <code>5%</code> from 2029-01-01 if you expect cooler markets later.
            </li>
            <li>
              Target value <code>$25,000</code> on Brokerage effective 2027-06-01 — e.g. you expect a
              taxable event or transfer to land that balance.
            </li>
          </ul>
        </Example>
      </section>

      <section className="panel doc-section" id="read-results">
        <h2 className="panel-title">5. Read the projection</h2>
        <p>Once accounts and cashflows exist, the planner shows:</p>
        <ul className="doc-list">
          <li>
            <strong>Summary stats</strong> — total assets, expenses, and net at the target date
            (filterable by account type).
          </li>
          <li>
            <strong>Account timeline</strong> — monthly balances as line charts; toggle series on or
            off.
          </li>
          <li>
            <strong>Account journal</strong> — month-by-month opening, cashflows, growth, and target
            events with running balances.
          </li>
        </ul>
        <Example title="Reading the house example">
          <p>
            By 2030-06, check whether HYSA + Brokerage net (ignoring 401(k) if you don’t want to
            count retirement accounts toward the down payment) reaches ~$100k. Use the type filters
            to hide Pre-tax while you focus on liquid accounts.
          </p>
        </Example>
      </section>

      <section className="panel doc-section" id="branches">
        <h2 className="panel-title">6. Scenario branches</h2>
        <p>
          Create a branch from the branch controls (anything except renaming/deleting Main). On a
          custom branch:
        </p>
        <ul className="doc-list">
          <li>
            <strong>Edit</strong> an inherited Main cashflow or outlook → Forkline stores an{' '}
            <span className="badge warn">override</span> for that branch.
          </li>
          <li>
            <strong>Delete</strong> an inherited item → it becomes <em>suppressed</em> on the branch
            (Main itself is unchanged).
          </li>
          <li>
            <strong>Add</strong> new cashflows/outlooks → <span className="badge ok">branch</span>
            -only rows.
          </li>
          <li>
            <strong>Reset</strong> on an override restores inheritance from Main.
          </li>
          <li>
            <strong>Compare</strong> picks another branch as the base and shows timeline + balance
            deltas.
          </li>
          <li>
            <strong>Merge</strong> applies the branch’s overrides, suppressions, and new rows onto
            Main, then leaves you on Main.
          </li>
        </ul>
        <Example title="Example — “Boost HYSA” branch">
          <ol className="doc-list numbered">
            <li>
              Create branch <code>Boost HYSA</code>.
            </li>
            <li>
              Override the HYSA monthly cashflow from <code>$800</code> to <code>$1,200</code>.
            </li>
            <li>
              Compare against Main: net at target date should rise; journal shows the higher deposit
              on the branch.
            </li>
            <li>
              If the path looks right, Merge into Main — or keep both branches and switch between
              them.
            </li>
          </ol>
          <p className="doc-example-note">
            Accounts themselves don’t fork: you can’t add a Brand-new account only on a branch. Add
            shared accounts on Main, then vary cashflows/outlooks per scenario.
          </p>
        </Example>
      </section>

      <section className="panel doc-section" id="files">
        <h2 className="panel-title">7. Download, open &amp; local save</h2>
        <ul className="doc-list">
          <li>
            Edits <strong>autosave</strong> in this browser. Closing the tab does not lose the plan
            unless site data is cleared.
          </li>
          <li>
            <strong>Download JSON</strong> writes a <code>.forkline.json</code> file (schema version
            1) with the full plan graph, including every branch.
          </li>
          <li>
            <strong>Open plan…</strong> imports a file as a <em>new</em> plan (IDs are remapped). It
            never overwrites an existing plan in place.
          </li>
        </ul>
        <Example title="Moving between devices">
          <p>
            On your laptop: Download JSON → copy the file → on another browser or machine, Open
            plan… The new copy is independent; later edits don’t sync unless you exchange files
            again.
          </p>
        </Example>
      </section>

      <section className="panel doc-section" id="tips">
        <h2 className="panel-title">8. Tips</h2>
        <ul className="doc-list">
          <li>
            Start with Main + one optimistic and one cautious branch instead of editing Main in
            place for every what-if.
          </li>
          <li>
            Keep expense accounts for named goals you want to track separately from “wealth”
            totals.
          </li>
          <li>
            Download after major edits — local storage is convenient, files are durable.
          </li>
          <li>
            Weekly/biweekly contributions are spread into monthly model steps; expect small rounding
            differences vs a literal paycheck calendar.
          </li>
        </ul>
        <p>
          Want the product rationale? See <Link to="/about">About</Link>. Ready to edit? Go to the{' '}
          <Link to="/">planner</Link>.
        </p>
      </section>
    </div>
  )
}
