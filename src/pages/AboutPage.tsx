import { Link } from 'react-router-dom'

export function AboutPage() {
  return (
    <div className="doc-page">
      <div className="page-header">
        <div>
          <h1>About Forkline</h1>
          <p className="page-subtitle">
            A local-first savings scenario planner. No account, no server — just your browser and
            optional JSON files.
          </p>
        </div>
      </div>

      <section className="panel doc-section">
        <h2 className="panel-title">What it is</h2>
        <p className="panel-desc">
          Forkline helps you model how cash moves into (and out of) savings and investment accounts
          over time, then ask “what if?” without rewriting your base plan. You set a target date,
          define accounts, contributions, growth assumptions, and branch into alternate scenarios
          you can compare or merge.
        </p>
        <p>
          Everything runs in the browser. Edits autosave to local storage. Download a{' '}
          <code>.forkline.json</code> file when you want a backup, a shareable snapshot, or a plan
          you can open on another machine.
        </p>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">Who it’s for</h2>
        <ul className="doc-list">
          <li>
            <strong>Goal planners</strong> — “Can I hit $50k by 2030 with this monthly transfer?”
          </li>
          <li>
            <strong>Scenario thinkers</strong> — raise contributions, lower growth, or add a big
            purchase without losing the Main plan.
          </li>
          <li>
            <strong>Privacy-minded users</strong> — hypothetical balances and tax rates stay on your
            device unless you export a file.
          </li>
        </ul>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">Core ideas</h2>
        <dl className="doc-definitions">
          <div>
            <dt>Plan</dt>
            <dd>
              A named workspace with a target date. All projections stop at that month. A plan can
              hold many accounts and several scenario branches.
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>
              A bucket in the plan — savings, investment, pre-tax (e.g. 401k-style), or expense
              (planned outflows that reduce net worth in the total). Accounts are shared across
              branches; only cashflows and outlooks can differ by branch.
            </dd>
          </div>
          <div>
            <dt>Cashflow</dt>
            <dd>
              A recurring or one-time contribution or withdrawal. Amounts can carry a tax rate so
              pre-tax contributions are stored net of withholding when you model take-home impact.
            </dd>
          </div>
          <div>
            <dt>Outlook</dt>
            <dd>
              How an account’s value evolves: an annual growth rate applied monthly, or a target
              balance that overwrites the account in a given month (useful for home sale, inheritance,
              or “I expect this account to be worth X then”).
            </dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>
              A named scenario layered on Main. You can override or suppress inherited cashflows and
              outlooks, or add branch-only rows. Compare branches side by side, then merge when a
              path becomes your new base.
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">How projection works</h2>
        <p>
          Forkline walks month by month from the earliest account start date through the plan’s
          target date. Each month, for every started account:
        </p>
        <ol className="doc-list numbered">
          <li>Apply net cashflows that land in that month (overlapping segments sum).</li>
          <li>
            If a <em>target value</em> outlook is effective that month, set the balance to that
            amount (no growth that month).
          </li>
          <li>
            Otherwise apply the active <em>growth rate</em> as rate ÷ 12 on the post-cashflow
            balance.
          </li>
        </ol>
        <p>
          Expense accounts accumulate as positive planned outflows and are subtracted when computing
          plan net (assets − expenses). Weekly and biweekly cashflows are converted into monthly
          equivalents (52/12 and 26/12).
        </p>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">Privacy &amp; files</h2>
        <ul className="doc-list">
          <li>No login and no cloud sync inside Forkline itself.</li>
          <li>
            Browser storage key: <code>forkline.document.v1</code>. Clearing site data removes local
            plans — download JSON first if you care about them.
          </li>
          <li>
            Export files are plain JSON (<code>schemaVersion: 1</code>). They can include sensitive
            assumptions; treat them like a spreadsheet you’d guard.
          </li>
          <li>
            The same file format works with Stermione’s Savings Planner export/import if you use both
            tools.
          </li>
        </ul>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">By Gummy Labs</h2>
        <p>
          Forkline is a project by{' '}
          <a href="https://gummylabs.app" target="_blank" rel="noreferrer">
            Gummy Labs
          </a>
          . Learn more at{' '}
          <a href="https://gummylabs.app" target="_blank" rel="noreferrer">
            https://gummylabs.app
          </a>
          .
        </p>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">Open source</h2>
        <p>
          Forkline is open source. You can browse the code, download the project, and contribute on
          GitHub:{' '}
          <a href="https://github.com/demonus/forkline" target="_blank" rel="noreferrer">
            https://github.com/demonus/forkline
          </a>
          .
        </p>
      </section>

      <section className="panel doc-section">
        <h2 className="panel-title">Next step</h2>
        <p>
          Ready to build a plan? Open the{' '}
          <Link to="/">planner</Link> or walk through the{' '}
          <Link to="/how-to">How to</Link> guide with a concrete example.
        </p>
      </section>
    </div>
  )
}
