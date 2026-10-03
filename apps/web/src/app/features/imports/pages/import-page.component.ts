import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Select } from 'primeng/select';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { ImportsApi, type ImportResult, type ImportType, type RowError } from '../data/imports.api';

const IMPORT_TYPES: { label: string; value: ImportType }[] = [
  { label: 'ลูกค้า (Customers)', value: 'customers' },
  { label: 'ที่อยู่ลูกค้า (Customer Addresses)', value: 'customer-addresses' },
  { label: 'งานประกัน + รถยนต์ (Jobs + Motor Risk)', value: 'jobs' },
];

type Step = 'upload' | 'preview' | 'done';

@Component({
  selector: 'app-import-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonModule, Select, AppPageHeaderComponent],
  template: `
    <app-page-header title="นำเข้าข้อมูล" subtitle="Import ข้อมูลจากไฟล์ Excel" />

    <!-- Step 1: Upload -->
    @if (step() === 'upload') {
      <div class="card">
        <div class="form-row">
          <label class="form-label">ประเภทข้อมูล *</label>
          <p-select
            [(ngModel)]="selectedType"
            [options]="importTypes"
            optionLabel="label"
            optionValue="value"
            placeholder="เลือกประเภทข้อมูล"
            style="width:320px"
          />
          <p-button
            label="ดาวน์โหลด Template"
            icon="pi pi-download"
            severity="secondary"
            [outlined]="true"
            size="small"
            [disabled]="!selectedType"
            (onClick)="downloadTemplate()"
          />
        </div>

        <div
          class="drop-zone"
          [class.drag-over]="isDragging()"
          (dragover)="onDragOver($event)"
          (dragleave)="isDragging.set(false)"
          (drop)="onDrop($event)"
          (click)="fileInput.click()"
          role="button"
          tabindex="0"
          (keydown.enter)="fileInput.click()"
        >
          <i class="pi pi-file-excel drop-icon"></i>
          @if (selectedFile()) {
            <span class="drop-label">{{ selectedFile()!.name }}</span>
            <span class="drop-hint">คลิกเพื่อเปลี่ยนไฟล์</span>
          } @else {
            <span class="drop-label">ลากไฟล์มาวางหรือคลิกเพื่อเลือก</span>
            <span class="drop-hint">รองรับ .xlsx เท่านั้น, ขนาดสูงสุด 10 MB</span>
          }
          <input
            #fileInput
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style="display:none"
            (change)="onFileSelected($event)"
          />
        </div>

        @if (uploadError()) {
          <div class="error-banner">{{ uploadError() }}</div>
        }

        <div class="action-row">
          <p-button
            label="ตรวจสอบข้อมูล"
            icon="pi pi-search"
            [disabled]="!selectedFile() || !selectedType || loading()"
            [loading]="loading()"
            (onClick)="validate()"
          />
        </div>
      </div>
    }

    <!-- Step 2: Preview errors / confirmation -->
    @if (step() === 'preview') {
      <div class="card">
        @if (result()?.errors.length) {
          <div class="preview-header error">
            <i class="pi pi-times-circle"></i>
            พบข้อผิดพลาด {{ result()!.errors.length }} รายการ — ไม่สามารถ Import ได้
          </div>

          <div class="error-table-wrap">
            <table class="error-table">
              <thead><tr><th>แถวที่</th><th>คอลัมน์</th><th>ข้อความ</th></tr></thead>
              <tbody>
                @for (e of result()!.errors; track $index) {
                  <tr>
                    <td>{{ e.row }}</td>
                    <td>{{ e.field ?? '-' }}</td>
                    <td>{{ e.message }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="action-row">
            <p-button label="กลับแก้ไขไฟล์" icon="pi pi-arrow-left" severity="secondary" (onClick)="reset()" />
          </div>
        } @else {
          <div class="preview-header success">
            <i class="pi pi-check-circle"></i>
            ตรวจสอบผ่าน — พร้อม Import
          </div>
          <p class="preview-note">ไม่พบข้อผิดพลาด สามารถดำเนินการ Import ได้เลย</p>

          <div class="action-row">
            <p-button label="ย้อนกลับ" icon="pi pi-arrow-left" severity="secondary" (onClick)="reset()" />
            <p-button
              label="Import ข้อมูล"
              icon="pi pi-upload"
              [loading]="loading()"
              (onClick)="commit()"
            />
          </div>
        }
      </div>
    }

    <!-- Step 3: Done -->
    @if (step() === 'done') {
      <div class="card done-card">
        <i class="pi pi-check-circle done-icon"></i>
        <h2>Import สำเร็จ</h2>
        <p>นำเข้าข้อมูลจำนวน <strong>{{ result()!.importedCount }}</strong> รายการ</p>
        <p-button label="Import ข้อมูลเพิ่มเติม" icon="pi pi-plus" (onClick)="reset()" />
      </div>
    }
  `,
  styles: [`
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; max-width: 900px; }
    .form-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .form-label { font-size: 0.875rem; font-weight: 500; white-space: nowrap; }
    .drop-zone {
      border: 2px dashed var(--surface-border);
      border-radius: 8px;
      padding: 3rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .drop-zone:hover, .drop-zone.drag-over { border-color: var(--primary-color); background: var(--primary-50, #eff6ff); }
    .drop-icon { font-size: 2.5rem; color: var(--green-500); }
    .drop-label { font-weight: 500; color: var(--text-color); }
    .drop-hint { font-size: 0.8rem; color: var(--text-color-secondary); }
    .error-banner { background: var(--red-50); border: 1px solid var(--red-200); color: var(--red-700); padding: 0.75rem 1rem; border-radius: 6px; margin-top: 1rem; font-size: 0.875rem; }
    .action-row { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    .preview-header { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 600; margin-bottom: 1rem; padding: 0.75rem 1rem; border-radius: 6px; }
    .preview-header.error { background: var(--red-50); color: var(--red-700); }
    .preview-header.success { background: var(--green-50); color: var(--green-700); }
    .preview-note { color: var(--text-color-secondary); font-size: 0.875rem; margin: 0 0 1rem; }
    .error-table-wrap { max-height: 360px; overflow-y: auto; }
    .error-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .error-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .error-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: top; }
    .error-table tr:nth-child(even) td { background: var(--surface-ground); }
    .done-card { text-align: center; padding: 3rem; }
    .done-icon { font-size: 4rem; color: var(--green-500); }
    .done-card h2 { margin: 1rem 0 0.5rem; }
  `],
})
export class ImportPageComponent {
  private readonly api = inject(ImportsApi);

