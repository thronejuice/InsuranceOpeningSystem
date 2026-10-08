import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class ProposalRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  private static readonly INCLUDE = {
    approvals: { orderBy: { createdAt: 'asc' as const } },
    paymentTerm: true,
    acceptances: {
      include: {
        evidenceFile: {
          select: {
            id: true,
            originalName: true,
            storedName: true,
            mimeType: true,
            size: true,
          },
        },
        recordedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    },
  } as const;

  findByJob(jobId: string) {
    return this.db.proposal.findMany({
      where: { jobId },
      include: ProposalRepository.INCLUDE,
      orderBy: { version: 'desc' },
    });
  }

  findById(id: string) {
    return this.db.proposal.findFirst({
      where: { id },
      include: ProposalRepository.INCLUDE,
    });
  }

  findMaxVersionByJob(jobId: string) {
    return this.db.proposal.findFirst({
      where: { jobId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
  }

  findLatestByJob(jobId: string) {
    return this.db.proposal.findFirst({
      where: { jobId },
      include: ProposalRepository.INCLUDE,
      orderBy: { version: 'desc' },
    });
  }

  findOutdated(date: Date) {
    return this.db.proposal.findMany({
      where: {
        status: { in: ['DRAFT', 'SENT', 'VIEWED'] },
        validUntil: { lt: date },
      },
      include: {
        job: { select: { id: true, jobNo: true, agentId: true, brokerStaffId: true, status: true } },
      },
    });
  }

  create(data: Prisma.ProposalCreateInput) {
    return this.db.proposal.create({ data, include: ProposalRepository.INCLUDE });
  }

  update(id: string, data: Prisma.ProposalUpdateInput) {
    return this.db.proposal.update({ where: { id }, data, include: ProposalRepository.INCLUDE });
  }
}
