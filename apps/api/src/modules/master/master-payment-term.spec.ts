import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { MasterService } from './master.service.js';

describe('MasterService - Payment Terms (Phase 2 Day 13 / OQ-2)', () => {
  let service: MasterService;
  let mockRepo: any;
  let mockAudit: any;

  const termId = 'term-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockRepo = {
      findPaymentTerms: vi.fn(),
      findPaymentTermById: vi.fn(),
      findPaymentTermByCode: vi.fn(),
      createPaymentTerm: vi.fn(),
      updatePaymentTerm: vi.fn(),
      deletePaymentTerm: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new MasterService(mockRepo, mockAudit);
  });

  describe('createPaymentTerm', () => {
    it('creates a new payment term successfully', async () => {
      mockRepo.findPaymentTermByCode.mockResolvedValue(null);
      mockRepo.createPaymentTerm.mockResolvedValue({
        id: termId,
        code: 'INSTALLMENT_3',
        name: 'ผ่อน 3 งวด',
        description: 'ผ่อน 3 งวด',
        installments: 3,
        intervalMonths: 1,
        firstDueDays: 30,
        active: true,
      });

      const res = await service.createPaymentTerm({
        code: 'INSTALLMENT_3',
        name: 'ผ่อน 3 งวด',
        description: 'ผ่อน 3 งวด',
        installments: 3,
        intervalMonths: 1,
        firstDueDays: 30,
      });

      expect(res.id).toBe(termId);
      expect(res.code).toBe('INSTALLMENT_3');
      expect(res.installments).toBe(3);
      expect(mockRepo.createPaymentTerm).toHaveBeenCalledWith({
        code: 'INSTALLMENT_3',
        name: 'ผ่อน 3 งวด',
        description: 'ผ่อน 3 งวด',
        installments: 3,
        intervalMonths: 1,
        firstDueDays: 30,
        active: true,
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE_PAYMENT_TERM', entityId: termId }),
      );
    });

    it('throws 409 PAYMENT_TERM_CODE_EXISTS if code already exists', async () => {
      mockRepo.findPaymentTermByCode.mockResolvedValue({ id: 'existing', code: 'INSTALLMENT_3' });

      await expect(
        service.createPaymentTerm({
          code: 'INSTALLMENT_3',
          name: 'ผ่อน 3 งวด',
          installments: 3,
          intervalMonths: 1,
          firstDueDays: 30,
        }),
      ).rejects.toMatchObject({
        code: 'PAYMENT_TERM_CODE_EXISTS',
        status: 409,
      });
    });
  });

  describe('updatePaymentTerm', () => {
    it('updates an existing payment term', async () => {
      mockRepo.findPaymentTermById.mockResolvedValue({
        id: termId,
        code: 'INSTALLMENT_3',
        name: 'ผ่อน 3 งวด',
        installments: 3,
        intervalMonths: 1,
        firstDueDays: 30,
        active: true,
      });
      mockRepo.updatePaymentTerm.mockResolvedValue({
        id: termId,
        code: 'INSTALLMENT_3',
        name: 'ผ่อนชำระ 3 งวด',
        installments: 3,
        intervalMonths: 1,
        firstDueDays: 30,
        active: true,
      });

      const res = await service.updatePaymentTerm(termId, { name: 'ผ่อนชำระ 3 งวด' });
      expect(res.name).toBe('ผ่อนชำระ 3 งวด');
      expect(mockRepo.updatePaymentTerm).toHaveBeenCalledWith(termId, { name: 'ผ่อนชำระ 3 งวด' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE_PAYMENT_TERM', entityId: termId }),
      );
    });

    it('throws 409 if new code is already taken by another payment term', async () => {
      mockRepo.findPaymentTermById.mockResolvedValue({
        id: termId,
        code: 'INSTALLMENT_3',
        name: 'ผ่อน 3 งวด',
      });
      mockRepo.findPaymentTermByCode.mockResolvedValue({
        id: 'other-id',
        code: 'INSTALLMENT_6',
      });

      await expect(
        service.updatePaymentTerm(termId, { code: 'INSTALLMENT_6' }),
      ).rejects.toMatchObject({
        code: 'PAYMENT_TERM_CODE_EXISTS',
        status: 409,
      });
    });
  });

  describe('deletePaymentTerm', () => {
    it('deletes a payment term', async () => {
      mockRepo.findPaymentTermById.mockResolvedValue({
        id: termId,
        code: 'INSTALLMENT_3',
      });
      mockRepo.deletePaymentTerm.mockResolvedValue({ id: termId });

      await service.deletePaymentTerm(termId);
      expect(mockRepo.deletePaymentTerm).toHaveBeenCalledWith(termId);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE_PAYMENT_TERM', entityId: termId }),
      );
    });
  });

  describe('listPaymentTerms', () => {
    it('returns payment terms filtered by active flag if specified', async () => {
      mockRepo.findPaymentTerms.mockResolvedValue([
        { id: '1', code: 'FULL', active: true },
        { id: '2', code: 'INSTALLMENT_3', active: true },
      ]);

      const res = await service.listPaymentTerms({ active: true });
      expect(res).toHaveLength(2);
      expect(mockRepo.findPaymentTerms).toHaveBeenCalledWith({ active: true });
    });
  });
});

