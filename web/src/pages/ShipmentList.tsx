import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ShipmentListResponse } from '../../../shared/types.ts';
import { useApi } from '../api.ts';
import { EVENT_LABELS, EVENT_TONE, companyName, day, label, money } from '../format.ts';
import { InfoTip } from '../InfoTip.tsx';
import { Overview } from '../Overview.tsx';

const FILTER_KEYS = ['q', 'shipper_id', 'payer_id', 'carrier_id', 'segment', 'scenario'] as const;

// Column headers and the plain-language definition shown in each header's tooltip.
const COLUMNS: { key: string; title: string; tip: ReactNode; align?: 'right' }[] = [
  { key: 'shipment', title: 'Shipment', tip: 'The shipment ID. Every invoice, tracking event and payment links back to it.' },
  { key: 'lane', title: 'Lane', tip: 'Where the load is picked up → where it is delivered.' },
  { key: 'shipper', title: 'Shipper', tip: "The forwarder's customer: the company whose goods are moving." },
  { key: 'forwarder', title: 'Forwarder', tip: 'Pays the carrier on the shipper’s behalf with its card. A forwarder is never a carrier.' },
  { key: 'carrier', title: 'Carrier', tip: 'The trucking company that moves the load, with its size: small, mid or large fleet.' },
  { key: 'pickup', title: 'Pickup', tip: 'The date the carrier picked up the load.' },
  { key: 'booked', title: 'Booked', align: 'right', tip: 'The rate agreed when the load was booked, before fuel and extra charges.' },
  {
    key: 'max', title: 'Approved max', align: 'right',
    tip: <>The most the invoice can total and still be paid automatically.<br /><strong>(Booked rate + fuel surcharge) × 1.10</strong>, which leaves 10% room for extras like detention or a liftgate.</>,
  },
  {
    key: 'invoiced', title: 'Invoiced', align: 'right',
    tip: 'The total on the carrier’s invoice. Red means it is above the approved max. “+1 dup” means a duplicate invoice also arrived.',
  },
  { key: 'status', title: 'Status', tip: 'The latest milestone: booked, picked up, in transit, delayed, delivered, exception (damaged, refused or short) or on hold.' },
  { key: 'scenario', title: 'Scenario', tip: 'The test case this sample shipment was built for. Demo only; real shipments won’t have one.' },
];

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
  const scroll = useMirroredScroll();

  return (
    <div className="space-y-5">
      <Overview />

      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h1 className="text-3xl font-bold tracking-tight">Shipments</h1>
        {data && <p className="text-sm text-stone-500">{data.total} shown</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input
          type="search"
          placeholder="Search ID, city, shipper or carrier"
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => setFilter('q', e.target.value.trim())}
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none"
          aria-label="Search shipments"
        />
        <Select label="Shipper" value={params.get('shipper_id')} onChange={(v) => setFilter('shipper_id', v)}
          options={data?.filters.shippers.map((s) => ({ value: s.id, text: companyName(s.name) }))} />
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
        <button onClick={() => setParams({}, { replace: true })} className="text-sm font-medium text-accent-ink hover:underline">
          Clear filters
        </button>
      )}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Couldn't load shipments: {error.message}</p>}

      {/* A second horizontal scroll bar above the table, kept in view while scrolling down the rows. */}
      {scroll.overflows && (
        <div ref={scroll.top} onScroll={scroll.onTopScroll} aria-hidden
          className="sticky top-0 z-20 overflow-x-auto overflow-y-hidden bg-canvas/90 backdrop-blur">
          <div style={{ width: scroll.width, height: 1 }} />
        </div>
      )}
      <div ref={scroll.body} onScroll={scroll.onBodyScroll}
        className={`overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 ${loading ? 'opacity-60' : ''}`}>
        <table ref={scroll.table} className="min-w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.title}
                  <InfoTip label={c.title}>{c.tip}</InfoTip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data?.shipments.map((s) => {
              const over = s.invoice_total_cents != null && s.invoice_total_cents > s.approved_max_cents;
              return (
                <tr key={s.shipment_id} onClick={() => navigate(`/shipments/${s.shipment_id}`)}
                  className="cursor-pointer hover:bg-accent-soft/50">
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    <Link to={`/shipments/${s.shipment_id}`} className="text-accent-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                      {s.shipment_id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{s.origin_city}, {s.origin_state} → {s.dest_city}, {s.dest_state}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{companyName(s.shipper_name)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{companyName(s.payer_name)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">
                    {companyName(s.carrier_name)} <span className="text-stone-400">· {s.carrier_segment}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{day(s.pickup_ts)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(s.booked_rate_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(s.approved_max_cents)}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${over ? 'font-semibold text-red-700' : ''}`}
                    title={over ? 'Invoice total is above the approved maximum' : undefined}>
                    {money(s.invoice_total_cents)}
                    {s.invoice_count > 1 && <span className="ml-1 text-xs font-normal text-amber-700">+{s.invoice_count - 1} dup</span>}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 ${s.latest_event_type && EVENT_TONE[s.latest_event_type] ? `font-medium ${EVENT_TONE[s.latest_event_type]}` : 'text-stone-600'}`}>
                    {s.latest_event_type ? EVENT_LABELS[s.latest_event_type] ?? s.latest_event_type : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-stone-500">{label(s.scenario)}</td>
                </tr>
              );
            })}
            {data && data.shipments.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-stone-500">No shipments match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-stone-500">
        <strong className="font-semibold text-stone-600">Approved max</strong> = (booked rate + fuel surcharge) × 1.10.
        Invoices at or under it can be paid automatically once delivery is confirmed.
        Hover or tab to <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-stone-400 text-[9px] font-semibold">i</span> on
        any column for its definition.
      </p>
    </div>
  );
}

// Keeps a top scroll bar and the table's own scroll position in step.
function useMirroredScroll() {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [size, setSize] = useState({ width: 0, overflows: false });

  useEffect(() => {
    if (!body.current || !table.current) return;
    const measure = () => {
      const width = table.current!.scrollWidth;
      setSize({ width, overflows: width > body.current!.clientWidth + 1 });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body.current);
    observer.observe(table.current);
    return () => observer.disconnect();
  }, []);

  const mirror = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };
  return {
    top, body, table, ...size,
    onTopScroll: () => mirror(top.current, body.current),
    onBodyScroll: () => mirror(body.current, top.current),
  };
}

function Select({ label: name, value, onChange, options }: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options?: { value: string; text: string }[];
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={name}
      className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm focus:border-accent focus:outline-none">
      <option value="">All {name.toLowerCase()}s</option>
      {options?.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
    </select>
  );
}
