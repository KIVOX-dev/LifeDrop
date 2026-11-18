import { Bell, Droplet, LogOut, Menu } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { Role, useAuth } from '@/store/auth';

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display text-[1.35rem] font-semibold tracking-tight', light ? 'text-white' : 'text-ink', className)}>
      <span className={cn('grid h-8 w-8 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.3)]', light ? 'bg-white text-primary' : 'bg-primary text-white')}><Droplet className="h-4 w-4 fill-current" aria-hidden /></span>
      LifeDrop
    </span>
  );
}

/* ---------------------------------- guards ---------------------------------- */
export function ProtectedRoute({ roles, children }: { roles?: Role[]; children?: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Skeleton className="h-10 w-40" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'DONOR' ? '/dashboard' : '/admin'} replace />;
  return <>{children ?? <Outlet />}</>;
}

/* -------------------------------- public layout -------------------------------- */
const publicLinks = [
  ['/', 'Home'], ['/about', 'About'], ['/how-it-works', 'How it works'], ['/requirements', 'Requirements'], ['/leaderboard', 'Leaderboard'], ['/faq', 'FAQ'], ['/contact', 'Contact'],
] as const;
const desktopLinks = publicLinks.filter(([to]) => ['/about', '/how-it-works', '/requirements', '/leaderboard', '/faq'].includes(to));

/** Hamburger whose bars rotate into a perfect X. */
function Burger({ open }: { open: boolean }) {
  const bar = 'absolute left-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-700 ease-fluid';
  return (
    <span className="relative block h-3 w-5" aria-hidden>
      <span className={cn(bar, 'top-0', open && 'translate-y-[5.25px] rotate-45')} />
      <span className={cn(bar, 'bottom-0', open && '-translate-y-[5.25px] -rotate-45')} />
    </span>
  );
}

