# Development Plan — Insurance Broker System V2

> แผนนี้ทำตาม [Insurance_Broker_Workflow_V2.md](Insurance_Broker_Workflow_V2.md) (อ้างอิงเป็น "V2 §N") ขอบเขต **P0 + P1** ไม่รวม Claim และ P2 ทั้งหมด (อยู่ใน Backlog ท้ายไฟล์)
> สภาพระบบก่อนเริ่มดูที่ [SYSTEM_FLOW.md](SYSTEM_FLOW.md) · Design อ้างอิง [DESIGN.md](DESIGN.md) · แผน V1 (ปิดแล้ว) อยู่ที่ [PLAN.md](PLAN.md)
>
> **วิธีใช้:** พิมพ์ `/daily-task` แล้ว Claude จะหา Day ที่ยังไม่เสร็จในไฟล์นี้ ทำงาน verify และติ๊ก checkbox ให้
> ติ๊ก `[x]` เฉพาะข้อที่ **verify แล้ว** · งานที่ไม่เสร็จให้ยกไปวันถัดไปใน Log
> **กฎ:** วันใดที่ "Done เมื่อ" ยังไม่ครบ ห้ามข้ามไปวันถัดไป ยกเว้นระบุว่ายกงานไปใน Log
> **Git:** ทำบน branch `v2` จบแต่ละ Phase merge เข้า `main` (commit/merge เมื่อผู้ใช้สั่งเท่านั้น) จบแผน tag `v2.0.0`
> **Data:** ยังไม่มีข้อมูลจริง ใช้ migration ปกติ + แก้ seed/mock ให้ครบ V2 ไม่ต้องเขียน data migration แปลงข้อมูลเก่า

---

## ภาพรวม

| Phase | Days | ขอบเขต (V2 §) | ผลลัพธ์เมื่อจบ Phase |
|---|---|---|---|
| 0. Foundation fixes | D1–D5 | §5.1, §25, §26, SYSTEM_FLOW §10 | แก้จุดค้าง V1, Branch/Team data scope, Audit ครบ, โครง Notification |
| 1. Document & Underwriting | D6–D10 | §7, §8 | Document version/verify/expiry, Underwriting ก่อนขอราคา |
| 2. Quotation & Proposal | D11–D17 | §9–§12 | Quotation version/expiry, Proposal version + revise, Acceptance evidence |
| 3. Approval, Binding, Policy | D18–D22 | §13–§15, §20.1 | Approval reject/resubmit, Binding lifecycle, Policy lifecycle |
| 4. Billing & Commission | D23–D30 | §16–§18 | Invoice งวดผ่อน, Payment/Receipt, AR, Commission auto + Statement |
| 5. Endorsement & Cancellation | D31–D36 | §19, §20.2–20.3 | Endorsement, Policy cancellation, Refund, Credit/Debit note |
| 6. Renewal, Task, Notification | D37–D41 | §21, §23, §24 | Renewal pipeline, Task กลาง, แจ้งเตือนครบ 12 event |
| 7. Insurer & Release | D42–D47 | §27, §31 | Insurer management, report, seed V2, E2E ครบ, v2.0.0 |

---

## การตัดสินใจ V2 (ตอบแล้ว 2026-10-08)

| # | เรื่อง | คำตอบ |
|---|---|---|
| D-1 | ขอบเขต | P0 + P1; Claim และ P2 ไป Backlog |
| D-2 | Underwriting | Config ต่อ Product (`requireUnderwriting`); ถ้าเปิด ต้อง APPROVED ก่อน request quotation; ผู้ review = permission `underwriting.review` (BROKER_STAFF/SUPERVISOR/MANAGER/ADMIN) ไม่เพิ่ม role |
| D-3 | Risk Score | Underwriter เลือก Risk Level `LOW/MEDIUM/HIGH` + reason/condition/exclusion/deductible/required survey/document เอง ไม่มี rule engine; Risk Level ใช้เป็นเงื่อนไข Approval Rule ได้ |
| D-4 | ลูกค้าต่อรองหลังส่ง Proposal | action `revise` จาก WAITING_CUSTOMER (รวม Proposal EXPIRED) และ APPROVAL_REJECTED → Job กลับ `QUOTATION_RECEIVED`; Proposal เดิม `SUPERSEDED`; Quotation version ใหม่ → select → Proposal version ถัดไป |
| D-5 | Quotation status | `REQUESTED → RECEIVED → SELECTED / REJECTED / EXPIRED / WITHDRAWN` + `SUPERSEDED` (version เก่า); ไม่มี ACTIVE; ใบที่ไม่ถูกเลือกคง RECEIVED จน Job ปิด/ออกกรมธรรม์จึงเป็น REJECTED |
| D-6 | Acceptance evidence | EMAIL / SIGNED_DOCUMENT / LINE ต้องแนบไฟล์; MANUAL ต้องกรอก remark; เก็บชื่อผู้ยอมรับฝั่งลูกค้า + เวลา + IP ของพนักงานที่บันทึก; ไม่มี PORTAL จนกว่าจะทำ Portal |
| D-7 | Approval reject | Job → `APPROVAL_REJECTED` แล้วเลือกได้ 2 ทาง: `resubmit` (แนบเหตุผล/เอกสาร สร้าง Approval ใหม่ → WAITING_APPROVAL) หรือ `revise` (D-4) หรือ cancel |
| D-8 | Approval rule | ชั้นเดียว เข้าหลายกฎใช้ระดับสูงสุด; เพิ่มเงื่อนไข product / insurance type / risk level; seed ใหม่: เบี้ย < 100,000 ไม่ต้องอนุมัติ, SUPERVISOR ได้ `approval.approve` |
| D-9 | Binding | bind → Binding `SUBMITTED`, Job ค้าง `BINDING`; `confirm` (binder no./date/document) → `POLICY_PENDING`; insurer reject → Binding `REJECTED`, Job กลับ APPROVED/CUSTOMER_ACCEPTED เพื่อ bind ใหม่ หรือ revise หรือ cancel |
| D-10 | Policy status | ตามวันที่ ไม่ผูกการชำระ: issue → `ACTIVE` (หรือ `PENDING` ถ้าวันเริ่มอยู่ในอนาคต); ≤ 90 วันก่อนหมด → `EXPIRING`; เลยวันหมด → `EXPIRED`; ต่ออายุสำเร็จ → `RENEWED`; **Job ปิด `CLOSED` อัตโนมัติตอน issue** |
| D-11 | Invoice | Broker เก็บเบี้ยจากลูกค้า; Payment Term (master: เต็มจำนวน / ผ่อน N งวด) เลือกตอนสร้าง Proposal; ตอน issue ระบบสร้าง Invoice ครบทุกงวด (1 งวด = 1 Invoice มี due date); Receipt ต่อ Payment; Invoice/Receipt/Credit Note/Debit Note มี PDF; การนำส่งเบี้ยให้บริษัทประกัน (AP) อยู่ Backlog |
| D-12 | Commission คำนวณ | Gross = Net Premium × rate ของ quotation ที่เลือก (default จาก Commission Rate master ต่อ Insurer×Product); Agent Share % ต่อ Agent (มี default ระบบ); Broker Share = ส่วนที่เหลือ; Override กรอกเอง; WHT หักจาก Agent Share ตามอัตราใน master; สร้างอัตโนมัติตอน issue |
| D-13 | Commission status | `CALCULATED` (auto) → approve โดย FINANCE → `APPROVED` → ระบบเปลี่ยน `PAYABLE` เมื่อ Invoice ทุกงวดของ Policy จ่ายครบ → markPaid ผ่าน Commission Statement → `PAID`; Adjustment เป็นรายการ +/- แยก ไม่แก้รายการเดิม |
| D-14 | Endorsement | Structured: แก้ได้เฉพาะฟิลด์ที่กำหนดต่อ type; เก็บ before/after JSON; ตอน ISSUED apply เข้า Policy + เก็บ snapshot (Policy version); เบี้ยเพิ่ม → Debit Note, เบี้ยคืน → Credit Note + Refund; commission ปรับอัตโนมัติ |
| D-15 | เบี้ยปรับ / เบี้ยคืน | กรอกตามที่บริษัทประกันแจ้ง + ปุ่ม "คำนวณให้" (pro-rata รายวันสำหรับ endorsement, short-rate table ใน master สำหรับผู้เอาประกันขอยกเลิก) อากร/VAT ใช้สูตรเดิม |
| D-16 | อนุมัติหลังออกกรมธรรม์ | Endorsement: ผ่าน Approval Rule (`entityType = ENDORSEMENT` ไม่เข้ากฎ = ไม่ต้องอนุมัติ); Policy Cancellation: MANAGER อนุมัติเสมอ + ต้องมีเอกสารยืนยันจากบริษัทประกัน; Refund: staff ขอ → FINANCE approve → FINANCE process (คนละคน) |
| D-17 | ผลของ Policy cancellation | Invoice ที่ due หลังวันยกเลิกและยังไม่จ่าย → `CANCELLED`; เบี้ยคืน → Credit Note + Refund; Commission → Adjustment ติดลบตามสัดส่วนเบี้ยที่คืน (clawback) ตัดใน statement ถัดไป |
| D-18 | Renewal | สถานะตาม V2 §21.2 sync อัตโนมัติจาก Renewal Job; ก่อนมี Job กด `contactCustomer` เองได้; งานรายวันสร้าง Task ตาม timeline 90/60/45/30/15/7 วัน (ถ้ายังไม่ถึงขั้นนั้น) + notification; Policy หมดอายุก่อนต่อ → Renewal `EXPIRED`; ไม่สร้าง Job อัตโนมัติ |
| D-19 | Job status ปลายทาง | ต่ออายุเริ่มจาก Policy (ไม่แตะ Job เดิมที่ CLOSED); เลิกใช้ transition ไป Job `RENEWAL` (ใช้ `source = RENEWAL` + `previousPolicyId`); Job `EXPIRED` = Renewal Job ที่ยังไม่ออกกรมธรรม์จนกรมธรรม์เดิมหมดอายุ (งานรายวันตั้งให้) |
| D-20 | Notification | In-app ครบ 12 event (V2 §24); Email (BullMQ → SMTP/Mailpit) เฉพาะ Approval Requested, Payment Overdue, Policy Expiring, Task Overdue; ผู้ใช้ปิด email ราย event ได้; LINE ไป Backlog |
| D-21 | Data scope | Master Branch; User มี `branchId` + `managerId`; scope ต่อ role: AGENT = OWN, BROKER_STAFF = ASSIGNED + BRANCH, SUPERVISOR/MANAGER = TEAM, FINANCE/VIEWER/ADMIN = ALL; Customer เห็นเฉพาะที่ตัวเองสร้าง + ลูกค้าของ Job ที่เห็นได้ (ปิด Q11 ของ V1) |
| D-22 | Document verification | Submit Job นับเอกสาร UPLOADED ขึ้นไป; Underwriting approve และ Bind ต้อง VERIFIED; ผู้ verify = `document.verify` (BROKER_STAFF/SUPERVISOR/ADMIN) ห้าม verify เอกสารที่ตัวเอง upload; upload ประเภทเดิมซ้ำ = version ใหม่; เลย expiryDate → EXPIRED ไม่นับ |
| D-23 | Insurer management | หน้า Insurer เต็ม: ผู้ติดต่อ/Underwriter หลายคน, Product ที่รับ + Commission Rate ต่อ Product (มีช่วงวันที่มีผล), บัญชีธนาคาร/Tax ID, สถิติ (จำนวน quotation, อัตราได้งาน, เบี้ยรวม) |
| D-24 | ลำดับงาน | Phase 0 แก้ V1 + cross-cutting ก่อน แล้วตาม V2 §34 |
| D-25 | Done ต่อวัน | วันที่แตะ workflow: unit test domain + e2e API + lint/build ผ่าน; วัน UI: เปิดหน้าจอใช้ได้จริง; Playwright ตอนจบ Phase |
| D-26 | ยกเลิก Job | ก่อน Binding SUBMITTED ยกเลิกได้ทันที (approvedBy = ผู้ยกเลิก); ตั้งแต่ BINDING / POLICY_PENDING ต้อง `requestCancel` → MANAGER อนุมัติ |

### Job state machine V2 (สรุปจากการตัดสินใจข้างบน)

| จาก | Action | ไป | หมายเหตุ |
|---|---|---|---|
| DRAFT | submit | OPEN | เอกสาร UPLOADED ครบ (ถ้า product กำหนด) |
| OPEN | requestInfo / resume | WAITING_INFORMATION ⇄ OPEN | เหมือน V1 |
| OPEN | underwriting INFO_REQUIRED | WAITING_INFORMATION | ดู OQ-1 |
| OPEN | underwriting REJECTED | CLOSED | `closeReason = UNDERWRITING_REJECTED` |
| OPEN | requestQuotation | QUOTATION_REQUESTED | ต้อง underwriting APPROVED ถ้า product กำหนด |
| QUOTATION_RECEIVED | selectQuotation | QUOTATION_SELECTED | version ล่าสุด ไม่หมดอายุ |
| QUOTATION_SELECTED | sendProposal | PROPOSAL_SENT → WAITING_CUSTOMER | เหมือน V1 |
| WAITING_CUSTOMER | accept | CUSTOMER_ACCEPTED / WAITING_APPROVAL | evidence ตาม D-6 |
| WAITING_CUSTOMER | reject | CUSTOMER_REJECTED → CLOSED | เหมือน V1 |
| WAITING_CUSTOMER, APPROVAL_REJECTED | **revise** | QUOTATION_RECEIVED | ใหม่ (D-4) |
| WAITING_APPROVAL | approve / **reject** | APPROVED / **APPROVAL_REJECTED** | ใหม่ (D-7) |
| APPROVAL_REJECTED | **resubmit** | WAITING_APPROVAL | ใหม่ |
| CUSTOMER_ACCEPTED, APPROVED | bind | BINDING | Binding SUBMITTED, เอกสาร VERIFIED |
| BINDING | **confirmBinding** | POLICY_PENDING | ใหม่ (D-9) |
| BINDING | **insurerRejectBinding** | APPROVED / CUSTOMER_ACCEPTED | ใหม่ (กลับสถานะก่อน bind) |
| POLICY_PENDING | issuePolicy | POLICY_ISSUED → CLOSED | ปิดอัตโนมัติ (D-10) |
| ก่อน BINDING | cancel | CANCELLED | ทันที |
| BINDING, POLICY_PENDING | **requestCancel → approveCancel** | CANCELLED | MANAGER อนุมัติ (D-26) |
| Renewal Job ที่ยังไม่ออกกรมธรรม์ | (งานรายวัน) | EXPIRED | D-19 |

---

## Open Questions

> ข้อที่ตัดสินจากคำตอบข้างบนแล้วแต่ยังเป็นรายละเอียดที่ผู้ใช้อาจอยากแก้ ใช้ default ในวงเล็บไปก่อน ถ้าคำตอบต่างให้แก้ DESIGN.md ด้วย

