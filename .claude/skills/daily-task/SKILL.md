---
name: daily-task
description: เริ่มหรือทำงานต่อตามแผนรายวันใน docs/PLAN_V2.md (หรือ docs/PLAN.md) — หา Day ปัจจุบัน สรุปงาน ลงมือทำ verify ติ๊ก checkbox และเขียน Log ตอนจบวัน ใช้เมื่อผู้ใช้พูดว่า "เริ่มงาน", "ทำต่อ", "วันนี้ทำอะไร", "ปิดวัน", "start day", "continue", "status"
argument-hint: "[day-number | status | close]"
---

# Daily Task

ขับเคลื่อนงานตาม **แผนปัจจุบัน** ทีละวัน โดยให้ `docs/DESIGN.md` เป็นแหล่งอ้างอิงทางเทคนิค

**แผนปัจจุบัน** = `docs/PLAN_V2.md` (spec: `docs/Insurance_Broker_Workflow_V2.md` อ้างเป็น "V2 §N" + ตารางการตัดสินใจ D-n ในแผน) ถ้าไม่มีไฟล์นี้ให้ใช้ `docs/PLAN.md` (spec: `Insurance_Opening_System_V1.md`) ทุกที่ด้านล่างที่เขียนว่า PLAN.md หมายถึงแผนปัจจุบัน

## Arguments

| Argument | ทำอะไร |
|---|---|
| (ไม่มี) | หา Day แรกที่ยังมี `- [ ]` แล้วเริ่ม/ทำต่อ |
| `<n>` | ทำ Day n (เตือนถ้า Day ก่อนหน้ายังไม่เสร็จ) |
| `status` | รายงานความคืบหน้าเท่านั้น ไม่แก้โค้ด |
| `close` | ปิดวัน: verify, ติ๊ก checkbox, เขียน Log |

## ขั้นตอน

### 1. โหลด context
1. อ่านแผนปัจจุบันแล้วหา Day เป้าหมาย รวมทั้งอ่าน Log entry ล่าสุด (ส่วน `<!-- LOG-START -->`) เพื่อดูงานที่ยกมา
2. อ่านเฉพาะหัวข้อใน `docs/DESIGN.md` และ spec ที่เกี่ยวกับ Day นั้น ไม่ต้องอ่านทั้งไฟล์
3. เช็คสถานะ repo ด้วย `git status` และ `git log --oneline -5` (ถ้ามี git แล้ว)
4. เช็ค **Open Questions** ใน PLAN.md ถ้ามีข้อที่คอลัมน์ "ต้องรู้ก่อน" ตรงกับวันนี้และยังไม่มีคำตอบ ให้ถามผู้ใช้ก่อนลงมือ หรือแจ้งว่าจะใช้ค่า default

### 2. สรุปแผนของวัน (สั้น ๆ)
แสดงรายการ task ที่ยังไม่ติ๊ก, งานที่ยกมา, และ skill ที่จะใช้กับแต่ละ task:
- Backend module / CRUD → `nest-module`
- Action ที่เปลี่ยนสถานะ (submit, select, accept, bind, …) → `workflow-action`
- หน้าจอ Angular → `angular-feature`

แล้วเริ่มทำเลย ไม่ต้องรอให้ผู้ใช้ยืนยัน ยกเว้นติด Open Question

### 3. ทำทีละ task
- ทำตามลำดับใน PLAN; backend ก่อน frontend เมื่ออยู่วันเดียวกัน
- หลังแต่ละ task ให้รัน check ที่เกี่ยวข้อง (unit test ของ module, `npm run lint`, `npm run build -w apps/<app>`)
- ติ๊ก `- [x]` ใน PLAN.md **ทันทีที่ verify ผ่าน** ห้ามติ๊กล่วงหน้า
- ถ้าต้องเบี่ยงจาก DESIGN.md ให้แก้ DESIGN.md ในงานเดียวกัน และจดเหตุผลลง Log
- API เปลี่ยนแล้ว ให้รัน `npm run gen:api` ก่อนทำฝั่ง web

### 4. Verify "Done เมื่อ"
ทำตามทุกข้อในหัวข้อ **Done เมื่อ** ของ Day นั้นจริง ๆ (รัน test, curl, เปิดหน้าจอ) แล้วรายงานผลตามจริง ถ้าข้อไหนไม่ผ่าน ให้บอกว่าไม่ผ่านพร้อม output

### 5. ปิดวัน (`close` หรือเมื่อ task ครบ)
1. ถ้า Day นั้นมี "Phase review" ให้รัน skill `dod-check`
2. เพิ่ม Log entry ไว้ **บนสุด** ถัดจาก `<!-- LOG-START -->`:

```markdown
### YYYY-MM-DD — Day N: <ชื่อ Day>
- **เสร็จ:** …
- **ยกไป:** … (ไม่มีให้เขียนว่า "-")
- **ตัดสินใจ/เปลี่ยนแปลง:** …
- **ถัดไป:** Day N+1 — <task แรก>
```

3. เสนอ commit message (Conventional Commits เช่น `feat(job): add state machine and workflow service`) แต่ commit เฉพาะเมื่อผู้ใช้สั่งเท่านั้น

## `status` output

```text
Phase 2 — Job · Day 11/33 · Risk & Coverage API
วันนี้: 2/4 task · Done-when 0/1
ยกมา: <จาก Log>
Open Questions ที่ใกล้ถึงกำหนด: Q2 (D10)
```

## กฎ
- ห้ามข้าม Day ที่ "Done เมื่อ" ยังไม่ครบ เว้นแต่ผู้ใช้สั่ง ถ้าข้ามต้องจดใน Log ว่ายกอะไรไป
- ห้ามทำงานของ Day ในอนาคตก่อนกำหนด (scope creep) ให้จดเป็นข้อเสนอใน Log แทน
- เงื่อนไขธุรกิจที่ spec ไม่ชัดเจน ให้เพิ่มเป็น Open Question ใหม่ใน PLAN.md ห้ามเดาเงียบ ๆ
