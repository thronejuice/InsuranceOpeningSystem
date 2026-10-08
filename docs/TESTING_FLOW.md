# คู่มือทดสอบ: Flow การเปิดงานประกัน (End-to-End)

> เอกสารนี้อธิบาย flow ทั้งหมดตั้งแต่เปิดงานจนถึงกรมธรรม์ รวมถึง user ที่ต้องใช้แต่ละขั้น

---

## บัญชีสำหรับทดสอบ

| Username | Password | Role | ทำได้ |
|---|---|---|---|
| `admin` | `Password@123` | ADMIN | ทุกอย่าง รวมถึงอนุมัติงานตัวเอง |
| `agent01` | `Password@123` | AGENT | สร้าง Job, ดูงานตัวเอง |
| `staff` | `Password@123` | BROKER_STAFF | ขอ/บันทึก/เลือก Quotation, Bind |
| `manager` | `Password@123` | MANAGER | อนุมัติ Approval |
| `finance` | `Password@123` | FINANCE | บันทึก Payment, Commission |

> ⚠️ **ข้อจำกัดที่รู้แล้ว (P2-1):** `agent01` ยังสร้าง Job ไม่ได้เพราะหน้าสร้างเรียก `GET /api/users` ซึ่งต้องการ `user.manage` ให้ใช้ `admin` สร้าง Job แทน

---

## ภาพรวม Status Machine

```
DRAFT → OPEN → QUOTATION_REQUESTED → QUOTATION_RECEIVED → QUOTATION_SELECTED
                                                                     ↓
                                                              PROPOSAL_SENT
                                                                     ↓
                                                           WAITING_CUSTOMER
                                                            ↙            ↘
                                                   CUSTOMER_ACCEPTED   CUSTOMER_REJECTED
                                                         ↓                    ↓
                                                  WAITING_APPROVAL          CLOSED
                                                         ↓
                                                       APPROVED
                                                         ↓
                                                       BINDING
                                                         ↓
                                                    POLICY_PENDING
                                                         ↓
                                                    POLICY_ISSUED → RENEWAL / CLOSED
```

> ทุก status ยกเว้น POLICY_ISSUED / CANCELLED / CLOSED / EXPIRED / RENEWAL สามารถ **ยกเลิก (CANCELLED)** ได้

---

## Flow รายขั้น

---

### ขั้นที่ 1 — สร้างลูกค้า (Customer)

**Login:** `admin` หรือ `agent01`  
**เมนู:** Customers → สร้างใหม่

| Field | ตัวอย่าง |
|---|---|
| ประเภทลูกค้า | CORPORATE หรือ INDIVIDUAL |
| ชื่อ/บริษัท | บริษัท ทดสอบ จำกัด |
| Tax ID / เลขบัตรประชาชน | 1234567890123 |
| อีเมล / เบอร์โทร | test@example.com |

✅ ผลลัพธ์: Customer ถูกสร้าง มี Customer ID

---

### ขั้นที่ 2 — สร้างงานประกัน (Create Job) → Status: `DRAFT`

**Login:** `admin`  
**เมนู:** Jobs → สร้างใหม่

| Field | ตัวอย่าง |
|---|---|
| ลูกค้า | เลือก Customer ที่สร้างไว้ |
| ประเภทประกัน | เช่น ประกันอัคคีภัย |
| ผลิตภัณฑ์ | เช่น FIRE-001 ประกันอัคคีภัยธุรกิจ |
| Agent | เลือก Agent |
| วันที่ต้องการ | กำหนดวันที่ต้องการ |

✅ ผลลัพธ์: Job ถูกสร้าง สถานะ `DRAFT`, มี Job Number เช่น `JOB-2026-000002`

---

### ขั้นที่ 3 — กรอกข้อมูลความเสี่ยง (Risk Information) → ยังอยู่ `DRAFT`

**Login:** `admin` หรือ `staff`  
**Tab:** ข้อมูลความเสี่ยง (Risk)

- กรอกข้อมูลตามประเภทประกัน เช่น:
  - ประกันรถ: ประเภทรถ, ยี่ห้อ, รุ่น, ปี, ทะเบียน, มูลค่า
  - ประกันอัคคีภัย: ประเภทอาคาร, พื้นที่, มูลค่าทรัพย์สิน
  - ประกัน Cyber: ขนาดองค์กร, รายได้ต่อปี, ระบบที่ใช้

✅ ผลลัพธ์: ข้อมูลความเสี่ยงถูกบันทึก

---

### ขั้นที่ 4 — เพิ่มความคุ้มครอง (Coverage) → ยังอยู่ `DRAFT`

**Tab:** ความคุ้มครอง

