import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const fmtDate = (d?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString('en-GB', opts) : '—';

export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtNumber = (n?: number | null) => (n ?? 0).toLocaleString('en-IN');

export const timeAgo = (d: string | Date) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  const steps: [number, string][] = [[60, 's'], [3600, 'm'], [86400, 'h'], [2592000, 'd'], [31536000, 'mo']];
  let div = 1;
  for (const [limit, unit] of steps) {
    if (s < limit) return `${Math.floor(s / div)}${unit} ago`;
    div = limit;
  }
  return fmtDate(d);
};

export const daysLeft = (d: string | Date) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000);

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Today as YYYY-MM-DD in the browser's timezone (for <input type=date max>). */
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const MAX_UPLOAD_MB = 5;
export const ALLOWED_UPLOAD = ['application/pdf', 'image/jpeg', 'image/png'];

export const statusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  VERIFIED: 'success', APPROVED: 'success', PUBLISHED: 'success', DELIVERED: 'success', SENT: 'info', ACTIVE: 'success',
  PENDING: 'warning', QUEUED: 'warning', RETRYING: 'warning', DRAFT: 'neutral', SCHEDULED: 'info', SKIPPED: 'neutral',
  REJECTED: 'danger', FAILED: 'danger', BOUNCED: 'danger', CANCELLED: 'neutral', CLOSED: 'neutral',
};
