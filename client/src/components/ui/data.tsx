import { ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button, Card, Input, Skeleton } from './primitives';

/* ------------------------------- layout helpers ------------------------------- */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-accent p-3 text-primary">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-sm font-medium text-destructive">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function StatCard({ label, value, icon, hint, tone = 'brand', loading }: { label: string; value: ReactNode; icon?: ReactNode; hint?: string; tone?: 'brand' | 'success' | 'warning' | 'neutral'; loading?: boolean }) {
  const tones = { brand: 'bg-accent text-primary', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', neutral: 'bg-muted text-muted-foreground' };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-1 font-display text-3xl font-medium tabular-nums">{value}</p>}
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className={cn('rounded-lg p-2.5', tones[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}

/* --------------------------------- pagination --------------------------------- */
export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total?: number; onPage: (p: number) => void }) {
  return (
    <nav aria-label="Pagination" className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">{total !== undefined ? `${total.toLocaleString()} result${total === 1 ? '' : 's'} · ` : ''}Page {page} of {totalPages}</span>
      <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /> Prev</Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">Next <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </nav>
  );
}

/* ----------------------------------- table ----------------------------------- */
export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean }

export function DataTable<T extends { _id?: string }>({
  columns, rows, loading, error, onRetry, empty, meta, onPage, rowKey,
}: {
  columns: Column<T>[]; rows: T[] | null | undefined; loading?: boolean; error?: string | null; onRetry?: () => void;
  empty?: ReactNode; meta?: { page: number; totalPages: number; total: number }; onPage?: (p: number) => void; rowKey?: (r: T, i: number) => string;
}) {
  return (
    <Card className="overflow-hidden">
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <>
          {/* mobile: one card per row */}
          <ul className="divide-y md:hidden">
            {loading && !rows?.length
              ? Array.from({ length: 4 }).map((_, i) => <li key={i} className="space-y-2 p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></li>)
              : rows?.map((r, i) => {
                  const body = columns.filter((c) => c.header);
                  const actions = columns.filter((c) => !c.header);
                  const [first, ...rest] = body;
                  return (
                    <li key={rowKey?.(r, i) ?? r._id ?? i} className="space-y-3 p-4">
                      <div className="font-semibold">{first?.cell(r)}</div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        {rest.map((c) => (
                          <div key={c.key} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.header}</dt><dd className="mt-0.5 break-words">{c.cell(r)}</dd></div>
                        ))}
                      </dl>
                      {actions.length > 0 && <div className="flex flex-wrap justify-end gap-2 border-t pt-3">{actions.map((c) => <div key={c.key}>{c.cell(r)}</div>)}</div>}
                    </li>
                  );
                })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn('px-4 py-3 font-semibold', c.className)}>{c.header}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {loading && !rows?.length
                  ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-5 w-full max-w-[160px]" /></td>)}</tr>)
                  : rows?.map((r, i) => (
                      <tr key={rowKey?.(r, i) ?? r._id ?? i} className="hover:bg-muted/40">
                        {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>{c.cell(r)}</td>)}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!loading && !rows?.length && (empty ?? <EmptyState title="Nothing here yet" description="No records match your filters." />)}
        </>
      )}
      {meta && onPage && meta.total > 0 && <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onPage={onPage} />}
    </Card>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full md:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input aria-label={placeholder} className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
