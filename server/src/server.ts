import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { User } from './models';
import { closeQueues } from './services/queue';
import { logger } from './utils/logger';
import { startWorkers, stopWorkers } from './workers';

/** Creates the first super admin from SEED_SUPER_ADMIN_* when none exists. */
async function ensureSuperAdmin() {
  if (await User.exists({ role: 'SUPER_ADMIN' })) return;
  const { SEED_SUPER_ADMIN_EMAIL: e, SEED_SUPER_ADMIN_PASSWORD: p } = env;
  if (!e || !p || e.startsWith('YOUR_') || p.startsWith('YOUR_')) {
    logger.warn('No SUPER_ADMIN exists. Set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD to create one.');
    return;
  }
  await User.create({ fullName: 'Super Admin', email: e.toLowerCase(), role: 'SUPER_ADMIN', emailVerified: true, passwordHash: await bcrypt.hash(p, 12) });
  logger.info({ email: e }, 'Seeded initial SUPER_ADMIN. Change the password after first login.');
}

async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  await mongoose.syncIndexes();
  logger.info('MongoDB connected');
  await ensureSuperAdmin();

  if (env.RUN_WORKERS === 'true') await startWorkers().catch((e) => logger.error({ err: e.message }, 'workers failed to start (is Redis up?)'));

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`LifeDrop API listening on :${env.PORT}`));

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down gracefully');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close();
    await stopWorkers().catch(() => undefined);
    await closeQueues().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (r) => logger.error({ r: String(r) }, 'unhandledRejection'));
}

main().catch((err) => {
  logger.error({ err: err.message }, 'fatal startup error');
  process.exit(1);
});
