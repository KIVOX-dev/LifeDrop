import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), state: { user: null as any, loading: false } }));

vi.mock('@/store/auth', () => ({
  useAuth: () => ({ user: auth.state.user, loading: auth.state.loading, login: auth.login, register: auth.register, isAdmin: !!auth.state.user && auth.state.user.role !== 'DONOR', logout: vi.fn() }),
}));
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<any>()), api: { post: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({ data: { data: {}, meta: {} } }) }, post: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { ProtectedRoute } from '@/components/layout/layouts';
import { LoginPage, RegisterPage } from '@/pages/public/auth';

const renderAt = (path: string, ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={[path]}><Routes>{ui}</Routes></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); auth.state.user = null; auth.state.loading = false; });

describe('LoginPage', () => {
  it('shows validation errors and does not call the API with empty fields', async () => {
    renderAt('/login', <Route path="/login" element={<LoginPage />} />);
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    renderAt('/login', <Route path="/login" element={<LoginPage />} />);
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
  });

  it('logs in and sends donors to their dashboard', async () => {
    auth.login.mockResolvedValue({ fullName: 'Asha Rao', role: 'DONOR' });
    renderAt('/login', <><Route path="/login" element={<LoginPage />} /><Route path="/dashboard" element={<p>donor home</p>} /></>);
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ngPassw0rd');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('donor home')).toBeInTheDocument());
    expect(auth.login).toHaveBeenCalledWith('asha@example.com', 'Str0ngPassw0rd');
  });

  it('sends admins to the admin area', async () => {
    auth.login.mockResolvedValueOnce({ fullName: 'Ad Min', role: 'ADMIN' });
    renderAt('/login', <><Route path="/login" element={<LoginPage />} /><Route path="/admin" element={<p>admin home</p>} /></>);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('admin home')).toBeInTheDocument();
  });

  it('displays the API error for bad credentials', async () => {
    auth.login.mockRejectedValue({ response: { data: { error: { message: 'Invalid email or password' } } } });
    renderAt('/login', <Route path="/login" element={<LoginPage />} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});

describe('RegisterPage', () => {
  const fill = async (over: Record<string, string> = {}) => {
    const v: Record<string, string> = { 'Full name': 'Asha Rao', Email: 'asha@example.com', 'Phone number': '+91 98765 43210', 'Date of birth': '1995-05-20', Password: 'Str0ngPassw0rd', 'Confirm password': 'Str0ngPassw0rd', City: 'Pune', State: 'Maharashtra', Address: '12 Test Street, Pune', ...over };
    for (const [label, value] of Object.entries(v)) {
      const el = screen.getByLabelText(label, { exact: true });
      await userEvent.clear(el);
      await userEvent.type(el, value);
    }
    await userEvent.selectOptions(screen.getByLabelText('Blood group'), 'O+');
  };
  const view = () => renderAt('/register', <><Route path="/register" element={<RegisterPage />} /><Route path="/dashboard" element={<p>donor home</p>} /></>);

  it('requires every mandatory field and both consents', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: /create my account/i }));
    expect(await screen.findByText('Select your blood group')).toBeInTheDocument();
    expect(screen.getByText('You must accept the privacy policy')).toBeInTheDocument();
    expect(screen.getByText('You must accept the terms')).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('validates password strength, confirmation and minimum age', async () => {
    view();
    const young = new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10);
    await fill({ Password: 'weak', 'Confirm password': 'different', 'Date of birth': young });
    await userEvent.click(screen.getByRole('button', { name: /create my account/i }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.getByText('You must be at least 18 years old')).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('submits a clean payload (no confirmPassword) and redirects to the dashboard', async () => {
    auth.register.mockResolvedValue({ role: 'DONOR' });
    view();
    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /privacy policy/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /terms/i }));
    await userEvent.click(screen.getByRole('button', { name: /create my account/i }));
    await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(1));
    const body = auth.register.mock.calls[0][0];
    expect(body).toMatchObject({ fullName: 'Asha Rao', email: 'asha@example.com', bloodGroup: 'O+', city: 'Pune', acceptPrivacy: true, acceptTerms: true });
    expect(body.confirmPassword).toBeUndefined();
    expect(await screen.findByText('donor home')).toBeInTheDocument();
  });
});

describe('ProtectedRoute (UX guard; the API enforces the real rules)', () => {
  const tree = (roles: any) => (
    <>
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/dashboard" element={<p>donor home</p>} />
      <Route path="/admin" element={<p>admin home</p>} />
      <Route element={<ProtectedRoute roles={roles} />}><Route path="/secret" element={<p>secret</p>} /></Route>
    </>
  );
  it('redirects anonymous visitors to login', () => {
    renderAt('/secret', tree(['ADMIN']));
    expect(screen.getByText('login page')).toBeInTheDocument();
  });
  it('bounces a donor away from admin pages and an admin away from donor pages', () => {
    auth.state.user = { role: 'DONOR' };
    const a = renderAt('/secret', tree(['ADMIN', 'SUPER_ADMIN']));
    expect(screen.getByText('donor home')).toBeInTheDocument();
    a.unmount();
    auth.state.user = { role: 'ADMIN' };
    renderAt('/secret', tree(['DONOR']));
    expect(screen.getByText('admin home')).toBeInTheDocument();
  });
  it('allows the right role and shows a skeleton while the session loads', () => {
    auth.state.user = { role: 'SUPER_ADMIN' };
    const a = renderAt('/secret', tree(['ADMIN', 'SUPER_ADMIN']));
    expect(screen.getByText('secret')).toBeInTheDocument();
    a.unmount();
    auth.state.user = null;
    auth.state.loading = true;
    renderAt('/secret', tree(['ADMIN']));
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });
});
