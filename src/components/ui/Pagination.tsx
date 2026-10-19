import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: Props) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-slate-600">
      <p>Showing <strong className="font-semibold text-slate-900">{from.toLocaleString()}–{to.toLocaleString()}</strong> of {total.toLocaleString()}</p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden /> Prev
        </Button>
        <span className="tabular-nums">Page {page} of {pages.toLocaleString()}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
