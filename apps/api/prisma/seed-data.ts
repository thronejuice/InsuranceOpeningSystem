/** spec §4 */
export const ROLES = {
  ADMIN: 'System administrator',
  AGENT: 'Sales / Insurance Agent',
  BROKER_STAFF: 'Operation / Quotation / Policy staff',
  SUPERVISOR: 'Team supervisor',
  MANAGER: 'Manager / Approval',
  FINANCE: 'Payment / Commission',
  VIEWER: 'Read-only user',
} as const;

export type RoleCode = keyof typeof ROLES;

/** spec §4.1 + DESIGN §8 additions */
export const PERMISSIONS = {
  'customer.view': 'View customers',
  'customer.create': 'Create customers',
  'customer.update': 'Update customers',
  'customer.delete': 'Soft-delete customers',
  'customer.view_sensitive': 'See full citizenId / taxId (unmasked)',
  'job.view': 'View own jobs',
  'job.view_all': 'View jobs of every agent (BR-014)',
  'job.create': 'Create jobs',
  'job.update': 'Update own jobs',
  'job.update_all': 'Update jobs of every agent (BR-014)',
  'job.submit': 'Submit jobs',
  'job.assign': 'Assign jobs',
  'job.cancel': 'Cancel jobs',
  'quotation.view': 'View quotations',
  'quotation.create': 'Create quotations',
  'quotation.update': 'Update quotations',
  'quotation.select': 'Select a quotation',
  'proposal.view': 'View proposals',
  'proposal.create': 'Create proposals',
  'proposal.send': 'Send proposals to customer',
  'proposal.accept': 'Record customer acceptance',
  'proposal.reject': 'Record customer rejection',
  'approval.manage': 'Request / manage approvals',
  'approval.approve': 'Approve or reject approval requests',
  'approval.approve_own': 'Approve or reject requests you raised yourself (bypasses maker-checker)',
  'policy.view': 'View policies',
  'policy.create': 'Bind / issue policies',
  'policy.update': 'Update policies',
  'payment.view': 'View payments',
  'payment.create': 'Record payments',
  'commission.view': 'View commissions',
  'commission.create': 'Record commissions',
  'renewal.view': 'View renewals',
  'renewal.create': 'Initiate renewals',
  'notification.view': 'View notifications',
  'task.view': 'View follow-up tasks',
  'task.create': 'Create follow-up tasks',
  'task.update': 'Update / complete follow-up tasks',
  'import.create': 'Import data from Excel',
  'report.view': 'View reports and dashboards',
  'master.manage': 'Manage master data',
  'user.manage': 'Manage users and roles',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as PermissionCode[];
const VIEW = ALL.filter((code) => code.endsWith('.view'));

/**
 * Default role → permission mapping. spec §4 lists roles but not their permissions,
 * so this is an assumption tracked as PLAN.md Open Question Q9.
 */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  ADMIN: ALL,
  AGENT: [
    ...VIEW.filter((code) => code !== 'report.view'),
    'customer.create', 'customer.update', 'customer.delete',
    'job.create', 'job.update', 'job.submit', 'job.cancel',
    'quotation.select',
    'proposal.create', 'proposal.send', 'proposal.accept', 'proposal.reject',
    'approval.manage',
    'task.create', 'task.update',
  ],
  BROKER_STAFF: [
    ...VIEW.filter((code) => code !== 'report.view'),
    'customer.create', 'customer.update', 'customer.delete',
    'job.view_all', 'job.update', 'job.update_all',
    'quotation.create', 'quotation.update', 'quotation.select',
    'proposal.create', 'proposal.send', 'proposal.accept', 'proposal.reject',
    'approval.manage',
    'policy.create', 'policy.update',
    'renewal.create',
    'import.create',
    'task.create', 'task.update',
  ],
  SUPERVISOR: [
    ...VIEW,
    'customer.create', 'customer.update', 'customer.delete', 'customer.view_sensitive',
    'job.view_all', 'job.create', 'job.update', 'job.update_all', 'job.submit', 'job.assign', 'job.cancel',
    'quotation.select',
    'approval.manage',
    'task.create', 'task.update',
  ],
  MANAGER: [
    ...VIEW,
    'customer.view_sensitive',
    'job.view_all', 'job.assign', 'job.cancel',
    'approval.manage', 'approval.approve',
  ],
  FINANCE: [
    ...VIEW,
    'job.view_all',
    'payment.create',
    'commission.create',
  ],
  VIEWER: [...VIEW, 'job.view_all'],
};

/** One sample user per role; `admin` gets ADMIN. */
export const SAMPLE_USERS: { username: string; fullName: string; role: RoleCode }[] = [
  { username: 'admin', fullName: 'System Administrator', role: 'ADMIN' },
  { username: 'agent', fullName: 'Sample Agent', role: 'AGENT' },
  { username: 'agent01', fullName: 'Agent One', role: 'AGENT' },
  { username: 'staff', fullName: 'Sample Broker Staff', role: 'BROKER_STAFF' },
  { username: 'supervisor', fullName: 'Sample Supervisor', role: 'SUPERVISOR' },
  { username: 'manager', fullName: 'Sample Manager', role: 'MANAGER' },
  { username: 'finance', fullName: 'Sample Finance', role: 'FINANCE' },
  { username: 'viewer', fullName: 'Sample Viewer', role: 'VIEWER' },
];

// ─── Master Data seed (spec §8, §10, §11, §12.2, §16.2) ─────────────────────

export const INSURANCE_TYPES = [
  { code: 'MOTOR', name: 'ประกันภัยรถยนต์', description: 'Motor vehicle insurance' },
  { code: 'PROPERTY', name: 'ประกันภัยทรัพย์สิน', description: 'Property insurance' },
  { code: 'FIRE', name: 'ประกันอัคคีภัย', description: 'Fire insurance' },
  { code: 'MARINE', name: 'ประกันภัยทางทะเล', description: 'Marine insurance' },
  { code: 'ENGINEERING', name: 'ประกันภัยวิศวกรรม', description: 'Engineering insurance' },
  { code: 'LIABILITY', name: 'ประกันภัยความรับผิด', description: 'Liability insurance' },
  { code: 'PA', name: 'ประกันอุบัติเหตุส่วนบุคคล', description: 'Personal accident insurance' },
  { code: 'TRAVEL', name: 'ประกันการเดินทาง', description: 'Travel insurance' },
  { code: 'CYBER', name: 'ประกันภัยไซเบอร์', description: 'Cyber insurance' },
  { code: 'D_AND_O', name: 'ประกันภัยผู้บริหาร', description: "Directors & Officers insurance" },
  { code: 'OTHER', name: 'ประกันภัยอื่น ๆ', description: 'Other types of insurance' },
] as const;

