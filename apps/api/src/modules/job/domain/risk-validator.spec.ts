import { describe, expect, it } from 'vitest';
import { getMissingRequiredFields, validateRiskValues, type RiskFieldDef } from './risk-validator.js';

const textField = (override?: Partial<RiskFieldDef>): RiskFieldDef => ({
  fieldCode: 'plate_number',
  fieldName: 'Plate Number',
  fieldType: 'TEXT',
  isRequired: true,
  validationRule: null,
  ...override,
});

describe('validateRiskValues', () => {
  // ── Required check ──────────────────────────────────────────────────────────

  it('returns error for missing required field', () => {
    const errs = validateRiskValues([textField()], {});
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('plate_number');
  });

  it('returns error when required field is empty string', () => {
    const errs = validateRiskValues([textField()], { plate_number: '' });
    expect(errs).toHaveLength(1);
  });

  it('returns error when required field is null', () => {
    const errs = validateRiskValues([textField()], { plate_number: null });
    expect(errs).toHaveLength(1);
  });

  it('no error when optional field is absent', () => {
    const errs = validateRiskValues([textField({ isRequired: false })], {});
    expect(errs).toHaveLength(0);
  });

  it('no error when required field is provided', () => {
    const errs = validateRiskValues([textField()], { plate_number: 'กก-1234' });
    expect(errs).toHaveLength(0);
  });

  // ── TEXT + regex ─────────────────────────────────────────────────────────────

  it('TEXT: fails regex', () => {
    const field = textField({ validationRule: '{"regex":"^[A-Z]{2}-\\\\d{4}$"}' });
    const errs = validateRiskValues([field], { plate_number: 'bad' });
    expect(errs[0].field).toBe('plate_number');
  });

  it('TEXT: passes regex', () => {
    const field = textField({ validationRule: '{"regex":"^[A-Z]{2}-\\\\d{4}$"}' });
    const errs = validateRiskValues([field], { plate_number: 'AB-1234' });
    expect(errs).toHaveLength(0);
  });

  it('TEXT: no rule = always valid', () => {
    const errs = validateRiskValues([textField({ isRequired: false })], { plate_number: 'anything' });
    expect(errs).toHaveLength(0);
  });

  // ── NUMBER ───────────────────────────────────────────────────────────────────

  it('NUMBER: not a number returns error', () => {
    const field = textField({ fieldCode: 'year', fieldName: 'Year', fieldType: 'NUMBER', isRequired: false });
    const errs = validateRiskValues([field], { year: 'abc' });
    expect(errs[0].field).toBe('year');
    expect(errs[0].message).toMatch(/number/i);
  });

  it('NUMBER: below min returns error', () => {
    const field = textField({
      fieldCode: 'year', fieldName: 'Year', fieldType: 'NUMBER',
      isRequired: false, validationRule: '{"min":1990,"max":2030}',
    });
    const errs = validateRiskValues([field], { year: '1989' });
    expect(errs[0].message).toMatch(/>=.+1990/);
  });

  it('NUMBER: above max returns error', () => {
    const field = textField({
      fieldCode: 'year', fieldName: 'Year', fieldType: 'NUMBER',
      isRequired: false, validationRule: '{"min":1990,"max":2030}',
    });
    const errs = validateRiskValues([field], { year: '2031' });
    expect(errs[0].message).toMatch(/<=.+2030/);
  });

  it('NUMBER: within range is valid', () => {
    const field = textField({
      fieldCode: 'year', fieldName: 'Year', fieldType: 'NUMBER',
      isRequired: false, validationRule: '{"min":1990,"max":2030}',
    });
    const errs = validateRiskValues([field], { year: '2020' });
    expect(errs).toHaveLength(0);
  });

  // ── DATE ─────────────────────────────────────────────────────────────────────

  it('DATE: invalid date returns error', () => {
    const field = textField({ fieldCode: 'reg_date', fieldName: 'Reg Date', fieldType: 'DATE', isRequired: false });
    const errs = validateRiskValues([field], { reg_date: 'not-a-date' });
    expect(errs[0].message).toMatch(/valid date/i);
  });

  it('DATE: valid date is accepted', () => {
    const field = textField({ fieldCode: 'reg_date', fieldName: 'Reg Date', fieldType: 'DATE', isRequired: false });
    const errs = validateRiskValues([field], { reg_date: '2020-06-15' });
    expect(errs).toHaveLength(0);
  });

  it('DATE: before min returns error', () => {
    const field = textField({
      fieldCode: 'reg_date', fieldName: 'Reg Date', fieldType: 'DATE',
      isRequired: false, validationRule: '{"min":"2000-01-01"}',
    });
    const errs = validateRiskValues([field], { reg_date: '1999-12-31' });
    expect(errs[0].message).toMatch(/after/i);
  });

  // ── BOOLEAN ──────────────────────────────────────────────────────────────────

  it('BOOLEAN: non-boolean string returns error', () => {
    const field = textField({ fieldCode: 'modified', fieldName: 'Modified', fieldType: 'BOOLEAN', isRequired: false });
    const errs = validateRiskValues([field], { modified: 'yes' });
    expect(errs[0].field).toBe('modified');
  });

  it('BOOLEAN: "true" is valid', () => {
    const field = textField({ fieldCode: 'modified', fieldName: 'Modified', fieldType: 'BOOLEAN', isRequired: false });
    expect(validateRiskValues([field], { modified: 'true' })).toHaveLength(0);
  });

  it('BOOLEAN: "false" is valid', () => {
    const field = textField({ fieldCode: 'modified', fieldName: 'Modified', fieldType: 'BOOLEAN', isRequired: false });
    expect(validateRiskValues([field], { modified: 'false' })).toHaveLength(0);
  });

  // ── SELECT ───────────────────────────────────────────────────────────────────

  it('SELECT: invalid option returns error', () => {
    const field = textField({
      fieldCode: 'body_type', fieldName: 'Body Type', fieldType: 'SELECT',
      isRequired: false, validationRule: '{"options":["SEDAN","SUV","PICKUP"]}',
    });
    const errs = validateRiskValues([field], { body_type: 'TRUCK' });
    expect(errs[0].field).toBe('body_type');
    expect(errs[0].message).toMatch(/SEDAN/);
  });

  it('SELECT: valid option is accepted', () => {
    const field = textField({
      fieldCode: 'body_type', fieldName: 'Body Type', fieldType: 'SELECT',
      isRequired: false, validationRule: '{"options":["SEDAN","SUV","PICKUP"]}',
    });
    expect(validateRiskValues([field], { body_type: 'SUV' })).toHaveLength(0);
  });

  it('SELECT: no options rule = always valid', () => {
    const field = textField({ fieldCode: 'body_type', fieldName: 'Body Type', fieldType: 'SELECT', isRequired: false });
    expect(validateRiskValues([field], { body_type: 'anything' })).toHaveLength(0);
  });

  // ── MULTI_SELECT ──────────────────────────────────────────────────────────────

  it('MULTI_SELECT: non-JSON array returns error', () => {
    const field = textField({
      fieldCode: 'covers', fieldName: 'Covers', fieldType: 'MULTI_SELECT',
      isRequired: false, validationRule: '{"options":["A","B","C"]}',
    });
    const errs = validateRiskValues([field], { covers: 'A,B' });
    expect(errs[0].message).toMatch(/JSON array/i);
  });

  it('MULTI_SELECT: invalid member returns error', () => {
    const field = textField({
      fieldCode: 'covers', fieldName: 'Covers', fieldType: 'MULTI_SELECT',
      isRequired: false, validationRule: '{"options":["A","B","C"]}',
    });
    const errs = validateRiskValues([field], { covers: '["A","D"]' });
    expect(errs[0].message).toMatch(/D/);
  });

  it('MULTI_SELECT: all valid members accepted', () => {
    const field = textField({
      fieldCode: 'covers', fieldName: 'Covers', fieldType: 'MULTI_SELECT',
      isRequired: false, validationRule: '{"options":["A","B","C"]}',
    });
    expect(validateRiskValues([field], { covers: '["A","C"]' })).toHaveLength(0);
  });

  // ── Multiple fields ──────────────────────────────────────────────────────────

  it('collects errors for multiple invalid fields', () => {
    const fields: RiskFieldDef[] = [
      textField({ fieldCode: 'f1', fieldName: 'F1', isRequired: true }),
      textField({ fieldCode: 'f2', fieldName: 'F2', isRequired: true }),
      textField({ fieldCode: 'f3', fieldName: 'F3', isRequired: false, fieldType: 'NUMBER' }),
    ];
    const errs = validateRiskValues(fields, { f3: 'bad' });
    expect(errs).toHaveLength(3); // f1 missing, f2 missing, f3 not a number
  });
});

// ── getMissingRequiredFields ─────────────────────────────────────────────────

describe('getMissingRequiredFields', () => {
  it('returns codes of missing required fields', () => {
    const fields: RiskFieldDef[] = [
      textField({ fieldCode: 'f1', isRequired: true }),
      textField({ fieldCode: 'f2', isRequired: true }),
      textField({ fieldCode: 'f3', isRequired: false }),
    ];
    const missing = getMissingRequiredFields(fields, { f1: 'ok' });
    expect(missing).toEqual(['f2']);
  });

  it('returns empty when all required fields are filled', () => {
    const fields: RiskFieldDef[] = [textField({ fieldCode: 'f1', isRequired: true })];
    expect(getMissingRequiredFields(fields, { f1: 'value' })).toHaveLength(0);
  });
});
