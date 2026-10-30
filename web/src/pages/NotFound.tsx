import { Link } from 'react-router-dom';

export function NotFound({ message = 'Page not found.' }: { message?: string }) {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-stone-200 text-center">
      <p className="text-stone-700">{message}</p>
      <Link to="/shipments" className="mt-3 inline-block text-sm font-medium text-accent-ink hover:underline">
        Back to shipments
      </Link>
    </div>
  );
}
