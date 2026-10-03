import { fileTypeFromBuffer } from 'file-type';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Allowed: extension → expected MIME types (from magic bytes)
const ALLOWED: Record<string, string[]> = {
  pdf:  ['application/pdf'],
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png:  ['image/png'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

export type AllowedExt = keyof typeof ALLOWED;

export type FileValidationResult =
  | { ok: true; ext: string; mime: string }
  | { ok: false; reason: string };

export async function validateFile(
  originalName: string,
  data: Buffer,
): Promise<FileValidationResult> {
  // 1. Size check
  if (data.length > MAX_SIZE_BYTES) {
    return { ok: false, reason: `File size exceeds 10 MB (received ${data.length} bytes)` };
  }

  // 2. Extension check
  const dotIdx = originalName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? originalName.slice(dotIdx + 1).toLowerCase() : '';
  if (!ALLOWED[ext]) {
    return { ok: false, reason: `File extension ".${ext}" is not allowed` };
  }

  // 3. Magic bytes check (DESIGN §8)
  const detected = await fileTypeFromBuffer(data);
  if (!detected) {
    return { ok: false, reason: 'Could not detect file type from content' };
  }
  const allowedMimes = ALLOWED[ext];
  if (!allowedMimes.includes(detected.mime)) {
    return { ok: false, reason: `File content type "${detected.mime}" does not match extension ".${ext}"` };
  }

  return { ok: true, ext, mime: detected.mime };
}
