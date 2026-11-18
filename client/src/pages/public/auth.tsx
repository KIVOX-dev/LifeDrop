import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { api, errorMessage, post } from '@/lib/api';
import { useSeo } from '@/lib/hooks';
import { loginSchema, passwordRule, registerSchema, RegisterForm } from '@/lib/schemas';
import { BLOOD_GROUPS, MAX_UPLOAD_MB, todayISO } from '@/lib/utils';
import { Logo } from '@/components/layout/layouts';
import { useAuth } from '@/store/auth';

function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 pb-12 pt-28"><div className="pointer-events-none absolute -right-32 top-10 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(185,28,53,.15),transparent_65%)]" aria-hidden /><div className="pointer-events-none absolute -left-32 bottom-0 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(246,170,160,.4),transparent_65%)]" aria-hidden />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center"><Link to="/" className="inline-block"><Logo /></Link></div>
        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-3xl font-medium">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </div>
  );
}

export function LoginPage() {
  useSeo('Log in', 'Log in to your LifeDrop donor or admin account.');
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });
  const [error, setError] = useState('');

  return (
    <AuthFrame title="Welcome back" subtitle="Log in to continue." footer={<>New to LifeDrop? <Link className="font-semibold text-primary" to="/register">Become a donor</Link></>}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setError('');
          try {
            const user = await login(v.email, v.password);
            toast.success(`Welcome, ${user.fullName.split(' ')[0]}`);
            navigate(loc.state?.from ?? (user.role === 'DONOR' ? '/dashboard' : '/admin'), { replace: true });
          } catch (e) { setError(errorMessage(e, 'Could not log in')); }
        })}
      >
        {error && <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm font-medium text-destructive">{error}</p>}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <div className="text-right text-sm"><Link className="font-medium text-primary" to="/forgot-password">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={isSubmitting}>Log in</Button>
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  useSeo('Become a donor', 'Register as a blood donor on LifeDrop and get notified about verified blood requirements.');
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [picture, setPicture] = useState<File | null>(null);
  const [pictureError, setPictureError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema) as any,
    defaultValues: { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India', acceptPrivacy: false, acceptTerms: false, gender: '' },
  });
  const e = errors;

  const onPick = (f?: File) => {
    setPictureError('');
    if (!f) return setPicture(null);
    if (!['image/jpeg', 'image/png'].includes(f.type)) return setPictureError('Use a JPG or PNG image');
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return setPictureError(`Max ${MAX_UPLOAD_MB} MB`);
    setPicture(f);
  };

  return (
    <div className="container max-w-3xl pb-12 pt-28">
      <div className="mb-6 text-center"><h1 className="h-section">Become a LifeDrop donor</h1><p className="mt-2 text-muted-foreground">Takes about two minutes. Your details stay private.</p></div>
      <Card className="p-6 sm:p-8">
        <form
          noValidate
          className="space-y-8"
          onSubmit={handleSubmit(async (v) => {
            setError('');
            try {
              const { confirmPassword, emergencyName, emergencyPhone, gender, ...rest } = v;
              await signUp({
                ...rest,
                ...(gender ? { gender } : {}),
                ...(emergencyName || emergencyPhone ? { emergencyContact: { name: emergencyName || undefined, phone: emergencyPhone || undefined } } : {}),
              });
              if (picture) {
                const fd = new FormData();
                fd.append('picture', picture);
                await api.post('/donors/profile/picture', fd).catch(() => toast.warning('Account created, but the picture could not be uploaded. Add it later in your profile.'));
              }
              toast.success('Account created! Check your inbox to verify your email.');
              navigate('/dashboard', { replace: true });
            } catch (err) { setError(errorMessage(err, 'Registration failed')); }
          })}
        >
          {error && <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm font-medium text-destructive">{error}</p>}

          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-primary">Account</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="fullName" error={e.fullName?.message}><Input id="fullName" autoComplete="name" aria-invalid={!!e.fullName} {...register('fullName')} /></Field>
              <Field label="Email" htmlFor="email" error={e.email?.message}><Input id="email" type="email" autoComplete="email" aria-invalid={!!e.email} {...register('email')} /></Field>
              <Field label="Phone number" htmlFor="phone" error={e.phone?.message}><Input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" aria-invalid={!!e.phone} {...register('phone')} /></Field>
              <Field label="Date of birth" htmlFor="dob" error={e.dateOfBirth?.message}><Input id="dob" type="date" max={todayISO()} aria-invalid={!!e.dateOfBirth} {...register('dateOfBirth')} /></Field>
              <Field label="Password" htmlFor="password" error={e.password?.message} hint="8+ characters with upper, lower case and a number"><Input id="password" type="password" autoComplete="new-password" aria-invalid={!!e.password} {...register('password')} /></Field>
              <Field label="Confirm password" htmlFor="confirmPassword" error={e.confirmPassword?.message}><Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!e.confirmPassword} {...register('confirmPassword')} /></Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-primary">Donor details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Blood group" htmlFor="bloodGroup" error={e.bloodGroup?.message}>
                <Select id="bloodGroup" defaultValue="" aria-invalid={!!e.bloodGroup} {...register('bloodGroup')}><option value="" disabled>Select…</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
              </Field>
              <Field label="Gender (optional)" htmlFor="gender">
                <Select id="gender" {...register('gender')}><option value="">Prefer not to say</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select>
              </Field>
              <Field label="City" htmlFor="city" error={e.city?.message}><Input id="city" autoComplete="address-level2" aria-invalid={!!e.city} {...register('city')} /></Field>
              <Field label="State" htmlFor="state" error={e.state?.message}><Input id="state" autoComplete="address-level1" aria-invalid={!!e.state} {...register('state')} /></Field>
              <Field label="Country" htmlFor="country" error={e.country?.message}><Input id="country" autoComplete="country-name" aria-invalid={!!e.country} {...register('country')} /></Field>
              <Field label="Profile picture (optional)" htmlFor="picture" error={pictureError}>
                <Input id="picture" type="file" accept="image/png,image/jpeg" className="h-auto py-1.5" onChange={(ev) => onPick(ev.target.files?.[0])} />
              </Field>
            </div>
            <Field label="Address" htmlFor="address" error={e.address?.message}><Textarea id="address" rows={2} autoComplete="street-address" aria-invalid={!!e.address} {...register('address')} /></Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-primary">Emergency contact (optional)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name" htmlFor="emName"><Input id="emName" {...register('emergencyName')} /></Field>
              <Field label="Contact phone" htmlFor="emPhone" error={e.emergencyPhone?.message}><Input id="emPhone" type="tel" {...register('emergencyPhone')} /></Field>
            </div>
          </fieldset>

          <div className="space-y-3 rounded-lg bg-muted/60 p-4 text-sm">
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" {...register('acceptPrivacy')} /><span>I have read and accept the <Link target="_blank" className="font-semibold text-primary underline" to="/privacy">Privacy Policy</Link> and consent to LifeDrop processing my personal and blood group information.</span></label>
            {e.acceptPrivacy && <p role="alert" className="text-xs font-medium text-destructive">{e.acceptPrivacy.message}</p>}
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" {...register('acceptTerms')} /><span>I accept the <Link target="_blank" className="font-semibold text-primary underline" to="/terms">Terms &amp; Conditions</Link> and understand LifeDrop does not provide medical advice or eligibility decisions.</span></label>
            {e.acceptTerms && <p role="alert" className="text-xs font-medium text-destructive">{e.acceptTerms.message}</p>}
          </div>

          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Create my account</Button>
          <p className="text-center text-sm text-muted-foreground">Already registered? <Link className="font-semibold text-primary" to="/login">Log in</Link></p>
        </form>
      </Card>
    </div>
  );
}

