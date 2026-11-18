import { CheckCircle2, ClipboardCheck, Droplet, Eye, FileWarning, Heart, Mail, Megaphone, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Column, DataTable, EmptyState, ErrorState, PageHeader, SearchInput, StatCard } from '@/components/ui/data';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Skeleton, StatusBadge, Textarea } from '@/components/ui/primitives';
import { api, errorMessage, get, getPaged, patch, post, del } from '@/lib/api';
import { useDebounced, useFetch, useSeo } from '@/lib/hooks';
import { BLOOD_GROUPS, fmtDate, fmtDateTime, fmtNumber, todayISO } from '@/lib/utils';
import { Donut, MonthlyBars } from './charts';
import { useAuth } from '@/store/auth';

/* ----------------------------------- dashboard ----------------------------------- */
export function AdminDashboard() {
  useSeo('Admin dashboard');
  const stats = useFetch(() => get('/admin/dashboard'), []);
  const an = useFetch(() => get('/admin/analytics'), []);
  const pending = useFetch(() => getPaged<any>('/certificates', { status: 'PENDING', limit: 5 }), []);
  const s = stats.data;
  const l = stats.loading;
  return (
    <>
      <PageHeader title="Dashboard" description="Platform overview" actions={<Button asChild><Link to="/admin/certificates">Review certificates {s?.pendingCertificates ? <Badge tone="warning" className="ml-1">{s.pendingCertificates}</Badge> : null}</Link></Button>} />
      {stats.error && <ErrorState message={stats.error} onRetry={stats.reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered donors" value={fmtNumber(s?.totalDonors)} icon={<Users className="h-5 w-5" />} loading={l} />
        <StatCard label="Active donors" value={fmtNumber(s?.activeDonors)} icon={<Heart className="h-5 w-5" />} tone="success" loading={l} />
        <StatCard label="Verified donations" value={fmtNumber(s?.verifiedDonations)} icon={<Droplet className="h-5 w-5" />} loading={l} />
        <StatCard label="Total points awarded" value={fmtNumber(s?.totalPointsAwarded)} icon={<ClipboardCheck className="h-5 w-5" />} tone="warning" loading={l} />
        <StatCard label="Pending certificates" value={fmtNumber(s?.pendingCertificates)} icon={<FileWarning className="h-5 w-5" />} tone="warning" loading={l} />
        <StatCard label="Rejected certificates" value={fmtNumber(s?.rejectedCertificates)} icon={<XCircle className="h-5 w-5" />} tone="neutral" loading={l} />
        <StatCard label="Active requirements" value={fmtNumber(s?.activeRequirements)} icon={<Megaphone className="h-5 w-5" />} loading={l} />
        <StatCard label="Emails delivered / sent" value={s ? `${fmtNumber(s.emails.delivered)} / ${fmtNumber(s.emails.sent + s.emails.delivered)}` : '—'} icon={<Mail className="h-5 w-5" />} tone="success" loading={l}
          hint={s ? `${s.emails.queued} queued · ${s.emails.failed} failed` : undefined} />
      </div>
      {s?.deletionRequests > 0 && <Card className="mt-4 flex items-center justify-between gap-3 border-amber-200 bg-warning-soft p-4 text-sm"><span><strong>{s.deletionRequests}</strong> donor(s) requested account deletion.</span><Button asChild size="sm" variant="outline"><Link to="/admin/donors?deletionRequested=true">Review</Link></Button></Card>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Verified donations by month</CardTitle></CardHeader><CardContent>{an.loading ? <Skeleton className="h-64" /> : <MonthlyBars data={an.data?.donationsByMonth ?? []} name="Donations" />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Blood group distribution</CardTitle></CardHeader><CardContent>{an.loading ? <Skeleton className="h-64" /> : <Donut data={an.data?.bloodGroupDistribution ?? []} label="Donors by blood group" />}</CardContent></Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Oldest pending certificates</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/admin/certificates">Open queue</Link></Button></CardHeader>
        <CardContent>
          {pending.loading ? <Skeleton className="h-24" /> : !pending.data?.items.length ? <EmptyState title="Nothing waiting for review" icon={<CheckCircle2 className="h-6 w-6" />} /> : (
            <ul className="divide-y">{pending.data.items.map((c: any) => <li key={c._id} className="flex items-center justify-between py-2.5 text-sm"><span><span className="font-medium">{c.donor?.fullName}</span> <span className="text-muted-foreground">· {c.donation?.location} · {fmtDate(c.donation?.donationDate)}</span></span><span className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</span></li>)}</ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------------- donors ------------------------------------- */
export function AdminDonors() {
  useSeo('Donor management');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [bg, setBg] = useState('');
  const [city, setCity] = useState('');
  const [active, setActive] = useState('');
  const [toggle, setToggle] = useState<any>(null);
  const dq = useDebounced(q);
  const dcity = useDebounced(city);
  const delReq = new URLSearchParams(window.location.search).get('deletionRequested') ?? '';
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/donors', { page, limit: 15, search: dq, bloodGroup: bg, city: dcity, isActive: active, deletionRequested: delReq }), [page, dq, bg, dcity, active, delReq]);
  const cols: Column<any>[] = [
    { key: 'n', header: 'Donor', cell: (p) => <Link to={`/admin/donors/${p.user?._id}`} className="font-semibold hover:text-primary">{p.user?.fullName}<span className="block text-xs font-normal text-muted-foreground">{p.user?.email}</span></Link> },
    { key: 'bg', header: 'Group', cell: (p) => <Badge tone="brand">{p.bloodGroup}</Badge> },
    { key: 'loc', header: 'Location', hideOnMobile: true, cell: (p) => `${p.city}, ${p.state}` },
    { key: 'pts', header: 'Points', hideOnMobile: true, cell: (p) => <span className="tabular-nums">{p.totalPoints}</span> },
    { key: 's', header: 'Status', cell: (p) => <div className="flex flex-wrap gap-1">{p.user?.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}{p.user?.deletionRequestedAt && <Badge tone="warning">Deletion req.</Badge>}</div> },
    { key: 'a', header: '', className: 'text-right', cell: (p) => <div className="flex justify-end gap-2"><Button asChild size="sm" variant="ghost"><Link to={`/admin/donors/${p.user?._id}`}><Eye className="h-3.5 w-3.5" /> View</Link></Button><Button size="sm" variant="outline" onClick={() => setToggle(p.user)}>{p.user?.isActive ? 'Deactivate' : 'Activate'}</Button></div> },
  ];
  return (
    <>
      <PageHeader title="Donors" description="Search, filter and manage donor accounts." actions={<CsvButton type="donors" />} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or email" />
        <Select aria-label="Blood group" className="md:w-40" value={bg} onChange={(e) => { setBg(e.target.value); setPage(1); }}><option value="">All groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
        <Input aria-label="City" className="md:w-44" placeholder="City" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} />
        <Select aria-label="Status" className="md:w-40" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}><option value="">Any status</option><option value="true">Active</option><option value="false">Inactive</option></Select>
      </div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} rowKey={(r) => r._id} />
      <ConfirmDialog open={!!toggle} onOpenChange={(o) => !o && setToggle(null)} destructive={toggle?.isActive} askReason={toggle?.isActive} minReason={3} reasonLabel="Reason (sent to the donor)"
        title={toggle?.isActive ? `Deactivate ${toggle?.fullName}?` : `Activate ${toggle?.fullName}?`} description={toggle?.isActive ? 'They will be signed out and unable to log in.' : 'They will be able to log in again.'} confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'}
        onConfirm={async (reason) => { try { await patch(`/donors/${toggle._id}/status`, { isActive: !toggle.isActive, reason: reason || undefined }); toast.success('Donor updated'); reload(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
    </>
  );
}

/** Downloads a CSV through the authenticated API (the token is never put in a URL). */
export function CsvButton({ type, from, to, label = 'Export CSV' }: { type: string; from?: string; to?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" loading={busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await api.get('/admin/reports', { params: { type, format: 'csv', ...(from && { from }), ...(to && { to }) }, responseType: 'blob' });
        const url = URL.createObjectURL(r.data);
        const a = document.createElement('a'); a.href = url; a.download = `lifedrop-${type}.csv`; a.click(); URL.revokeObjectURL(url);
      } catch (e) { toast.error(errorMessage(e, 'Export failed')); } finally { setBusy(false); }
    }}>{label}</Button>
  );
}

/* ---------------------------------- donor details ---------------------------------- */
export function AdminDonorDetail() {
  const { id } = useParams();
  useSeo('Donor details');
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useFetch(() => get(`/donors/${id}`), [id]);
  const [open, setOpen] = useState<'status' | 'erase' | null>(null);
  if (loading && !data) return <Skeleton className="h-96" />;
  if (error || !data) return <ErrorState message={error ?? 'Not found'} onRetry={reload} />;
  const { user, profile, donations, points, rank } = data;
  const row = (k: string, v: any) => <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v || '—'}</dd></div>;
  return (
    <>
      <PageHeader title={user.fullName} description={user.email} actions={isAdmin && <>
        <Button variant="outline" onClick={() => setOpen('status')}>{user.isActive ? 'Deactivate' : 'Activate'}</Button>
        {user.deletionRequestedAt && <Button variant="destructive" onClick={() => setOpen('erase')}>Erase donor data</Button>}
      </>} />
      {user.deletionRequestedAt && <Card className="mb-4 border-amber-200 bg-warning-soft p-4 text-sm">Deletion requested on {fmtDate(user.deletionRequestedAt)}.</Card>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Profile</CardTitle><StatusBadge status={user.isActive ? 'ACTIVE' : 'REJECTED'} /></CardHeader><CardContent>
          <dl className="divide-y">{row('Blood group', profile?.bloodGroup)}{row('Phone', profile?.phone)}{row('Date of birth', fmtDate(profile?.dateOfBirth))}{row('Gender', profile?.gender)}{row('Location', profile && `${profile.city}, ${profile.state}, ${profile.country}`)}{row('Address', profile?.address)}{row('Email verified', user.emailVerified ? 'Yes' : 'No')}{row('Available', profile?.isAvailable ? 'Yes' : 'No')}{row('On leaderboard', profile?.privacy?.showOnLeaderboard ? 'Visible' : 'Hidden')}{row('Emergency contact', profile?.emergencyContact?.name && `${profile.emergencyContact.name} ${profile.emergencyContact.phone ?? ''}`)}{row('Registered', fmtDate(user.createdAt))}{row('Last login', fmtDateTime(user.lastLoginAt))}</dl>
        </CardContent></Card>
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Points" value={profile?.totalPoints ?? 0} tone="warning" /><StatCard label="Verified donations" value={profile?.totalVerifiedDonations ?? 0} /><StatCard label="Rank" value={rank?.rank ? `#${rank.rank}` : '—'} tone="success" /></div>
          <Card><CardHeader><CardTitle>Donation history</CardTitle></CardHeader><CardContent>
            {!donations.length ? <EmptyState title="No donations" /> : <ul className="divide-y">{donations.map((d: any) => <li key={d._id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><div><p className="font-medium">{d.location}</p><p className="text-xs text-muted-foreground">{fmtDate(d.donationDate)} · {d.bloodGroup}{d.adminRemarks ? ` · ${d.adminRemarks}` : ''}</p></div><StatusBadge status={d.status} /></li>)}</ul>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Points ledger</CardTitle></CardHeader><CardContent>
            {!points.length ? <EmptyState title="No point transactions" /> : <ul className="divide-y">{points.map((p: any) => <li key={p._id} className="flex justify-between py-2 text-sm"><span>{p.type === 'DONATION_APPROVED' ? 'Donation verified' : 'Reversed'} <span className="text-xs text-muted-foreground">· {fmtDateTime(p.createdAt)}</span></span><span className={p.points > 0 ? 'font-bold text-success' : 'font-bold text-destructive'}>{p.points > 0 ? '+' : ''}{p.points}</span></li>)}</ul>}
          </CardContent></Card>
        </div>
      </div>
      <ConfirmDialog open={open === 'status'} onOpenChange={(o) => !o && setOpen(null)} destructive={user.isActive} askReason={user.isActive} minReason={3} title={user.isActive ? 'Deactivate account?' : 'Activate account?'} confirmLabel={user.isActive ? 'Deactivate' : 'Activate'}
        onConfirm={async (reason) => { try { await patch(`/donors/${id}/status`, { isActive: !user.isActive, reason: reason || undefined }); toast.success('Updated'); reload(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
      <ConfirmDialog open={open === 'erase'} onOpenChange={(o) => !o && setOpen(null)} destructive title="Permanently erase this donor's data?" description="Their profile, certificates and files are deleted and the account is anonymised. This cannot be undone." confirmLabel="Erase data"
        onConfirm={async () => { try { await del(`/donors/${id}`); toast.success('Donor data erased'); window.location.assign('/admin/donors'); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
    </>
  );
}

/* ------------------------------------ donations ------------------------------------ */
export function AdminDonations() {
  useSeo('Donation records');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [bg, setBg] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/donations', { page, limit: 15, status, bloodGroup: bg, search: dq }), [page, status, bg, dq]);
  const [invalidate, setInvalidate] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ donationDate: '', location: '', adminRemarks: '' });
  const [saving, setSaving] = useState(false);
  const cols: Column<any>[] = [
    { key: 'd', header: 'Donor', cell: (d) => <span className="font-semibold">{d.donor?.fullName}<span className="block text-xs font-normal text-muted-foreground">{d.donor?.email}</span></span> },
    { key: 'date', header: 'Date', cell: (d) => fmtDate(d.donationDate) },
    { key: 'loc', header: 'Location', hideOnMobile: true, cell: (d) => d.location },
    { key: 'bg', header: 'Group', hideOnMobile: true, cell: (d) => d.bloodGroup },
    { key: 's', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
    { key: 'by', header: 'Verified by', hideOnMobile: true, cell: (d) => d.verifiedBy?.fullName ?? '—' },
    { key: 'a', header: '', className: 'text-right', cell: (d) => <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => { setEdit(d); setForm({ donationDate: d.donationDate.slice(0, 10), location: d.location, adminRemarks: d.adminRemarks ?? '' }); }}>Edit</Button>
      {d.status === 'VERIFIED' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setInvalidate(d)}>Invalidate</Button>}
    </div> },
  ];
  return (
    <>
      <PageHeader title="Donation records" actions={<CsvButton type="donations" />} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Donor or location" />
        <Select aria-label="Status" className="md:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option>PENDING</option><option>VERIFIED</option><option>REJECTED</option></Select>
        <Select aria-label="Blood group" className="md:w-40" value={bg} onChange={(e) => { setBg(e.target.value); setPage(1); }}><option value="">All groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
      </div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} />
      <ConfirmDialog open={!!invalidate} onOpenChange={(o) => !o && setInvalidate(null)} destructive askReason title="Invalidate this verified donation?" description="Points will be reversed, the follow-up reminder cancelled and the donor notified." confirmLabel="Invalidate"
        onConfirm={async (reason) => { try { await patch(`/donations/${invalidate._id}/status`, { status: 'REJECTED', remarks: reason }); toast.success('Donation invalidated'); reload(); } catch (e) { toast.error(errorMessage(e)); throw e; } }} />
      <Modal open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Correct donation details" description="Changing the date of a verified donation moves its follow-up reminder.">
        <div className="space-y-4">
          <Field label="Donation date" htmlFor="e-date"><Input id="e-date" type="date" max={todayISO()} value={form.donationDate} onChange={(e) => setForm({ ...form, donationDate: e.target.value })} /></Field>
          <Field label="Location" htmlFor="e-loc"><Input id="e-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Admin remarks" htmlFor="e-rem"><Textarea id="e-rem" value={form.adminRemarks} onChange={(e) => setForm({ ...form, adminRemarks: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button loading={saving} onClick={async () => { setSaving(true); try { await patch(`/donations/${edit._id}`, form); toast.success('Saved'); setEdit(null); reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); } }}>Save</Button></div>
        </div>
      </Modal>
    </>
  );
}

/* ---------------------------------- certificates ---------------------------------- */
export function AdminCertificates() {
  useSeo('Certificate verification');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/certificates', { page, limit: 10, status, search: dq }), [page, status, dq]);
  const [review, setReview] = useState<any>(null);
  const cols: Column<any>[] = [
    { key: 'd', header: 'Donor', cell: (c) => <span className="font-semibold">{c.donor?.fullName}<span className="block text-xs font-normal text-muted-foreground">{c.donor?.email}</span></span> },
    { key: 'date', header: 'Donation', cell: (c) => <>{fmtDate(c.donation?.donationDate)}<span className="block text-xs text-muted-foreground">{c.donation?.location}</span></> },
    { key: 'sub', header: 'Submitted', hideOnMobile: true, cell: (c) => fmtDateTime(c.createdAt) },
    { key: 's', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'rev', header: 'Reviewed by', hideOnMobile: true, cell: (c) => c.reviewedBy ? `${c.reviewedBy.fullName} · ${fmtDate(c.reviewedAt)}` : '—' },
    { key: 'a', header: '', className: 'text-right', cell: (c) => <Button size="sm" variant={c.status === 'PENDING' ? 'default' : 'outline'} onClick={() => setReview(c)}>{c.status === 'PENDING' ? 'Review' : 'View'}</Button> },
  ];
  return (
    <>
      <PageHeader title="Certificate verification" description="Review uploaded donation certificates. Approving credits exactly 100 points." actions={<CsvButton type="certificates" />} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Donor name or email" />
        <Select aria-label="Status" className="md:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></Select>
      </div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} empty={<EmptyState title={status === 'PENDING' ? 'Queue is empty' : 'No certificates'} description="Nothing to show for this filter." />} />
      {review && <ReviewModal cert={review} onClose={() => setReview(null)} onDone={() => { setReview(null); reload(); }} />}
    </>
  );
}

function ReviewModal({ cert, onClose, onDone }: { cert: any; onClose: () => void; onDone: () => void }) {
  const preview = useFetch(() => get('/certificates/' + cert._id + '/download', { inline: '1' }), [cert._id]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const isImg = preview.data?.mimeType?.startsWith('image/');
  const decide = async (kind: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await post(`/certificates/${cert._id}/${kind}`, kind === 'reject' ? { reason } : {});
      toast.success(kind === 'approve' ? 'Approved — 100 points credited' : 'Certificate rejected');
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Review certificate" wide description={`${cert.donor?.fullName} · ${cert.donation?.location} · ${fmtDate(cert.donation?.donationDate)}`}>
      <div className="grid gap-4 md:grid-cols-5">
        <div className="min-h-[320px] overflow-hidden rounded-lg border bg-muted md:col-span-3">
          {preview.loading ? <Skeleton className="h-80" /> : preview.error ? <ErrorState message={preview.error} onRetry={preview.reload} /> : isImg
            ? <img src={preview.data.url} alt="Donation certificate" className="max-h-[60vh] w-full object-contain" referrerPolicy="no-referrer" />
            : <iframe src={preview.data.url} title="Donation certificate" className="h-[60vh] w-full" referrerPolicy="no-referrer" />}
        </div>
        <div className="space-y-3 text-sm md:col-span-2">
          <dl className="divide-y rounded-lg border">
            {[['Donor', cert.donor?.fullName], ['Email', cert.donor?.email], ['Blood group', cert.donation?.bloodGroup], ['Date', fmtDate(cert.donation?.donationDate)], ['Location', cert.donation?.location], ['File', cert.originalName], ['Status', <StatusBadge key="s" status={cert.status} />]].map(([k, v]) => <div key={k as string} className="flex justify-between gap-3 px-3 py-2"><dt className="text-muted-foreground">{k as string}</dt><dd className="text-right font-medium">{v as any}</dd></div>)}
          </dl>
          {cert.rejectionReason && <p className="rounded-lg bg-destructive-soft p-3 text-destructive"><strong>Rejection reason:</strong> {cert.rejectionReason}</p>}
          {preview.data?.url && <Button asChild variant="outline" size="sm" className="w-full"><a href={preview.data.url} target="_blank" rel="noopener noreferrer">Open in new tab</a></Button>}
          {cert.status === 'PENDING' && (rejecting ? (
            <div className="space-y-2">
              <Textarea aria-label="Rejection reason" placeholder="Reason shown to the donor (min 5 chars)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setRejecting(false)}>Back</Button><Button variant="destructive" className="flex-1" loading={busy} disabled={reason.trim().length < 5} onClick={() => decide('reject')}>Confirm reject</Button></div>
            </div>
          ) : (
            <div className="flex gap-2"><Button variant="destructive" className="flex-1" onClick={() => setRejecting(true)}><XCircle className="h-4 w-4" /> Reject</Button><Button variant="success" className="flex-1" loading={busy} onClick={() => decide('approve')}><CheckCircle2 className="h-4 w-4" /> Approve</Button></div>
          ))}
          <p className="text-xs text-muted-foreground">The link above expires in 5 minutes. Approving credits exactly 100 points once and schedules the three-month follow-up reminder.</p>
        </div>
      </div>
    </Modal>
  );
}
