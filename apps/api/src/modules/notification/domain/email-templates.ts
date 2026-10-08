import { NotificationType } from '../../../generated/prisma/enums.js';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailTemplatePayload {
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  jobId?: string;
  data?: Record<string, unknown>;
}

export function renderEmail(
  type: NotificationType,
  payload: EmailTemplatePayload,
  recipientName = 'ผู้ใช้งาน',
): EmailContent {
  const subject = `[ระบบเปิดงานประกันภัย] ${payload.title}`;

  let actionText = 'ดูรายละเอียดในระบบ';
  if (type === NotificationType.APPROVAL_REQUESTED || type === NotificationType.APPROVAL_REQUIRED) {
    actionText = 'ตรวจสอบและพิจารณาอนุมัติ';
  } else if (type === NotificationType.UNDERWRITING_REQUESTED) {
    actionText = 'ตรวจสอบและประเมินความเสี่ยง (Underwriting)';
  } else if (type === NotificationType.UNDERWRITING_APPROVED) {
    actionText = 'ดูผลการอนุมัติ Underwriting';
  } else if (type === NotificationType.UNDERWRITING_INFO_REQUIRED) {
    actionText = 'ดูข้อมูลที่ต้องระบุเพิ่มเติม';
  } else if (type === NotificationType.UNDERWRITING_REJECTED) {
    actionText = 'ดูเหตุผลการปฏิเสธ Underwriting';
  } else if (type === NotificationType.QUOTATION_RECEIVED) {
    actionText = 'ดูรายละเอียดใบเสนอราคา';
  } else if (type === NotificationType.QUOTATION_EXPIRING) {
    actionText = 'ดูรายละเอียดใบเสนอราคาที่ใกล้หมดอายุ';
  } else if (type === NotificationType.POLICY_ISSUED) {
    actionText = 'ดูรายละเอียดกรมธรรม์';
  } else if (type === NotificationType.CUSTOMER_ACCEPTED) {
    actionText = 'ดูรายละเอียดการยอมรับข้อเสนอ';
  } else if (type === NotificationType.CUSTOMER_REJECTED) {
    actionText = 'ดูรายละเอียดการปฏิเสธข้อเสนอ';
  }

  const detailsHtml = payload.entityType
    ? `<div style="background:#f4f6f8;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:14px;color:#333;">
        <div><strong>ประเภทรายการ:</strong> ${payload.entityType}</div>
        ${payload.entityId ? `<div><strong>รหัสรายการ:</strong> ${payload.entityId}</div>` : ''}
        ${payload.jobId ? `<div><strong>รหัสใบงาน (Job ID):</strong> ${payload.jobId}</div>` : ''}
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(payload.title)}</title>
</head>
<body style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;line-height:1.6;color:#333;margin:0;padding:20px;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="background:#1e3a8a;color:#fff;padding:20px 24px;">
      <h2 style="margin:0;font-size:20px;font-weight:600;">ระบบเปิดงานประกันภัย</h2>
    </div>
    <div style="padding:24px;">
      <p style="margin-top:0;">เรียนคุณ ${escapeHtml(recipientName)},</p>
      <h3 style="color:#0f172a;margin:16px 0 8px 0;">${escapeHtml(payload.title)}</h3>
      <p style="margin:0 0 16px 0;color:#475569;">${escapeHtml(payload.message)}</p>
      ${detailsHtml}
      <div style="margin-top:24px;">
        <span style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:500;font-size:14px;">
          ${escapeHtml(actionText)}
        </span>
      </div>
    </div>
    <div style="background:#f1f5f9;padding:12px 24px;font-size:12px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;">
      อีเมลนี้ถูกส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้
    </div>
  </div>
</body>
</html>`;

  const text = `เรียนคุณ ${recipientName}\n\n${payload.title}\n${payload.message}\n${payload.entityType ? `ประเภทรายการ: ${payload.entityType}\n` : ''}${payload.entityId ? `รหัสรายการ: ${payload.entityId}\n` : ''}\n\nเข้าสู่ระบบเพื่อดูรายละเอียด: ${actionText}`;

  return { subject, text, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

