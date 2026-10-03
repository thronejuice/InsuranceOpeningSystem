import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CustomerModel as Customer,
  CustomerAddressModel as CustomerAddress,
  CustomerContactModel as CustomerContact,
} from '../../../generated/prisma/models.js';
import { AddressType, CustomerStatus, CustomerType } from '../../../generated/prisma/enums.js';
import { maskThaiId } from '../domain/thai-id.validator.js';

export class AddressResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AddressType }) addressType!: AddressType;
  @ApiProperty() addressLine!: string;
  @ApiPropertyOptional() subDistrict?: string | null;
  @ApiPropertyOptional() district?: string | null;
  @ApiPropertyOptional() province?: string | null;
  @ApiPropertyOptional() postalCode?: string | null;
  @ApiPropertyOptional() country?: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ContactResponse {
  @ApiProperty() id!: string;
  @ApiProperty() contactName!: string;
  @ApiPropertyOptional() position?: string | null;
  @ApiPropertyOptional() department?: string | null;
  @ApiPropertyOptional() phone?: string | null;
  @ApiPropertyOptional() mobile?: string | null;
  @ApiPropertyOptional() email?: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class CustomerResponse {
  @ApiProperty() id!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty({ enum: CustomerType }) customerType!: CustomerType;
  @ApiPropertyOptional() firstName?: string | null;
  @ApiPropertyOptional() lastName?: string | null;
  @ApiPropertyOptional() companyName?: string | null;
  /** Masked unless the caller has `customer.view_sensitive` */
  @ApiPropertyOptional() citizenId?: string | null;
  /** Masked unless the caller has `customer.view_sensitive` */
  @ApiPropertyOptional() taxId?: string | null;
  @ApiPropertyOptional() phone?: string | null;
  @ApiPropertyOptional() mobile?: string | null;
  @ApiPropertyOptional() email?: string | null;
  @ApiProperty({ enum: CustomerStatus }) status!: CustomerStatus;
  @ApiPropertyOptional() remark?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiPropertyOptional({ type: [AddressResponse] }) addresses?: AddressResponse[];
  @ApiPropertyOptional({ type: [ContactResponse] }) contacts?: ContactResponse[];
}

type CustomerWithRelations = Customer & {
  addresses?: CustomerAddress[];
  contacts?: CustomerContact[];
};

function toAddressResponse(a: CustomerAddress): AddressResponse {
  return {
    id: a.id,
    addressType: a.addressType,
    addressLine: a.addressLine,
    subDistrict: a.subDistrict,
    district: a.district,
    province: a.province,
    postalCode: a.postalCode,
    country: a.country,
    isPrimary: a.isPrimary,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function toContactResponse(c: CustomerContact): ContactResponse {
  return {
    id: c.id,
    contactName: c.contactName,
    position: c.position,
    department: c.department,
    phone: c.phone,
    mobile: c.mobile,
    email: c.email,
    isPrimary: c.isPrimary,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toCustomerResponse(c: CustomerWithRelations, viewSensitive = false): CustomerResponse {
  return {
    id: c.id,
    customerCode: c.customerCode,
    customerType: c.customerType,
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.companyName,
    citizenId: c.citizenId ? (viewSensitive ? c.citizenId : maskThaiId(c.citizenId)) : null,
    taxId: c.taxId ? (viewSensitive ? c.taxId : maskThaiId(c.taxId)) : null,
    phone: c.phone,
    mobile: c.mobile,
    email: c.email,
    status: c.status,
    remark: c.remark,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    addresses: c.addresses?.map(toAddressResponse),
    contacts: c.contacts?.map(toContactResponse),
  };
}