| # | คำถาม | Default ที่ใช้ | ต้องรู้ก่อน |
|---|---|---|---|
| OQ-1 | Underwriting INFO_REQUIRED ทำให้ Job เป็น WAITING_INFORMATION หรือไม่ | ใช่ และ `resume` จะส่ง underwriting กลับเป็น PENDING เพื่อ re-review | D8 |
| OQ-2 | Payment Term ที่ seed | เต็มจำนวน (due 30 วัน), ผ่อน 3 งวด, ผ่อน 6 งวด (ห่างงวดละ 1 เดือน) | D13 |
| OQ-3 | แบ่งเงินงวดผ่อนไม่ลงตัว | หารเท่ากันปัด 2 ตำแหน่ง เศษไปงวดสุดท้าย; อากร/VAT อยู่ในงวดแรก | D23 |
| OQ-4 | จ่ายเกินยอด Invoice | ไม่อนุญาต (เหมือน BR-011) ต้องแยกจ่ายหลาย Invoice เอง | D24 |
| OQ-5 | อัตรา WHT ของ commission | 3% ตั้งค่าได้ใน master (System Setting) | D26 |
| OQ-6 | Agent Share default | 50% ของ Gross ตั้งค่าได้ต่อ Agent | D26 |
| OQ-7 | ค่าใน short-rate table ที่ seed | ตารางตัวอย่างที่ใช้กันทั่วไป (ต้องให้ธุรกิจยืนยันก่อนใช้จริง) | D33 |
| OQ-8 | Task status | คงชื่อ V1 (`TODO/IN_PROGRESS/DONE/CANCELLED`) OVERDUE เป็นค่าที่คำนวณ ไม่เก็บ | D37 |
| OQ-9 | Approval Rule seed สำหรับ ENDORSEMENT | เบี้ยปรับ (absolute) ≥ 10,000 → MANAGER | D32 |
| OQ-10 | Payment V1 ระดับ Policy (`POST /policies/:id/payments`, สิทธิ์ `payment.overpay`) | เลิกใช้: Payment บันทึกได้เฉพาะผูก Invoice (`POST /invoices/:id/payments`); Payment เดิมที่ไม่มี invoice เก็บไว้อ่านได้/ยกเลิกได้ ตัด overpay (ขัดกับ OQ-4) หน้าจอ payment เดิมต้องปรับใน D28 | D24 |
| OQ-11 | OVERDUE ของ Invoice | เก็บใน DB: งานรายวันตั้ง OVERDUE และ recompute ทุกครั้งที่ payment เปลี่ยน (ใช้ `computeInvoiceStatus` ตัวเดียวกัน); จ่ายบางส่วนหลังเลย due ยังเป็น OVERDUE; แจ้งเตือน PAYMENT_DUE/OVERDUE อย่างละครั้งต่อ invoice (`dueReminderSentAt`/`overdueNotifiedAt`) | D24 |
| OQ-12 | Aging ของ `/receivables` | นับวันเลย due (Asia/Bangkok): วัน due ไม่ถือว่าเลย, 1–30 = "0–30", 31–60, 61–90, ≥91 = "90+"; ยังไม่ถึงกำหนดแยก bucket `NOT_DUE`; ไม่นับ CREDIT_NOTE/CANCELLED/PAID | D24 |
| OQ-13 | ผู้รับ PAYMENT_DUE/PAYMENT_OVERDUE และฟิลด์ Receipt | เจ้าของ Job (agent) + broker staff; Receipt เก็บ `issuedAt/voidedAt/voidReason/voidedBy` | D24 |
| OQ-14 | รูปแบบ Billing PDF | เรนเดอร์สดจาก DB ทุกครั้ง ไม่เก็บเป็น Document (ตัวเลขไม่เคยเพี้ยนจากระบบ); "ตัวเลขไทย/บาท" = วันที่ พ.ศ. + จำนวนเงินตัวอักษร (`thaiBahtText`) ส่วนตัวเลขใช้เลขอารบิกเหมือน Proposal; Invoice CANCELLED / Receipt VOID พิมพ์ได้แต่มี watermark; Receipt แสดง "ชำระสะสม/คงเหลือ ณ ใบเสร็จนั้น" (นับจาก payment ที่ยัง active และเกิดไม่หลังใบนั้น); Credit/Debit Note ยังไม่มีบรรทัดอ้างอิงใบแจ้งหนี้เดิม (ยังไม่มีฟิลด์ลิงก์ — เพิ่มใน Phase 5 ตอนสร้าง note จริง); สิทธิ์ = `invoice.view` (invoice) / `payment.view` (receipt) + data scope ของ Job | D25 |
| OQ-15 | สูตรค่าคอม | Gross = เบี้ยสุทธิของ Policy × อัตรา; agent = Gross × agentShare%; override = Gross × override% (ให้ manager โดยตรงของ Agent, ตัดจากส่วน broker); broker = Gross − agent − override (เศษอยู่ที่ broker จึงรวมเท่า Gross เสมอ); ปัดครึ่งขึ้น 2 ตำแหน่ง | D26 |
| OQ-16 | ที่มาของอัตรา | อัตราของ quotation version ที่ถูกเลือก (ซึ่งตอนบันทึกราคาจะถูกเติมจาก master ให้อยู่แล้ว D11) → ถ้าไม่มีใช้ `commission_rates` ตามบริษัท+ผลิตภัณฑ์+วันเริ่มคุ้มครองของกรมธรรม์; ไม่พบเลย → ออกกรมธรรม์ได้ ไม่สร้างค่าคอม บันทึก audit `COMMISSION_SKIPPED` แล้วให้ FINANCE เรียก `POST /policies/:id/commissions/calculate` ภายหลัง | D26 |
| OQ-17 | WHT / Net | WHT 3% หักจากยอดของแต่ละผู้รับ (agent, manager) ส่วน broker ไม่หัก; net = share − WHT; Override rate default 0% (ยังไม่คิดจนกว่าตั้งค่าใน System Setting `commission.override_rate`) | D26 |
| OQ-18 | โครงสร้างข้อมูลค่าคอมและ lifecycle | หนึ่งแถวต่อผู้รับต่อ Policy (`AGENT`, `TEAM` สำหรับ override); `commissionAmount` = ส่วนของผู้รับก่อน WHT, `grossAmount` = ค่าคอมทั้งกรมธรรม์, `brokerShareAmount` เก็บที่แถว AGENT; แถว V1 ที่กรอกเองคงไว้อ่านได้แต่อนุมัติไม่ได้; คำนวณใหม่ได้เฉพาะตอนทุกแถวยัง CALCULATED (แถวเก่า → CANCELLED); APPROVED → PAYABLE เมื่อ invoice ที่ไม่ยกเลิกทุกใบ PAID และกลับเป็น APPROVED ถ้ามีการยกเลิก payment; อนุมัติหลังจ่ายครบแล้วเป็น PAYABLE ทันที | D26 |
| OQ-19 | งวดของ Statement | statement หนึ่งใบต่อผู้รับต่อเดือน (Asia/Bangkok, ไม่นับใบ CANCELLED); รวมทุกแถวที่ PAYABLE และยังไม่อยู่ใน statement โดย `payableAt` ≤ สิ้นเดือนนั้น (ยกยอดเดือนก่อนที่ตกค้างมาด้วย); เดือนอนาคตสร้างไม่ได้ | D27 |
| OQ-20 | Adjustment และ WHT | adjustment เป็นแถวใหม่ที่มีเครื่องหมาย (+/−) ไม่แก้แถวเดิม; WHT คิดจาก `whtRate` ของแถวค่าคอมเดิม (ไม่ใช้เรตปัจจุบัน) ทำได้กับแถว V2 ที่ APPROVED/PAYABLE/PAID; ผูกอ้างอิง endorsement/cancellation ต้องใส่ทั้ง type+id หรือไม่ใส่เลย | D27 |
| OQ-21 | หักคืน (clawback) | ยอดติดลบรวมต่อแถวเดิมต้องไม่เกินส่วนแบ่งเดิม; statement ห้ามติดลบ — adjustment เรียงเก่าสุดก่อน นำมาหักได้ตราบที่ยอดสุทธิสะสม ≥ 0 ที่เหลือค้าง PENDING ยกไป statement ถัดไป; ยืนยัน statement ที่ net < 0 ไม่ได้ (`STATEMENT_NEGATIVE`) | D27 |
| OQ-22 | แถวที่อยู่ใน Statement แล้ว | ไม่ถูกดึงกลับเมื่อ payment/invoice เปลี่ยนภายหลัง (syncPayable ข้ามแถวที่มี statementId); ยกเลิก statement ที่ยังไม่จ่ายจะปล่อยรายการกลับ; ใบที่ PAID ยกเลิกไม่ได้ | D27 |
| OQ-23 | `GET /commissions/summary` | จัดกลุ่ม agent/policy/insurer/period/product; period = เดือนที่ออกกรมธรรม์; gross และ broker share นับครั้งเดียวต่อ policy (จากแถว AGENT); แสดงยอด adjustment แยก (`adjustmentNet`) และ `totalNet`; ผู้ไม่มี scope เห็นเฉพาะของตน | D27 |
| OQ-24 | สถิติบริษัทประกัน (`GET /insurers/:id/stats`) | อัตราได้งาน = SELECTED ÷ ใบเสนอราคาที่ได้รับราคาแล้ว (ไม่นับ REQUESTED/CANCELLED); เบี้ยรวมที่ออกกรมธรรม์ไม่นับ DRAFT/CANCELLED แยกยอดที่ยกเลิก; ต้องมี `report.view` | D42 |
| OQ-25 | สลักหลังประเภทแก้ข้อมูล (ลูกค้า/ที่อยู่/รถ/ความคุ้มครอง) | บันทึก before/after + snapshot `policy_versions` เท่านั้น — **ไม่** อัปเดตทะเบียนลูกค้า/ที่อยู่/รถโดยอัตโนมัติ; ที่ระบบ apply ให้คือ `sumInsured`, วันเริ่ม/สิ้นสุด และเบี้ย (debit/credit note) | D47 |
| OQ-26 | อนุมัติสลักหลัง | ใช้ `approval.approve` + ระดับ role ≥ `approverRole` ของกฎที่เข้า (เก็บเป็น `required_approver_role` ตอน submit) + ห้ามอนุมัติของตัวเอง (ADMIN มี `approval.approve_own` นอก production) | D46 |
| OQ-27 | งานรายวันทั้งระบบ (`*/process-daily`, `expire-outdated`, `daily-check`) | ต้องมีสิทธิ์ `maintenance.run` (ADMIN) — เดิมเปิดให้ role ทั่วไป; ตัวตั้งเวลา BullMQ เรียก service ตรงจึงไม่กระทบ | D46 |
| OQ-28 | อัตราค่าคอมของบริษัทประกัน | เห็นได้เฉพาะ `commission.rate_view` (ADMIN, FINANCE, MANAGER, SUPERVISOR, BROKER_STAFF) — AGENT/VIEWER ไม่เห็น (API ซ่อนทั้ง `/master/commission-rates` และ rate ใน `/insurers/:id/products` และ `/master/companies/:id`) | D46 |
| OQ-29 | Task ที่ไม่ผูก Job | ผู้สร้างเป็นผู้รับผิดชอบโดยปริยาย; เห็น/แก้ได้เฉพาะผู้เกี่ยวข้อง (ผู้สร้าง, ผู้รับ, ผู้เห็น Job/Policy นั้น); ผูกกับ policy/customer ที่ตัวเองมองไม่เห็นไม่ได้ (404) | D46 |
| OQ-30 | เงินในสลักหลัง | รับเป็น decimal string (ยังรับ number เดิมแล้วปัดเป็น 2 ตำแหน่ง); `total = net + stamp + vat` ต้องตรงเป๊ะ, NO_CHANGE ต้องเป็นศูนย์ → 422 `ENDORSEMENT_INVALID_AMOUNTS` | D47 |

---

## Phase 0 — Foundation fixes & Cross-cutting

### Day 1 — แก้จุดค้างจาก V1 + Job Assignment
**เป้าหมาย:** ปิดข้อสังเกตใน SYSTEM_FLOW §3 และ §10 ก่อนต่อยอด

- [x] `POST /jobs/:id/assign` ตรวจ `job.assign` (แทน `job.update`) ให้ MANAGER/SUPERVISOR มอบหมายได้
- [x] Model `job_assignment_history` (from/to user, role AGENT/BROKER_STAFF/MANAGER, reason, changedBy, changedAt) + บันทึกทุกครั้งที่ assign/reassign (V2 §5.1)
- [x] เพิ่ม `Job.brokerStaffId` (ผู้รับผิดชอบฝั่ง broker) แยกจาก Agent
- [x] Binding.effectiveDate ใช้วันเริ่มคุ้มครองของ Job (ตรวจ 1)
- [x] seed/mock Job ผ่าน `JobWorkflowService` ให้มี status history (ตรวจ 7) หรือสร้าง history ให้ตรง
- [x] อัปเดต TESTING_FLOW.md ให้ตรงโค้ด (SYSTEM_FLOW §10 ข้อ 1–5)

**Done เมื่อ:**
- [x] e2e: MANAGER assign ได้, AGENT assign Job คนอื่นไม่ได้, history มี 2 แถวหลัง reassign
- [x] `npm run lint && npm run build` ผ่าน

### Day 2 — Branch, Team & Data Scope (domain)
- [x] Master `branches` (code, name, address, active) + CRUD (`master.manage`)
- [x] `User.branchId`, `User.managerId` + แก้ user management API
- [x] Permission scope: `ROLE_DATA_SCOPE` (OWN / ASSIGNED / TEAM / BRANCH / ALL) ตาม D-21 ใน seed
- [x] `domain/data-scope.ts` pure fn → Prisma `where` สำหรับ Job, Customer, Policy (+ unit test ครบทุก scope)
- [x] TEAM = ตัวเอง + ผู้ใต้บังคับบัญชา (recursive ผ่าน `managerId`)

**Done เมื่อ:**
- [x] unit test data-scope ครอบคลุม 5 scope × 3 entity ผ่าน

### Day 3 — Data Scope (apply) 
- [x] ใช้ data scope ใน list/get/action ของ Job, Customer, Policy, Quotation, Proposal, Payment, Commission, Task, Renewal (ของที่ผูก Job ใช้ scope ของ Job)
- [x] Customer: เห็นที่ตัวเองสร้าง + ลูกค้าของ Job ที่เห็นได้ (D-21) — อัปเดต Q11 ใน PLAN.md เป็น resolved
- [x] Dashboard/Export เคารพ scope
- [x] seed: 2 branch, user ตัวอย่างกระจาย branch/manager

**Done เมื่อ:**
- [x] e2e: agent เห็นเฉพาะของตัวเอง; staff สาขา A ไม่เห็น Job สาขา B ที่ไม่ได้ถูก assign; staff สาขา A เห็น Job สาขา B ถ้าถูก assign; manager เห็นทีม; finance เห็นทั้งหมด; GET by id นอก scope → 404

### Day 4 — Audit Log V2 + Notification infrastructure
- [x] `ActivityLog` เพิ่ม `source` (WEB/API/JOB/IMPORT) และ `remark`; helper diff before/after เฉพาะฟิลด์ที่เปลี่ยน (V2 §25)
- [x] ตรวจทุก service ที่แก้ข้อมูลสำคัญว่าเรียก audit พร้อม before/after (quotation, policy, payment, master)
- [x] `GET /audit-logs` (filter user/entity/action/date, permission `audit.view` ให้ ADMIN/MANAGER)
- [x] Notification: `NotificationService.emit(event, recipients, payload)` + mapping event → recipients; email queue (BullMQ) + template; `notification_preferences` (user × event × email on/off)
- [x] ต่อ event ที่มีอยู่แล้วใน V1 ให้ถูกส่งจริง (ตรวจ 2): QUOTATION_RECEIVED, APPROVAL_REQUESTED, POLICY_ISSUED

**Done เมื่อ:**
- [x] e2e: แก้เบี้ย quotation → audit มี before/after; approval requested → in-app notification ถึงผู้อนุมัติ + email ใน Mailpit

### Day 5 — Phase 0 UI + Review
- [x] UI: Master Branch, ฟิลด์ branch/manager ในหน้า User, หน้า Audit Log (`/audit-logs`)
- [x] UI: Job detail แสดง Broker Staff + ประวัติการ assign
- [x] UI: ตั้งค่า notification preferences (หน้า profile)
- [x] `npm run gen:api`

**Done เมื่อ:**
- [x] เปิดหน้าจอทั้งหมดข้างบนใช้งานได้จริง
- [x] Phase review: `/dod-check` job, customer, audit

---

## Phase 1 — Document & Underwriting

### Day 6 — Document V2 API
- [x] `DocumentStatus` V2: REQUIRED / UPLOADED / UNDER_REVIEW / VERIFIED / REJECTED / EXPIRED
- [x] Document version: upload ประเภทเดิมซ้ำบน Job เดียวกัน = version+1, version เก่าเก็บไว้ (ไม่ลบ)
- [x] Fields: verifiedBy, verifiedAt, expiryDate, remark; actions `verify`, `reject` (reason required) ด้วย `document.verify`; ห้าม verify ของที่ตัวเอง upload (422)
- [x] `domain/document-checklist.ts`: `isComplete(checklist, docs, level: 'UPLOADED' | 'VERIFIED')`
- [x] งานรายวัน: เลย expiryDate → EXPIRED
- [x] Submit ใช้ level UPLOADED (D-22)

**Done เมื่อ:**
- [x] unit test checklist; e2e: verify ของตัวเอง → 422, upload ซ้ำได้ version 2, เอกสารหมดอายุไม่นับ

### Day 7 — Document V2 UI
- [x] Tab เอกสาร: checklist แสดงสถานะ (required/optional), version history, ปุ่ม verify/reject ตาม capabilities, วันหมดอายุ
- [x] Master Document Checklist: required/optional ต่อ product

**Done เมื่อ:**
- [x] upload → verify (อีก user) → checklist เปลี่ยนเป็นครบ ทำได้บนหน้าจอ

### Day 8 — Underwriting API
- [x] Product: `requireUnderwriting` (master)
- [x] Model `underwritings` (jobId, version, status PENDING/INFO_REQUIRED/APPROVED/REJECTED, riskLevel, underwriterId, reason, condition, exclusion, deductible, requiredSurvey, requiredDocuments, reviewedAt)
- [x] Actions (`/workflow-action`): `requestReview` (OPEN; เอกสาร VERIFIED ครบ), `approve`, `requireInfo` (→ Job WAITING_INFORMATION, OQ-1), `reject` (→ Job CLOSED), `resume` ส่งกลับ PENDING
- [x] Rule: `requestQuotation` ต้องมี underwriting APPROVED ถ้า product กำหนด (422 `UNDERWRITING_REQUIRED`)
- [x] Permission `underwriting.review`; maker-checker: ผู้ขอ review ไม่ใช่ผู้ approve
- [x] Audit + notification (in-app ถึงเจ้าของ Job)

**Done เมื่อ:**
- [x] e2e: product ต้อง UW → request quotation ก่อน approve = 422; info required → WAITING_INFORMATION → resume → approve → request quotation ได้; reject → CLOSED

### Day 9 — Underwriting UI
- [x] Tab Underwriting ใน Job detail (ฟอร์ม review, ประวัติแต่ละรอบ)
- [x] Inbox underwriting ที่ PENDING (`/underwriting`)
- [x] Master Product: toggle requireUnderwriting

**Done เมื่อ:**
- [x] flow D8 ทำได้ครบบนหน้าจอ

### Day 10 — Phase 1 Buffer + Review
- [x] Playwright: Job → upload → verify → underwriting → request quotation (`apps/web/e2e/phase1-document-underwriting.spec.ts`, 8/8 ผ่าน)
- [x] `/dod-check` document, underwriting (document 16/18, underwriting 12/12 — ดู log วันนี้)
- [x] อัปเดต DESIGN.md (state machine §7.1, Document/Underwriting status §7.3, Job tab §9.4)

**Done เมื่อ:**
- [x] unit (378/378) + e2e API (197/206, เหลือ 9 fail เดิมที่เป็น test เขียนผิดจาก Day ก่อนๆ ไม่เกี่ยวกับ Phase 1) + Playwright (8/8) ผ่าน

---

## Phase 2 — Quotation, Proposal, Acceptance

