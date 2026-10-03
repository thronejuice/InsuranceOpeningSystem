# Insurance Opening System V1

ระบบบริหารงานประกันภัยสำหรับ Broker/Agent: Customer → Job → Quotation → Proposal → Approval → Binding → Policy → Payment → Commission → Renewal

## เอกสาร (อ่านตามลำดับ)
1. [docs/PLAN.md](docs/PLAN.md) — แผนรายวัน, Open Questions, Log (ดูว่าตอนนี้อยู่ Day ไหน)
2. [docs/DESIGN.md](docs/DESIGN.md) — การตัดสินใจทางเทคนิค (stack, โครงสร้าง, conventions, state machine)
3. [Insurance_Opening_System_V1.md](Insurance_Opening_System_V1.md) — Functional spec (อ้างอิงเป็น "spec §N")

## Commands
สคริปต์อยู่ใน `package.json` (`docker compose up -d` เริ่ม postgres/redis/mailpit) · API e2e ใช้ DB `insurance_test` (`npm run test:e2e -w apps/api`) · `gen:api` generate FE types จาก `/api/docs-json`

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
- เงื่อนไขธุรกิจที่ spec ไม่ชัด → เพิ่มใน Open Questions ของ PLAN.md ห้ามเดาเงียบ ๆ
