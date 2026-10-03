import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessException, type FieldErrors } from '../errors/business.exception.js';

export interface ErrorBody {
  success: false;
  code: string;
  message: string;
  errors?: FieldErrors;
}

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

/** Converts every error into the single shape from DESIGN §6.1 / spec §30. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toResponse(exception);
    res.status(status).json(body);
  }

  toResponse(exception: unknown): [number, ErrorBody] {
    if (exception instanceof BusinessException) {
      const body: ErrorBody = { success: false, code: exception.code, message: exception.message };
      if (exception.errors) body.errors = exception.errors;
      return [exception.getStatus(), body];
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return [status, { success: false, code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message: messageOf(exception) }];
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return [HttpStatus.CONFLICT, { success: false, code: 'DUPLICATE_ENTRY', message: 'Duplicate value' }];
      }
      if (exception.code === 'P2025') {
        return [HttpStatus.NOT_FOUND, { success: false, code: 'NOT_FOUND', message: 'Record not found' }];
      }
    }

    // Never leak internals to the client; the stack goes to the server log only
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' },
    ];
  }
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' ? message : exception.message;
}
