import crypto from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { ApiError } from '../utils/common';
import { logger } from '../utils/logger';

/** Backblaze B2 via the S3-compatible API. The bucket must be PRIVATE. */
let client: S3Client | null = null;

const getClient = () => {
  if (!env.integrations.b2) throw ApiError.unavailable('File storage (Backblaze B2) is not configured');
  if (!client) {
    client = new S3Client({
      endpoint: env.B2_ENDPOINT!.startsWith('http') ? env.B2_ENDPOINT : `https://${env.B2_ENDPOINT}`,
      region: env.B2_REGION || 'us-west-004',
      credentials: { accessKeyId: env.B2_KEY_ID!, secretAccessKey: env.B2_APPLICATION_KEY! },
      forcePathStyle: true,
      // B2 does not support the newer default checksum behaviour of the AWS SDK.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
};

export const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Unguessable object key. Never contains user identifiers or the original filename. */
export const randomKey = (prefix: 'certificates' | 'avatars', mime: string) =>
  `${prefix}/${crypto.randomBytes(24).toString('hex')}.${EXT_BY_MIME[mime] ?? 'bin'}`;

export const storage = {
  async upload(key: string, body: Buffer, contentType: string) {
    try {
      await getClient().send(
        new PutObjectCommand({
          Bucket: env.B2_BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: undefined,
        }),
      );
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      logger.error({ err: err.message, key }, 'B2 upload failed');
      throw new ApiError(502, 'Failed to store the file. Please try again.', 'STORAGE_ERROR');
    }
  },

  /** Short-lived signed URL (default 5 minutes). */
  async signedUrl(key: string, opts: { filename?: string; inline?: boolean; expiresIn?: number } = {}) {
    const safeName = (opts.filename ?? 'certificate').replace(/[^\w.\- ]/g, '_').slice(0, 100);
    const url = await getSignedUrl(
      getClient(),
      new GetObjectCommand({
        Bucket: env.B2_BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: `${opts.inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      }),
      { expiresIn: opts.expiresIn ?? 300 },
    );
    return { url, expiresIn: opts.expiresIn ?? 300 };
  },

  /** Retrieve the object bytes (used for server-side processing). */
  async get(key: string) {
    try {
      const res = await getClient().send(new GetObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      logger.error({ err: err.message, key }, 'B2 get failed');
      throw new ApiError(502, 'Failed to retrieve the file', 'STORAGE_ERROR');
    }
  },

  async remove(key: string) {
    try {
      await getClient().send(new DeleteObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: key }));
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      logger.error({ err: err.message, key }, 'B2 delete failed');
      throw new ApiError(502, 'Failed to delete the file', 'STORAGE_ERROR');
    }
  },
};