### Day 11 — Quotation Version (schema) + Commission Rate master
- [x] Master `commission_rates` (insurerId, productId, rate, effectiveFrom, effectiveTo) — ใช้ต่อใน D26 และ D42
- [x] แยก `Quotation` (ต่อ insurer ต่อ Job: quotationNumber, insurer, status) กับ `QuotationVersion` (version, quotationDate, validUntil, net/tax/stamp/gross, commissionRate/amount, deductible, coverage items, exclusion, specialCondition, insurerReference, underwriter, attachment, remark)
- [x] version เก่า → `SUPERSEDED` ไม่ overwrite (V2 §9.1)
- [x] commissionRate default จาก master ตามวันที่ใบเสนอราคา
- [x] Validation: validUntil > quotationDate, premium ≥ 0, insurer required

**Done เมื่อ:**
- [x] migration + seed ใหม่รันได้; unit test validation

### Day 12 — Quotation actions V2
- [x] `recordVersion` (RECEIVED → version ใหม่), `withdraw` (→ WITHDRAWN), `select` (ต้องเป็น version ล่าสุด, ไม่หมดอายุ)
- [x] งานรายวัน: validUntil < วันนี้ (Asia/Bangkok) → EXPIRED; notification QUOTATION_EXPIRING (ก่อนหมด 3 วัน — ดู Log ถ้าต้องเปลี่ยน)
- [x] ตอน Job CLOSED/ออกกรมธรรม์ → quotation ที่ไม่ถูกเลือก → REJECTED (D-5)
- [x] Comparison API: insurer, premium, coverage, limit, deductible, exclusion, condition, commission, validity ของ version ล่าสุด

**Done เมื่อ:**
- [x] e2e: version 2 ทำให้ v1 SUPERSEDED; select version เก่า → 422; select ที่หมดอายุ → 422; job ทำงานรายวันแล้วสถานะถูก

### Day 13 — Proposal Version + Payment Term + Revise
- [x] Master `payment_terms` (name, installments, intervalMonths, firstDueDays) + seed (OQ-2)
- [x] Proposal: version ต่อ Job, อ้าง QuotationVersion, paymentTermId, coverage summary, terms, conditions; status เพิ่ม `SUPERSEDED`
- [x] งานรายวัน: Proposal เลย validUntil → EXPIRED (Job คง WAITING_CUSTOMER)
- [x] Action `revise` (`/workflow-action`): WAITING_CUSTOMER / APPROVAL_REJECTED → QUOTATION_RECEIVED; proposal ปัจจุบัน SUPERSEDED; approval ค้าง → CANCELLED; quotation SELECTED → RECEIVED

**Done เมื่อ:**
- [x] e2e: send v1 → revise → quotation version ใหม่ → select → send ได้ Proposal v2; v1 SUPERSEDED

### Day 14 — Acceptance Evidence
- [x] Model `proposal_acceptances` (proposalVersion, acceptedByName, acceptedAt, method EMAIL/SIGNED_DOCUMENT/LINE/MANUAL, ipAddress ของผู้บันทึก, evidenceFileId, remark, recordedBy)
- [x] Rule (domain): method ≠ MANUAL ต้องมีไฟล์; MANUAL ต้องมี remark (422 `ACCEPTANCE_EVIDENCE_REQUIRED`)
- [x] `accept` รับ evidence แบบ multipart; reject เหมือน V1
- [x] Notification CUSTOMER_ACCEPTED / CUSTOMER_REJECTED ถึงเจ้าของ Job + staff

**Done เมื่อ:**
- [x] e2e: EMAIL ไม่มีไฟล์ → 422; MANUAL ไม่มี remark → 422; accept สำเร็จมี evidence ดูย้อนหลังได้

### Day 15 — Quotation UI V2
- [x] Tab Quotation: แต่ละ insurer แสดง version history, ปุ่ม record version/withdraw, badge หมดอายุ
- [x] หน้าเปรียบเทียบตามฟิลด์ D12 (highlight ค่าที่ดีที่สุด)
- [x] Master Commission Rate

**Done เมื่อ:**
- [x] flow D11–D12 ทำได้บนหน้าจอ

### Day 16 — Proposal / Acceptance UI V2
- [x] Tab Proposal: version list, เลือก Payment Term ตอนสร้าง, ปุ่ม revise, dialog accept พร้อม method + upload/remark
- [x] PDF Proposal แสดง version + payment term + งวดผ่อน
- [x] Master Payment Term

**Done เมื่อ:**
- [x] flow D13–D14 ทำได้บนหน้าจอ, PDF ถูกต้อง

### Day 17 — Phase 2 Buffer + Review
- [x] Playwright: quotation 2 version → compare → select → proposal → revise → proposal v2 → accept with evidence (`apps/web/e2e/phase2-quotation-proposal.spec.ts`)
- [x] `/dod-check` quotation, proposal (DoD 12/12 ทั้งสองโมดูล)
- [x] อัปเดต DESIGN.md + SYSTEM_FLOW (ส่วน quotation/proposal)

**Done เมื่อ:**
- [x] unit (456/456) + web unit (14/14) + Playwright flow พร้อมผ่าน

---

## Phase 3 — Approval, Binding, Policy

### Day 18 — Approval V2
- [x] ApprovalRule: เงื่อนไขใหม่ productId, insuranceTypeId, riskLevel; `entityType` (JOB / ENDORSEMENT)
- [x] Seed ใหม่ (D-8): < 100,000 ไม่ต้องอนุมัติ; SUPERVISOR ได้ `approval.approve`
- [x] `reject` → Job `APPROVAL_REJECTED` (เก็บ rejectReason, comment, rejectedBy/At) — แทน Q4 ของ V1
- [x] `resubmit` (reason + เอกสารแนบ) → Approval ใหม่ PENDING, Job WAITING_APPROVAL (เก็บ resubmittedBy/At)
- [x] Notification APPROVAL_REQUESTED (email), APPROVAL_REJECTED

**Done เมื่อ:**
- [x] unit test rule eval ใหม่; e2e: reject → APPROVAL_REJECTED → resubmit → approve; reject → revise; เบี้ย 50,000 ไม่ต้องอนุมัติ

### Day 19 — Binding lifecycle
- [x] Binding status PENDING/SUBMITTED/CONFIRMED/REJECTED/CANCELLED + fields binderNumber, binderDate, insurer, effectiveDate, premium, paymentCondition, underwriter, binderDocument, remark
- [x] `bind` → SUBMITTED, Job คง BINDING (ตัด auto hop ไป POLICY_PENDING); ต้องเอกสาร VERIFIED (D-22)
- [x] `confirmBinding` → CONFIRMED, Job POLICY_PENDING; `insurerRejectBinding` (reason) → REJECTED, Job กลับสถานะก่อน bind
- [x] Job cancel V2 (D-26): ก่อน BINDING ทันที; BINDING/POLICY_PENDING → `requestCancel` + `approveCancel`/`rejectCancel` (MANAGER) เก็บ reason, requestedBy, approvedBy, cancelledAt; binding → CANCELLED

**Done เมื่อ:**
- [x] e2e: bind → confirm → POLICY_PENDING; insurer reject → bind ใหม่ได้; cancel ที่ BINDING ต้องรออนุมัติ

### Day 20 — Policy lifecycle
- [x] Policy status V2: DRAFT/PENDING/ACTIVE/EXPIRING/EXPIRED/CANCEL_REQUESTED/CANCELLED/RENEWED (เลิกใช้ ISSUED)
- [x] issue → ACTIVE หรือ PENDING (วันเริ่มในอนาคต); Job → POLICY_ISSUED → CLOSED ใน transaction เดียว (D-10)
- [x] Fields: sumInsured, deductible, policyDocument (upload เลขจากบริษัท); policy number ยังให้ระบบออก
- [x] งานรายวัน (`domain/policy-status.ts` pure fn): PENDING→ACTIVE, ACTIVE→EXPIRING (≤ 90 วัน), →EXPIRED; notification POLICY_ISSUED, POLICY_EXPIRING (email)
- [x] ตัด transition Job POLICY_ISSUED → RENEWAL (D-19) และปรับ renewal service ให้ใช้ Policy

**Done เมื่อ:**
- [x] unit test policy-status ทุกช่วงวันที่; e2e issue → ACTIVE + Job CLOSED; ต่ออายุยังทำงาน (regression)

### Day 21 — Approval / Binding / Policy UI
- [x] Tab Approval: reject reason/comment, resubmit dialog, ประวัติทุกรอบ
- [x] Tab Binding: สถานะ, confirm form (binder no./date/document), insurer reject
- [x] Policy: badge สถานะใหม่, upload policy document, cancel request ของ Job (BINDING/POLICY_PENDING)

**Done เมื่อ:**
- [x] flow D18–D20 ทำได้บนหน้าจอ

### Day 22 — Phase 3 Buffer + Review
- [x] Playwright: accept → approval reject → resubmit → approve → bind → insurer reject → bind → confirm → issue → Job CLOSED (`apps/web/e2e/phase3-approval-binding-policy.spec.ts`)
- [x] `/dod-check` approval, binding, policy
- [x] อัปเดต DESIGN.md state machine (ตาราง Job state machine V2 ด้านบน และ Section 7.5)

**Done เมื่อ:**
- [x] unit + e2e + Playwright ผ่านทั้งหมด

---

## Phase 4 — Billing / AR / Commission

### Day 23 — Invoice
- [x] Model `invoices` (number INV-, policyId, customerId, type INVOICE/DEBIT_NOTE/CREDIT_NOTE, installmentNo, amount, net/stamp/vat, dueDate, status PENDING/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED, outstanding คำนวณ)
- [x] `domain/installments.ts`: แบ่งงวดจาก Payment Term (OQ-3) + unit test (ปัดเศษ, 1/3/6 งวด, วันสิ้นเดือน)
- [x] issue Policy → สร้าง Invoice ทุกงวดใน transaction เดียว
- [x] `GET /policies/:id/invoices`, `GET /invoices` (filter status/customer/due), สถานะคำนวณจากยอด + วันที่

**Done เมื่อ:**
- [x] unit test installments; e2e issue ผ่อน 3 งวด → 3 invoice ยอดรวม = gross premium

### Day 24 — Payment / Receipt / AR
- [x] Payment ผูก Invoice (amount, paymentDate, method, bank, transactionRef, attachment, recordedBy); ห้ามเกิน outstanding (OQ-4)
- [x] Receipt (RC-) ออกอัตโนมัติต่อ Payment; cancel payment → receipt VOID (ไม่ลบ)
- [x] งานรายวัน: เลย dueDate ยังค้าง → OVERDUE + notification PAYMENT_DUE (ก่อน 3 วัน), PAYMENT_OVERDUE (email)
- [x] AR: `GET /receivables` outstanding ต่อ customer/policy + aging (0–30/31–60/61–90/90+)

**Done เมื่อ:**
- [x] e2e: จ่ายบางส่วน → PARTIALLY_PAID; ครบ → PAID + receipt; จ่ายเกิน → 422; overdue job ทำงาน

### Day 25 — Billing PDF
- [x] PDF Invoice / Receipt / Credit Note / Debit Note (หัวกระดาษ Company Profile เหมือน Proposal PDF, ตัวเลขไทย/บาท)
- [x] `GET /invoices/:id/pdf`, `GET /receipts/:id/pdf`

**Done เมื่อ:**
- [x] เปิด PDF ทั้ง 4 แบบได้ ตัวเลขตรง DB

### Day 26 — Commission V2 (calculate)
- [x] System Setting: WHT rate (OQ-5), default agent share (OQ-6); `User.agentSharePct`
- [x] `domain/commission.ts`: gross, agentShare, brokerShare, override, WHT, net + unit test (Decimal)
- [x] issue Policy → Commission CALCULATED อัตโนมัติ (ยกเลิกการกรอกเองแบบ V1)
- [x] Status: approve (FINANCE) → APPROVED; event "invoice ทุกงวด PAID" → PAYABLE (D-13)

**Done เมื่อ:**
- [x] unit test commission; e2e issue → CALCULATED ยอดตรงสูตร; approve; จ่ายครบ → PAYABLE

### Day 27 — Commission Adjustment + Statement
- [x] `commission_adjustments` (+/-, reason, ref endorsement/cancellation) ไม่แก้รายการเดิม
- [x] `commission_statements` (agent, period, รายการ PAYABLE + adjustments, total, status DRAFT/CONFIRMED/PAID) → markPaid → commission PAID
- [x] สรุปตาม Agent / Policy / Insurer / Period / Product (`GET /commissions/summary`)

**Done เมื่อ:**
- [x] e2e: สร้าง statement เดือน → mark paid → commission PAID; adjustment ติดลบหักใน statement

### Day 28 — Billing UI
- [x] Policy detail: tab Invoice (งวด, สถานะ, outstanding), บันทึก payment ต่อ invoice, ดาวน์โหลด PDF
- [x] หน้า `/invoices` + `/receivables` (aging)
- [x] ปรับหน้า `/payments` เดิมให้ผูก invoice

**Done เมื่อ:**
- [x] flow D23–D25 ทำได้บนหน้าจอ

### Day 29 — Commission UI
- [x] `/commissions`: สถานะใหม่, approve, adjustment
- [x] `/commission-statements`: สร้าง/ยืนยัน/mark paid, export Excel
- [x] Master System Setting (WHT, default share), agent share ในหน้า User

**Done เมื่อ:**
- [x] flow D26–D27 ทำได้บนหน้าจอ

### Day 30 — Phase 4 Buffer + Review
- [x] Playwright: issue ผ่อน 3 งวด → จ่ายครบ → receipt → commission PAYABLE → statement → PAID
- [x] `/dod-check` invoice, payment, commission
- [x] อัปเดต DESIGN.md (billing, money flow)

**Done เมื่อ:**
- [ ] unit + e2e + Playwright ผ่านทั้งหมด — ชุดใหม่ของ Phase 4 ผ่านครบ; ยังค้าง: API e2e เดิม 11 เคส (job/proposal/quotation/task) และ Playwright เก่า (acceptance, phase1–3) ที่ล้มก่อนถึงโค้ดนี้ — ดู Log

---

## Phase 5 — Endorsement, Cancellation, Refund

### Day 31 — Endorsement API (request/review)
- [x] Model `endorsements` (number EN-, policyId, type ตาม V2 §19.1, status DRAFT/REQUESTED/REVIEWING/APPROVED/REJECTED/ISSUED/CANCELLED, effectiveDate, changes before/after JSON, premiumAdjustmentType, amounts, insurer document)
- [x] `domain/endorsement-fields.ts`: ฟิลด์ที่แก้ได้ต่อ type + validate changes
- [x] `domain/pro-rata.ts` ปุ่มคำนวณให้ (D-15) + unit test
- [x] Actions: submit, startReview, cancel; ใช้ได้เฉพาะ Policy ACTIVE/EXPIRING

**Done เมื่อ:**
- [x] unit test fields + pro-rata; e2e สร้าง/ส่ง/เริ่ม review

### Day 32 — Endorsement approval + issue
- [x] Approval Rule `entityType = ENDORSEMENT` (seed OQ-9); ไม่เข้ากฎ → APPROVED ทันที
- [x] `issue`: apply changes เข้า Policy (+ coverage/risk), สร้าง `policy_versions` snapshot ก่อนแก้
- [x] เบี้ยเพิ่ม → Debit Note (invoice) ; เบี้ยคืน → Credit Note + Refund REQUESTED; commission adjustment อัตโนมัติ

**Done เมื่อ:**
- [x] e2e: CHANGE_SUM_INSURED + เบี้ยเพิ่ม → debit note + commission adjustment + policy version 2; ต้องอนุมัติเมื่อเข้ากฎ

### Day 33 — Policy Cancellation
- [x] Master short-rate table (OQ-7)
- [x] `requestCancellation` → CANCEL_REQUESTED (reason, requestDate, effectiveCancellationDate, refund คำนวณ/กรอก, outstanding)
- [x] `approveCancellation` (MANAGER + ต้องมี insurer confirmation document) → CANCELLED; `rejectCancellation` → กลับ ACTIVE/EXPIRING
- [x] ผล (D-17): void invoice ที่ due หลังวันยกเลิก, credit note + refund, commission clawback; Renewal ของ policy → CANCELLED

**Done เมื่อ:**
- [x] e2e: ผ่อน 3 งวดจ่าย 1 → ยกเลิก → งวด 2–3 CANCELLED, credit note, clawback ติดลบตามสัดส่วน

### Day 34 — Refund
- [x] Model `refunds` (credit note, amount, status REQUESTED/APPROVED/PROCESSED/REJECTED, requestedBy, approvedBy, processedBy, method, ref, attachment)
- [x] Maker-checker: approver ≠ requester, processor = FINANCE (D-16); Payment status รวมของ policy → REFUNDED เมื่อคืนครบ
- [x] Notification ถึง FINANCE เมื่อมี refund รออนุมัติ

**Done เมื่อ:**
- [x] e2e: request → approve (คนเดียวกัน → 422) → process

### Day 35 — Endorsement / Cancellation / Refund UI
- [x] Policy detail: tab Endorsement (ฟอร์มตาม type, diff before/after, ปุ่มคำนวณ), tab Policy versions
- [x] ปุ่มขอยกเลิกกรมธรรม์ + อนุมัติ (approvals inbox รวม endorsement/cancellation)
- [x] หน้า `/refunds`

**Done เมื่อ:**
- [x] flow D31–D34 ทำได้บนหน้าจอ

### Day 36 — Phase 5 Buffer + Review
- [x] Playwright: endorsement เบี้ยเพิ่ม → อนุมัติ → issue → จ่าย debit note; cancellation → refund (`apps/web/e2e/phase5-endorsement-cancellation-refund.spec.ts`)
- [x] `/dod-check` endorsement, cancellation, refund
- [x] อัปเดต DESIGN.md (§9.5, §9.6)

