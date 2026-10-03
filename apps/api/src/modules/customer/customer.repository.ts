import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

const withRelations = { addresses: true, contacts: true } as const;

@Injectable()
export class CustomerRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() {
    return this.txHost.tx;
  }

  findAll(where: Prisma.CustomerWhereInput, orderBy: Prisma.CustomerOrderByWithRelationInput[], skip: number, take: number) {
    return Promise.all([
      this.db.customer.findMany({ where, orderBy, skip, take, include: withRelations }),
      this.db.customer.count({ where }),
    ]);
  }

  findById(id: string) {
    return this.db.customer.findFirst({ where: { id, deletedAt: null }, include: withRelations });
  }

  findByCode(customerCode: string) {
    return this.db.customer.findFirst({ where: { customerCode, deletedAt: null } });
  }

  create(data: Prisma.CustomerCreateInput) {
    return this.db.customer.create({ data, include: withRelations });
  }

  update(id: string, data: Prisma.CustomerUpdateInput) {
    return this.db.customer.update({ where: { id }, data, include: withRelations });
  }

  softDelete(id: string, updatedById: string | undefined) {
    return this.db.customer.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById },
    });
  }

  deleteAddresses(customerId: string) {
    return this.db.customerAddress.deleteMany({ where: { customerId } });
  }

  deleteContacts(customerId: string) {
    return this.db.customerContact.deleteMany({ where: { customerId } });
  }
}