  protected readonly importTypes = IMPORT_TYPES;
  protected selectedType: ImportType | '' = '';
  protected selectedFile = signal<File | null>(null);
  protected step = signal<Step>('upload');
  protected result = signal<ImportResult | null>(null);
  protected loading = signal(false);
  protected isDragging = signal(false);
  protected uploadError = signal<string | null>(null);

  protected downloadTemplate(): void {
    if (this.selectedType) this.api.downloadTemplate(this.selectedType as ImportType);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectFile(file);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0] ?? null;
    this.selectFile(file);
  }

  private selectFile(file: File | null): void {
    this.uploadError.set(null);
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      this.uploadError.set('รองรับเฉพาะไฟล์ .xlsx เท่านั้น');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.uploadError.set('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
      return;
    }
    this.selectedFile.set(file);
  }

  protected validate(): void {
    const file = this.selectedFile();
    if (!file || !this.selectedType) return;
    this.loading.set(true);
    this.uploadError.set(null);
    this.api.upload(this.selectedType as ImportType, file, true).subscribe({
      next: (res) => { this.result.set(res); this.step.set('preview'); this.loading.set(false); },
      error: (err: { error?: { message?: string } }) => {
        this.uploadError.set(err.error?.message ?? 'เกิดข้อผิดพลาด กรุณาตรวจสอบไฟล์');
        this.loading.set(false);
      },
    });
  }

  protected commit(): void {
    const file = this.selectedFile();
    if (!file || !this.selectedType) return;
    this.loading.set(true);
    this.api.upload(this.selectedType as ImportType, file, false).subscribe({
      next: (res) => { this.result.set(res); this.step.set('done'); this.loading.set(false); },
      error: (err: { error?: { message?: string } }) => {
        this.uploadError.set(err.error?.message ?? 'Import ล้มเหลว กรุณาลองใหม่');
        this.step.set('upload');
        this.loading.set(false);
      },
    });
  }

  protected reset(): void {
    this.step.set('upload');
    this.selectedFile.set(null);
    this.result.set(null);
    this.uploadError.set(null);
    this.loading.set(false);
  }
}
