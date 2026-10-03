import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessException } from '../errors/business.exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { createValidationPipe } from './validation.pipe.js';
import { IsNotEmpty, IsEmail, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ContactDto {
  @IsEmail()
  email!: string;
}

class CreateThingDto {
  @IsNotEmpty()
  customerId!: string;

  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts!: ContactDto[];
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('writes status and body to the response', () => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };

    filter.catch(new NotFoundException(), host as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ success: false, code: 'NOT_FOUND', message: 'Not Found' });
  });

  it('422: validation errors from the global ValidationPipe become a field → messages map', async () => {
    const pipe = createValidationPipe();
    const error = await pipe
      .transform({ contacts: [{ email: 'nope' }], extra: 1 }, { type: 'body', metatype: CreateThingDto })
      .catch((e: unknown) => e);

    expect(filter.toResponse(error)).toEqual([
      422,
      {
        success: false,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        errors: {
          customerId: ['customerId should not be empty'],
          'contacts.0.email': ['email must be an email'],
          extra: ['property extra should not exist'],
        },
      },
    ]);
  });

  it('422: business rule failure keeps its code', () => {
    const [status, body] = filter.toResponse(new BusinessException('JOB_DOCUMENTS_MISSING', 'Missing documents'));

    expect(status).toBe(422);
    expect(body).toEqual({ success: false, code: 'JOB_DOCUMENTS_MISSING', message: 'Missing documents' });
  });

  it('409: invalid transition', () => {
    const [status, body] = filter.toResponse(
      new BusinessException('JOB_INVALID_TRANSITION', 'Cannot submit a CLOSED job', HttpStatus.CONFLICT),
    );

    expect(status).toBe(409);
    expect(body.code).toBe('JOB_INVALID_TRANSITION');
  });

  it('409: plain Nest ConflictException gets a default code', () => {
    expect(filter.toResponse(new ConflictException('Already exists'))).toEqual([
      409,
      { success: false, code: 'CONFLICT', message: 'Already exists' },
    ]);
  });

  it('409: Prisma unique violation (P2002)', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(filter.toResponse(error)).toEqual([409, { success: false, code: 'DUPLICATE_ENTRY', message: 'Duplicate value' }]);
  });

  it('500: unknown errors are hidden from the client', () => {
    const logged = vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

    expect(filter.toResponse(new Error('password=hunter2 leaked in SQL'))).toEqual([
      500,
      { success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' },
    ]);
    expect(logged).toHaveBeenCalled();
  });
});
