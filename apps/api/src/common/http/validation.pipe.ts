import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { BusinessException, type FieldErrors } from '../errors/business.exception.js';

/** Flattens nested errors into `{ "contacts.0.email": ["..."] }` so the web can map them onto form controls. */
export function toFieldErrors(errors: ValidationError[], parent = ''): FieldErrors {
  const result: FieldErrors = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      result[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(result, toFieldErrors(error.children, path));
    }
  }
  return result;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BusinessException(
        'VALIDATION_FAILED',
        'Validation failed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        toFieldErrors(errors),
      ),
  });
}
