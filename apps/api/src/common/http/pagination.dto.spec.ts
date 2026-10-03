import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { Paginated, PaginationQueryDto } from './pagination.dto.js';

const parse = (query: Record<string, string>) => {
  const dto = plainToInstance(PaginationQueryDto, query);
  return { dto, errors: validateSync(dto).map((e) => e.property) };
};

describe('PaginationQueryDto', () => {
  it('defaults to page 1 / 20 per page', () => {
    const { dto, errors } = parse({});

    expect(errors).toEqual([]);
    expect({ page: dto.page, perPage: dto.perPage, skip: dto.skip, take: dto.take }).toEqual({
      page: 1,
      perPage: 20,
      skip: 0,
      take: 20,
    });
  });

  it('converts query strings and computes skip', () => {
    const { dto } = parse({ page: '3', perPage: '50' });

    expect(dto.skip).toBe(100);
    expect(dto.take).toBe(50);
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ perPage: '101' }, 'perPage'],
    [{ sort: 'name; DROP TABLE' }, 'sort'],
  ])('rejects %j', (query, field) => {
    expect(parse(query).errors).toEqual([field]);
  });

  it('accepts multi-field sort', () => {
    expect(parse({ sort: '-createdAt,jobNo' }).errors).toEqual([]);
  });
});

describe('Paginated.of', () => {
  it.each([
    [0, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [100, 20, 5],
  ])('total %i / perPage %i → lastPage %i', (total, perPage, lastPage) => {
    expect(Paginated.of([], total, { page: 1, perPage }).meta).toEqual({ page: 1, perPage, total, lastPage });
  });
});
