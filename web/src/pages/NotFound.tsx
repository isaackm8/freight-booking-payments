import { Link } from 'react-router-dom';

export function NotFound({ message = 'Page not found.' }: { message?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <p className="text-slate-700">{message}</p>
      <Link to="/" className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline">
        Back to shipments
      </Link>
    </div>
  );
}