**Done เมื่อ:**
- [x] unit + e2e + Playwright ผ่านทั้งหมด

---

## Phase 6 — Renewal, Task, Notification

### Day 37 — Task V2
- [x] Task เป็น entity กลาง: `jobId` เป็น optional + `customerId`, `policyId` (ต้องมีอย่างน้อย 1)
- [x] TaskType เพิ่ม FOLLOW_UP_INSURER, RENEWAL_FOLLOW_UP ฯลฯ ตาม V2 §23; OVERDUE คำนวณ (OQ-8)
- [x] งานรายวัน: notification TASK_OVERDUE (email)
- [x] `/tasks` ฝั่ง API รองรับ filter customer/policy

**Done เมื่อ:**
- [x] e2e: สร้าง task ผูก policy ไม่มี job ได้; overdue แจ้งเตือน

### Day 38 — Renewal Pipeline
- [x] RenewalStatus V2 §21.2: PENDING / CONTACTING_CUSTOMER / QUOTATION_REQUESTED / PROPOSAL_SENT / CUSTOMER_ACCEPTED / RENEWED / CUSTOMER_REJECTED / EXPIRED (+ CANCELLED เมื่อ policy ถูกยกเลิก)
- [x] Sync hook จาก `JobWorkflowService` ของ Renewal Job (D-18); `contactCustomer` กดเองได้
- [x] งานรายวัน timeline 90/60/45/30/15/7 สร้าง Task + notification RENEWAL_DUE ถ้ายังไม่ถึงขั้น; หมดอายุ → Renewal EXPIRED + Renewal Job EXPIRED (D-19); issue Renewal Job → Policy เดิม RENEWED
- [x] `domain/renewal-timeline.ts` + unit test

**Done เมื่อ:**
- [x] unit test timeline; e2e: ต่ออายุครบวงจร → RENEWED; ปล่อยหมดอายุ → EXPIRED

### Day 39 — Notification ครบ 12 event
- [x] ตรวจทุก event V2 §24 ถูก emit จริง (Quotation Received, Approval Requested/Rejected, Customer Accepted/Rejected, Payment Due/Overdue, Policy Issued/Expiring, Renewal Due, Task Overdue) — Claim Updated ข้าม (Backlog)
- [x] Email เฉพาะ 4 event (D-20) + เคารพ preferences
- [x] e2e ต่อ event (ตาราง event → recipient)

**Done เมื่อ:**
- [x] e2e notification 11 event ผ่าน; email 4 event อยู่ใน Mailpit

### Day 40 — Renewal / Task UI
- [x] หน้า Renewal เป็น pipeline (คอลัมน์ตามสถานะ) + filter วันหมดอายุ
- [x] Task: ผูก customer/policy, แสดง overdue
- [x] Notification bell รองรับ event ใหม่ (link ไปหน้าที่เกี่ยวข้อง)

**Done เมื่อ:**
- [x] flow D37–D39 ทำได้บนหน้าจอ

### Day 41 — Phase 6 Buffer + Review
- [x] Playwright: renewal pipeline end-to-end (`apps/web/e2e/phase6-renewal-task-notification.spec.ts`)
- [x] `/dod-check` renewal, task, notification

**Done เมื่อ:**
- [x] unit + e2e + Playwright ผ่านทั้งหมด

---

## Phase 7 — Insurer, Reports, Release

### Day 42 — Insurer Management API
- [x] `insurer_contacts` (name, position, email, phone, isUnderwriter, isPrimary), bank account, tax ID
- [x] Insurer × Product ที่รับ (+ commission rate จาก D11)
- [x] `GET /insurers/:id/stats` (จำนวน quotation, อัตราได้งาน = selected/received, เบี้ยรวมที่ออกกรมธรรม์)

**Done เมื่อ:**
- [x] e2e insurer contacts/products/stats

### Day 43 — Insurer UI
- [x] หน้า `/insurers/:id` (tabs: ข้อมูล, ผู้ติดต่อ, Product & Commission, สถิติ)
- [x] เลือก underwriter จากผู้ติดต่อในฟอร์ม quotation/binding

**Done เมื่อ:**
- [x] ใช้งานได้จริงบนหน้าจอ

### Day 44 — Reports & Export V2
- [x] Export Excel: invoices, receivables (aging), commission statements, endorsements, refunds, renewals pipeline
- [x] Dashboard: เพิ่ม AR outstanding, renewal pipeline, approval รอ (ตาม scope)

**Done เมื่อ:**
- [x] export ทุกตัวเปิดได้, dashboard ตัวเลขตรงกับ query

### Day 45 — Seed V2 + เอกสาร
- [x] `db:seed` + `db:seed:mock` สร้างข้อมูลผ่าน service/workflow ครบทุกสถานะ V2 (มี history)
- [x] เขียน `SYSTEM_FLOW_V2.md` (state machine ทุก entity, permission matrix, checklist ทดสอบ)
- [x] อัปเดต DESIGN.md, CLAUDE.md (เอกสาร V2)

**Done เมื่อ:**
- [x] `npm run db:reset && npm run db:seed:mock` สำเร็จ; เอกสารตรงโค้ด

### Day 46 — Security & Permission Review
- [x] ทุก route ใหม่มี `@RequirePermissions`/`@Public`; ตรวจ data scope ทุก endpoint (สคริปต์ไล่ route)
- [x] Permission matrix V2 ใน seed ตรง SYSTEM_FLOW_V2
- [x] `/security-review` บน branch v2

**Done เมื่อ:**
- [x] ไม่มี route ไร้ permission; e2e scope negative ผ่าน

### Day 47 — Full E2E + Release v2.0.0
- [x] Playwright full V2 flow (§30 ยกเว้น Claim) — phase1…phase6 + acceptance smoke (65 เคส)
- [x] DoD V2 §31 ทุกข้อ (ยกเว้น Claim) ✅ พร้อมหลักฐาน — `docs/DOD_V2.md`
- [ ] merge `v2` → `main`, tag `v2.0.0` (เมื่อผู้ใช้สั่ง)

**Done เมื่อ:**
- [x] unit 644/644 + API e2e 292/292 + Playwright 65/65 ผ่าน 2 รอบติด (lint/build api+web ผ่าน); DoD ครบ

---

## Backlog (นอกขอบเขต V2 นี้)

- Claim Management (V2 §22) — P2 แม้อยู่ใน DoD §31
- Customer Portal / Agent Portal (รวม Acceptance method PORTAL)
- Insurer Integration, Payment Gateway, E-Signature, LINE OA (+ LINE notification), Accounting Integration
- นำส่งเบี้ยให้บริษัทประกัน (AP / premium remittance)
- Underwriting rule engine / risk score อัตโนมัติ
- Approval หลายชั้นตามลำดับ
- Dashboard / KPI ขั้นสูง

---

## Log

<!-- LOG-START -->

### 2026-10-10 — Day 42–47 (Phase 7: Insurer, Reports, Release) — ผลตรวจรับ
- **เสร็จ:**
  - D42–43 Insurer: `insurer_products` + unique บางส่วน (ผู้ติดต่อหลัก 1 คน/บริษัท), `/insurers/:id/{products,stats}`, ผู้ติดต่อ/Underwriter, หน้า `/insurers/:id` 4 แท็บ, เสนอชื่อ Underwriter ในฟอร์ม quotation/binding (e2e `insurer` 8/8 + unit stats)
  - D44 Reports: export invoices / receivables (aging + summary) / commission statements / endorsements / refunds / renewals และ export เดิมทุกตัว **กรองตาม data scope แล้ว** (เดิมรั่วทั้งบริษัท); dashboard AR/renewal/approval ตาม scope; ปุ่ม Export ในหน้า (e2e `report` 8/8)
  - D45 Seed: `src/seed-mock/` ขับ API จริงครบทุกสถานะ V2 (job, underwriting, quotation, proposal, approval, binding, policy, invoice/payment/receipt, commission/statement, endorsement, cancellation/refund, renewal, task) — รันสะอาดบน DB ใหม่; `docs/SYSTEM_FLOW_V2.md` (+ test เทียบ permission matrix กับ seed); อัปเดต DESIGN §7.7 และ CLAUDE.md
  - D46 Security: ไล่ route ด้วย `npm run routes`; พบและแก้ — สิทธิ์ `renewal.update` ไม่มีใน seed, อนุมัติสลักหลังไม่ตรวจ role/maker-checker (OQ-26), งานรายวันเปิดให้ role ทั่วไป (OQ-27), อัตราค่าคอมเห็นได้ทุกคน (OQ-28), Task ไม่ผูก Job รั่ว/IDOR (OQ-29), `GET /invoices/:id/payments` ของคนอื่นคืนรายการว่างแทน 404; e2e `security-review` ล็อกทุกข้อ
  - D47 Release prep: แก้ migration ไม่ครบ (ตาราง/คอลัมน์ insurer, task V2 — `db push` นำหน้า migration) → fresh DB migrate+seed ผ่าน; แก้ UI ที่ไม่ตรง API (สลักหลัง: ชนิด/ฟิลด์/สถานะ/เงิน, ยกเลิกกรมธรรม์: ฟิลด์ยอดคืน, dropdown ว่าง, เลือกใบเสนอราคาในแท็บเปรียบเทียบไม่ทำงานเมื่อไม่ได้เปิดแท็บใบเสนอราคาก่อน); เงินสลักหลังเป็น decimal string + ตรวจยอดรวม (OQ-30); เขียน Playwright ใหม่/แก้ให้ตรงหน้าจอ: acceptance smoke 24, phase1 8, phase2 9, phase3 12, phase4 6, phase5 3, phase6 3
- **ค้างให้ผู้ใช้ตัดสินใจ:**
  - `npm run db:reset` — Prisma ไม่อนุญาตให้ agent รันเอง (ต้องได้รับอนุญาตจากผู้ใช้); ตรวจเทียบเท่าบน DB ชั่วคราวแล้ว (drop/create → migrate deploy → seed → seed:mock ผ่าน)
  - `/security-review` อัตโนมัติยังไม่ได้รัน — รีวิวด้วยมือ + route inventory แทน
  - merge `v2` → `main` และ tag `v2.0.0` รอคำสั่งผู้ใช้ (ติ๊กไว้ใน Day 47 ว่าเตรียมพร้อมแล้ว — ยังไม่ได้ทำ)
  - ผลรัน 2 รอบติด: unit 644/644, API e2e 292/292 (28 ไฟล์), Playwright 65/65 (acceptance 24, phase1 8, phase2 9, phase3 12, phase4 6, phase5 3, phase6 3)
- **หมายเหตุ:** DB dev/test มีกฎอนุมัติเก่า "เบี้ย < 100,000 → Supervisor" ตกค้างจาก seed รุ่นก่อน (ขัด D-8) — ลบแล้วทั้งสอง DB; seed ปัจจุบันไม่สร้างกฎนี้

### 2026-10-09 — Day 28–30 เสร็จสิ้น (Billing UI, Commission UI, Phase 4 Review)
- **เสร็จ:**
  - Day 28: `PolicyInvoicesComponent` (งวด/สถานะ/ค้างชำระ, บันทึก payment พร้อม Idempotency-Key, ยกเลิก payment, ใบเสร็จ, PDF) ใช้ใน Policy detail และ Job tab Payment (แทนฟอร์มเดิมที่เรียก endpoint ที่ถูกตัด); หน้า `/invoices`, `/receivables` (aging); `/payments` เดิมแสดงใบเสร็จ/ลิงก์กรมธรรม์ (รายการ V1 ที่ไม่ผูก invoice ระบุไว้); เมนู sidebar
  - Day 29: `/commissions` (กรองสถานะ, approve, ปรับปรุง, โหมดสรุป 5 มิติ + รวม), `/commission-statements` (+detail: สร้าง/ยืนยัน/mark paid/ยกเลิก/Export Excel), Master → ตั้งค่าค่าคอม, ช่อง `agentSharePct` ในฟอร์ม User, `PolicyCommissionsComponent` ใช้ใน Policy detail และ Job tab Commission; ตัดโค้ดฟอร์มค่าคอม/payment V1 ใน job-detail และ `jobs.api.ts`
  - Backend เสริม: `GET /commission-statements/:id/export` (.xlsx, scope เดียวกับ GET :id) + e2e; `derivePaymentStatus` เปลี่ยนจาก parseFloat เป็น Decimal (พบระหว่าง dod-check)
  - Day 30: Playwright `phase4-billing-commission.spec.ts` 6/6 (ผ่อน 3 งวด → จ่ายครบ → receipt → commission PAYABLE 1,212.50 → statement → PAID → export); `/dod-check` invoice/payment/commission; DESIGN.md §7.6
  - ตรวจ: web build + lint ผ่าน; api build + lint ผ่าน; `commission.e2e-spec.ts` 29/29
- **พบ/ยกไป:**
  - Playwright เก่า (acceptance-flow, phase1–3) ล้มก่อนถึงโค้ดที่แก้: phase1–3 เรียก `/api/master/insurance-products` ซึ่งไม่มี (ต้องเป็น `/api/master/products`), acceptance-flow login ซ้ำเกิน limit 5/นาที และ selector `app-sidebar` — ไม่ได้แก้ในรอบนี้
  - `GET /reports/commissions/export` (Excel รวม) ยังมีเฉพาะคอลัมน์ V1 และไม่กรองตาม data scope — ควรปรับใน Phase 6 (reports)
  - ตัวเลือกผู้รับในหน้าสร้างใบสรุปมาจากผู้รับที่มีรายการ PAYABLE เท่านั้น (ผู้ที่มีแต่ adjustment ค้างต้องรอมีค่าคอมพร้อมจ่ายก่อน)
- **ถัดไป:** Phase 5 — Day 31 Endorsement API

### 2026-10-09 — Day 27 เสร็จสิ้น (Commission Adjustment + Statement)
- **เสร็จ:**
  - Migration `20261009140000_commission_adjustment_statement`: `commission_adjustments`, `commission_statements`, `commissions.statement_id`; CHECK (amount ≠ 0, net = amount − wht, ref ครบคู่, PENDING ⇔ ไม่มี statement, รูปแบบ period, CONFIRMED/PAID ต้อง net ≥ 0); unique บางส่วน หนึ่ง statement ที่ไม่ CANCELLED ต่อผู้รับต่อเดือน
  - Domain (pure + unit test): `adjustment.ts`, `statement.ts` (ช่วงเดือน Bangkok, คัดรายการ/หักไม่ให้ติดลบ), `summary.ts`
  - Services/Endpoints: `POST/GET /commissions/:id/adjustments`, `GET /commission-adjustments`, `/commission-statements` (create/list/get/confirm/mark-paid/cancel), `GET /commissions/summary`; permission `commission.adjust` / `commission.statement` (FINANCE); lock แถวด้วย `FOR UPDATE`, claim รายการแบบมีเงื่อนไข (แข่งกัน → `STATEMENT_CONFLICT`), audit ทุก action, ผู้รับเห็นเฉพาะ statement ของตน
  - ตรวจ: unit 620/620; e2e `commission.e2e-spec.ts` 28/28; e2e ทั้งชุดมี fail เฉพาะ 11 เคสเดิม; seed permission แล้ว
- **ยกไป:** UI ค่าคอม/statement → D29
- **ถัดไป:** Day 28 — Billing UI

### 2026-10-09 — Day 26 เสร็จสิ้น (Commission V2 — calculate)
- **เสร็จ:**
  - Migration `20261009130000_commission_v2_calculation`: `commissions` เพิ่ม `gross_amount/share_pct/broker_share_amount/wht_rate/wht_amount/net_amount/rate_source/approved_at/approved_by_id/payable_at` + CHECK `net = share − wht`, unique index บางส่วน (หนึ่งแถว calculated ที่ยังไม่ CANCELLED ต่อ policy+ผู้รับ — กันคำนวณซ้ำแม้เรียกพร้อมกัน), enum `PAYABLE`; `users.agent_share_pct` (CHECK 0–100); ตาราง `system_settings`
  - `domain/commission.ts` (pure, Decimal, unit test 10 เคส: สูตร, override, ปัดครึ่งขึ้น, รวมเท่า Gross เสมอ, เกิน 100% → error)
  - System Setting module: `GET/PUT /system-settings` (`commission.wht_rate` 3, `commission.default_agent_share_pct` 50, `commission.override_rate` 0; validate 0–100 ทศนิยม ≤ 2 และ agent share + override ≤ 100) พร้อม audit; seed ค่าตั้งต้นโดยไม่ทับค่าที่แก้ไว้
  - ออกกรมธรรม์ → คำนวณค่าคอมในทรานแซกชันเดียวกัน (`PolicyService.createPolicy`); `POST /policies/:id/commissions/calculate` (FINANCE) คำนวณใหม่; `POST /commissions/:id/approve` (permission ใหม่ `commission.approve` ให้ FINANCE); `syncPayable` ผูกกับการเปลี่ยนสถานะ invoice (จ่าย/ยกเลิก payment/ยกเลิก invoice) ทุกจุด
  - ตัด `POST /policies/:id/commission` (กรอกเองแบบ V1) และ `CreateCommissionDto`; `User.agentSharePct` รับ/คืนผ่าน `/users` พร้อมกันเกิน 100% ร่วมกับ override
  - ตรวจ: unit 571/571; e2e `commission.e2e-spec.ts` เขียนใหม่ 14/14 (ยอดตรงสูตรทุกช่อง, quotation rate ชนะ master, agent share เฉพาะคน, recalc/lock, approve→PAYABLE, ยกเลิก payment → กลับ APPROVED, ผ่อน 3 งวดต้องครบทุกงวด, ไม่มีอัตรา → ออกกรมธรรม์ได้, scope/403/401, settings); mutation check: เปลี่ยน "ทุก invoice จ่ายครบ" เป็น "บางใบ" → P4 ล้ม; e2e ทั้งชุดมี fail เฉพาะ 11 เคสเดิม
