import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ShipmentListResponse } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { EVENT_LABELS, companyName, day, label, money } from '../format.ts';

const FILTER_KEYS = ['q', 'payer_id', 'carrier_id', 'segment', 'scenario'] as const;

export function ShipmentList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  // Filters live in the URL so a filtered list can be shared or bookmarked.
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    return q.toString();
  }, [params]);
  const { data, error, loading } = useApi<ShipmentListResponse>(`/api/shipments${query ? `?${query}` : ''}`);

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
        {data && <p className="text-sm text-slate-500">{data.total} shown</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          placeholder="Search ID, city or carrier"
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => setFilter('q', e.target.value.trim())}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          aria-label="Search shipments"
        />
        <Select label="Forwarder" value={params.get('payer_id')} onChange={(v) => setFilter('payer_id', v)}
          options={data?.filters.payers.map((p) => ({ value: p.id, text: companyName(p.name) }))} />
        <Select label="Carrier" value={params.get('carrier_id')} onChange={(v) => setFilter('carrier_id', v)}
          options={data?.filters.carriers.map((c) => ({ value: c.id, text: `${c.id} · ${companyName(c.name)}` }))} />
        <Select label="Segment" value={params.get('segment')} onChange={(v) => setFilter('segment', v)}
          options={data?.filters.segments.map((s) => ({ value: s, text: label(s) }))} />
        <Select label="Scenario" value={params.get('scenario')} onChange={(v) => setFilter('scenario', v)}
          options={data?.filters.scenarios.map((s) => ({ value: s, text: label(s) }))} />
      </div>
      {hasFilters && (
        <button onClick={() => setParams({}, { replace: true })} className="text-sm font-medium text-blue-700 hover:underline">
          Clear filters
        </button>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">Couldn't load shipments: {error.message}</p>}

      <div className={`overflow-x-auto rounded-lg border border-slate-200 bg-white ${loading ? 'opacity-60' : ''}`}>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Shipment</th>
              <th className="px-3 py-2">Lane</th>
              <th className="px-3 py-2">Forwarder</th>
              <th className="px-3 py-2">Carrier</th>
              <th className="px-3 py-2">Pickup</th>
              <th className="px-3 py-2 text-right">Booked</th>
              <th className="px-3 py-2 text-right">Approved max</th>
              <th className="px-3 py-2 text-right">Invoiced</th>
              <th className="px-3 py-2">Last event</th>
              <th className="px-3 py-2">Scenario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.shipments.map((s) => {
              const over = s.invoice_total_cents != null && s.invoice_total_cents > s.approved_max_cents;
              return (
                <tr key={s.shipment_id} onClick={() => navigate(`/shipments/${s.shipment_id}`)}
                  className="cursor-pointer hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    <Link to={`/shipments/${s.shipment_id}`} className="text-blue-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {s.shipment_id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{s.origin_city}, {s.origin_state} → {s.dest_city}, {s.dest_state}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{companyName(s.payer_name)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {companyName(s.carrier_name)} <span className="text-slate-400">· {s.carrier_segment}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{day(s.pickup_ts)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(s.booked_rate_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(s.approved_max_cents)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${over ? 'font-semibold text-red-700' : ''}`}
                    title={over ? 'Invoice total is above the approved maximum' : undefined}>
                    {money(s.invoice_total_cents)}
                    {s.invoice_count > 1 && <span className="ml-1 text-xs font-normal text-amber-700">+{s.invoice_count - 1} dup</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{s.latest_event_type ? EVENT_LABELS[s.latest_event_type] ?? s.latest_event_type : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{label(s.scenario)}</td>
                </tr>
              );
            })}
            {data && data.shipments.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500">No shipments match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({ label: name, value, onChange, options }: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options?: { value: string; text: string }[];
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={name}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
      <option value="">All {name.toLowerCase()}s</option>
      {options?.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
    </select>
  );
}
