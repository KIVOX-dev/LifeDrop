import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, signAccessToken } from '../middleware/auth';
import { authLimiter, refreshLimiter, sensitiveLimiter, validate } from '../middleware/common';
import { DonorProfile, User } from '../models';
import { clearRefreshCookie, revokeAllForUser, revokeCurrent, rotateSession, startSession } from '../services/auth.service';
import { clientUrl, getSettings, notify } from '../services/common.service';
import { queueEmail } from '../services/email.service';
import { ApiError, asyncHandler, created, ok, randomToken, sha256 } from '../utils/common';
import { email, loginSchema, password, registerSchema } from './schemas';

const router = Router();
const BCRYPT_ROUNDS = 12;
// Pre-computed hash so unknown-email logins take as long as real ones (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('lifedrop-dummy-password', BCRYPT_ROUNDS);

async function sendVerification(user: { _id: any; email: string; fullName: string }) {
  const token = randomToken();
  await User.updateOne(
    { _id: user._id },
    { emailVerifyTokenHash: sha256(token), emailVerifyExpires: new Date(Date.now() + 24 * 3600_000) },
  );
  await queueEmail({
    to: user.email,
    toName: user.fullName,
    userId: user._id,
    template: 'EMAIL_VERIFICATION',
    data: { name: user.fullName, url: clientUrl(`/verify-email?token=${token}`) },
  });
}

/** Full session payload: user + donor profile (if any). */
export async function userPayload(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  const profile = user.role === 'DONOR' ? await DonorProfile.findOne({ user: user._id }).lean() : null;
  return { user: user.toJSON(), profile };
}

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    if (!settings.registrationsOpen) throw ApiError.forbidden('New registrations are currently closed');
    const b = req.body;
    if (await User.exists({ email: b.email })) throw ApiError.conflict('An account with this email already exists');
    const user = await User.create({
      fullName: b.fullName,
      email: b.email,
      passwordHash: await bcrypt.hash(b.password, BCRYPT_ROUNDS),
      role: 'DONOR',
    });
    try {
      const now = new Date();
      await DonorProfile.create({
        user: user._id,
        phone: b.phone,
        dateOfBirth: b.dateOfBirth,
        gender: b.gender,
        bloodGroup: b.bloodGroup,
        city: b.city,
        state: b.state,
        country: b.country,
        address: b.address,
        emergencyContact: b.emergencyContact,
        consent: { privacyAcceptedAt: now, termsAcceptedAt: now },
      });
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      throw err;
    }
    await sendVerification(user);
    await notify(user._id, 'ACCOUNT', 'Welcome to LifeDrop', 'Please verify your email address to receive blood requirement alerts.', '/dashboard/profile');
    const { accessToken } = await startSession({ id: String(user._id), role: user.role }, req, res);
    created(res, { ...(await userPayload(String(user._id))), accessToken });
  }),
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
    const valid = await bcrypt.compare(req.body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || user.deletedAt) throw ApiError.unauthorized('Invalid email or password');
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated. Please contact support.');
    user.lastLoginAt = new Date();
    await user.save();
    const { accessToken } = await startSession({ id: String(user._id), role: user.role }, req, res);
    ok(res, { ...(await userPayload(String(user._id))), accessToken });
  }),
);

router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const { userId } = await rotateSession(req, res);
    const user = await User.findById(userId).select('role isActive deletedAt');
    if (!user || user.deletedAt || !user.isActive) {
      await revokeAllForUser(userId);
      clearRefreshCookie(res);
      throw ApiError.unauthorized('Account unavailable');
    }
    ok(res, { accessToken: signAccessToken({ id: userId, role: user.role }), ...(await userPayload(userId)) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeCurrent(req);
    clearRefreshCookie(res);
    ok(res, { message: 'Logged out' });
  }),
);

router.get('/me', authenticate, asyncHandler(async (req, res) => ok(res, await userPayload(req.user!.id))));

router.post(
  '/verify-email',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(20).max(200) }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      emailVerifyTokenHash: sha256(req.body.token),
      emailVerifyExpires: { $gt: new Date() },
    }).select('+emailVerifyTokenHash +emailVerifyExpires');
    if (!user) throw ApiError.badRequest('This verification link is invalid or has expired');
    const wasVerified = user.emailVerified;
    user.emailVerified = true;
    user.emailVerifyTokenHash = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();
    if (!wasVerified) {
      await queueEmail({
        to: user.email,
        toName: user.fullName,
        userId: user._id,
        template: 'WELCOME',
        dedupeKey: `welcome:${user._id}`,
        data: { name: user.fullName, dashboardUrl: clientUrl('/dashboard') },
      });
    }
    ok(res, { message: 'Email verified' });
  }),
);

router.post(
  '/resend-verification',
  authenticate,
  sensitiveLimiter,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) throw ApiError.notFound();
    if (user.emailVerified) throw ApiError.badRequest('Email is already verified');
    await sendVerification(user);
    ok(res, { message: 'Verification email sent' });
  }),
);

router.post(
  '/forgot-password',
  sensitiveLimiter,
  validate({ body: z.object({ email }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email, deletedAt: null, isActive: true });
    if (user) {
      const token = randomToken();
      await User.updateOne(
        { _id: user._id },
        { passwordResetTokenHash: sha256(token), passwordResetExpires: new Date(Date.now() + 3600_000) },
      );
      await queueEmail({
        to: user.email,
        toName: user.fullName,
        userId: user._id,
        template: 'PASSWORD_RESET',
        data: { name: user.fullName, url: clientUrl(`/reset-password?token=${token}`) },
      });
    }
    // Same response whether or not the account exists.
    ok(res, { message: 'If an account exists for that email, a reset link has been sent.' });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(20).max(200), password }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      passwordResetTokenHash: sha256(req.body.token),
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpires');
    if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
    user.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    await revokeAllForUser(String(user._id));
    ok(res, { message: 'Password updated. Please sign in.' });
  }),
);

router.post(
  '/change-password',
  authenticate,
  sensitiveLimiter,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: password }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id).select('+passwordHash');
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);
    await user.save();
    await revokeAllForUser(String(user._id));
    const { accessToken } = await startSession({ id: String(user._id), role: user.role }, req, res);
    ok(res, { accessToken, message: 'Password changed' });
  }),
);

export default router;
