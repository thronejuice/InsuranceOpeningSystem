import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

export interface CustomerAddress {
  id: string;
  addressType: 'HOME' | 'OFFICE' | 'BILLING' | 'SHIPPING' | 'OTHER';
  addressLine: string;
  subDistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerContact {
  id: string;
  contactName: string;
  position?: string | null;
  department?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  customerCode: string;
  customerType: 'INDIVIDUAL' | 'CORPORATE';
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  citizenId?: string | null;
  taxId?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
  addresses?: CustomerAddress[];
  contacts?: CustomerContact[];
}

export interface CreateAddressDto {
  addressType: 'HOME' | 'OFFICE' | 'BILLING' | 'SHIPPING' | 'OTHER';
  addressLine: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  isPrimary?: boolean;
}

export interface CreateContactDto {
  contactName: string;
  position?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface CreateCustomerDto {
  customerType: 'INDIVIDUAL' | 'CORPORATE';
  firstName?: string;
  lastName?: string;
  companyName?: string;
  citizenId?: string;
  taxId?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  remark?: string;
  addresses?: CreateAddressDto[];
  contacts?: CreateContactDto[];
}

export type UpdateCustomerDto = Partial<CreateCustomerDto>;

export interface CustomerQuery {
  page?: number;
  perPage?: number;
  sort?: string;
  q?: string;
  customerType?: 'INDIVIDUAL' | 'CORPORATE';
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}

interface ListResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
}

interface ItemResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  list(query: CustomerQuery): Observable<ListResponse<Customer>> {
    let params = new HttpParams();
    if (query.page != null) params = params.set('page', query.page);
    if (query.perPage != null) params = params.set('perPage', query.perPage);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.q) params = params.set('q', query.q);
    if (query.customerType) params = params.set('customerType', query.customerType);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<ListResponse<Customer>>('/api/customers', { params });
  }

  get(id: string): Observable<Customer> {
    return this.http
      .get<ItemResponse<Customer>>(`/api/customers/${id}`)
      .pipe(map((r) => r.data));
  }

  create(body: CreateCustomerDto): Observable<Customer> {
    return this.http
      .post<ItemResponse<Customer>>('/api/customers', body)
      .pipe(map((r) => r.data));
  }

  update(id: string, body: UpdateCustomerDto): Observable<Customer> {
    return this.http
      .put<ItemResponse<Customer>>(`/api/customers/${id}`, body)
      .pipe(map((r) => r.data));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/customers/${id}`);
  }
}
