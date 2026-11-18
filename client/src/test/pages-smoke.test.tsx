import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const page = (items: unknown[] = []) => ({ items, meta: { page: 1, limit: 10, total: items.length, totalPages: 1, unread: 0 } });
const donation = { _id: 'd1', donationDate: '2025-01-10T12:00:00Z', location: 'City Blood Bank', bloodGroup: 'O+', status: 'VERIFIED', certificate: { _id: 'c1', status: 'APPROVED' } };
const requirement = { _id: 'r1', title: 'Urgent O+', bloodGroup: 'O+', hospitalName: 'City General', address: '1 Road', city: 'Pune', state: 'MH', country: 'India', unitsRequired: 2, contactPerson: 'Dr Rao', contactPhone: '+91981', description: 'Need blood', urgency: 'HIGH', lastDateToRespond: new Date(Date.now() + 3 * 86400000).toISOString(), status: 'PUBLISHED', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' };
const month = [{ month: '2025-01', count: 4 }, { month: '2025-02', count: 7 }];
const named = [{ name: 'O+', value: 5 }, { name: 'A+', value: 3 }];

const data: Record<string, unknown> = {
  '/public/stats': { donors: 10, donations: 4, points: 400, activeRequirements: 1, contact: {} },
  '/points/my-points': { totalPoints: 200, totalVerifiedDonations: 2, rank: 1 },
  '/admin/dashboard': { totalDonors: 3, activeDonors: 3, verifiedDonations: 2, pendingCertificates: 1, rejectedCertificates: 0, activeRequirements: 1, totalPointsAwarded: 200, deletionRequests: 0, emails: { total: 3, queued: 1, sent: 1, delivered: 1, failed: 0, skipped: 0 } },
  '/admin/analytics': { registrationsByMonth: month, donationsByMonth: month, bloodGroupDistribution: named, geographicDistribution: { states: named, cities: named }, certificates: { pending: 1, approved: 2, rejected: 1, approvalRate: 67 }, leaderboard: { donorsWithPoints: 2, averagePoints: 100, topPoints: 200, totalPoints: 300 }, requirements: { byStatus: named, byBloodGroup: named, byUrgency: named, notifications: named }, emails: { byStatus: named, byTemplate: named } },
  '/admin/settings': { settings: { reminderMonths: 3, registrationsOpen: true, contactEmail: '', contactPhone: '', contactAddress: '', announcement: '' }, integrations: { brevo: false, b2: false, groq: false }, timezone: 'Asia/Kolkata' },
  '/requirements': [requirement],
  '/donors/d1': { user: { _id: 'd1', fullName: 'Asha', email: 'a@b.co', isActive: true, emailVerified: true, createdAt: '2025-01-01' }, profile: { bloodGroup: 'O+', city: 'Pune', state: 'MH', country: 'India', privacy: {}, totalPoints: 100, totalVerifiedDonations: 1 }, donations: [donation], points: [{ _id: 'p1', type: 'DONATION_APPROVED', points: 100, createdAt: '2025-01-02' }], rank: { rank: 1 } },
  '/requirements/r1': requirement,
  '/requirements/r1/notifications': { stats: { targetDonors: 2, queued: 1, sent: 0, delivered: 1, failed: 0, skipped: 0, pending: 1 }, items: [{ _id: 'n1', donor: { fullName: 'Asha', email: 'a@b.co' }, status: 'DELIVERED', updatedAt: '2025-01-01' }] },
};
const paged: Record<string, unknown[]> = {
  '/donors': [{ _id: 'p1', bloodGroup: 'O+', city: 'Pune', state: 'MH', totalPoints: 100, user: { _id: 'd1', fullName: 'Asha', email: 'a@b.co', isActive: true } }],
  '/donations': [{ ...donation, donor: { fullName: 'Asha', email: 'a@b.co' } }],
  '/certificates': [{ _id: 'c1', status: 'PENDING', createdAt: '2025-01-01', donor: { fullName: 'Asha', email: 'a@b.co' }, donation }],
  '/requirements': [requirement],
  '/admin/email-logs': [{ _id: 'e1', to: 'a@b.co', template: 'WELCOME', status: 'SENT', attempts: 1, createdAt: '2025-01-01' }],
  '/admin/reminders': [{ _id: 'rm1', status: 'SCHEDULED', scheduledFor: '2025-04-10T03:30:00Z', timezone: 'Asia/Kolkata', donor: { fullName: 'Asha', email: 'a@b.co' }, donation }],
  '/admin/users': [{ _id: 'u1', fullName: 'Boss', email: 'boss@b.co', role: 'SUPER_ADMIN', isActive: true }],
  '/admin/activity-logs': [{ _id: 'l1', createdAt: '2025-01-01', actor: { fullName: 'Boss' }, actorRole: 'ADMIN', action: 'CERTIFICATE_APPROVED', entityType: 'Certificate', meta: { a: 1 } }],
  '/points/transactions': [{ _id: 'p1', type: 'DONATION_APPROVED', points: 100, createdAt: '2025-01-02', donation }],
  '/notifications': [{ _id: 'nt1', title: 'Hello', message: 'World', createdAt: '2025-01-01' }],
};
const lb = { entries: [{ rank: 1, name: 'Asha', bloodGroup: 'O+', city: 'Pune', points: 200, donations: 2 }], top3: [{ rank: 1, name: 'Asha', bloodGroup: 'O+', city: 'Pune', points: 200, donations: 2 }] };

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<any>();
  const strip = (u: string) => u.split('?')[0];
  const rawGet = async (u: string) => {
    const url = strip(u);
    if (url.startsWith('/leaderboard')) return { data: { data: lb, meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } };
    if (url === '/requirements') return { data: { data: [requirement], meta: { page: 1, limit: 9, total: 1, totalPages: 1 } } };
    if (url === '/donors/donations') return { data: { data: { items: [donation], nextReminder: { scheduledFor: '2025-04-10' } }, meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } };
    if (url === '/requirements/r1/notifications') return { data: { data: data[url], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } };
    if (url === '/notifications') return { data: { data: paged[url], meta: { page: 1, limit: 10, total: 1, totalPages: 1, unread: 1 } } };
    return { data: { data: data[url] ?? {}, meta: {} } };
  };
  return {
    ...actual,
    api: { get: vi.fn(rawGet), post: vi.fn(async () => ({ data: { data: {} } })), patch: vi.fn() },
    get: vi.fn(async (u: string) => (data[strip(u)] ?? {})),
    getPaged: vi.fn(async (u: string) => page(paged[strip(u)] ?? [])),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    put: vi.fn(async () => ({})),
    del: vi.fn(async () => ({})),
  };
});
vi.mock('@/store/auth', () => ({
  useAuth: () => ({
    user: { _id: 'u1', fullName: 'Asha Rao', email: 'a@b.co', role: 'SUPER_ADMIN', emailVerified: true },
    profile: { bloodGroup: 'O+', phone: '+91 98765 43210', city: 'Pune', state: 'MH', country: 'India', address: '1 Road, Pune', isAvailable: true, privacy: { showOnLeaderboard: true }, preferences: { nonEssentialEmails: true, requirementAlerts: true, reminderEmails: true }, totalPoints: 100, totalVerifiedDonations: 1 },
    isAdmin: true, isSuperAdmin: true, loading: false, setProfile: vi.fn(), reload: vi.fn(), logout: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { FaqPage, HomePage, AboutPage, HowItWorksPage, LeaderboardPage, PrivacyPage, RequirementsPage, TermsPage, ContactPage } from '@/pages/public/pages';
import * as D from '@/pages/donor/pages';
import * as A1 from '@/pages/admin/pages1';
import * as A2 from '@/pages/admin/pages2';
import * as A3 from '@/pages/admin/pages3';

const cases: [string, React.ComponentType, string, RegExp | string][] = [
  ['home', HomePage, '/', /Give blood. Give hope/i],
  ['about', AboutPage, '/', 'About LifeDrop'],
  ['how it works', HowItWorksPage, '/', 'How LifeDrop works'],
  ['faq', FaqPage, '/', 'Frequently asked questions'],
  ['privacy', PrivacyPage, '/', 'Privacy policy'],
  ['terms', TermsPage, '/', /Terms & conditions/],
  ['contact', ContactPage, '/', 'Contact us'],
  ['requirements', RequirementsPage, '/', 'Urgent O+'],
  ['leaderboard', LeaderboardPage, '/', 'Donor leaderboard'],
  ['donor overview', D.DonorOverview, '/', /Hello, Asha/],
  ['donor donations', D.DonorDonations, '/', 'Donation history'],
  ['donor points', D.DonorPoints, '/', 'Points & rank'],
  ['donor requirements', D.DonorRequirements, '/', 'Active blood requirements'],
  ['donor notifications', D.NotificationsPage, '/', 'Notifications'],
  ['donor profile', D.ProfilePage, '/', 'My profile'],
  ['donor assistant', D.DonorAssistant, '/', 'Help assistant'],
  ['admin dashboard', A1.AdminDashboard, '/', 'Dashboard'],
  ['admin donors', A1.AdminDonors, '/', 'Donors'],
  ['admin donations', A1.AdminDonations, '/', 'Donation records'],
  ['admin certificates', A1.AdminCertificates, '/', 'Certificate verification'],
  ['admin requirements', A2.AdminRequirements, '/', 'Blood requirements'],
  ['admin requirement form', A2.AdminRequirementForm, '/', 'Create requirement'],
  ['admin leaderboard', A2.AdminLeaderboard, '/', 'Leaderboard'],
  ['admin email logs', A2.AdminEmailLogs, '/', 'Email logs'],
  ['admin reminders', A2.AdminReminders, '/', 'Follow-up reminders'],
  ['admin analytics', A3.AdminAnalytics, '/', 'Analytics & reports'],
  ['admin ai', A3.AdminAIAssistant, '/', 'AI assistant'],
  ['admin admins', A3.AdminAdmins, '/', 'Administrators'],
  ['admin audit', A3.AdminAuditLogs, '/', 'Audit logs'],
  ['admin settings', A3.AdminSettings, '/', 'Settings'],
];

describe('every page renders its data without runtime errors', () => {
  it.each(cases)('%s', async (_n, Comp, path, expected) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<MemoryRouter initialEntries={[path]}><Comp /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 3000 });
    const real = errors.mock.calls.filter((c) => !String(c[0]).includes('act(') && !String(c[0]).includes('not wrapped'));
    expect(real, JSON.stringify(real.map((c) => String(c[0]).slice(0, 200)))).toHaveLength(0);
    errors.mockRestore();
  });

  it('admin donor + requirement detail pages', async () => {
    for (const [Comp, route, url, text] of [
      [A1.AdminDonorDetail, '/admin/donors/:id', '/admin/donors/d1', 'Asha'],
      [A2.AdminRequirementDetail, '/admin/requirements/:id', '/admin/requirements/r1', 'Urgent O+'],
    ] as const) {
      const { unmount } = render(<MemoryRouter initialEntries={[url]}><Routes><Route path={route} element={<Comp />} /></Routes></MemoryRouter>);
      await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(0), { timeout: 3000 });
      unmount();
    }
  });
});
