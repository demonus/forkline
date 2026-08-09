import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavLink, Route, Routes } from 'react-router-dom'
import { AboutPage } from './pages/AboutPage'
import { HowToPage } from './pages/HowToPage'
import { PlannerPage } from './pages/PlannerPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
  },
})

function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink className="brand-link" to="/">
            <img className="brand-mark" src="/favicon.svg" width={32} height={32} alt="" />
            <span className="brand-text">
              <span className="brand-name">Forkline</span>
              <span className="brand-sub">Savings scenario planner</span>
            </span>
          </NavLink>
          <nav className="app-nav" aria-label="Primary">
            <NavLink to="/" end>
              Planner
            </NavLink>
            <NavLink to="/how-to">How to</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
          <div className="app-header-actions">
            <a
              className="app-credit"
              href="https://www.gummylabs.app/"
              target="_blank"
              rel="noreferrer"
            >
              by Gummy Labs
            </a>
          </div>
        </div>
      </header>
      <main className="app-main">
        <div className="app-main-inner">
          <Routes>
            <Route path="/" element={<PlannerPage />} />
            <Route path="/how-to" element={<HowToPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </div>
      </main>
      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>Forkline is a project by </span>
          <a href="https://www.gummylabs.app/" target="_blank" rel="noreferrer">
            Gummy Labs
          </a>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
