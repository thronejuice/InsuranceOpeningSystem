import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Paginated } from './pagination.dto.js';

/** Wraps every controller result in the envelope from DESIGN §6.1. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        if (body instanceof StreamableFile) return body;
        if (body instanceof Paginated) {
          return { success: true, data: body.items, meta: body.meta };
        }
        return { success: true, data: body ?? null, message: 'Success' };
      }),
    );
  }
}
