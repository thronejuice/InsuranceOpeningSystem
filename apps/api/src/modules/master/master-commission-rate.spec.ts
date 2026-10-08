import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { MasterService } from './master.service.js';

describe('MasterService - Commission Rates (Phase 2 Day 11)', () => {
  let service: MasterService;
  let mockRepo: any;
  let mockAudit: any;

  const insurerId = 'comp-1111-1111-1111-111111111111';
  const productId = 'prod-1111-1111-1111-111111111111';
  const rateId = 'rate-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockRepo = {
      findCompanyById: vi.fn().mockResolvedValue({ id: insurerId, name: 'Thai Insurance' }),
      findProductById: vi.fn().mockResolvedValue({ id: productId, name: 'Motor Class 1' }),
      findCommissionRates: vi.fn(),
      findCommissionRateById: vi.fn(),
      findApplicableCommissionRate: vi.fn(),
      createCommissionRate: vi.fn(),
      updateCommissionRate: vi.fn(),
      deleteCommissionRate: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new MasterService(mockRepo, mockAudit);
  });

  describe('createCommissionRate', () => {
    it('creates a new commission rate when insurer and product exist and date range is valid', async () => {
      mockRepo.createCommissionRate.mockResolvedValue({
        id: rateId,
        insuranceCompanyId: insurerId,
        productId,
        rate: '12.0000',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
      });

      const res = await service.createCommissionRate({
        insuranceCompanyId: insurerId,
        productId,
        rate: '12.0000',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      });

      expect(res.id).toBe(rateId);
      expect(mockRepo.createCommissionRate).toHaveBeenCalledWith(
        expect.objectContaining({
          rate: '12.0000',
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE_COMMISSION_RATE',
        }),
      );
    });

    it('throws COMPANY_NOT_FOUND (404) when insurer does not exist', async () => {
      mockRepo.findCompanyById.mockResolvedValue(null);

      await expect(
        service.createCommissionRate({
          insuranceCompanyId: 'unknown-id',
          productId,
          rate: '12.0000',
          effectiveFrom: '2026-01-01',
        }),
      ).rejects.toMatchObject({
        code: 'COMPANY_NOT_FOUND',
        status: 404,
      });
    });

    it('throws PRODUCT_NOT_FOUND (404) when product does not exist', async () => {
      mockRepo.findProductById.mockResolvedValue(null);

      await expect(
        service.createCommissionRate({
          insuranceCompanyId: insurerId,
          productId: 'unknown-id',
          rate: '12.0000',
          effectiveFrom: '2026-01-01',
        }),
      ).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
        status: 404,
      });
    });

    it('throws INVALID_DATE_RANGE (422) when effectiveTo is before effectiveFrom', async () => {
      await expect(
        service.createCommissionRate({
          insuranceCompanyId: insurerId,
          productId,
          rate: '12.0000',
          effectiveFrom: '2026-06-01',
          effectiveTo: '2026-01-01',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE_RANGE',
        status: 422,
      });
    });
  });

  describe('updateCommissionRate', () => {
    it('updates commission rate successfully', async () => {
      mockRepo.findCommissionRateById.mockResolvedValue({
        id: rateId,
        rate: '12.0000',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      });
      mockRepo.updateCommissionRate.mockResolvedValue({
        id: rateId,
        rate: '15.0000',
        effectiveFrom: new Date('2026-01-01'),
      });

      const res = await service.updateCommissionRate(rateId, {
        rate: '15.0000',
      });

      expect(res.rate).toBe('15.0000');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_COMMISSION_RATE',
        }),
      );
    });

    it('throws INVALID_DATE_RANGE (422) if new effectiveTo is before existing effectiveFrom', async () => {
      mockRepo.findCommissionRateById.mockResolvedValue({
        id: rateId,
        rate: '12.0000',
        effectiveFrom: new Date('2026-06-01'),
        effectiveTo: null,
      });

      await expect(
        service.updateCommissionRate(rateId, {
          effectiveTo: '2026-01-01',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_DATE_RANGE',
        status: 422,
      });
    });
  });

  describe('listCommissionRates', () => {
    it('applies filters for insurer, product, and activeAt', async () => {
      mockRepo.findCommissionRates.mockResolvedValue([]);

      await service.listCommissionRates({
        insuranceCompanyId: insurerId,
        productId,
        activeAt: '2026-03-15',
      });

      expect(mockRepo.findCommissionRates).toHaveBeenCalledWith(
        expect.objectContaining({
          insuranceCompanyId: insurerId,
          productId,
          effectiveFrom: { lte: new Date('2026-03-15') },
        }),
      );
    });
  });

  describe('deleteCommissionRate', () => {
    it('soft deletes commission rate', async () => {
      mockRepo.findCommissionRateById.mockResolvedValue({ id: rateId });
      mockRepo.deleteCommissionRate.mockResolvedValue({ id: rateId, deletedAt: new Date() });

      const res = await service.deleteCommissionRate(rateId);
      expect(res.id).toBe(rateId);
      expect(mockRepo.deleteCommissionRate).toHaveBeenCalledWith(rateId);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE_COMMISSION_RATE' }),
      );
    });
  });
});

