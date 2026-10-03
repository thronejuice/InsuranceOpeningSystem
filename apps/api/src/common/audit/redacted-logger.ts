import { ConsoleLogger } from '@nestjs/common';

// Matches JSON key–value pairs where the key is sensitive (password, token, secret, citizenId, taxId, authorization)
const SENSITIVE_JSON_PAIR = /"(password|token|secret|citizenid|taxid|authorization)":\s*"[^"]*"/gi;

/**
 * Drop-in replacement for NestJS's default ConsoleLogger.
 * Scrubs sensitive values from log messages before they reach stdout/stderr.
 * Works on both plain strings and serialised JSON fragments that appear in
 * error stacks or debug dumps (e.g. Prisma query logs, request body traces).
 *
 * Registered in main.ts via `app.useLogger(new RedactedLogger())`.
 */
export class RedactedLogger extends ConsoleLogger {
  private mask(msg: unknown): unknown {
    if (typeof msg !== 'string') return msg;
    return msg.replace(SENSITIVE_JSON_PAIR, (_, key: string) => `"${key}":"[REDACTED]"`);
  }

  override log(message: unknown, ...rest: unknown[]): void {
    super.log(this.mask(message), ...rest);
  }

  override error(message: unknown, ...rest: unknown[]): void {
    super.error(this.mask(message), ...rest);
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(this.mask(message), ...rest);
  }

  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(this.mask(message), ...rest);
  }

  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(this.mask(message), ...rest);
  }
}
