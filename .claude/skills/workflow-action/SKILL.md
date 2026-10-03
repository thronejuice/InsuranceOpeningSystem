---
name: workflow-action
description: Implement action ที่เปลี่ยนสถานะทางธุรกิจ (submit job, select quotation, send/accept/reject proposal, approve, bind, issue policy, cancel, renew) แบบมี state-transition check, optimistic lock, database transaction, status history, audit log, idempotency และ tests ใช้ทุกครั้งที่ endpoint ทำให้ status ของ Job/Quotation/Proposal/Approval/Policy เปลี่ยน
argument-hint: "<entity>.<action>  เช่น job.submit, quotation.select, proposal.accept"
---

# Workflow Action

Pattern เดียวสำหรับทุก state-changing operation (spec §6, §41, §42, §51 · DESIGN §6.3, §7)

## 0. ออกแบบก่อนเขียนโค้ด
เขียนตารางนี้ให้เสร็จก่อน ถ้ามีช่องไหนตอบไม่ได้จาก spec ให้เพิ่ม Open Question ใน PLAN.md

| หัวข้อ | คำตอบ |
|---|---|
| Endpoint | `POST /api/...` |
| Permission | `xxx.yyy` + data scope? |
| Entity status: from → to | |
| Job status: from → to (อาจมีหลายขั้น) | ดู DESIGN §7.1 |
| Preconditions (BR-xxx) | แต่ละข้อ → error code + HTTP status |
| Side effects | สร้าง approval? task? notification? |
| Audit actions | `STATUS_CHANGED`, `<ACTION>` |
| Idempotent? | ใช่สำหรับ payment, binding |

## 1. Domain (pure, test ได้โดยไม่ใช้ DB)
```ts
// modules/policy/domain/binding.rules.ts
export interface BindingContext {
  job: { status: JobStatus; selectedQuotationId: string | null };
  proposalStatus: ProposalStatus | null;
  missingRequiredDocs: string[];
  approvalRequired: boolean;
  approvalStatus: ApprovalStatus | null;
}

export function checkBindingPreconditions(ctx: BindingContext): Precondition[] {
  return [
    { code: 'QUOTATION_SELECTED', ok: !!ctx.job.selectedQuotationId },                    // BR-006
    { code: 'CUSTOMER_ACCEPTED',  ok: ctx.proposalStatus === 'ACCEPTED' },                 // BR-007
    { code: 'DOCUMENTS_COMPLETE', ok: ctx.missingRequiredDocs.length === 0,
      detail: ctx.missingRequiredDocs },                                                    // BR-008
    { code: 'APPROVAL_PASSED',    ok: !ctx.approvalRequired || ctx.approvalStatus === 'APPROVED' }, // BR-009
  ];
}
```
function เดียวกันนี้ใช้ทั้งใน action (throw) และใน endpoint `preconditions`/`allowedActions` (ให้ UI แสดง) เพื่อให้ rule มีที่เดียว

## 2. Application service
```ts
@Transactional()
async bind(jobId: string, dto: BindJobDto) {
  const job = await this.jobs.getAccessibleOrFail(jobId, 'update');      // 404 / 403

  const failed = checkBindingPreconditions(await this.loadBindingContext(job))
    .filter(p => !p.ok);
  if (failed.length) {
    throw new BusinessException('BINDING_PRECONDITION_FAILED', 'Cannot bind this job', 422,
      Object.fromEntries(failed.map(f => [f.code, f.detail ?? [f.code]])));
  }

  const binding = await this.bindingRepo.create({ jobId, quotationId: job.selectedQuotationId!, ...dto });

  // หลาย step ใน transaction เดียว: version ต้องต่อกัน
  let v = dto.version;
  await this.workflow.transition(job, 'BINDING',        { expectedVersion: v++ });
  await this.workflow.transition({ ...job, status: 'BINDING' }, 'POLICY_PENDING', { expectedVersion: v });

  await this.audit.log({ action: 'BINDING_CREATED', entityType: 'BINDING', entityId: binding.id, jobId, newValue: binding });
  return this.getDetail(jobId);    // คืน job ล่าสุด (status/version/allowedActions ใหม่)
}
```

กฎ:
- [ ] ใช้ `JobWorkflowService.transition()` เท่านั้น (มี canTransition + optimistic lock + history + audit) ห้าม `update({ status })` ตรง ๆ
- [ ] Entity ย่อยที่มี status (quotation, proposal, approval, policy) ก็ต้อง update แบบมี `where: { id, version, status: <from> }` และเช็ค `count === 0` → 409
- [ ] Invariant ที่ต้องกัน race ได้แม้ lock หลุด ให้ใช้ unique/partial index (DESIGN §5.3) แล้ว map Prisma `P2002` → 409
- [ ] Side effect ภายนอก (email, queue) ต้องทำ **หลัง commit** ด้วย event/`afterCommit` ไม่ใช่ใน transaction
- [ ] Idempotent action: ใช้ `@UseInterceptors(IdempotencyInterceptor)` + header `Idempotency-Key`
- [ ] Response คืน entity ล่าสุดพร้อม `version` + `allowedActions` ใหม่

## 3. Controller
```ts
@Post('jobs/:jobId/bind')
@RequirePermissions('policy.create')
@UseInterceptors(IdempotencyInterceptor)
bind(@Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: BindJobDto) {
  return this.service.bind(jobId, dto);
}
```
DTO ต้องมี `@IsInt() version!: number` และ `reason` ถ้า action ต้องมีเหตุผล (cancel, reject, select)

## 4. อัปเดต `allowedActions`
เพิ่ม action ใหม่ในตัวคำนวณ `allowedActions` ของ job detail (state machine + permission + preconditions ที่เช็คได้ถูก ๆ)

## 5. Tests: ต้องมีครบทุกข้อ
| # | Test | ผลที่คาด |
|---|---|---|
| 1 | Unit: preconditions ทุกข้อ ทั้ง ok/ไม่ ok | |
| 2 | e2e happy path | 200/201, status ใหม่, `version+1`, มี history + activity log |
| 3 | สถานะเริ่มต้นผิด | 409 `…_INVALID_TRANSITION` |
| 4 | precondition ไม่ผ่าน | 422 + `errors` ระบุข้อที่ไม่ผ่าน |
| 5 | ไม่มี permission / ไม่ใช่ job ของตัวเอง | 403 |
| 6 | ส่ง `version` เก่า | 409 `CONCURRENT_MODIFICATION` |
| 7 | ยิงพร้อมกัน 2 request (`Promise.all`) | สำเร็จ 1 ครั้ง, อีกครั้ง 409 |
| 8 | (idempotent) ยิงซ้ำด้วย key เดิม | ได้ผลเดิม ไม่มี record ซ้ำ |
| 9 | error กลางทาง (mock ให้ audit throw) | rollback ทั้งหมด ไม่มี status เปลี่ยน |
