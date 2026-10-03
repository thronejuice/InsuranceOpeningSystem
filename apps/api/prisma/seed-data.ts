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
  ],
  SUPERVISOR: [
    ...VIEW,
    'customer.create', 'customer.update', 'customer.delete', 'customer.view_sensitive',
    'job.view_all', 'job.create', 'job.update', 'job.update_all', 'job.submit', 'job.assign', 'job.cancel',
    'quotation.select',
    'approval.manage',
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
] as const;

/** Risk fields ordered by sortOrder — spec §10.2 (Motor) */
export const MOTOR_RISK_FIELDS = [
  { fieldCode: 'brand', fieldName: 'ยี่ห้อรถ', fieldType: 'TEXT', isRequired: true, sortOrder: 1 },
  { fieldCode: 'model', fieldName: 'รุ่นรถ', fieldType: 'TEXT', isRequired: true, sortOrder: 2 },
  { fieldCode: 'year', fieldName: 'ปีรถ', fieldType: 'NUMBER', isRequired: true, sortOrder: 3 },
  { fieldCode: 'license_plate', fieldName: 'ทะเบียนรถ', fieldType: 'TEXT', isRequired: true, sortOrder: 4 },
  { fieldCode: 'engine_no', fieldName: 'เลขเครื่องยนต์', fieldType: 'TEXT', isRequired: false, sortOrder: 5 },
  { fieldCode: 'chassis_no', fieldName: 'เลขตัวถัง', fieldType: 'TEXT', isRequired: false, sortOrder: 6 },
  { fieldCode: 'vehicle_type', fieldName: 'ประเภทรถ', fieldType: 'SELECT', isRequired: true, sortOrder: 7 },
  { fieldCode: 'usage_type', fieldName: 'ประเภทการใช้งาน', fieldType: 'SELECT', isRequired: true, sortOrder: 8 },
  { fieldCode: 'sum_insured', fieldName: 'ทุนประกันภัย', fieldType: 'NUMBER', isRequired: true, sortOrder: 9 },
] as const;

/** Risk fields ordered by sortOrder — spec §10.3 (Property) */
export const PROPERTY_RISK_FIELDS = [
  { fieldCode: 'building_type', fieldName: 'ประเภทอาคาร', fieldType: 'SELECT', isRequired: true, sortOrder: 1 },
  { fieldCode: 'construction_type', fieldName: 'ประเภทการก่อสร้าง', fieldType: 'SELECT', isRequired: true, sortOrder: 2 },
  { fieldCode: 'location', fieldName: 'สถานที่ตั้ง', fieldType: 'TEXT', isRequired: true, sortOrder: 3 },
  { fieldCode: 'occupancy', fieldName: 'การใช้งาน', fieldType: 'TEXT', isRequired: true, sortOrder: 4 },
  { fieldCode: 'building_value', fieldName: 'มูลค่าอาคาร', fieldType: 'NUMBER', isRequired: true, sortOrder: 5 },
  { fieldCode: 'content_value', fieldName: 'มูลค่าสิ่งของภายใน', fieldType: 'NUMBER', isRequired: false, sortOrder: 6 },
  { fieldCode: 'stock_value', fieldName: 'มูลค่าสินค้าคงคลัง', fieldType: 'NUMBER', isRequired: false, sortOrder: 7 },
  { fieldCode: 'machinery_value', fieldName: 'มูลค่าเครื่องจักร', fieldType: 'NUMBER', isRequired: false, sortOrder: 8 },
] as const;

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
