import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import { CustomerType } from '../../generated/prisma/enums.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { Paginated } from '../../common/http/pagination.dto.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { CustomerRepository } from './customer.repository.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { CustomerQueryDto } from './dto/customer-query.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { toCustomerResponse, type CustomerResponse } from './dto/customer-response.dto.js';

@Injectable()
export class CustomerService {
  constructor(
    private readonly repo: CustomerRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(query: CustomerQueryDto, viewSensitive: boolean): Promise<Paginated<CustomerResponse>> {
    const search = query.q?.trim();

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(query.customerType ? { customerType: query.customerType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { customerCode: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { mobile: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy = this.buildOrderBy(query.sort);
    const [items, total] = await this.repo.findAll(where, orderBy, query.skip, query.take);

    return Paginated.of(
      items.map((c) => toCustomerResponse(c, viewSensitive)),
      total,
      query,
    );
  }

  async findOne(id: string, viewSensitive: boolean): Promise<CustomerResponse> {
    const customer = await this.repo.findById(id);
    if (!customer) throw new BusinessException('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    return toCustomerResponse(customer, viewSensitive);
  }

  @Transactional()
  async create(dto: CreateCustomerDto, viewSensitive: boolean): Promise<CustomerResponse> {
    this.assertRequiredNameFields(dto);

    const customerCode = await this.sequence.next('CUSTOMER');
    const userId = this.cls.get('userId');

    const customer = await this.repo.create({
      customerCode,
      customerType: dto.customerType,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      citizenId: dto.citizenId,
      taxId: dto.taxId,
      phone: dto.phone,
      mobile: dto.mobile,
      email: dto.email,
      remark: dto.remark,
      createdById: userId,
      updatedById: userId,
      addresses: dto.addresses?.length
        ? { create: dto.addresses.map((a) => ({ ...a })) }
        : undefined,
      contacts: dto.contacts?.length
        ? { create: dto.contacts.map((c) => ({ ...c })) }
        : undefined,
    });

    await this.audit.log({
      action: 'CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      newValue: { customerCode: customer.customerCode, customerType: customer.customerType },
    });

    return toCustomerResponse(customer, viewSensitive);
  }

  @Transactional()
  async update(id: string, dto: UpdateCustomerDto, viewSensitive: boolean): Promise<CustomerResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new BusinessException('CUSTOMER_NOT_FOUND', 'Customer not found', 404);

    // Validate name fields for the (possibly updated) type
    const effectiveType = dto.customerType ?? existing.customerType;
    if (effectiveType === CustomerType.INDIVIDUAL) {
      const firstName = dto.firstName ?? existing.firstName;
      const lastName = dto.lastName ?? existing.lastName;
      if (!firstName || !lastName) {
        throw new BusinessException('VALIDATION_ERROR', 'Validation failed', 422, {
          firstName: firstName ? [] : ['firstName is required for INDIVIDUAL'],
          lastName: lastName ? [] : ['lastName is required for INDIVIDUAL'],
        });
      }
    } else {
      const companyName = dto.companyName ?? existing.companyName;
      if (!companyName) {
        throw new BusinessException('VALIDATION_ERROR', 'Validation failed', 422, {
          companyName: ['companyName is required for CORPORATE'],
        });
      }
    }

    const userId = this.cls.get('userId');
    const oldValue = { customerType: existing.customerType, status: existing.status };

    const updateData: Prisma.CustomerUpdateInput = {
      customerType: dto.customerType,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      citizenId: dto.citizenId,
      taxId: dto.taxId,
      phone: dto.phone,
      mobile: dto.mobile,
      email: dto.email,
      remark: dto.remark,
      updatedById: userId,
    };

    // Replace nested relations if provided
    if (dto.addresses !== undefined) {
      await this.repo.deleteAddresses(id);
      updateData.addresses = dto.addresses.length
        ? { create: dto.addresses.map((a) => ({ ...a })) }
        : undefined;
    }
    if (dto.contacts !== undefined) {
      await this.repo.deleteContacts(id);
      updateData.contacts = dto.contacts.length
        ? { create: dto.contacts.map((c) => ({ ...c })) }
        : undefined;
    }

    const updated = await this.repo.update(id, updateData);

    await this.audit.log({
      action: 'CUSTOMER_UPDATED',
      entityType: 'CUSTOMER',
      entityId: id,
      oldValue,
      newValue: { customerType: updated.customerType, status: updated.status },
    });

    return toCustomerResponse(updated, viewSensitive);
  }

  @Transactional()
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new BusinessException('CUSTOMER_NOT_FOUND', 'Customer not found', 404);

    const userId = this.cls.get('userId');
    await this.repo.softDelete(id, userId);

    await this.audit.log({
      action: 'CUSTOMER_DELETED',
      entityType: 'CUSTOMER',
      entityId: id,
      oldValue: { customerCode: existing.customerCode, status: existing.status },
    });
  }

  private assertRequiredNameFields(dto: CreateCustomerDto): void {
    if (dto.customerType === CustomerType.INDIVIDUAL) {
      if (!dto.firstName || !dto.lastName) {
        throw new BusinessException('VALIDATION_ERROR', 'Validation failed', 422, {
          ...(dto.firstName ? {} : { firstName: ['firstName is required for INDIVIDUAL'] }),
          ...(dto.lastName ? {} : { lastName: ['lastName is required for INDIVIDUAL'] }),
        });
      }
    } else {
      if (!dto.companyName) {
        throw new BusinessException('VALIDATION_ERROR', 'Validation failed', 422, {
          companyName: ['companyName is required for CORPORATE'],
        });
      }
    }
  }

  private buildOrderBy(sort?: string): Prisma.CustomerOrderByWithRelationInput[] {
    if (!sort) return [{ createdAt: 'desc' }];
    return sort.split(',').map((field) => {
      const desc = field.startsWith('-');
      const name = desc ? field.slice(1) : field;
      const dir: 'asc' | 'desc' = desc ? 'desc' : 'asc';
      const allowed: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
        customerCode: { customerCode: dir },
        firstName: { firstName: dir },
        lastName: { lastName: dir },
        companyName: { companyName: dir },
        email: { email: dir },
        status: { status: dir },
        createdAt: { createdAt: dir },
        updatedAt: { updatedAt: dir },
      };
      return allowed[name] ?? { createdAt: 'desc' };
    });
  }
}
