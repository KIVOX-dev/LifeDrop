import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Droplet, HeartHandshake, ShieldCheck, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { FaqList, LeaderboardList, LbEntry, PageHero, Podium, Requirement, RequirementCard } from '@/components/shared/blocks';
import { EmptyState, ErrorState, Pagination, SearchInput } from '@/components/ui/data';
import { Button, Card, Field, Input, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { api, errorMessage, get, post } from '@/lib/api';
import { FAQS, PRIVACY_SECTIONS, STEPS, TERMS_SECTIONS, TESTIMONIALS } from '@/lib/content';
import { useDebounced, useFetch, useSeo } from '@/lib/hooks';
import { BLOOD_GROUPS, fmtNumber } from '@/lib/utils';
import { useAuth } from '@/store/auth';

export { HomePage } from './home';

/* ---------------------------------- static pages ---------------------------------- */
export function AboutPage() {
  useSeo('About us', 'Learn about LifeDrop, a transparent platform that connects volunteer blood donors with verified requirements.');
  return (
    <>
      <PageHero title="About LifeDrop" subtitle="We make it easier for volunteers and hospitals to find each other — and for donors to be thanked." />
      <div className="container grid max-w-5xl gap-6 py-12 md:grid-cols-3">
        {[
          [<HeartHandshake key="1" />, 'Our mission', 'Reduce the time between a hospital’s request and a willing donor’s response, with a platform that is transparent and respectful of privacy.'],
          [<ShieldCheck key="2" />, 'Safety first', 'We never decide who can donate or whose blood is compatible. We publish verified requirements and always defer to qualified medical staff.'],
          [<Trophy key="3" />, 'Recognition', 'Donors earn 100 points for each verified donation certificate and can appear on a leaderboard — or stay anonymous.'],
        ].map(([i, t, d]) => (
          <Card key={t as string} className="p-6"><div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-lg bg-accent text-primary [&>svg]:h-5 [&>svg]:w-5">{i as React.ReactNode}</div><h2 className="font-semibold">{t as string}</h2><p className="mt-2 text-sm text-muted-foreground">{d as string}</p></Card>
        ))}
      </div>
      <div className="container max-w-5xl pb-16">
        <div className="card overflow-hidden p-7 sm:p-10">
          <p className="font-display text-lg italic text-primary">வணக்கம் கோவை</p>
          <h2 className="h-section mt-1">Why Coimbatore, <span className="accent-italic">why first.</span></h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">We are focusing our launch on Coimbatore so we can do it properly: a close-knit city, a strong network of hospitals and blood banks, and a community that already believes in helping its own. Starting local lets us work hand in hand with medical teams, keep requirements accurate, and grow only as fast as we can stay reliable.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[['For donors', 'Register with your Coimbatore address and see requirements near you first.'], ['For hospitals', 'Partner with us to publish verified requirements and reach opted-in donors.'], ['For the city', 'Every donor who joins early makes the next emergency a little easier to answer.']].map(([t, d]) => <div key={t} className="rounded-2xl bg-accent/50 p-5"><h3 className="font-display text-xl font-medium">{t}</h3><p className="mt-1 text-sm text-ink/70">{d}</p></div>)}
          </div>
          <div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link to="/register">Join from Coimbatore</Link></Button><Button asChild variant="outline"><Link to="/contact">Partner with us</Link></Button></div>
        </div>
      </div>
    </>
  );
}

export function HowItWorksPage() {
  useSeo('How it works', 'From registration to certificate verification and rewards — see how LifeDrop works.');
  return (
    <>
      <PageHero title="How LifeDrop works" subtitle="A clear, four-step journey for donors." />
      <div className="container max-w-3xl py-12">
        <ol className="space-y-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-xl border bg-white p-5 shadow-card">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-white">{i + 1}</span>
              <div><h2 className="font-semibold">{s.title}</h2><p className="mt-1 text-sm text-muted-foreground">{s.text}</p></div>
            </li>
          ))}
        </ol>
        <Card className="mt-8 border-amber-200 bg-warning-soft p-5 text-sm"><strong>Important:</strong> LifeDrop does not provide medical advice. Whether you can donate, and whether your blood suits a patient, is decided only by the hospital or blood bank. The three-month follow-up email is a reminder to ask them — not an eligibility decision.</Card>
        <div className="mt-8 text-center"><Button asChild size="lg"><Link to="/register">Get started</Link></Button></div>
      </div>
    </>
  );
}

export function FaqPage() {
  useSeo('FAQ', 'Answers to common questions about registering, certificates, points, privacy and eligibility on LifeDrop.');
  return (
    <>
      <PageHero title="Frequently asked questions" />
      <div className="container max-w-3xl py-12"><FaqList /></div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) }} />
    </>
  );
}

const Legal = ({ title, sections }: { title: string; sections: [string, string][] }) => (
  <>
    <PageHero title={title} subtitle="Last updated: please review regularly." />
    <div className="container max-w-3xl space-y-6 py-12">
      {sections.map(([h, t], i) => <section key={h}><h2 className="text-lg font-bold">{i + 1}. {h}</h2><p className="mt-1 leading-relaxed text-muted-foreground">{t}</p></section>)}
    </div>
  </>
);
export const PrivacyPage = () => { useSeo('Privacy policy', 'How LifeDrop collects, uses and protects your personal data.'); return <Legal title="Privacy policy" sections={PRIVACY_SECTIONS} />; };
export const TermsPage = () => { useSeo('Terms & conditions', 'Terms of use for the LifeDrop blood donation platform.'); return <Legal title="Terms & conditions" sections={TERMS_SECTIONS} />; };