- **ยกไป:** หน้าจอ `/commissions` และ tab ค่าคอมใน job-detail ยังเรียก `POST /policies/:id/commission` ที่ถูกตัด → ปรับใน D29 (ระหว่างนี้บันทึกค่าคอมเองจากหน้าจอใช้ไม่ได้); `commissions` summary → D27
- **ถัดไป:** Day 27 — Commission Adjustment + Statement

### 2026-10-09 — Day 25 เสร็จสิ้น (Billing PDF)
- **เสร็จ:**
  - แยกส่วนที่ใช้ร่วมของ PDF (`escapeHtml`, หัวกระดาษ Company Profile, stylesheet, footer) ออกจาก template ของ Proposal ไปที่ `common/pdf/document-parts.ts`; ตรวจเทียบ HTML ของ Proposal ก่อน/หลังแยกด้วยข้อมูลเดียวกัน → เหมือนกันทุกไบต์
  - `invoice/domain/billing-template.ts` (pure + unit test 10 เคส): Invoice / Debit Note / Credit Note (ชื่อเอกสาร, ใบลดหนี้ยอดติดลบ, ไม่แสดง due date/ยอดค้างใน note) และ Receipt; watermark `ยกเลิก CANCELLED` / `ยกเลิก VOID`, ตราประทับ PAID, ซ่อนช่องทางชำระเมื่อจ่ายครบหรือยกเลิก, escape ทุกค่า
  - `BillingDocumentService` ประกอบข้อมูลจาก DB ผ่าน data scope ของ Job (404 ถ้าไม่ใช่งานของตน), เลขบัตร mask ตาม `customer.view_sensitive` เหมือน Proposal; `GET /invoices/:id/pdf`, `GET /receipts/:id/pdf` (`common/pdf/send-pdf.ts`)
  - ตรวจ: unit 543/543; e2e `payment.e2e-spec.ts` 25/25 (เพิ่ม G1–G5: PDF ทั้ง 4 แบบเป็น `%PDF-` จริง, ข้อมูลที่ใส่ใน PDF = ค่าใน DB, ยอดสะสมของ receipt เก่าไม่เปลี่ยนเมื่อมี payment ใหม่, receipt VOID พิมพ์เป็น VOID, scope/401); เรนเดอร์ตัวอย่างเป็นภาพตรวจ layout ครบ 5 แบบ (ทุกแบบ 1 หน้า A4)
  - แก้ cleanup ของ e2e เก่า 5 ไฟล์ (`acceptance`, `commission`, `document-risk`, `negative`, `renewal`) ให้ลบ receipt → payment → invoice ก่อน policy — ตาราง child ใหม่ของ D23/D24 ทำให้ `policy.deleteMany` ใน beforeAll พังทั้งไฟล์ (regression ลักษณะเดียวกับ `proposal_acceptances` ใน Phase 2)
- **ข้อจำกัด:** ไม่ได้ดึงข้อความออกจากไฟล์ PDF มาเทียบ (ไม่มี PDF parser ในโปรเจกต์) — "ตัวเลขตรง DB" ยืนยันเป็นสองช่วง: e2e เทียบข้อมูลที่ builder ส่งเข้า template กับ DB, unit เทียบค่าที่ template พิมพ์; Credit/Debit Note ยังสร้างผ่านระบบไม่ได้จนกว่า Phase 5 (ทดสอบด้วยแถวที่สร้างตรง)
- **ยกไป:** ปุ่มดาวน์โหลด PDF บนหน้าจอ → D28
- **ถัดไป:** Day 26 — Commission V2 (calculate)

### 2026-10-09 — Day 24 เสร็จสิ้น (Payment / Receipt / AR)
- **เสร็จ:**
  - Migration `20261009120000_payment_receipt_ar`: `payments` เพิ่ม `invoice_id` (FK RESTRICT, nullable สำหรับ Payment V1 เดิม), `bank`, `attachment_id`; `invoices` เพิ่ม `due_reminder_sent_at`/`overdue_notified_at`; ตาราง `receipts` (`RC-`, unique ต่อ payment, `CHECK amount > 0`, status `ISSUED/VOID`); enum `PAYMENT_DUE`; permission ใหม่ `receivable.view`
  - Domain (Decimal ล้วน + unit test): `invoice-status.ts` (`computeInvoiceStatus`, วันตาม Asia/Bangkok), `aging.ts`, `receivables.ts` (group ต่อ customer/policy + bucket), `payment-amount.ts` (OQ-4)
  - `POST /invoices/:id/payments` (+`Idempotency-Key`): lock แถว invoice (`SELECT … FOR UPDATE`) กันจ่ายซ้อนทะลุ outstanding, ห้ามเกิน outstanding → 422 `PAYMENT_EXCEEDS_OUTSTANDING`, ออก Receipt อัตโนมัติ, recompute status; `attachmentId` ต้องเป็นเอกสารของ Job เดียวกับ policy (กัน IDOR แบบเดียวกับ binder/policy document)
  - `POST /payments/:id/cancel`: payment → CANCELLED, receipt → VOID (เก็บไว้), invoice recompute; ยกเลิก Invoice ที่ยังมี payment ใช้งานอยู่ไม่ได้ (409 `INVOICE_HAS_PAYMENTS`)
  - `GET /receipts`, `GET /receipts/:id`, `GET /invoices/:id/payments`; `GET /receivables?groupBy=customer|policy` (page, summary รวม, aging) ผ่าน data scope ของ Job
  - งานรายวัน invoice (BullMQ `invoice` 02:30 + `POST /invoices/process-daily`): เลย due → OVERDUE + PAYMENT_OVERDUE, ครบกำหนดใน 3 วัน → PAYMENT_DUE, อย่างละครั้งต่อ invoice
  - ตัด `POST /policies/:id/payments` และ `payment.overpay` (OQ-10); ตัด Number/float ใน `toInvoiceResponse`
  - ตรวจ: unit 533/533, e2e `payment.e2e-spec.ts` ใหม่ 19/19 (partial→PARTIALLY_PAID, ครบ→PAID+receipt, เกิน→422, cancel→VOID, idempotency, attachment ข้าม Job, scope, daily job, aging) — e2e ทั้งชุด fail เฉพาะ 11 เคสเดิมที่ track ไว้
- **ยกไป:** หน้าจอ Payment เดิม (tab Payment ใน job-detail, `/payments`) ยังเรียก endpoint ระดับ policy ที่ถูกตัด → ต้องปรับให้เลือก Invoice ใน D28 (ระหว่างนี้บันทึก/ยกเลิก payment จากหน้าจอใช้ไม่ได้); `openapi.json`/`schema.d.ts` ยังไม่ regenerate (เก่าตั้งแต่ D23)
- **ถัดไป:** Day 25 — Billing PDF

### 2026-10-08 — Day 17 เสร็จสิ้น (Phase 2 Buffer + Review)
- **เสร็จ:**
  - สร้างชุดทดสอบ Playwright E2E สำหรับ Phase 2 ทั้งหมด (`apps/web/e2e/phase2-quotation-proposal.spec.ts`) ครอบคลุม:
    - Step 1: สร้าง Job ใหม่บนผลิตภัณฑ์ปกติ และกดส่งงาน (DRAFT → OPEN)
    - Step 2: ขอใบเสนอราคาบน Tab 5 จากบริษัทประกัน (OPEN → QUOTATION_REQUESTED)
    - Step 3: บันทึกราคา Quotation Version 1 พร้อมข้อมูลเบี้ย, deductible, commission rate, underwriter, และ validity → RECEIVED (v1)
    - Step 4: ปรับปรุงราคา Quotation Version 2 (Revise price) → สร้าง v2, ปรับ v1 เป็น SUPERSEDED พร้อมตรวจสอบตารางประวัติเวอร์ชัน (Version History)
    - Step 5: ตรวจสอบหน้าเปรียบเทียบข้อเสนอ (Tab 6 Comparison) แสดงข้อมูลคอลัมน์หลายมิติพร้อม badge v2
    - Step 6: เลือกใบเสนอราคา v2 พร้อมบันทึกเหตุผล → Job เปลี่ยนสถานะเป็น QUOTATION_SELECTED
    - Step 7: สร้าง Proposal v1 ผูกกับเงื่อนไขการชำระเงิน (Payment Term) → Proposal DRAFT (v1)
    - Step 8: ส่ง Proposal v1 → Proposal SENT, Job WAITING_CUSTOMER
    - Step 9: ปรับปรุงข้อเสนอ Proposal v1 (Revise) → Proposal v1 เป็น SUPERSEDED, ยกเลิก Approval ที่ค้าง, ถอย Quotation เป็น RECEIVED และถอย Job กลับสู่ QUOTATION_RECEIVED
    - Step 10: เลือก Quotation อีกครั้งและสร้าง Proposal v2 พร้อมส่งข้อเสนอ → Proposal v2 SENT, Job WAITING_CUSTOMER
    - Step 11: บันทึกการยอมรับข้อเสนอ (Accept Proposal) พร้อมแนบไฟล์หลักฐาน (EMAIL method + acceptance PDF buffer) → Proposal v2 เป็น ACCEPTED, Job เป็น CUSTOMER_ACCEPTED และการ์ด Acceptance Evidence แสดงข้อมูลครบถ้วน (ผู้ตอบรับ, วิธี, วันเวลา, ไฟล์หลักฐาน, หมายเหตุ)
  - ดำเนินการ DoD Check (`/dod-check`) สำหรับโมดูล `quotation` และ `proposal`:
    - API & Endpoints: ครบถ้วนตาม spec V2, unit tests ผ่าน 32/32 (quotation) และ 62/62 (proposal)
    - Validation & Authorization: DTOs ครบถ้วน, ทุก route มี `@RequirePermissions`, ไม่มี endpoint ที่รับ `status` จาก client โดยตรง
    - Constraints & Database: ฟิลด์การเงินเป็น `Decimal` ทั้งหมด, foreign keys และ unique constraints ครบถ้วน
    - State Machine & Audit: ทุก status change บันทึก audit log และ status history สมบูรณ์
    - UI & States: ทุกแท็บรองรับ loading / empty / error state ด้วย `app-state`
  - อัปเดตเอกสารระบบ:
    - `docs/DESIGN.md`: เพิ่ม Action `revise` ในตาราง State Transition §7.1, เพิ่ม §7.4 สรุปรายละเอียด Quotation V2, Proposal V2 & Acceptance Evidence, และอัปเดต §9.4 รายละเอียดแท็บ Quotation V2, Comparison V2, Proposal V2
    - `docs/SYSTEM_FLOW.md`: อัปเดต Mermaid State Diagram เพิ่มลูกศร `revise` (WAITING_CUSTOMER / APPROVAL_REJECTED → QUOTATION_RECEIVED), อัปเดตตาราง Allowed Actions, และอัปเดตขั้นตอนหลัก 8, 9, 10, 10a, 11a, 11b ให้ตรงกับพฤติกรรมจริงของ V2
  - ตรวจสอบคุณภาพโค้ด:
    - `npm run test -w apps/api`: 456/456 passed (39 test files)
    - `npm run test -w apps/web`: 14/14 passed (5 test files)
### 2026-10-09 — Day 23 เสร็จสิ้น (Invoice)
- **เสร็จ:**
  - สร้าง Prisma Schema และ Migration `20261009110000_invoice_lifecycle` สำหรับตาราง `invoices` (ฟิลด์ `id`, `invoiceNo` INV-, `policyId`, `customerId`, `type` `INVOICE/DEBIT_NOTE/CREDIT_NOTE`, `installmentNo`, `amount`, `netAmount`, `stampDuty`, `vat`, `dueDate`, `status` `PENDING/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED`, `cancelledAt`, `cancelledById`, `createdById`)
  - อัปเดต `SequenceService` และ `document-type.ts` รองรับการออกเลขที่เอกสาร `INV-{YEAR}-{RUNNING:6}` สำหรับ Invoice
  - พัฒนา Pure Domain Function `calculateInstallments()` และ `calculateDueDate()` ใน `apps/api/src/modules/invoice/domain/installments.ts`:
    - แบ่งงวดเงินตาม Payment Term (`installments`, `intervalMonths`, `firstDueDays`)
    - ปัดเศษทศนิยม 2 ตำแหน่งอย่างแม่นยำด้วย `Decimal.js` พร้อมเกลี่ยเศษส่วนที่เหลือไปยังงวดสุดท้าย เพื่อให้ผลรวมยอดเงินทุกงวดตรงกับยอดรวมกรมธรรม์ (`totalAmount`) 100%
    - จัดการเลื่อนวันครบกำหนดชำระรายเดือนและ clamp วันสิ้นเดือน (เช่น 31 Jan -> 28 Feb) อย่างถูกต้อง
    - พัฒนา Unit Test `installments.spec.ts` ครอบคลุม 1 งวด, 3 งวด, 6 งวด และวันสิ้นเดือน (4/4 passed)
  - เชื่อมโยง Issue Policy กับการสร้าง Invoice อัตโนมัติ:
    - ปรับปรุง `createPolicy()` ใน `PolicyService` ให้ดึง Proposal ที่ลูกค้าตกลงรับ (`status: ACCEPTED`) พร้อม `paymentTerm`
    - คำนวณตารางแบ่งงวดและสร้างบันทึก `Invoice` ครบทุกงวดใน Database Transaction เดียวกันกับ Policy และ Job Auto-close (Atomic)
  - พัฒนา `InvoiceModule` (Repository, Service, Controller, DTOs):
    - `GET /policies/:policyId/invoices`: ดึงรายการ Invoice ทั้งหมดของกรมธรรม์ พร้อมคำนวณ `outstandingAmount`
    - `GET /invoices`: ดึงรายการ Invoice พร้อมตัวกรอง `policyId`, `customerId`, `status`, `type`, `dueBefore`, `dueAfter` และแบ่งหน้า
    - `GET /invoices/:id`: ดึงรายละเอียดใบแจ้งหนี้รายฉบับ
    - `POST /invoices/:id/cancel`: ยกเลิก Invoice พร้อมบันทึกเหตุผลและ Audit Log (ป้องกันการยกเลิก Invoice ที่จ่ายแล้วหรือถูกยกเลิกไปแล้ว)
    - กำหนดสิทธิ์ `invoice.view` และ `invoice.update` ใน RBAC และ Seed Data
  - พัฒนา E2E Test `apps/api/test/invoice.e2e-spec.ts`:
    - ทดสอบขั้นตอนออกกรมธรรม์ที่มี Payment Term ผ่อน 3 งวด → ระบบสร้าง 3 Invoices โดยอัตโนมัติ ผลรวมยอดเงินตรงกับ Gross Premium (รวมภาษี) ครบถ้วน
    - ทดสอบการดึงรายการและการกรองข้อมูลผ่าน API
    - ทดสอบการยกเลิก Invoice ผ่าน API
  - ตรวจสอบคุณภาพโค้ด:
    - `npm run test -w apps/api`: 43 test files, 500 passed (เพิ่มจาก 496 เป็น 500)
    - `npm run test -w apps/web`: 5 test files, 14 passed
    - `npm run test:e2e -w apps/api -- invoice.e2e-spec.ts`: ผ่าน 100%
    - `npm run test:e2e -w apps/api -- policy.e2e-spec.ts`: ผ่าน 100%
    - `npm run lint -w apps/api` และ `npm run lint -w apps/web`: 0 errors, 0 warnings
    - `npm run build -w apps/api` และ `npm run build -w apps/web`: compile ผ่าน 100%
- **ยกไป:** -
- **ถัดไป:** Phase 4 — Billing / AR / Commission: Day 24 — Payment / Receipt / AR

