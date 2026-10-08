import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { BusinessException } from '../../common/errors/business.exception.js';
import { MasterService } from './master.service.js';

describe('MasterService - Branches (Day 2)', () => {
  const mockBranch = {
    id: 'b-1',
    code: 'HQ',
    name: 'Headquarters',
    address: '123 Bangkok',
    active: true,
    _count: { users: 0, jobs: 0 },
  };

  it('listBranches returns all branches', async () => {
    const repo = {
      findAllBranches: vi.fn().mockResolvedValue([mockBranch]),
    };
    const service = new MasterService(repo as never);
    const result = await service.listBranches();
    expect(result).toEqual([mockBranch]);
  });

  it('getBranch throws 404 when branch not found', async () => {
    const repo = {
      findBranchById: vi.fn().mockResolvedValue(null),
    };
    const service = new MasterService(repo as never);
    await expect(service.getBranch('b-999')).rejects.toThrowError(BusinessException);
  });

  it('createBranch creates a new branch and throws 409 if code duplicate', async () => {
    const repo = {
      findBranchByCode: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockBranch),
      createBranch: vi.fn().mockResolvedValue(mockBranch),
    };
    const service = new MasterService(repo as never);

    // Success
    const res = await service.createBranch({ code: 'HQ', name: 'Headquarters' });
    expect(res).toEqual(mockBranch);

    // Duplicate code
    await expect(service.createBranch({ code: 'HQ', name: 'Duplicate HQ' })).rejects.toThrowError(BusinessException);
  });

  it('updateBranch updates branch and checks code duplicate', async () => {
    const repo = {
      findBranchById: vi.fn().mockResolvedValue(mockBranch),
      findBranchByCode: vi.fn().mockResolvedValue({ id: 'b-2', code: 'CM' }),
      updateBranch: vi.fn().mockResolvedValue({ ...mockBranch, name: 'HQ Updated' }),
    };
    const service = new MasterService(repo as never);

    // Updating to an existing code of another branch throws 409
    await expect(service.updateBranch('b-1', { code: 'CM' })).rejects.toThrowError(BusinessException);

    // Updating allowed
    repo.findBranchByCode.mockResolvedValueOnce(null);
    const updated = await service.updateBranch('b-1', { name: 'HQ Updated' });
    expect(updated.name).toBe('HQ Updated');
  });

  it('deleteBranch deletes unused branch and rejects branch in use', async () => {
    const repo = {
      findBranchById: vi
        .fn()
        .mockResolvedValueOnce({ ...mockBranch, _count: { users: 2, jobs: 0 } })
        .mockResolvedValueOnce(mockBranch),
      deleteBranch: vi.fn().mockResolvedValue(mockBranch),
    };
    const service = new MasterService(repo as never);

    // In use -> 409
    await expect(service.deleteBranch('b-1')).rejects.toThrowError(BusinessException);

    // Not in use -> success
    const deleted = await service.deleteBranch('b-1');
    expect(deleted).toEqual(mockBranch);
  });
});

