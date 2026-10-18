import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResourcesController } from './resources.controller';

const request = (permissions: string[]) =>
  ({
    auth: {
      userId: 'user',
      sessionId: 'session',
      organizationId: 'tenant',
      branchIds: [],
      permissions,
      enabledModules: ['hr', 'crm', 'payroll'],
      dataScope: 'all',
      customerId: null,
      employeeId: null,
  roleKey: null,
  isOwner: false,
  mfaEnrollmentRequired: false,
    },
  }) as never;

describe('ResourcesController module authorization', () => {
  it('does not let an employee list employees or payroll runs', () => {
    const controller = new ResourcesController({ list: vi.fn() } as never);
    expect(() =>
      controller.list(
        'employees',
        '1',
        '25',
        undefined,
        undefined,
        request(['employees.view_own']),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.list(
        'payroll-runs',
        '1',
        '25',
        undefined,
        undefined,
        request(['payroll.view_own']),
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets an HR manager list employees', () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    const controller = new ResourcesController({ list } as never);
    controller.list('employees', '1', '25', undefined, undefined, request(['employees.view']));
    expect(list).toHaveBeenCalledOnce();
  });

  it('does not let a read-only user create a customer', () => {
    const controller = new ResourcesController({ create: vi.fn() } as never);
    expect(() =>
      controller.create(
        { module: 'customers', type: 'company', name: 'Blocked' },
        request(['customers.view']),
      ),
    ).toThrow(ForbiddenException);
  });
});