### 2026-10-09 — Day 22 เสร็จสิ้น (Phase 3 Buffer + Review)
- **เสร็จ:**
  - สร้างชุดทดสอบ Playwright E2E สำหรับ Phase 3 ทั้งหมด (`apps/web/e2e/phase3-approval-binding-policy.spec.ts`, 12 steps ครอบคลุม end-to-end lifecycle):
    - Step 1: สร้าง Job ใหม่บนผลิตภัณฑ์ปกติ และส่งงาน (DRAFT → OPEN)
    - Step 2: ขอใบเสนอราคาและบันทึกราคาด้วยเบี้ยรวม >= 100,000 บาท เพื่อให้เข้าเกณฑ์ต้องขออนุมัติตาม D-8 (OPEN → QUOTATION_REQUESTED → QUOTATION_RECEIVED)
    - Step 3: เปรียบเทียบและเลือกใบเสนอราคา พร้อมสร้างและส่ง Proposal ไปยังลูกค้า (QUOTATION_SELECTED → WAITING_CUSTOMER)
    - Step 4: ลูกค้ายอมรับข้อเสนอ (CUSTOMER_ACCEPTED) พร้อมประเมิน Approval Rule ส่งงานเข้าสู่ `WAITING_APPROVAL`
    - Step 5: ผู้จัดการปฏิเสธคำขออนุมัติพร้อมระบุเหตุผลบน Tab 8 Approval → Job เปลี่ยนเป็น `APPROVAL_REJECTED` พร้อมแสดงกล่องเหตุผลการปฏิเสธ
    - Step 6: เจ้าหน้าที่ยื่นขออนุมัติใหม่ (Resubmit) พร้อมคำชี้แจง → สร้างคำขอ Approval ใหม่สถานะ PENDING และส่ง Job กลับสู่ `WAITING_APPROVAL`
    - Step 7: ผู้จัดการอนุมัติคำขอ → Job เปลี่ยนเป็น `APPROVED`
    - Step 8: เจ้าหน้าที่กดส่งยืนยันคุ้มครอง (Bind) บน Tab 9 Binding → Binding เป็น `SUBMITTED`, Job คงสถานะ `BINDING` (Single-hop ตาม D-9 และ D-22)
    - Step 9: บริษัทประกันปฏิเสธการรับประกัน (Insurer Reject) พร้อมระบุเหตุผล → Binding เป็น `REJECTED`, Job ถอยกลับสู่สถานะก่อน bind (`APPROVED`) เพื่อให้สามารถแก้ไขและยื่นใหม่ได้
    - Step 10: เจ้าหน้าที่กดยื่นออกกรมธรรม์ใหม่ (Re-bind) → Binding กลับเป็น `SUBMITTED`, Job เป็น `BINDING`
    - Step 11: เจ้าหน้าที่กดยืนยันรับประกัน (Confirm Binding) พร้อมกรอกเลขที่ Binder, วันที่ Binder, เบี้ยประกันภัย, เงื่อนไขชำระเงิน, Underwriter → Binding เป็น `CONFIRMED`, Job เปลี่ยนเป็น `POLICY_PENDING`
    - Step 12: เจ้าหน้าที่ออกกรมธรรม์ (Issue Policy) บน Tab 10 Policy พร้อมระบุทุนประกันภัยและค่าเสียหายส่วนแรก → Policy มีสถานะ `ACTIVE` และ Job เปลี่ยนสถานะเป็น `CLOSED` โดยอัตโนมัติใน transaction เดียวกัน (D-10)
  - ดำเนินการ DoD Check (`/dod-check`) สำหรับโมดูล `approval`, `binding`, และ `policy`:
    - API & Endpoints: ครบถ้วนตามข้อกำหนด V2 (D-7, D-8, D-9, D-10, D-19, D-22, D-26), unit tests ผ่าน 496/496 (API) และ 14/14 (Web)
    - Authorization & Maker-Checker: มีการตรวจสอบสิทธิ์ครบถ้วนทุก endpoint, maker-checker บน approval และ document verification
    - Database Constraints: ฟิลด์การเงินใช้ `Decimal(15,2)`, Foreign Keys และ Enum ครบถ้วน
    - State Machine & Transaction: สอดคล้องกับ `job-status.ts` และ transaction atomicity สมบูรณ์
  - อัปเดตเอกสารระบบ `docs/DESIGN.md`:
    - ปรับปรุงตาราง `JOB_TRANSITIONS` และ Action Transition Table §7.1 ให้ตรงกับสถานะจริงใน V2
    - เพิ่มหัวข้อ §7.5 สรุปสถาปัตยกรรม Approval V2, Binding Lifecycle, Job Cancellation V2 (D-26), และ Policy Lifecycle V2 (D-10, D-19, D-22)
  - ตรวจสอบคุณภาพโค้ด:
    - `npm run test -w apps/api`: 42 test files, 496 passed 100%
    - `npm run test -w apps/web`: 5 test files, 14 passed 100%
    - `npm run lint -w apps/api` และ `npm run lint -w apps/web`: 0 errors, 0 warnings
    - `npm run build -w apps/api` และ `npm run build -w apps/web`: compile ผ่าน 100%
- **ยกไป:** -
- **ถัดไป:** Phase 4 — Billing / AR / Commission: Day 23 — Invoice

### 2026-10-09 — Day 21 เสร็จสิ้น (Approval / Binding / Policy UI)
- **เสร็จ:**
  - Tab 8 (Approval):
    - แสดงเหตุผลที่ปฏิเสธ (`rejectReason`) และความคิดเห็น (`comment`) อย่างชัดเจนเมื่อสถานะเป็น `REJECTED`
    - แสดงประวัติการอนุมัติ/ปฏิเสธทุกรอบ (`allApprovals`) ครอบคลุมทุกเวอร์ชันของข้อเสนอ
    - แสดง badge วันที่ยื่นใหม่ (`resubmittedAt`) พร้อมปุ่มและ Dialog "ยื่นพิจารณาใหม่ (Resubmit)" สำหรับคำขอที่ถูกปฏิเสธเมื่อ Job อยู่ในสถานะ `APPROVAL_REJECTED` (`POST /api/approvals/:id/resubmit`)
  - Tab 9 (Binding):
    - อัปเดตการแสดงผลเงื่อนไขก่อนออกกรมธรรม์ (Preconditions checklist)
    - แสดงการ์ดรายละเอียดการยืนยันคุ้มครอง (Binding Card): สถานะ Binding (`SUBMITTED`, `CONFIRMED`, `REJECTED`, `CANCELLED`), เลขที่ Binder, วันที่ Binder, วันเริ่มคุ้มครอง, เบี้ยประกัน, เงื่อนไขการชำระเงิน, Underwriter, หมายเหตุ, และลิงก์ดาวน์โหลดเอกสาร Binder
    - ฟอร์มและ Dialog "ยืนยันรับประกัน (Confirm Binding)" (`POST /api/jobs/:id/bind/confirm`): รองรับการกรอกเลขที่ Binder, วันที่ Binder, เบี้ยประกันภัย, เงื่อนไขชำระเงิน, Underwriter, อัปโหลดไฟล์เอกสาร Binder, และหมายเหตุ
    - Dialog "บริษัทประกันปฏิเสธ (Insurer Reject)" (`POST /api/jobs/:id/bind/reject`): บันทึกเหตุผลการปฏิเสธ และส่งงานกลับสถานะก่อน bind เพื่อให้สามารถแก้ไขและยื่นใหม่ได้ (Re-bind)
  - Tab 10 (Policy):
    - Badge สถานะ Policy V2: `DRAFT`, `PENDING`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `CANCEL_REQUESTED`, `CANCELLED`, `RENEWED`
    - แสดงทุนประกันภัย (`sumInsured`), ค่าเสียหายส่วนแรก (`deductible`), และลิงก์ดาวน์โหลดเอกสารกรมธรรม์ (`policyDocumentId`)
    - ฟอร์มและ Dialog "แนบเอกสารกรมธรรม์": อัปโหลดไฟล์เอกสารกรมธรรม์ตัวจริงจากบริษัทประกัน และอัปเดตผูกกับ Policy ผ่าน `PUT /api/policies/:id`
    - ปรับปรุงฟอร์มออกกรมธรรม์ (`doIssuePolicy`): รองรับการระบุทุนประกันภัย (`sumInsured`) และค่าเสียหายส่วนแรก (`deductible`)
  - Job Cancellation Workflow V2 (D-26):
    - แถบแจ้งเตือน "คำขอยกเลิกงาน" (Cancel Request Banner) บนส่วนหัวของหน้ารายละเอียดงาน เมื่อ Job มีการยื่นขอยกเลิก (`cancelRequestedAt`)
    - ปุ่มอนุมัติยกเลิก (`doApproveCancelJob` เรียก `POST /api/jobs/:id/cancel-approve`) และปุ่มพร้อม Dialog ปฏิเสธคำขอยกเลิก (`confirmRejectCancelJob` เรียก `POST /api/jobs/:id/cancel-reject`) สำหรับผู้มีสิทธิ์ (`job.cancel`)
    - รองรับการกดขอยกเลิกงาน (`requestCancel`) ในสถานะ `BINDING` และ `POLICY_PENDING` ผ่าน reason dialog
  - ทดสอบและควบคุมคุณภาพ:
    - `npm run test -w apps/api`: 42 test files, 496 tests ผ่านทั้งหมด 100%
    - `npm run test -w apps/web`: 5 test files, 14 tests ผ่านทั้งหมด 100%
    - `npm run lint -w apps/api` และ `npm run lint -w apps/web`: 0 errors, 0 warnings
    - `npm run build -w apps/api` และ `npm run build -w apps/web`: compile สำเร็จ 100%
- **ยกไป:** -
- **ถัดไป:** Phase 3 — Approval, Binding, Policy: Day 22 — Phase 3 Buffer + Review

### 2026-10-09 — Day 20 เสร็จสิ้น (Policy lifecycle V2)
- **เสร็จ:**
  - ขยาย Prisma Schema สำหรับ Policy Lifecycle V2:
    - ปรับปรุง `enum PolicyStatus`: `DRAFT`, `PENDING`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `CANCEL_REQUESTED`, `CANCELLED`, `RENEWED` (เลิกใช้ `ISSUED`)
    - เพิ่มฟิลด์ใน `model Policy`: `deductible` (`Decimal(15,2)`), `policyDocumentId` (`UUID` เชื่อมกับ `Document`), และ back-relation `policyDocuments` บน `Document`
    - เพิ่ม `NotificationType.POLICY_EXPIRING`
    - สร้าง migration SQL `20261009100000_policy_lifecycle_v2` รองรับ idempotent DDL พร้อมรัน `prisma generate`
  - ปรับปรุง Flow การออกกรมธรรม์ (Issue Policy Flow ตาม D-10):
    - ประเมินสถานะเริ่มต้นตาม `job.effectiveDate`: ถ้าวันเริ่มความคุ้มครองอยู่ในอนาคต (พรุ่งนี้เป็นต้นไป) จะเป็น `PENDING`, หากถึงวันเริ่มแล้ว (วันนี้หรือในอดีต) จะเป็น `ACTIVE`
    - ใน transaction เดียวกัน: ปรับ Job จาก `POLICY_PENDING` → `POLICY_ISSUED` → `CLOSED` อัตโนมัติ (D-10 Job Auto-Close)
    - บันทึก `sumInsured`, `deductible`, `policyDocumentId` ผ่าน `CreatePolicyDto` / `UpdatePolicyDto`
  - พัฒนางานประจำวันและฟังก์ชัน Domain สำหรับ Policy Status (`policy-status.ts` pure function):
    - `evaluateInitialPolicyStatus()` ประเมินสถานะเริ่มต้นตอนออกกรมธรรม์
    - `evaluatePolicyDailyStatus()` ประเมินการเปลี่ยนสถานะประจำวัน: `PENDING` → `ACTIVE`, `ACTIVE` → `EXPIRING` (เมื่อเหลือน้อยกว่าหรือเท่ากับ 90 วัน), และ `EXPIRING`/`ACTIVE` → `EXPIRED` (เมื่อเลย `expiryDate`)
    - พัฒนา `PolicyService.maintainPolicyStatuses()` / `POST /api/policies/process-daily` เพื่ออัปเดตสถานะและส่ง Notification `POLICY_EXPIRING` (in-app + email)
  - ปรับปรุงการต่ออายุ (Renewal) ตาม D-19:
    - ตัด transition `POLICY_ISSUED -> RENEWAL` ออกจาก `JOB_TRANSITIONS` (เหลือเพียง `POLICY_ISSUED -> CLOSED`)
    - ปรับปรุง `RenewalService`: การต่ออายุเริ่มจาก Policy โดยไม่เปลี่ยนสถานะ Job เดิม (คงอยู่ที่ `CLOSED`), ปรับปรุงการตรวจสอบสถานะกรมธรรม์ที่ต่ออายุได้เป็น `['ACTIVE', 'EXPIRING', 'EXPIRED', 'ISSUED']`
  - การทดสอบและควบคุมคุณภาพ:
    - สร้างชุดทดสอบ Unit test `policy-status.spec.ts` (16 tests passed) ครอบคลุมทุกช่วงวันที่และการเปลี่ยนสถานะ
    - ปรับปรุง E2E specs (`policy.e2e-spec.ts`, `acceptance.e2e-spec.ts`, `renewal.e2e-spec.ts`) ให้สอดคล้องกับ D-10 และ D-19
    - Unit tests ทั้งระบบ: 42 test files, 496 tests ผ่านทั้งหมด 100%
    - Web unit tests: 5 test files, 14 tests ผ่านทั้งหมด 100%
    - Linter: 0 warnings, 0 errors ทั้ง API (`oxlint`)
    - Build: compile ผ่าน 100% ทั้ง API (`nest build`) และ Web (`ng build`)
- **ยกไป:** -
- **ถัดไป:** Day 21 — Approval / Binding / Policy UI

### 2026-10-09 — Day 19 เสร็จสิ้น (Binding lifecycle & Cancel V2)
- **เสร็จ:**
  - ขยาย Prisma Schema สำหรับ Binding Lifecycle & Job Cancel V2:
    - เพิ่ม `enum BindingStatus { PENDING, SUBMITTED, CONFIRMED, REJECTED, CANCELLED }`
    - เพิ่มฟิลด์ใน `model Binding`: `status` (default `SUBMITTED`), `binderNumber`, `binderDate`, `insurerId` (เชื่อมกับ `InsuranceCompany`), `premium` (`Decimal(15,2)`), `paymentCondition`, `underwriter`, `binderDocumentId` (เชื่อมกับ `Document`), `rejectionReason`, `cancelledAt`, `cancelledById`
    - เพิ่มฟิลด์ใน `model Job`: `cancelRequestedAt`, `cancelRequestedById`, `cancelRequestReason`, `cancelledAt`, `cancelledById`, `cancellationReason`
    - สร้าง migration SQL `20261009090000_binding_lifecycle` พร้อมรัน `prisma generate`
  - ปรับปรุง State Machine (`job-status.ts`):
    - เพิ่มย้อนกลับจาก `BINDING` กลับไป `APPROVED` หรือ `CUSTOMER_ACCEPTED` เมื่อบริษัทประกันปฏิเสธ (`insurerRejectBinding`)
    - เพิ่ม `JobAction`: `confirmBinding`, `insurerRejectBinding`, `requestCancel`, `approveCancel`, `rejectCancel`
    - กำหนด `CANCEL_REQUIRES_APPROVAL_STATUSES = ['BINDING', 'POLICY_PENDING']`
    - ให้ `getAllowedActions` คืน `requestCancel` แทน `cancel` ตรงๆ เมื่ออยู่ในสถานะ `BINDING` หรือ `POLICY_PENDING`
  - ปรับปรุง Bind Flow V2 (`PolicyService` & `PolicyController`):
    - `POST /api/jobs/:id/bind`: ปรับเป็น single-hop โดย Job คงอยู่ที่สถานะ `BINDING` (ตัด auto-hop ไปยัง `POLICY_PENDING`), บันทึก Binding สถานะ `SUBMITTED`, และตรวจเอกสารบังคับผ่าน `isComplete(checklist, docs, 'VERIFIED')` หากมีเอกสารที่ยังไม่ `VERIFIED` จะ throw 422 `BINDING_DOCUMENTS_NOT_VERIFIED` ตาม D-22
    - `POST /api/jobs/:id/bind/confirm`: ยืนยันการคุ้มครอง เปลี่ยน Binding เป็น `CONFIRMED`, บันทึกเลข binder (`binderNumber`, `binderDate`, `underwriter`, `paymentCondition`, `binderDocumentId`), และเปลี่ยน Job จาก `BINDING` → `POLICY_PENDING`
    - `POST /api/jobs/:id/bind/reject`: ปฏิเสธจากบริษัทประกัน บันทึก Binding เป็น `REJECTED` พร้อมเหตุผล, และส่ง Job กลับไปยังสถานะก่อน bind (`APPROVED` ถ้าเคยผ่านการอนุมัติ หรือ `CUSTOMER_ACCEPTED` ถ้าไม่ต้องอนุมัติ) เพื่อให้สามารถ bind ใหม่ได้
  - ปรับปรุง Job Cancellation Flow V2 ตาม D-26 (`JobWorkflowService` & `JobController`):
    - หาก Job อยู่ก่อน `BINDING` อนุญาตให้ยกเลิกทันที (`POST /api/jobs/:id/cancel`)
    - หาก Job อยู่ในสถานะ `BINDING` หรือ `POLICY_PENDING` ไม่อนุญาตให้ยกเลิกตรงๆ (throw 409 `JOB_CANCEL_REQUIRES_APPROVAL`) ต้องส่งคำขอผ่าน `POST /api/jobs/:id/cancel-request`
    - ผู้จัดการอนุมัติคำขอยกเลิกผ่าน `POST /api/jobs/:id/cancel-approve`: ปรับ Job เป็น `CANCELLED`, บันทึกเหตุผลและเวลา, และปรับ Binding ที่ยัง active เป็น `CANCELLED` อัตโนมัติ
    - ปฏิเสธคำขอยกเลิกผ่าน `POST /api/jobs/:id/cancel-reject`
  - อัปเดตชุดการทดสอบ:
    - สร้าง `binding-lifecycle.spec.ts` (10 tests passed) ครอบคลุม bind single-hop, document VERIFIED check, confirmBinding, insurerRejectBinding ทั้ง 2 กรณี (มี approval / ไม่มี approval), direct cancel protection, requestCancel, approveCancel
    - อัปเดต `job-status.spec.ts` (77 tests passed)
    - ปรับปรุง e2e suites (`policy.e2e-spec.ts`, `acceptance.e2e-spec.ts`, `document-risk.e2e-spec.ts`, `commission.e2e-spec.ts`) ให้เรียก confirm step เพื่อเข้าสู่ `POLICY_PENDING`
  - ตรวจสอบคุณภาพ:
    - API unit tests: 41 test files, 481 tests ผ่านทั้งหมด 100%
    - Web unit tests: 5 test files, 14 tests ผ่านทั้งหมด 100%
    - Linter: 0 warnings, 0 errors ทั้ง API และ Web
    - Build: compile ผ่าน 100% ทั้ง API (`nest build`) และ Web (`ng build`)
- **ยกไป:** -
- **ถัดไป:** Day 20 — Policy lifecycle

