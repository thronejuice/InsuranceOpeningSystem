import { HttpException, HttpStatus } from '@nestjs/common';

export type FieldErrors = Record<string, string[]>;

/**
 * Error carrying a machine-readable `code` (DESIGN §6.2).
 * Defaults to 422 because most business-rule failures are "request understood but not allowed".
 */
export class BusinessException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly errors?: FieldErrors,
  ) {
    super({ code, message, errors }, status);
  }
}
