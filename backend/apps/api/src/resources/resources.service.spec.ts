import { describe, expect, it, vi } from 'vitest';
import { ResourcesService } from './resources.service';

describe('ResourcesService tenant isolation', () => {
  it('always scopes a record lookup to organization and module', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'record', module: 'customers', data: {} });
    const service = new ResourcesService({
      businessRecord: { findFirst },
      organizationUser: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);
    await service.get(
      {
        userId: 'u',
        sessionId: 's',
        organizationId: 'tenant-a',
        permissions: [],
        branchIds: [],
        dataScope: 'all',
        enabledModules: [],
        customerId: null,
        employeeId: null,
        roleKey: null,
        isOwner: false,
        mfaEnrollmentRequired: false,
      },
      'customers',
      'record',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { organizationId: 'tenant-a', module: 'customers', archivedAt: null },
          { id: 'record' },
        ],
      },
    });
  });
});
