import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { BusinessException } from '../../common/errors/business.exception.js';
import { UserService } from './user.service.js';

describe('UserService - Branch & Manager (Day 2)', () => {
  const mockUser = {
    id: 'u-1',
    username: 'agent01',
    email: 'agent01@test.com',
    fullName: 'Agent One',
    isActive: true,
    branchId: 'b-1',
    branch: { id: 'b-1', code: 'HQ', name: 'Headquarters' },
    managerId: 'mgr-1',
    manager: { id: 'mgr-1', fullName: 'Manager M', username: 'manager' },
    lastLoginAt: null,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    roles: [],
  };

  it('createUser connects branchId and managerId', async () => {
    const repo = {
      findByUsername: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
    };
    const service = new UserService(repo as never);

    const res = await service.createUser({
      username: 'agent01',
      email: 'agent01@test.com',
      fullName: 'Agent One',
      password: 'Password@123',
      branchId: 'b-1',
      managerId: 'mgr-1',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: { connect: { id: 'b-1' } },
        manager: { connect: { id: 'mgr-1' } },
      }),
    );
    expect(res.branchId).toBe('b-1');
    expect(res.branch?.code).toBe('HQ');
    expect(res.managerId).toBe('mgr-1');
    expect(res.manager?.username).toBe('manager');
  });

  it('updateUser rejects setting user as their own manager with 422', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue(mockUser),
    };
    const service = new UserService(repo as never);

    await expect(
      service.updateUser('u-1', { managerId: 'u-1' }),
    ).rejects.toThrowError(BusinessException);
  });

  it('updateUser updates branch and manager correctly', async () => {
    const updatedUser = {
      ...mockUser,
      branchId: 'b-2',
      branch: { id: 'b-2', code: 'CM', name: 'Chiang Mai' },
      managerId: null,
      manager: null,
    };
    const repo = {
      findById: vi.fn().mockResolvedValueOnce(mockUser).mockResolvedValueOnce(updatedUser),
      update: vi.fn().mockResolvedValue(updatedUser),
    };
    const service = new UserService(repo as never);

    const res = await service.updateUser('u-1', {
      branchId: 'b-2',
      managerId: null,
    });

    expect(repo.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        branch: { connect: { id: 'b-2' } },
        manager: { disconnect: true },
      }),
    );
    expect(res.branchId).toBe('b-2');
    expect(res.managerId).toBeNull();
  });
});

