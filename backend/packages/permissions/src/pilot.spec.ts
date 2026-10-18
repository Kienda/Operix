import { describe, expect, it } from 'vitest';
import { assertPilotCatalog, getPilotRole, PILOT_MODULES, PILOT_ROLES } from './pilot';
import { buildAbility } from './ability';

const subset = (a: string[], b: string[]) => a.every((p) => b.includes(p));

describe('GHT pilot role catalog', () => {
  it('only grants known permissions inside the pilot modules', () => {
    expect(() => assertPilotCatalog()).not.toThrow();
  });

  it('has unique keys and names', () => {
    expect(new Set(PILOT_ROLES.map((r) => r.key)).size).toBe(PILOT_ROLES.length);
    expect(new Set(PILOT_ROLES.map((r) => r.name)).size).toBe(PILOT_ROLES.length);
  });

  it('lets the owner delegate every role and the administrator every role but owner', () => {
    const owner = getPilotRole('ght_owner')!;
    const admin = getPilotRole('ght_admin')!;
    for (const role of PILOT_ROLES) expect(subset(role.permissions, owner.permissions)).toBe(true);
    for (const role of PILOT_ROLES.filter((r) => r.key !== 'ght_owner'))
      expect(subset(role.permissions, admin.permissions)).toBe(true);
    expect(subset(owner.permissions, admin.permissions)).toBe(false);
  });

  it('never grants posting, payroll, HR or platform capabilities', () => {
    const all = PILOT_ROLES.flatMap((r) => r.permissions);
    expect(all.some((p) => /^(invoices|payments|inventory|payroll|employees|platform)\./.test(p))).toBe(
      false,
    );
  });

  it('keeps the employee to its own tasks', () => {
    const employee = getPilotRole('ght_employee')!;
    expect(employee.dataScope).toBe('self');
    expect([...employee.permissions].sort()).toEqual(['organization.view', 'tasks.update', 'tasks.view']);
  });

  it('removes a granted capability once its module is disabled', () => {
    const ability = buildAbility({
      rolePermissions: getPilotRole('ght_owner')!.permissions,
      enabledModules: PILOT_MODULES.filter((m) => m !== 'sales'),
      dataScope: 'all',
    });
    expect(ability.can('customers.view')).toBe(true);
    expect(ability.can('quotations.view')).toBe(false);
  });
});
