# Insurance Opening System V1

ระบบบริหารงานประกันภัยสำหรับ Broker/Agent: Customer → Job → Quotation → Proposal → Approval → Binding → Policy → Payment → Commission → Renewal

## เอกสาร (อ่านตามลำดับ)
1. [docs/PLAN_V2.md](docs/PLAN_V2.md) — แผน V2 รายวัน (Day 1–47), Open Questions (OQ-n), Log (ดูว่าตอนนี้อยู่ Day ไหน) · [docs/PLAN.md](docs/PLAN.md) คือแผน V1 (ปิดแล้ว)
2. [docs/DESIGN.md](docs/DESIGN.md) — การตัดสินใจทางเทคนิค (stack, โครงสร้าง, conventions, state machine, §7.5–7.7 approval/policy/billing/insurer)
3. [docs/SYSTEM_FLOW_V2.md](docs/SYSTEM_FLOW_V2.md) — state machine ทุก entity, permission matrix (สร้างจาก seed + มี test เทียบ), data scope, งานรายวัน, checklist ทดสอบ
4. [docs/Insurance_Broker_Workflow_V2.md](docs/Insurance_Broker_Workflow_V2.md) — spec V2 (อ้างอิงเป็น "V2 §N") · [Insurance_Opening_System_V1.md](Insurance_Opening_System_V1.md) — spec V1 ("spec §N")

## Commands
สคริปต์อยู่ใน `package.json` (`docker compose up -d` เริ่ม postgres/redis/mailpit) · API e2e ใช้ DB `insurance_test` (`npm run test:e2e -w apps/api`) · `gen:api` generate FE types จาก `/api/docs-json`
- ข้อมูลตัวอย่างครบทุกสถานะ V2: `npm run db:reset && npm run db:seed:mock -w apps/api` (ขับ workflow จริงผ่าน API ใน `src/seed-mock/`; รันซ้ำได้ — ถ้ามีข้อมูล Demo แล้วจะหยุด) · ตาราง permission: `npm run docs:matrix -w apps/api`
- Schema เปลี่ยน → ต้องมี migration เสมอ (ห้ามพึ่ง `db push`): ตรวจ drift ด้วย `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <DB ว่าง>` (ยกเว้น `ALTER COLUMN "id" DROP DEFAULT` ที่เป็น noise)
- Playwright: `npm run e2e -w apps/web` (ต้อง `npm run dev` + seed ก่อน; login จำกัด 5 ครั้ง/นาที/ผู้ใช้)

## Skills
| Skill | ใช้เมื่อ |
|---|---|
| `/daily-task` | เริ่ม session: หา Day ปัจจุบันแล้วทำต่อ (`status`, `close`) |
| `/nest-module` | สร้าง/ขยาย backend module, CRUD, Prisma model |
| `/workflow-action` | action ที่เปลี่ยน status (submit, select, accept, bind, …) |
| `/angular-feature` | หน้าจอ list/form/detail/tab |
| `/dod-check` | ตรวจ Definition of Done ของ module |

## กฎที่ห้ามละเมิด
- Business rule และ status อยู่ที่ **backend** เท่านั้น ให้ client เรียก action endpoint ห้าม `PUT { status }` และให้ UI แสดงปุ่มตาม `allowedActions`
- ทุก status change ต้องผ่าน `JobWorkflowService.transition()` (state machine + optimistic lock + history + audit)
- State-changing operation ต้องใช้ `@Transactional()`
- เงินใช้ `Decimal(15,2)` และส่งใน JSON เป็น string ห้ามใช้ float
- ห้าม physical delete transaction data ให้เปลี่ยน status เป็น `CANCELLED` แทน (master/customer/job ใช้ soft delete)
- ทุก route ต้องมี `@RequirePermissions(...)` หรือ `@Public()` และ Agent เข้าถึงได้เฉพาะ Job ของตัวเอง (BR-014)
- Controller บาง, logic อยู่ใน service, rule อยู่ใน `domain/` (pure function + unit test)
- Timezone แสดงผล `Asia/Bangkok`, DB เก็บ UTC
- Excel export / dashboard / รายการทุกตัวต้องกรองด้วย `DataScopeService` (ห้าม query ตารางตรง ๆ ข้าม scope) และเงินใน export ต้องมาจาก Decimal string ไม่ใช่ float คำนวณ
- เงื่อนไขธุรกิจที่ spec ไม่ชัด → เพิ่มใน Open Questions ของ PLAN.md ห้ามเดาเงียบ ๆ
