import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BloodBadge } from '@/components/ui/primitives';
import { LeaderboardList, LbEntry, Podium } from '@/components/shared/blocks';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Column, DataTable, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, StatCard } from '@/components/ui/data';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Skeleton, StatusBadge, Textarea } from '@/components/ui/primitives';
import { api, del, errorMessage, get, getPaged, patch, post } from '@/lib/api';
import { useDebounced, useFetch, useSeo } from '@/lib/hooks';
import { requirementSchema } from '@/lib/schemas';
import { BLOOD_GROUPS, fmtDate, fmtDateTime } from '@/lib/utils';
import { CsvButton } from './pages1';

/* ----------------------------------- requirements list ----------------------------------- */
export function AdminRequirements() {
  useSeo('Blood requirements');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/requirements', { page, limit: 12, status, search: dq }), [page, status, dq]);
  const cols: Column<any>[] = [
    { key: 'bg', header: 'Group', cell: (r) => <BloodBadge group={r.bloodGroup} /> },
    { key: 't', header: 'Requirement', cell: (r) => <Link to={`/admin/requirements/${r._id}`} className="font-semibold hover:text-primary">{r.title}<span className="block text-xs font-normal text-muted-foreground">{r.hospitalName} · {r.city}</span></Link> },
    { key: 'u', header: 'Units', hideOnMobile: true, cell: (r) => r.unitsRequired },
    { key: 'urg', header: 'Urgency', hideOnMobile: true, cell: (r) => <Badge tone={r.urgency === 'CRITICAL' ? 'danger' : r.urgency === 'HIGH' ? 'warning' : 'neutral'}>{r.urgency}</Badge> },
    { key: 'dl', header: 'Deadline', hideOnMobile: true, cell: (r) => fmtDate(r.lastDateToRespond) },
    { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'a', header: '', className: 'text-right', cell: (r) => <Button asChild size="sm" variant="outline"><Link to={`/admin/requirements/${r._id}`}>Manage</Link></Button> },
  ];
  return (
    <>
      <PageHeader title="Blood requirements" actions={<><CsvButton type="requirements" /><Button asChild><Link to="/admin/requirements/new"><Plus className="h-4 w-4" /> Create requirement</Link></Button></>} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Title, hospital or city" />
        <Select aria-label="Status" className="md:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option>DRAFT</option><option>PUBLISHED</option><option>CLOSED</option></Select>
      </div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage}
        empty={<EmptyState title="No requirements yet" description="Create one, then publish to notify matching donors." action={<Button asChild size="sm"><Link to="/admin/requirements/new">Create requirement</Link></Button>} />} />
    </>
  );
}

