import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Decimal } from 'decimal.js';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  findDefinition,
  validatePercent,
  type CommissionSettings,
} from './domain/settings.js';

export interface SettingResponse {
  key: string;
  value: string;
  description: string;
  isDefault: boolean;
  updatedAt: string | null;
}

@Injectable()
export class SystemSettingService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(): Promise<SettingResponse[]> {
    const rows = await this.txHost.tx.systemSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SETTING_DEFINITIONS.map((def) => {
      const row = byKey.get(def.key);
      return {
        key: def.key,
        value: row?.value ?? def.defaultValue,
        description: def.description,
        isDefault: !row,
        updatedAt: row ? row.updatedAt.toISOString() : null,
      };
    });
  }

  /** Values currently in force; a missing row falls back to the documented default. */
  async getCommissionSettings(): Promise<CommissionSettings> {
    const all = new Map((await this.list()).map((s) => [s.key, s.value]));
    return {
      whtPct: all.get(SETTING_KEYS.WHT_RATE)!,
      defaultAgentSharePct: all.get(SETTING_KEYS.DEFAULT_AGENT_SHARE)!,
      overridePct: all.get(SETTING_KEYS.OVERRIDE_RATE)!,
    };
  }

  @Transactional()
  async update(key: string, value: string): Promise<SettingResponse> {
    const def = findDefinition(key);
    if (!def) throw new BusinessException('SETTING_NOT_FOUND', `Unknown setting "${key}"`, 404);

    const problem = validatePercent(value);
    if (problem) throw new BusinessException('SETTING_INVALID_VALUE', `${key} ${problem}`, 422);

    // A policy's agent share + override must always fit inside its gross commission
    const current = await this.getCommissionSettings();
    const agent = key === SETTING_KEYS.DEFAULT_AGENT_SHARE ? value : current.defaultAgentSharePct;
    const override = key === SETTING_KEYS.OVERRIDE_RATE ? value : current.overridePct;
    if (new Decimal(agent).plus(override).greaterThan(100)) {
      throw new BusinessException(
        'SETTING_SHARES_EXCEED_100',
        'Default agent share + override rate cannot exceed 100%',
        422,
      );
    }

    const userId = this.cls.get('userId');
    const before = await this.txHost.tx.systemSetting.findUnique({ where: { key } });
    const saved = await this.txHost.tx.systemSetting.upsert({
      where: { key },
      create: { key, value, description: def.description, updatedById: userId },
      update: { value, updatedById: userId },
    });

    await this.audit.log({
      action: 'UPDATE_SYSTEM_SETTING',
      entityType: 'SYSTEM_SETTING',
      entityId: key,
      before: { value: before?.value ?? def.defaultValue },
      after: { value: saved.value },
    });

    return { key, value: saved.value, description: def.description, isDefault: false, updatedAt: saved.updatedAt.toISOString() };
  }
}
