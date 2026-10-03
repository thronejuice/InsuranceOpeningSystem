export interface RiskFieldDef {
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  validationRule: string | null;
}

export interface RiskValidationError {
  field: string;
  message: string;
}

interface ValidationRule {
  min?: number | string;
  max?: number | string;
  regex?: string;
  options?: string[];
}

function parseRule(raw: string | null): ValidationRule {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ValidationRule;
  } catch {
    return {};
  }
}

export function validateRiskValues(
  fieldDefs: RiskFieldDef[],
  values: Record<string, string | null | undefined>,
): RiskValidationError[] {
  const errors: RiskValidationError[] = [];

  for (const def of fieldDefs) {
    const raw = values[def.fieldCode];
    const isEmpty = raw === null || raw === undefined || raw === '';

    if (def.isRequired && isEmpty) {
      errors.push({ field: def.fieldCode, message: `${def.fieldName} is required` });
      continue;
    }

    if (isEmpty) continue;

    const value = raw as string;
    const rule = parseRule(def.validationRule);

    switch (def.fieldType) {
      case 'NUMBER': {
        const num = Number(value);
        if (Number.isNaN(num)) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be a number` });
          break;
        }
        if (rule.min !== undefined && num < Number(rule.min)) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be >= ${rule.min}` });
        }
        if (rule.max !== undefined && num > Number(rule.max)) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be <= ${rule.max}` });
        }
        break;
      }

      case 'DATE': {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be a valid date (YYYY-MM-DD)` });
          break;
        }
        if (rule.min !== undefined && value < String(rule.min)) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be on or after ${rule.min}` });
        }
        if (rule.max !== undefined && value > String(rule.max)) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be on or before ${rule.max}` });
        }
        break;
      }

      case 'BOOLEAN': {
        if (value !== 'true' && value !== 'false') {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be "true" or "false"` });
        }
        break;
      }

      case 'SELECT': {
        const opts = rule.options ?? [];
        if (opts.length > 0 && !opts.includes(value)) {
          errors.push({ field: def.fieldCode, message: `${def.fieldName} must be one of: ${opts.join(', ')}` });
        }
        break;
      }

      case 'MULTI_SELECT': {
        const opts = rule.options ?? [];
        if (opts.length > 0) {
          let selected: string[];
          try {
            selected = JSON.parse(value) as string[];
          } catch {
            errors.push({ field: def.fieldCode, message: `${def.fieldName} must be a JSON array` });
            break;
          }
          if (!Array.isArray(selected)) {
            errors.push({ field: def.fieldCode, message: `${def.fieldName} must be a JSON array` });
            break;
          }
          const invalid = selected.filter((v) => !opts.includes(v));
          if (invalid.length > 0) {
            errors.push({ field: def.fieldCode, message: `${def.fieldName} contains invalid values: ${invalid.join(', ')}` });
          }
        }
        break;
      }

      case 'TEXT': {
        if (rule.regex) {
          const re = new RegExp(rule.regex);
          if (!re.test(value)) {
            errors.push({ field: def.fieldCode, message: `${def.fieldName} does not match required format` });
          }
        }
        break;
      }
    }
  }

  return errors;
}

export function getMissingRequiredFields(
  fieldDefs: RiskFieldDef[],
  values: Record<string, string | null | undefined>,
): string[] {
  return fieldDefs
    .filter((d) => d.isRequired && !values[d.fieldCode])
    .map((d) => d.fieldCode);
}