/* ------------------------------------ create / edit ------------------------------------ */
export function AdminRequirementForm() {
  const { id } = useParams();
  const editing = !!id;
  useSeo(editing ? 'Edit requirement' : 'Create requirement');
  const navigate = useNavigate();
  const existing = useFetch(() => (id ? get(`/requirements/${id}`) : Promise.resolve(null)), [id]);
  const { register, handleSubmit, getValues, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(requirementSchema) as any,
    values: existing.data ? { ...existing.data, contactEmail: existing.data.contactEmail ?? '', lastDateToRespond: existing.data.lastDateToRespond?.slice(0, 10) } : undefined,
    defaultValues: { urgency: 'MEDIUM', country: 'India', bloodGroup: undefined as any, unitsRequired: 1 } as any,
  });
  const [aiBusy, setAiBusy] = useState(false);
  const e = errors as Record<string, { message?: string }>;
  if (editing && existing.loading) return <Skeleton className="h-96" />;

  const draftDescription = async () => {
    const v = getValues();
    setAiBusy(true);
    try {
      const d = await post('/ai/admin-assistant', { mode: 'requirement_description', draft: { title: v.title, bloodGroup: v.bloodGroup, hospitalName: v.hospitalName, city: v.city, unitsRequired: Number(v.unitsRequired) || undefined, urgency: v.urgency } });
      setValue('description', d.reply, { shouldValidate: true, shouldDirty: true });
      toast.success('Draft generated — please review before saving');
    } catch (err) { toast.error(errorMessage(err)); } finally { setAiBusy(false); }
  };

  return (
    <>
      <PageHeader title={editing ? 'Edit requirement' : 'Create requirement'} description="Requirements are saved as drafts; publishing notifies matching, opted-in donors." />
      <Card className="max-w-4xl p-6">
        <form noValidate className="space-y-5" onSubmit={handleSubmit(async (v: any) => {
          const body = { ...v, unitsRequired: Number(v.unitsRequired), lastDateToRespond: new Date(`${String(v.lastDateToRespond).slice(0, 10)}T23:59:59`).toISOString() };
          try {
            const r = editing ? await patch(`/requirements/${id}`, body) : await post('/requirements/create', body);
            toast.success(editing ? 'Requirement updated' : 'Draft created');
            navigate(`/admin/requirements/${r._id}`);
          } catch (err) { toast.error(errorMessage(err)); }
        })}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" htmlFor="r-title" error={e.title?.message} className="md:col-span-2"><Input id="r-title" placeholder="e.g. Urgent O+ needed for surgery" {...register('title')} /></Field>
            <Field label="Blood group needed" htmlFor="r-bg" error={e.bloodGroup?.message} hint="“All” notifies every eligible, opted-in donor.">
              <Select id="r-bg" disabled={editing && existing.data?.status === 'PUBLISHED'} defaultValue="" {...register('bloodGroup')}><option value="" disabled>Select…</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}<option value="ALL">All donors</option></Select>
            </Field>
            <Field label="Units required" htmlFor="r-units" error={e.unitsRequired?.message}><Input id="r-units" type="number" min={1} {...register('unitsRequired')} /></Field>
            <Field label="Hospital / blood bank" htmlFor="r-h" error={e.hospitalName?.message}><Input id="r-h" {...register('hospitalName')} /></Field>
            <Field label="Urgency" htmlFor="r-u"><Select id="r-u" {...register('urgency')}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></Select></Field>
            <Field label="Full address" htmlFor="r-a" error={e.address?.message} className="md:col-span-2"><Input id="r-a" {...register('address')} /></Field>
            <Field label="City" htmlFor="r-c" error={e.city?.message}><Input id="r-c" {...register('city')} /></Field>
            <Field label="State" htmlFor="r-s" error={e.state?.message}><Input id="r-s" {...register('state')} /></Field>
            <Field label="Country" htmlFor="r-co" error={e.country?.message}><Input id="r-co" {...register('country')} /></Field>
            <Field label="Last date to respond" htmlFor="r-d" error={e.lastDateToRespond?.message}><Input id="r-d" type="date" {...register('lastDateToRespond')} /></Field>
            <Field label="Contact person" htmlFor="r-cp" error={e.contactPerson?.message}><Input id="r-cp" {...register('contactPerson')} /></Field>
            <Field label="Contact phone" htmlFor="r-ph" error={e.contactPhone?.message}><Input id="r-ph" type="tel" {...register('contactPhone')} /></Field>
            <Field label="Contact email (optional)" htmlFor="r-em" error={e.contactEmail?.message}><Input id="r-em" type="email" {...register('contactEmail')} /></Field>
          </div>
          <Field label="Description" htmlFor="r-desc" error={e.description?.message}>
            <Textarea id="r-desc" rows={5} {...register('description')} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="soft" loading={aiBusy} onClick={draftDescription}><Sparkles className="h-4 w-4" /> Draft description with AI</Button>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" loading={isSubmitting}>{editing ? 'Save changes' : 'Create draft'}</Button></div>
          </div>
        </form>
      </Card>
    </>
  );
}

