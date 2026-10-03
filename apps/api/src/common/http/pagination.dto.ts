import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const MAX_PER_PAGE = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: MAX_PER_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  perPage: number = 20;

  /** Comma-separated fields, `-` prefix for descending, e.g. `-createdAt,jobNo` */
  @ApiPropertyOptional({ example: '-createdAt' })
  @IsOptional()
  @Matches(/^-?[A-Za-z]\w*(,-?[A-Za-z]\w*)*$/, { message: 'sort must look like "-createdAt,name"' })
  sort?: string;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  get skip(): number {
    return (this.page - 1) * this.perPage;
  }

  get take(): number {
    return this.perPage;
  }
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}

/** Return this from a service; ResponseInterceptor turns it into `{ success, data, meta }`. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta,
  ) {}

  static of<T>(items: T[], total: number, query: Pick<PaginationQueryDto, 'page' | 'perPage'>): Paginated<T> {
    return new Paginated(items, {
      page: query.page,
      perPage: query.perPage,
      total,
      lastPage: Math.max(1, Math.ceil(total / query.perPage)),
    });
  }
}
