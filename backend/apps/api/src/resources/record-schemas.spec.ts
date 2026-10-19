import { describe, expect, it } from 'vitest';
import { validateRecordSchema } from './record-schemas';
import { validateRecordData } from '../security/authorization';

describe('customer assignment contract', () => {
  const userId = '12345678-1234-4234-8234-123456789abc';
  it('accepts the assignment fields used by the existing scope policy', () => {
    expect(() =>
      validateRecordSchema('customers', {
        salespersonUserId: userId,
        projectManagerUserId: userId,
        assignedToUserId: userId,
      }),
    ).not.toThrow();
    expect(() => validateRecordSchema('customers', { arbitraryUserId: userId })).toThrow(
      'not a field',
    );
  });
  it('still rejects an assignment outside the organization', async () => {
    const db = { organizationUser: { findMany: async () => [] } };
    await expect(
      validateRecordData(
        db as never,
        { organizationId: 'tenant-a' } as never,
        'customers',
        { projectManagerUserId: userId },
        'branch-a',
      ),
    ).rejects.toThrow('outside this organization or branch');
  });
  it('still rejects an assignment outside the record branch', async () => {
    const db = { organizationUser: { findMany: async () => [{ branchIds: ['branch-b'] }] } };
    await expect(
      validateRecordData(
        db as never,
        { organizationId: 'tenant-a' } as never,
        'customers',
        { projectManagerUserId: userId },
        'branch-a',
      ),
    ).rejects.toThrow('outside this organization or branch');
  });
});
