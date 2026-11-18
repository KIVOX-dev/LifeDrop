import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/lifedrop-test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-1234';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-5678';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.API_BASE_URL = 'http://localhost:5000/api/v1';
process.env.BREVO_API_KEY = 'xkeysib-test';
process.env.BREVO_SENDER_EMAIL = 'noreply@lifedrop.test';
process.env.BREVO_WEBHOOK_SECRET = 'webhook-secret-for-tests';
process.env.B2_ENDPOINT = 'https://s3.us-west-004.backblazeb2.com';
process.env.B2_REGION = 'us-west-004';
process.env.B2_BUCKET_NAME = 'lifedrop-test';
process.env.B2_KEY_ID = 'test-key-id';
process.env.B2_APPLICATION_KEY = 'test-app-key';
process.env.GROQ_API_KEY = 'gsk_test';
process.env.GROQ_MODEL = 'test-model';
process.env.APP_TIMEZONE = 'Asia/Kolkata';
process.env.RUN_WORKERS = 'false';

// Queue: no Redis in unit tests. Calls are recorded so tests can assert on them.
vi.mock('../src/services/queue', () => ({
  QUEUE_NAMES: { email: 'e', reminders: 'r', maintenance: 'm' },
  EMAIL_ATTEMPTS: 5,
  getConnection: vi.fn(),
  getQueue: vi.fn(),
  enqueueEmailJob: vi.fn(async () => undefined),
  scheduleReminderJob: vi.fn(async () => undefined),
  removeReminderJob: vi.fn(async () => undefined),
  reminderJobExists: vi.fn(async () => true),
  closeQueues: vi.fn(async () => undefined),
}));

// Storage: in-memory object store replacing Backblaze B2.
vi.mock('../src/services/storage.service', async (orig) => {
  const actual = await orig<typeof import('../src/services/storage.service')>();
  const objects = new Map<string, { body: Buffer; type: string }>();
  return {
    ...actual,
    __objects: objects,
    storage: {
      upload: vi.fn(async (key: string, body: Buffer, type: string) => void objects.set(key, { body, type })),
      signedUrl: vi.fn(async (key: string) => ({ url: `https://b2.test/${key}?X-Amz-Signature=abc`, expiresIn: 300 })),
      get: vi.fn(async (key: string) => objects.get(key)!.body),
      remove: vi.fn(async (key: string) => void objects.delete(key)),
    },
  };
});