export function ForgotPasswordPage() {
  useSeo('Forgot password');
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email') })) });
  return (
    <AuthFrame title="Forgot your password?" subtitle="We'll email you a reset link." footer={<Link className="font-semibold text-primary" to="/login">Back to log in</Link>}>
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center"><MailCheck className="h-10 w-10 text-success" /><p className="text-sm">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</p></div>
      ) : (
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { try { await post('/auth/forgot-password', v); setSent(true); } catch (e) { toast.error(errorMessage(e)); } })}>
          <Field label="Email" htmlFor="fp-email" error={errors.email?.message}><Input id="fp-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} /></Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  useSeo('Reset password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const schema = z.object({ password: passwordRule, confirm: z.string() }).refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });
  if (!token) return <AuthFrame title="Invalid link"><p className="text-sm">This reset link is missing its token. <Link className="font-semibold text-primary" to="/forgot-password">Request a new one</Link>.</p></AuthFrame>;
  return (
    <AuthFrame title="Choose a new password">
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
        try { await post('/auth/reset-password', { token, password: v.password }); toast.success('Password updated. Please log in.'); navigate('/login'); } catch (e) { toast.error(errorMessage(e)); }
      })}>
        <Field label="New password" htmlFor="np" error={errors.password?.message}><Input id="np" type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Confirm password" htmlFor="cp" error={errors.confirm?.message}><Input id="cp" type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthFrame>
  );
}

export function VerifyEmailPage() {
  useSeo('Verify email');
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(token ? 'loading' : 'error');
  const [msg, setMsg] = useState('This verification link is missing its token.');
  const ran = useRef(false);
  const { user, reload } = useAuth();
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // StrictMode runs effects twice; the token is single-use
    post('/auth/verify-email', { token })
      .then(() => { setState('ok'); if (user) void reload(); })
      .catch((e) => { setState('error'); setMsg(errorMessage(e, 'Verification failed')); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <AuthFrame title="Email verification">
      <div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
        {state === 'loading' && <p className="text-sm text-muted-foreground">Verifying…</p>}
        {state === 'ok' && (<><CheckCircle2 className="h-12 w-12 text-success" /><p className="font-semibold">Your email is verified!</p><Button asChild><Link to="/dashboard">Go to dashboard</Link></Button></>)}
        {state === 'error' && (<><XCircle className="h-12 w-12 text-destructive" /><p className="text-sm">{msg}</p><Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button></>)}
      </div>
    </AuthFrame>
  );
}
