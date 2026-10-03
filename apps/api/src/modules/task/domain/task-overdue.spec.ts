import { describe, it, expect } from 'vitest';
import { isOverdue } from './task-overdue.js';

const past = new Date(Date.now() - 86400000);
const future = new Date(Date.now() + 86400000);

describe('isOverdue', () => {
  it('returns false when no dueDate', () => {
    expect(isOverdue('TODO', null)).toBe(false);
    expect(isOverdue('TODO', undefined)).toBe(false);
  });

  it('returns false when status is DONE', () => {
    expect(isOverdue('DONE', past)).toBe(false);
  });

  it('returns false when status is CANCELLED', () => {
    expect(isOverdue('CANCELLED', past)).toBe(false);
  });

  it('returns true when TODO and dueDate is past', () => {
    expect(isOverdue('TODO', past)).toBe(true);
  });

  it('returns true when IN_PROGRESS and dueDate is past', () => {
    expect(isOverdue('IN_PROGRESS', past)).toBe(true);
  });

  it('returns false when TODO and dueDate is future', () => {
    expect(isOverdue('TODO', future)).toBe(false);
  });
});
