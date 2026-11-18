import { Bell, Building2, CheckCircle2, Clock, Droplet, FileCheck2, Heart, Hospital, Lock, MapPin, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaqList, LbEntry, LeaderboardList, Podium, Requirement, RequirementCard } from '@/components/shared/blocks';
import { EmptyState, ErrorState } from '@/components/ui/data';
import { Bezel, CountUp, FallingDrops, PillLink, Reveal, RotatingWords, ScrollProgress } from '@/components/ui/fx';
import { Skeleton } from '@/components/ui/primitives';
import { api, get } from '@/lib/api';
import { STEPS, TESTIMONIALS } from '@/lib/content';
import { useFetch, useSeo } from '@/lib/hooks';
import { BLOOD_GROUPS, cn, daysLeft, timeAgo } from '@/lib/utils';
import { useAuth } from '@/store/auth';

const Eyebrow = ({ children }: { children: ReactNode }) => <span className="eyebrow">{children}</span>;

/* ------------------------------------------------------------------------------------------------
 * Hero art: a crimson arch window with a floating drop, an orbiting type ring and tilted glass chips
 * ---------------------------------------------------------------------------------------------- */
/** Pointer parallax: writes two CSS variables (rAF-throttled); children only use transforms. */
function useParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(pointer: coarse)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', String((e.clientX / window.innerWidth - 0.5) * 2));
        el.style.setProperty('--py', String((e.clientY / window.innerHeight - 0.5) * 2));
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}
const depth = (n: number) => ({ transform: `translate3d(calc(var(--px,0) * ${n}px), calc(var(--py,0) * ${n}px), 0)`, transition: 'transform .9s cubic-bezier(.32,.72,0,1)' });

function HeroArt() {
  const ref = useParallax();
  return (
    <div ref={ref} className="relative mx-auto w-[min(82vw,400px)] lg:mx-0 lg:ml-auto" aria-hidden>
      <div style={depth(-8)} className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] rounded-b-[2.5rem] bg-gradient-to-b from-[#E0344F] via-primary to-[#5E0A1B] shadow-float ring-[10px] ring-white/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,.35),transparent_55%)]" />
        <div className="absolute inset-x-0 top-[20%] flex justify-center animate-float">
          <svg viewBox="0 0 120 140" className="w-[54%] drop-shadow-[0_30px_30px_rgba(60,0,10,.45)]">
            <defs><linearGradient id="dg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#FFD9DE" /></linearGradient></defs>
            <path d="M60 6C40 38 14 62 14 92a46 46 0 0 0 92 0C106 62 80 38 60 6z" fill="url(#dg)" />
            <path d="M36 92a26 26 0 0 0 16 24" stroke="#B91C35" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <svg viewBox="0 0 300 60" className="absolute inset-x-0 bottom-[9%] w-full" preserveAspectRatio="none">
          <polyline points="0,32 70,32 92,32 106,10 124,52 140,32 190,32 214,32 228,18 244,40 262,32 300,32" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="300" className="animate-ecg" />
        </svg>
        <p className="absolute inset-x-0 bottom-[3.5%] text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">Give · Live · Repeat</p>
      </div>

      {/* orbiting ring */}
      <div style={depth(22)} className="absolute -left-10 top-[12%] h-28 w-28 sm:-left-14 sm:h-36 sm:w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full animate-spin-slow">
          <defs><path id="orb" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" /></defs>
          <text fontSize="10.5" fontWeight="700" letterSpacing="3.2" fill="#1F0F11"><textPath href="#orb">DONATE BLOOD • SAVE LIVES • BE THE REASON •</textPath></text>
        </svg>
        <span className="absolute inset-[30%] grid place-items-center rounded-full bg-white shadow-card"><Heart className="beat h-5 w-5 fill-primary text-primary" /></span>
      </div>

      {/* tilted glass chips (tilt only from md up so touch targets never overlap) */}
      <div style={depth(30)} className="absolute -right-3 top-[40%] flex items-center gap-2.5 rounded-2xl bg-white/90 p-2.5 pr-4 text-xs font-semibold shadow-card ring-1 ring-black/5 backdrop-blur md:rotate-[4deg] sm:-right-10 animate-float [animation-delay:.8s]">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-success-soft text-success"><CheckCircle2 className="h-[18px] w-[18px]" /></span>
        <span>Certificate verified<span className="block text-[10px] font-medium text-muted-foreground">+100 points</span></span>
      </div>
      <div style={depth(16)} className="absolute -left-2 bottom-[12%] flex items-center gap-2.5 rounded-2xl bg-white/90 p-2.5 pr-4 text-xs font-semibold shadow-card ring-1 ring-black/5 backdrop-blur md:-rotate-[3deg] sm:-left-12 animate-float [animation-delay:1.6s]">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary"><Bell className="h-[18px] w-[18px]" /></span>
        <span>New requirement<span className="block text-[10px] font-medium text-muted-foreground">O+ · near you</span></span>
      </div>
    </div>
  );
}