- กด "เพิ่มความคุ้มครอง"
- เลือก Coverage ที่ต้องการ (เช่น ความคุ้มครองหลัก, ความรับผิดต่อบุคคลภายนอก)
- ระบุจำนวนเงินเอาประกัน

✅ ผลลัพธ์: Coverage ถูกเพิ่ม

---

### ขั้นที่ 5 — อัปโหลดเอกสาร (Documents) → ยังอยู่ `DRAFT`

**Tab:** เอกสาร

- อัปโหลดเอกสารตาม Checklist (เช่น หนังสือจดทะเบียนบริษัท, เอกสารภาษี)
- เอกสารที่มีเครื่องหมาย `*` หรือ `requireDocsOnSubmit: true` จำเป็นต้องอัปโหลดก่อน Submit

> หมายเหตุ: อัปโหลดเอกสารได้ตลอดเวลาที่ไม่ใช่สถานะ CANCELLED / CLOSED / EXPIRED

✅ ผลลัพธ์: เอกสารถูกอัปโหลด

---

### ขั้นที่ 6 — Submit Job → Status: `OPEN`

**Permission:** `job.submit`  
**ปุ่ม:** "ส่งงาน" (Submit)

- ระบบจะตรวจสอบเอกสารที่ `requireDocsOnSubmit: true` ต้องครบถ้วน
- เมื่อผ่านจะเปลี่ยนสถานะเป็น `OPEN`

✅ ผลลัพธ์: Status = `OPEN`

> หาก Staff ต้องการข้อมูลเพิ่ม กด **"ขอข้อมูล"** (requestInfo) → `WAITING_INFORMATION`  
> เมื่อได้ข้อมูลครบ กด **"ดำเนินการต่อ"** (resume) → กลับ `OPEN`

---

### ขั้นที่ 7 — ขอใบเสนอราคา (Request Quotation) → Status: `QUOTATION_REQUESTED`

**Permission:** `quotation.create`  
**ปุ่ม:** "ขอใบเสนอราคา" (requestQuotation)  
**Tab:** ใบเสนอราคา

- ระบุบริษัทประกันที่ต้องการขอ (เลือกจาก Master Data → บริษัทประกัน)
- ระบุประเภท Quotation และข้อมูลที่ส่งให้บริษัทประกัน

✅ ผลลัพธ์: Status = `QUOTATION_REQUESTED`

---

### ขั้นที่ 8 — บันทึกใบเสนอราคาที่ได้รับ (Record Quotation) → Status: `QUOTATION_RECEIVED`

**Permission:** `quotation.update`  
**ปุ่ม:** "บันทึกราคา" (recordQuotation)

- บันทึกราคาเบี้ยประกันที่ได้รับจากแต่ละบริษัท
- สามารถบันทึกหลายบริษัทได้

| Field | ตัวอย่าง |
|---|---|
| บริษัทประกัน | บริษัท ก |
| เบี้ยประกัน (net) | 15000.00 |
| เบี้ยรวม (gross) | 16050.00 |
| อัตราภาษี | 7% |
| วันที่ใบเสนอราคา | วันนี้ |

✅ ผลลัพธ์: Status = `QUOTATION_RECEIVED`

---

### ขั้นที่ 9 — เปรียบเทียบและเลือกใบเสนอราคา (Select Quotation) → Status: `QUOTATION_SELECTED`

**Permission:** `quotation.select`  
**Tab:** เปรียบเทียบ / ปุ่ม "เลือกใบเสนอราคา" (selectQuotation)

- เปรียบเทียบราคาและความคุ้มครองจากหลายบริษัท
- เลือก Quotation ที่จะนำเสนอลูกค้า (ทำได้เพียง 1 รายการ)

✅ ผลลัพธ์: Status = `QUOTATION_SELECTED`

---

### ขั้นที่ 10 — ส่ง Proposal ให้ลูกค้า (Send Proposal) → Status: `PROPOSAL_SENT` → `WAITING_CUSTOMER`

**Permission:** `proposal.send`  
**ปุ่ม:** "ส่ง Proposal" (sendProposal)  
**Tab:** Proposal

