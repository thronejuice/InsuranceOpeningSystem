import { hash } from 'argon2';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { SETTING_DEFINITIONS } from '../src/modules/system-setting/domain/settings.js';
import {
  APPROVAL_RULES,
  INSURANCE_PRODUCTS,
  INSURANCE_TYPES,
  MOTOR_COVERAGES,
  PRODUCT_COVERAGES,
  PRODUCT_DOCUMENT_CHECKLISTS,
  PRODUCT_RISK_FIELDS,
  PERMISSIONS,
  PROPERTY_COVERAGES,
  ROLE_PERMISSIONS,
  ROLE_DATA_SCOPE,
  ROLES,
  SAMPLE_BRANCHES,
  SAMPLE_COMMISSION_RATES,
  SAMPLE_COMPANIES,
  SAMPLE_PAYMENT_TERMS,
  SAMPLE_USERS,
  type RoleCode,
} from './seed-data.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const password = process.env.SEED_USER_PASSWORD ?? 'Password@123';
const prisma = new PrismaClient();

/** Idempotent: safe to re-run, keeps role → permission links in sync with seed-data.ts */
async function main() {
  // ─── Branches ──────────────────────────────────────────────────────────
  for (const b of SAMPLE_BRANCHES) {
    await prisma.branch.upsert({
      where: { code: b.code },
      update: { name: b.name, address: b.address },
      create: { code: b.code, name: b.name, address: b.address },
    });
  }
  const branchIds = new Map((await prisma.branch.findMany()).map((b) => [b.code, b.id]));

  // ─── Auth ──────────────────────────────────────────────────────────────
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
  }
  const permissionIds = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  for (const [code, name] of Object.entries(ROLES)) {
    const dataScope = ROLE_DATA_SCOPE[code as RoleCode] ?? 'OWN';
    const role = await prisma.role.upsert({
      where: { code },
      update: { name, dataScope },
      create: { code, name, dataScope },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: [...new Set(ROLE_PERMISSIONS[code as RoleCode])].map((permission) => ({
        roleId: role.id,
        permissionId: permissionIds.get(permission)!,
      })),
    });
  }
  const roleIds = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));

  const passwordHash = await hash(password);
  const userMap = new Map<string, string>();
  for (const sample of SAMPLE_USERS) {
    const branchId = sample.branchCode ? branchIds.get(sample.branchCode) : undefined;
    const user = await prisma.user.upsert({
      where: { username: sample.username },
      update: { branchId },
      create: {
        username: sample.username,
        email: `${sample.username}@example.com`,
        fullName: sample.fullName,
        passwordHash,
        branchId,
      },
    });
    userMap.set(sample.username, user.id);
    const roleId = roleIds.get(sample.role)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }

  // Link managerId
  for (const sample of SAMPLE_USERS) {
    if (sample.managerUsername && userMap.has(sample.managerUsername)) {
      const userId = userMap.get(sample.username)!;
      const managerId = userMap.get(sample.managerUsername)!;
      await prisma.user.update({
        where: { id: userId },
        data: { managerId },
      });
    }
  }

  // ─── Insurance Types ───────────────────────────────────────────────────
  for (const t of INSURANCE_TYPES) {
    await prisma.insuranceType.upsert({
      where: { code: t.code },
      update: { name: t.name, description: t.description },
      create: { code: t.code, name: t.name, description: t.description },
    });
  }
  const typeMap = new Map((await prisma.insuranceType.findMany()).map((t) => [t.code, t.id]));

  // ─── Insurance Products ────────────────────────────────────────────────
  for (const p of INSURANCE_PRODUCTS) {
    await prisma.insuranceProduct.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description, requireDocsOnSubmit: p.requireDocsOnSubmit, requireDocsOnBind: p.requireDocsOnBind },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        requireDocsOnSubmit: p.requireDocsOnSubmit,
        requireDocsOnBind: p.requireDocsOnBind,
        insuranceTypeId: typeMap.get(p.typeCode)!,
      },
    });
  }
  const productMap = new Map((await prisma.insuranceProduct.findMany()).map((p) => [p.code, p.id]));

  // ─── Risk Fields ───────────────────────────────────────────────────────
  for (const [productCode, defs] of Object.entries(PRODUCT_RISK_FIELDS)) {
    const productId = productMap.get(productCode)!;
    for (const f of defs) {
      const data = { fieldName: f.fieldName, fieldType: f.fieldType, isRequired: f.isRequired, validationRule: f.validationRule, sortOrder: f.sortOrder };
      await prisma.riskFieldDefinition.upsert({
        where: { productId_fieldCode: { productId, fieldCode: f.fieldCode } },
        update: data,
        create: { productId, fieldCode: f.fieldCode, ...data },
      });
    }
  }

  // ─── Coverages ─────────────────────────────────────────────────────────
  for (const c of MOTOR_COVERAGES) {
    const productId = productMap.get('MOTOR-001')!;
    await prisma.insuranceCoverage.upsert({
      where: { productId_code: { productId, code: c.code } },
      update: { name: c.name, description: c.description, defaultSumInsured: c.defaultSumInsured },
      create: { productId, code: c.code, name: c.name, description: c.description, defaultSumInsured: c.defaultSumInsured },
    });
  }
  for (const c of PROPERTY_COVERAGES) {
    for (const productCode of ['FIRE-001', 'PROPERTY-001'] as const) {
      const productId = productMap.get(productCode)!;
      await prisma.insuranceCoverage.upsert({
        where: { productId_code: { productId, code: c.code } },
        update: { name: c.name, description: c.description, defaultSumInsured: c.defaultSumInsured },
        create: { productId, code: c.code, name: c.name, description: c.description, defaultSumInsured: c.defaultSumInsured },
      });
    }
  }

  for (const [productCode, coverages] of Object.entries(PRODUCT_COVERAGES)) {
    const productId = productMap.get(productCode)!;
    for (const c of coverages) {
      await prisma.insuranceCoverage.upsert({
        where: { productId_code: { productId, code: c.code } },
        update: { name: c.name, description: c.description, defaultSumInsured: c.defaultSumInsured },
        create: { productId, code: c.code, name: c.name, description: c.description, defaultSumInsured: c.defaultSumInsured },
      });
    }
  }

  // ─── Document Checklists ───────────────────────────────────────────────
  for (const [productCode, checklist] of Object.entries(PRODUCT_DOCUMENT_CHECKLISTS)) {
    const productId = productMap.get(productCode)!;
    for (const d of checklist) {
      await prisma.documentChecklist.upsert({
        where: { productId_documentType: { productId, documentType: d.documentType as never } },
        update: { isRequired: d.isRequired, sortOrder: d.sortOrder },
        create: { productId, documentType: d.documentType as never, isRequired: d.isRequired, sortOrder: d.sortOrder },
      });
    }
  }

  // ─── Sample Insurance Companies ────────────────────────────────────────
  for (const co of SAMPLE_COMPANIES) {
    await prisma.insuranceCompany.upsert({
      where: { code: co.code },
      update: { name: co.name, phone: co.phone, email: co.email },
      create: { code: co.code, name: co.name, phone: co.phone, email: co.email },
    });
  }
  const companyMap = new Map((await prisma.insuranceCompany.findMany()).map((c) => [c.code, c.id]));

  // ─── Commission Rates ──────────────────────────────────────────────────
  for (const cr of SAMPLE_COMMISSION_RATES) {
    const insuranceCompanyId = companyMap.get(cr.companyCode);
    const productId = productMap.get(cr.productCode);
    if (insuranceCompanyId && productId) {
      const existing = await prisma.commissionRate.findFirst({
        where: {
          insuranceCompanyId,
          productId,
          effectiveFrom: new Date(cr.effectiveFrom),
        },
      });
      if (existing) {
        await prisma.commissionRate.update({
          where: { id: existing.id },
          data: { rate: cr.rate },
        });
      } else {
        await prisma.commissionRate.create({
          data: {
            insuranceCompanyId,
            productId,
            rate: cr.rate,
            effectiveFrom: new Date(cr.effectiveFrom),
          },
        });
      }
    }
  }

  // ─── Payment Terms (Phase 2 Day 13 / OQ-2) ─────────────────────────────
  for (const pt of SAMPLE_PAYMENT_TERMS) {
    await prisma.paymentTerm.upsert({
      where: { code: pt.code },
      update: {
        name: pt.name,
        description: pt.description,
        installments: pt.installments,
        intervalMonths: pt.intervalMonths,
        firstDueDays: pt.firstDueDays,
        active: pt.active,
      },
      create: {
        code: pt.code,
        name: pt.name,
        description: pt.description,
        installments: pt.installments,
        intervalMonths: pt.intervalMonths,
        firstDueDays: pt.firstDueDays,
        active: pt.active,
      },
    });
  }

  // ─── System Settings (Phase 4 D26) — defaults only; a re-seed never overwrites an admin's value ───
  for (const def of SETTING_DEFINITIONS) {
    await prisma.systemSetting.upsert({
      where: { key: def.key },
      update: { description: def.description },
      create: { key: def.key, value: def.defaultValue, description: def.description },
    });
  }

  // ─── Approval Rules ────────────────────────────────────────────────────
  for (const rule of APPROVAL_RULES) {
    const existing = await prisma.approvalRule.findFirst({ where: { name: rule.name } });
    if (!existing) {
      await prisma.approvalRule.create({
        data: {
          name: rule.name,
          conditionField: rule.conditionField as never,
          conditionOperator: rule.conditionOperator as never,
          thresholdValue: rule.thresholdValue,
          approverRole: rule.approverRole as never,
          sortOrder: rule.sortOrder,
        },
      });
    }
  }

  console.log(
    `Seeded ${Object.keys(PERMISSIONS).length} permissions, ${Object.keys(ROLES).length} roles, ${SAMPLE_USERS.length} users,`,
    `${INSURANCE_TYPES.length} insurance types, ${INSURANCE_PRODUCTS.length} products,`,
    `${SAMPLE_COMPANIES.length} companies, ${SAMPLE_COMMISSION_RATES.length} commission rates, ${SAMPLE_PAYMENT_TERMS.length} payment terms, ${APPROVAL_RULES.length} approval rules`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
