import { describe, expect, it } from 'vitest';
import {
  can,
  financialWhere,
  inventoryWhere,
  parseOverrides,
  projectRecord,
  recordWhere,
} from './authorization';
import type { AuthContext } from './request-context';

const context = (extra: Partial<AuthContext> = {}): AuthContext => ({
  userId: 'u',
  sessionId: 's',
  organizationId: 'tenant',
  permissions: [],
  branchIds: [],
  enabledModules: [],
  dataScope: 'self',
  customerId: null,
  employeeId: null,
  roleKey: null,
  isOwner: false,
  mfaEnrollmentRequired: false,
  ...extra,
});
describe('effective resource policy', () => {
  it('does not treat wildcard strings as capabilities', () =>
    expect(can(context({ permissions: ['*'] }), 'payments.verify')).toBe(false));
  it('parses supported overrides and fails closed for malformed expiry', () => {
    expect(parseOverrides({ 'customers.view': 'deny' })).toEqual([
      { permission: 'customers.view', effect: 'deny', expiresAt: null },
    ]);
    expect(
      parseOverrides([{ permission: 'customers.view', effect: 'allow', expiresAt: 'bad' }]),
    ).toEqual([]);
    expect(
      parseOverrides([{ permission: 'customers.view', effect: 'deny', expiresAt: 'bad' }]),
    ).toEqual([{ permission: 'customers.view', effect: 'deny' }]);
  });
  it('applies a branch ceiling even to an all-scope role', () =>
    expect(recordWhere(context({ dataScope: 'all', branchIds: ['a'] }), 'customers')).toMatchObject(
      { organizationId: 'tenant', branchId: { in: ['a'] } },
    ));
  it('denies a branch role without branches and an unlinked customer', () => {
    expect(recordWhere(context({ dataScope: 'branch' }), 'customers')).toMatchObject({
      branchId: { in: [] },
    });
    expect(recordWhere(context({ dataScope: 'customer' }), 'customers')).toMatchObject({
      id: { in: [] },
    });
  });
  it('restricts assigned tasks and linked customer/employee identity', () => {
    expect(recordWhere(context({ dataScope: 'assigned' }), 'tasks')).toMatchObject({
      OR: [{ createdBy: 'u' }, { data: { path: ['assigneeUserId'], equals: 'u' } }],
    });
    expect(
      recordWhere(context({ dataScope: 'customer', customerId: 'c' }), 'documents'),
    ).toMatchObject({ data: { path: ['customerId'], equals: 'c' } });
    expect(recordWhere(context({ employeeId: 'e' }), 'employees')).toMatchObject({ id: 'e' });
  });
  it('requires a notification recipient even for organization-wide administrators', () =>
    expect(recordWhere(context({ dataScope: 'all' }), 'notifications')).toMatchObject({
      data: { path: ['recipientUserId'], equals: 'u' },
    }));
  it('does not grant inventory visibility to a self/assigned financial override', () => {
    expect(inventoryWhere(context({ dataScope: 'assigned' }))).toMatchObject({ id: { in: [] } });
    expect(financialWhere(context())).toMatchObject({ organizationId: 'tenant', createdBy: 'u' });
  });
  it('drops unknown and nested employee fields in every response projection', () => {
    const row = {
      module: 'employees',
      data: {
        firstName: 'Name',
        bankAccountNumber: 'secret',
        email: { hidden: 'secret' },
        notes: 'secret',
        unrecognized: 'secret',
      },
    };
    expect(projectRecord(context(), row).data).toEqual({ firstName: 'Name' });
    expect(projectRecord(context({ permissions: ['employees.view_sensitive'] }), row)).toEqual(row);
  });
});
