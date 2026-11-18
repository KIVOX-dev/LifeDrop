import { zodResolver } from '@hookform/resolvers/zod';
import { Bot, FileText, Plus, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Modal } from '@/components/ui/dialog';
import { Column, DataTable, EmptyState, ErrorState, PageHeader, StatCard } from '@/components/ui/data';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Skeleton, StatusBadge, Switch } from '@/components/ui/primitives';
import { errorMessage, get, getPaged, patch, post, put } from '@/lib/api';
import { useFetch, useSeo } from '@/lib/hooks';
import { passwordRule } from '@/lib/schemas';
import { cn, fmtDate, fmtDateTime } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { Donut, HBars, MonthlyBars, TwoLines } from './charts';
import { CsvButton } from './pages1';

/* ------------------------------------- analytics ------------------------------------- */
export function AdminAnalytics() {
  useSeo('Analytics & reports');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, loading, error, reload } = useFetch(() => get('/admin/analytics', { from: from ? new Date(from).toISOString() : '', to: to ? new Date(`${to}T23:59:59`).toISOString() : '' }), [from, to]);
  const d = data;
  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{loading && !d ? <Skeleton className="h-64" /> : children}</CardContent></Card>;
  const reports = ['donors', 'donations', 'certificates', 'points', 'requirements', 'emails'];
  return (
    <>
      <PageHeader title="Analytics & reports" description="Filter by date range and export CSV." />
      <Card className="mb-6 flex flex-col gap-3 p-4 md:flex-row md:items-end">
        <Field label="From" htmlFor="a-from" className="md:w-44"><Input id="a-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="a-to" className="md:w-44"><Input id="a-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button variant="outline" onClick={() => { setFrom(''); setTo(''); }}>Reset</Button>
        <div className="flex flex-wrap gap-2 md:ml-auto">{reports.map((r) => <CsvButton key={r} type={r} from={from ? new Date(from).toISOString() : undefined} to={to ? new Date(`${to}T23:59:59`).toISOString() : undefined} label={`Export ${r}`} />)}</div>
      </Card>
      {error && <ErrorState message={error} onRetry={reload} />}
      {d && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Approval rate" value={d.certificates.approvalRate === null ? '—' : `${d.certificates.approvalRate}%`} tone="success" hint={`${d.certificates.approved} approved · ${d.certificates.rejected} rejected`} />
          <StatCard label="Pending certificates" value={d.certificates.pending} tone="warning" />
          <StatCard label="Donors with points" value={d.leaderboard.donorsWithPoints} />
          <StatCard label="Average points / donor" value={d.leaderboard.averagePoints} tone="neutral" />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Donor registrations by month"><MonthlyBars data={d?.registrationsByMonth ?? []} name="Registrations" color="#334155" /></Block>
        <Block title="Verified donations by month"><MonthlyBars data={d?.donationsByMonth ?? []} name="Donations" /></Block>
        <Block title="Registrations vs donations"><TwoLines a={d?.registrationsByMonth ?? []} b={d?.donationsByMonth ?? []} aName="Registrations" bName="Donations" /></Block>
        <Block title="Blood group distribution"><Donut data={d?.bloodGroupDistribution ?? []} label="Donors by blood group" /></Block>
        <Block title="Certificate outcomes"><Donut data={d ? [{ name: 'Approved', value: d.certificates.approved }, { name: 'Rejected', value: d.certificates.rejected }, { name: 'Pending', value: d.certificates.pending }] : []} label="Certificate outcomes" /></Block>
        <Block title="Top cities"><HBars data={d?.geographicDistribution.cities ?? []} /></Block>
        <Block title="Top states"><HBars data={d?.geographicDistribution.states ?? []} color="#B91C35" /></Block>
        <Block title="Requirements by blood group"><HBars data={d?.requirements.byBloodGroup ?? []} color="#D97706" /></Block>
        <Block title="Requirements by status"><Donut data={d?.requirements.byStatus ?? []} label="Requirements by status" /></Block>
        <Block title="Email delivery status"><Donut data={d?.emails.byStatus ?? []} label="Email status" /></Block>
        <Block title="Emails by template"><HBars data={(d?.emails.byTemplate ?? []).map((x: any) => ({ ...x, name: x.name.replace(/_/g, ' ').toLowerCase() }))} /></Block>
      </div>
    </>
  );
}

