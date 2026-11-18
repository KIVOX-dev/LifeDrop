import { Calendar, Crown, Hospital, MapPin, Phone, User as UserIcon } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, BloodBadge, Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/data';
import { cn, daysLeft, fmtDate } from '@/lib/utils';
import { FAQS } from '@/lib/content';

const urgencyTone = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger' } as const;

export interface Requirement {
  _id: string; title: string; bloodGroup: string; hospitalName: string; address: string; city: string; state: string; country: string; unitsRequired: number;
  contactPerson?: string; contactPhone?: string; contactEmail?: string; description: string; urgency: keyof typeof urgencyTone; lastDateToRespond: string; status: string;
}

export function RequirementCard({ r, loggedIn, footer }: { r: Requirement; loggedIn: boolean; footer?: ReactNode }) {
  const left = daysLeft(r.lastDateToRespond);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <BloodBadge group={r.bloodGroup} />
        <Badge tone={urgencyTone[r.urgency]}>{r.urgency}</Badge>
      </div>
      <h3 className="mt-3 text-base font-semibold leading-snug">{r.title}</h3>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex gap-2"><Hospital className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{r.hospitalName}</li>
        <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{r.address}, {r.city}, {r.state}, {r.country}</span></li>
        <li className="flex gap-2"><Calendar className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Respond by {fmtDate(r.lastDateToRespond)} {left >= 0 && <span className="font-medium text-foreground">({left === 0 ? 'today' : `${left}d left`})</span>}</li>
        {loggedIn && r.contactPerson && <li className="flex gap-2"><UserIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{r.contactPerson}</li>}
        {loggedIn && r.contactPhone && <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><a className="font-medium text-primary hover:underline" href={`tel:${r.contactPhone}`}>{r.contactPhone}</a></li>}
      </ul>
      <p className="mt-3 line-clamp-3 text-sm">{r.description}</p>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
        <span className="font-semibold">{r.unitsRequired} unit{r.unitsRequired > 1 ? 's' : ''} needed</span>
        {!loggedIn && <Link className="font-semibold text-primary hover:underline" to="/login">Log in for contact details</Link>}
      </div>
      {footer}
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">Eligibility and compatibility are decided by the hospital's medical staff.</p>
    </Card>
  );
}

export interface LbEntry { rank: number; name: string; bloodGroup: string | null; city: string | null; points: number; donations: number; isMe?: boolean }

const medal = ['bg-amber-100 text-amber-700', 'bg-slate-100 text-slate-600', 'bg-orange-100 text-orange-700'];

export function Podium({ entries }: { entries: LbEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {entries.slice(0, 3).map((e, i) => (
        <Card key={e.rank} className={cn('p-5 text-center', i === 0 && 'border-amber-300 sm:-translate-y-2')}>
          <div className={cn('mx-auto grid h-12 w-12 place-items-center rounded-full', medal[i])}><Crown className="h-6 w-6" aria-hidden /></div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">#{e.rank}</p>
          <p className="truncate text-lg font-bold">{e.name}</p>
          <p className="text-sm text-muted-foreground">{[e.bloodGroup, e.city].filter(Boolean).join(' · ') || 'Private profile'}</p>
          <p className="mt-2 text-2xl font-extrabold text-primary">{e.points.toLocaleString()}<span className="ml-1 text-xs font-medium text-muted-foreground">pts</span></p>
          <p className="text-xs text-muted-foreground">{e.donations} verified donation{e.donations === 1 ? '' : 's'}</p>
        </Card>
      ))}
    </div>
  );
}

export function LeaderboardList({ entries, startRank }: { entries: LbEntry[]; startRank?: number }) {
  if (!entries.length) return <EmptyState title="No ranked donors yet" description="Be the first — upload a verified donation certificate to appear here." />;
  return (
    <ol className="divide-y" aria-label="Leaderboard">
      {entries.map((e, i) => (
        <li key={e.rank + e.name + i} className={cn('flex items-center gap-4 px-4 py-3', e.isMe && 'bg-accent/60')}>
          <span className="w-8 text-center text-sm font-bold text-muted-foreground">{startRank ? startRank + i : e.rank}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{e.name} {e.isMe && <Badge tone="brand" className="ml-1">You</Badge>}</p>
            <p className="text-xs text-muted-foreground">{[e.bloodGroup, e.city].filter(Boolean).join(' · ') || '—'} · {e.donations} donation{e.donations === 1 ? '' : 's'}</p>
          </div>
          <span className="font-bold tabular-nums text-primary">{e.points.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">pts</span></span>
        </li>
      ))}
    </ol>
  );
}

export function FaqList({ limit }: { limit?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-white">
      {FAQS.slice(0, limit).map((f) => (
        <details key={f.q} className="group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
            {f.q}<span className="text-primary transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="relative overflow-hidden border-b bg-gradient-to-b from-accent to-background">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="container relative pb-10 pt-28 md:pb-16 md:pt-40">
        <span className="eyebrow">LifeDrop</span>
        <h1 className="h-section">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
