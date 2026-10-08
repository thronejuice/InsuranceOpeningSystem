# Code Review — Insurance Opening System V1

> รีวิวเมื่อ 2026-10-05 · commit `361e3ed` (main) · ครอบคลุม `apps/api` + `apps/web`
> วิธีรีวิว: ไล่ตามกฎใน [CLAUDE.md](../CLAUDE.md) ทีละข้อ + เปิดทุกหน้าใน browser ด้วย `admin` และ `agent01` + เทียบข้อมูลที่ user แต่ละ role เห็นผ่าน API จริง
> สถานะตอนรีวิว: typecheck ผ่าน · API unit 199/199 · API e2e 159/159 · web unit 8/8 · `ng lint` ผ่าน · `oxlint` 14 warnings
> สถานะหลังแก้ไข (2026-10-05): typecheck ผ่าน · API unit 213/213 · API e2e 169/169 · web build ผ่าน · `oxlint` 0 warnings, 0 errors · แก้ไขครบทุกรายการ P1 (4/4), P2 (6/6), P3 (6/6) เรียบร้อยแล้ว

**วิธีใช้ไฟล์นี้:** แก้ทีละข้อจากบนลงล่าง → ติ๊ก `[x]` → รัน "ตรวจว่าแก้แล้ว" ของข้อนั้น
ระดับ: **P1** = ข้อมูลรั่ว/ข้ามกฎธุรกิจ ควรแก้ก่อนใช้งานจริง · **P2** = bug หรือผิด convention ของโปรเจ็ค · **P3** = คุณภาพโค้ด/UX

---

## สรุป

| ระดับ | จำนวน | หัวข้อ |
|---|---|---|
| P1 | 4 | BR-014 รั่ว (policy/payment/commission/renewal), status เปลี่ยนนอก state machine, approval ไม่ตรวจระดับผู้อนุมัติ |
| P2 | 6 | Agent สร้าง Job ไม่ได้, route ไม่มี guard, กฎสถานะอยู่ฝั่ง FE, วันที่ UTC, ลบ coverage แบบ physical, ขาด e2e |
| P3 | 6 | หน้าอนุมัติแสดง UUID, `parseFloat` เงิน, dead code, lint warnings, type ซ้ำ, pagination ไม่สม่ำเสมอ |
| ต้องตัดสินใจ | 3 | ข้อมูลลูกค้าของ agent, ค่าตัวเลือกภาษาอังกฤษเดิม, Excel export เป็นตัวเลข |

---

## P1 — ควรแก้ก่อนใช้งานจริง

### [x] P1-1 · Agent เห็นกรมธรรม์/การชำระเงิน/คอมมิชชัน/การต่ออายุของ agent คนอื่น (BR-014)