export const INSURANCE_PRODUCTS = [
  {
    typeCode: 'MOTOR',
    code: 'MOTOR-001',
    name: 'ประกันภัยรถยนต์ชั้น 1',
    description: 'Comprehensive motor insurance (Class 1)',
    requireDocsOnSubmit: true,
    requireDocsOnBind: true,
  },
  {
    typeCode: 'FIRE',
    code: 'FIRE-001',
    name: 'ประกันอัคคีภัยที่อยู่อาศัย',
    description: 'Residential fire insurance',
    requireDocsOnSubmit: false,
    requireDocsOnBind: true,
  },
  {
    typeCode: 'PROPERTY',
    code: 'PROPERTY-001',
    name: 'ประกันภัยทรัพย์สินพาณิชย์',
    description: 'Commercial property insurance',
    requireDocsOnSubmit: false,
    requireDocsOnBind: true,
  },

  // Motor — ภาคสมัครใจ ชั้น 2/2+/3/3+ และภาคบังคับ (พ.ร.บ.)
  { typeCode: 'MOTOR', code: 'MOTOR-002', name: 'ประกันภัยรถยนต์ชั้น 2+', description: 'Motor Class 2+ (collision with land vehicle, theft, fire)', requireDocsOnSubmit: true, requireDocsOnBind: true },
  { typeCode: 'MOTOR', code: 'MOTOR-003', name: 'ประกันภัยรถยนต์ชั้น 2', description: 'Motor Class 2 (third party, theft, fire)', requireDocsOnSubmit: true, requireDocsOnBind: true },
  { typeCode: 'MOTOR', code: 'MOTOR-004', name: 'ประกันภัยรถยนต์ชั้น 3+', description: 'Motor Class 3+ (third party, collision with land vehicle)', requireDocsOnSubmit: true, requireDocsOnBind: true },
  { typeCode: 'MOTOR', code: 'MOTOR-005', name: 'ประกันภัยรถยนต์ชั้น 3', description: 'Motor Class 3 (third party liability only)', requireDocsOnSubmit: true, requireDocsOnBind: true },
  { typeCode: 'MOTOR', code: 'MOTOR-006', name: 'ประกันภัยรถยนต์ภาคบังคับ (พ.ร.บ.)', description: 'Compulsory motor insurance (CMI)', requireDocsOnSubmit: true, requireDocsOnBind: true },

  // Property
  { typeCode: 'PROPERTY', code: 'PROPERTY-002', name: 'ประกันภัยความเสี่ยงภัยทรัพย์สิน (IAR)', description: 'Industrial All Risks', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'PROPERTY', code: 'PROPERTY-003', name: 'ประกันภัยโจรกรรม', description: 'Burglary insurance', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'PROPERTY', code: 'PROPERTY-004', name: 'ประกันภัยกระจก', description: 'Plate glass insurance', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'PROPERTY', code: 'PROPERTY-005', name: 'ประกันภัยเงินสด', description: 'Money insurance (in safe / in transit)', requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Fire
  { typeCode: 'FIRE', code: 'FIRE-002', name: 'ประกันอัคคีภัยสำหรับธุรกิจ', description: 'Commercial fire insurance', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'FIRE', code: 'FIRE-003', name: 'ประกันอัคคีภัยโรงงานอุตสาหกรรม', description: 'Industrial fire insurance', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'FIRE', code: 'FIRE-004', name: 'ประกันภัยพิบัติ (ภัยธรรมชาติ)', description: 'Natural catastrophe (flood, windstorm, earthquake, hail)', requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Marine & transit
  { typeCode: 'MARINE', code: 'MARINE-001', name: 'ประกันภัยขนส่งสินค้าระหว่างประเทศ (นำเข้า/ส่งออก)', description: 'Marine cargo — import/export', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'MARINE', code: 'MARINE-002', name: 'ประกันภัยขนส่งสินค้าภายในประเทศ', description: 'Inland transit', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'MARINE', code: 'MARINE-003', name: 'ประกันภัยตัวเรือ', description: 'Marine hull', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'MARINE', code: 'MARINE-004', name: 'ประกันภัยความรับผิดของผู้ขนส่ง', description: "Carrier's / logistics liability", requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Engineering
  { typeCode: 'ENGINEERING', code: 'ENGINEERING-001', name: 'ประกันภัยงานก่อสร้าง (CAR)', description: "Contractors' All Risks", requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'ENGINEERING', code: 'ENGINEERING-002', name: 'ประกันภัยงานติดตั้งเครื่องจักร (EAR)', description: 'Erection All Risks', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'ENGINEERING', code: 'ENGINEERING-003', name: 'ประกันภัยเครื่องจักรขัดข้อง', description: 'Machinery Breakdown', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'ENGINEERING', code: 'ENGINEERING-004', name: 'ประกันภัยอุปกรณ์อิเล็กทรอนิกส์', description: 'Electronic Equipment Insurance', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'ENGINEERING', code: 'ENGINEERING-005', name: 'ประกันภัยเครื่องจักรผู้รับเหมา', description: "Contractors' Plant & Equipment", requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Liability
  { typeCode: 'LIABILITY', code: 'LIABILITY-001', name: 'ประกันภัยความรับผิดต่อบุคคลภายนอก', description: 'Public Liability', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'LIABILITY', code: 'LIABILITY-002', name: 'ประกันภัยความรับผิดจากผลิตภัณฑ์', description: 'Product Liability', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'LIABILITY', code: 'LIABILITY-003', name: 'ประกันภัยความรับผิดทางวิชาชีพ', description: 'Professional Indemnity', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'LIABILITY', code: 'LIABILITY-004', name: 'ประกันภัยความรับผิดของนายจ้าง', description: "Employer's Liability", requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Personal accident
  { typeCode: 'PA', code: 'PA-001', name: 'ประกันอุบัติเหตุส่วนบุคคล', description: 'Individual Personal Accident', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'PA', code: 'PA-002', name: 'ประกันอุบัติเหตุกลุ่ม', description: 'Group Personal Accident', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'PA', code: 'PA-003', name: 'ประกันอุบัติเหตุนักเรียน/นักศึกษา', description: 'Student Personal Accident', requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Travel
  { typeCode: 'TRAVEL', code: 'TRAVEL-001', name: 'ประกันการเดินทางต่างประเทศ (รายเที่ยว)', description: 'Outbound travel — single trip', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'TRAVEL', code: 'TRAVEL-002', name: 'ประกันการเดินทางต่างประเทศ (รายปี)', description: 'Outbound travel — annual multi-trip', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'TRAVEL', code: 'TRAVEL-003', name: 'ประกันการเดินทางภายในประเทศ', description: 'Domestic travel', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'TRAVEL', code: 'TRAVEL-004', name: 'ประกันการเดินทางเข้าประเทศไทย (Inbound)', description: 'Inbound travel for foreigners', requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Cyber
  { typeCode: 'CYBER', code: 'CYBER-001', name: 'ประกันภัยไซเบอร์สำหรับธุรกิจ', description: 'Commercial cyber liability & first-party loss', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'CYBER', code: 'CYBER-002', name: 'ประกันภัยไซเบอร์สำหรับบุคคล', description: 'Personal cyber (online fraud, identity theft)', requireDocsOnSubmit: false, requireDocsOnBind: true },

  // D&O
  { typeCode: 'D_AND_O', code: 'D_AND_O-001', name: 'ประกันภัยความรับผิดของกรรมการและเจ้าหน้าที่บริหาร (D&O)', description: 'Directors & Officers Liability', requireDocsOnSubmit: false, requireDocsOnBind: true },

  // Other
  { typeCode: 'OTHER', code: 'OTHER-001', name: 'ประกันภัยความซื่อสัตย์ของลูกจ้าง', description: 'Fidelity Guarantee', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'OTHER', code: 'OTHER-002', name: 'ประกันภัยสุขภาพ', description: 'Health insurance (non-life)', requireDocsOnSubmit: false, requireDocsOnBind: true },
  { typeCode: 'OTHER', code: 'OTHER-003', name: 'ประกันภัยสัตว์เลี้ยง', description: 'Pet insurance', requireDocsOnSubmit: false, requireDocsOnBind: true },
] as const;

type RiskFieldSeed = {
  fieldCode: string;
  fieldName: string;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  isRequired: boolean;
  sortOrder: number;
  validationRule: string | null;
};
type FieldSpec = [code: string, name: string, type: RiskFieldSeed['fieldType'], required: boolean, options?: string[]];

/** Build ordered risk fields; SELECT options go into validationRule as {"options": [...]} (risk-validator.ts). */
const fields = (...specs: FieldSpec[]): RiskFieldSeed[] =>
  specs.map(([fieldCode, fieldName, fieldType, isRequired, options], i) => ({
    fieldCode, fieldName, fieldType, isRequired, sortOrder: i + 1,
    validationRule: options ? JSON.stringify({ options }) : null,
  }));

/** spec §10.2 (Motor) */
export const MOTOR_RISK_FIELDS = fields(
  ['brand', 'ยี่ห้อรถ', 'TEXT', true],
  ['model', 'รุ่นรถ', 'TEXT', true],
  ['year', 'ปีรถ', 'NUMBER', true],
  ['license_plate', 'ทะเบียนรถ', 'TEXT', true],
  ['engine_no', 'เลขเครื่องยนต์', 'TEXT', false],
  ['chassis_no', 'เลขตัวถัง', 'TEXT', false],
  ['vehicle_type', 'ประเภทรถ', 'SELECT', true, ['รถเก๋ง', 'รถกระบะ', 'รถตู้', 'รถอเนกประสงค์ (SUV/PPV)', 'รถบรรทุก', 'รถจักรยานยนต์']],
  ['usage_type', 'ประเภทการใช้งาน', 'SELECT', true, ['ส่วนบุคคล', 'พาณิชย์', 'รับจ้าง/ให้เช่า']],
  ['sum_insured', 'ทุนประกันภัย', 'NUMBER', true],
);

/** spec §10.3 (Property) */
export const PROPERTY_RISK_FIELDS = fields(
  ['building_type', 'ประเภทอาคาร', 'SELECT', true, ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'อาคารพาณิชย์', 'คอนโดมิเนียม', 'สำนักงาน', 'โรงงาน', 'โกดังสินค้า']],
  ['construction_type', 'ประเภทการก่อสร้าง', 'SELECT', true, ['ตึก (ชั้น 1)', 'ครึ่งตึกครึ่งไม้ (ชั้น 2)', 'ไม้ (ชั้น 3)']],
  ['location', 'สถานที่ตั้ง', 'TEXT', true],
  ['occupancy', 'การใช้งาน', 'TEXT', true],
  ['building_value', 'มูลค่าอาคาร', 'NUMBER', true],
  ['content_value', 'มูลค่าสิ่งของภายใน', 'NUMBER', false],
  ['stock_value', 'มูลค่าสินค้าคงคลัง', 'NUMBER', false],
  ['machinery_value', 'มูลค่าเครื่องจักร', 'NUMBER', false],
);

const MARINE_CARGO_RISK_FIELDS = fields(
  ['commodity', 'ประเภทสินค้า', 'TEXT', true],
  ['packing', 'ลักษณะการบรรจุหีบห่อ', 'SELECT', true, ['ตู้คอนเทนเนอร์', 'พาเลท', 'ลังไม้', 'กล่องกระดาษ', 'สินค้าเทกอง (Bulk)']],
  ['conveyance', 'พาหนะขนส่ง', 'SELECT', true, ['เรือ', 'เครื่องบิน', 'รถบรรทุก', 'รถไฟ']],
  ['origin', 'ต้นทาง', 'TEXT', true],
  ['destination', 'ปลายทาง', 'TEXT', true],
  ['departure_date', 'วันที่ออกเดินทาง', 'DATE', false],
  ['incoterms', 'เงื่อนไขการซื้อขาย (Incoterms)', 'SELECT', false, ['FOB', 'CFR', 'CIF', 'EXW', 'DAP', 'DDP']],
  ['cargo_value', 'มูลค่าสินค้า', 'NUMBER', true],
);

const ENGINEERING_PROJECT_RISK_FIELDS = fields(
  ['project_name', 'ชื่อโครงการ', 'TEXT', true],
  ['site_location', 'สถานที่ตั้งโครงการ', 'TEXT', true],
  ['principal', 'ผู้ว่าจ้าง', 'TEXT', true],
  ['contractor', 'ผู้รับเหมาหลัก', 'TEXT', true],
  ['start_date', 'วันเริ่มงาน', 'DATE', true],
  ['end_date', 'วันสิ้นสุดงาน', 'DATE', true],
  ['maintenance_months', 'ระยะเวลาบำรุงรักษา (เดือน)', 'NUMBER', false],
  ['contract_value', 'มูลค่างานตามสัญญา', 'NUMBER', true],
);

const EQUIPMENT_RISK_FIELDS = fields(
  ['equipment_type', 'ประเภทเครื่องจักร/อุปกรณ์', 'TEXT', true],
  ['manufacturer', 'ผู้ผลิต/ยี่ห้อ', 'TEXT', false],
  ['model_serial', 'รุ่น/หมายเลขเครื่อง', 'TEXT', false],
  ['year_of_manufacture', 'ปีที่ผลิต', 'NUMBER', false],
  ['location', 'สถานที่ตั้ง/ใช้งาน', 'TEXT', true],
  ['has_maintenance_contract', 'มีสัญญาบำรุงรักษา', 'BOOLEAN', false],
  ['replacement_value', 'มูลค่าทดแทนใหม่', 'NUMBER', true],
);

const LIABILITY_RISK_FIELDS = fields(
  ['business_activity', 'ลักษณะการประกอบธุรกิจ', 'TEXT', true],
  ['annual_revenue', 'รายได้ต่อปี', 'NUMBER', true],
  ['employee_count', 'จำนวนพนักงาน', 'NUMBER', true],
  ['territory', 'ขอบเขตอาณาเขตคุ้มครอง', 'SELECT', true, ['ประเทศไทย', 'อาเซียน', 'ทั่วโลก (ยกเว้นสหรัฐฯ/แคนาดา)', 'ทั่วโลก']],
  ['prior_claims', 'เคยมีการเรียกร้องค่าเสียหายใน 5 ปี', 'BOOLEAN', true],
  ['limit_of_liability', 'วงเงินความรับผิดที่ต้องการ', 'NUMBER', true],
);

const PA_RISK_FIELDS = fields(
  ['insured_count', 'จำนวนผู้เอาประกัน', 'NUMBER', true],
  ['occupation', 'อาชีพ/ลักษณะงาน', 'TEXT', true],
  ['occupation_class', 'ชั้นอาชีพ', 'SELECT', true, ['ชั้น 1 (งานสำนักงาน)', 'ชั้น 2 (งานภาคสนามเบา)', 'ชั้น 3 (งานใช้แรงงาน)', 'ชั้น 4 (งานเสี่ยงสูง)']],
  ['age_range', 'ช่วงอายุผู้เอาประกัน', 'TEXT', true],
  ['sum_insured_per_person', 'ทุนประกันต่อคน', 'NUMBER', true],
);

const TRAVEL_RISK_FIELDS = fields(
  ['destination', 'ประเทศ/จุดหมายปลายทาง', 'TEXT', true],
  ['departure_date', 'วันเดินทางไป', 'DATE', true],
  ['return_date', 'วันเดินทางกลับ', 'DATE', true],
  ['traveller_count', 'จำนวนผู้เดินทาง', 'NUMBER', true],
  ['trip_purpose', 'วัตถุประสงค์การเดินทาง', 'SELECT', true, ['ท่องเที่ยว', 'ธุรกิจ', 'ศึกษาต่อ', 'เยี่ยมญาติ']],
  ['schengen_visa', 'ใช้ยื่นวีซ่าเชงเก้น', 'BOOLEAN', false],
);

const CYBER_BUSINESS_RISK_FIELDS = fields(
  ['industry', 'ประเภทธุรกิจ', 'TEXT', true],
  ['annual_revenue', 'รายได้ต่อปี', 'NUMBER', true],
  ['employee_count', 'จำนวนพนักงาน', 'NUMBER', true],
  ['records_held', 'จำนวนข้อมูลส่วนบุคคลที่จัดเก็บ (รายการ)', 'NUMBER', true],
  ['has_mfa', 'ใช้การยืนยันตัวตนหลายปัจจัย (MFA)', 'BOOLEAN', true],
  ['has_offline_backup', 'มีการสำรองข้อมูลแบบ offline', 'BOOLEAN', true],
  ['pdpa_compliant', 'ปฏิบัติตาม PDPA', 'BOOLEAN', true],
  ['prior_incident', 'เคยถูกโจมตีทางไซเบอร์ใน 3 ปี', 'BOOLEAN', true],
);

/** Risk fields per product code; the form in Job › ข้อมูลความเสี่ยง is built from these. */
export const PRODUCT_RISK_FIELDS: Record<string, RiskFieldSeed[]> = {
  'MOTOR-001': MOTOR_RISK_FIELDS,
  'MOTOR-002': MOTOR_RISK_FIELDS,
  'MOTOR-003': MOTOR_RISK_FIELDS,
  'MOTOR-004': MOTOR_RISK_FIELDS,
  'MOTOR-005': MOTOR_RISK_FIELDS,
  'MOTOR-006': fields(
    ['license_plate', 'ทะเบียนรถ', 'TEXT', true],
    ['brand', 'ยี่ห้อรถ', 'TEXT', true],
    ['chassis_no', 'เลขตัวถัง', 'TEXT', true],
    ['vehicle_class', 'ประเภทรถตาม พ.ร.บ.', 'SELECT', true, ['รถยนต์นั่งไม่เกิน 7 คน', 'รถยนต์โดยสารเกิน 7 คน', 'รถกระบะ/บรรทุก', 'รถจักรยานยนต์']],
    ['usage_type', 'ประเภทการใช้งาน', 'SELECT', true, ['ส่วนบุคคล', 'รับจ้าง/ให้เช่า']],
  ),

  'FIRE-001': PROPERTY_RISK_FIELDS,
  'FIRE-002': PROPERTY_RISK_FIELDS,
  'FIRE-003': PROPERTY_RISK_FIELDS,
  'FIRE-004': fields(
    ['location', 'สถานที่ตั้ง', 'TEXT', true],
    ['building_type', 'ประเภทอาคาร', 'SELECT', true, ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'อาคารพาณิชย์', 'คอนโดมิเนียม', 'สำนักงาน', 'โรงงาน', 'โกดังสินค้า']],
    ['flood_zone', 'อยู่ในพื้นที่เสี่ยงน้ำท่วม', 'BOOLEAN', true],
    ['floor_level', 'ชั้นที่ตั้งทรัพย์สิน', 'NUMBER', false],
    ['prior_flood_loss', 'เคยได้รับความเสียหายจากภัยธรรมชาติ', 'BOOLEAN', true],
    ['sum_insured', 'ทุนประกันภัย', 'NUMBER', true],
  ),
  'PROPERTY-001': PROPERTY_RISK_FIELDS,
  'PROPERTY-002': fields(
    ['business_activity', 'ลักษณะการประกอบธุรกิจ', 'TEXT', true],
    ['location', 'สถานที่ตั้ง', 'TEXT', true],
    ['construction_type', 'ประเภทการก่อสร้าง', 'SELECT', true, ['ตึก (ชั้น 1)', 'ครึ่งตึกครึ่งไม้ (ชั้น 2)', 'ไม้ (ชั้น 3)']],
    ['fire_protection', 'ระบบป้องกันอัคคีภัย', 'SELECT', true, ['Sprinkler', 'Fire alarm', 'ถังดับเพลิงเท่านั้น', 'ไม่มี']],
    ['building_value', 'มูลค่าอาคาร', 'NUMBER', true],
    ['machinery_value', 'มูลค่าเครื่องจักร', 'NUMBER', false],
    ['stock_value', 'มูลค่าสินค้าคงคลัง', 'NUMBER', false],
    ['gross_profit', 'กำไรขั้นต้นต่อปี (สำหรับธุรกิจหยุดชะงัก)', 'NUMBER', false],
  ),
  'PROPERTY-003': fields(
    ['location', 'สถานที่ตั้ง', 'TEXT', true],
    ['security_system', 'ระบบรักษาความปลอดภัย', 'SELECT', true, ['รปภ. 24 ชม. + CCTV', 'CCTV', 'สัญญาณกันขโมย', 'ไม่มี']],
    ['contents_value', 'มูลค่าทรัพย์สินภายใน', 'NUMBER', true],
  ),
  'PROPERTY-004': fields(
    ['location', 'สถานที่ตั้ง', 'TEXT', true],
    ['glass_area_sqm', 'พื้นที่กระจกรวม (ตร.ม.)', 'NUMBER', true],
    ['glass_type', 'ชนิดกระจก', 'SELECT', true, ['กระจกธรรมดา', 'กระจกนิรภัย', 'กระจกเทมเปอร์', 'กระจกลามิเนต']],
    ['glass_value', 'มูลค่ากระจก', 'NUMBER', true],
  ),
  'PROPERTY-005': fields(
    ['location', 'สถานที่เก็บเงิน', 'TEXT', true],
    ['max_in_safe', 'จำนวนเงินสูงสุดในตู้นิรภัย', 'NUMBER', true],
    ['max_per_transit', 'จำนวนเงินสูงสุดต่อการขนส่ง', 'NUMBER', true],
    ['transit_method', 'วิธีการขนส่งเงิน', 'SELECT', true, ['พนักงานบริษัท', 'บริษัทขนส่งเงินสด']],
  ),

  'MARINE-001': MARINE_CARGO_RISK_FIELDS,
  'MARINE-002': fields(
    ['commodity', 'ประเภทสินค้า', 'TEXT', true],
    ['conveyance', 'พาหนะขนส่ง', 'SELECT', true, ['รถบรรทุก', 'รถไฟ', 'เรือลำเลียง']],
    ['route', 'เส้นทางขนส่ง', 'TEXT', true],
    ['max_per_trip', 'มูลค่าสินค้าสูงสุดต่อเที่ยว', 'NUMBER', true],
    ['annual_value', 'มูลค่าขนส่งรวมต่อปี', 'NUMBER', true],
  ),
  'MARINE-003': fields(
    ['vessel_name', 'ชื่อเรือ', 'TEXT', true],
    ['vessel_type', 'ประเภทเรือ', 'SELECT', true, ['เรือสินค้า', 'เรือบรรทุกน้ำมัน', 'เรือโดยสาร', 'เรือประมง', 'เรือลากจูง']],
    ['gross_tonnage', 'ขนาดตันกรอส', 'NUMBER', true],
    ['year_built', 'ปีที่ต่อเรือ', 'NUMBER', true],
    ['navigation_area', 'เขตการเดินเรือ', 'TEXT', true],
    ['hull_value', 'มูลค่าตัวเรือ', 'NUMBER', true],
  ),
  'MARINE-004': fields(
    ['fleet_size', 'จำนวนรถ/พาหนะ', 'NUMBER', true],
    ['commodity', 'ประเภทสินค้าที่รับขน', 'TEXT', true],
    ['annual_freight_revenue', 'รายได้ค่าขนส่งต่อปี', 'NUMBER', true],
    ['limit_per_conveyance', 'วงเงินความรับผิดต่อพาหนะ', 'NUMBER', true],
  ),

  'ENGINEERING-001': ENGINEERING_PROJECT_RISK_FIELDS,
  'ENGINEERING-002': ENGINEERING_PROJECT_RISK_FIELDS,
  'ENGINEERING-003': EQUIPMENT_RISK_FIELDS,
  'ENGINEERING-004': EQUIPMENT_RISK_FIELDS,
  'ENGINEERING-005': EQUIPMENT_RISK_FIELDS,

  'LIABILITY-001': LIABILITY_RISK_FIELDS,
  'LIABILITY-002': LIABILITY_RISK_FIELDS,
  'LIABILITY-003': fields(
    ['profession', 'วิชาชีพ', 'SELECT', true, ['แพทย์', 'วิศวกร', 'สถาปนิก', 'ทนายความ', 'ผู้สอบบัญชี', 'ที่ปรึกษา', 'อื่น ๆ']],
    ['license_no', 'เลขที่ใบอนุญาตประกอบวิชาชีพ', 'TEXT', false],
    ['annual_fee_income', 'รายได้ค่าวิชาชีพต่อปี', 'NUMBER', true],
    ['prior_claims', 'เคยมีการเรียกร้องค่าเสียหายใน 5 ปี', 'BOOLEAN', true],
    ['limit_of_liability', 'วงเงินความรับผิดที่ต้องการ', 'NUMBER', true],
  ),
  'LIABILITY-004': LIABILITY_RISK_FIELDS,

  'PA-001': PA_RISK_FIELDS,
  'PA-002': PA_RISK_FIELDS,
  'PA-003': fields(
    ['institution', 'ชื่อสถานศึกษา', 'TEXT', true],
    ['education_level', 'ระดับการศึกษา', 'SELECT', true, ['อนุบาล', 'ประถมศึกษา', 'มัธยมศึกษา', 'อาชีวศึกษา', 'อุดมศึกษา']],
    ['insured_count', 'จำนวนนักเรียน/นักศึกษา', 'NUMBER', true],
    ['sum_insured_per_person', 'ทุนประกันต่อคน', 'NUMBER', true],
  ),

  'TRAVEL-001': TRAVEL_RISK_FIELDS,
  'TRAVEL-002': fields(
    ['traveller_count', 'จำนวนผู้เดินทาง', 'NUMBER', true],
    ['region', 'ภูมิภาคที่คุ้มครอง', 'SELECT', true, ['เอเชีย', 'ทั่วโลก (ยกเว้นสหรัฐฯ)', 'ทั่วโลก']],
    ['max_days_per_trip', 'จำนวนวันสูงสุดต่อเที่ยว', 'SELECT', true, ['90 วัน', '180 วัน']],
    ['start_date', 'วันเริ่มคุ้มครอง', 'DATE', true],
  ),
  'TRAVEL-003': fields(
    ['destination', 'จังหวัดปลายทาง', 'TEXT', true],
    ['departure_date', 'วันเดินทางไป', 'DATE', true],
    ['return_date', 'วันเดินทางกลับ', 'DATE', true],
    ['traveller_count', 'จำนวนผู้เดินทาง', 'NUMBER', true],
  ),
  'TRAVEL-004': fields(
    ['nationality', 'สัญชาติผู้เดินทาง', 'TEXT', true],
    ['passport_no', 'เลขที่หนังสือเดินทาง', 'TEXT', true],
    ['arrival_date', 'วันที่เดินทางเข้าไทย', 'DATE', true],
    ['stay_days', 'จำนวนวันพำนักในไทย', 'NUMBER', true],
    ['visa_type', 'ประเภทวีซ่า', 'SELECT', true, ['ท่องเที่ยว', 'ธุรกิจ', 'Non-Immigrant O-A/O-X (เกษียณ)', 'นักเรียน', 'อื่น ๆ']],
  ),

  'CYBER-001': CYBER_BUSINESS_RISK_FIELDS,
  'CYBER-002': fields(
    ['insured_count', 'จำนวนสมาชิกในครอบครัวที่คุ้มครอง', 'NUMBER', true],
    ['online_banking', 'ใช้ Mobile/Internet Banking', 'BOOLEAN', true],
    ['prior_fraud', 'เคยถูกหลอกลวงออนไลน์ใน 3 ปี', 'BOOLEAN', true],
  ),

  'D_AND_O-001': fields(
    ['company_type', 'ประเภทบริษัท', 'SELECT', true, ['บริษัทจำกัด', 'บริษัทมหาชน (จดทะเบียนใน SET/mai)', 'บริษัทมหาชน (ไม่จดทะเบียน)']],
    ['total_assets', 'สินทรัพย์รวม', 'NUMBER', true],
    ['annual_revenue', 'รายได้ต่อปี', 'NUMBER', true],
    ['director_count', 'จำนวนกรรมการและผู้บริหาร', 'NUMBER', true],
    ['us_exposure', 'มีหลักทรัพย์/สินทรัพย์ในสหรัฐฯ', 'BOOLEAN', true],
    ['pending_litigation', 'มีคดีความที่อยู่ระหว่างดำเนินการ', 'BOOLEAN', true],
  ),

  'OTHER-001': fields(
    ['business_activity', 'ลักษณะการประกอบธุรกิจ', 'TEXT', true],
    ['employee_count', 'จำนวนพนักงานที่คุ้มครอง', 'NUMBER', true],
    ['has_internal_audit', 'มีการตรวจสอบภายใน', 'BOOLEAN', true],
    ['limit_per_loss', 'วงเงินคุ้มครองต่อครั้ง', 'NUMBER', true],
  ),
  'OTHER-002': fields(
    ['insured_count', 'จำนวนผู้เอาประกัน', 'NUMBER', true],
    ['age_range', 'ช่วงอายุผู้เอาประกัน', 'TEXT', true],
    ['pre_existing_conditions', 'มีโรคประจำตัว', 'BOOLEAN', true],
    ['plan_tier', 'ระดับแผน', 'SELECT', true, ['พื้นฐาน', 'มาตรฐาน', 'พรีเมียม']],
  ),
  'OTHER-003': fields(
    ['pet_type', 'ชนิดสัตว์เลี้ยง', 'SELECT', true, ['สุนัข', 'แมว']],
    ['breed', 'สายพันธุ์', 'TEXT', true],
    ['pet_age_years', 'อายุ (ปี)', 'NUMBER', true],
    ['microchip_no', 'หมายเลขไมโครชิป', 'TEXT', false],
  ),
};

export const MOTOR_COVERAGES = [
  { code: 'COV-MOTOR-01', name: 'ความเสียหายต่อรถ', description: 'Own damage', defaultSumInsured: '500000.00' },
  { code: 'COV-MOTOR-02', name: 'ความรับผิดต่อบุคคลภายนอก', description: 'Third-party liability', defaultSumInsured: '10000000.00' },
  { code: 'COV-MOTOR-03', name: 'อุบัติเหตุส่วนบุคคล', description: 'Personal accident', defaultSumInsured: '100000.00' },
  { code: 'COV-MOTOR-04', name: 'ค่ารักษาพยาบาล', description: 'Medical expenses', defaultSumInsured: '100000.00' },
] as const;

export const PROPERTY_COVERAGES = [
  { code: 'COV-PROP-01', name: 'อัคคีภัย', description: 'Fire', defaultSumInsured: '5000000.00' },
  { code: 'COV-PROP-02', name: 'ภัยน้ำท่วม', description: 'Flood', defaultSumInsured: '5000000.00' },
  { code: 'COV-PROP-03', name: 'ภัยระเบิด', description: 'Explosion', defaultSumInsured: '5000000.00' },
] as const;

type CoverageSeed = { code: string; name: string; description: string; defaultSumInsured: string | null };
const cov = (code: string, name: string, description: string, defaultSumInsured: string | null): CoverageSeed =>
  ({ code, name, description, defaultSumInsured });

const MOTOR_OD = cov('COV-MOTOR-01', 'ความเสียหายต่อรถ', 'Own damage', '500000.00');
const MOTOR_TPL = cov('COV-MOTOR-02', 'ความรับผิดต่อบุคคลภายนอก', 'Third-party liability', '10000000.00');
const MOTOR_PA = cov('COV-MOTOR-03', 'อุบัติเหตุส่วนบุคคล', 'Personal accident', '100000.00');
const MOTOR_MED = cov('COV-MOTOR-04', 'ค่ารักษาพยาบาล', 'Medical expenses', '100000.00');
const MOTOR_THEFT_FIRE = cov('COV-MOTOR-05', 'รถสูญหาย/ไฟไหม้', 'Theft & fire', '500000.00');
const MOTOR_COLLISION = cov('COV-MOTOR-06', 'ความเสียหายต่อรถจากการชนกับยานพาหนะทางบก', 'Own damage — collision with land vehicle only', '100000.00');
const MOTOR_BAIL = cov('COV-MOTOR-07', 'การประกันตัวผู้ขับขี่', 'Bail bond', '200000.00');

/** Coverages for products added after MOTOR-001 / FIRE-001 / PROPERTY-001, keyed by product code. */
export const PRODUCT_COVERAGES: Record<string, CoverageSeed[]> = {
  'MOTOR-002': [MOTOR_COLLISION, MOTOR_THEFT_FIRE, MOTOR_TPL, MOTOR_PA, MOTOR_MED, MOTOR_BAIL],
  'MOTOR-003': [MOTOR_THEFT_FIRE, MOTOR_TPL, MOTOR_PA, MOTOR_MED, MOTOR_BAIL],
  'MOTOR-004': [MOTOR_COLLISION, MOTOR_TPL, MOTOR_PA, MOTOR_MED, MOTOR_BAIL],
  'MOTOR-005': [MOTOR_TPL, MOTOR_PA, MOTOR_MED, MOTOR_BAIL],
  'MOTOR-006': [
    cov('COV-CMI-01', 'ค่าเสียหายเบื้องต้น (ค่ารักษาพยาบาล)', 'CMI initial medical expenses', '30000.00'),
    cov('COV-CMI-02', 'ค่ารักษาพยาบาล', 'CMI medical expenses', '80000.00'),
    cov('COV-CMI-03', 'เสียชีวิต/ทุพพลภาพถาวร', 'CMI death / permanent disability', '500000.00'),
  ],

  'PROPERTY-002': [
    cov('COV-IAR-01', 'ความเสียหายต่อทรัพย์สิน (All Risks)', 'Material damage — all risks', '50000000.00'),
    cov('COV-IAR-02', 'ธุรกิจหยุดชะงัก', 'Business interruption', '10000000.00'),
    cov('COV-IAR-03', 'เครื่องจักรขัดข้อง', 'Machinery breakdown', '5000000.00'),
  ],
  'PROPERTY-003': [
    cov('COV-BURG-01', 'ทรัพย์สินสูญหายจากการโจรกรรม', 'Loss from burglary', '1000000.00'),
    cov('COV-BURG-02', 'ความเสียหายต่ออาคารจากการโจรกรรม', 'Building damage from break-in', '200000.00'),
  ],
  'PROPERTY-004': [
    cov('COV-GLASS-01', 'กระจกแตก', 'Glass breakage', '300000.00'),
    cov('COV-GLASS-02', 'ค่าติดตั้งชั่วคราว', 'Temporary boarding-up', '30000.00'),
  ],
  'PROPERTY-005': [
    cov('COV-MONEY-01', 'เงินในตู้นิรภัย', 'Money in safe', '500000.00'),
    cov('COV-MONEY-02', 'เงินระหว่างขนส่ง', 'Money in transit', '500000.00'),
  ],

  'FIRE-002': [
    cov('COV-PROP-01', 'อัคคีภัย', 'Fire', '10000000.00'),
    cov('COV-FIRE-04', 'ภัยลมพายุ', 'Windstorm', '10000000.00'),
    cov('COV-FIRE-05', 'ภัยจากน้ำ (ไม่รวมน้ำท่วม)', 'Water damage (excluding flood)', '1000000.00'),
    cov('COV-PROP-03', 'ภัยระเบิด', 'Explosion', '10000000.00'),
  ],
  'FIRE-003': [
    cov('COV-PROP-01', 'อัคคีภัย', 'Fire', '50000000.00'),
    cov('COV-PROP-03', 'ภัยระเบิด', 'Explosion', '50000000.00'),
    cov('COV-FIRE-06', 'ภัยจลาจลและนัดหยุดงาน', 'Riot & strike', '50000000.00'),
  ],
  'FIRE-004': [
    cov('COV-PROP-02', 'ภัยน้ำท่วม', 'Flood', '5000000.00'),
    cov('COV-FIRE-04', 'ภัยลมพายุ', 'Windstorm', '5000000.00'),
    cov('COV-FIRE-07', 'ภัยแผ่นดินไหว', 'Earthquake', '5000000.00'),
    cov('COV-FIRE-08', 'ภัยลูกเห็บ', 'Hail', '5000000.00'),
  ],

  'MARINE-001': [
    cov('COV-CARGO-01', 'ความเสียหายต่อสินค้า (ICC A)', 'All risks — Institute Cargo Clauses (A)', '5000000.00'),
    cov('COV-CARGO-02', 'ภัยสงครามและการนัดหยุดงาน', 'War & strikes', '5000000.00'),
  ],
  'MARINE-002': [
    cov('COV-INLAND-01', 'สินค้าเสียหายระหว่างขนส่ง', 'Goods damaged in transit', '2000000.00'),
    cov('COV-INLAND-02', 'สินค้าสูญหายจากการโจรกรรม', 'Theft of goods in transit', '2000000.00'),
  ],
  'MARINE-003': [
    cov('COV-HULL-01', 'ความเสียหายต่อตัวเรือและเครื่องจักร', 'Hull & machinery', '20000000.00'),
    cov('COV-HULL-02', 'ความรับผิดจากการชน', 'Collision liability', '20000000.00'),
  ],
  'MARINE-004': [
    cov('COV-CARRIER-01', 'ความรับผิดต่อสินค้าของผู้ว่าจ้าง', "Carrier's liability for cargo", '5000000.00'),
  ],

  'ENGINEERING-001': [
    cov('COV-CAR-01', 'ความเสียหายต่องานก่อสร้าง', 'Contract works', '100000000.00'),
    cov('COV-CAR-02', 'ความรับผิดต่อบุคคลภายนอก', 'Third-party liability', '10000000.00'),
  ],
  'ENGINEERING-002': [
    cov('COV-EAR-01', 'ความเสียหายต่องานติดตั้ง', 'Erection works', '50000000.00'),
    cov('COV-EAR-02', 'ความรับผิดต่อบุคคลภายนอก', 'Third-party liability', '10000000.00'),
  ],
  'ENGINEERING-003': [
    cov('COV-MB-01', 'เครื่องจักรขัดข้อง/เสียหายอย่างฉับพลัน', 'Sudden machinery breakdown', '10000000.00'),
  ],
  'ENGINEERING-004': [
    cov('COV-EEI-01', 'ความเสียหายต่ออุปกรณ์อิเล็กทรอนิกส์', 'Material damage to electronic equipment', '2000000.00'),
    cov('COV-EEI-02', 'การกู้คืนข้อมูล', 'Data media reinstatement', '200000.00'),
  ],
  'ENGINEERING-005': [
    cov('COV-CPE-01', 'ความเสียหายต่อเครื่องจักรผู้รับเหมา', "Contractors' plant & equipment damage", '10000000.00'),
  ],

  'LIABILITY-001': [
    cov('COV-PL-01', 'ความบาดเจ็บ/เสียชีวิตของบุคคลภายนอก', 'Third-party bodily injury', '10000000.00'),
    cov('COV-PL-02', 'ความเสียหายต่อทรัพย์สินของบุคคลภายนอก', 'Third-party property damage', '10000000.00'),
  ],
  'LIABILITY-002': [
    cov('COV-PRL-01', 'ความรับผิดจากความบกพร่องของผลิตภัณฑ์', 'Product defect liability', '20000000.00'),
    cov('COV-PRL-02', 'ค่าใช้จ่ายเรียกคืนสินค้า', 'Product recall expenses', '5000000.00'),
  ],
  'LIABILITY-003': [
    cov('COV-PI-01', 'ความรับผิดจากความผิดพลาดทางวิชาชีพ', 'Professional negligence', '10000000.00'),
    cov('COV-PI-02', 'ค่าใช้จ่ายในการต่อสู้คดี', 'Defence costs', '2000000.00'),
  ],
  'LIABILITY-004': [
    cov('COV-EL-01', 'ความรับผิดต่อการบาดเจ็บของลูกจ้าง', 'Employee bodily injury liability', '10000000.00'),
  ],

  'PA-001': [
    cov('COV-PA-01', 'เสียชีวิต/สูญเสียอวัยวะ/ทุพพลภาพถาวรสิ้นเชิง', 'Death / dismemberment / total permanent disability', '1000000.00'),
    cov('COV-PA-02', 'ค่ารักษาพยาบาลจากอุบัติเหตุ', 'Accidental medical expenses', '50000.00'),
    cov('COV-PA-03', 'ค่าชดเชยรายวันกรณีนอนโรงพยาบาล', 'Daily hospital income', '1000.00'),
  ],
  'PA-002': [
    cov('COV-PA-01', 'เสียชีวิต/สูญเสียอวัยวะ/ทุพพลภาพถาวรสิ้นเชิง', 'Death / dismemberment / total permanent disability', '500000.00'),
    cov('COV-PA-02', 'ค่ารักษาพยาบาลจากอุบัติเหตุ', 'Accidental medical expenses', '30000.00'),
  ],
  'PA-003': [
    cov('COV-PA-01', 'เสียชีวิต/สูญเสียอวัยวะ/ทุพพลภาพถาวรสิ้นเชิง', 'Death / dismemberment / total permanent disability', '100000.00'),
    cov('COV-PA-02', 'ค่ารักษาพยาบาลจากอุบัติเหตุ', 'Accidental medical expenses', '20000.00'),
  ],

  'TRAVEL-001': [
    cov('COV-TRV-01', 'ค่ารักษาพยาบาลในต่างประเทศ', 'Overseas medical expenses', '2000000.00'),
    cov('COV-TRV-02', 'การเคลื่อนย้ายเพื่อการรักษา/ส่งศพกลับประเทศ', 'Emergency evacuation & repatriation', '2000000.00'),
    cov('COV-TRV-03', 'การยกเลิก/ล่าช้าของการเดินทาง', 'Trip cancellation / delay', '100000.00'),
    cov('COV-TRV-04', 'กระเป๋าเดินทางสูญหาย/เสียหาย', 'Baggage loss / damage', '30000.00'),
  ],
  'TRAVEL-002': [
    cov('COV-TRV-01', 'ค่ารักษาพยาบาลในต่างประเทศ', 'Overseas medical expenses', '3000000.00'),
    cov('COV-TRV-02', 'การเคลื่อนย้ายเพื่อการรักษา/ส่งศพกลับประเทศ', 'Emergency evacuation & repatriation', '3000000.00'),
    cov('COV-TRV-03', 'การยกเลิก/ล่าช้าของการเดินทาง', 'Trip cancellation / delay', '100000.00'),
    cov('COV-TRV-04', 'กระเป๋าเดินทางสูญหาย/เสียหาย', 'Baggage loss / damage', '30000.00'),
  ],
  'TRAVEL-003': [
    cov('COV-TRV-05', 'อุบัติเหตุระหว่างการเดินทาง', 'Accidental death & disability', '500000.00'),
    cov('COV-TRV-06', 'ค่ารักษาพยาบาลจากอุบัติเหตุ', 'Accidental medical expenses', '50000.00'),
  ],
  'TRAVEL-004': [
    cov('COV-TRV-07', 'ค่ารักษาพยาบาลในประเทศไทย', 'Medical expenses in Thailand', '3000000.00'),
    cov('COV-TRV-05', 'อุบัติเหตุระหว่างการเดินทาง', 'Accidental death & disability', '1000000.00'),
  ],

  'CYBER-001': [
    cov('COV-CYB-01', 'ความรับผิดจากข้อมูลรั่วไหล', 'Data breach & privacy liability', '10000000.00'),
    cov('COV-CYB-02', 'ค่าใช้จ่ายรับมือเหตุการณ์ (Incident response)', 'Incident response costs', '2000000.00'),
    cov('COV-CYB-03', 'ธุรกิจหยุดชะงักจากภัยไซเบอร์', 'Cyber business interruption', '5000000.00'),
    cov('COV-CYB-04', 'การเรียกค่าไถ่ทางไซเบอร์ (Ransomware)', 'Cyber extortion', '2000000.00'),
  ],
  'CYBER-002': [
    cov('COV-CYB-05', 'ความเสียหายจากการถูกหลอกลวงออนไลน์', 'Online fraud loss', '100000.00'),
    cov('COV-CYB-06', 'การถูกขโมยข้อมูลส่วนตัว', 'Identity theft expenses', '50000.00'),
  ],

  'D_AND_O-001': [
    cov('COV-DO-01', 'ความรับผิดส่วนบุคคลของกรรมการ (Side A)', 'Directors personal liability — Side A', '50000000.00'),
    cov('COV-DO-02', 'การชดใช้แก่บริษัท (Side B)', 'Company reimbursement — Side B', '50000000.00'),
    cov('COV-DO-03', 'ค่าใช้จ่ายในการต่อสู้คดี', 'Defence costs', '10000000.00'),
  ],

  'OTHER-001': [
    cov('COV-FID-01', 'ความเสียหายจากการทุจริตของลูกจ้าง', 'Employee dishonesty loss', '1000000.00'),
  ],
  'OTHER-002': [
    cov('COV-HLT-01', 'ค่ารักษาพยาบาลผู้ป่วยใน', 'In-patient benefits', '1000000.00'),
    cov('COV-HLT-02', 'ค่ารักษาพยาบาลผู้ป่วยนอก', 'Out-patient benefits', '30000.00'),
  ],
  'OTHER-003': [
    cov('COV-PET-01', 'ค่ารักษาพยาบาลสัตว์เลี้ยง', 'Veterinary expenses', '30000.00'),
    cov('COV-PET-02', 'ความรับผิดต่อบุคคลภายนอกจากสัตว์เลี้ยง', 'Third-party liability caused by pet', '100000.00'),
  ],
};

export const MOTOR_DOCUMENT_CHECKLIST = [
  { documentType: 'ID_CARD', isRequired: true, sortOrder: 1 },
  { documentType: 'VEHICLE_BOOK', isRequired: true, sortOrder: 2 },
  { documentType: 'PREVIOUS_POLICY', isRequired: false, sortOrder: 3 },
  { documentType: 'VEHICLE_PHOTO', isRequired: true, sortOrder: 4 },
] as const;

export const PROPERTY_DOCUMENT_CHECKLIST = [
  { documentType: 'ID_CARD', isRequired: true, sortOrder: 1 },
  { documentType: 'COMPANY_REGISTRATION', isRequired: false, sortOrder: 2 },
  { documentType: 'RISK_SURVEY', isRequired: false, sortOrder: 3 },
  { documentType: 'PREVIOUS_POLICY', isRequired: false, sortOrder: 4 },
] as const;

type ChecklistSeed = { documentType: string; isRequired: boolean; sortOrder: number };
type DocSpec = [documentType: string, isRequired: boolean];
const docs = (...specs: DocSpec[]): ChecklistSeed[] =>
  specs.map(([documentType, isRequired], i) => ({ documentType, isRequired, sortOrder: i + 1 }));

/** Corporate customer: company documents are mandatory, risk survey / prior policy optional. */
const CORPORATE_DOCS = docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['RISK_SURVEY', false], ['PREVIOUS_POLICY', false]);
/** Corporate customer where an underwriting survey is part of the submission. */
const CORPORATE_SURVEY_DOCS = docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['RISK_SURVEY', true], ['PREVIOUS_POLICY', false]);
/** Individual customer: ID card / passport only. */
const PERSONAL_DOCS = docs(['ID_CARD', true]);

/** Document checklist per product code (Job › เอกสาร; enforced on submit/bind via requireDocsOn*). */
export const PRODUCT_DOCUMENT_CHECKLISTS: Record<string, readonly ChecklistSeed[]> = {
  'MOTOR-001': MOTOR_DOCUMENT_CHECKLIST,
  'MOTOR-002': MOTOR_DOCUMENT_CHECKLIST,
  'MOTOR-003': MOTOR_DOCUMENT_CHECKLIST,
  'MOTOR-004': docs(['ID_CARD', true], ['VEHICLE_BOOK', true], ['PREVIOUS_POLICY', false], ['VEHICLE_PHOTO', false]),
  'MOTOR-005': docs(['ID_CARD', true], ['VEHICLE_BOOK', true], ['PREVIOUS_POLICY', false]),
  'MOTOR-006': docs(['ID_CARD', true], ['VEHICLE_BOOK', true]),

  'FIRE-001': PROPERTY_DOCUMENT_CHECKLIST,
  'FIRE-002': CORPORATE_DOCS,
  'FIRE-003': CORPORATE_SURVEY_DOCS,
  'FIRE-004': PROPERTY_DOCUMENT_CHECKLIST,
  'PROPERTY-001': PROPERTY_DOCUMENT_CHECKLIST,
  'PROPERTY-002': CORPORATE_SURVEY_DOCS,
  'PROPERTY-003': CORPORATE_DOCS,
  'PROPERTY-004': CORPORATE_DOCS,
  'PROPERTY-005': CORPORATE_DOCS,

  'MARINE-001': docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['INVOICE', true], ['PREVIOUS_POLICY', false]),
  'MARINE-002': CORPORATE_DOCS,
  'MARINE-003': docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['RISK_SURVEY', true], ['PREVIOUS_POLICY', false]),
  'MARINE-004': CORPORATE_DOCS,

  'ENGINEERING-001': docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['OTHER', true], ['RISK_SURVEY', false]),
  'ENGINEERING-002': docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['OTHER', true], ['RISK_SURVEY', false]),
  'ENGINEERING-003': CORPORATE_SURVEY_DOCS,
  'ENGINEERING-004': CORPORATE_DOCS,
  'ENGINEERING-005': CORPORATE_DOCS,

  'LIABILITY-001': CORPORATE_DOCS,
  'LIABILITY-002': CORPORATE_DOCS,
  'LIABILITY-003': docs(['ID_CARD', true], ['OTHER', true], ['PREVIOUS_POLICY', false]),
  'LIABILITY-004': CORPORATE_DOCS,

  'PA-001': PERSONAL_DOCS,
  'PA-002': docs(['COMPANY_REGISTRATION', true], ['OTHER', true]),
  'PA-003': docs(['OTHER', true]),

  'TRAVEL-001': PERSONAL_DOCS,
  'TRAVEL-002': PERSONAL_DOCS,
  'TRAVEL-003': PERSONAL_DOCS,
  'TRAVEL-004': PERSONAL_DOCS,

  'CYBER-001': CORPORATE_SURVEY_DOCS,
  'CYBER-002': PERSONAL_DOCS,

  'D_AND_O-001': docs(['COMPANY_REGISTRATION', true], ['TAX_DOCUMENT', true], ['OTHER', true], ['PREVIOUS_POLICY', false]),

  'OTHER-001': CORPORATE_DOCS,
  'OTHER-002': PERSONAL_DOCS,
  'OTHER-003': docs(['ID_CARD', true], ['OTHER', false]),
};

