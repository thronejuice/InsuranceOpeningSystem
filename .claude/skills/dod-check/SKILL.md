---
name: dod-check
description: ตรวจ Definition of Done (spec §45) ของ module/feature พร้อมหลักฐานจากโค้ดและผล test — รายงานเป็นตาราง ✅/❌ และรายการที่ต้องแก้ ใช้ตอนจบ Phase, ก่อน commit ใหญ่ หรือเมื่อผู้ใช้ถามว่า "เสร็จจริงไหม", "dod", "ครบหรือยัง"
argument-hint: "<module> [module...]"
---

# Definition of Done Check

ตรวจแบบ **อ่านและรัน test เท่านั้น** ห้ามแก้โค้ดใน skill นี้ ถ้าเจอข้อที่ต้องแก้ ให้เสนอรายการแก้แล้วถามผู้ใช้ก่อน

## สิ่งที่ตรวจ (ต่อ module)

| # | เกณฑ์ (spec §45) | วิธีหาหลักฐาน |
|---|---|---|
| 1 | API ทำงาน | endpoint ใน controller ตรงกับ spec §29 + e2e happy path ผ่าน |
| 2 | Validation ครบ | DTO ครอบคลุม spec §34 + มี e2e 422 |
| 3 | Authorization ครบ | ทุก route มี `@RequirePermissions` หรือ `@Public`; มี e2e 403; ใช้ data scope กับ job-related (BR-014) |
| 4 | Database constraint ครบ | unique/FK/index/CHECK/partial index ตาม DESIGN §5 ใน schema + migrations |
| 5 | Unit test ผ่าน | รัน `npm run test -w apps/api -- <module>`; มี test สำหรับทุก function ใน `domain/` |
| 6 | Integration test ผ่าน | รัน `npm run test:e2e -w apps/api -- <module>` |
| 7 | Error handling ครบ | business error ใช้ `BusinessException` + code; ไม่มี `catch` ที่กลืน error |
| 8 | Activity log ถูกสร้าง | action ที่อยู่ใน spec §22.1 เรียก `audit.log` ภายใน transaction |
| 9 | UI ใช้งานได้จริง | route/page ครบตาม spec §37 |
| 10 | Loading / Empty / Error state | ทุก page ที่ fetch data ใช้ `app-state` |
| 11 | Audit สำคัญครบ | state change ผ่าน `workflow.transition()` (มี history) |
| 12 | API documentation ครบ | Swagger decorators ครบ, `/api/docs-json` มี endpoint + schema |

ตรวจเพิ่มจาก spec §51:
- เงินเป็น `Decimal` ไม่มี `Float`/`number` สำหรับเงินใน schema/DTO
- ไม่มี physical delete ของ transaction data
- list API มี pagination/sort/filter
- ไม่มี endpoint ที่รับ `status` จาก client ไปเขียนตรง ๆ

## ขั้นตอน
1. หาไฟล์ของ module: `apps/api/src/modules/<m>/`, `apps/api/test/<m>*.e2e-spec.ts`, `apps/web/src/app/features/<m>/`, model ใน `schema.prisma`
2. ตรวจทีละเกณฑ์ พร้อมอ้าง `file:line` เป็นหลักฐาน
3. รัน test จริงแล้วแนบผลสรุป (pass/fail count)
4. ใช้ grep ช่วยหาจุดเสี่ยง เช่น:
   - `grep -rn "Float" apps/api/prisma/schema.prisma`
   - `grep -rn "\.delete(" apps/api/src/modules/<m>`
   - `grep -rn "status:" apps/api/src/modules/<m>/**/*.dto.ts` (ถ้า client ส่ง status มาเอง ถือว่าผิด)
   - route ที่ไม่มี `@RequirePermissions`

## รูปแบบรายงาน

```markdown
## DoD — <module>   (<n>/12 ผ่าน)

| # | เกณฑ์ | ผล | หลักฐาน / สิ่งที่ขาด |
|---|---|---|---|
| 1 | API ทำงาน | ✅ | e2e 8/8 pass |
| 3 | Authorization | ❌ | `quotation.controller.ts:42` ไม่มี @RequirePermissions |

### ต้องแก้ (เรียงตามความสำคัญ)
1. …
```

หลังรายงาน ให้ถามว่าจะแก้ทันทีหรือยกไป ถ้ายกไป ให้เพิ่มเป็น task ในวันถัดไปของ PLAN.md