**ไฟล์**
- [policy.service.ts:177](../apps/api/src/modules/policy/policy.service.ts#L177) `listPolicies`
- [payment.service.ts:27](../apps/api/src/modules/payment/payment.service.ts#L27) `listAll`, [:44](../apps/api/src/modules/payment/payment.service.ts#L44) `listByPolicy`
- [commission.service.ts:25](../apps/api/src/modules/commission/commission.service.ts#L25) `listByPolicy`, [:33](../apps/api/src/modules/commission/commission.service.ts#L33) `list`
- [renewal.service.ts:28](../apps/api/src/modules/renewal/renewal.service.ts#L28) `list`

**ปัญหา:** query ไม่มีเงื่อนไขว่า Job เป็นของผู้ใช้ ขณะที่ role AGENT ได้ `policy.view`, `payment.view`, `commission.view`, `renewal.view` (จาก `VIEW` ใน seed) → agent เรียก `/api/commissions` แล้วเห็นค่าคอมมิชชันของ agent ทุกคน
**หลักฐาน:** `/api/jobs` ถูกกรองแล้ว (agent ที่ไม่ใช่เจ้าของเห็น 0) แต่ 4 service นี้ไม่มีการเรียก `jobViewScope()` เลย — ตอนรีวิวยังไม่มีข้อมูลกรมธรรม์ใน DB จึงยืนยันจากโค้ด ยังไม่ได้เห็นการรั่วจริง
**วิธีแก้:** inject `DataScopeService` แล้วเพิ่ม `job: { deletedAt: null, ...this.scope.jobViewScope() }` (สำหรับ payment/commission ที่ผูกกับ policy ใช้ `policy: { job: {...} }`) ใน where ทุก list และตรวจ access ใน `listByPolicy` แบบเดียวกับ `TaskService.assertJobAccess()` ที่แก้ไปแล้ว
**ตรวจว่าแก้แล้ว:** เพิ่ม e2e — agent A สร้าง Job จนออกกรมธรรม์ → agent B เรียก 4 endpoint นี้ต้องไม่เห็นข้อมูลของ A และ `listByPolicy` ของ A ต้องได้ 403

---

### [x] P1-2 · เปลี่ยนสถานะ Job นอก `JobWorkflowService.transition()` (ข้าม state machine)

**ไฟล์** — แต่ละไฟล์มี `private async transitionJob(...)` ของตัวเอง
- [quotation.service.ts:297](../apps/api/src/modules/quotation/quotation.service.ts#L297)
- [proposal.service.ts:229](../apps/api/src/modules/proposal/proposal.service.ts#L229)
- [approval.service.ts:102](../apps/api/src/modules/approval/approval.service.ts#L102)
- [policy.service.ts:292](../apps/api/src/modules/policy/policy.service.ts#L292)
- [renewal.service.ts:222](../apps/api/src/modules/renewal/renewal.service.ts#L222)

**ปัญหา:** ผิดกฎข้อ 2 ของ CLAUDE.md ("ทุก status change ต้องผ่าน `JobWorkflowService.transition()`") — 5 copy นี้ทำ optimistic lock + history แต่**ไม่เรียก `canTransition()`** จึงไม่มีอะไรกันการกระโดดสถานะผิดลำดับ เช่น `approve()` ใน approval.service เปลี่ยน Job เป็น `APPROVED` โดยไม่ตรวจว่า Job อยู่ `WAITING_APPROVAL` จริง (ถ้า Job ถูกยกเลิกไประหว่างรออนุมัติ การอนุมัติจะดึงสถานะกลับจาก `CANCELLED` เป็น `APPROVED` — ยืนยันจากโค้ด: การยกเลิก Job ไม่ได้เปลี่ยน approval ที่ค้างเป็น CANCELLED จึงยังผ่านเช็ค `status === 'PENDING'` ได้; ยังไม่ได้ลองรันจริง)
**วิธีแก้:** ย้าย logic ไปเป็น method ภายในเดียว เช่น `JobWorkflowService.transitionInTx(job, to, userId)` ที่เรียก `canTransition()` + lock + history + audit แล้วให้ 5 service เรียกตัวนี้ ลบ copy ทิ้ง
**ตรวจว่าแก้แล้ว:** `grep -rn "private async transitionJob" apps/api/src` ต้องไม่เจอ · เพิ่ม e2e: ยกเลิก Job ระหว่าง `WAITING_APPROVAL` แล้ว approve → ต้องได้ 409 `JOB_INVALID_TRANSITION`

---

### [x] P1-3 · อนุมัติได้โดยไม่ตรวจระดับผู้อนุมัติ (`approvalType`)

**ไฟล์:** [approval.service.ts:37](../apps/api/src/modules/approval/approval.service.ts#L37) `approve`, [:69](../apps/api/src/modules/approval/approval.service.ts#L69) `reject`, [:31](../apps/api/src/modules/approval/approval.service.ts#L31) `getInbox`
**ปัญหา:** ตอนสร้างคำขอ ระบบคำนวณว่าต้องให้ใครอนุมัติ (`approvalType` = `SUPERVISOR`/`MANAGER`/`ADMIN` จาก `evaluateApprovalRules`) แต่ตอนอนุมัติตรวจแค่ permission `approval.approve` ไม่ได้เทียบ role ของผู้อนุมัติกับ `approvalType` → ผู้มีสิทธิ์อนุมัติระดับต่ำกว่าอนุมัติงานที่ต้องการระดับสูงกว่าได้ และ inbox แสดงทุกคำขอให้ทุกคนที่มีสิทธิ์
**หมายเหตุ:** seed ปัจจุบันให้ `approval.approve` เฉพาะ MANAGER/ADMIN จึงยังไม่เกิดผลจริง แต่ถ้าให้สิทธิ์ SUPERVISOR ในอนาคตจะรั่วทันที — และกลับกัน คำขอระดับ `SUPERVISOR` ตอนนี้ไม่มี supervisor คนไหนอนุมัติได้เลย
**วิธีแก้:** เพิ่ม domain function `canApproveType(approvalType, userRoles)` ตามลำดับ `ROLE_PRIORITY` ที่มีอยู่แล้วใน [approval-rules.ts](../apps/api/src/modules/approval/domain/approval-rules.ts) → ใช้ใน `approve/reject`, `canDecideApproval` และกรอง `getInbox`
**ตรวจว่าแก้แล้ว:** unit test ของ `canApproveType` + e2e: SUPERVISOR (ที่ให้ `approval.approve`) อนุมัติคำขอระดับ MANAGER → 403

---

### [x] P1-4 · กฎ "ห้ามอนุมัติตัวเอง" ยกเว้น ADMIN — ทบทวนก่อนขึ้น production

**ไฟล์:** [approval-rules.ts](../apps/api/src/modules/approval/domain/approval-rules.ts) `isSelfDecisionBlocked`, seed permission `approval.approve_own`
**ปัญหา:** เพิ่มเพื่อให้ admin ทดสอบ flow คนเดียวได้ (2026-10-05) แต่ใน production หมายความว่า admin ขออนุมัติส่วนลดเกินเกณฑ์แล้วอนุมัติเองได้ ซึ่งขัดหลัก maker-checker
**วิธีแก้:** ตัดสินใจว่าจะ (a) คงไว้ (b) เปิดเฉพาะ `NODE_ENV !== 'production'` หรือ (c) เอา `approval.approve_own` ออกจาก ADMIN ใน seed ของ production — บันทึกคำตอบใน Open Questions ของ [PLAN.md](PLAN.md)
**ตรวจว่าแก้แล้ว:** มีคำตอบใน PLAN.md และ seed/config ตรงกับคำตอบ

---

## P2 — Bug และผิด convention

### [x] P2-1 · Agent เปิดหน้าสร้าง Job ไม่ได้

**ไฟล์:** [job-form.page.ts:955](../apps/web/src/app/features/jobs/pages/job-form.page.ts#L955) เรียก `usersApi.listUsers()` → `GET /api/users` ต้องมี `user.manage`
**ปัญหา:** agent ได้ 403 → `loadState = 'error'` → ทั้งฟอร์มไม่แสดง (ยืนยันใน browser ด้วย `agent01`) ทั้งที่ agent มี `job.create`
**วิธีแก้ (ต้องเลือก):** (a) ถ้าผู้ใช้ไม่มี `job.view_all` ให้ล็อก agent เป็นตัวเองและไม่ต้องโหลดรายชื่อ — backend บังคับ `agentId = userId` ด้วย (BR-014) หรือ (b) เพิ่ม endpoint `GET /api/users/agents` (permission `job.create`) คืนเฉพาะ id/ชื่อ
**ตรวจว่าแก้แล้ว:** login `agent01` → `/jobs/create` แสดงฟอร์มและสร้าง Job ได้ · e2e: agent ส่ง `agentId` ของคนอื่น → 403 หรือถูกแทนเป็นตัวเอง

### [x] P2-2 · Route `/users` และ `/master/*` ไม่มี `permissionGuard`

**ไฟล์:** [users.routes.ts](../apps/web/src/app/features/users/users.routes.ts), [master.routes.ts](../apps/web/src/app/features/master/master.routes.ts)
**ปัญหา:** agent พิมพ์ URL `/users` เข้าได้ → หน้า error 403 แทนที่จะถูก redirect (backend ยังปลอดภัย แต่ UX ผิด และไม่สม่ำเสมอกับ feature อื่นที่มี guard ครบ)
**วิธีแก้:** เพิ่ม `canActivate: [authGuard, permissionGuard]` + `data: { permission: 'user.manage' }` / `'master.manage'`
**ตรวจว่าแก้แล้ว:** login `agent01` → เปิด `/users`, `/master/products` ต้องถูก redirect

### [x] P2-3 · กฎ "แก้ไขได้ในสถานะไหน" อยู่ฝั่ง frontend

**ไฟล์:** [job-detail.page.ts:70-73](../apps/web/src/app/features/jobs/pages/job-detail.page.ts#L70-L73) `EDITABLE_STATUSES`, `DOCS_LOCKED_STATUSES`, `QUOTATION_MANAGEABLE_STATUSES`
**ปัญหา:** ผิดกฎข้อ 1 ของ CLAUDE.md (business rule อยู่ backend, UI แสดงตาม `allowedActions`) — ถ้า backend เปลี่ยนกฎ หน้าเว็บจะไม่ตรง (เคยเกิดแล้ว: ช่องอัปโหลดซ่อนตั้งแต่หลัง OPEN ทั้งที่ bind ต้องใช้เอกสาร)
**วิธีแก้:** ให้ `toJobResponse` ส่ง flag เช่น `capabilities: { editRisk, manageDocuments, manageQuotations }` คำนวณจาก domain function ใน `job/domain/` แล้ว FE ใช้ flag แทน Set
**ตรวจว่าแก้แล้ว:** `grep -n "new Set(\['" apps/web/src/app/features/jobs` ไม่เจอ · unit test ของ domain function

### [x] P2-4 · "วันนี้" คำนวณเป็นเวลา UTC

**ไฟล์:** [policy.service.ts:147](../apps/api/src/modules/policy/policy.service.ts#L147) `new Date().toISOString().slice(0, 10)`
**ปัญหา:** ระหว่าง 00:00–06:59 เวลาไทย จะได้วันที่ของเมื่อวาน → `bindingDate`/`effectiveDate` เพี้ยน 1 วัน (กฎ: แสดงผล Asia/Bangkok)
**วิธีแก้:** สร้าง helper กลาง เช่น `todayInBangkok()` ใช้ `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })` แล้วใช้แทนทุกที่ที่หา "วันนี้"
**ตรวจว่าแก้แล้ว:** unit test ของ helper ด้วยเวลา `2026-10-05T18:30:00Z` → ต้องได้ `2026-10-06`

### [x] P2-5 · ลบ job coverage แบบ physical delete

**ไฟล์:** [job-coverage.service.ts:131](../apps/api/src/modules/job/job-coverage.service.ts#L131) `jobCoverage.delete`
**ปัญหา:** กฎ CLAUDE.md ห้าม physical delete ข้อมูล transaction — coverage ที่ลบไปไม่มีร่องรอย (นอกจาก audit log)
**วิธีแก้:** ตัดสินว่า job coverage เป็น "ข้อมูลร่าง" ที่ลบได้ (ถ้าใช่ บันทึกข้อยกเว้นใน [DESIGN.md](DESIGN.md)) หรือเปลี่ยนเป็น soft delete (`status`/`deletedAt`) และกรองออกตอน list
**ตรวจว่าแก้แล้ว:** มีข้อยกเว้นใน DESIGN.md หรือ `grep -rn "jobCoverage.delete(" apps/api/src` ไม่เจอ

### [x] P2-6 · e2e ยังไม่ครอบคลุมสิ่งที่แก้ใน session 2026-10-05

**ไฟล์:** `apps/api/test/`
**ที่ขาด:**
- [x] Task: agent ไม่ใช่เจ้าของ → `GET/POST /jobs/:id/tasks`, `POST /tasks/:id/complete` ได้ 403
- [x] `GET /api/quotations` agent เห็นเฉพาะของตัวเอง
- [x] `canDecide` ใน `/api/approvals` และใน proposal (requester = false, approver คนอื่น = true)
- [x] `approval.approve_own`: role ที่มีสิทธิ์อนุมัติของตัวเองได้, role ที่ไม่มี → 422
- [x] `allowedActions` ของ MANAGER ที่ไม่ใช่เจ้าของ Job ต้องมี `approve`
- [x] SELECT risk field ส่งค่านอก options → 422

**ตรวจว่าแก้แล้ว:** `npm run test:e2e -w apps/api` ผ่าน และมี test ครบตามรายการ

---

## P3 — คุณภาพโค้ด / UX

### [x] P3-1 · หน้าอนุมัติแสดง UUID และรหัสภาษาอังกฤษ
[approvals-inbox.page.ts:49-51](../apps/web/src/app/features/approvals/pages/approvals-inbox.page.ts#L49-L51) แสดง `a.jobId` (UUID) และ `a.approvalType` (`MANAGER`) → ให้ backend ส่ง `jobNo`, ชื่อลูกค้า, ยอดเบี้ย และ FE map `approvalType` เป็นภาษาไทย

### [x] P3-2 · เทียบเงินด้วย `parseFloat`
[job-detail.page.ts:1964](../apps/web/src/app/features/jobs/pages/job-detail.page.ts#L1964) หาใบเสนอราคาถูกสุดด้วย `parseFloat(totalAmount)` → ให้ backend ส่ง `isLowest` ใน comparison response แทน (กฎ: เงินเป็น string, ไม่ใช้ float)

### [x] P3-3 · Dead code และ `as any`
- [task.service.ts:141](../apps/api/src/modules/task/task.service.ts#L141) `void userId;` — ลบตัวแปรที่ไม่ใช้
- [task.service.ts:153](../apps/api/src/modules/task/task.service.ts#L153) `taskType as any` — เปลี่ยน parameter เป็น `TaskType` enum

### [x] P3-4 · oxlint 14 warnings
`npx oxlint src/ test/` ใน `apps/api` → `no-unused-vars` 9 (ส่วนใหญ่ใน test เช่น `agentB` ใน [document.e2e-spec.ts:115](../apps/api/test/document.e2e-spec.ts#L115)), `no-thenable` 4 ใน [env.validation.ts:21](../apps/api/src/common/config/env.validation.ts#L21), `no-single-promise-in-promise-methods` 1 — เป้าหมาย 0 warning

### [x] P3-5 · `ApprovalResponse` มี 2 รูปแบบ
[approval.response.ts](../apps/api/src/modules/approval/dto/approval.response.ts) กับ approval ที่ฝังใน [proposal.response.ts](../apps/api/src/modules/proposal/dto/proposal.response.ts) มี field ต่างกัน (`requestedAt` vs `createdAt`, มี/ไม่มี `requestedById`) → ใช้ mapper เดียว และ FE ใช้ type เดียว (`ApprovalResponse` / `ApprovalInProposal` ใน `jobs.api.ts`)

### [x] P3-6 · Pagination ไม่สม่ำเสมอ
`/api/payments` ใช้ `page/limit`, ส่วนอื่นใช้ `page/perPage`, `/api/policies` ไม่มี pagination และปฏิเสธ `perPage` (422 `property perPage should not exist`) → ใช้ `PaginationDto` กลางตัวเดียวทุก list endpoint

---

## ต้องตัดสินใจ (เพิ่มใน Open Questions ของ PLAN.md)

- [x] **Q-A · Agent ควรเห็นลูกค้าทุกคนไหม?** ตอนนี้ `GET /api/customers` ไม่กรอง — agent ที่ไม่มี Job เลยเห็นลูกค้าทั้ง 13 ราย (ยืนยันผ่าน API) BR-014 พูดถึงเฉพาะ Job; ถ้าต้องกรอง ให้กรองที่ [customer.service.ts:26](../apps/api/src/modules/customer/customer.service.ts#L26) ตาม `createdById` หรือ Job ที่ถืออยู่ (บันทึกใน Open Questions ของ PLAN.md ข้อ Q11)
- [x] **Q-B · ค่า SELECT เดิมที่เป็นภาษาอังกฤษ** — risk field ประเภทรถ/การใช้งานเปลี่ยนตัวเลือกเป็นภาษาไทยแล้ว (`รถเก๋ง`, `ส่วนบุคคล`) Job เก่าที่เก็บ `SEDAN`/`PERSONAL` จะแก้ไขไม่ผ่าน validation จนกว่าจะเลือกใหม่ → ต้องการ migration แปลงค่าเดิมไหม (บันทึกใน Open Questions ของ PLAN.md ข้อ Q12)
- [x] **Q-C · Excel export ใช้ `parseFloat`** ([report.service.ts:145-227](../apps/api/src/modules/report/report.service.ts#L145-L227)) — Excel ต้องการตัวเลขเพื่อคำนวณ แต่ค่าที่มีทศนิยมยาวอาจเพี้ยน ยอมรับได้ไหม หรือให้ส่งเป็น string + numFmt (บันทึกใน Open Questions ของ PLAN.md ข้อ Q13)

---

## อ้างอิง: แก้ไปแล้วใน session 2026-10-05

ไม่ต้องทำซ้ำ — เก็บไว้ดูบริบท (รายละเอียดใน commit `919c87b`)

- [x] Backdoor รหัสผ่านใน `AuthService.login` (เข้าได้ทุกบัญชีด้วย `admin`)
- [x] `/api/quotations` ห่อ response ซ้ำ, `activities` ไม่ unwrap ใน FE
- [x] Permission ที่ไม่มีอยู่จริง: `task.*`, `job.manage_quotation`
- [x] BR-014 ใน Task และรายการใบเสนอราคา
- [x] ปุ่ม `requestQuotation`/`recordQuotation`/`selectQuotation` ไม่มี endpoint
- [x] `canDecide` + ซ่อนปุ่มอนุมัติจากผู้ขอ, MANAGER ไม่เห็นปุ่มอนุมัติในหน้า Job
- [x] ช่องอัปโหลดเอกสารซ่อนหลัง OPEN
- [x] Master data: 41 ผลิตภัณฑ์ + coverage + risk field (มีตัวเลือก SELECT) + checklist เอกสาร
- [x] e2e เลือกผลิตภัณฑ์แบบสุ่มจนชนกับ suite อื่น
