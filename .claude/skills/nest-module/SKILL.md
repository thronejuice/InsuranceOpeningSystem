---
name: nest-module
description: สร้างหรือขยาย NestJS domain module ใน apps/api (Prisma model, migration, DTO, controller, service, repository, permission, audit, tests) ตาม conventions ของโปรเจ็ค ใช้เมื่อเพิ่ม module/entity/CRUD API ใหม่ เช่น customer, master data, quotation, payment
argument-hint: "<module-name> [entity...]"
---

# NestJS Module

สร้าง module ตาม `docs/DESIGN.md` §3–§6 ถ้า action นั้นเปลี่ยน **status** ของ entity ให้ใช้ skill `workflow-action` แทนส่วนนั้น

## ขั้นตอน

### 1. อ่านก่อนเขียน
- spec: หัวข้อ field ของ entity, validation §34, business rules §33 ที่เกี่ยวข้อง
- DESIGN.md §5 (DB conventions), §6 (API), §8 (permissions)
- ดู module ที่มีอยู่แล้ว (เช่น `modules/customer/`) แล้วเลียนแบบ pattern ให้ตรงกัน

### 2. Prisma model
แก้ `apps/api/prisma/schema.prisma`:

```prisma
model Quotation {
  id                 String          @id @default(uuid(7)) @db.Uuid
  quotationNo        String          @unique @map("quotation_no")
  jobId              String          @map("job_id") @db.Uuid
  insuranceCompanyId String          @map("insurance_company_id") @db.Uuid
  quotationDate      DateTime        @map("quotation_date") @db.Date
  validUntil         DateTime        @map("valid_until") @db.Date
  status             QuotationStatus @default(DRAFT)
  grossPremium       Decimal         @default(0) @map("gross_premium") @db.Decimal(15, 2)
  version            Int             @default(1)
  createdById        String          @map("created_by") @db.Uuid
  updatedById        String?         @map("updated_by") @db.Uuid
  createdAt          DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime        @updatedAt @map("updated_at") @db.Timestamptz

  job   Job             @relation(fields: [jobId], references: [id])
  items QuotationItem[]

  @@index([jobId])
  @@index([status])
  @@map("quotations")
}
```

Checklist:
- [ ] เงิน `Decimal(15,2)`, rate `Decimal(9,4)`, วันที่ธุรกิจ `@db.Date`, timestamp `@db.Timestamptz`
- [ ] มี audit columns; master/customer/job มี `deletedAt`; entity ที่มี state มี `version`
- [ ] `@unique` สำหรับเลขเอกสาร และ `@@index` ทุก FK + column ที่ใช้ filter
- [ ] ต้องมี partial index/CHECK หรือไม่: ถ้ามี ให้ใช้ `prisma migrate dev --create-only --name <name>` แล้วเติม SQL (DESIGN §5.3)
- [ ] รัน `npm run db:migrate` แล้วอัปเดต `prisma/seed.ts` ถ้ามี master data/permission ใหม่

### 3. โครงไฟล์

```text
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts
├── <name>.service.ts
├── <name>.repository.ts
├── domain/            ← pure functions: rules, calculations (ถ้ามี)
├── dto/               ← create / update / query / response
└── <name>.service.spec.ts
```

### 4. DTO
```ts
export class CreateQuotationDto {
  @IsUUID() insuranceCompanyId!: string;
  @IsDateString() quotationDate!: string;
  @IsDateString() validUntil!: string;
  @IsOptional() @IsDecimal({ decimal_digits: '0,2' }) grossPremium?: string; // เงินรับเป็น string
  @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items: QuotationItemDto[] = [];
}
export class QuotationQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(QuotationStatus) status?: QuotationStatus;
}
```
- ใส่ decorator ของ Swagger (`@ApiProperty`) เพราะ frontend generate type จากตรงนี้
- Response DTO/mapper ต้องแปลง `Decimal` เป็น string, `@db.Date` เป็น `YYYY-MM-DD` และ mask field อ่อนไหว

### 5. Controller: บาง ๆ เท่านั้น
```ts
@ApiTags('quotations')
@Controller()
export class QuotationController {
  constructor(private readonly service: QuotationService) {}

  @Get('jobs/:jobId/quotations')
  @RequirePermissions('quotation.view')
  list(@Param('jobId', ParseUUIDPipe) jobId: string, @Query() q: QuotationQueryDto) {
    return this.service.list(jobId, q);          // คืน Paginated<T> แล้ว interceptor ห่อให้เอง
  }

  @Post('jobs/:jobId/quotations')
  @RequirePermissions('quotation.create')
  create(@Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: CreateQuotationDto) {
    return this.service.create(jobId, dto);
  }
}
```

### 6. Service: orchestration + transaction
```ts
@Transactional()
async create(jobId: string, dto: CreateQuotationDto) {
  const job = await this.jobs.getAccessibleOrFail(jobId, 'update');   // data scope (BR-014)
  const quotationNo = await this.sequence.next('QT');                   // QT-2026-000001
  const created = await this.repo.create({ ...mapDto(dto), jobId, quotationNo });
  await this.audit.log({ action: 'QUOTATION_ADDED', entityType: 'QUOTATION', entityId: created.id, jobId, newValue: created });
  return toResponse(created);
}
```
- ห้ามเรียก Prisma ใน service ให้เรียกผ่าน repository ซึ่งใช้ `this.txHost.tx`
- Business rule ที่ไม่ผ่าน → `throw new BusinessException('<CODE>', '<message>', 422|409, errors?)`
- คำนวณเงินด้วย `Prisma.Decimal` เท่านั้น
- Transaction สำคัญ (spec §22.1 list) ต้อง `audit.log` ภายใน transaction เดียวกัน

### 7. Tests (ขั้นต่ำ)
- [ ] Unit: ทุก function ใน `domain/`
- [ ] e2e (`apps/api/test/<name>.e2e-spec.ts`): happy path, 422 validation, 403 permission, 404, 409 duplicate (ถ้ามี unique)
- [ ] ถ้ามี soft delete: ลบแล้วต้องไม่เห็นใน list

### 8. ปิดงาน
- [ ] `npm run lint && npm run test -w apps/api && npm run test:e2e -w apps/api`
- [ ] เปิด `/api/docs` ดูว่า endpoint + schema ถูกต้อง
- [ ] `npm run gen:api` ให้ frontend ได้ type ใหม่
