import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppFieldErrorComponent } from '../../../shared/components/app-field-error/app-field-error.component';
import { UsersApi, type Role, type User } from '../data/users.api';
import { BranchesApi, type Branch } from '../../master/data/branches.api';
import { applyServerErrors } from '../../../shared/utils/form-errors';
import { ConfirmationService, MessageService, UiButton, UiConfirmDialog, UiDialog, UiInput, UiMultiSelect, UiPassword, UiSelect, UiTable, UiToggleSwitch } from '../../../shared/ui';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'app-user-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [MatTooltip, ReactiveFormsModule, UiTable, UiButton, UiDialog, UiInput, UiPassword, UiSelect, UiMultiSelect, UiToggleSwitch, UiConfirmDialog, AppPageHeaderComponent, AppStateComponent, AppFieldErrorComponent, ThDatePipe],
  template: `
    <ui-confirm-dialog />

    <app-page-header title="ผู้ใช้งาน" subtitle="จัดการผู้ใช้งานในระบบ">
      <ui-button label="เพิ่มผู้ใช้" icon="pi pi-plus" (onClick)="openCreate()" />
    </app-page-header>

    @if (state() === 'loading') { <app-state state="loading" /> }
    @else if (state() === 'error') { <app-state state="error" /> }
    @else {
      <ui-table [value]="users()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template #header>
          <tr>
            <th>ชื่อผู้ใช้</th>
            <th>ชื่อ-นามสกุล</th>
            <th>อีเมล</th>
            <th>สาขา</th>
            <th>หัวหน้า</th>
            <th>Role</th>
            <th style="width:80px">สถานะ</th>
            <th style="width:140px">เข้าสู่ระบบล่าสุด</th>
            <th style="width:120px"></th>
          </tr>
        </ng-template>
        <ng-template #body let-user>
          <tr>
            <td><strong>{{ user.username }}</strong></td>
            <td>{{ user.fullName }}</td>
            <td>{{ user.email }}</td>
            <td>{{ user.branch?.name || '-' }}</td>
            <td>{{ user.manager?.fullName || '-' }}</td>
            <td>
              @for (r of user.roles; track r.id) {
                <span class="badge-role">{{ r.code }}</span>
              }
            </td>
            <td>
              <span [class]="user.isActive ? 'badge-active' : 'badge-inactive'">
                {{ user.isActive ? 'ใช้งาน' : 'ไม่ใช้งาน' }}
              </span>
            </td>
            <td>{{ user.lastLoginAt ? (user.lastLoginAt | thDate) : '-' }}</td>
            <td>
              <div class="action-buttons">
                <ui-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openEdit(user)" matTooltip="แก้ไข" />
                <ui-button icon="pi pi-key" [text]="true" size="small" severity="warn" (onClick)="openResetPw(user)" matTooltip="รีเซ็ตรหัสผ่าน" />
                <ui-button icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmDeactivate(user)" [disabled]="!user.isActive" matTooltip="ยกเลิกใช้งาน" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-color-secondary)">ไม่พบผู้ใช้งาน</td></tr>
        </ng-template>
      </ui-table>
    }

    <!-- Create / Edit User Dialog -->
    <ui-dialog [(visible)]="userDialogVisible" [header]="editUserId() ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'"
      [icon]="editUserId() ? 'pi pi-user-edit' : 'pi pi-user-plus'"
      [modal]="true" [style]="{width:'520px'}">
      <form [formGroup]="userForm" (ngSubmit)="saveUser()" class="dialog-form">
        @if (!editUserId()) {
          <div class="field">
            <label for="u-username">ชื่อผู้ใช้ <span class="required">*</span></label>
            <input uiInput id="u-username" formControlName="username" class="w-full" autocomplete="off" />
            <app-field-error [control]="userForm.get('username')" />
          </div>
        }
        <div class="field">
          <label for="u-fullname">ชื่อ-นามสกุล <span class="required">*</span></label>
          <input uiInput id="u-fullname" formControlName="fullName" class="w-full" />
          <app-field-error [control]="userForm.get('fullName')" />
        </div>
        <div class="field">
          <label for="u-email">อีเมล <span class="required">*</span></label>
          <input uiInput id="u-email" formControlName="email" type="email" class="w-full" />
          <app-field-error [control]="userForm.get('email')" />
        </div>
        @if (!editUserId()) {
          <div class="field">
            <label for="u-password">รหัสผ่าน <span class="required">*</span></label>
            <ui-password class="w-full" id="u-password" formControlName="password" [feedback]="false" [toggleMask]="true" inputStyleClass="w-full" />
            <app-field-error [control]="userForm.get('password')" />
          </div>
        }
        <div class="field">
          <label>Role</label>
          <ui-multiselect formControlName="roleIds" [options]="roles()" optionLabel="name" optionValue="id"
            placeholder="เลือก Role" display="chip" class="w-full" />
        </div>
        <div class="field">
          <label>สาขา</label>
          <ui-select formControlName="branchId" [options]="branches()" optionLabel="name" optionValue="id"
            placeholder="เลือกสาขา" [showClear]="true" class="w-full" />
        </div>
        <div class="field">
          <label>หัวหน้างาน</label>
          <ui-select formControlName="managerId" [options]="managerOptions()" optionLabel="fullName" optionValue="id"
            placeholder="เลือกหัวหน้างาน" [showClear]="true" class="w-full" />
        </div>
        <div class="field">
          <label for="u-share">ส่วนแบ่งค่าคอมของ Agent (%)</label>
          <input uiInput id="u-share" formControlName="agentSharePct" class="w-full" inputmode="decimal" placeholder="เว้นว่าง = ใช้ค่าเริ่มต้นของระบบ" />
          <app-field-error [control]="userForm.get('agentSharePct')" />
        </div>
        @if (editUserId()) {
          <div class="field-row">
            <ui-toggleswitch formControlName="isActive" />
            <label>ใช้งาน</label>
          </div>
        }
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="userDialogVisible=false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>

    <!-- Reset UiPassword Dialog -->
    <ui-dialog [(visible)]="resetPwDialogVisible" header="รีเซ็ตรหัสผ่าน" icon="pi pi-key"
      [modal]="true" [style]="{width:'400px'}">
      <form [formGroup]="resetPwForm" (ngSubmit)="saveResetPw()" class="dialog-form">
        <div class="field">
          <label>ผู้ใช้: <strong>{{ resetPwUsername() }}</strong></label>
        </div>
        <div class="field">
          <label for="rp-pw">รหัสผ่านใหม่ <span class="required">*</span></label>
          <ui-password class="w-full" id="rp-pw" formControlName="password" [feedback]="false" [toggleMask]="true" inputStyleClass="w-full" />
          <app-field-error [control]="resetPwForm.get('password')" />
        </div>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="resetPwDialogVisible=false" />
          <ui-button label="บันทึก" icon="pi pi-check" type="submit" [loading]="saving()" />
        </div>
      </form>
    </ui-dialog>
  `,
  styles: [`
    .action-buttons { display:flex; gap:0.25rem; }
    .badge-role { font-size:0.72rem; background:var(--primary-100); color:var(--primary-700); padding:0.1rem 0.4rem; border-radius:4px; margin-right:0.25rem; }
    .badge-active { background:var(--green-100); color:var(--green-700); padding:0.15rem 0.5rem; border-radius:4px; font-size:0.8rem; }
    .badge-inactive { background:var(--surface-200); color:var(--text-color-secondary); padding:0.15rem 0.5rem; border-radius:4px; font-size:0.8rem; }
    .dialog-form { display:flex; flex-direction:column; gap:0.75rem; padding-top:0.5rem; }
    .field { display:flex; flex-direction:column; gap:0.25rem; }
    .field-row { display:flex; align-items:center; gap:0.75rem; }
    label { font-size:0.875rem; font-weight:500; }
    .required { color:var(--red-500); }
    .dialog-actions { display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem; }
  `],
})
export class UserListPage implements OnInit {
  private readonly api = inject(UsersApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<User[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly managerOptions = computed(() => this.users().filter((u) => u.id !== this.editUserId()));
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly saving = signal(false);
  readonly editUserId = signal<string | null>(null);
  readonly resetPwUserId = signal<string | null>(null);
  readonly resetPwUsername = signal('');

  userDialogVisible = false;
  resetPwDialogVisible = false;

  readonly userForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    roleIds: [[] as string[]],
    branchId: [null as string | null],
    managerId: [null as string | null],
    agentSharePct: ['', [Validators.pattern(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)?$/)]],
    isActive: [true],
  });

  readonly resetPwForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit() {
    this.load();
    this.api.listRoles().subscribe({ next: (res) => this.roles.set(res.data) });
    this.branchesApi.listBranches().subscribe({ next: (res) => this.branches.set(res) });
  }

  load() {
    this.state.set('loading');
    this.api.listUsers().subscribe({
      next: (res) => { this.users.set(res.data); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  openCreate() {
    this.editUserId.set(null);
    this.userForm.reset({ roleIds: [], isActive: true, branchId: null, managerId: null });
    this.userForm.get('username')!.enable();
    this.userForm.get('password')!.setValidators([Validators.required, Validators.minLength(8)]);
    this.userForm.get('password')!.updateValueAndValidity();
    this.userDialogVisible = true;
  }

  openEdit(user: User) {
    this.editUserId.set(user.id);
    this.userForm.reset({
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      password: '',
      roleIds: user.roles.map((r) => r.id),
      branchId: user.branchId ?? null,
      managerId: user.managerId ?? null,
      agentSharePct: user.agentSharePct ?? '',
      isActive: user.isActive,
    });
    this.userForm.get('username')!.disable();
    this.userForm.get('password')!.clearValidators();
    this.userForm.get('password')!.updateValueAndValidity();
    this.userDialogVisible = true;
  }

  openResetPw(user: User) {
    this.resetPwUserId.set(user.id);
    this.resetPwUsername.set(user.username);
    this.resetPwForm.reset();
    this.resetPwDialogVisible = true;
  }

  confirmDeactivate(user: User) {
    this.confirm.confirm({
      message: `ต้องการยกเลิกการใช้งานของ "${user.username}" ใช่หรือไม่?`,
      header: 'ยืนยัน',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.api.deactivateUser(user.id).subscribe({
          next: () => { this.toast.add({ severity: 'success', summary: 'ยกเลิกใช้งานสำเร็จ' }); this.load(); },
          error: () => this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }),
        });
      },
    });
  }

  saveUser() {
    this.userForm.markAllAsTouched();
    if (this.userForm.invalid) return;
    this.saving.set(true);
    const id = this.editUserId();
    const val = this.userForm.getRawValue();

    if (id) {
      const updateData = {
        fullName: val.fullName || undefined,
        email: val.email || undefined,
        isActive: val.isActive ?? undefined,
        roleIds: val.roleIds || [],
        branchId: val.branchId || null,
        managerId: val.managerId || null,
        agentSharePct: val.agentSharePct?.trim() || null,
      };
      this.api.updateUser(id, updateData).subscribe({
        next: () => { this.toast.add({ severity: 'success', summary: 'บันทึกสำเร็จ' }); this.userDialogVisible = false; this.saving.set(false); this.load(); },
        error: (err) => this.handleSaveError(err),
      });
    } else {
      this.api.createUser({
        username: val.username!,
        fullName: val.fullName!,
        email: val.email!,
        password: val.password!,
        roleIds: val.roleIds || [],
        branchId: val.branchId || null,
        managerId: val.managerId || null,
        ...(val.agentSharePct?.trim() ? { agentSharePct: val.agentSharePct.trim() } : {}),
      }).subscribe({
        next: () => { this.toast.add({ severity: 'success', summary: 'สร้างผู้ใช้สำเร็จ' }); this.userDialogVisible = false; this.saving.set(false); this.load(); },
        error: (err) => this.handleSaveError(err),
      });
    }
  }

  saveResetPw() {
    this.resetPwForm.markAllAsTouched();
    if (this.resetPwForm.invalid) return;
    this.saving.set(true);
    const id = this.resetPwUserId()!;
    this.api.resetPassword(id, this.resetPwForm.value.password!).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'รีเซ็ตรหัสผ่านสำเร็จ' }); this.resetPwDialogVisible = false; this.saving.set(false); },
      error: () => { this.saving.set(false); this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }); },
    });
  }

  private handleSaveError(err: unknown) {
    this.saving.set(false);
    const errObj = err as { error?: { errors?: unknown } };
    if (errObj?.error?.errors) applyServerErrors(this.userForm, errObj.error as Parameters<typeof applyServerErrors>[1]);
    else this.toast.add({ severity: 'error', summary: 'ผิดพลาด', detail: 'ไม่สามารถบันทึกได้' });
  }
}
