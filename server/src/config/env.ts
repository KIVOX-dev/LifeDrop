import 'dotenv/config';
import { z } from 'zod';

const placeholder = (v?: string) => !v || v.startsWith('YOUR_') || v.includes('REPLACE_WITH');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  API_BASE_URL: z.string().default('http://localhost:5000/api/v1'),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.coerce.number().default(1),

  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().optional(),
  BREVO_SENDER_NAME: z.string().default('LifeDrop'),
  BREVO_WEBHOOK_SECRET: z.string().optional(),

  B2_ENDPOINT: z.string().optional(),
  B2_REGION: z.string().optional(),
  B2_BUCKET_NAME: z.string().optional(),
  B2_KEY_ID: z.string().optional(),
  B2_APPLICATION_KEY: z.string().optional(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),

  QUEUE_REDIS_URL: z.string().default('redis://localhost:6379'),
  RUN_WORKERS: z.enum(['true', 'false']).default('true'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),

  SEED_SUPER_ADMIN_EMAIL: z.string().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n', parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}
const e = parsed.data;

if (e.NODE_ENV === 'production') {
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (placeholder(e[k])) {
      // eslint-disable-next-line no-console
      console.error(`${k} still has a placeholder value. Generate a strong secret.`);
      process.exit(1);
    }
  }
  if (e.JWT_ACCESS_SECRET === e.JWT_REFRESH_SECRET) {
    // eslint-disable-next-line no-console
    console.error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
    process.exit(1);
  }
}

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  clientOrigins: e.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean),
  cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
  integrations: {
    brevo: !placeholder(e.BREVO_API_KEY) && !placeholder(e.BREVO_SENDER_EMAIL),
    b2:
      !placeholder(e.B2_ENDPOINT) &&
      !placeholder(e.B2_BUCKET_NAME) &&
      !placeholder(e.B2_KEY_ID) &&
      !placeholder(e.B2_APPLICATION_KEY),
    groq: !placeholder(e.GROQ_API_KEY) && !placeholder(e.GROQ_MODEL),
  },
};

export type Env = typeof env;
