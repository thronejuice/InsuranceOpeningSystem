# Technical Design — Insurance Opening System V1

> อ้างอิง: [Insurance_Opening_System_V1.md](../Insurance_Opening_System_V1.md) (Functional Spec), [Architecture.md](../Architecture.md)
> เอกสารนี้คือ "ตัดสินใจแล้ว" ด้านเทคนิค — ถ้าจะเปลี่ยน ให้แก้ที่นี่ก่อนแล้วค่อยแก้โค้ด
> หัวข้อที่ยังรอคำตอบธุรกิจอยู่ใน [PLAN.md → Open Questions](PLAN.md#open-questions)

---

## 1. Stack

| Layer | เลือกใช้ | เหตุผล |
|---|---|---|
| Runtime | Node.js 22 LTS | ใช้ TypeScript ทั้ง stack |
| Backend | NestJS 12 | Module/DI ตรงกับ Modular Monolith ใน spec §48 (ปรับจาก 11 → 12 ตาม `@nestjs/cli@latest` ณ วันที่ scaffold Day 1, ดู Log 2026-09-26) |
| Module system (API) | ESM (`"type": "module"`) | ค่า default ของ `@nestjs/cli@latest`; import ต้องมี extension `.js` ตาม Node ESM |
| ORM | Prisma 6 | Type-safe, migration ดี, รองรับ `Decimal` |
| Transaction | `nestjs-cls` + `@nestjs-cls/transactional` (Prisma adapter) | ใช้ `@Transactional()` ได้ ไม่ต้องส่ง `tx` ต่อกันเองทุกชั้น |
| Validation | `class-validator` + `class-transformer` | มาตรฐานของ NestJS |
| Auth | JWT access token (15 นาที) + refresh token (7 วัน, httpOnly cookie, rotate ทุกครั้ง) | ตาม spec §35 |
| Password | `argon2` | |
| Rate limit | `@nestjs/throttler` | ใช้กับ Login |
| API Docs | `@nestjs/swagger` → `/api/docs` | ใช้ generate type ให้ Frontend ด้วย |
| DB | PostgreSQL 16 | |
| Queue/Cron | Redis 7 + BullMQ (`@nestjs/bullmq`) | ใช้ตอน Renewal/Notification (Phase 6) |
| File Storage | `StorageService` interface → driver `local` (dev) / `s3` (prod, MinIO/S3) | |
| Excel | `exceljs` | |
| Frontend | Angular (latest stable), Standalone Components, Signals | |
| UI Kit | PrimeNG | มี Table (lazy paging/filter), DatePicker, FileUpload, Tabs, Timeline ครบ |
| API Types (FE) | `openapi-typescript` generate จาก `/api/docs-json` | FE/BE ใช้ contract เดียวกัน |
| Test | **vitest** (API unit + e2e ด้วย supertest — เปลี่ยนจาก Jest ตาม default ของ `@nestjs/cli@latest`), test runner default ของ Angular CLI, Playwright (E2E) | |
| Lint (API) | **oxlint** (เปลี่ยนจาก ESLint ตาม default ของ `@nestjs/cli@latest`) + Prettier | |
| Lint (Web) | ESLint (`@angular-eslint`) + Prettier | |
| Dev infra | Docker Compose: postgres, redis, mailpit | |

---

## 2. Repository Layout

```text
InsuranceOpening_System/
├── CLAUDE.md
├── Architecture.md
├── Insurance_Opening_System_V1.md
├── docs/
│   ├── DESIGN.md          ← ไฟล์นี้
│   └── PLAN.md            ← แผนรายวัน + Log
├── docker-compose.yml
├── .env.example
├── package.json           ← npm workspaces + scripts รวม
├── apps/
│   ├── api/               ← NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/     ← cross-cutting (ดู §4)
│   │   │   └── modules/    ← domain modules (ดู §3)
│   │   └── test/           ← e2e (supertest)
│   └── web/               ← Angular
│       └── src/app/
│           ├── core/       ← auth, http interceptors, guards, api types
│           ├── shared/     ← UI components, pipes, directives
│           ├── layout/     ← shell (sidebar/topbar)
│           └── features/   ← หนึ่งโฟลเดอร์ต่อหนึ่ง feature (ดู §9)
└── e2e/                   ← Playwright (เริ่มที่ spec acceptance-flow V1; เพิ่ม flow ย่อยต่อ V2 Phase ตอนจบ Phase นั้น)
```

---

## 3. Backend Modules (Modular Monolith)

```text
modules/
├── auth/          login, refresh, logout, me
├── user/          users, roles, permissions (user.manage)
├── customer/      customers, contacts, addresses
├── master/        insurance types, products, companies, coverages,
│                  risk field definitions, document checklists, approval rules
├── job/           jobs, status machine, assign, risk, coverage, status history
├── document/      upload/download, version, checklist status, verify/reject (V2)
├── underwriting/  request-review, review/approve/require-info/reject, resume (V2)
├── quotation/     quotations, items, comparison, select
├── proposal/      proposal, send, accept/reject
├── approval/      approval requests, rule evaluation
├── policy/        binding, policy, policy coverages
├── payment/
├── commission/
├── task/
├── renewal/
├── notification/
├── dashboard/     read-only aggregates
└── report/        excel import/export
```

### 3.1 โครงสร้างภายใน 1 Module

```text
modules/job/
├── job.module.ts
├── job.controller.ts        ← HTTP เท่านั้น: รับ DTO → เรียก service → return
├── job.service.ts           ← Application service: orchestration + @Transactional()
├── job.repository.ts        ← Prisma query ทั้งหมดอยู่ที่นี่
├── job-workflow.service.ts  ← (เฉพาะ module ที่มี state) transition + history + audit
├── domain/
│   ├── job-status.ts        ← state machine (pure function, ไม่มี DI)
│   ├── job.rules.ts         ← business rules (pure function)
│   └── job-status.spec.ts
├── dto/
│   ├── create-job.dto.ts
│   ├── update-job.dto.ts
│   ├── job-query.dto.ts     ← extends PaginationQueryDto
│   └── job.response.ts      ← shape ที่ส่งออก (ไม่ return Prisma model ตรง ๆ)
└── job.service.spec.ts
```

กฎ (ตาม spec §40):
- Controller **ห้าม** มี business logic และห้ามเรียก Prisma
- Business rule เขียนเป็น **pure function** ใน `domain/` → unit test ง่าย ไม่ต้อง mock DB
- Module อื่นเรียกกันผ่าน **exported service** เท่านั้น ห้าม import repository ข้าม module

---

## 4. Cross-cutting (`src/common/`)

| ส่วน | หน้าที่ |
|---|---|
| `prisma/` | `PrismaService`, ลงทะเบียน `ClsModule` + `TransactionalAdapterPrisma` |
| `config/` | โหลด + validate `.env` ตอน boot (ไม่ผ่าน = ไม่ start) |
| `auth/` | `JwtAuthGuard` + `PermissionsGuard` (global `APP_GUARD` ตามลำดับ), `@Public()`, `@RequirePermissions(...)` (ไม่ใส่ code = user ที่ login แล้วทุกคน), `@CurrentUser()` — route ที่ไม่มีทั้ง `@Public` และ `@RequirePermissions` ถูกปฏิเสธ 403 (fail-closed) |
| `http/response.interceptor.ts` | ห่อ response เป็น `{ success, data, message }` / `{ success, data, meta }` |
| `http/http-exception.filter.ts` | แปลงทุก error เป็น format เดียวกัน (spec §30) |
| `http/pagination.dto.ts` | `PaginationQueryDto` (`page`, `perPage`, `sort`, `q`, getter `skip`/`take`) + `Paginated<T>` |
| `http/validation.pipe.ts` | `createValidationPipe()` — whitelist + forbidNonWhitelisted + transform, error → 422 `VALIDATION_FAILED` |
| `cls/app-cls-store.ts` | type ของค่าใน CLS (`userId`, `ip`, `userAgent`) |
| `errors/business.exception.ts` | `BusinessException(code, message, status, errors?)` |
| `audit/audit.service.ts` | `log({ action, entityType, entityId, jobId?, oldValue?, newValue?, description? })` — อ่าน user/ip/ua จาก CLS เอง |
| `sequence/sequence.service.ts` | ออกเลขเอกสาร `JOB-2026-000001` ฯลฯ (ปีนับตาม Asia/Bangkok) |
| `storage/` | `StorageService` + `LocalStorageDriver` / `S3StorageDriver` |
| `idempotency/` | `IdempotencyInterceptor` สำหรับ Payment / Binding |
| `access/` | `DataScopeService` — Agent เห็น/แก้เฉพาะ Job ของตัวเอง (BR-014) |

---

## 5. Database Conventions

| หัวข้อ | กฎ |
|---|---|
| ชื่อ table/column | `snake_case` ใน DB, `camelCase` ใน Prisma/TS (`@map` / `@@map`) |
| Primary key | `uuid` v7 → `id String @id @default(uuid(7)) @db.Uuid` |
| เงิน | `Decimal @db.Decimal(15, 2)` — **ห้ามใช้ Float** |
| Rate / % | `Decimal @db.Decimal(9, 4)` |
| Timestamp | `timestamptz` เก็บเป็น UTC, แปลงเป็น `Asia/Bangkok` ที่ Frontend |
| วันที่ธุรกิจ (effective/expiry/due) | `@db.Date` (ไม่มีเวลา) |
| Audit columns | ทุก table ธุรกรรม: `createdAt`, `updatedAt`, `createdById`, `updatedById` |
| Soft delete | Master data, customers, jobs: `deletedAt` — query ปกติต้อง filter `deletedAt: null` |
| Transaction data | quotations/proposals/policies/payments/commissions **ห้ามลบ** → เปลี่ยน status เป็น `CANCELLED` |
| Optimistic lock | `version Int @default(1)` บน jobs, quotations, proposals, approvals, policies |
| Enum | ใช้ Prisma `enum` สำหรับ status/type ที่ตายตัว |
| Unique | `customer_code`, `job_no`, `quotation_no`, `proposal_no`, `policy_no`, `payment_no` |
| Index | FK ทุกตัว + column ที่ใช้ filter บ่อย (`status`, `agent_id`, `expiry_date`) |

> **ข้อยกเว้น Physical Delete สำหรับข้อมูลร่างการสอบถาม (Draft Inquiry Parameters):**
> ตาราง `job_coverages` และ `job_risk_values` เป็นพารามิเตอร์เงื่อนไขความคุ้มครองและข้อมูลความเสี่ยงขั้นต้นระหว่างร่าง Job (DRAFT / OPEN / WAITING_INFORMATION)
> อนุญาตให้ทำการ physical delete / replace รายการได้ขณะที่ Job อยู่ในสถานะแก้ไขได้ (`EDITABLE_STATUSES`) โดยมี Audit log บันทึกการเปลี่ยนแปลง
> เมื่อเข้าสู่กระบวนการเสนอราคาและทำสัญญา ความคุ้มครองจะถูก snapshot ถาวรใน `quotation_items` และ `policy_coverages` ซึ่งเป็น Transaction data ที่ห้ามลบเด็ดขาด

### 5.1 Table เพิ่มจาก spec §31

| Table | เหตุผล |
|---|---|
| `refresh_tokens` | เก็บ hash ของ refresh token เพื่อ rotate/revoke |
| `document_sequences` | running number แบบ atomic (`prefix`, `year`, `last_value`) |
| `job_status_histories` | "Status History" ใน spec §2.1 Audit — `job_id, from_status, to_status, reason, changed_by, changed_at` |
| `approval_rules` | Approval rule เป็น config ไม่ hard code (spec §16.2) |
| `idempotency_keys` | กัน Payment/Binding ซ้ำ (spec §51 ข้อ 19) |
| `policy_coverages` | snapshot coverage ตอนออก policy (อยู่ใน §31 แต่ไม่มี field) |

Field เพิ่ม:
- `insurance_products.require_docs_on_submit BOOLEAN`, `require_docs_on_bind BOOLEAN` (spec §12.3)
- `jobs.selected_quotation_id` (nullable) — อ่านง่ายกว่าหาเอง
- `policies.payment_due_date DATE` — ต้องใช้คำนวณ `OVERDUE` (spec §19.2)

### 5.2 Running Number

```sql
INSERT INTO document_sequences (prefix, year, last_value)
VALUES ($1, $2, 1)
ON CONFLICT (prefix, year)
DO UPDATE SET last_value = document_sequences.last_value + 1
RETURNING last_value;
```

| เอกสาร | Format |
|---|---|
| Customer | `CUS-{RUNNING:6}` |
| Job | `JOB-{YEAR}-{RUNNING:6}` |
| Quotation | `QT-{YEAR}-{RUNNING:6}` |
| Proposal | `PP-{YEAR}-{RUNNING:6}` |
| Payment | `PAY-{YEAR}-{RUNNING:6}` |

> Policy No มาจากบริษัทประกัน → user กรอกเอง + unique constraint

### 5.3 Constraint ที่ Prisma schema ทำเองไม่ได้

สร้าง migration ด้วย `prisma migrate dev --create-only` แล้วเพิ่ม SQL เอง:

```sql
-- BR-005: 1 Job มี Selected Quotation ได้ 1 รายการ
CREATE UNIQUE INDEX quotations_one_selected_per_job
  ON quotations (job_id) WHERE status = 'SELECTED';

-- เงินต้องไม่ติดลบ
ALTER TABLE quotations ADD CONSTRAINT quotations_total_non_negative CHECK (total_amount >= 0);
ALTER TABLE policies   ADD CONSTRAINT policies_dates_valid CHECK (expiry_date > effective_date);
```

---

## 6. API Conventions

- Prefix: `/api`, JSON เป็น **camelCase** ทั้ง request/response (ตัดสินใจแทน snake_case ในตัวอย่าง spec เพราะ TS ทั้ง stack — ดู Open Questions)
- เงิน/Decimal ส่งเป็น **string** (`"52000.00"`) ห้ามแปลงเป็น number
- วันที่ธุรกิจส่งเป็น `YYYY-MM-DD`, timestamp ส่งเป็น ISO-8601 UTC

### 6.1 Response

```json
{ "success": true, "data": { }, "message": "Success" }
```

```json
{ "success": true, "data": [ ], "meta": { "page": 1, "perPage": 20, "total": 100, "lastPage": 5 } }
```

```json
{
  "success": false,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "errors": { "customerId": ["customerId is required"] }
}
```

### 6.2 HTTP Status ที่ใช้

| กรณี | Status | `code` ตัวอย่าง |
|---|---|---|
| DTO ไม่ผ่าน | 422 | `VALIDATION_FAILED` |
| Business rule ไม่ผ่าน (เอกสารไม่ครบ, risk ไม่ครบ, quotation หมดอายุ) | 422 | `JOB_DOCUMENTS_MISSING`, `QUOTATION_EXPIRED` |
| State transition ไม่ถูกต้อง | 409 | `JOB_INVALID_TRANSITION` |
| ถูกแก้ไขโดยคนอื่นก่อน (version ไม่ตรง) | 409 | `CONCURRENT_MODIFICATION` |
| Unique ซ้ำ | 409 | `DUPLICATE_POLICY_NO` |
| ไม่ได้ login | 401 | `UNAUTHENTICATED` |
| ไม่มีสิทธิ์ / ไม่ใช่ Job ของตัวเอง | 403 | `FORBIDDEN` |
| ไม่พบ | 404 | `NOT_FOUND` |

### 6.3 Workflow Action Endpoints

ทุกการเปลี่ยนสถานะใช้ **action endpoint** (`POST /api/jobs/{id}/submit`) — **ไม่มี** `PUT { status }` ให้ client ส่งเอง (spec §6, §51 ข้อ 1)

Request body ของ action มี `version` เสมอ (optimistic lock):

```json
{ "version": 3, "reason": "optional" }
```

`GET /api/jobs/{id}` คืน `allowedActions` ที่คำนวณจาก state machine + permission ของ user
→ Frontend แค่ **แสดงปุ่มตาม `allowedActions`** ไม่ต้องรู้ business rule เอง

```json
{ "id": "…", "jobNo": "JOB-2026-000001", "status": "OPEN", "version": 3,
  "allowedActions": ["requestInfo", "requestQuotation", "cancel"] }
```

---

## 7. Job State Machine

> **V2 (Day 8):** `OPEN` เพิ่ม `CLOSED` ตรง (underwriting ปฏิเสธ → `closeReason = UNDERWRITING_REJECTED`) และ `requestQuotation` (OPEN/WAITING_INFORMATION → QUOTATION_REQUESTED) ต้องมี underwriting `APPROVED` ก่อนถ้า product กำหนด `requireUnderwriting` (422 `UNDERWRITING_REQUIRED`) — ดูรายละเอียดเต็มใน PLAN_V2.md §"Job state machine V2"

```ts
// modules/job/domain/job-status.ts
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT:               ['OPEN', 'QUOTATION_SELECTED'],
  OPEN:                ['WAITING_INFORMATION', 'QUOTATION_REQUESTED', 'QUOTATION_SELECTED', 'CLOSED'],
  WAITING_INFORMATION: ['OPEN', 'CLOSED'],
  QUOTATION_REQUESTED: ['QUOTATION_RECEIVED', 'QUOTATION_SELECTED'],
  QUOTATION_RECEIVED:  ['QUOTATION_SELECTED'],
  QUOTATION_SELECTED:  ['PROPOSAL_SENT'],
  PROPOSAL_SENT:       ['WAITING_CUSTOMER'],
  WAITING_CUSTOMER:    ['CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED', 'WAITING_APPROVAL'],
  CUSTOMER_ACCEPTED:   ['WAITING_APPROVAL', 'BINDING'],
  WAITING_APPROVAL:    ['APPROVED'],
  APPROVED:            ['BINDING'],
  BINDING:             ['POLICY_PENDING'],
  POLICY_PENDING:      ['POLICY_ISSUED'],
  POLICY_ISSUED:       ['RENEWAL', 'CLOSED'],
  CUSTOMER_REJECTED:   ['CLOSED'],
  CANCELLED: [], CLOSED: [], EXPIRED: [], RENEWAL: [],
};

// "Any Open Status → CANCELLED"
export const NON_CANCELLABLE: JobStatus[] =
  ['POLICY_ISSUED', 'CANCELLED', 'CLOSED', 'EXPIRED', 'RENEWAL'];

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (to === 'CANCELLED') return !NON_CANCELLABLE.includes(from);
  return JOB_TRANSITIONS[from].includes(to);
}
```

### 7.1 Action → Transition

| Action (endpoint) | Transition | เงื่อนไขเพิ่ม |
|---|---|---|
| `submit` | DRAFT → OPEN | Risk required ครบ, เอกสารครบถ้า `require_docs_on_submit` |
| `request-info` / `resume` | OPEN ⇄ WAITING_INFORMATION | |
| `underwriting/request-review` | (ไม่เปลี่ยน Job status) | OPEN เท่านั้น; เอกสารที่ checklist ต้องเป็น VERIFIED ครบ |
| `underwriting/require-info` | OPEN → WAITING_INFORMATION | ต้องมี reason; underwriting → INFO_REQUIRED |
| `underwriting/resume` | WAITING_INFORMATION → OPEN | underwriting กลับเป็น PENDING เพื่อ re-review |
| `underwriting/reject` | OPEN → CLOSED | `closeReason = UNDERWRITING_REJECTED`; ต้องมี reason |
| `underwriting/approve` | (ไม่เปลี่ยน Job status) | ต้องมี riskLevel (LOW/MEDIUM/HIGH); maker-checker (ผู้ขอ ≠ ผู้อนุมัติ) |
| create quotation (แรก) | OPEN → QUOTATION_REQUESTED | ถ้า product `requireUnderwriting` ต้องมี underwriting ล่าสุด APPROVED (422 `UNDERWRITING_REQUIRED`) |
| record quotation (แรกที่ RECEIVED) | QUOTATION_REQUESTED → QUOTATION_RECEIVED | |
| `quotations/{id}/select` | QUOTATION_RECEIVED → QUOTATION_SELECTED | Quotation ยังไม่หมดอายุ, บันทึกเหตุผล |
| `proposals/{id}/send` | QUOTATION_SELECTED → PROPOSAL_SENT → WAITING_CUSTOMER | ทำ 2 step ใน transaction เดียว (history 2 แถว) |
| `proposals/{id}/revise` / `jobs/{id}/revise` | WAITING_CUSTOMER / APPROVAL_REJECTED → QUOTATION_RECEIVED | Proposal ปัจจุบัน → SUPERSEDED; Approval ค้าง → CANCELLED; Quotation SELECTED → RECEIVED |
| `proposals/{id}/accept` | WAITING_CUSTOMER → CUSTOMER_ACCEPTED → (WAITING_APPROVAL \| อยู่รอ bind) | ประเมิน `approval_rules`, proposal ไม่หมดอายุ, แนบ evidence หรือ remark ตาม method |
| `proposals/{id}/reject` | WAITING_CUSTOMER → CUSTOMER_REJECTED | ต้องมี reject reason |
| `approvals/{id}/approve` | WAITING_APPROVAL → APPROVED | approver ต้องมี role ตาม rule |
| `bind` | CUSTOMER_ACCEPTED/APPROVED → BINDING → POLICY_PENDING | BR-006..009, idempotency key |
| `policy` (create + issue) | POLICY_PENDING → POLICY_ISSUED | policy_no unique, BR-010 |
| `cancel` | any cancellable → CANCELLED | ต้องมี reason |
| `close` | POLICY_ISSUED / CUSTOMER_REJECTED → CLOSED | |

### 7.2 รูปแบบ transition (ทุก action ใช้ pattern นี้)

```ts
@Transactional()
async transition(job: Job, to: JobStatus, opts: { expectedVersion: number; reason?: string }) {
  if (!canTransition(job.status, to)) {
    throw new BusinessException('JOB_INVALID_TRANSITION',
      `Cannot change status from ${job.status} to ${to}`, 409);
  }
  const { count } = await this.txHost.tx.job.updateMany({
    where: { id: job.id, version: opts.expectedVersion, status: job.status },
    data:  { status: to, version: { increment: 1 }, updatedById: this.cls.get('userId') },
  });
  if (count === 0) throw new BusinessException('CONCURRENT_MODIFICATION', 'Job was modified by another user', 409);

  await this.txHost.tx.jobStatusHistory.create({ data: { jobId: job.id, fromStatus: job.status, toStatus: to, reason: opts.reason, changedById: this.cls.get('userId') } });
  await this.audit.log({ action: 'STATUS_CHANGED', entityType: 'JOB', entityId: job.id, jobId: job.id, oldValue: { status: job.status }, newValue: { status: to } });
}
```

### 7.3 Document Status & Underwriting (V2, Day 6 + Day 8)

Document `status` ไม่ใช่ state machine แบบ Job (ไม่มี `canTransition`) แต่เป็นชุดสถานะคงที่ต่อไฟล์หนึ่งเวอร์ชัน:

```text
REQUIRED → UPLOADED → UNDER_REVIEW → VERIFIED
                              └────→ REJECTED
UPLOADED/UNDER_REVIEW/VERIFIED → EXPIRED  (งานรายวันเมื่อเลย expiryDate)
```

- อัปโหลดประเภทเดิมซ้ำบน Job เดียวกัน = แถวใหม่ `version = version เก่า + 1`; เวอร์ชันเก่าไม่ลบ (soft, `deletedAt` ไม่ถูกแตะ)
- `verify` / `reject` ต้องมี permission `document.verify`; ห้าม verify เอกสารที่ตัวเอง upload (422) — maker-checker แบบเดียวกับ underwriting
- `isComplete(checklist, docs, level)` (pure fn, `domain/document-checklist.ts`) เช็คสองระดับ: `UPLOADED` (พอสำหรับ `submit`) และ `VERIFIED` (ต้องใช้ก่อน `underwriting/request-review` และก่อน `bind`)
- เอกสารที่ `EXPIRED` ไม่นับเป็น "มีแล้ว" ในทั้งสองระดับ

`Underwriting` ไม่ใช่ sub-state ของ Job แต่เป็น record แยก (`underwritings`, unique ต่อ `(jobId, version)`) ที่ Job อ้างอิงทางอ้อมผ่านกฎ `requestQuotation` (§7.1):

```text
PENDING → APPROVED
        → REJECTED        (→ Job CLOSED)
        → INFO_REQUIRED   (→ Job WAITING_INFORMATION; resume ส่งกลับ PENDING เป็น re-review รอบเดิม ไม่สร้าง version ใหม่)
```

- `requestReview` สร้าง version ใหม่ (+1 จาก version ล่าสุดของ Job นั้น) เฉพาะตอนที่ยังไม่มีรอบ PENDING ค้างอยู่
- `approve` ต้องระบุ `riskLevel` (`LOW | MEDIUM | HIGH`, D-3); ไม่มี rule engine คำนวณให้ ผู้ตรวจเลือกเอง
- Maker-checker: `requestedById` ของรอบล่าสุด ≠ ผู้เรียก `review/approve/require-info/reject` (422 `MAKER_CHECKER_VIOLATION`)

### 7.4 Quotation V2, Proposal V2 & Acceptance Evidence (V2, Day 11–16)

#### Quotation Versioning & Actions (D11–D12)
- **แยก Model:** `Quotation` (ต่อ Insurer ต่อ Job) และ `QuotationVersion` (ประวัติการเสนอราคาแต่ละรอบ `version = 1, 2, ...`)
- **Immutable History:** การบันทึกเวอร์ชันใหม่ (`POST /quotations/:id/versions`) จะปรับเวอร์ชันก่อนหน้าเป็น `SUPERSEDED` โดยไม่ overwrite ข้อมูลเดิม
- **Validation:** `validUntil > quotationDate` (422), `premium >= 0`, `insuranceCompanyId` จำเป็น
- **Commission Rate Default:** ดึงอัตราจากตาราง master `commission_rates` (ตาม insurerId + productId ณ วันที่ `quotationDate`) คำนวณเป็น `commissionAmount = netPremium * rate / 100` อัตโนมัติ
- **Quotation Actions:**
  - `recordVersion`: บันทึกรอบราคาใหม่ (สถานะ `RECEIVED` $\to$ เพิ่ม `QuotationVersion`)
  - `withdraw`: ถอนใบเสนอราคา (`WITHDRAWN`); ไม่อนุญาตหากถูกเลือกไปแล้ว (422 `QUOTATION_CANNOT_WITHDRAW_SELECTED`)
  - `select`: ต้องเลือกเวอร์ชันล่าสุดของใบเสนอราคา และต้องไม่หมดอายุ (`validUntil >= today`)
- **งานรายวัน / ปิดงาน:**
  - ใบเสนอราคาที่เลย `validUntil` $\to$ ปรับเป็น `EXPIRED`, ส่งการแจ้งเตือน `QUOTATION_EXPIRING` ล่วงหน้า 3 วัน
  - เมื่อ Job `CLOSED` หรือออกกรมธรรม์ $\to$ ใบเสนอราคาอื่นที่ไม่ถูกเลือกจะถูกปรับเป็น `REJECTED` อัตโนมัติ (D-5)
- **Comparison API (`GET /jobs/:jobId/quotation-comparison`):** สรุปเปรียบเทียบจากเวอร์ชันล่าสุดของใบเสนอราคาที่ `RECEIVED` หรือ `SELECTED` (เบี้ยรวม, ส่วนลด, เบี้ยสุทธิ, อากร/ภาษี, รวมทั้งสิ้น, deductible, commission, exclusion, condition, sub-coverages พร้อมระบุ `isLowest` สำหรับข้อเสนอที่เบี้ยต่ำสุด)

#### Proposal Versioning, Payment Terms & Revise (D13, D16)
- **Proposal Model:** เวอร์ชันของ Proposal ต่อ Job (`v1, v2, ...`), อ้างอิง `QuotationVersion` และ `PaymentTerm` (`payment_terms` master: name, installments, intervalMonths, firstDueDays)
- **Revise Flow (`POST /jobs/:id/revise` / `POST /proposals/:id/revise`):**
  - อนุญาตให้เรียกจากสถานะ `WAITING_CUSTOMER` หรือ `APPROVAL_REJECTED`
  - ปรับสถานะ Proposal ปัจจุบันเป็น `SUPERSEDED`
  - ยกเลิกรายการ Approval ที่ค้างอยู่เป็น `CANCELLED`
  - ถอยสถานะ Quotation ที่เลือกกลับเป็น `RECEIVED` และคืน Job สู่สถานะ `QUOTATION_RECEIVED` เพื่อให้สามารถเลือกหรือปรับปรุงราคาและออก Proposal v2 ได้
- **Proposal Daily Check:** Proposal ที่เลย `validUntil` ปรับเป็น `EXPIRED` โดยสถานะ Job ยังคงเป็น `WAITING_CUSTOMER`
- **PDF Template V2:** แสดงหัวกระดาษ "ฉบับที่ v{version}", เงื่อนไข Payment Term และตารางคำนวณงวดผ่อนชำระ (งวดที่, วันครบกำหนด, ยอดชำระต่องวด) ตาม OQ-3

#### Acceptance Evidence (D14, D16)
- **Model `ProposalAcceptance` (`proposal_acceptances` table):**
  - ฟิลด์: `proposalId`, `proposalVersion`, `acceptedByName`, `acceptedAt`, `method` (`EMAIL | SIGNED_DOCUMENT | LINE | MANUAL`), `ipAddress`, `evidenceFileId`, `remark`, `recordedById`
- **Domain Validation Rule (`validateAcceptanceEvidence`):**
  - `method !== 'MANUAL'` ต้องมีเอกสารหลักฐาน (`file` multipart upload หรือ `evidenceFileId`)
  - `method === 'MANUAL'` ต้องมี `remark` บันทึกรายละเอียดการตอบรับ
  - หากไม่ตรงเงื่อนไข โยน 422 `ACCEPTANCE_EVIDENCE_REQUIRED`
- **Acceptance Action (`POST /proposals/:id/accept`):**
  - รองรับทั้ง `multipart/form-data` (อัปโหลดไฟล์หลักฐานและบันทึกเป็น Document โดยอัตโนมัติ) และ JSON
  - บันทึกประวัติ `ProposalAcceptance` พร้อม IP Address
  - ส่ง Notification `CUSTOMER_ACCEPTED` ไปยัง Agent, Broker Staff และเจ้าของ Job
  - กรณีปฏิเสธ (`POST /proposals/:id/reject`) ส่ง Notification `CUSTOMER_REJECTED`

---

## 8. Security

- RBAC: `User → Role → Permission` (spec §35) — permission codes ตาม spec §4.1 **+ เพิ่ม**:
  - `job.view_all`, `job.update_all` — เห็น/แก้ Job ของ Agent อื่น (BR-014)
  - `customer.view_sensitive` — เห็น `citizenId`/`taxId` เต็ม (ไม่มีจะ mask `1-2345-xxxxx-xx-1`)
  - `approval.approve`
- Permission codes ฝังใน access token payload → เปลี่ยน role มีผลภายใน ≤ 15 นาที (หลัง refresh)
- Login: throttle 5 ครั้ง/นาที/IP+username
- Refresh token: httpOnly, `Secure`, `SameSite=Strict`, path `/api/auth` → ไม่ต้องใช้ CSRF token เพราะ access token ส่งทาง `Authorization` header
  - เป็น opaque random 256-bit เก็บเฉพาะ SHA-256 hash; rotate ทุกครั้ง (revoke เก่าแบบ conditional update กัน race)
  - **Reuse detection:** ถ้ามีคนส่ง token ที่ถูก revoke ไปแล้วมา refresh → revoke ทุก session ของ user นั้น + audit `REFRESH_TOKEN_REUSED`
  - `POST /auth/logout` เป็น `@Public` (ใช้ cookie) เพื่อให้ logout ได้แม้ access token หมดอายุ
- Login error: `INVALID_CREDENTIALS` (401, ข้อความเดียวกันทั้ง user ไม่มี/รหัสผิด + verify กับ dummy hash กัน timing), `ACCOUNT_DISABLED` (401), refresh ไม่ผ่าน `INVALID_REFRESH_TOKEN` (401); throttle นับทุก attempt รวมที่สำเร็จ
- Env: `JWT_ACCESS_SECRET` (≥32 ตัว, required), `JWT_ACCESS_TTL_SECONDS` (900), `JWT_REFRESH_TTL_DAYS` (7)
- Upload: ตรวจ extension + MIME จาก **magic bytes** (`file-type`), max 10 MB, ตั้งชื่อไฟล์ใหม่เป็น `{uuid}.{ext}`, path `{yyyy}/{mm}/{jobId}/`, ดาวน์โหลดผ่าน API ที่เช็คสิทธิ์เท่านั้น
- `helmet`, CORS whitelist, secrets อยู่ใน `.env` เท่านั้น (`.env` อยู่ใน `.gitignore`)
- Log ต้อง redact `password`, `token`, `citizenId`

---

## 9. Frontend Design

### 9.1 โครงสร้าง feature

```text
features/customers/
├── customers.routes.ts
├── data/customers.api.ts          ← HttpClient + types จาก core/api/schema.d.ts
├── pages/customer-list.page.ts    ← p-table lazy, filter sync กับ query params
├── pages/customer-form.page.ts    ← create/edit ใช้ component เดียว
├── pages/customer-detail.page.ts
└── components/…                   ← เช่น address-editor, contact-editor
```

### 9.2 กฎ Frontend

- Standalone components + Signals, `ChangeDetectionStrategy.OnPush`
- Typed Reactive Forms; error 422 จาก server → map `errors.{field}` ลง `FormControl` ด้วย helper `applyServerErrors(form, err)`
- ทุกหน้าที่ load data มี 3 state: **loading / empty / error** (component `app-state`)
- ปุ่ม action ใน Job detail แสดงตาม `allowedActions` จาก API เท่านั้น
- `*appHasPermission="'customer.create'"` ใช้ซ่อนปุ่ม (UX) — backend ยังตรวจเสมอ
- เงินแสดงผ่าน `money` pipe (รับ string, ไม่ parse เป็น float เพื่อคำนวณ)
- วันที่แสดงเป็นเวลา `Asia/Bangkok`, format `dd/MM/yyyy` (ค.ศ.) — ถ้าต้องการ พ.ศ. ดู Open Questions

### 9.3 Core

| ส่วน | หน้าที่ |
|---|---|
| `AuthStore` (signals) | `user`, `permissions`, `accessToken` (เก็บใน memory เท่านั้น) |
| `authInterceptor` | แนบ Bearer token; 401 → refresh 1 ครั้ง (queue request อื่นระหว่างรอ) → retry |
| `errorInterceptor` | แสดง toast สำหรับ 403/409/500; 422 ปล่อยให้ form จัดการ |
| `authGuard`, `permissionGuard` | route protection |
| App init | เรียก `/api/auth/refresh` ตอนเปิดแอป เพื่อกู้ session จาก cookie |

### 9.4 Job Detail Tabs (spec §38)

`Info · Risk · Coverage · Documents · Quotations · Comparison · Proposal · Approval · Binding · Policy · Payment · Commission · Tasks · Timeline · Underwriting`

- Tab **Quotations (ใบเสนอราคา V2, Day 15):** แสดงรายการใบเสนอราคาแต่ละบริษัทประกันพร้อม badge เวอร์ชัน `v{version}`, badge หมดอายุ (`EXPIRED`), ตารางประวัติเวอร์ชันย่อย (Version History Box) ที่ขยายดูได้, ปุ่ม "ขอราคา", ปุ่ม "บันทึกราคา", ปุ่ม "ปรับปรุงราคา (Version ใหม่)" ที่เปิด modal บันทึกเวอร์ชันใหม่ตาม D11-D12, และปุ่ม/dialog "ถอนใบเสนอราคา"
- Tab **Comparison (เปรียบเทียบ V2, Day 15):** ตารางเปรียบเทียบหลายมิติ (ข้อมูลเบี้ยประกันภัย gross/discount/net/stamp/tax/total, เงื่อนไข deductible/exclusion/condition/commission, รายการความคุ้มครองย่อย), ไฮไลต์คอลัมน์สีเขียวและ badge "เบี้ยต่ำที่สุด" สำหรับบริษัทที่ `isLowest`, บล็อกการเลือกใบเสนอราคาที่หมดอายุ, และปุ่ม "เลือกข้อเสนอนี้" เพื่อเปลี่ยนสถานะ Job สู่ `QUOTATION_SELECTED`
- Tab **Proposal (ใบเสนอ V2, Day 16):** แสดงรายการ Proposal พร้อม badge เวอร์ชัน `v{version}`, สถานะ (`DRAFT`, `SENT`, `SUPERSEDED`, `ACCEPTED`, `REJECTED`, `EXPIRED`), รายละเอียดเงื่อนไขการชำระเงิน (Payment Term) และงวดผ่อน, ปุ่มดาวน์โหลด PDF ที่มีฉบับร่าง/ฉบับจริงพร้อมงวดผ่อน, ปุ่ม "ส่งใบเสนอ", ปุ่ม "ปรับปรุงข้อเสนอ (Revise)" ที่ส่ง Job กลับสู่ `QUOTATION_RECEIVED`, ปุ่ม "ยอมรับ (Accept)" พร้อม dialog บันทึกหลักฐาน (EMAIL/SIGNED_DOCUMENT/LINE/MANUAL) และการ์ดแสดงข้อมูล Acceptance Evidence
- Tab **Underwriting (V2 Day 9):** สถานะล่าสุด + ประวัติทุกรอบ (version), ฟอร์ม review (riskLevel/riskScore/reason/condition/exclusion/deductible/requiredSurvey/requiredDocuments) และปุ่ม request-review/approve/require-info/reject/resume ตาม permission `underwriting.review` + maker-checker (ผู้ขอ ≠ ผู้ตรวจ)
- Tab **Risk** เป็น dynamic form สร้างจาก `risk_field_definitions` ของ product (TEXT/NUMBER/DATE/BOOLEAN/SELECT/MULTI_SELECT)
- Tab ที่ยังไม่ถึงขั้น (เช่น Policy ตอนยัง OPEN) แสดงแต่ disabled พร้อมบอกว่าต้องถึงสถานะไหน

---

## 10. Testing Strategy

| ระดับ | เครื่องมือ | ครอบคลุม |
|---|---|---|
| Unit (domain) | vitest | state machine (table-driven ทุกคู่), premium/commission/payment status, approval rule, document validation, risk validation |
| Service | vitest + test DB | service method สำคัญ + negative cases |
| API e2e | vitest + supertest + Postgres `insurance_test` | acceptance flow spec §47 ทาง API, 401/403/409/422 |
| UI E2E | Playwright | acceptance flow 25 ขั้นผ่านหน้าจอ |

Test DB: `DATABASE_URL` ชี้ `insurance_test`, `prisma migrate reset --force --skip-seed` ก่อนรัน e2e suite
