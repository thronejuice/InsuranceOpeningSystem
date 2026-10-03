import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../prisma/prisma.service.js';
import { businessYear, DOCUMENT_TYPES, formatDocumentNo, type DocumentType } from './document-type.js';

@Injectable()
export class SequenceService {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  /**
   * Atomic upsert (DESIGN §5.2): the row lock taken by ON CONFLICT serialises concurrent callers.
   * Runs on the caller's transaction when there is one, so the number is consumed only if it commits.
   */
  async next(type: DocumentType, now: Date = new Date()): Promise<string> {
    const { prefix, yearly } = DOCUMENT_TYPES[type];
    const year = yearly ? businessYear(now) : 0;

    const rows = await this.txHost.tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO document_sequences (prefix, year, last_value, updated_at)
      VALUES (${prefix}, ${year}, 1, now())
      ON CONFLICT (prefix, year)
      DO UPDATE SET last_value = document_sequences.last_value + 1, updated_at = now()
      RETURNING last_value`;

    return formatDocumentNo(type, year, Number(rows[0].last_value));
  }
}
