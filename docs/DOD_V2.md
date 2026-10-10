# Definition of Done V2 — หลักฐานตรวจรับ (spec V2 §31)

> ยกเว้น **Claim** (อยู่ Backlog ตาม PLAN_V2) — ทุกข้อที่เหลือมีหลักฐานจาก test อัตโนมัติและ/หรือข้อมูลตัวอย่างจาก `npm run db:seed:mock`
> คำสั่งตรวจ: unit `npm run test -w apps/api` · e2e `npm run test:e2e -w apps/api` · UI `npm run e2e -w apps/web` (ต้อง `npm run dev` + `db:seed`)
> e2e ย่อ: ชื่อไฟล์ใน `apps/api/test/*.e2e-spec.ts` · PW = Playwright ใน `apps/web/e2e/` · Seed = `src/seed-mock/scenarios.ts`

| # | ข้อ DoD | หลักฐาน |
|---|---|---|
| 1 | สร้าง Customer | `customer.e2e`; Seed: Customers; PW acceptance (หน้า /customers) |
| 2 | สร้าง Job | `job.e2e`; PW phase3 Step 1 (สร้างผ่านฟอร์ม), phase1 |
| 3 | Assign Agent / Staff | `job.e2e` (assign + assignment-histories, 201) |
| 4 | กรอก Dynamic Risk | `document-risk.e2e` (N8–N9), `master.e2e` (risk fields) |
| 5 | ตรวจ Document Checklist | `document.e2e`, `document-risk.e2e`; PW phase1 (อัปโหลด/verify คนละคน); Seed: Documents |
| 6 | Underwriting Review | `underwriting.e2e`; PW phase1 Step 6–8; Seed: Underwriting (4 สถานะ) |
| 7 | Request Quotation | `quotation.e2e`; PW phase2 Step 2 |
| 8 | บันทึกหลาย Insurer | `quotation-select.e2e`; Seed: Quotations (3 บริษัท) |
| 9 | Quotation Version | `quotation.e2e` / `quotation-select.e2e` (versions); PW phase2 Step 4 (v2, v3) |
| 10 | ตรวจ Quotation Expiry | `negative.e2e` N1 (ใบเสนอราคาหมดอายุ → 422 `QUOTATION_EXPIRED`), `quotation-select.e2e` (ห้ามเลือกใบหมดอายุ) |
| 11 | Compare Quotation | `quotation-select.e2e` (comparison); PW phase2 Step 5 |
| 12 | Select Quotation | `quotation-select.e2e` (รวมกันเลือกซ้ำ); PW phase2 Step 5, phase3 Step 3 |
| 13 | Generate Proposal | `proposal.e2e` (PDF), PW phase2 Step 6 |
| 14 | ส่ง Proposal | `proposal.e2e` (send + เก็บ PDF เป็น Document); PW phase2 |
| 15 | Customer Accept / Reject | `proposal.e2e`; PW phase2 Step 9; Seed: Proposals |
| 16 | เก็บ Acceptance Evidence | `proposal.e2e` (evidence + path traversal/ชนิดไฟล์); PW phase2 Step 9 (การ์ดหลักฐาน) |
| 17 | Approval Rule | `approval.e2e`, `master.e2e`; seed rules (JOB ≥100k / ส่วนลด >10% / ENDORSEMENT ≥10k) |
| 18 | Maker-Checker | `approval.e2e` (APPROVAL_SELF_APPROVE), `negative.e2e` N3, `security-review.e2e` E2 (สลักหลัง), `refund.e2e` |
| 19 | Approval Reject / Resubmit | `approval.e2e`; PW phase3 Step 5–7; Seed: Approvals |
| 20 | Binding | `policy.e2e` (bind/confirm/reject); PW phase3 Step 8–11; Seed: Binding |
| 21 | Policy Issue | `policy.e2e`, `document-risk.e2e` N10 (ซ้ำ→409); PW phase3 Step 12 |
| 22 | Invoice | `invoice.e2e` (งวด, เศษสตางค์), PW phase4 Step 1; PDF |
| 23 | Payment | `payment.e2e` (idempotency, concurrency); PW phase4 Step 2–3 |
| 24 | Partial Payment | `payment.e2e` (PARTIALLY_PAID); Seed: Billing B |
| 25 | Overdue | `payment.e2e` D1–D2 (งานรายวัน + แจ้งเตือนครั้งเดียว); Seed: Billing C |
| 26 | Receipt | `payment.e2e` (ออก/VOID), PDF; PW phase4 Step 2 |
| 27 | Commission Calculation | `commission.e2e` (สูตร, WHT, override, payable เมื่อจ่ายครบ); unit `commission.spec` |
| 28 | Commission Statement | `commission.e2e` ST1–ST9 (+Excel); PW phase4 Step 5–6; Seed: Commission (DRAFT/CONFIRMED/PAID/CANCELLED) |
| 29 | Policy Endorsement | `endorsement.e2e`, `security-review.e2e` E1–E2; PW phase5 Step 1 (เบี้ยเพิ่ม → อนุมัติ → issue → จ่าย debit note); Seed: Endorsements |
| 30 | Policy Cancellation | `policy.e2e` (short-rate, ผ่อน 3 งวด, clawback); PW phase5 Step 2; Seed: Cancellation |
| 31 | Refund | `refund.e2e` (request → approve → process, ผู้อนุมัติ ≠ ผู้ขอ); PW phase5 Step 3; Seed: 4 สถานะ |
| 32 | Renewal Pipeline | `renewal.e2e`; PW phase6 Step 2; Seed: Renewals (RENEWED / CUSTOMER_CONTACTED) |
| 33 | Claim | **นอกขอบเขต v2.0.0** (Backlog) |
| 34 | Task / Follow-up | `task.e2e`, `security-review.e2e` T1–T2; PW phase6 Step 1; Seed: Tasks |
| 35 | Notification | `notification.service.spec` + `payment.e2e` D1–D2; Seed: 14 ชนิด; อีเมล 4 event ผ่าน BullMQ→Mailpit |
| 36 | Audit Log | `audit.service.spec`, `audit-v2.spec`; ทุก action เรียก `audit.log` ใน transaction; หน้า `/audit-logs` (PW acceptance) |
| 37 | Role / Permission / Data Scope | `route-permissions.e2e` (ทุก route มี guard), `security-review.e2e` S1–S2 + M1 + R1, `report.e2e` (export/dashboard ตาม scope), `data-scope-apply.spec`; ตาราง `SYSTEM_FLOW_V2.md` §7 (test เทียบกับ seed) |
| 38 | Master Data | `master.e2e`, `insurer.e2e` (ผู้ติดต่อ/ผลิตภัณฑ์/อัตรา), หน้า Master + system settings |

## ผลรัน (ก่อน release)

บันทึกใน PLAN_V2 → Log "Day 42–47" (ตัวเลข unit / e2e / Playwright สองรอบติดกัน)

## ข้อจำกัดที่ทราบ (ไม่ขวาง v2.0.0)

- Claim และ LINE notification อยู่ Backlog
- สลักหลังประเภทแก้ข้อมูล (ลูกค้า/ที่อยู่/รถ) บันทึก before/after + snapshot แต่ไม่แก้ทะเบียนลูกค้าให้อัตโนมัติ (OQ-25)
- `npm run db:reset` ต้องรันโดยผู้ใช้ (Prisma ไม่อนุญาตให้ agent) — ตรวจเทียบเท่าแล้วบน DB ชั่วคราว
- ตัวตั้งเวลางานรายวัน (BullMQ) ต้องมี Redis; เรียกด้วยมือได้ที่ `*/process-daily` สำหรับ `maintenance.run`
