import { ArrowUpRight } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Scroll-driven entrance (IntersectionObserver; no scroll listeners). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: '0px 0px -5% 0px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={ref} style={{ transitionDelay: seen ? `${delay}ms` : '0ms' }} className={cn('reveal', seen && 'in', className)}>{children}</div>;
}

const tones = {
  primary: { btn: 'bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_18px_36px_-14px_rgba(185,28,53,.8)] hover:bg-primary-dark', dot: 'bg-white/20' },
  dark: { btn: 'bg-ink text-white shadow-[0_18px_36px_-16px_rgba(31,15,17,.8)] hover:bg-ink-soft', dot: 'bg-white/15' },
  light: { btn: 'bg-white text-ink ring-1 ring-black/10 shadow-card hover:ring-black/20', dot: 'bg-ink/[0.06]' },
  glass: { btn: 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20', dot: 'bg-white/15' },
} as const;

/** Button-in-button: the trailing arrow lives in its own circle and drifts diagonally on hover. */
export function PillLink({ to, children, tone = 'primary', className, size = 'md' }: { to: string; children: ReactNode; tone?: keyof typeof tones; className?: string; size?: 'md' | 'lg' }) {
  const t = tones[tone];
  return (
    <Link to={to} className={cn('group inline-flex items-center justify-between gap-4 rounded-full pl-6 pr-1.5 font-semibold transition-[transform,background-color,box-shadow] duration-500 ease-fluid active:scale-[0.97]', size === 'lg' ? 'h-14 text-base' : 'h-12 text-sm', t.btn, className)}>
      <span>{children}</span>
      <span className={cn('grid place-items-center rounded-full transition-transform duration-500 ease-fluid group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105', size === 'lg' ? 'h-11 w-11' : 'h-9 w-9', t.dot)}>
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** Nested enclosure: outer tray + inner core with concentric radii. */
export function Bezel({ children, className, coreClassName, dark }: { children: ReactNode; className?: string; coreClassName?: string; dark?: boolean }) {
  return (
    <div className={cn('rounded-[2rem] p-1.5 ring-1', dark ? 'bg-white/5 ring-white/10' : 'bg-black/[0.035] ring-black/[0.05]', className)}>
      <div className={cn('h-full rounded-[calc(2rem-0.375rem)]', dark ? 'bg-ink-soft shadow-[inset_0_1px_0_rgba(255,255,255,.08)]' : 'bg-white shadow-card', coreClassName)}>{children}</div>
    </div>
  );
}

/** Number that counts up the first time it scrolls into view. */
export function CountUp({ value, duration = 1600, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setN(value); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setGo(true); io.disconnect(); } }, { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [value]);
  useEffect(() => {
    if (!go) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, value, duration]);
  return <span ref={ref} className={className}>{n.toLocaleString('en-IN')}</span>;
}

/** Cycles through phrases with a soft fade-up swap. */
export function RotatingWords({ words, every = 2800, className }: { words: string[]; every?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % words.length), every);
    return () => clearInterval(t);
  }, [words.length, every]);
  return <span key={i} className={cn('inline-block animate-fade-up', className)} aria-live="polite">{words[i]}</span>;
}

/** Thin heartbeat-red reading progress bar driven by CSS scroll timelines (no JS scroll listeners). */
export function ScrollProgress() {
  return <div className="scroll-progress" aria-hidden />;
}

/** Soft teardrops drifting down the page background (transform/opacity only). */
export function FallingDrops({ count = 9 }: { count?: number }) {
  const drops = Array.from({ length: count }, (_, i) => ({ left: (i * 97 + 11) % 100, size: 8 + ((i * 5) % 12), dur: 11 + ((i * 3) % 9), delay: -((i * 2.3) % 12) }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {drops.map((d, i) => (
        <span key={i} className="fall absolute top-0 rounded-[0_50%_50%_50%] bg-primary/25" style={{ left: `${d.left}%`, width: d.size, height: d.size, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }} />
      ))}
    </div>
  );
}
