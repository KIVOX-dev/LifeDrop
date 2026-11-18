import multer from 'multer';
import { ApiError, sha256 } from '../utils/common';
import { RequestHandler } from 'express';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

/** Detect the real type from magic bytes - the client-supplied MIME type is never trusted alone. */
export const sniffMime = (b: Buffer): string | null => {
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
};

const base = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED[file.mimetype]) return cb(ApiError.badRequest('Only PDF, JPG, JPEG and PNG files are allowed'));
    if (!ALLOWED[file.mimetype].includes(ext)) return cb(ApiError.badRequest('File extension does not match its type'));
    cb(null, true);
  },
});

export interface ValidatedFile {
  buffer: Buffer;
  mimeType: string;
  size: number;
  originalName: string;
  hash: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    validatedFile?: ValidatedFile;
  }
}

/** Multer + magic-byte validation. `allowPdf=false` restricts to images (avatars). */
export const uploadSingle = (field: string, opts: { allowPdf?: boolean } = { allowPdf: true }): RequestHandler[] => [
  (req, res, next) =>
    base.single(field)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return next(
          err.code === 'LIMIT_FILE_SIZE'
            ? ApiError.badRequest(`File too large. Maximum size is ${MAX_FILE_BYTES / 1024 / 1024} MB`)
            : ApiError.badRequest(err.message),
        );
      }
      next(err);
    }),
  (req, _res, next) => {
    const f = req.file;
    if (!f) return next(ApiError.badRequest('A file is required'));
    if (f.size === 0) return next(ApiError.badRequest('The file is empty'));
    const real = sniffMime(f.buffer);
    if (!real || real !== f.mimetype) return next(ApiError.badRequest('File content does not match its declared type'));
    if (opts.allowPdf === false && real === 'application/pdf') return next(ApiError.badRequest('Only JPG or PNG images are allowed'));
    req.validatedFile = {
      buffer: f.buffer,
      mimeType: real,
      size: f.size,
      originalName: f.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 200),
      hash: sha256(f.buffer),
    };
    next();
  },
];
