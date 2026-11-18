import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Persistent job queue (BullMQ on Redis, AOF enabled in docker-compose).
 * MongoDB remains the source of truth: EmailLog and Reminder documents are re-queued
 * by the maintenance sweep if Redis ever loses state.
 */
export const QUEUE_NAMES = {
  email: 'lifedrop-email',
  reminders: 'lifedrop-reminders',
  maintenance: 'lifedrop-maintenance',
} as const;

let connection: IORedis | null = null;
const queues = new Map<string, Queue>();

export const getConnection = () => {
  if (!connection) {
    connection = new IORedis(env.QUEUE_REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
    connection.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
  }
  return connection;
};

export const getQueue = (name: string) => {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() });
    queues.set(name, q);
  }
  return q;
};

export const EMAIL_ATTEMPTS = 5;

export async function enqueueEmailJob(emailLogId: string) {
  await getQueue(QUEUE_NAMES.email).add(
    'send',
    { emailLogId },
    {
      // jobId makes enqueueing idempotent per EmailLog.
      jobId: `email-${emailLogId}`,
      attempts: EMAIL_ATTEMPTS,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 5000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  );
}

const reminderJobId = (id: string) => `reminder-${id}`;

export async function scheduleReminderJob(reminderId: string, runAt: Date) {
  const q = getQueue(QUEUE_NAMES.reminders);
  await removeReminderJob(reminderId);
  await q.add(
    'followup',
    { reminderId },
    {
      jobId: reminderJobId(reminderId),
      delay: Math.max(0, runAt.getTime() - Date.now()),
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  );
}

export async function removeReminderJob(reminderId: string) {
  const job = await getQueue(QUEUE_NAMES.reminders).getJob(reminderJobId(reminderId));
  if (job) await job.remove().catch(() => undefined);
}

export async function reminderJobExists(reminderId: string) {
  return !!(await getQueue(QUEUE_NAMES.reminders).getJob(reminderJobId(reminderId)));
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (connection) {
    await connection.quit().catch(() => undefined);
    connection = null;
  }
}
