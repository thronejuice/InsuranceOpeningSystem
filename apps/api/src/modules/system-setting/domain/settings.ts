import { Decimal } from 'decimal.js';

/** Percent settings stored as decimal strings ("3", "12.5"). */
export const SETTING_KEYS = {
  WHT_RATE: 'commission.wht_rate',
  DEFAULT_AGENT_SHARE: 'commission.default_agent_share_pct',
  OVERRIDE_RATE: 'commission.override_rate',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export interface SettingDefinition {
  key: SettingKey;
  defaultValue: string;
  description: string;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: SETTING_KEYS.WHT_RATE, defaultValue: '3', description: 'ภาษีหัก ณ ที่จ่ายของค่าคอมมิชชั่น (%) — หักจากยอดที่จ่ายให้ agent/manager (OQ-5)' },
  { key: SETTING_KEYS.DEFAULT_AGENT_SHARE, defaultValue: '50', description: 'ส่วนแบ่งของ Agent จาก Gross Commission (%) เมื่อ Agent ไม่ได้ตั้งค่าเอง (OQ-6)' },
  { key: SETTING_KEYS.OVERRIDE_RATE, defaultValue: '0', description: 'Override ให้ manager โดยตรงของ Agent (% ของ Gross Commission) — 0 = ไม่คิด' },
];

export function findDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((d) => d.key === key);
}

const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

/** A percentage between 0 and 100 with at most 2 decimal places; returns null when valid, otherwise why not. */
export function validatePercent(value: string): string | null {
  if (!PERCENT_RE.test(value)) return 'must be a number with at most 2 decimal places';
  if (new Decimal(value).greaterThan(100)) return 'must be between 0 and 100';
  return null;
}

export interface CommissionSettings {
  whtPct: string;
  defaultAgentSharePct: string;
  overridePct: string;
}