/* ------------------------------------ detail / dispatch ------------------------------------ */
export function AdminRequirementDetail() {
  const { id } = useParams();
  useSeo('Requirement');
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const req = useFetch(() => get(`/requirements/${id}`), [id]);
  const notif = useFetch(() => api.get(`/requirements/${id}/notifications`, { params: { page, limit: 10, ...(filter && { status: filter }) } }).then((r) => ({ ...r.data.data, meta: r.data.meta })), [id, page, filter]);
  const [dlg, setDlg] = useState<'publish' | 'close' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const r = req.data;
  if (req.loading && !r) return <Skeleton className="h-96" />;
  if (req.error || !r) return <ErrorState message={req.error ?? 'Not found'} onRetry={req.reload} />;
  const st = notif.data?.stats;
  const refresh = () => { req.reload(); notif.reload(); };

  const cols: Column<any>[] = [
    { key: 'd', header: 'Donor', cell: (n) => <span className="font-medium">{n.donor?.fullName}<span className="block text-xs font-normal text-muted-foreground">{n.donor?.email}</span></span> },
    { key: 's', header: 'Email status', cell: (n) => <StatusBadge status={n.status} /> },
    { key: 'e', header: 'Note', hideOnMobile: true, cell: (n) => <span className="text-xs text-muted-foreground">{n.error ?? '—'}</span> },
    { key: 'u', header: 'Updated', hideOnMobile: true, cell: (n) => fmtDateTime(n.updatedAt) },
  ];

  return (
    <>
      <PageHeader title={r.title} description={`${r.hospitalName} · ${r.city}, ${r.state}`}
        actions={<>
          {r.status !== 'CLOSED' && <Button asChild variant="outline"><Link to={`/admin/requirements/${id}/edit`}>Edit</Link></Button>}
          {r.status === 'DRAFT' && <Button onClick={() => setDlg('publish')}>Publish &amp; notify</Button>}
          {r.status === 'PUBLISHED' && <Button variant="outline" onClick={async () => { try { const d = await post(`/requirements/${id}/notifications`); toast.success(`${d.newlyQueued} new email(s) queued`); refresh(); } catch (e) { toast.error(errorMessage(e)); } }}>Notify new donors</Button>}
          {r.status !== 'CLOSED' && <Button variant="outline" onClick={() => setDlg('close')}>Close</Button>}
          <Button variant="ghost" className="text-destructive" onClick={() => setDlg('delete')}>Delete</Button>
        </>} />
      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <StatCard label={st?.estimated ? 'Estimated target donors' : 'Target donors'} value={st?.targetDonors ?? '—'} loading={notif.loading} hint={st?.estimated ? 'Eligible & opted-in right now' : undefined} />
        <StatCard label="Queued / pending" value={st?.queued ?? 0} tone="warning" loading={notif.loading} />
        <StatCard label="Sent" value={st?.sent ?? 0} tone="neutral" loading={notif.loading} hint="Accepted by Brevo" />
        <StatCard label="Delivered" value={st?.delivered ?? 0} tone="success" loading={notif.loading} />
        <StatCard label="Failed" value={st?.failed ?? 0} tone="neutral" loading={notif.loading} hint={st?.skipped ? `${st.skipped} skipped (opted out)` : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1"><CardHeader><CardTitle>Details</CardTitle><StatusBadge status={r.status} /></CardHeader><CardContent>
          <dl className="space-y-2 text-sm">{[['Blood group', r.bloodGroup === 'ALL' ? 'All donors' : r.bloodGroup], ['Units', r.unitsRequired], ['Urgency', r.urgency], ['Deadline', fmtDate(r.lastDateToRespond)], ['Address', `${r.address}, ${r.city}, ${r.state}, ${r.country}`], ['Contact', `${r.contactPerson} · ${r.contactPhone}`], ['Email', r.contactEmail], ['Published', fmtDateTime(r.publishedAt)]].map(([k, v]) => <div key={k as string}><dt className="text-xs text-muted-foreground">{k as string}</dt><dd className="font-medium">{(v as any) || '—'}</dd></div>)}</dl>
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">{r.description}</p>
        </CardContent></Card>
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Email delivery</h2>
            <Select aria-label="Filter by delivery status" className="w-40" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="">All</option>{['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'].map((s) => <option key={s}>{s}</option>)}</Select></div>
          <DataTable columns={cols} rows={notif.data?.items} loading={notif.loading} error={notif.error} onRetry={notif.reload} meta={notif.data?.meta} onPage={setPage}
            empty={<EmptyState title={r.status === 'DRAFT' ? 'Not published yet' : 'No recipients'} description={r.status === 'DRAFT' ? 'Publish to email matching, opted-in donors.' : 'No eligible donors matched this requirement.'} />} />
        </div>
      </div>

      <ConfirmDialog open={dlg === 'publish'} onOpenChange={(o) => !o && setDlg(null)} title="Publish and notify donors?" confirmLabel="Publish"
        description={`This will email about ${st?.targetDonors ?? 'all'} eligible, opted-in ${r.bloodGroup === 'ALL' ? '' : r.bloodGroup + ' '}donors. Blood group is only used to choose who is notified — compatibility is decided by medical staff.`}
        onConfirm={async () => { try { const d = await post(`/requirements/${id}/publish`); toast.success(`Published — ${d.emailsQueued} email(s) queued`); refresh(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
      <ConfirmDialog open={dlg === 'close'} onOpenChange={(o) => !o && setDlg(null)} title="Close this requirement?" description="It will no longer be shown publicly." confirmLabel="Close requirement"
        onConfirm={async () => { try { await post(`/requirements/${id}/close`); toast.success('Closed'); refresh(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
      <ConfirmDialog open={dlg === 'delete'} onOpenChange={(o) => !o && setDlg(null)} destructive title="Delete this requirement?" description="It is hidden everywhere. Delivery history is retained for audit." confirmLabel="Delete"
        onConfirm={async () => { setBusy(true); try { await del(`/requirements/${id}`); toast.success('Deleted'); navigate('/admin/requirements'); } catch (e) { toast.error(errorMessage(e)); throw e; } finally { setBusy(false); } }} />
      <span hidden>{String(busy)}</span>
    </>
  );
}

/* ------------------------------------ leaderboard ------------------------------------ */
export function AdminLeaderboard() {
  useSeo('Leaderboard management');
  const [period, setPeriod] = useState<'' | 'monthly' | 'yearly'>('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(() => api.get(`/leaderboard${period ? `/${period}` : ''}`, { params: { page, limit: 15, ...(group && { bloodGroup: group }) } }).then((r) => ({ ...r.data.data, meta: r.data.meta as any })), [period, group, page]);
  const an = useFetch(() => get('/admin/analytics'), []);
  const lb = an.data?.leaderboard;
  return (
    <>
      <PageHeader title="Leaderboard" description="Rankings are derived from the points ledger. Donors who hide their profile appear anonymously to the public." actions={<CsvButton type="points" label="Export points ledger" />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Ranked donors" value={lb?.donorsWithPoints ?? 0} loading={an.loading} /><StatCard label="Average points" value={lb?.averagePoints ?? 0} tone="neutral" loading={an.loading} /><StatCard label="Top score" value={lb?.topPoints ?? 0} tone="warning" loading={an.loading} /><StatCard label="Total awarded" value={(lb?.totalPoints ?? 0).toLocaleString()} tone="success" loading={an.loading} />
      </div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <div role="tablist" className="inline-flex rounded-lg border bg-white p-1">{([['', 'All time'], ['yearly', 'This year'], ['monthly', 'This month']] as const).map(([v, l]) => <button key={l} role="tab" aria-selected={period === v} onClick={() => { setPeriod(v); setPage(1); }} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${period === v ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>)}</div>
        <Select aria-label="Blood group" className="md:w-40" value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}><option value="">All groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
      </div>
      {loading && !data ? <Skeleton className="h-80" /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <>{page === 1 && data?.top3?.length ? <div className="mb-6"><Podium entries={data.top3 as LbEntry[]} /></div> : null}
          <Card className="overflow-hidden"><LeaderboardList entries={data?.entries ?? []} />{data?.meta?.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}</Card></>
      )}
    </>
  );
}

/* -------------------------------------- email logs -------------------------------------- */
export function AdminEmailLogs() {
  useSeo('Email logs');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/admin/email-logs', { page, limit: 20, status, template, search: dq }), [page, status, template, dq]);
  const stats = useFetch(() => get('/admin/dashboard'), []);
  const e = stats.data?.emails;
  const cols: Column<any>[] = [
    { key: 't', header: 'To', cell: (l) => l.to },
    { key: 'tpl', header: 'Template', cell: (l) => <Badge tone="brand">{l.template.replace(/_/g, ' ')}</Badge> },
    { key: 's', header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
    { key: 'at', header: 'Attempts', hideOnMobile: true, cell: (l) => l.attempts },
    { key: 'err', header: 'Last error', hideOnMobile: true, cell: (l) => <span className="line-clamp-1 max-w-[260px] text-xs text-destructive">{l.lastError ?? ''}</span> },
    { key: 'c', header: 'Created', hideOnMobile: true, cell: (l) => fmtDateTime(l.createdAt) },
    { key: 'a', header: '', className: 'text-right', cell: (l) => ['FAILED', 'QUEUED', 'RETRYING'].includes(l.status) ? <Button size="sm" variant="outline" onClick={async () => { try { await post(`/admin/email-logs/${l._id}/retry`); toast.success('Re-queued'); reload(); } catch (err) { toast.error(errorMessage(err)); } }}>Retry</Button> : null },
  ];
  return (
    <>
      <PageHeader title="Email logs" description="Every transactional email, with delivery status from Brevo webhooks." actions={<CsvButton type="emails" />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-5">
        {([['Queued', e?.queued, 'warning'], ['Sent', e?.sent, 'neutral'], ['Delivered', e?.delivered, 'success'], ['Failed', e?.failed, 'neutral'], ['Skipped', e?.skipped, 'neutral']] as const).map(([l, v, t]) => <StatCard key={l} label={l} value={v ?? 0} tone={t} loading={stats.loading} />)}
      </div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Recipient email" />
        <Select aria-label="Status" className="md:w-44" value={status} onChange={(e2) => { setStatus(e2.target.value); setPage(1); }}><option value="">Any status</option>{['QUEUED', 'RETRYING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'SKIPPED'].map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Template" className="md:w-56" value={template} onChange={(e2) => { setTemplate(e2.target.value); setPage(1); }}><option value="">Any template</option>{['WELCOME', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'CERTIFICATE_SUBMITTED', 'CERTIFICATE_APPROVED', 'CERTIFICATE_REJECTED', 'BLOOD_REQUIREMENT', 'DONATION_FOLLOWUP', 'ACCOUNT_STATUS', 'ADMIN_NOTIFICATION'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</Select>
      </div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} />
    </>
  );
}

/* --------------------------------------- reminders --------------------------------------- */
export function AdminReminders() {
  useSeo('Reminders');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('SCHEDULED');
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/admin/reminders', { page, limit: 15, status }), [page, status]);
  const [cancel, setCancel] = useState<any>(null);
  const [resched, setResched] = useState<any>(null);
  const [when, setWhen] = useState('');
  const [saving, setSaving] = useState(false);
  const cols: Column<any>[] = [
    { key: 'd', header: 'Donor', cell: (r) => <span className="font-medium">{r.donor?.fullName}<span className="block text-xs font-normal text-muted-foreground">{r.donor?.email}</span></span> },
    { key: 'don', header: 'Donation', hideOnMobile: true, cell: (r) => `${fmtDate(r.donation?.donationDate)} · ${r.donation?.location ?? ''}` },
    { key: 'sf', header: 'Scheduled for', cell: (r) => <>{fmtDateTime(r.scheduledFor)}<span className="block text-xs text-muted-foreground">{r.timezone}</span></> },
    { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'n', header: 'Note', hideOnMobile: true, cell: (r) => <span className="text-xs text-muted-foreground">{r.cancelReason ?? r.lastError ?? (r.sentAt ? `Sent ${fmtDateTime(r.sentAt)}` : '')}</span> },
    { key: 'a', header: '', className: 'text-right', cell: (r) => r.status === 'SCHEDULED' || r.status === 'CANCELLED' ? <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { setResched(r); setWhen(new Date(Math.max(Date.now() + 3600_000, new Date(r.scheduledFor).getTime())).toISOString().slice(0, 16)); }}>Reschedule</Button>{r.status === 'SCHEDULED' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancel(r)}>Cancel</Button>}</div> : null },
  ];
  return (
    <>
      <PageHeader title="Follow-up reminders" description="Sent about three calendar months after a verified donation. A reminder to check eligibility — never an eligibility decision." />
      <div className="mb-4"><Select aria-label="Status" className="w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{['SCHEDULED', 'SENT', 'CANCELLED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}</Select></div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} empty={<EmptyState title="No reminders" description="Reminders appear when donations are verified." />} />
      <ConfirmDialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)} destructive title="Cancel this reminder?" description="The donor will not receive the follow-up email." confirmLabel="Cancel reminder"
        onConfirm={async () => { try { await post(`/admin/reminders/${cancel._id}/cancel`, { reason: 'Cancelled by administrator' }); toast.success('Cancelled'); reload(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
      <Modal open={!!resched} onOpenChange={(o) => !o && setResched(null)} title="Reschedule reminder" description={`Time is in your browser's timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}>
        <Field label="Send at" htmlFor="rs-when"><Input id="rs-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setResched(null)}>Cancel</Button>
          <Button loading={saving} onClick={async () => { setSaving(true); try { await patch(`/admin/reminders/${resched._id}`, { scheduledFor: new Date(when).toISOString() }); toast.success('Rescheduled'); setResched(null); reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); } }}>Save</Button></div>
      </Modal>
    </>
  );
}
