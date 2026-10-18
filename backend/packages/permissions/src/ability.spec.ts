import { describe, expect, it } from 'vitest';
import { buildAbility, narrowestScope } from './ability';
import { MODULE } from './modules';
import { getSystemRole } from './roles';
import { assertKnownPermissions, PERMISSIONS } from './permissions';

const ALL_MODULES = Object.values(MODULE);

describe('permission catalog', () => {
  it('has no duplicate keys', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('only references known permissions from every system role', () => {
    for (const key of ['company_owner', 'security_guard', 'auditor', 'customer']) {
      const role = getSystemRole(key);
      expect(role, key).toBeDefined();
      expect(() => assertKnownPermissions(role!.permissions, key)).not.toThrow();
    }
  });
});

describe('buildAbility', () => {
  it('does not expand an explicit branch ceiling for an all-scope role', () => {
    const ability = buildAbility({
      rolePermissions: [],
      enabledModules: ALL_MODULES,
      dataScope: 'all',
      branchIds: ['a'],
    });
    expect(ability.canAccessBranch('a')).toBe(true);
    expect(ability.canAccessBranch('b')).toBe(false);
    expect(ability.canAccessBranch(null)).toBe(false);
  });
  it('denies all branches when a branch role has no assigned branches', () => {
    const ability = buildAbility({
      rolePermissions: [],
      enabledModules: ALL_MODULES,
      dataScope: 'branch',
      branchIds: [],
    });
    expect(ability.canAccessBranch('a')).toBe(false);
    expect(ability.canAccessBranch(null)).toBe(false);
  });
  it('grants role permissions when the owning module is enabled', () => {
    const ability = buildAbility({
      rolePermissions: ['customers.view', 'payments.record'],
      enabledModules: ALL_MODULES,
      dataScope: 'all',
    });

    expect(ability.can('customers.view')).toBe(true);
    expect(ability.can('payments.record')).toBe(true);
  });

  it('drops permissions whose module is disabled', () => {
    const ability = buildAbility({
      rolePermissions: ['customers.view', 'payroll.process'],
      enabledModules: [MODULE.CORE, MODULE.CRM],
      dataScope: 'all',
    });

    expect(ability.can('customers.view')).toBe(true);
    expect(ability.can('payroll.process')).toBe(false);
  });

  it('lets a deny override beat a role grant', () => {
    const ability = buildAbility({
      rolePermissions: ['payments.reverse'],
      overrides: [{ permission: 'payments.reverse', effect: 'deny' }],
      enabledModules: ALL_MODULES,
      dataScope: 'all',
    });

    expect(ability.can('payments.reverse')).toBe(false);
  });

  it('honours an allow override for a permission no role grants', () => {
    const ability = buildAbility({
      rolePermissions: [],
      overrides: [{ permission: 'reports.export', effect: 'allow' }],
      enabledModules: ALL_MODULES,
      dataScope: 'all',
    });

    expect(ability.can('reports.export')).toBe(true);
  });

  it('ignores an expired allow override', () => {
    const ability = buildAbility(
      {
        rolePermissions: [],
        overrides: [
          {
            permission: 'reports.export',
            effect: 'allow',
            expiresAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
        enabledModules: ALL_MODULES,
        dataScope: 'all',
      },
      new Date('2026-02-01T00:00:00Z'),
    );

    expect(ability.can('reports.export')).toBe(false);
  });

  it('silently discards unknown permission strings', () => {
    const ability = buildAbility({
      rolePermissions: ['customers.superpower'],
      enabledModules: ALL_MODULES,
      dataScope: 'all',
    });

    expect(ability.can('customers.superpower')).toBe(false);
  });

  it('restricts branch access outside the assigned branches', () => {
    const ability = buildAbility({
      rolePermissions: ['customers.view'],
      enabledModules: ALL_MODULES,
      dataScope: 'branch',
      branchIds: ['branch-a'],
    });

    expect(ability.canAccessBranch('branch-a')).toBe(true);
    expect(ability.canAccessBranch('branch-b')).toBe(false);
    expect(ability.canAccessBranch(null)).toBe(false);
  });

  it('allows every branch for an organization-wide scope', () => {
    const ability = buildAbility({
      rolePermissions: [],
      enabledModules: ALL_MODULES,
      dataScope: 'all',
    });

    expect(ability.canAccessBranch('anything')).toBe(true);
  });
});

describe('narrowestScope', () => {
  it('returns the most restrictive scope in the set', () => {
    expect(narrowestScope(['all', 'branch', 'self'])).toBe('self');
    expect(narrowestScope(['all', 'branch'])).toBe('branch');
    expect(narrowestScope([])).toBe('self');
  });
});

describe('release RBAC matrix', () => {
  const cases: Array<[role: string, permission: string, allowed: boolean]> = [
    ['company_owner', 'settings.manage', true],
    ['company_owner', 'platform.organizations.view', false],
    ['company_admin', 'users.manage', true],
    ['company_admin', 'payments.reverse', false],
    ['sales_manager', 'quotations.approve', true],
    ['sales_manager', 'employees.view_sensitive', false],
    ['sales_representative', 'quotations.create', true],
    ['sales_representative', 'quotations.approve', false],
    ['sales_representative', 'employees.view', false],
    ['project_manager', 'projects.update', true],
    ['project_manager', 'users.manage', false],
    ['hr_manager', 'employees.update', true],
    ['hr_manager', 'payments.verify', false],
    ['inventory_manager', 'inventory.adjust', true],
    ['inventory_manager', 'employees.view_sensitive', false],
    ['production_manager', 'production.execute', true],
    ['production_manager', 'roles.manage', false],
    ['finance_manager', 'payments.verify', true],
    ['finance_manager', 'inventory.adjust', false],
    ['security_guard', 'attendance.check_in', true],
    ['security_guard', 'invoices.view', false],
    ['employee', 'tasks.view', true],
    ['employee', 'payroll.view', false],
    ['readonly_user', 'customers.view', true],
    ['readonly_user', 'customers.create', false],
  ];

  it.each(cases)('%s × %s is %s', (roleKey, permission, allowed) => {
    const role = getSystemRole(roleKey);
    expect(role, roleKey).toBeDefined();
    expect(role!.permissions.includes(permission), `${roleKey} × ${permission}`).toBe(allowed);
  });
});
