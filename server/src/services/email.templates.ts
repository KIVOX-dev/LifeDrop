import { EmailTemplate } from '../models/EmailLog';

export const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const BRAND = '#B91C35';

interface LayoutOpts {
  title: string;
  preheader?: string;
  body: string;
  cta?: { label: string; url: string };
  footerNote?: string;
  unsubscribeUrl?: string;
}

const layout = (o: LayoutOpts) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F2937;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader ?? o.title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
<tr><td style="background:${BRAND};padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700;">&#10084; LifeDrop</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${esc(o.title)}</h1>
${o.body}
${o.cta ? `<p style="margin:28px 0 8px;"><a href="${esc(o.cta.url)}" style="background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">${esc(o.cta.label)}</a></p>
<p style="font-size:12px;color:#6B7280;word-break:break-all;">If the button does not work, copy this link: ${esc(o.cta.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:18px 28px;background:#F9FAFB;font-size:12px;color:#6B7280;border-top:1px solid #E5E7EB;">
${o.footerNote ? `${esc(o.footerNote)}<br>` : ''}
LifeDrop connects voluntary blood donors with verified requirements. We do not provide medical advice; eligibility and compatibility are always decided by qualified medical staff.
${o.unsubscribeUrl ? `<br><a href="${esc(o.unsubscribeUrl)}" style="color:${BRAND};">Unsubscribe from non-essential emails</a>` : ''}
</td></tr></table></td></tr></table></body></html>`;

const p = (s: string) => `<p style="margin:0 0 12px;">${s}</p>`;
const table = (rows: [string, unknown][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;margin:12px 0;">${rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 14px;width:38%;font-weight:600;color:#374151;background:#F9FAFB;${i ? 'border-top:1px solid #E5E7EB;' : ''}">${esc(k)}</td><td style="padding:10px 14px;${i ? 'border-top:1px solid #E5E7EB;' : ''}">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`;

const fmtDate = (d: unknown, tz = 'UTC') =>
  d ? new Date(d as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz }) : '';

export interface Rendered { subject: string; html: string; text: string }
type D = Record<string, any>;

const renderers: Record<EmailTemplate, (d: D) => Rendered> = {
  WELCOME: (d) => ({
    subject: 'Welcome to LifeDrop',
    html: layout({
      title: `Welcome, ${d.name}!`,
      body: p('Thank you for joining LifeDrop. Your account is verified and ready.') + p('Upload your donation certificates to earn 100 reward points for every verified donation, and keep an eye on active blood requirements.'),
      cta: { label: 'Open my dashboard', url: d.dashboardUrl },
    }),
    text: `Welcome, ${d.name}! Your LifeDrop account is verified. Dashboard: ${d.dashboardUrl}`,
  }),
  EMAIL_VERIFICATION: (d) => ({
    subject: 'Verify your LifeDrop email address',
    html: layout({
      title: 'Verify your email',
      body: p(`Hi ${esc(d.name)},`) + p('Please confirm your email address to finish setting up your LifeDrop account. This link expires in 24 hours.'),
      cta: { label: 'Verify email', url: d.url },
    }),
    text: `Hi ${d.name}, verify your email (valid 24h): ${d.url}`,
  }),
  PASSWORD_RESET: (d) => ({
    subject: 'Reset your LifeDrop password',
    html: layout({
      title: 'Reset your password',
      body: p(`Hi ${esc(d.name)},`) + p('We received a request to reset your password. This link expires in 1 hour. If you did not request it, you can safely ignore this email.'),
      cta: { label: 'Reset password', url: d.url },
    }),
    text: `Hi ${d.name}, reset your password (valid 1h): ${d.url}`,
  }),
  CERTIFICATE_SUBMITTED: (d) => ({
    subject: 'We received your donation certificate',
    html: layout({
      title: 'Certificate submitted',
      body: p(`Hi ${esc(d.name)}, thank you for submitting your certificate.`) + table([['Donation date', fmtDate(d.donationDate)], ['Location', d.location], ['Status', 'Pending review']]) + p('An administrator will review it shortly. Reward points are credited only after approval.'),
    }),
    text: `Hi ${d.name}, we received your certificate for ${fmtDate(d.donationDate)} at ${d.location}. It is pending review.`,
  }),
  CERTIFICATE_APPROVED: (d) => ({
    subject: 'Your donation certificate was approved',
    html: layout({
      title: 'Certificate approved',
      body: p(`Hi ${esc(d.name)}, your certificate has been verified. Thank you for donating!`) + table([['Donation date', fmtDate(d.donationDate)], ['Location', d.location], ['Points awarded', `+${d.points}`]]) + p('We will send you a gentle reminder in about three months to check whether you may donate again. Final eligibility is always decided by medical staff.'),
      cta: { label: 'View my points', url: d.url },
    }),
    text: `Hi ${d.name}, your certificate for ${fmtDate(d.donationDate)} was approved. +${d.points} points.`,
  }),
  CERTIFICATE_REJECTED: (d) => ({
    subject: 'Your donation certificate needs attention',
    html: layout({
      title: 'Certificate not approved',
      body: p(`Hi ${esc(d.name)}, we could not approve your certificate for ${esc(fmtDate(d.donationDate))}.`) + table([['Reason', d.reason]]) + p('You are welcome to upload a clearer or corrected certificate.'),
      cta: { label: 'Upload again', url: d.url },
    }),
    text: `Hi ${d.name}, your certificate for ${fmtDate(d.donationDate)} was not approved. Reason: ${d.reason}`,
  }),
  BLOOD_REQUIREMENT: (d) => {
    const r = d.requirement;
    const rows: [string, unknown][] = [
      ['Blood group required', r.bloodGroup === 'ALL' ? 'All blood groups' : r.bloodGroup],
      ['Hospital / blood bank', r.hospitalName],
      ['Address', `${r.address}, ${r.city}, ${r.state}, ${r.country}`],
      ['Units required', r.unitsRequired],
      ['Contact person', r.contactPerson],
      ['Contact phone', r.contactPhone],
      ...(r.contactEmail ? ([['Contact email', r.contactEmail]] as [string, unknown][]) : []),
      ['Urgency', r.urgency],
      ['Respond by', fmtDate(r.lastDateToRespond)],
    ];
    return {
      subject: `[${r.urgency}] Blood needed: ${r.bloodGroup === 'ALL' ? 'all groups' : r.bloodGroup} at ${r.hospitalName}`,
      html: layout({
        title: r.title,
        preheader: `${r.bloodGroup} blood needed at ${r.hospitalName}`,
        body: p(`Hi ${esc(d.name)}, a verified blood requirement has been published.`) + table(rows) + p(`<strong>Details:</strong><br>${esc(r.description).replace(/\n/g, '<br>')}`) + p('<em>LifeDrop does not determine medical compatibility or eligibility. Please contact the hospital directly; qualified medical staff will decide whether you can donate.</em>'),
        cta: { label: 'View requirement', url: d.url },
        unsubscribeUrl: d.unsubscribeUrl,
        footerNote: 'You are receiving this because you opted in to blood requirement alerts.',
      }),
      text: [
        `Hi ${d.name}, a blood requirement was published: ${r.title}`,
        ...rows.map(([k, v]) => `${k}: ${v}`),
        `Details: ${r.description}`,
        'LifeDrop does not determine medical compatibility; please contact the hospital directly.',
        `Unsubscribe: ${d.unsubscribeUrl}`,
      ].join('\n'),
    };
  },
  DONATION_FOLLOWUP: (d) => ({
    subject: 'Time to check your donation eligibility',
    html: layout({
      title: 'Three months since your last donation',
      body: p(`Hi ${esc(d.name)}, it has been about three months since your donation on ${esc(fmtDate(d.donationDate))}.`) + p('If you would like to donate again, please check with your blood bank or a doctor whether you are eligible. This reminder is not a medical eligibility decision.'),
      cta: { label: 'See active requirements', url: d.url },
      unsubscribeUrl: d.unsubscribeUrl,
      footerNote: 'You are receiving this follow-up reminder because of your recent verified donation.',
    }),
    text: `Hi ${d.name}, about three months have passed since your donation on ${fmtDate(d.donationDate)}. Please check eligibility with medical staff. Unsubscribe: ${d.unsubscribeUrl}`,
  }),
  ACCOUNT_STATUS: (d) => ({
    subject: d.active ? 'Your LifeDrop account is active' : 'Your LifeDrop account has been deactivated',
    html: layout({
      title: d.active ? 'Account activated' : 'Account deactivated',
      body: p(`Hi ${esc(d.name)},`) + p(d.active ? 'Your account has been activated. You can sign in again.' : 'Your account has been deactivated by an administrator.') + (d.reason ? table([['Note', d.reason]]) : '') + p('If you think this is a mistake, please contact us through the website.'),
    }),
    text: `Hi ${d.name}, your account is now ${d.active ? 'active' : 'deactivated'}. ${d.reason ?? ''}`,
  }),
  ADMIN_NOTIFICATION: (d) => ({
    subject: `[LifeDrop admin] ${d.title}`,
    html: layout({
      title: d.title,
      body: p(esc(d.message)) + (d.details?.length ? table(d.details) : ''),
      ...(d.url ? { cta: { label: 'Open in admin panel', url: d.url } } : {}),
    }),
    text: `${d.title}\n${d.message}\n${(d.details ?? []).map(([k, v]: [string, string]) => `${k}: ${v}`).join('\n')}`,
  }),
};

export const renderTemplate = (template: EmailTemplate, data: D): Rendered => renderers[template](data ?? {});
