import type { Response } from 'express';

/** Streams a generated PDF as a download; never cached since it reflects live data. */
export function sendPdf(res: Response, pdf: { buffer: Buffer; fileName: string }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(pdf.fileName)}`);
  res.setHeader('Content-Length', pdf.buffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(pdf.buffer);
}