/* ------------------------------------- AI assistant ------------------------------------- */
interface Msg { role: 'user' | 'assistant'; content: string }
export function AdminAIAssistant() {
  useSeo('AI assistant');
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: 'I can answer questions about platform statistics, summarise donor activity and requirements, and draft reports. I use anonymised aggregates only and cannot approve certificates or judge medical eligibility.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState('');
  const [repBusy, setRepBusy] = useState(false);

  const ask = async (body: Record<string, unknown>, label: string) => {
    if (busy) return;
    const history = msgs.slice(1).slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: label }]);
    setBusy(true);
    try { const d = await post('/ai/admin-assistant', { ...body, history }); setMsgs((m) => [...m, { role: 'assistant', content: d.reply }]); }
    catch (e) { setMsgs((m) => [...m, { role: 'assistant', content: `⚠️ ${errorMessage(e, 'The assistant is unavailable.')}` }]); }
    finally { setBusy(false); }
  };
  const quick: [string, string][] = [['insights', 'Dashboard insights'], ['donor_activity', 'Summarise donor activity'], ['requirement_summary', 'Summarise requirements']];

  return (
    <>
      <PageHeader title="AI assistant" description="Powered by Groq, called from the server only. Anonymised aggregate data is shared; no donor names, emails or phone numbers." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex h-[65vh] flex-col lg:col-span-2">
          <div className="flex flex-wrap gap-2 border-b p-3">{quick.map(([m, l]) => <Button key={m} size="sm" variant="soft" disabled={busy} onClick={() => ask({ mode: m }, l)}><Sparkles className="h-3.5 w-3.5" /> {l}</Button>)}</div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {msgs.map((m, i) => <div key={i} className={cn('max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm', m.role === 'user' ? 'ml-auto bg-primary text-white' : 'bg-muted')}>{m.content}</div>)}
            {busy && <div className="w-fit rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">Thinking…</div>}
          </div>
          <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); const q = text.trim(); if (q.length < 2) return; setText(''); void ask({ mode: 'chat', message: q }, q); }}>
            <Input aria-label="Ask a question" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="e.g. How many certificates are pending and which blood group is most needed?" />
            <Button type="submit" disabled={busy || text.trim().length < 2} aria-label="Send"><Send className="h-4 w-4" /></Button>
          </form>
        </Card>
        <Card>
          <CardHeader><CardTitle><FileText className="mr-1 inline h-4 w-4" /> Monthly report</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Month" htmlFor="rep-month"><Input id="rep-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
            <Button className="w-full" loading={repBusy} onClick={async () => { setRepBusy(true); try { const d = await post('/ai/report-summary', { month }); setReport(d.report); } catch (e) { toast.error(errorMessage(e)); } finally { setRepBusy(false); } }}><Bot className="h-4 w-4" /> Generate report</Button>
            {report && (<><div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">{report}</div><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(report); toast.success('Copied'); }}>Copy</Button></>)}
            <p className="text-xs text-muted-foreground">AI output can contain mistakes. Verify important figures in Analytics.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ----------------------------------- admin management ----------------------------------- */
export function AdminAdmins() {
  useSeo('Admin management');
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/admin/users', { page, limit: 15, role: '' }), [page]);
  const schema = z.object({ fullName: z.string().trim().min(2, 'Required'), email: z.string().trim().email('Enter a valid email'), password: passwordRule, role: z.enum(['ADMIN', 'SUPER_ADMIN']) });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { role: 'ADMIN' as const } });
  const cols: Column<any>[] = [
    { key: 'n', header: 'Name', cell: (u) => <span className="font-semibold">{u.fullName}<span className="block text-xs font-normal text-muted-foreground">{u.email}</span></span> },
    { key: 'r', header: 'Role', cell: (u) => <Badge tone={u.role === 'SUPER_ADMIN' ? 'brand' : u.role === 'ADMIN' ? 'info' : 'neutral'}>{u.role.replace('_', ' ')}</Badge> },
    { key: 'l', header: 'Last login', hideOnMobile: true, cell: (u) => fmtDateTime(u.lastLoginAt) },
    { key: 's', header: 'Active', cell: (u) => u.role === 'DONOR' ? <StatusBadge status={u.isActive ? 'ACTIVE' : 'REJECTED'} /> : <Switch aria-label={`Active: ${u.fullName}`} checked={u.isActive} disabled={u._id === user?._id} onCheckedChange={async (c) => { try { await patch(`/admin/users/${u._id}`, { isActive: c }); toast.success('Updated'); reload(); } catch (e) { toast.error(errorMessage(e)); } }} /> },
    { key: 'ro', header: 'Change role', hideOnMobile: true, cell: (u) => u.role !== 'DONOR' && u._id !== user?._id ? <Select aria-label={`Role: ${u.fullName}`} className="h-8 w-36 text-xs" value={u.role} onChange={async (e) => { try { await patch(`/admin/users/${u._id}`, { role: e.target.value }); toast.success('Role updated'); reload(); } catch (err) { toast.error(errorMessage(err)); } }}><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super admin</option></Select> : null },
  ];
  return (
    <>
      <PageHeader title="Administrators" description="Only super admins can create or change administrator accounts." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add administrator</Button>} />
      <DataTable columns={cols} rows={data?.items?.filter((u: any) => u.role !== 'DONOR')} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} />
      <Modal open={open} onOpenChange={setOpen} title="Add administrator" description="They can sign in immediately with these credentials. Ask them to change the password.">
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { try { await post('/admin/users', v); toast.success('Administrator created'); setOpen(false); reset(); reload(); } catch (e) { toast.error(errorMessage(e)); } })}>
          <Field label="Full name" htmlFor="ad-n" error={errors.fullName?.message}><Input id="ad-n" {...register('fullName')} /></Field>
          <Field label="Email" htmlFor="ad-e" error={errors.email?.message}><Input id="ad-e" type="email" {...register('email')} /></Field>
          <Field label="Temporary password" htmlFor="ad-p" error={errors.password?.message}><Input id="ad-p" type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Role" htmlFor="ad-r"><Select id="ad-r" {...register('role')}><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super admin</option></Select></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={isSubmitting}>Create</Button></div>
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------ audit ------------------------------------------ */
export function AdminAuditLogs() {
  useSeo('Audit logs');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, loading, error, reload } = useFetch(() => getPaged<any>('/admin/activity-logs', { page, limit: 20, action }), [page, action]);
  const cols: Column<any>[] = [
    { key: 'w', header: 'When', cell: (l) => fmtDateTime(l.createdAt) },
    { key: 'a', header: 'Actor', cell: (l) => <span>{l.actor?.fullName ?? '—'}<span className="block text-xs text-muted-foreground">{l.actorRole?.replace('_', ' ')}</span></span> },
    { key: 'ac', header: 'Action', cell: (l) => <Badge tone="brand">{l.action.replace(/_/g, ' ')}</Badge> },
    { key: 'e', header: 'Entity', hideOnMobile: true, cell: (l) => <span className="text-xs">{l.entityType}{l.entityId ? ` · ${l.entityId.slice(-6)}` : ''}</span> },
    { key: 'm', header: 'Details', hideOnMobile: true, cell: (l) => <span className="line-clamp-1 max-w-[260px] text-xs text-muted-foreground">{l.meta ? JSON.stringify(l.meta) : ''}</span> },
    { key: 'ip', header: 'IP', hideOnMobile: true, cell: (l) => <span className="text-xs">{l.ip}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit logs" description="Every sensitive administrator action is recorded." />
      <div className="mb-4"><Select aria-label="Action" className="w-64" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{['CERTIFICATE_APPROVED', 'CERTIFICATE_REJECTED', 'CERTIFICATE_VIEWED', 'CERTIFICATE_DELETED', 'DONATION_VERIFIED', 'DONATION_REJECTED', 'DONATION_CORRECTED', 'DONOR_ACTIVATED', 'DONOR_DEACTIVATED', 'DONOR_DELETED', 'REQUIREMENT_CREATED', 'REQUIREMENT_PUBLISHED', 'REQUIREMENT_CLOSED', 'REQUIREMENT_DELETED', 'REMINDER_CANCELLED', 'REMINDER_RESCHEDULED', 'ADMIN_CREATED', 'ADMIN_UPDATED', 'SETTINGS_UPDATED', 'REPORT_EXPORTED', 'AI_ADMIN_QUERY'].map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}</Select></div>
      <DataTable columns={cols} rows={data?.items} loading={loading} error={error} onRetry={reload} meta={data?.meta} onPage={setPage} empty={<EmptyState title="No activity recorded" />} />
    </>
  );
}

