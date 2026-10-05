---
name: angular-feature
description: สร้างหน้าจอ/feature ใน apps/web (Angular standalone + signals + Angular Material (ผ่าน wrapper ใน shared/ui)) เช่น list/table, create/edit form, detail page, tab ใน Job detail โดยใช้ type จาก OpenAPI, จัดการ loading/empty/error state, map 422 errors ลงฟอร์ม และซ่อนปุ่มตาม permission/allowedActions ใช้เมื่อทำ UI ของ feature ใดก็ได้
argument-hint: "<feature> [list|form|detail|tab:<name>]"
---

# Angular Feature

ตาม `docs/DESIGN.md` §9 ให้ดู feature ที่มีอยู่แล้ว (เช่น `features/customers/`) แล้วเลียนแบบ pattern ให้ตรงกัน

## 0. เตรียม
- [ ] Backend endpoint เสร็จและ test ผ่านแล้ว
- [ ] รัน `npm run gen:api` เพื่ออัปเดต `src/app/core/api/schema.d.ts`
- [ ] อ่าน spec §37 (routes) และ §38 (Job tabs) ถ้าเกี่ยวข้อง

## 1. โครงไฟล์
```text
features/<feature>/
├── <feature>.routes.ts
├── data/<feature>.api.ts
├── pages/<feature>-list.page.ts
├── pages/<feature>-form.page.ts
├── pages/<feature>-detail.page.ts
└── components/
```
ลงทะเบียน route แบบ lazy ใน `app.routes.ts` พร้อม `canActivate: [authGuard, permissionGuard]`, `data: { permission: '<x>.view' }` และเพิ่มเมนูใน sidebar พร้อม permission

## 2. API service
```ts
type Customer = components['schemas']['CustomerResponse'];
type CustomerQuery = operations['CustomerController_list']['parameters']['query'];

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private http = inject(HttpClient);
  list(q: CustomerQuery) { return this.http.get<ListResponse<Customer>>('/api/customers', { params: toParams(q) }); }
  get(id: string)        { return this.http.get<ApiResponse<Customer>>(`/api/customers/${id}`).pipe(map(r => r.data)); }
  create(body: CreateCustomer) { return this.http.post<ApiResponse<Customer>>('/api/customers', body).pipe(map(r => r.data)); }
}
```
ห้ามเขียน interface ซ้ำกับที่ generate ได้

## 3. List page
- `p-table` แบบ `[lazy]="true"`, pagination/sort/filter ส่งไปที่ server
- สถานะ filter sync กับ **query params** (refresh แล้ว filter เดิมยังอยู่ และแชร์ link ได้)
- ค้นหาใช้ debounce 300ms
- ใช้ `<app-state [loading] [error] [empty]>` ครอบตาราง
- Status ใช้ `<app-status-badge [status]>`, เงินใช้ `| money`, วันที่ใช้ `| thDate`
- ปุ่มสร้างใช้ `*appHasPermission="'<x>.create'"`

## 4. Form page (create + edit ใช้ component เดียว)
```ts
form = this.fb.nonNullable.group({
  customerType: ['INDIVIDUAL' as CustomerType, Validators.required],
  firstName: [''],
  email: ['', Validators.email],
});

save() {
  if (this.form.invalid) { this.form.markAllAsTouched(); return; }
  this.saving.set(true);
  this.api.create(this.form.getRawValue()).pipe(finalize(() => this.saving.set(false))).subscribe({
    next: c => { this.toast.success('บันทึกแล้ว'); this.router.navigate(['/customers', c.id]); },
    error: (e: HttpErrorResponse) => applyServerErrors(this.form, e),   // 422 → control errors
  });
}
```
- [ ] Validation ฝั่ง client เป็นแค่ UX เท่านั้น ส่วนที่มีผลจริงคือ server
- [ ] ปุ่ม Save disabled ระหว่าง `saving()` เพื่อกันกดซ้ำ
- [ ] แสดง error ใต้ field (`<app-field-error [control]>`) + error ที่ไม่ผูก field แสดงด้านบนฟอร์ม
- [ ] ออกจากหน้าตอนฟอร์ม dirty → ถามยืนยัน (`canDeactivate`)

## 5. Detail page / Job tab
- โหลดด้วย `id` จาก route (`input()` + `withComponentInputBinding`)
- **ปุ่ม action แสดงตาม `job.allowedActions` เท่านั้น** ห้ามเขียน `if (status === 'OPEN')` ใน UI
- Action request ส่ง `version` ปัจจุบันไปด้วย ถ้าได้ 409 `CONCURRENT_MODIFICATION` ให้แจ้ง "ข้อมูลถูกแก้ไขโดยผู้อื่น" แล้ว reload
- Action ที่ต้องมีเหตุผล (cancel/reject/select) → `ConfirmReasonDialog`
- หลัง action สำเร็จให้ใช้ response ใหม่ (status/version/allowedActions) แทนข้อมูลเดิม และ refresh timeline
- Tab ที่ยังไม่ถึงขั้นให้แสดง disabled พร้อม tooltip บอกสถานะที่ต้องถึง

## 6. เงินและวันที่
- เงินรับ/ส่งเป็น string ห้าม `parseFloat` แล้วคำนวณ ถ้าต้องแสดงยอดรวมก่อนบันทึก ให้เรียก API หรือใช้ `decimal.js`
- Date input ส่งเป็น `YYYY-MM-DD`; timestamp แสดงเป็นเวลา Asia/Bangkok

## 7. ปิดงาน
- [ ] `npm run lint -w apps/web && npm run build -w apps/web`
- [ ] Unit test ของ component/service ที่มี logic (form mapping, allowedActions → ปุ่ม)
- [ ] เปิดหน้าจอจริงแล้วลองทั้ง happy path, error 422, list ว่าง, API ล่ม (loading/empty/error ครบ)
- [ ] Login ด้วย role ที่ไม่มีสิทธิ์ แล้วเมนูและปุ่มต้องไม่แสดง และเข้า URL ตรงต้องถูกกัน
