import { BarChart3, Bell, Bot, ClipboardList, FileCheck2, FileUp, Heart, History, LayoutDashboard, Mail, Megaphone, Settings, ShieldCheck, Timer, Trophy, User as UserIcon, Users, Award, Droplet, ScrollText } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardShell, ProtectedRoute, PublicLayout } from '@/components/layout/layouts';
import { Skeleton } from '@/components/ui/primitives';
import { AboutPage, ContactPage, FaqPage, HomePage, HowItWorksPage, LeaderboardPage, NotFoundPage, PrivacyPage, RequirementsPage, TermsPage } from '@/pages/public/pages';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from '@/pages/public/auth';
import { useAuth } from '@/store/auth';

// Dashboards are code-split so the public site stays light.
const D = {
  Overview: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.DonorOverview }))),
  Donations: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.DonorDonations }))),
  Upload: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.UploadCertificate }))),
  Points: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.DonorPoints }))),
  Requirements: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.DonorRequirements }))),
  Notifications: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.NotificationsPage }))),
  Profile: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.ProfilePage }))),
  Leaderboard: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.DonorLeaderboard }))),
  Assistant: lazy(() => import('@/pages/donor/pages').then((m) => ({ default: m.DonorAssistant }))),
};
const A = {
  Dashboard: lazy(() => import('@/pages/admin/pages1').then((m) => ({ default: m.AdminDashboard }))),
  Donors: lazy(() => import('@/pages/admin/pages1').then((m) => ({ default: m.AdminDonors }))),
  DonorDetail: lazy(() => import('@/pages/admin/pages1').then((m) => ({ default: m.AdminDonorDetail }))),
  Donations: lazy(() => import('@/pages/admin/pages1').then((m) => ({ default: m.AdminDonations }))),
  Certificates: lazy(() => import('@/pages/admin/pages1').then((m) => ({ default: m.AdminCertificates }))),
  Requirements: lazy(() => import('@/pages/admin/pages2').then((m) => ({ default: m.AdminRequirements }))),
  RequirementForm: lazy(() => import('@/pages/admin/pages2').then((m) => ({ default: m.AdminRequirementForm }))),
  RequirementDetail: lazy(() => import('@/pages/admin/pages2').then((m) => ({ default: m.AdminRequirementDetail }))),
  Leaderboard: lazy(() => import('@/pages/admin/pages2').then((m) => ({ default: m.AdminLeaderboard }))),
  EmailLogs: lazy(() => import('@/pages/admin/pages2').then((m) => ({ default: m.AdminEmailLogs }))),
  Reminders: lazy(() => import('@/pages/admin/pages2').then((m) => ({ default: m.AdminReminders }))),
  Analytics: lazy(() => import('@/pages/admin/pages3').then((m) => ({ default: m.AdminAnalytics }))),
  AI: lazy(() => import('@/pages/admin/pages3').then((m) => ({ default: m.AdminAIAssistant }))),
  Admins: lazy(() => import('@/pages/admin/pages3').then((m) => ({ default: m.AdminAdmins }))),
  Audit: lazy(() => import('@/pages/admin/pages3').then((m) => ({ default: m.AdminAuditLogs }))),
  Settings: lazy(() => import('@/pages/admin/pages3').then((m) => ({ default: m.AdminSettings }))),
};

const donorNav = [
  { to: '/dashboard', label: 'Overview', icon: <LayoutDashboard />, end: true },
  { to: '/dashboard/donations', label: 'My donations', icon: <History /> },
  { to: '/dashboard/upload', label: 'Upload certificate', icon: <FileUp /> },
  { to: '/dashboard/points', label: 'Points & rank', icon: <Award /> },
  { to: '/dashboard/requirements', label: 'Blood requirements', icon: <Droplet /> },
  { to: '/dashboard/notifications', label: 'Notifications', icon: <Bell /> },
  { to: '/dashboard/assistant', label: 'Help assistant', icon: <Bot /> },
  { to: '/dashboard/profile', label: 'Profile & privacy', icon: <UserIcon /> },
  { to: '/dashboard/leaderboard', label: 'Leaderboard', icon: <Trophy /> },
];

const adminNav = (superAdmin: boolean) => [
  { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard />, end: true },
  { to: '/admin/donors', label: 'Donors', icon: <Users /> },
  { to: '/admin/donations', label: 'Donation records', icon: <ClipboardList /> },
  { to: '/admin/certificates', label: 'Certificates', icon: <FileCheck2 /> },
  { to: '/admin/requirements', label: 'Blood requirements', icon: <Megaphone /> },
  { to: '/admin/leaderboard', label: 'Leaderboard', icon: <Trophy /> },
  { to: '/admin/email-logs', label: 'Email logs', icon: <Mail /> },
  { to: '/admin/reminders', label: 'Reminders', icon: <Timer /> },
  { to: '/admin/analytics', label: 'Analytics & reports', icon: <BarChart3 /> },
  { to: '/admin/ai', label: 'AI assistant', icon: <Bot /> },
  ...(superAdmin ? [{ to: '/admin/admins', label: 'Administrators', icon: <ShieldCheck /> }] : []),
  { to: '/admin/audit-logs', label: 'Audit logs', icon: <ScrollText /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings /> },
];

const Fallback = () => <div className="space-y-4 p-2"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
const AdminShell = () => { const { isSuperAdmin } = useAuth(); return <DashboardShell nav={adminNav(isSuperAdmin)} title="Administration" />; };

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="requirements" element={<RequirementsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['DONOR']} />}>
          <Route path="dashboard" element={<DashboardShell nav={donorNav} title="Donor" notificationsPath="/dashboard/notifications" />}>
            <Route index element={<D.Overview />} />
            <Route path="donations" element={<D.Donations />} />
            <Route path="upload" element={<D.Upload />} />
            <Route path="points" element={<D.Points />} />
            <Route path="requirements" element={<D.Requirements />} />
            <Route path="notifications" element={<D.Notifications />} />
            <Route path="leaderboard" element={<D.Leaderboard />} />
            <Route path="assistant" element={<D.Assistant />} />
            <Route path="profile" element={<D.Profile />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']} />}>
          <Route path="admin" element={<AdminShell />}>
            <Route index element={<A.Dashboard />} />
            <Route path="donors" element={<A.Donors />} />
            <Route path="donors/:id" element={<A.DonorDetail />} />
            <Route path="donations" element={<A.Donations />} />
            <Route path="certificates" element={<A.Certificates />} />
            <Route path="requirements" element={<A.Requirements />} />
            <Route path="requirements/new" element={<A.RequirementForm />} />
            <Route path="requirements/:id" element={<A.RequirementDetail />} />
            <Route path="requirements/:id/edit" element={<A.RequirementForm />} />
            <Route path="leaderboard" element={<A.Leaderboard />} />
            <Route path="email-logs" element={<A.EmailLogs />} />
            <Route path="reminders" element={<A.Reminders />} />
            <Route path="analytics" element={<A.Analytics />} />
            <Route path="ai" element={<A.AI />} />
            <Route path="audit-logs" element={<A.Audit />} />
            <Route path="settings" element={<A.Settings />} />
            <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
              <Route path="admins" element={<A.Admins />} />
            </Route>
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

void Heart;