const FEATURES = {
  alerts: { icon: <Bell />, title: 'Alerts that respect you', text: 'When a verified requirement is published for your blood group you hear about it by email and in-app — and only then. Pause or unsubscribe in one tap.' },
  verified: { icon: <ShieldCheck />, title: 'Verified requests', text: 'Hospital, address, units and a named contact on every one.' },
  upload: { icon: <FileCheck2 />, title: 'One-minute upload', text: 'Add your certificate; a reviewer confirms it and you are told either way.' },
  points: { icon: <Trophy />, title: '100 points, exactly', text: 'Credited only after approval — never on upload, never twice.' },
  vault: { icon: <Lock />, title: 'A private vault', text: 'Certificates open only through short-lived secure links.' },
  gentle: { icon: <Clock />, title: 'Gentle follow-ups', text: 'Around three months on, a nudge to ask medical staff about eligibility.' },
};

const KOVAI_AREAS = ['RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony', 'Race Course', 'Singanallur', 'Ukkadam', 'Vadavalli', 'Saravanampatti', 'Podanur', 'Ganapathy', 'Thudiyalur'];

const MYTHS: [string, string][] = [
  ['“It takes hours.”', 'The collection itself usually takes about 10 minutes; the whole visit, with a check-up and a rest, is typically under an hour.'],
  ['“My blood group isn’t needed.”', 'Hospitals need every group. Rare groups are precious and common ones are used in large quantities.'],
  ['“I’ll feel weak for days.”', 'Most people feel fine after a rest, a drink and a snack. Follow the blood bank’s guidance.'],
  ['“I can’t tell if I’m allowed.”', 'You don’t have to guess — trained staff check each time. LifeDrop never decides this for you.'],
];

const GUIDE: { id: string; label: string; line: string; tips: string[] }[] = [
  { id: 'before', label: 'Before', line: 'Show up ready.', tips: ['Carry a valid photo ID', 'Eat a proper meal and drink water', 'Sleep well the night before', 'Mention any medication or recent illness'] },
  { id: 'during', label: 'During', line: 'Ten calm minutes.', tips: ['A quick health screening comes first', 'Collection itself takes about 10 minutes', 'Staff decide whether you can donate today', 'Ask for your donation certificate'] },
  { id: 'after', label: 'After', line: 'Rest, then tell us.', tips: ['Rest, have a snack and hydrate', 'Skip heavy exercise for the day', 'Upload your certificate on LifeDrop', 'We nudge you in ~3 months to check eligibility'] },
];

