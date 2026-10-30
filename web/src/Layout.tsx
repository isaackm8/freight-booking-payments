import { Link, NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/cash-flow-hub', name: 'Cash Flow Hub' },
  { to: '/review-queue', name: 'Review queue' },
  { to: '/', name: 'Shipments' },
  { to: '/how-it-works', name: 'How it works' },
];

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-accent" aria-hidden />
            <span className="text-lg font-bold tracking-tight">CashBridge</span>
            <span className="hidden border-l border-stone-300 pl-2.5 text-sm text-stone-500 sm:inline">Freight paid faster. Cash gap closed.</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `rounded-full px-4 py-1.5 font-medium ${isActive ? 'bg-ink text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-ink'}`
                }
              >
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="border-y border-stone-200 bg-accent-soft px-4 py-1.5 text-center text-xs font-medium text-accent-ink">
          Synthetic data, illustrative pricing.
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="bg-ink px-4 py-5 text-xs text-stone-400">
        <div className="mx-auto max-w-7xl">Prototype · amounts in USD · times in UTC</div>
      </footer>
    </div>
  );
}
