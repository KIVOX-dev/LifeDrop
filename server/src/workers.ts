import { Job, UnrecoverableError, Worker } from 'bullmq';
import { BloodRequirement, EmailLog, Reminder } from './models';
import { EMAIL_ATTEMPTS, getConnection, getQueue, QUEUE_NAMES, reminderJobExists, scheduleReminderJob } from './services/queue';
import { PermanentEmailError, processEmailLog, requeueStaleEmails } from './services/email.service';
import { reconcilePoints } from './services/points.service';
import { processReminder } from './services/reminder.service';
import { logger } from './utils/logger';

const workers: Worker[] = [];

/** Background processors: email delivery, reminders and a self-healing maintenance sweep. */
export async function startWorkers() {
  const connection = getConnection();

  workers.push(
    new Worker(
      QUEUE_NAMES.email,
      async (job: Job<{ emailLogId: string }>) => {
        const final = job.attemptsMade + 1 >= (job.opts.attempts ?? EMAIL_ATTEMPTS);
        try {
          return await processEmailLog(job.data.emailLogId, final);
        } catch (err: any) {
          if (err instanceof PermanentEmailError) throw new UnrecoverableError(err.message);
          throw err;
        }
      },
      { connection, concurrency: 5, limiter: { max: 10, duration: 1000 } },
    ),
    new Worker(QUEUE_NAMES.reminders, async (job: Job<{ reminderId: string }>) => processReminder(job.data.reminderId), { connection, concurrency: 3 }),
    new Worker(QUEUE_NAMES.maintenance, async () => maintenanceSweep(), { connection, concurrency: 1 }),
  );
  for (const w of workers) w.on('failed', (job, err) => logger.warn({ queue: w.name, job: job?.id, err: err.message }, 'job failed'));

  // Repeatable job (stored in Redis, deduplicated by its key).
  await getQueue(QUEUE_NAMES.maintenance).upsertJobScheduler('sweep', { every: 15 * 60_000 }, { name: 'sweep' });
  maintenanceSweep().catch((e) => logger.error({ err: e.message }, 'initial sweep failed'));
  logger.info('background workers started');
}

/**
 * MongoDB is the source of truth. If Redis lost data (or a job never got queued) this sweep repairs it:
 *  - re-queues stale emails
 *  - re-creates missing / overdue reminder jobs
 *  - awards points for verified donations whose award was interrupted
 *  - closes requirements whose deadline passed
 */
export async function maintenanceSweep() {
  const requeued = await requeueStaleEmails();
  const now = new Date();

  const due = await Reminder.find({ status: 'SCHEDULED', scheduledFor: { $lte: now } }).limit(200).select('_id');
  for (const r of due) await processReminder(String(r._id)).catch((e) => logger.error({ err: e.message }, 'overdue reminder failed'));

  let rescheduled = 0;
  const upcoming = await Reminder.find({ status: 'SCHEDULED', scheduledFor: { $gt: now } }).limit(1000).select('_id scheduledFor');
  for (const r of upcoming) {
    if (!(await reminderJobExists(String(r._id)))) {
      await scheduleReminderJob(String(r._id), r.scheduledFor);
      rescheduled++;
    }
  }

  const awarded = await reconcilePoints();
  const closed = await BloodRequirement.updateMany({ status: 'PUBLISHED', lastDateToRespond: { $lt: new Date(Date.now() - 24 * 3600_000) } }, { status: 'CLOSED', closedAt: now });
  await EmailLog.updateMany({ status: 'QUEUED', attempts: { $gte: EMAIL_ATTEMPTS } }, { status: 'FAILED' });
  logger.info({ requeued, dueProcessed: due.length, rescheduled, awarded, closed: closed.modifiedCount }, 'maintenance sweep done');
}

export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
