import { MODULE, type ModuleKey } from './modules';
import { isKnownPermission, moduleOfPermission } from './permissions';
import type { SystemRoleDefinition } from './roles';

/**
 * GHT production pilot catalog.
 *
 * Only these modules are enabled for the pilot organization. Every other
 * capability is removed server-side by module enablement, so a role granting
 * e.g. `invoices.create` cannot reach finance posting during the pilot.
 */
export const PILOT_MODULES: readonly ModuleKey[] = [
  MODULE.CORE,
  MODULE.CRM,
  MODULE.SALES,
  MODULE.PROJECTS,
];

const ADMIN_CORE = [
  'organization.view',
  'users.view',
  'users.manage',
  'roles.view',
  'audit.view',
];
const CUSTOMERS_FULL = [
  'customers.view',
  'customers.create',
  'customers.update',
  'customers.archive',
  'customers.view_financials',
];
const QUOTATIONS_FULL = [
  'quotations.view',
  'quotations.create',
  'quotations.send',
  'quotations.approve',
  'quotations.cancel',
];
const PROJECTS_FULL = [
  'projects.view',
  'projects.view_all',
  'projects.create',
  'projects.update',
  'projects.change_status',
  'projects.manage_members',
  'projects.view_budget',
  'projects.archive',
];
const TASKS_FULL = ['tasks.view', 'tasks.create', 'tasks.update', 'tasks.assign', 'tasks.delete'];

export type PilotRoleDefinition = Pick<
  SystemRoleDefinition,
  'key' | 'name' | 'description' | 'dataScope' | 'permissions'
>;

/**
 * Explicit, reviewable permission lists. Data scope is a ceiling that the
 * membership's branch list narrows further (see docs/pilot/ACCESS_MATRIX.md).
 */
export const PILOT_ROLES: readonly PilotRoleDefinition[] = [
  {
    key: 'ght_owner',
    name: 'Owner',
    description: 'GHT leadership. Full pilot access across every authorized branch.',
    dataScope: 'all',
    permissions: [
      ...ADMIN_CORE,
      'organization.update',
      'settings.manage',
      ...CUSTOMERS_FULL,
      ...QUOTATIONS_FULL,
      ...PROJECTS_FULL,
      ...TASKS_FULL,
    ],
  },
  {
    key: 'ght_admin',
    name: 'Administrator',
    description: 'Manages staff access and all pilot records. Cannot change organization settings.',
    dataScope: 'all',
    permissions: [
      ...ADMIN_CORE,
      ...CUSTOMERS_FULL,
      ...QUOTATIONS_FULL,
      ...PROJECTS_FULL,
      ...TASKS_FULL,
    ],
  },
  {
    key: 'ght_finance',
    name: 'Finance',
    description:
      'Read-only commercial visibility (customers, quotations, project budgets). Financial posting is disabled for the pilot.',
    dataScope: 'all',
    permissions: [
      'organization.view',
      'customers.view',
      'customers.view_financials',
      'quotations.view',
      'projects.view',
      'projects.view_all',
      'projects.view_budget',
    ],
  },
  {
    key: 'ght_project_manager',
    name: 'Project Manager',
    description: 'Plans and runs every project and task in their branch.',
    dataScope: 'branch',
    permissions: [
      'organization.view',
      'customers.view',
      'quotations.view',
      ...PROJECTS_FULL.filter((p) => p !== 'projects.archive'),
      ...TASKS_FULL,
    ],
  },
  {
    key: 'ght_sales_manager',
    name: 'Sales Manager',
    description: 'Owns customers and quotations in their branch, including recording customer decisions.',
    dataScope: 'branch',
    permissions: ['organization.view', ...CUSTOMERS_FULL, ...QUOTATIONS_FULL, 'projects.view'],
  },
  {
    key: 'ght_sales',
    name: 'Sales Representative',
    description: 'Manages the customers and quotations they own or are assigned to.',
    dataScope: 'assigned',
    permissions: [
      'organization.view',
      'customers.view',
      'customers.create',
      'customers.update',
      'quotations.view',
      'quotations.create',
      'quotations.send',
    ],
  },
  {
    key: 'ght_production',
    name: 'Production',
    description: 'Sees branch projects and plans/executes production tasks. No pricing or customer financials.',
    dataScope: 'branch',
    permissions: [
      'organization.view',
      'customers.view',
      'projects.view',
      'projects.view_all',
      'tasks.view',
      'tasks.create',
      'tasks.update',
      'tasks.assign',
    ],
  },
  {
    key: 'ght_employee',
    name: 'Employee',
    description: 'Sees and updates only the tasks assigned to them.',
    dataScope: 'self',
    permissions: ['organization.view', 'tasks.view', 'tasks.update'],
  },
];

export function getPilotRole(key: string): PilotRoleDefinition | undefined {
  return PILOT_ROLES.find((role) => role.key === key);
}

/** Catalog self-check used by tests and the bootstrap command. */
export function assertPilotCatalog(): void {
  for (const role of PILOT_ROLES) {
    for (const permission of role.permissions) {
      if (!isKnownPermission(permission))
        throw new Error(`Unknown permission ${permission} in pilot role ${role.key}`);
      const module = moduleOfPermission(permission);
      if (!module || !PILOT_MODULES.includes(module))
        throw new Error(`Pilot role ${role.key} grants ${permission} outside pilot modules`);
    }
    if (new Set(role.permissions).size !== role.permissions.length)
      throw new Error(`Duplicate permission in pilot role ${role.key}`);
  }
}
