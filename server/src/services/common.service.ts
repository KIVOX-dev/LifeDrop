import { Request } from 'express';
import { Types } from 'mongoose';
import { AdminActivityLog, Notification, SystemSetting, User } from '../models';
import { NOTIFICATION_TYPES } from '../models/Notification';
import { env } from '../config/env';
import { queueEmail } from './email.service';

export const clientUrl = (path = '') => `${env.clientOrigins[0].replace(/\/$/, '')}${path}`;

/* ------------------------------- in-app notifications ------------------------------- */
export async function notify(
  user: Types.ObjectId | string,
  type: (typeof NOTIFICATION_TYPES)[number],
  title: string,
  message: string,
  link?: string,
) {
  return Notification.create({ user, type, title, message, link });
}

/* ---------------------------------- audit logging ---------------------------------- */
export async function audit(
  req: Request | { user?: { id: string; role: string }; ip?: string },
  action: string,
  entityType: string,
  entityId?: unknown,
  meta?: Record<string, unknown>,
) {
  if (!req.user) return;
  await AdminActivityLog.create({
    actor: req.user.id,
    actorRole: req.user.role,
    action,
    entityType,
    entityId: entityId ? String(entityId) : undefined,
    meta,
    ip: req.ip,
  });
}

/* ------------------------------------- settings ------------------------------------- */
export const SETTING_DEFAULTS = {
  reminderMonths: 3,
  registrationsOpen: true,
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
  announcement: '',
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings() {
  const rows = await SystemSetting.find().lean();
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in SETTING_DEFAULTS) out[r.key] = r.value;
  return out as { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] extends number ? number : (typeof SETTING_DEFAULTS)[K] extends boolean ? boolean : string };
}

export async function updateSettings(patch: Partial<Record<SettingKey, unknown>>, userId: string) {
  await Promise.all(
    Object.entries(patch)
      .filter(([k]) => k in SETTING_DEFAULTS)
      .map(([key, value]) => SystemSetting.updateOne({ key }, { key, value, updatedBy: userId }, { upsert: true })),
  );
  return getSettings();
}

/* ---------------------------------- admin e-mails ---------------------------------- */
export async function notifyAdmins(title: string, message: string, details: [string, string][] = [], path = '/admin') {
  const admins = await User.find({ role: { $in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, deletedAt: null }).select('email fullName').lean();
  await Promise.all(
    admins.map((a) =>
      queueEmail({ to: a.email, toName: a.fullName, userId: a._id, template: 'ADMIN_NOTIFICATION', data: { title, message, details, url: clientUrl(path) } }),
    ),
  );
}
