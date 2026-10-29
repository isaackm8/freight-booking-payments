import { Link, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Pay on Delivery
          </Link>
          <nav className="text-sm">
            <Link to="/" className="font-medium text-slate-600 hover:text-slate-900">
              Shipments
            </Link>
          </nav>
        </div>
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          Synthetic data, illustrative pricing.
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
