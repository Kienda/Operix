import { describe, expect, it, vi } from 'vitest';
import { PortalController } from './portal.controller';

describe('customer portal projection and scope', () => {
  const request = {
    auth: {
      organizationId: 'tenant-a',
      userId: 'customer-user',
      dataScope: 'customer',
      customerId: 'customer-a',
      branchIds: [],
      enabledModules: ['portal', 'projects'],
    },
  } as never;
  it('requires a linked customer and explicit product enablement', async () => {
    const controller = new PortalController({} as never);
    await expect(
      controller.projects({ auth: { dataScope: 'all', enabledModules: ['projects'] } } as never),
    ).rejects.toThrow('Linked customer');
    await expect(controller.quotations(request)).rejects.toThrow('enabled product');
  });
  it('filters by tenant/customer and never exposes staff notes or assignment identities', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'own',
        name: 'Own project',
        number: 'PRJ-1',
        status: 'ACTIVE',
        data: {
          customerId: 'customer-a',
          progress: 30,
          internalNotes: 'private',
          memberUserIds: ['internal-staff'],
          cost: 100,
        },
      },
    ]);
    const result = await new PortalController({ businessRecord: { findMany } } as never).projects(
      request,
    );
    expect(findMany.mock.calls[0][0].where.AND[0]).toMatchObject({
      organizationId: 'tenant-a',
      data: { path: ['customerId'], equals: 'customer-a' },
    });
    expect(JSON.stringify(result)).not.toMatch(/private|internal-staff|cost/);
  });
  it('returns not found for a direct ID outside customer scope', async () => {
    const controller = new PortalController({
      businessRecord: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);
    await expect(controller.project('foreign', request)).rejects.toThrow('not found');
  });
});