/** Interactive donation-day journey: a blood bag fills up stage by stage (auto-advances until touched). */
function DonationJourney() {
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (manual || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % GUIDE.length), 5500);
    return () => clearInterval(t);
  }, [manual]);
  const fill = [0.34, 0.68, 1][i];
  const stage = GUIDE[i];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
      {/* blood bag */}
      <div className="mx-auto w-full max-w-[17rem]">
        <div className="relative mx-auto h-8 w-1.5 rounded-full bg-black/15" aria-hidden />
        <div className="relative aspect-[3/4] overflow-hidden rounded-t-[2.2rem] rounded-b-[3.2rem] bg-white shadow-card ring-1 ring-black/10" role="img" aria-label={`Donation journey: ${stage.label}`}>
          <div className="absolute inset-0 origin-bottom bg-gradient-to-b from-[#E0344F] to-[#6E0C20] transition-transform duration-[1400ms] ease-fluid" style={{ transform: `scaleY(${fill})` }}>
            <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="absolute -top-[17px] left-0 h-5 w-[200%] animate-marquee fill-[#E0344F] [animation-duration:7s]">
              <path d="M0 20V10q25-14 50 0t50 0 50 0 50 0V20z" />
            </svg>
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,.28)_45%,transparent_60%)]" />
          <div className="absolute inset-x-0 top-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-ink/50">Stage</p>
            <p className="font-display text-6xl font-light italic text-ink mix-blend-multiply">{String(i + 1).padStart(2, '0')}</p>
          </div>
          <p className="absolute inset-x-0 bottom-7 text-center font-display text-2xl italic text-white">{stage.line}</p>
        </div>
      </div>

      {/* stages */}
      <div>
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Donation day stages">
          {GUIDE.map((g, k) => (
            <button key={g.id} role="tab" aria-selected={k === i} onClick={() => { setI(k); setManual(true); }}
              className={cn('rounded-full px-5 py-2.5 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-500 ease-fluid active:scale-95', k === i ? 'bg-ink text-white ring-ink' : 'bg-white text-ink/70 ring-black/10 hover:bg-white/60')}>
              <span className="mr-2 font-display italic opacity-60">{String(k + 1).padStart(2, '0')}</span>{g.label}
            </button>
          ))}
        </div>
        <div key={stage.id} className="animate-fade-up">
          <h3 className="font-display text-4xl font-medium sm:text-5xl">{stage.line}</h3>
          <ul className="mt-6 divide-y divide-black/10">
            {stage.tips.map((t, k) => (
              <li key={t} className="flex items-center gap-4 py-4 text-ink/80" style={{ animation: 'fade-up .7s cubic-bezier(.32,.72,0,1) both', animationDelay: `${k * 90}ms` }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-display text-sm italic text-primary">{k + 1}</span>{t}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted-foreground">General guidance only — always follow your blood bank or hospital’s instructions.</p>
        </div>
      </div>
    </div>
  );
}


/** Auto-refreshing strip of the newest open requirements (polls every 20s). */
function LiveNow({ loggedIn }: { loggedIn: boolean }) {
  const [rows, setRows] = useState<Requirement[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => get<Requirement[]>('/requirements', { limit: 6 }).then((d) => { if (alive) { setRows(d); setUpdated(new Date()); } }).catch(() => undefined);
    void load();
    const t = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return (
    <section className="section pb-4 pt-12 md:pt-16">
      <div className="container">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/70">
            <span className="live-dot relative h-2.5 w-2.5 rounded-full bg-success" /> Live now
            {updated && <span className="hidden font-medium normal-case tracking-normal text-muted-foreground sm:inline">· updated {timeAgo(updated)}</span>}
          </p>
          <Link to="/requirements" className="text-sm font-semibold text-primary">See all →</Link>
        </div>
        {!rows ? <Skeleton className="h-28 rounded-2xl" /> : rows.length === 0 ? (
          <div className="card flex items-center gap-4 p-5 text-sm text-ink/70"><Heart className="beat h-6 w-6 shrink-0 fill-primary text-primary" /> All clear right now — no open requirements. Register to be the first to know when one appears.</div>
        ) : (
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            {rows.map((r) => (
              <Link key={r._id} to="/requirements" className="lift group w-[78%] shrink-0 snap-start sm:w-72">
                <Bezel className="h-full" coreClassName="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 min-w-10 place-items-center rounded-[0_50%_50%_50%] bg-primary px-1 text-sm font-bold text-white [transform:rotate(-45deg)]"><span className="[transform:rotate(45deg)]">{r.bloodGroup === 'ALL' ? 'All' : r.bloodGroup}</span></span>
                    <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', r.urgency === 'CRITICAL' ? 'bg-destructive-soft text-destructive' : r.urgency === 'HIGH' ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>{r.urgency}</span>
                  </div>
                  <p className="font-display text-lg font-medium leading-snug">{r.hospitalName}</p>
                  <p className="text-xs text-muted-foreground">{r.city} · {r.unitsRequired} unit{r.unitsRequired > 1 ? 's' : ''} · {Math.max(0, daysLeft(r.lastDateToRespond))}d left</p>
                </Bezel>
              </Link>
            ))}
          </div>
        )}
        {!loggedIn && <p className="mt-1 text-xs text-muted-foreground">Sign in to see contact details. Hospitals decide eligibility and compatibility.</p>}
      </div>
    </section>
  );
}

export function HomePage() {
  useSeo('LifeDrop – Donate blood, save lives', 'Register as a blood donor, respond to verified blood requirements, upload donation certificates and earn recognition on the LifeDrop leaderboard.');
  const { user } = useAuth();
  const stats = useFetch(() => get('/public/stats'), []);
  const reqs = useFetch(() => get<Requirement[]>('/requirements', { limit: 3 }), []);
  const top = useFetch(() => api.get('/leaderboard', { params: { limit: 5 } }).then((r) => r.data.data as { entries: LbEntry[]; top3: LbEntry[] }), []);
  const s = stats.data;
  const cta = user ? { to: '/dashboard', label: 'Open dashboard' } : { to: '/register', label: 'Become a donor' };

  return (
    <>
      <ScrollProgress />
      {/* ================================ HERO ================================ */}
      <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36 lg:pb-28">
        <FallingDrops />
        <div className="pointer-events-none absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(185,28,53,.16),transparent_65%)]" aria-hidden />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(246,170,160,.35),transparent_65%)]" aria-hidden />
        <div className="container relative grid items-center gap-14 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <Reveal><Eyebrow>Now starting in Coimbatore</Eyebrow></Reveal>
            <Reveal delay={80}><h1 className="h-display">Give blood. Give hope. Give someone <span className="accent-italic scribble"><RotatingWords words={['tomorrow.', 'a second chance.', 'a reason to smile.', 'another birthday.']} /></span></h1></Reveal>
            <Reveal delay={160}><p className="mt-6 max-w-xl text-base leading-relaxed text-ink/70 sm:text-lg">LifeDrop connects volunteer donors with verified requirements from hospitals and blood banks — and quietly celebrates everyone who shows up.</p></Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PillLink to={cta.to} size="lg">{cta.label}</PillLink>
                <PillLink to="/requirements" size="lg" tone="light">Who needs blood now</PillLink>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/60">
                {['Free to join', 'Private certificates', 'Verified requests'].map((t) => <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{t}</li>)}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={200}><HeroArt /></Reveal>
        </div>
      </section>

      {/* ================================ DRIP EDGE ================================ */}
      <div className="relative -mb-px text-ink" aria-hidden>
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="block h-12 w-full fill-current sm:h-20">
          <path d="M0 90V0h1440v90h-40c-8 0-10-34-20-34s-12 34-22 34H1190c-8 0-10-52-20-52s-12 52-22 52H900c-8 0-10-24-20-24s-12 24-22 24H640c-8 0-10-60-20-60s-12 60-22 60H380c-8 0-10-30-20-30s-12 30-22 30H120c-8 0-10-44-20-44s-12 44-22 44z" transform="scale(1 -1) translate(0 -90)" />
        </svg>
        {[18, 44, 71].map((l, i) => <span key={l} className="absolute top-6 h-3 w-3 animate-drip rounded-[0_50%_50%_50%] bg-primary [transform:rotate(-45deg)] sm:top-12" style={{ left: `${l}%`, animationDelay: `${i * 1.05}s` }} />)}
      </div>

      {/* ================================ TICKER ================================ */}
      <div className="overflow-hidden bg-ink pb-6 pt-2 text-cream" aria-hidden>
        <div className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap font-display text-3xl italic sm:text-5xl">
          {Array.from({ length: 2 }).flatMap((_, k) => ['Donate blood', 'Save lives', 'Be the reason', 'Verified requests', '100 points', 'Join the circle'].map((t, i) => (
            <span key={`${k}${t}`} className="flex items-center gap-10">{i % 2 ? <span className="outline-text text-cream" style={{ WebkitTextStroke: '1px rgba(250,245,239,.6)' }}>{t}</span> : t}<Droplet className="h-5 w-5 fill-primary text-primary" /></span>
          )))}
        </div>
      </div>

      <LiveNow loggedIn={!!user} />

      {/* ================================ NUMBERS ================================ */}
      <section className="section">
        <div className="container">
          <div className="grid grid-cols-2 gap-y-12 md:grid-cols-4 md:divide-x md:divide-black/10">
            {([['Registered donors', s?.donors], ['Verified donations', s?.donations], ['Points awarded', s?.points], ['Open requirements', s?.activeRequirements]] as [string, number][]).map(([label, v], i) => (
              <Reveal key={label} delay={i * 90} className="px-2 text-center md:px-8">
                {stats.loading ? <Skeleton className="mx-auto h-14 w-24" /> : <p className="font-display text-6xl font-light tabular-nums text-ink md:text-7xl"><CountUp value={v ?? 0} /></p>}
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
              </Reveal>
            ))}
          </div>
          <Reveal><p className="mx-auto mt-14 max-w-xl text-center font-display text-xl italic text-ink/70 md:text-2xl">“One donation can help save up to three lives.”</p></Reveal>
        </div>
      </section>

      {/* ================================ COIMBATORE ================================ */}
      <section className="pb-16 md:pb-28">
        <div className="container">
          <Reveal>
            <Bezel className="rounded-[2.5rem]" coreClassName="relative overflow-hidden rounded-[calc(2.5rem-0.375rem)] p-7 sm:p-12 lg:p-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(185,28,53,.14),transparent_65%)]" aria-hidden />
              <div className="relative grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-16">
                <div>
                  <span className="eyebrow"><MapPin className="h-3 w-3" /> Our first city</span>
                  <p className="font-display text-xl italic text-primary sm:text-2xl">வணக்கம் கோவை · Vanakkam, Kovai</p>
                  <h2 className="h-section mt-2">We’re starting in <span className="accent-italic scribble">Coimbatore.</span></h2>
                  <p className="mt-5 max-w-xl leading-relaxed text-ink/70">Coimbatore is a city that shows up for its own. LifeDrop is beginning here — connecting voluntary donors with verified requirements from the city’s hospitals and blood banks, so the right call reaches the right neighbour quickly.</p>
                  <ul className="mt-6 space-y-3 text-sm text-ink/75">
                    {['Donors in Coimbatore are matched to requirements in their own city first', 'Hospitals and blood banks are being onboarded — partner with us to be among the first', 'Early donors help shape how LifeDrop grows across Tamil Nadu'].map((t) => <li key={t} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />{t}</li>)}
                  </ul>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <PillLink to="/requirements?city=Coimbatore" size="lg">Coimbatore requirements</PillLink>
                    <PillLink to="/contact" tone="light" size="lg">Partner as a hospital</PillLink>
                  </div>
                </div>
                <div>
                  <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Neighbourhoods we’re building for</p>
                  <div className="flex flex-wrap gap-2.5">
                    {KOVAI_AREAS.map((a, i) => (
                      <span key={a} style={{ transitionDelay: `${i * 20}ms` }} className={cn('rounded-full bg-white px-4 py-2 text-sm font-medium shadow-card ring-1 ring-black/5 transition-[transform,background-color,color] duration-500 ease-fluid hover:-translate-y-1 hover:bg-primary hover:text-white', i % 3 === 0 && 'md:-rotate-2', i % 3 === 1 && 'md:rotate-1')}>{a}</span>
                    ))}
                  </div>
                  <p className="mt-6 rounded-2xl bg-accent/60 p-4 text-sm text-ink/70">Not in Coimbatore? You can still register — we’ll let you know as soon as LifeDrop reaches your city.</p>
                </div>
              </div>
            </Bezel>
          </Reveal>
        </div>
      </section>

      {/* ================================ WHY (bento) ================================ */}
      <section className="pb-16 md:pb-28">
        <div className="container">
          <Reveal className="mb-10 max-w-2xl md:mb-14"><Eyebrow>Why LifeDrop</Eyebrow><h2 className="h-section">Built with care for donors, <span className="accent-italic">trusted by hospitals.</span></h2></Reveal>
          <div className="grid gap-4 md:grid-cols-12 md:gap-5">
            <Reveal className="md:col-span-7 md:row-span-2">
              <Bezel className="h-full" coreClassName="relative overflow-hidden bg-gradient-to-br from-primary to-[#5E0A1B] p-7 text-white sm:p-10">
                <Droplet className="absolute -bottom-10 -right-8 h-64 w-64 -rotate-12 fill-white/10 stroke-none" aria-hidden />
                <div className="relative flex h-full min-h-[22rem] flex-col justify-between">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 [&>svg]:h-6 [&>svg]:w-6">{FEATURES.alerts.icon}</span>
                  <div><h3 className="font-display text-3xl font-medium sm:text-4xl">{FEATURES.alerts.title}</h3><p className="mt-3 max-w-md text-white/80">{FEATURES.alerts.text}</p></div>
                </div>
              </Bezel>
            </Reveal>
            {[FEATURES.verified, FEATURES.points].map((f, i) => (
              <Reveal key={f.title} delay={100 + i * 100} className="md:col-span-5">
                <Bezel className="h-full" coreClassName="p-6 sm:p-7"><span className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-accent text-primary [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span><h3 className="font-display text-2xl font-medium">{f.title}</h3><p className="mt-2 text-sm leading-relaxed text-ink/65">{f.text}</p></Bezel>
              </Reveal>
            ))}
            {[FEATURES.upload, FEATURES.vault, FEATURES.gentle].map((f, i) => (
              <Reveal key={f.title} delay={i * 100} className="md:col-span-4">
                <Bezel className="h-full" coreClassName="p-6 sm:p-7"><span className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-accent text-primary [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span><h3 className="font-display text-2xl font-medium">{f.title}</h3><p className="mt-2 text-sm leading-relaxed text-ink/65">{f.text}</p></Bezel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================ REQUIREMENTS ================================ */}
      <section className="section bg-white/60">
        <div className="container">
          <Reveal className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between md:mb-14">
            <div className="max-w-xl"><Eyebrow>Right now</Eyebrow><h2 className="h-section">Someone is <span className="accent-italic">waiting</span> for a match.</h2></div>
            <PillLink to="/requirements" tone="light">All requirements</PillLink>
          </Reveal>
          {reqs.loading ? <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
            : reqs.error ? <ErrorState message={reqs.error} onRetry={reqs.reload} />
            : !reqs.data?.length ? <Reveal><div className="card"><EmptyState title="No open requirements right now" description="That's good news. Register to be told the moment one is published." action={<PillLink to="/register">Get notified</PillLink>} /></div></Reveal>
            : <div className="grid gap-5 md:grid-cols-3">{reqs.data.map((r, i) => <Reveal key={r._id} delay={i * 100}><RequirementCard r={r} loggedIn={!!user} /></Reveal>)}</div>}
        </div>
      </section>

      {/* ================================ BLOOD GROUPS ================================ */}
      <section className="section">
        <div className="container text-center">
          <Reveal className="mx-auto mb-12 max-w-2xl"><Eyebrow>Find your match</Eyebrow><h2 className="h-section">Which group are <span className="accent-italic">you?</span></h2><p className="mt-4 text-ink/65">Tap a group to browse current requests. Hospitals always make the final call on compatibility.</p></Reveal>
          <div className="mx-auto grid max-w-3xl grid-cols-4 gap-x-3 gap-y-9 pt-4 sm:gap-x-8 sm:gap-y-14">
            {BLOOD_GROUPS.map((g, i) => (
              <Reveal key={g} delay={i * 60} className={cn(i % 2 ? 'translate-y-4 sm:translate-y-8' : '')}>
                <Link to={`/requirements?group=${encodeURIComponent(g)}`} aria-label={`Requirements for ${g}`} className="group mx-auto block w-[88%]">
                  <span className="grid aspect-square -rotate-45 place-items-center rounded-[0_50%_50%_50%] bg-white text-primary shadow-card ring-1 ring-black/5 transition-[transform,background-color,color,box-shadow] duration-700 ease-fluid group-hover:-translate-y-3 group-hover:bg-primary group-hover:text-white group-hover:shadow-float group-hover:animate-wobble">
                    <span className="rotate-45 font-display text-2xl font-medium sm:text-4xl">{g}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================ HOW IT WORKS (editorial split) ================================ */}
      <section className="section bg-white/60">
        <div className="container grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
          <Reveal className="lg:sticky lg:top-32 lg:self-start">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="h-section">Four quiet steps from <span className="accent-italic">hello</span> to <span className="accent-italic">thank you.</span></h2>
            <div className="mt-8"><PillLink to="/how-it-works" tone="dark">Read the full story</PillLink></div>
          </Reveal>
          <ol>
            {STEPS.map((st, i) => (
              <Reveal key={st.title} delay={60}>
                <li className="grid grid-cols-[auto_1fr] gap-6 border-t border-black/10 py-8 first:border-t-0 first:pt-0 sm:gap-10">
                  <span className="font-display text-6xl font-light italic leading-none text-primary/80 sm:text-8xl">{String(i + 1).padStart(2, '0')}</span>
                  <div><h3 className="font-display text-2xl font-medium sm:text-3xl">{st.title}</h3><p className="mt-2 text-ink/65">{st.text}</p></div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ================================ POINTS ================================ */}
      <section className="section">
        <div className="container">
          <Reveal>
            <Bezel dark className="rounded-[2.5rem]" coreClassName="relative overflow-hidden rounded-[calc(2.5rem-0.375rem)] p-7 sm:p-12 lg:p-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(224,52,79,.45),transparent_65%)]" aria-hidden />
              <div className="relative grid items-center gap-10 lg:grid-cols-2">
                <div className="text-white">
                  <span className="eyebrow !bg-white/10 !text-white/80 !ring-white/15">Recognition</span>
                  <p className="font-display text-[7rem] font-light italic leading-[.9] text-primary sm:text-[10rem]" style={{ color: '#F0536C' }}>100</p>
                  <h2 className="mt-2 font-display text-3xl font-medium sm:text-4xl">points for every verified donation.</h2>
                  <p className="mt-4 max-w-md text-white/65">Awarded only after a reviewer verifies your certificate — never on upload, and never twice for the same donation.</p>
                  <div className="mt-8"><PillLink to="/leaderboard" tone="glass">See the leaderboard</PillLink></div>
                </div>
                <ol className="space-y-3 text-white">
                  {([[<FileCheck2 key="1" />, 'Certificate uploaded', 'Pending'], [<ShieldCheck key="2" />, 'Reviewer verifies it', 'Approved'], [<Sparkles key="3" />, 'Points credited', '+100']] as [ReactNode, string, string][]).map(([ic, t, b], k) => (
                    <li key={t} className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10" style={{ marginLeft: `${k * 1.25}rem` }}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 [&>svg]:h-5 [&>svg]:w-5">{ic}</span>
                      <span className="flex-1 font-medium">{t}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{b}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Bezel>
          </Reveal>
        </div>
      </section>

      {/* ================================ DONATION DAY (interactive journey) ================================ */}
      <section className="pb-16 md:pb-28">
        <div className="container">
          <Reveal className="mb-12 max-w-2xl md:mb-16"><Eyebrow>Donation day</Eyebrow><h2 className="h-section">Watch the day <span className="accent-italic scribble">fill up.</span></h2></Reveal>
          <Reveal><DonationJourney /></Reveal>
        </div>
      </section>

      {/* ================================ MYTHS ================================ */}
      <section className="section bg-white/60">
        <div className="container grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
          <Reveal><Eyebrow>Myths &amp; facts</Eyebrow><h2 className="h-section">Honest answers to <span className="accent-italic">old worries.</span></h2></Reveal>
          <div className="divide-y divide-black/10">
            {MYTHS.map(([m, f], i) => (
              <Reveal key={m} delay={i * 70}><div className="py-7 first:pt-0"><p className="font-display text-2xl italic text-primary sm:text-3xl">{m}</p><p className="mt-3 max-w-xl text-ink/65">{f}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================ LEADERBOARD ================================ */}
      <section className="section">
        <div className="container">
          <Reveal className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between md:mb-14">
            <div className="max-w-xl"><Eyebrow>The circle</Eyebrow><h2 className="h-section">People who <span className="accent-italic">showed up.</span></h2></div>
            <PillLink to="/leaderboard" tone="light">Full leaderboard</PillLink>
          </Reveal>
          {top.loading ? <Skeleton className="h-64 rounded-2xl" /> : top.data && top.data.entries.length ? (<Reveal><Podium entries={top.data.top3} /><div className="card mt-6 overflow-hidden"><LeaderboardList entries={top.data.entries} /></div></Reveal>)
            : <Reveal><div className="card"><EmptyState title="The circle is waiting for its first donor" action={<PillLink to="/register">Be the first</PillLink>} /></div></Reveal>}
        </div>
      </section>

      {/* ================================ HOSPITALS ================================ */}
      <section className="pb-16 md:pb-28">
        <div className="container">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.5rem] bg-ink p-7 text-white sm:p-12 lg:p-16">
              <div className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(224,52,79,.4),transparent_65%)]" aria-hidden />
              <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_.8fr]">
                <div>
                  <span className="eyebrow !bg-white/10 !text-white/80 !ring-white/15"><Hospital className="h-3 w-3" /> Hospitals &amp; blood banks</span>
                  <h2 className="font-display text-4xl font-medium leading-tight sm:text-5xl">Need donors? <span className="italic text-[#F0536C]">Let us reach them.</span></h2>
                  <p className="mt-4 max-w-lg text-white/65">Share your requirement. Once verified and published, matching opted-in donors get your address, contact and deadline — and you see delivery status for every recipient.</p>
                  <div className="mt-8"><PillLink to="/contact" tone="glass" size="lg">Talk to our team</PillLink></div>
                </div>
                <div className="space-y-3">
                  {([[<Building2 key="1" />, 'Verified before publishing'], [<MapPin key="2" />, 'Reach donors in your city'], [<Bell key="3" />, 'Per-donor delivery tracking']] as [ReactNode, string][]).map(([i, t]) => (
                    <div key={t} className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 [&_svg]:h-5 [&_svg]:w-5"><span className="grid h-11 w-11 place-items-center rounded-full bg-white/10">{i}</span><span className="font-medium">{t}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================================ TESTIMONIALS (z-axis cascade) ================================ */}
      <section className="section bg-white/60">
        <div className="container">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center"><Eyebrow>Voices</Eyebrow><h2 className="h-section">Kind words from the <span className="accent-italic">community.</span></h2></Reveal>
          <div className="grid gap-5 md:grid-cols-3 md:gap-0">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 120} className={cn(i === 0 && 'md:-rotate-2 md:translate-y-6', i === 1 && 'md:z-10 md:scale-105', i === 2 && 'md:rotate-2 md:translate-y-6')}>
                <Bezel className="h-full" coreClassName="flex h-full flex-col p-7">
                  <span className="font-display text-7xl leading-none text-primary/30" aria-hidden>“</span>
                  <p className="flex-1 font-display text-xl leading-snug">{t.text}</p>
                  <div className="mt-6 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-primary font-display text-lg text-white">{t.name[0]}</span><div><p className="text-sm font-bold">{t.name}</p><p className="text-xs text-muted-foreground">{t.role}</p></div></div>
                </Bezel>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center text-xs text-muted-foreground">Illustrative quotes.</p>
        </div>
      </section>

      {/* ================================ FAQ ================================ */}
      <section className="section">
        <div className="container max-w-3xl">
          <Reveal className="mb-10 text-center"><Eyebrow>Questions</Eyebrow><h2 className="h-section">Things people <span className="accent-italic">ask.</span></h2></Reveal>
          <Reveal><FaqList limit={6} /></Reveal>
          <p className="mt-6 text-center text-sm"><Link className="font-semibold text-primary" to="/faq">See every question →</Link></p>
        </div>
      </section>

      {/* ================================ FINAL CTA ================================ */}
      <section className="px-3 pb-16 sm:px-4 md:pb-24">
        <Reveal>
          <div className="container relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-[#A3152E] to-[#5E0A1B] px-6 py-16 text-center text-white sm:py-24">
            <Droplet className="absolute -left-10 -top-10 h-64 w-64 -rotate-12 fill-white/[0.07] stroke-none" aria-hidden />
            <Droplet className="absolute -bottom-16 -right-10 h-80 w-80 rotate-12 fill-white/[0.07] stroke-none" aria-hidden />
            <h2 className="relative mx-auto max-w-3xl font-display text-4xl font-medium leading-[1.05] sm:text-6xl">Be the reason someone gets <span className="italic">a tomorrow.</span></h2>
            <p className="relative mx-auto mt-5 max-w-lg text-white/75">It takes two minutes to join. Be ready when it matters most.</p>
            <div className="relative mt-9 flex justify-center"><PillLink to={cta.to} tone="light" size="lg">{cta.label}</PillLink></div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