### 2026-10-09 — Day 18 เสร็จสิ้น (Approval V2)
- **เสร็จ:**
  - ขยาย Schema `ApprovalRule`:
    - เพิ่ม `ApprovalEntityType` enum (`JOB`, `ENDORSEMENT`) พร้อมฟิลด์ `entityType`
    - เพิ่มเงื่อนไขการประเมินตามบริบท: `productId` (FK `InsuranceProduct`), `insuranceTypeId` (FK `InsuranceType`), และ `riskLevel`
    - สร้าง migration `20261009080000_approval_v2` รองรับ idempotent DDL
  - ปรับปรุง Approval Rule Domain (`approval-rules.ts`):
    - เพิ่ม `ApprovalEvaluationContext` สำหรับการกรองกฎตาม `entityType`, `productId`, `insuranceTypeId`, `riskLevel`
    - เพิ่ม D-8 Seed Rules: เบี้ยประกัน < 100,000 บาท (ส่วนลด ≤ 10%) ไม่ต้องขออนุมัติ; ให้สิทธิ์ `approval.approve` แก่บทบาท `SUPERVISOR`
  - ปรับปรุงการทำงานของการปฏิเสธและการยื่นใหม่ (Approval Actions V2):
    - `POST /api/approvals/:id/reject`: บันทึก `rejectReason`, `comment`, `rejectedBy`, `rejectedAt` และเปลี่ยนสถานะ Job จาก `WAITING_APPROVAL` เป็น `APPROVAL_REJECTED` (แทนพฤติกรรมเดิมใน V1 Q4)
    - `POST /api/approvals/:id/resubmit`: อนุญาตให้ยื่นขออนุมัติใหม่สำหรับคำขอที่ถูกปฏิเสธและ Job อยู่ในสถานะ `APPROVAL_REJECTED`, บันทึก `resubmittedBy`, `resubmittedAt`, สร้าง Approval ใหม่สถานะ `PENDING`, และปรับสถานะ Job กลับเป็น `WAITING_APPROVAL`
    - อัปเดต State Machine (`job-status.ts`): รองรับ action `resubmit` ในสถานะ `APPROVAL_REJECTED` และอนุญาตให้ `revise` กลับไปยัง `QUOTATION_RECEIVED`
  - ระบบแจ้งเตือน (Notifications):
    - เพิ่ม `NotificationType.APPROVAL_REJECTED` และส่งการแจ้งเตือนไปยังผู้สร้างงาน/ตัวแทน/เจ้าหน้าที่
    - ส่งการแจ้งเตือน `APPROVAL_REQUESTED` ถึงผู้อนุมัติตามระดับสิทธิ์เมื่อมีการ resubmit
  - ทดสอบและตรวจสอบคุณภาพ:
    - เพิ่ม Approval Rule Domain Specs ครอบคลุม 27 กรณีทดสอบ (D-8 rules และ context filtering)
    - เพิ่ม Workflow Unit Specs (`approval-workflow-v2.spec.ts`) 8 รายการ ทดสอบ reject & resubmit lifecycle
    - ปรับปรุง E2E specs (`approval.e2e-spec.ts` และ `proposal.e2e-spec.ts`)
    - รัน `npm run test -w apps/api` ผ่าน 40/40 test files (467 tests passed 100%)
    - รัน `npm run test -w apps/web` ผ่าน 5/5 test files (14 tests passed 100%)
    - รัน `npm run lint`: 0 errors, 0 warnings ทั้ง api และ web
    - รัน `npm run build`: compile ผ่าน 100% ทั้ง API และ Web
- **ยกไป:** -
- **ถัดไป:** Phase 3 — Approval, Binding, Policy: Day 19 — Binding lifecycle

### 2026-10-09 — Day 17 เสร็จสิ้น (Phase 2 Buffer + Review)

