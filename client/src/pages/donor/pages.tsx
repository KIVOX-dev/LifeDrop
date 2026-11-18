import { zodResolver } from '@hookform/resolvers/zod';
import { Award, Bell, CalendarClock, CheckCheck, Droplet, FileUp, FileText, MailWarning, Send, Trophy } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { LeaderboardList, Podium, Requirement, RequirementCard } from '@/components/shared/blocks';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Column, DataTable, EmptyState, ErrorState, PageHeader, Pagination, StatCard } from '@/components/ui/data';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Skeleton, StatusBadge, Switch, Textarea } from '@/components/ui/primitives';
import { api, del, errorMessage, get, getPaged, patch, post } from '@/lib/api';
import { useFetch, useSeo } from '@/lib/hooks';
import { profileSchemaClient } from './profileSchema';
import { uploadSchema } from '@/lib/schemas';
import { ALLOWED_UPLOAD, BLOOD_GROUPS, cn, fmtDate, fmtDateTime, MAX_UPLOAD_MB, timeAgo, todayISO } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { z } from 'zod';
import { passwordRule } from '@/lib/schemas';

/* ------------------------------------ overview ------------------------------------ */
export function DonorOverview() {
  useSeo('Dashboard');
  const { user, profile } = useAuth();
  const pts = useFetch(() => get('/points/my-points'), []);
  const donations = useFetch(() => api.get('/donors/donations', { params: { limit: 5 } }).then((r) => r.data.data), []);
  const reqs = useFetch(() => get<Requirement[]>('/requirements', { limit: 3 }), []);
  const notes = useFetch(() => getPaged<any>('/notifications', { limit: 4 }), []);
  const p = pts.data;
  const next = donations.data?.nextReminder;
  const [resending, setResending] = useState(false);

  return (
    <>
      <PageHeader title={`Hello, ${user?.fullName.split(' ')[0]} 👋`} description="Here's your donor overview." actions={<Button asChild><Link to="/dashboard/upload"><FileUp className="h-4 w-4" /> Upload certificate</Link></Button>} />
      {!user?.emailVerified && (
        <Card className="mb-6 flex flex-col gap-3 border-amber-200 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-medium"><MailWarning className="h-5 w-5 shrink-0" /> Verify your email to receive blood requirement alerts.</p>
          <Button size="sm" variant="outline" loading={resending} onClick={async () => { setResending(true); try { await post('/auth/resend-verification'); toast.success('Verification email sent'); } catch (e) { toast.error(errorMessage(e)); } finally { setResending(false); } }}>Resend email</Button>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Verified donations" value={p?.totalVerifiedDonations ?? 0} icon={<Droplet className="h-5 w-5" />} loading={pts.loading} />
        <StatCard label="Reward points" value={(p?.totalPoints ?? 0).toLocaleString()} icon={<Award className="h-5 w-5" />} tone="warning" loading={pts.loading} hint="100 per verified certificate" />
        <StatCard label="Leaderboard rank" value={p?.rank ? `#${p.rank}` : '—'} icon={<Trophy className="h-5 w-5" />} tone="success" loading={pts.loading} hint={p?.rank ? undefined : 'Earn points to be ranked'} />
        <StatCard label="Follow-up reminder" value={next ? fmtDate(next.scheduledFor) : '—'} icon={<CalendarClock className="h-5 w-5" />} tone="neutral" loading={donations.loading} hint={next ? 'A reminder to check eligibility' : 'Scheduled after a verified donation'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent donations</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/dashboard/donations">View all</Link></Button></CardHeader>
          <CardContent>
            {donations.loading ? <Skeleton className="h-32" /> : !donations.data?.items?.length ? <EmptyState title="No donations yet" description="Upload your first donation certificate to start earning points." action={<Button asChild size="sm"><Link to="/dashboard/upload">Upload certificate</Link></Button>} /> : (
              <ul className="divide-y">{donations.data.items.map((d: any) => (
                <li key={d._id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{d.location}</p><p className="text-xs text-muted-foreground">{fmtDate(d.donationDate)} · {d.bloodGroup}</p></div><StatusBadge status={d.status} /></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/dashboard/notifications">All</Link></Button></CardHeader>
          <CardContent>
            {notes.loading ? <Skeleton className="h-32" /> : !notes.data?.items.length ? <EmptyState title="All caught up" icon={<Bell className="h-6 w-6" />} /> : (
              <ul className="space-y-3">{notes.data.items.map((n: any) => <li key={n._id} className="text-sm"><p className={cn('font-medium', !n.readAt && 'text-primary')}>{n.title}</p><p className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p></li>)}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Active blood requirements</h2><Button asChild variant="ghost" size="sm"><Link to="/dashboard/requirements">View all</Link></Button></div>
        {reqs.loading ? <Skeleton className="h-64" /> : !reqs.data?.length ? <Card><EmptyState title="No open requirements" description="You'll be notified when one matches your blood group." /></Card> : <div className="grid gap-5 md:grid-cols-3">{reqs.data.map((r) => <RequirementCard key={r._id} r={r} loggedIn />)}</div>}
        {profile && <p className="mt-3 text-xs text-muted-foreground">Your registered blood group is {profile.bloodGroup}. Compatibility is always confirmed by medical staff.</p>}
      </div>
    </>
  );
}

/* ----------------------------------- donations ----------------------------------- */
export function DonorDonations() {
  useSeo('My donations');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(() => api.get('/donors/donations', { params: { page, limit: 10 } }).then((r) => ({ items: r.data.data.items as any[], meta: r.data.meta, next: r.data.data.nextReminder })), [page]);
  const [withdraw, setWithdraw] = useState<any>(null);

  const view = async (certId: string) => {
    try { const d = await get(`/certificates/${certId}/download`, { inline: '1' }); window.open(d.url, '_blank', 'noopener,noreferrer'); } catch (e) { toast.error(errorMessage(e)); }
  };
  const cols: Column<any>[] = [
    { key: 'date', header: 'Date', cell: (d) => fmtDate(d.donationDate) },
    { key: 'loc', header: 'Location', cell: (d) => d.location },
    { key: 'bg', header: 'Group', cell: (d) => d.bloodGroup, hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
    { key: 'remarks', header: 'Admin remarks', hideOnMobile: true, cell: (d) => <span className="text-muted-foreground">{d.certificate?.rejectionReason ?? d.adminRemarks ?? '—'}</span> },
    { key: 'act', header: '', className: 'text-right', cell: (d) => (
      <div className="flex justify-end gap-2">
        {d.certificate && <Button size="sm" variant="outline" onClick={() => view(d.certificate._id)}><FileText className="h-3.5 w-3.5" /> View</Button>}
        {d.certificate && d.status !== 'VERIFIED' && <Button size="sm" variant="ghost" onClick={() => setWithdraw(d)}>Withdraw</Button>}
      </div>
    ) },
  ];
  return (
    <>
      <PageHeader title="Donation history" description="Every certificate you've submitted and its review status." actions={<Button asChild><Link to="/dashboard/upload"><FileUp className="h-4 w-4" /> Upload certificate</Link></Button>} />
      {data?.next && <Card className="mb-4 flex items-center gap-3 p-4 text-sm"><CalendarClock className="h-5 w-5 text-primary" /> Your next follow-up reminder is on <strong>{fmtDate(data.next.scheduledFor)}</strong>. It's a prompt to check eligibility with medical staff, not an eligibility decision.</Card>}
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage}
        empty={<EmptyState title="No donations yet" description="Upload a certificate after your next donation." action={<Button asChild size="sm"><Link to="/dashboard/upload">Upload certificate</Link></Button>} />} />
      <ConfirmDialog open={!!withdraw} onOpenChange={(o) => !o && setWithdraw(null)} title="Withdraw this certificate?" description="The file will be permanently deleted. You can upload a new one afterwards." confirmLabel="Withdraw" destructive
        onConfirm={async () => { try { await del(`/certificates/${withdraw.certificate._id}`); toast.success('Certificate withdrawn'); reload(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
    </>
  );
}

/* ------------------------------------- upload ------------------------------------- */
export function UploadCertificate() {
  useSeo('Upload certificate');
  const { profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(uploadSchema) });

  const pick = (f?: File | null) => {
    setFileError('');
    if (!f) return setFile(null);
    if (!ALLOWED_UPLOAD.includes(f.type)) { setFile(null); return setFileError('Only PDF, JPG or PNG files are allowed.'); }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { setFile(null); return setFileError(`File is too large. Maximum is ${MAX_UPLOAD_MB} MB.`); }
    if (f.size === 0) { setFile(null); return setFileError('The file is empty.'); }
    setFile(f);
  };

  if (done) return (
    <Card className="mx-auto max-w-lg"><EmptyState icon={<CheckCheck className="h-6 w-6" />} title="Certificate submitted" description="An administrator will review it soon. You'll get an email and a notification — points are credited once it's approved."
      action={<div className="flex gap-2"><Button asChild><Link to="/dashboard/donations">View history</Link></Button><Button variant="outline" onClick={() => setDone(false)}>Upload another</Button></div>} /></Card>
  );

  return (
    <>
      <PageHeader title="Upload donation certificate" description="Earn 100 points once an administrator verifies your certificate." />
      <Card className="max-w-2xl p-6">
        <form noValidate className="space-y-5" onSubmit={handleSubmit(async (v) => {
          if (!file) return setFileError('Please choose your certificate file.');
          const fd = new FormData();
          fd.append('donationDate', v.donationDate);
          fd.append('location', v.location);
          if (profile?.bloodGroup) fd.append('bloodGroup', profile.bloodGroup);
          fd.append('certificate', file);
          try { await api.post('/certificates/upload', fd); toast.success('Certificate submitted for review'); setFile(null); reset(); setDone(true); } catch (e) { toast.error(errorMessage(e)); }
        })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Donation date" htmlFor="u-date" error={errors.donationDate?.message}><Input id="u-date" type="date" max={todayISO()} aria-invalid={!!errors.donationDate} {...register('donationDate')} /></Field>
            <Field label="Hospital / blood bank" htmlFor="u-loc" error={errors.location?.message}><Input id="u-loc" placeholder="e.g. City Blood Bank" aria-invalid={!!errors.location} {...register('location')} /></Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Certificate file</p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
              className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center', fileError ? 'border-destructive' : 'border-border hover:border-primary')}
            >
              <FileUp className="h-8 w-8 text-primary" aria-hidden />
              {file ? <p className="text-sm font-medium">{file.name} <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span></p> : <p className="text-sm text-muted-foreground">Drag a file here, or</p>}
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>Choose file</Button>
              <input ref={input} data-testid="file-input" aria-label="Certificate file" type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={(e) => pick(e.target.files?.[0])} />
              <p className="text-xs text-muted-foreground">PDF, JPG or PNG · max {MAX_UPLOAD_MB} MB</p>
            </div>
            {fileError && <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">{fileError}</p>}
          </div>
          <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Your certificate is stored privately and only opened by you and authorised administrators through short-lived secure links.</p>
          <Button type="submit" loading={isSubmitting}>Submit for review</Button>
        </form>
      </Card>
    </>
  );
}

/* -------------------------------------- points -------------------------------------- */
export function DonorPoints() {
  useSeo('My points');
  const [page, setPage] = useState(1);
  const pts = useFetch(() => get('/points/my-points'), []);
  const tx = useFetch(() => getPaged<any>('/points/transactions', { page, limit: 10 }), [page]);
  const cols: Column<any>[] = [
    { key: 'date', header: 'Date', cell: (t) => fmtDateTime(t.createdAt) },
    { key: 'type', header: 'Type', cell: (t) => <Badge tone={t.points > 0 ? 'success' : 'danger'}>{t.type === 'DONATION_APPROVED' ? 'Donation verified' : 'Reversed'}</Badge> },
    { key: 'don', header: 'Donation', hideOnMobile: true, cell: (t) => t.donation ? `${fmtDate(t.donation.donationDate)} · ${t.donation.location}` : '—' },
    { key: 'pts', header: 'Points', className: 'text-right font-bold tabular-nums', cell: (t) => <span className={t.points > 0 ? 'text-success' : 'text-destructive'}>{t.points > 0 ? '+' : ''}{t.points}</span> },
  ];
  return (
    <>
      <PageHeader title="Points & rank" description="You receive exactly 100 points for each approved certificate." actions={<Button asChild variant="outline"><Link to="/dashboard/leaderboard">View leaderboard</Link></Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total points" value={(pts.data?.totalPoints ?? 0).toLocaleString()} icon={<Award className="h-5 w-5" />} tone="warning" loading={pts.loading} />
        <StatCard label="Verified donations" value={pts.data?.totalVerifiedDonations ?? 0} icon={<Droplet className="h-5 w-5" />} loading={pts.loading} />
        <StatCard label="Current rank" value={pts.data?.rank ? `#${pts.data.rank}` : '—'} icon={<Trophy className="h-5 w-5" />} tone="success" loading={pts.loading} />
      </div>
      <DataTable columns={cols} rows={tx.data?.items} loading={tx.loading} error={tx.error} onRetry={tx.reload} meta={tx.data?.meta} onPage={setPage} empty={<EmptyState title="No points yet" description="Points appear here after a certificate is approved." />} />
    </>
  );
}

/* ----------------------------------- requirements ----------------------------------- */
export function DonorRequirements() {
  useSeo('Blood requirements');
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState('');
  const { data, loading, error, reload } = useFetch(() => api.get('/requirements', { params: { page, limit: 9, ...(group && { bloodGroup: group }) } }).then((r) => ({ items: r.data.data as Requirement[], meta: r.data.meta })), [page, group]);
  return (
    <>
      <PageHeader title="Active blood requirements" description="Contact the hospital directly. Medical staff decide eligibility and compatibility."
        actions={<Select aria-label="Blood group" className="w-44" value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}><option value="">All blood groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>} />
      {loading && !data ? <Skeleton className="h-72" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.items.length ? <Card><EmptyState title="No open requirements" /></Card> : (
        <><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.items.map((r) => <RequirementCard key={r._id} r={r} loggedIn />)}</div>
          <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div></>
      )}
    </>
  );
}

/* --------------------------------- notifications --------------------------------- */
export function NotificationsPage() {
  useSeo('Notifications');
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/notifications', { page, limit: 10, ...(unreadOnly && { unread: 'true' }) }), [page, unreadOnly]);
  const mark = async (id: string) => { await patch(`/notifications/${id}/read`).catch(() => undefined); reload(); };
  return (
    <>
      <PageHeader title="Notifications" description={data?.meta.unread ? `${data.meta.unread} unread` : 'You are all caught up'}
        actions={<><Button variant={unreadOnly ? 'default' : 'outline'} size="sm" onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}>Unread only</Button><Button variant="outline" size="sm" disabled={!data?.meta.unread} onClick={async () => { await patch('/notifications/read-all'); toast.success('All marked as read'); reload(); }}><CheckCheck className="h-4 w-4" /> Mark all read</Button></>} />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : !data?.items.length ? <EmptyState title="No notifications" icon={<Bell className="h-6 w-6" />} /> : (
          <ul className="divide-y">{data.items.map((n: any) => (
            <li key={n._id} className={cn('flex items-start gap-3 p-4', !n.readAt && 'bg-accent/40')}>
              <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', n.readAt ? 'bg-slate-300' : 'bg-primary')} aria-label={n.readAt ? 'Read' : 'Unread'} />
              <div className="min-w-0 flex-1"><p className="font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{n.message}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p></div>
              <div className="flex shrink-0 gap-2">{n.link && <Button asChild size="sm" variant="ghost"><Link to={n.link} onClick={() => !n.readAt && mark(n._id)}>Open</Link></Button>}{!n.readAt && <Button size="sm" variant="outline" onClick={() => mark(n._id)}>Mark read</Button>}</div>
            </li>))}</ul>
        )}
        {data && data.meta.total > 0 && <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
      </Card>
    </>
  );
}

/* -------------------------------------- profile -------------------------------------- */
export function ProfilePage() {
  useSeo('My profile');
  const { user, profile, setProfile, reload, logout } = useAuth();
  const [tab, setTab] = useState<'profile' | 'privacy' | 'security' | 'account'>('profile');
  const [delOpen, setDelOpen] = useState(false);
  const tabs = [['profile', 'Profile'], ['privacy', 'Privacy & alerts'], ['security', 'Security'], ['account', 'Account']] as const;

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: zodResolver(profileSchemaClient),
    values: profile && user ? { fullName: user.fullName, phone: profile.phone, bloodGroup: profile.bloodGroup as any, city: profile.city, state: profile.state, country: profile.country, address: profile.address, gender: (profile.gender ?? '') as any, emergencyName: profile.emergencyContact?.name ?? '', emergencyPhone: profile.emergencyContact?.phone ?? '' } : undefined,
  });
  const pw = useForm({ resolver: zodResolver(z.object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordRule })) });

  const savePrefs = async (body: Record<string, unknown>) => {
    try { const d = await patch('/donors/profile', body); setProfile(d.profile); toast.success('Saved'); } catch (e) { toast.error(errorMessage(e)); }
  };
  if (!profile || !user) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader title="My profile" description="Manage your details, privacy and security." />
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-lg border bg-white p-1">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-semibold', tab === k ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}>{l}</button>)}
      </div>

      {tab === 'profile' && (
        <Card className="max-w-3xl p-6">
          <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
            await savePrefs({ fullName: v.fullName, phone: v.phone, bloodGroup: v.bloodGroup, city: v.city, state: v.state, country: v.country, address: v.address, ...(v.gender ? { gender: v.gender } : {}), emergencyContact: { name: v.emergencyName || undefined, phone: v.emergencyPhone || undefined } });
            void reload();
          })}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="p-name" error={errors.fullName?.message}><Input id="p-name" {...register('fullName')} /></Field>
              <Field label="Email" htmlFor="p-email" hint={user.emailVerified ? 'Verified' : 'Not verified yet'}><Input id="p-email" value={user.email} disabled readOnly /></Field>
              <Field label="Phone" htmlFor="p-phone" error={errors.phone?.message}><Input id="p-phone" {...register('phone')} /></Field>
              <Field label="Blood group" htmlFor="p-bg"><Select id="p-bg" {...register('bloodGroup')}>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
              <Field label="City" htmlFor="p-city" error={errors.city?.message}><Input id="p-city" {...register('city')} /></Field>
              <Field label="State" htmlFor="p-state" error={errors.state?.message}><Input id="p-state" {...register('state')} /></Field>
              <Field label="Country" htmlFor="p-country" error={errors.country?.message}><Input id="p-country" {...register('country')} /></Field>
              <Field label="Gender" htmlFor="p-gender"><Select id="p-gender" {...register('gender')}><option value="">Prefer not to say</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select></Field>
            </div>
            <Field label="Address" htmlFor="p-addr" error={errors.address?.message}><Textarea id="p-addr" rows={2} {...register('address')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Emergency contact name" htmlFor="p-en"><Input id="p-en" {...register('emergencyName')} /></Field>
              <Field label="Emergency contact phone" htmlFor="p-ep" error={errors.emergencyPhone?.message}><Input id="p-ep" {...register('emergencyPhone')} /></Field>
            </div>
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
          </form>
        </Card>
      )}

      {tab === 'privacy' && (
        <Card className="max-w-3xl divide-y">
          {([
            ['Available to donate', 'Turn off to stop receiving blood requirement alerts without unsubscribing.', profile.isAvailable, async (v: boolean) => { try { await patch('/donors/availability', { isAvailable: v }); setProfile({ ...profile, isAvailable: v }); toast.success('Availability updated'); } catch (e) { toast.error(errorMessage(e)); } }],
            ['Show me on the public leaderboard', 'When off you appear as “Anonymous donor” and your name, group and city are hidden.', profile.privacy.showOnLeaderboard, (v: boolean) => savePrefs({ privacy: { showOnLeaderboard: v } })],
            ['Non-essential emails', 'Master switch for blood requirement alerts and reminders. Account and security emails are always sent.', profile.preferences.nonEssentialEmails, (v: boolean) => savePrefs({ preferences: { nonEssentialEmails: v } })],
            ['Blood requirement alerts', 'Emails when a requirement matching your blood group is published.', profile.preferences.requirementAlerts, (v: boolean) => savePrefs({ preferences: { requirementAlerts: v } })],
            ['Follow-up reminders', 'The three-month reminder to check eligibility after a verified donation.', profile.preferences.reminderEmails, (v: boolean) => savePrefs({ preferences: { reminderEmails: v } })],
          ] as [string, string, boolean, (v: boolean) => unknown][]).map(([t, d, v, fn]) => (
            <div key={t} className="flex items-center justify-between gap-4 p-5">
              <div><p className="font-medium" id={`sw-${t}`}>{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
              <Switch checked={v} aria-labelledby={`sw-${t}`} onCheckedChange={(c) => void fn(c)} />
            </div>
          ))}
        </Card>
      )}

      {tab === 'security' && (
        <Card className="max-w-md p-6">
          <h2 className="mb-4 font-semibold">Change password</h2>
          <form noValidate className="space-y-4" onSubmit={pw.handleSubmit(async (v) => { try { await post('/auth/change-password', v); toast.success('Password changed'); pw.reset(); } catch (e) { toast.error(errorMessage(e)); } })}>
            <Field label="Current password" htmlFor="cpw" error={pw.formState.errors.currentPassword?.message}><Input id="cpw" type="password" autoComplete="current-password" {...pw.register('currentPassword')} /></Field>
            <Field label="New password" htmlFor="npw" error={pw.formState.errors.newPassword?.message}><Input id="npw" type="password" autoComplete="new-password" {...pw.register('newPassword')} /></Field>
            <Button type="submit" loading={pw.formState.isSubmitting}>Update password</Button>
          </form>
        </Card>
      )}

      {tab === 'account' && (
        <div className="max-w-3xl space-y-4">
          <Card className="p-6"><h2 className="font-semibold">Download my data</h2><p className="mt-1 text-sm text-muted-foreground">Get a JSON copy of your profile, donations, points and notifications.</p>
            <Button className="mt-3" variant="outline" onClick={async () => { try { const r = await api.get('/donors/my-data'); const blob = new Blob([JSON.stringify(r.data.data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lifedrop-my-data.json'; a.click(); URL.revokeObjectURL(a.href); } catch (e) { toast.error(errorMessage(e)); } }}>Download JSON</Button></Card>
          <Card className="border-destructive/30 p-6"><h2 className="font-semibold text-destructive">Delete my account</h2>
            {user.deletionRequestedAt ? (<><p className="mt-1 text-sm text-muted-foreground">Deletion requested on {fmtDate(user.deletionRequestedAt)}. An administrator will process it.</p><Button className="mt-3" variant="outline" onClick={async () => { await del('/donors/deletion-request'); toast.success('Request cancelled'); void reload(); }}>Cancel request</Button></>)
              : (<><p className="mt-1 text-sm text-muted-foreground">Sends a request to administrators, who will erase your personal data and certificates.</p><Button className="mt-3" variant="destructive" onClick={() => setDelOpen(true)}>Request deletion</Button></>)}
          </Card>
        </div>
      )}
      <ConfirmDialog open={delOpen} onOpenChange={setDelOpen} destructive title="Request account deletion?" description="An administrator will permanently remove your data. You can cancel the request until it is processed." confirmLabel="Send request"
        onConfirm={async () => { try { await post('/donors/deletion-request'); toast.success('Deletion request sent'); await reload(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
      <Button variant="ghost" className="mt-8 lg:hidden" onClick={() => void logout()}>Log out</Button>
    </>
  );
}

/* -------------------------------------- assistant -------------------------------------- */
export function DonorAssistant() {
  useSeo('Help assistant');
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([{ role: 'assistant', content: 'Hi! Ask me how LifeDrop works, how to upload a certificate, or about the donation process in general. I can’t give medical advice.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const q = text.trim();
    if (q.length < 2 || busy) return;
    const history = msgs.slice(1).slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setText('');
    setBusy(true);
    try { const d = await post('/ai/donor-assistant', { message: q, history }); setMsgs((m) => [...m, { role: 'assistant', content: d.reply }]); }
    catch (e) { setMsgs((m) => [...m, { role: 'assistant', content: errorMessage(e, 'Sorry, the assistant is unavailable right now.') }]); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Help assistant" description="Answers come from approved LifeDrop information only." />
      <Card className="flex h-[60vh] max-w-3xl flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {msgs.map((m, i) => <div key={i} className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm', m.role === 'user' ? 'ml-auto bg-primary text-white' : 'bg-muted')}>{m.content}</div>)}
          {busy && <div className="w-fit rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">Thinking…</div>}
        </div>
        <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Input aria-label="Your question" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Ask a question…" />
          <Button type="submit" disabled={busy || text.trim().length < 2} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      </Card>
    </>
  );
}

/* ------------------------------------ leaderboard (inside dashboard) ------------------------------------ */
export function DonorLeaderboard() {
  useSeo('Leaderboard');
  const [period, setPeriod] = useState<'' | 'monthly' | 'yearly'>('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/leaderboard${period ? `/${period}` : ''}`, { params: { page, limit: 10, ...(group && { bloodGroup: group }) } }).then((r) => ({ ...r.data.data, meta: r.data.meta })),
    [period, group, page],
  );
  const tabs: ['' | 'monthly' | 'yearly', string][] = [['', 'All time'], ['yearly', 'This year'], ['monthly', 'This month']];
  return (
    <>
      <PageHeader title="Leaderboard" description="Donors earn 100 points for every verified donation certificate. Change your visibility in Profile & privacy." />
      {data?.me?.rank && <Card className="mb-4 p-4 text-sm">Your rank: <strong>#{data.me.rank}</strong> · {data.me.points} points</Card>}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Period" className="inline-flex rounded-lg border bg-white p-1">
          {tabs.map(([v, l]) => <button key={l} role="tab" aria-selected={period === v} onClick={() => { setPeriod(v); setPage(1); }} className={cn('rounded-md px-4 py-1.5 text-sm font-semibold', period === v ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}>{l}</button>)}
        </div>
        <Select aria-label="Blood group" className="md:w-40" value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}><option value="">All groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
      </div>
      {loading && !data ? <Skeleton className="h-80" /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          {page === 1 && data?.top3?.length > 0 && <div className="mb-6"><Podium entries={data.top3} /></div>}
          <Card className="overflow-hidden">
            <LeaderboardList entries={data?.entries ?? []} />
            {data?.meta?.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
          </Card>
        </>
      )}
    </>
  );
}