export function PublicLayout() {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  const dash = isAdmin ? '/admin' : '/dashboard';
  const link = ({ isActive }: { isActive: boolean }) => cn('rounded-full px-4 py-2 text-[13px] font-medium transition-colors duration-500 ease-fluid hover:bg-black/5', isActive ? 'bg-ink text-white hover:bg-ink' : 'text-ink/70');

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a>

      {/* floating glass island, detached from the top edge */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 sm:pt-5">
        <div className="pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-full bg-white/75 py-1.5 pl-4 pr-1.5 shadow-[0_20px_50px_-24px_rgba(60,20,25,.35)] ring-1 ring-black/[0.06] backdrop-blur-xl sm:pl-5">
          <Link to="/" aria-label="LifeDrop home" className="relative z-[2]"><Logo className="text-xl" /></Link>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {desktopLinks.map(([to, label]) => <NavLink key={to} to={to} className={link}>{label}</NavLink>)}
          </nav>
          <div className="relative z-[2] flex items-center gap-1.5">
            {user ? (
              <Link to={dash} className="hidden h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-500 ease-fluid hover:bg-primary-dark active:scale-[0.97] sm:inline-flex">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="hidden h-11 items-center rounded-full px-4 text-sm font-semibold text-ink/80 hover:bg-black/5 sm:inline-flex">Log in</Link>
                <Link to="/register" className="hidden h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28)] transition-[transform,background-color] duration-500 ease-fluid hover:bg-primary-dark active:scale-[0.97] sm:inline-flex">Become a donor</Link>
              </>
            )}
            <button className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white transition-transform duration-500 ease-fluid active:scale-95 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}><Burger open={open} /></button>
          </div>
        </div>
      </header>

      {/* expanding fullscreen menu with staggered link reveal */}
      <div className={cn('fixed inset-0 z-30 bg-cream/90 backdrop-blur-2xl transition-[opacity,visibility] duration-700 ease-fluid lg:hidden', open ? 'visible opacity-100' : 'invisible opacity-0')} aria-hidden={!open}>
        <nav className="flex h-full flex-col justify-center gap-1 px-8 pb-10 pt-24" aria-label="Mobile">
          {publicLinks.map(([to, label], i) => (
            <div key={to} className="overflow-hidden">
              <NavLink to={to} end={to === '/'} tabIndex={open ? 0 : -1} style={{ transitionDelay: open ? `${120 + i * 55}ms` : '0ms' }}
                className={({ isActive }) => cn('block font-display text-4xl font-medium transition-[transform,opacity] duration-700 ease-fluid', open ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0', isActive ? 'text-primary' : 'text-ink')}>
                {label}
              </NavLink>
            </div>
          ))}
          <div className={cn('mt-8 flex gap-3 transition-[transform,opacity] delay-500 duration-700 ease-fluid', open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0')}>
            {user ? <Link tabIndex={open ? 0 : -1} to={dash} className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-primary font-semibold text-white">Dashboard</Link> : (<>
              <Link tabIndex={open ? 0 : -1} to="/login" className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-white font-semibold ring-1 ring-black/10">Log in</Link>
              <Link tabIndex={open ? 0 : -1} to="/register" className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-primary font-semibold text-white">Register</Link>
            </>)}
          </div>
        </nav>
      </div>

      <main id="main" className="flex-1"><Outlet /></main>

      <footer className="relative overflow-hidden bg-ink text-white/70">
        <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 select-none whitespace-nowrap font-display text-[26vw] font-semibold leading-none text-white/[0.04] lg:text-[17rem]" aria-hidden>LifeDrop</div>
        <div className="container relative grid gap-12 py-16 md:grid-cols-5 md:py-24">
          <div className="md:col-span-2">
            <Logo light />
            <p className="mt-5 max-w-sm font-display text-2xl italic leading-snug text-white/90">“Be the reason someone gets a tomorrow.”</p>
            <p className="mt-4 max-w-sm text-sm text-white/50">LifeDrop never decides medical eligibility — qualified medical staff always do.</p>
          </div>
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Platform</p>
            <ul className="space-y-2.5 text-sm">{[['/requirements', 'Blood requirements'], ['/leaderboard', 'Leaderboard'], ['/how-it-works', 'How it works'], ['/register', 'Become a donor']].map(([to, l]) => <li key={to}><Link className="transition-colors duration-500 hover:text-white" to={to}>{l}</Link></li>)}</ul>
          </div>
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Company</p>
            <ul className="space-y-2.5 text-sm">{[['/about', 'About'], ['/faq', 'FAQ'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']].map(([to, l]) => <li key={to}><Link className="transition-colors duration-500 hover:text-white" to={to}>{l}</Link></li>)}</ul>
          </div>
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Sign in</p>
            <ul className="space-y-2.5 text-sm"><li><Link className="hover:text-white" to="/login">Donor / admin login</Link></li><li><Link className="hover:text-white" to="/register">Create account</Link></li></ul>
          </div>
        </div>
        <div className="container relative border-t border-white/10 py-5 text-center text-xs text-white/40">© {new Date().getFullYear()} LifeDrop · Donate blood, save lives.</div>
      </footer>
    </div>
  );
}

/* ------------------------------- dashboard shell ------------------------------- */
export interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean }

function NotificationBell({ to }: { to: string }) {
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  useEffect(() => {
    let alive = true;
    api.get('/notifications', { params: { limit: 1 } }).then((r) => alive && setUnread(r.data.meta?.unread ?? 0)).catch(() => undefined);
    return () => { alive = false; };
  }, [loc.pathname]);
  return (
    <Link to={to} className="relative grid h-11 w-11 place-items-center rounded-full bg-white ring-1 ring-black/[0.06] transition-transform duration-500 ease-fluid hover:scale-105 active:scale-95" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white ring-2 ring-background">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export function DashboardShell({ nav, title, notificationsPath, tabs = 4 }: { nav: NavItem[]; title: string; notificationsPath?: string; tabs?: number }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center px-6"><Link to="/"><Logo /></Link></div>
      <p className="px-6 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label={title}>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-ink/65 transition-[background-color,color,transform] duration-500 ease-fluid hover:bg-white hover:text-ink', isActive && 'bg-ink text-white shadow-[0_14px_28px_-14px_rgba(31,15,17,.8)] hover:bg-ink hover:text-white')}>
            <span className="[&>svg]:h-[17px] [&>svg]:w-[17px]">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-black/[0.05]">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-display text-sm font-semibold text-white">{initials(user?.fullName)}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user?.fullName}</p><p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{user?.role.replace('_', ' ')}</p></div>
          <button aria-label="Log out" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors duration-500 hover:bg-muted" onClick={async () => { await logout(); toast.success('Signed out'); navigate('/'); }}><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 bg-cream/80 lg:block"><div className="h-full border-r border-black/[0.06]">{sidebar}</div></aside>
      <div className={cn('fixed inset-0 z-40 transition-[visibility] duration-700 lg:hidden', open ? 'visible' : 'invisible')}>
        <div className={cn('absolute inset-0 bg-ink/40 transition-opacity duration-700 ease-fluid', open ? 'opacity-100' : 'opacity-0')} onClick={() => setOpen(false)} />
        <aside className={cn('absolute inset-y-0 left-0 w-[86%] max-w-xs bg-cream shadow-2xl transition-transform duration-700 ease-fluid', open ? 'translate-x-0' : '-translate-x-full')}>{sidebar}</aside>
      </div>

      <header className="flex h-16 items-center justify-between px-4 lg:h-20 lg:px-10">
        <Link to="/" className="lg:hidden"><Logo className="text-xl" /></Link>
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground lg:block">{title} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <div className="flex items-center gap-2">{notificationsPath && <NotificationBell to={notificationsPath} />}</div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-32 pt-2 lg:px-10 lg:pb-12"><Outlet /></main>

      {/* floating glass tab bar (mobile) */}
      <nav className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden" aria-label={`${title} quick navigation`}>
        <div className="pointer-events-auto mx-auto grid max-w-md rounded-full bg-ink/90 p-1.5 shadow-[0_24px_48px_-16px_rgba(31,15,17,.65)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${tabs + 1}, minmax(0, 1fr))` }}>
          {nav.slice(0, tabs).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium text-white/55 transition-[background-color,color] duration-500 ease-fluid', isActive && 'bg-white text-ink')}>
              <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{n.icon}</span>
              <span className="max-w-full truncate px-1">{n.label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button onClick={() => setOpen(true)} className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium text-white/55" aria-label="More"><Menu className="h-[18px] w-[18px]" />More</button>
        </div>
      </nav>
    </div>
  );
}