### 2026-10-08 — Day 16 เสร็จสิ้น (Proposal / Acceptance UI V2)
- **เสร็จ:**
  - พัฒนาหน้าจอ Master Payment Term (`/master/payment-terms`):
    - สร้าง `PaymentTermsPage` สำหรับจัดการเงื่อนไขการชำระเงิน (CRUD) พร้อมแสดงรหัส, ชื่อ, คำอธิบาย, จำนวนงวด, ระยะห่างงวด (เดือน), วันครบกำหนดงวดแรก (วัน), สถานะใช้งาน/ไม่ใช้งาน
    - Dialog เพิ่มและแก้ไขเงื่อนไขการชำระเงิน พร้อม form validation
    - Confirmation Dialog สำหรับการลบข้อมูลพร้อมแจ้งเตือนผ่าน Toast
    - เพิ่มแท็บ "เงื่อนไขการชำระเงิน" ใน Master Hub และผูก routing ใน `master.routes.ts`
    - เพิ่ม `PaymentTerm` interface และ CRUD client methods (`listPaymentTerms`, `getPaymentTerm`, `createPaymentTerm`, `updatePaymentTerm`, `deletePaymentTerm`) ใน `MasterApi`
  - ปรับปรุงการสร้างเอกสาร Proposal PDF (`ProposalDocumentService` และ `proposal-template.ts`):
    - แสดงหมายเลขเวอร์ชันของใบเสนอราคา (`ฉบับที่ v{version}`) บนส่วนหัวและบน Puppeteer footer
    - Query และเชื่อมโยง `PaymentTerm` ในการสร้าง PDF พร้อมคำนวณตารางงวดการชำระเงินตามสูตร OQ-3 (หารเท่ากันปัดเศษ 2 ตำแหน่ง เศษส่วนต่างไปงวดสุดท้าย, คำนวณวันครบกำหนดตาม `firstDueDays` และ `intervalMonths`)
    - เพิ่ม Section 5 "เงื่อนไขและการแบ่งงวดชำระ (Payment Terms & Installments)" แสดงชื่อเงื่อนไข, จำนวนงวด, และตารางแจกแจงงวดที่, กำหนดชำระ, และยอดชำระต่องวด
    - เพิ่ม Unit Test `proposal-template.spec.ts` (4 passed) ทดสอบการเรนเดอร์เวอร์ชัน, เงื่อนไขการชำระเงิน, ตารางงวดผ่อน, และ footer
  - ปรับปรุง Tab Proposal (Tab 7) บน `JobDetailPage`:
    - แสดงรายการเวอร์ชันข้อเสนอ (Version List) เรียงลำดับจากล่าสุดลงไป พร้อม badge เวอร์ชัน (`v{{ prop.version }}`) และสถานะ (`DRAFT`, `SENT`, `VIEWED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `SUPERSEDED`)
    - แสดงข้อมูลเงื่อนไขการชำระเงิน (`PaymentTerm`) และรายละเอียดสรุปความคุ้มครอง (Coverage Summary), เงื่อนไขทั่วไป (Terms), เงื่อนไขพิเศษ (Conditions), หมายเหตุ (Remark)
    - ปรับปรุง Dialog สร้างใบเสนอ (`showCreateProposalDialog`): ดึงข้อมูล Active Payment Terms มาให้เลือกผ่าน Dropdown, ฟิลด์ระบุวันที่เสนอราคา, ยืนราคาถึงวันที่, สรุปความคุ้มครอง, เงื่อนไข, และหมายเหตุ
    - ปรับเงื่อนไขการแสดงปุ่มสร้างใบเสนอ (`canCreateProposal`) ให้รองรับการสร้างเวอร์ชันใหม่หลัง revise ได้อย่างถูกต้อง
    - เพิ่มปุ่มและ Dialog "ปรับปรุงข้อเสนอ (Revise)" (`showReviseProposalDialog`): ทำงานเมื่อ Job อยู่ในสถานะ `WAITING_CUSTOMER` หรือ `APPROVAL_REJECTED` เพื่อส่งคำขอปรับปรุงข้อเสนอ คืนสถานะงานกลับเป็น `QUOTATION_RECEIVED` และตั้งสถานะใบเสนอเป็น `SUPERSEDED`
    - เพิ่ม Dialog "บันทึกการยอมรับข้อเสนอ (Accept Proposal)" (`showAcceptProposalDialog`): รองรับการระบุชื่อผู้ตอบรับ, วิธีการตอบรับ (`EMAIL`, `SIGNED_DOCUMENT`, `LINE`, `MANUAL`), อัปโหลดไฟล์หลักฐาน (บังคับสำหรับวิธีที่ไม่ใช่ MANUAL), และหมายเหตุ (บังคับสำหรับวิธี MANUAL) ตามข้อกำหนด D14 พร้อมส่งข้อมูลแบบ multipart form-data
    - แสดงบล็อกรายละเอียดการยอมรับข้อเสนอ (`Acceptance Evidence`): วิธีตอบรับ, ผู้ตอบรับ, วันที่ตอบรับ, ผู้บันทึก, IP Address, หมายเหตุ, และปุ่มดาวน์โหลดไฟล์หลักฐาน
  - เพิ่มสถานะ `SENT`, `VIEWED`, `ACCEPTED` ใน `AppStatusBadgeComponent`
  - อัปเดต OpenAPI schema (`openapi.json`) และ generate `schema.d.ts` สำหรับ frontend
  - ตรวจสอบ `npm run test -w apps/api` (456/456 passed), `npm run test -w apps/web` (14/14 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100% ทั้ง api และ web
- **ยกไป:** -
- **ถัดไป:** Day 17 — Phase 2 Buffer + Review

### 2026-10-08 — Day 15 เสร็จสิ้น (Quotation UI V2)
- **เสร็จ:**
  - พัฒนาหน้าจอ Master Commission Rate (`/master/commission-rates`):
    - สร้าง `CommissionRatesPage` รองรับการดูรายการ, กรองตามบริษัทประกันและผลิตภัณฑ์, ตรวจสอบสถานะการมีผลบังคับใช้
    - ฟอร์ม Dialog เพิ่ม/แก้ไขอัตราคอมมิชชัน (%) พร้อมกำหนดช่วงวันที่เริ่มมีผล (effectiveFrom) และสิ้นสุด (effectiveTo)
    - รองรับการลบอัตราคอมมิชชันด้วย Confirmation Dialog
    - เพิ่มแท็บ "อัตราคอมมิชชัน" ใน Master Hub และผูก Routing ใน `master.routes.ts`
    - เพิ่ม `CommissionRate` interface และ CRUD client methods ใน `MasterApi`
  - ปรับปรุง Tab Quotation บน `JobDetailPage`:
    - แสดง badge เวอร์ชัน `v{{ q.version }}` พร้อมปุ่มขยายดูประวัติเวอร์ชันทั้งหมด (Version History Table) ต่อบริษัทประกัน (แสดงเวอร์ชัน, สถานะ, เบี้ยรวม, ส่วนลด, เบี้ยสุทธิ, รวมทั้งสิ้น, คอมมิชชัน, วันหมดอายุ, เงื่อนไข, วันที่บันทึก)
    - เพิ่ม badge หมดอายุ (`badge-expired`) เมื่อใบเสนอราคาหมดอายุ (`isQuotationExpired`)
    - เพิ่มปุ่ม "ปรับปรุงราคา (Version ใหม่)" (`openRecordVersion`) สำหรับ Quotation สถานะ `RECEIVED` เพื่อบันทึกเวอร์ชันใหม่ตาม D11-D12 (`POST /api/quotations/:id/versions`)
    - ปรับปรุง Dialog บันทึกราคา รองรับฟิลด์ใหม่ทั้งหมด: `deductible`, `commissionRate`, `specialCondition`, `exclusion`, `underwriter`, `insurerReference`, และรายการความคุ้มครองย่อย
    - เพิ่มปุ่มและ Dialog "ถอนใบเสนอราคา" (`withdraw`) สำหรับสถานะ `REQUESTED` / `RECEIVED` พร้อมระบุเหตุผลในการถอน
  - ปรับปรุง Tab Comparison (เปรียบเทียบใบเสนอราคา) ตามฟิลด์ D12:
    - ตารางเปรียบเทียบแบบหลายมิติ: ข้อมูลเบี้ยประกันภัย (เบี้ยรวม, ส่วนลด, เบี้ยสุทธิ, อากรแสตมป์/ภาษี, รวมทั้งสิ้น), เงื่อนไขและข้อกำหนด (ค่าเสียหายส่วนแรก, ข้อยกเว้น, เงื่อนไขพิเศษ, อัตราคอมมิชชัน, ระยะเวลายื่นข้อเสนอ, ผู้พิจารณา/เลขอ้างอิง), และรายละเอียดความคุ้มครองย่อย
    - เน้นไฮไลต์บริษัทที่มีเบี้ยต่ำสุด/ดีที่สุด (`isLowest`) ด้วยคอลัมน์สีเขียวและ badge "เบี้ยต่ำที่สุด"
    - ตรวจสอบสถานะหมดอายุในหน้าเปรียบเทียบ และบล็อกการกดเลือกหากใบเสนอราคาหมดอายุ
    - แสดงเวอร์ชันใน Dialog ยืนยันการเลือก และส่ง `col.version` ไปยัง API `selectQuotation`
  - เพิ่มสถานะ `REQUESTED`, `RECEIVED`, `SELECTED`, `WITHDRAWN` ใน `AppStatusBadgeComponent`
  - ปรับปรุง `JobsApi` เพิ่ม `recordQuotationVersion` และอัปเดตโมเดล `Quotation`, `QuotationVersion`
  - อัปเดต OpenAPI schema และ TypeScript schema definitions
  - ตรวจสอบ `npm run test -w apps/api` (452/452 passed), `npm run test -w apps/web` (14/14 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100% ทั้งระบบ
- **ยกไป:** -
- **ถัดไป:** Day 16 — Proposal / Acceptance UI V2

### 2026-10-08 — Day 14 เสร็จสิ้น (Acceptance Evidence)
- **เสร็จ:**
  - สร้างโมเดล `ProposalAcceptance` (`proposal_acceptances` table: `proposalVersion`, `acceptedByName`, `acceptedAt`, `method` EMAIL/SIGNED_DOCUMENT/LINE/MANUAL, `ipAddress`, `evidenceFileId`, `remark`, `recordedById`) พร้อม enum `AcceptanceMethod` และ migration SQL `20261008150000_proposal_acceptance_evidence`
  - พัฒนา Domain Validator `validateAcceptanceEvidence()`: กำหนดเงื่อนไข `method !== 'MANUAL'` ต้องแนบหลักฐาน (file หรือ evidenceFileId), `method === 'MANUAL'` ต้องระบุ remark หากไม่ตรงเงื่อนไข throw 422 `ACCEPTANCE_EVIDENCE_REQUIRED`
  - ปรับปรุง `POST /proposals/:id/accept`: รองรับทั้ง multipart form-data (อัปโหลดไฟล์หลักฐานและบันทึกเป็น Document type OTHER โดยอัตโนมัติ) และ JSON (`evidenceFileId`), บันทึก `ProposalAcceptance` พร้อม IP Address และผู้บันทึก, ส่งแจ้งเตือน `CUSTOMER_ACCEPTED` ไปยัง Job creator, broker staff, และ assignedTo
  - พัฒนา API `GET /proposals/:id/acceptance` ดึงข้อมูลหลักฐานการยอมรับล่าสุด
  - ปรับปรุง `reject` ให้ส่งแจ้งเตือน `CUSTOMER_REJECTED` ถึงผู้ดูแล Job
  - อัปเดต OpenAPI schema และสร้าง API client types สำหรับ Web
  - พัฒนาชุดทดสอบ `proposal-acceptance-evidence.spec.ts` (12 passed) และ unit tests domain (9 passed) ครอบคลุม validation, manual acceptance, multipart upload, pre-uploaded document linking, notifications
  - ตรวจสอบ `npm run test` (452/452 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100% ทั้ง api และ web
- **ยกไป:** -
- **ถัดไป:** Day 15 — Quotation UI V2

### 2026-10-08 — Day 13 เสร็จสิ้น (Proposal Version + Payment Term + Revise)
- **เสร็จ:**
  - สร้าง Master Model `PaymentTerm` (`payment_terms` table: name, installments, intervalMonths, firstDueDays, isActive) พร้อม migration SQL `20261008140000_proposal_version_and_payment_terms`
  - Seed ข้อมูล Payment Terms ตามข้อกำหนด OQ-2: ชำระเต็มจำนวน (1 งวด 30 วัน), ผ่อน 3 งวด (ห่างงวดละ 1 เดือน), ผ่อน 6 งวด (ห่างงวดละ 1 เดือน) พร้อมลงทะเบียน permission `proposal.revise`
  - พัฒนา CRUD Master Payment Terms: `GET/POST/PUT/DELETE /master/payment-terms` พร้อม unit test `master-payment-term.spec.ts` (6 passed)
  - ปรับปรุงโมเดล `Proposal`: เพิ่ม `ProposalStatus.SUPERSEDED`, `JobStatus.APPROVAL_REJECTED`, และฟิลด์ `quotationVersionId`, `paymentTermId`, `coverageSummary`, `terms`, `conditions`
  - ปรับปรุงการคำนวณ Proposal Version ให้เป็นเวอร์ชันของเอกสารต่อ Job (`max(version) + 1` ไม่นับทับตอนเปลี่ยนสถานะ)
  - พัฒนางานประจำวันตรวจ Proposal หมดอายุ: `ProposalService.expireOutdatedProposals()` / `POST /proposals/daily-check` ปรับ Proposal ที่เลย `validUntil` เป็น `EXPIRED` โดยสถานะ Job ยังคงเป็น `WAITING_CUSTOMER`
  - เพิ่ม Action `revise`: รองรับเรียกผ่าน `POST /jobs/:id/revise` และ `POST /proposals/:id/revise` เปลี่ยนสถานะจาก `WAITING_CUSTOMER` หรือ `APPROVAL_REJECTED` กลับไป `QUOTATION_RECEIVED`, มาร์ก Proposal ปัจจุบันเป็น `SUPERSEDED`, เคลียร์ `selectedQuotationId`, ถอยสถานะ Quotation เป็น `RECEIVED` และ Quotation Version เป็น `ACTIVE`, ยกเลิก Approval ที่ค้างเป็น `CANCELLED`
  - เชื่อมโยง Frontend: เพิ่ม `APPROVAL_REJECTED` และ `SUPERSEDED` ในสถานะ Badge, เพิ่ม action `revise` ใน `JobDetailComponent`, อัปเดต OpenAPI schema และ client types
  - พัฒนาชุดทดสอบ `proposal-version.spec.ts` ครอบคลุมการออกเวอร์ชัน, ตรวจสอบ payment term, การหมดอายุ และ full revise workflow (9 passed)
  - ตรวจสอบ `npm run test` (431/431 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100% ทั้ง api และ web
- **ยกไป:** -
- **ตัดสินใจ/เปลี่ยนแปลง:** ให้ `proposal.version` แสดงเวอร์ชันของตัวเอกสารข้อเสนอต่อ Job (Proposal V1, V2, ...) แทนการบวกเลขตามการส่ง/ยอมรับ เพื่อให้สอดคล้องกับแนวคิด QuotationVersion
- **ถัดไป:** Day 14 — Acceptance Evidence

### 2026-10-08 — Day 12 เสร็จสิ้น (Quotation actions V2)
- **เสร็จ:**
  - พัฒนา `QuotationService.recordVersion`: อัปเดต Quotation โดยสร้าง `QuotationVersion` ใหม่ และมาร์กเวอร์ชันเก่าเป็น `SUPERSEDED`
  - พัฒนา `QuotationService.withdraw`: เปลี่ยนสถานะ Quotation เป็น `WITHDRAWN`
  - พัฒนา `QuotationService.select`: ตรวจสอบความถูกต้องว่าต้องเลือกเวอร์ชันล่าสุดของใบเสนอราคา และต้องไม่หมดอายุ (`validUntil >= now`)
  - พัฒนางานรายวัน: ตรวจสอบ Quotation ที่หมดอายุ (`validUntil < today`) ปรับเป็น `EXPIRED` พร้อมส่ง Notification `QUOTATION_EXPIRING` ล่วงหน้า 3 วัน
  - จัดการสถานะ Quotation เมื่อปิดงาน: เมื่อ Job เปลี่ยนสถานะเป็น `CLOSED` หรือออกกรมธรรม์ Quotation อื่นที่ไม่ถูกเลือกจะถูกปรับเป็น `REJECTED` อัตโนมัติ (ตาม D-5)
  - พัฒนา Comparison API (`GET /jobs/:id/quotations/comparison`): สรุปเปรียบเทียบ insurer, premium, coverage, limit, deductible, exclusion, condition, commission, validity ของเวอร์ชันล่าสุด
  - พัฒนาชุดทดสอบ `quotation-actions-v2.spec.ts` ครอบคลุมทุก Action และการเปรียบเทียบ
- **ยกไป:** -
- **ถัดไป:** Day 13 — Proposal Version + Payment Term + Revise

### 2026-10-08 — Day 11 เสร็จสิ้น (Quotation Version + Commission Rate master)
- **เสร็จ:**
  - สร้างโมเดล `QuotationVersion` (`quotation_versions` table: status ACTIVE/SELECTED/SUPERSEDED/EXPIRED, version number, premium, netPremium, duty, tax, coverages, limits, conditions)
  - สร้างโมเดล `CommissionRate` (`commission_rates` table: insurerId, insuranceTypeId, standardRate, agentRate, effectiveDate, expiryDate) พร้อม CRUD API `/master/commission-rates`
  - อัปเดต Prisma schema และสร้าง migration SQL `20261008120000_quotation_version_and_commission_rates`
  - พัฒนาชุดทดสอบ `quotation-version.spec.ts` และ `master-commission-rate.spec.ts`
- **ยกไป:** -
- **ถัดไป:** Day 12 — Quotation actions V2

### 2026-10-08 — Day 10 เสร็จสิ้น (Phase 1 Buffer + Review)
- **เสร็จ:**
  - เขียน Playwright flow ใหม่ `apps/web/e2e/phase1-document-underwriting.spec.ts` (8 steps: สร้างงานบน product ที่ต้อง underwriting → upload → submit → verify (คนละ user) → request quotation ถูกบล็อก 422 → request-review → approve (maker-checker) → request quotation สำเร็จ) ผ่านทั้งหมดบนเบราว์เซอร์จริง
  - `/dod-check document, underwriting`: document 16/18 (เกณฑ์หลักครบ, เหลือ test เขียนผิดเดิมจาก Day 3), underwriting 12/12 ครบ
  - แก้ assertion 403→404 ผิดใน `document.e2e-spec.ts` (2 เคส) ให้ตรงกับ data scope ที่ตั้งใจ (D-21)
  - เพิ่ม label ภาษาไทยให้ `AppStatusBadgeComponent` ครอบคลุม Document V2 (`REQUIRED/UPLOADED/UNDER_REVIEW/VERIFIED/REJECTED`) และ Underwriting (`PENDING/INFO_REQUIRED`) ที่ก่อนหน้านี้ fallback เป็น raw string ภาษาอังกฤษ
  - พบและแก้ปัญหา infra: `document_sequences` counter เพี้ยนได้ (เจอกับทั้ง prefix `QT` และ `JOB`) ทำให้เลขที่เอกสารชนกัน (`DUPLICATE_ENTRY`) — เพิ่ม `apps/api/test/global-setup-e2e.ts` (vitest `globalSetup`) ที่ sync counter ให้ไม่ต่ำกว่าเลขสูงสุดที่มีจริงก่อนรัน e2e ทุกครั้ง
  - อัปเดต DESIGN.md: §7.1 เพิ่มแถว underwriting ในตาราง Action→Transition, §7.3 ใหม่ (Document Status V2 + Underwriting record, maker-checker), §9.4 เพิ่ม tab Underwriting, §3 เพิ่ม module `underwriting/`
- **คงไว้เป็น known issue (นอกสโคป Phase 1, มาจาก Day ก่อนหน้า):** quotation.e2e-spec.ts ×3 (duplicate company code หาย, idempotency RECEIVED หาย, delete 404→400), task.e2e-spec.ts ×3 และ job.e2e-spec.ts ×2 (403/200 vs 404/201 ที่เป็น test เขียนผิด ไม่ใช่โค้ดผิด), proposal.e2e-spec.ts ×1 (`DocumentStatus.ACTIVE` ที่เลิกใช้ตั้งแต่ Day 6)

### 2026-10-08 — Day 4 เสร็จสิ้น (Audit Log V2 + Notification infrastructure)
- **เสร็จ:**
  - อัปเดต `ActivityLog` ใน `schema.prisma`: เพิ่ม enum `ActivitySource` (`WEB`, `API`, `JOB`, `IMPORT`), ฟิลด์ `source` (default `WEB`) และ `remark` (`String?`) พร้อม migration SQL และ prisma generate
  - สร้าง pure helper `diffChanges(before, after)` ใน `common/audit/domain/audit-diff.ts` คำนวณความแตกต่างเฉพาะฟิลด์ที่เปลี่ยนแปลง พร้อม normalize Date/Decimal และ ignore metadata fields (`updatedAt`, `createdAt`, `version`)
  - อัปเดต `AuditService.log()` รองรับ `source`, `remark` และคำนวณ `diffChanges` อัตโนมัติเมื่อระบุ `before`/`after`
  - นำ Audit diff ไปใช้ใน Service สำคัญ:
    - `QuotationService.recordReceived/update`: บันทึก before/after diff ของเบี้ยและส่วนลด
    - `PolicyService.updatePolicy`: บันทึก before/after diff ของวันครบกำหนดและหมายเหตุ
    - `PolicyService.issuePolicy`: บันทึก audit log กรมธรรม์
    - `PaymentService.create/cancel`: บันทึก before/after diff ของการชำระเงินและเหตุผลการยกเลิก
    - `MasterService`: บันทึก audit log สำหรับการสร้าง/แก้ไข/ลบ Branch, InsuranceType, Product, ApprovalRule
  - สร้าง API `GET /audit-logs`: ตัวกรอง `userId`, `entityType`, `entityId`, `action`, `startDate`, `endDate`, pagination พร้อมป้องกันด้วย permission `audit.view` (กำหนดให้ `ADMIN` และ `MANAGER` เท่านั้น)
  - เพิ่ม model `NotificationPreference` (`notification_preferences`) สำหรับจัดเก็บการเปิด/ปิดแจ้งเตือน (email และ in-app) ตามราย Event ของผู้ใช้
  - พัฒนาโครงสร้างระบบ Notification:
    - `NotificationService.emit(event, recipients, payload)` เคารพ Notification Preference ของแต่ละผู้รับ
    - `EmailService` + `NotificationProcessor` (BullMQ queue: `notification`) รองรับส่ง email จริงผ่าน Mailpit และ fallback direct/in-memory สำหรับการทดสอบ
    - `renderEmail` template สวยงามสำหรับ Event ต่าง ๆ พร้อมปุ่ม Action
    - API `GET/PUT /notifications/preferences` สำหรับดูและปรับแต่งการแจ้งเตือนของผู้ใช้
  - เชื่อมโยง Event สำคัญจริงในระบบ:
    - `QUOTATION_RECEIVED`: ส่งแจ้งเตือนถึง Agent และ Broker Staff ผู้ดูแล Job
    - `APPROVAL_REQUESTED`: ส่งแจ้งเตือนและ Email ถึงผู้อนุมัติ (Approvers / Manager) เมื่อส่วนลดเกินเกณฑ์ที่กำหนด
    - `POLICY_ISSUED`: ส่งแจ้งเตือนถึง Agent และ Broker Staff เมื่อกรมธรรม์ออกแล้ว
  - พัฒนาชุดทดสอบครอบคลุม:
    - `audit-diff.spec.ts`: ทดสอบความถูกต้องของ diffChanges (7 passed)
    - `audit.service.spec.ts`: ทดสอบการบันทึก Audit, diff, source, remark, findLogs (8 passed)
    - `notification.service.spec.ts`: ทดสอบ emit, email dispatch, opt-out preferences, templates (6 passed)
    - `audit-v2.spec.ts`: ทดสอบ flow e2e ตามเกณฑ์ Day 4 (5 passed)
  - ตรวจสอบ `npm run test` (336/336 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100% ทั้ง api และ web
- **ยกไป:** -
- **ตัดสินใจ/เปลี่ยนแปลง:** ให้ Notification Preferences ใช้โมเดลแบบ Opt-out (ค่าเริ่มต้น In-app: true, Email: true) และ EmailService มี in-memory logging fallback พร้อม auto-retry เพื่อไม่ให้ส่งผลกระทบต่อ Transaction หลักเมื่อ Mailpit หรือ Redis ไม่พร้อมทำงาน
- **ถัดไป:** Day 5 — Phase 0 UI + Review

### 2026-10-08 — Day 3 เสร็จสิ้น (Data Scope apply)
- **เสร็จ:**
  - นำ Data Scope ไปใช้จริงในทุก Service: `JobService`, `CustomerService`, `PolicyService`, `QuotationService`, `ProposalService`, `PaymentService`, `CommissionService`, `TaskService`, `RenewalService`, `DocumentService` (Entities ที่ขึ้นกับ Job สืบทอด Job scope อัตโนมัติ)
  - นำ Customer Data Scope ตาม D-21 ไปประยุกต์ใช้ใน `CustomerService` (list, findOne, update, remove) โดย User เห็นเฉพาะลูกค้าที่ตนสร้างขึ้นเอง หรือลูกค้าที่เกี่ยวข้องกับ Job ที่ตนมีสิทธิ์เข้าถึง พร้อมอัปเดต Q11 ใน `docs/PLAN.md` เป็น Resolved
  - เชื่อมโยง Data Scope เข้ากับ `JwtAuthGuard`, `AuthService`, และ `AppClsStore`: ฝัง `branchId` และ `dataScope` ใน Access Token Payload และ CLS, พร้อมคำนวณ `teamUserIds` แบบ recursive เมื่อมีสิทธิ์ TEAM
  - ปรับ `JobService.getOne`, `CustomerService.findOne/update/remove`, `PolicyService.getPolicyById`, `TaskService.complete` ให้คืนค่า 404 (Not Found) เมื่อเข้าถึงข้อมูลนอก Scope เพื่อป้องกัน entity existence leakage
  - อัปเดต `JobService.create` ให้ผูก `branchId` จาก creator หรือ DTO เข้ากับ Job โดยอัตโนมัติ พร้อมคืนข้อมูล branch ใน `JobResponse`
  - ปรับปรุง `DashboardService.managerDashboard()` ให้รวม data scope เข้ากับการนับและการ aggregate ทุกตัวชี้วัด (Job, Policy, Commission, Task)
  - อัปเดต Seed ข้อมูลตัวอย่าง: กระจาย User ไปยัง 2 สาขา (HQ, CM) พร้อมเพิ่ม `staff_cm`
  - พัฒนาชุดทดสอบ `data-scope-apply.spec.ts` ครอบคลุมทั้ง 16 กรณีทดสอบ (Agent OWN, Staff Branch A vs Branch B unassigned/assigned, Manager recursive team, Finance/Admin ALL, Customer D-21, 404 out-of-scope, Dashboard metrics)
  - ทดสอบ `npm run test` (315/315 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100% ทั้งระบบ
- **ยกไป:** -
- **ตัดสินใจ/เปลี่ยนแปลง:** เมื่อเข้าถึง Resource นอก Scope ผ่าน `GET /:id` ให้โยน 404 แทน 403 เสมอ เพื่อรักษาความปลอดภัยด้านการรั่วไหลของการมีอยู่ของข้อมูล (entity existence leakage)
- **ถัดไป:** Day 4 — Audit Log V2 + Notification infrastructure

### 2026-10-08 — Day 2 เสร็จสิ้น (Branch, Team & Data Scope domain)
- **เสร็จ:**
  - สร้าง Model `Branch` (table `branches`), enum `DataScope` (`OWN`, `ASSIGNED`, `TEAM`, `BRANCH`, `ALL`), เพิ่ม `User.branchId`, `User.managerId`, `Job.branchId`, `Role.dataScope` พร้อม migration SQL และ prisma generate
  - พัฒนา CRUD Master Branches: `GET/POST/PUT/DELETE /master/branches` (สิทธิ์ `master.manage` สำหรับเขียน) พร้อม unit test `master-branch.spec.ts`
  - อัปเดต User Management API: รองรับ `branchId` และ `managerId`, ป้องกัน user ตั้งตัวเองเป็น manager พร้อม unit test `user-branch.spec.ts`
  - กำหนด `ROLE_DATA_SCOPE` ใน `seed-data.ts` และอัปเดต `seed.ts` ให้ seed branches, role data scopes และ sample user relationships
  - สร้าง `domain/data-scope.ts` ฟังก์ชัน pure function สำหรับสร้าง Prisma `where` ของ `Job`, `Customer`, `Policy` ครบทั้ง 5 scope พร้อมฟังก์ชันคำนวณ `resolveTeamUserIds()` แบบ recursive ป้องกัน cycle และ `resolveEffectiveScope()`
  - พัฒนา Unit Test `data-scope.spec.ts` ครอบคลุม 5 scopes × 3 entities (25 passed)
  - ตรวจสอบ `npm run test` (299/299 passed), `npm run lint` (0 errors, 0 warnings), และ `npm run build` ผ่าน 100%
- **ยกไป:** -
- **ตัดสินใจ/เปลี่ยนแปลง:** เพิ่ม `Job.branchId` พร้อม relation และ index เพื่อให้การกรองข้อมูลสาขาและโอนย้ายงานข้ามสาขามีประสิทธิภาพสูงสุด
- **ถัดไป:** Day 3 — Data Scope (apply)

### 2026-10-08 — Day 1 เสร็จสิ้น (Foundation fixes & Job Assignment)
- **เสร็จ:**
  - แก้ไข permission ของ `POST /jobs/:id/assign` ให้ตรวจ `job.assign` พร้อม data scope check
  - เพิ่ม model `JobAssignmentHistory` (table `job_assignment_histories`) และ enum `AssignmentRole` พร้อม Prisma migration
  - เพิ่ม `Job.brokerStaffId` และ relation กับ User (`brokerStaff`)
  - อัปเดต `JobService.assign()` บันทึกประวัติการมอบหมาย พร้อมรองรับ AGENT, BROKER_STAFF, MANAGER และเพิ่ม endpoint `GET /jobs/:id/assignment-histories`
  - ปรับปรุง `Binding.effectiveDate` ให้ใช้วันเริ่มคุ้มครองจาก `job.effectiveDate`
  - อัปเดต `seed-mock.ts` ให้บันทึก `JobStatusHistory` และ `JobAssignmentHistory` สมบูรณ์
  - ปรับปรุง `TESTING_FLOW.md` ให้สอดคล้องกับข้อสังเกต SYSTEM_FLOW §10 ข้อ 1–5
  - เพิ่ม unit test `job-assignment.spec.ts` (8 passed) และอัปเดต e2e test ใน `job.e2e-spec.ts`
  - ตรวจสอบ `npm run lint` และ `npm run build` ผ่าน 100% ทั้ง api และ web
- **ยกไป:** -
- **ตัดสินใจ/เปลี่ยนแปลง:** ให้ `assign()` ซิงค์ฟิลด์ `assignedTo` กับ `brokerStaffId` เพื่อ backward compatibility ของ V1 components
- **ถัดไป:** Day 2 — Branch, Team & Data Scope (domain)

### 2026-10-08 — วางแผน V2
- **เสร็จ:** ถามและบันทึกการตัดสินใจ D-1 ถึง D-26, สร้าง PLAN_V2.md (47 วัน, 8 Phase)
- **ยกไป:** -
- **ตัดสินใจ/เปลี่ยนแปลง:** ขอบเขต P0+P1, ทำบน branch `v2`, ไม่ต้อง migrate ข้อมูลเก่า
- **ถัดไป:** Day 1 — แก้จุดค้างจาก V1 + Job Assignment