/* --------------------------------- requirements --------------------------------- */
export function RequirementsPage() {
  useSeo('Blood requirements', 'Browse active, verified blood requirements from hospitals and blood banks.');
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState(BLOOD_GROUPS.includes(params.get('group') as any) ? (params.get('group') as string) : '');
  const [q, setQ] = useState(params.get('city') ?? '');
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(
    () => api.get('/requirements', { params: { page, limit: 9, ...(group && { bloodGroup: group }), ...(dq && { search: dq }) } }).then((r) => ({ items: r.data.data as Requirement[], meta: r.data.meta })),
    [page, group, dq],
  );
  return (
    <>
      <PageHero title="Blood requirements" subtitle="Verified requests from hospitals and blood banks. Contact the hospital directly — medical staff decide eligibility and compatibility." />
      <div className="container py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search hospital or city" />
          <Select aria-label="Filter by blood group" className="sm:w-48" value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}>
            <option value="">All blood groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </Select>
        </div>
        {loading && !data ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
          : error ? <ErrorState message={error} onRetry={reload} />
          : !data?.items.length ? <Card><EmptyState title="No requirements found" description="Try another blood group or check back soon." /></Card>
          : (<>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.items.map((r) => <RequirementCard key={r._id} r={r} loggedIn={!!user} />)}</div>
              <Card className="mt-6"><Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} /></Card>
            </>)}
      </div>
    </>
  );
}

/* ---------------------------------- leaderboard ---------------------------------- */
export function LeaderboardPage() {
  useSeo('Leaderboard', 'Top blood donors on LifeDrop ranked by verified donation points.');
  const [period, setPeriod] = useState<'' | 'monthly' | 'yearly'>('');
  const [group, setGroup] = useState('');
  const [city, setCity] = useState('');
  const dCity = useDebounced(city);
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/leaderboard${period ? `/${period}` : ''}`, { params: { page, limit: 10, ...(group && { bloodGroup: group }), ...(dCity && { city: dCity }) } }).then((r) => ({ ...r.data.data, meta: r.data.meta })),
    [period, group, dCity, page],
  );
  const tabs: [typeof period, string][] = [['', 'All time'], ['yearly', 'This year'], ['monthly', 'This month']];
  return (
    <>
      <PageHero title="Donor leaderboard" subtitle="Donors earn 100 points for every verified donation certificate." />
      <div className="container py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Period" className="inline-flex rounded-lg border bg-white p-1">
            {tabs.map(([v, l]) => <button key={l} role="tab" aria-selected={period === v} onClick={() => { setPeriod(v); setPage(1); }} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${period === v ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>)}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select aria-label="Blood group" value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }} className="sm:w-40"><option value="">All groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
            <Input aria-label="City" placeholder="City" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} className="sm:w-40" />
          </div>
        </div>
        {loading && !data ? <Skeleton className="h-96" /> : error ? <ErrorState message={error} onRetry={reload} /> : (
          <>
            {page === 1 && data?.top3?.length > 0 && <div className="mb-8"><Podium entries={data.top3} /></div>}
            <Card className="overflow-hidden">
              <LeaderboardList entries={data?.entries ?? []} />
              {data?.meta?.total > 0 && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

/* -------------------------------------- contact -------------------------------------- */
const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email: z.string().trim().email('Enter a valid email'),
  subject: z.string().trim().min(3, 'Enter a subject'),
  message: z.string().trim().min(10, 'Tell us a little more (10+ characters)').max(2000),
});

export function ContactPage() {
  useSeo('Contact us', 'Get in touch with the LifeDrop team.');
  const info = useFetch(() => get('/public/stats'), []);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(contactSchema) });
  const c = info.data?.contact;
  return (
    <>
      <PageHero title="Contact us" subtitle="Questions, feedback or need help? We'd love to hear from you." />
      <div className="container grid max-w-5xl gap-8 py-12 md:grid-cols-5">
        <Card className="p-6 md:col-span-3">
          {done ? <EmptyState title="Message sent" description="Thank you — our team will get back to you soon." action={<Button variant="outline" onClick={() => setDone(false)}>Send another</Button>} /> : (
            <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { try { await post('/public/contact', v); setDone(true); reset(); } catch (e) { toast.error(errorMessage(e)); } })}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="c-name" error={errors.name?.message}><Input id="c-name" autoComplete="name" {...register('name')} /></Field>
                <Field label="Email" htmlFor="c-email" error={errors.email?.message}><Input id="c-email" type="email" autoComplete="email" {...register('email')} /></Field>
              </div>
              <Field label="Subject" htmlFor="c-subject" error={errors.subject?.message}><Input id="c-subject" {...register('subject')} /></Field>
              <Field label="Message" htmlFor="c-message" error={errors.message?.message}><Textarea id="c-message" rows={5} {...register('message')} /></Field>
              <Button type="submit" loading={isSubmitting}>Send message</Button>
              <p className="text-xs text-muted-foreground">Medical emergency? Contact your nearest hospital or emergency number — not this form.</p>
            </form>
          )}
        </Card>
        <div className="space-y-4 md:col-span-2">
          <Card className="p-5 text-sm"><h2 className="mb-2 font-semibold">Reach us directly</h2>
            {c?.email || c?.phone || c?.address ? <ul className="space-y-1 text-muted-foreground">{c.email && <li>{c.email}</li>}{c.phone && <li>{c.phone}</li>}{c.address && <li>{c.address}</li>}</ul> : <p className="text-muted-foreground">Use the form and we will reply by email.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

export function NotFoundPage() {
  useSeo('Page not found');
  return <div className="container grid min-h-[70vh] place-items-center pt-24 text-center"><div><p className="text-6xl font-extrabold text-primary">404</p><p className="mt-2 text-lg font-semibold">We can't find that page</p><Button asChild className="mt-6"><Link to="/">Back to home</Link></Button></div></div>;
}
