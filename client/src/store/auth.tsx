import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken } from '@/lib/api';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'DONOR';

export interface User { _id: string; fullName: string; email: string; role: Role; emailVerified: boolean; isActive: boolean; deletionRequestedAt?: string }
export interface Profile {
  _id: string; phone: string; dateOfBirth: string; gender?: string; bloodGroup: string; city: string; state: string; country: string; address: string;
  emergencyContact?: { name?: string; phone?: string; relation?: string };
  isAvailable: boolean; privacy: { showOnLeaderboard: boolean };
  preferences: { nonEssentialEmails: boolean; requirementAlerts: boolean; reminderEmails: boolean };
  totalPoints: number; totalVerifiedDonations: number; lastDonationDate?: string; profilePictureKey?: string;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  setProfile: (p: Profile | null) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = (d: { accessToken?: string; user: User; profile: Profile | null }) => {
    if (d.accessToken) setAccessToken(d.accessToken);
    setUser(d.user);
    setProfile(d.profile ?? null);
    return d.user;
  };
  const clear = useCallback(() => { setAccessToken(null); setUser(null); setProfile(null); }, []);

  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    let alive = true;
    refreshSession().then((d) => {
      if (!alive) return;
      if (d) apply(d);
      setLoading(false);
    });
    const onExpired = () => clear();
    window.addEventListener('auth:expired', onExpired);
    return () => { alive = false; window.removeEventListener('auth:expired', onExpired); };
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      user, profile, loading,
      isAdmin: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      login: async (email, password) => apply((await api.post('/auth/login', { email, password })).data.data),
      register: async (body) => apply((await api.post('/auth/register', body)).data.data),
      logout: async () => { try { await api.post('/auth/logout'); } finally { clear(); } },
      setProfile,
      reload: async () => { apply({ ...(await api.get('/auth/me')).data.data }); },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, profile, loading, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
};