/* ---------------------------------------- settings ---------------------------------------- */
export function AdminSettings() {
  useSeo('Settings');
  const { isSuperAdmin } = useAuth();
  const { data, loading, error, reload } = useFetch(() => get('/admin/settings'), []);
  const schema = z.object({ reminderMonths: z.coerce.number().int().min(1).max(12), registrationsOpen: z.boolean(), contactEmail: z.union([z.string().email('Invalid email'), z.literal('')]), contactPhone: z.string().max(30), contactAddress: z.string().max(300), announcement: z.string().max(300) });
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm({ resolver: zodResolver(schema) as any, values: data?.settings });
  if (loading && !data) return <Skeleton className="h-96" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const integ = data.integrations;
  const row = (name: string, ok: boolean, hint: string) => <li key={name} className="flex items-center justify-between py-3 text-sm"><div><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{hint}</p></div><Badge tone={ok ? 'success' : 'warning'}>{ok ? 'Configured' : 'Not configured'}</Badge></li>;
  return (
    <>
      <PageHeader title="Settings" description={isSuperAdmin ? 'Platform configuration.' : 'Read-only. Only super admins can change settings.'} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v: any) => { try { await put('/admin/settings', v); toast.success('Settings saved'); reload(); } catch (e) { toast.error(errorMessage(e)); } })}>
            <fieldset disabled={!isSuperAdmin} className="space-y-4">
              <Field label="Follow-up reminder (calendar months after donation)" htmlFor="s-m" error={(errors as any).reminderMonths?.message} hint="Applies to newly verified donations."><Input id="s-m" type="number" min={1} max={12} className="w-28" {...register('reminderMonths')} /></Field>
              <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" {...register('registrationsOpen')} /> Allow new donor registrations</label>
              <Field label="Public contact email" htmlFor="s-e" error={(errors as any).contactEmail?.message}><Input id="s-e" type="email" {...register('contactEmail')} /></Field>
              <Field label="Public contact phone" htmlFor="s-p"><Input id="s-p" {...register('contactPhone')} /></Field>
              <Field label="Public contact address" htmlFor="s-a"><Input id="s-a" {...register('contactAddress')} /></Field>
              <Field label="Site announcement (optional)" htmlFor="s-an"><Input id="s-an" {...register('announcement')} /></Field>
            </fieldset>
            {isSuperAdmin && <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save settings</Button>}
          </form>
        </Card>
        <Card><CardHeader><CardTitle>Integrations</CardTitle></CardHeader><CardContent><ul className="divide-y">{row('Brevo (email)', integ.brevo, 'BREVO_API_KEY, BREVO_SENDER_EMAIL')}{row('Backblaze B2 (storage)', integ.b2, 'B2_* variables')}{row('Groq (AI)', integ.groq, 'GROQ_API_KEY, GROQ_MODEL')}</ul><p className="mt-3 text-xs text-muted-foreground">Secrets live in server environment variables and are never shown here. Points per approved certificate are fixed at 100. Timezone: {data.timezone}.</p></CardContent></Card>
      </div>
    </>
  );
}