export const SAMPLE_COMPANIES = [
  { code: 'INS-TH001', name: 'บริษัท ไทยประกันภัย จำกัด (ตัวอย่าง)', phone: '02-000-0001', email: 'contact@ins-th001.example.com' },
  { code: 'INS-TH002', name: 'บริษัท เอเชียประกันภัย จำกัด (ตัวอย่าง)', phone: '02-000-0002', email: 'contact@ins-th002.example.com' },
  { code: 'INS-TH003', name: 'บริษัท สยามประกันภัย จำกัด (ตัวอย่าง)', phone: '02-000-0003', email: 'contact@ins-th003.example.com' },
] as const;

/** spec §16.2 example rules */
export const APPROVAL_RULES = [
  {
    name: 'เบี้ยประกันต่ำกว่า 100,000 บาท — ขออนุมัติ Supervisor',
    conditionField: 'PREMIUM',
    conditionOperator: 'LT',
    thresholdValue: '100000.00',
    approverRole: 'SUPERVISOR',
    sortOrder: 1,
  },
  {
    name: 'เบี้ยประกัน 100,000 บาทขึ้นไป — ขออนุมัติ Manager',
    conditionField: 'PREMIUM',
    conditionOperator: 'GTE',
    thresholdValue: '100000.00',
    approverRole: 'MANAGER',
    sortOrder: 2,
  },
  {
    name: 'ส่วนลดเกิน 10% — ขออนุมัติ Manager',
    conditionField: 'DISCOUNT',
    conditionOperator: 'GT',
    thresholdValue: '10.00',
    approverRole: 'MANAGER',
    sortOrder: 3,
  },
] as const;