- สร้างและส่ง Proposal (ระบบสร้างเอกสารสรุปให้ลูกค้า)
- ระบบส่งอีเมลแจ้งลูกค้า (Mailpit: http://localhost:8025)

✅ ผลลัพธ์: Status = `WAITING_CUSTOMER`

---

### ขั้นที่ 11 — บันทึกผลการตอบรับลูกค้า

#### กรณีลูกค้า **ยอมรับ** → Status: `CUSTOMER_ACCEPTED`

**ปุ่ม:** "ลูกค้ายอมรับ" (acceptProposal)

#### กรณีลูกค้า **ปฏิเสธ** → Status: `CUSTOMER_REJECTED` → `CLOSED`

**ปุ่ม:** "ลูกค้าปฏิเสธ" (rejectProposal)  
- ต้องระบุเหตุผลที่ปฏิเสธ
- จากนั้น "ปิดงาน" (close) → `CLOSED`

---

### ขั้นที่ 12 — ส่งขออนุมัติ (Approval) → Status: `WAITING_APPROVAL`

> ขั้นนี้เกิดขึ้นอัตโนมัติหรือด้วยปุ่ม ขึ้นอยู่กับ config Approval Rule

**ปุ่ม:** จาก `CUSTOMER_ACCEPTED` → ระบบจะสร้าง Approval Request อัตโนมัติ  
**Tab:** การอนุมัติ

- Approval Rule กำหนดว่างานประเภทไหนต้องอนุมัติจาก Role ใด
- ผู้อนุมัติ **ต้องไม่ใช่คนเดียวกับผู้ขออนุมัติ** (Maker-Checker) ยกเว้น ADMIN ที่มีสิทธิ์ `approval.approve_own`

✅ ผลลัพธ์: Status = `WAITING_APPROVAL`

---

### ขั้นที่ 13 — อนุมัติ → Status: `APPROVED`

**Login:** `manager` หรือ `admin`  
**Permission:** `approval.approve`  
**เมนู:** Approvals Inbox หรือ Tab การอนุมัติใน Job

- ผู้อนุมัติจะเห็นปุ่ม "อนุมัติ" เฉพาะเมื่อ `canDecide: true`
- หากเป็นคนเดียวกับผู้ขอและไม่มี `approval.approve_own` จะเห็นข้อความ "รอผู้อนุมัติท่านอื่น"

✅ ผลลัพธ์: Status = `APPROVED`

---

### ขั้นที่ 14 — Binding → Status: `BINDING` → `POLICY_PENDING`

**Permission:** `policy.create` (role: BROKER_STAFF หรือ ADMIN)  
**ปุ่ม:** "Bind" (bind)  
**Tab:** Binding

- อัปโหลดเอกสารที่ `requireDocsOnBind: true` (ถ้ายังไม่ได้อัปโหลด)
- บันทึกข้อมูล Binding เช่น วันที่เริ่มคุ้มครอง, เลขกรมธรรม์เบื้องต้น

✅ ผลลัพธ์: Status = `BINDING` → `POLICY_PENDING`

---

### ขั้นที่ 15 — ออกกรมธรรม์ (Issue Policy) → Status: `POLICY_ISSUED`

**ปุ่ม:** "ออกกรมธรรม์" (issuePolicy)  
**Tab:** กรมธรรม์

| Field | ตัวอย่าง |
|---|---|
| เลขกรมธรรม์ | POL-2026-000001 |
| วันที่เริ่มคุ้มครอง | 2026-10-06 |
| วันที่สิ้นสุดคุ้มครอง | 2027-10-05 |
| เบี้ยประกัน | 16050.00 |

✅ ผลลัพธ์: Status = `POLICY_ISSUED` — กรมธรรม์ออกแล้ว

---

### ขั้นที่ 16 — บันทึกการชำระเงิน (Payment)

**Login:** `finance`  
**Permission:** `payment.create`  
**Tab:** การชำระเงิน

- บันทึกการรับเงินจากลูกค้า
- ระบุวิธีการชำระ, จำนวนเงิน, วันที่

---

### ขั้นที่ 17 — บันทึก Commission

**Login:** `finance`  
**Permission:** `commission.create`  
**Tab:** Commission

- ระบบคำนวณ Commission จาก Net Premium × อัตรา Commission ของผลิตภัณฑ์
- Finance บันทึกการจ่าย Commission ให้ Agent

---

### ขั้นที่ 18 — ต่ออายุ (Renewal)

- เมื่อใกล้วันสิ้นสุดกรมธรรม์ ระบบจะสร้าง Job ต่ออายุ
- Job ใหม่จะอยู่ที่ Status `RENEWAL` โดยลิงก์กับ Policy เดิม
- ดำเนินการตาม flow ตั้งแต่ขั้นที่ 7 (ขอ Quotation ใหม่) ซ้ำอีกครั้ง

---

## เส้นทางทดสอบแนะนำ (Happy Path)

```
admin login
  → สร้าง Customer
  → สร้าง Job (DRAFT)
  → กรอก Risk + Coverage + เอกสาร
  → Submit (OPEN)
  → ขอ Quotation (QUOTATION_REQUESTED)
  → บันทึกราคา (QUOTATION_RECEIVED)
  → เลือก Quotation (QUOTATION_SELECTED)
  → ส่ง Proposal (WAITING_CUSTOMER)
  → ลูกค้ายอมรับ (CUSTOMER_ACCEPTED)
  → ส่งขออนุมัติ (WAITING_APPROVAL)

manager login (หรือ admin)
  → เข้า Approvals Inbox
  → อนุมัติ (APPROVED)

admin login
  → Bind (BINDING → POLICY_PENDING)
  → ออกกรมธรรม์ (POLICY_ISSUED)

finance login
  → บันทึก Payment
  → บันทึก Commission

admin login
  → ปิดงาน (CLOSED) หรือต่ออายุ (RENEWAL)
```

---

## Tabs ใน Job Detail

| Tab | ดูได้จาก Status | แก้ไขได้จาก Status |
|---|---|---|
| ข้อมูลทั่วไป | ทั้งหมด | DRAFT, OPEN, WAITING_INFORMATION |
| ข้อมูลความเสี่ยง | ทั้งหมด | DRAFT, OPEN, WAITING_INFORMATION |
| ความคุ้มครอง | ทั้งหมด | DRAFT, OPEN, WAITING_INFORMATION |
| เอกสาร | ทั้งหมด | ทุก Status ยกเว้น CANCELLED/CLOSED/EXPIRED |
| ใบเสนอราคา | ทั้งหมด | OPEN → QUOTATION_SELECTED |
| Proposal | ทั้งหมด | QUOTATION_SELECTED → WAITING_CUSTOMER |
| การอนุมัติ | ทั้งหมด | WAITING_APPROVAL |
| Binding/กรมธรรม์ | ทั้งหมด | APPROVED → POLICY_ISSUED |
| การชำระเงิน | POLICY_ISSUED+ | ทุก Status หลัง Policy |
| Commission | POLICY_ISSUED+ | ทุก Status หลัง Policy |
| งาน/Task | ทั้งหมด | ทุก Status |
| ประวัติ | ทั้งหมด | — |

---

## ปุ่มแต่ละ Status และ Role ที่ใช้ได้

| Status | Action | ปุ่ม | Role ที่ใช้ได้ |
|---|---|---|---|
| DRAFT | submit | ส่งงาน | AGENT, BROKER_STAFF, ADMIN |
| OPEN | requestInfo | ขอข้อมูล | BROKER_STAFF, ADMIN |
| OPEN | requestQuotation | ขอใบเสนอราคา | BROKER_STAFF, ADMIN |
| WAITING_INFORMATION | resume | ดำเนินการต่อ | BROKER_STAFF, ADMIN |
| QUOTATION_REQUESTED | recordQuotation | บันทึกราคา | BROKER_STAFF, ADMIN |
| QUOTATION_RECEIVED | selectQuotation | เลือกใบเสนอราคา | BROKER_STAFF, ADMIN |
| QUOTATION_SELECTED | sendProposal | ส่ง Proposal | BROKER_STAFF, ADMIN |
| WAITING_CUSTOMER | acceptProposal | ลูกค้ายอมรับ | BROKER_STAFF, ADMIN |
| WAITING_CUSTOMER | rejectProposal | ลูกค้าปฏิเสธ | BROKER_STAFF, ADMIN |
| WAITING_APPROVAL | approve | อนุมัติ / ปฏิเสธ | MANAGER, ADMIN |
| CUSTOMER_ACCEPTED / APPROVED | bind | Bind | BROKER_STAFF, ADMIN |
| POLICY_PENDING | issuePolicy | ออกกรมธรรม์ | BROKER_STAFF, ADMIN |
| POLICY_ISSUED | close | ปิดงาน | BROKER_STAFF, ADMIN |
| ทุก Status* | cancel | ยกเลิก | BROKER_STAFF, ADMIN |

> *ยกเว้น POLICY_ISSUED / CANCELLED / CLOSED / EXPIRED / RENEWAL

---

## ข้อสังเกตระหว่างทดสอบ

1. **allowedActions** — ปุ่มที่เห็นบนหน้าจอมาจาก `allowedActions` ที่ backend ส่งมา ไม่ใช่ frontend ตัดสินเอง ถ้าปุ่มไม่ขึ้นแสดงว่า permission หรือ status ไม่ถูกต้อง
2. **Audit Trail** — ทุก action จะบันทึกใน Tab ประวัติ สามารถตรวจสอบย้อนหลังได้
3. **เอกสาร** — ถ้า Submit แล้วติด error อาจเป็นเพราะเอกสาร required ยังไม่ครบ
4. **Approval Maker-Checker** — ถ้า admin ขออนุมัติเองและอนุมัติเองได้ แสดงว่า `approval.approve_own` ทำงาน; ถ้าใช้ manager ขอแล้วอนุมัติเองจะได้รับ error 422
5. **ดูอีเมล** — http://localhost:8025 (Mailpit)

---

*สร้างโดย Claude Code — อ้างอิงจาก `Insurance_Opening_System_V1.md` และ `job-status.ts`*
